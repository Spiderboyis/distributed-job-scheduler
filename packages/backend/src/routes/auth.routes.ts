import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../config/database.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { ConflictError, UnauthorizedError, NotFoundError } from '../utils/errors.js';

const router = Router();

// ── Validation Schemas ──────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Name is required').max(100),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ── POST /api/auth/register ─────────────────────────────────

router.post(
  '/register',
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, name } = req.body;

      // Check if user exists
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        throw new ConflictError('Email already registered');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const result = await query(
        `INSERT INTO users (email, password_hash, name)
         VALUES ($1, $2, $3)
         RETURNING id, email, name, created_at`,
        [email, passwordHash, name]
      );

      const user = result.rows[0];

      // Generate tokens
      const accessToken = generateAccessToken({ userId: user.id, email: user.email });
      const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.created_at,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── POST /api/auth/login ────────────────────────────────────

router.post(
  '/login',
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      // Find user
      const result = await query(
        'SELECT id, email, name, password_hash FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const user = result.rows[0];

      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        throw new UnauthorizedError('Invalid email or password');
      }

      // Generate tokens
      const accessToken = generateAccessToken({ userId: user.id, email: user.email });
      const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── POST /api/auth/refresh ──────────────────────────────────

router.post(
  '/refresh',
  validate(refreshSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;

      const payload = verifyRefreshToken(refreshToken);

      // Verify user still exists
      const result = await query('SELECT id, email FROM users WHERE id = $1', [payload.userId]);
      if (result.rows.length === 0) {
        throw new UnauthorizedError('User no longer exists');
      }

      const user = result.rows[0];
      const newAccessToken = generateAccessToken({ userId: user.id, email: user.email });
      const newRefreshToken = generateRefreshToken({ userId: user.id, email: user.email });

      res.json({
        tokens: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── GET /api/auth/me ────────────────────────────────────────

router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await query(
        `SELECT u.id, u.email, u.name, u.created_at,
                json_agg(json_build_object(
                  'orgId', o.id, 'orgName', o.name, 'orgSlug', o.slug, 'role', om.role
                )) FILTER (WHERE o.id IS NOT NULL) as organizations
         FROM users u
         LEFT JOIN org_members om ON om.user_id = u.id
         LEFT JOIN organizations o ON o.id = om.organization_id
         WHERE u.id = $1
         GROUP BY u.id`,
        [req.user!.userId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('User');
      }

      const user = result.rows[0];
      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.created_at,
          organizations: user.organizations || [],
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
