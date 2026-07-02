import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../config/database.js';
import { authenticate, requireOrgAccess } from '../middleware/auth.js';
import { validate, paginate } from '../middleware/validate.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

const router = Router();

// ── Schemas ─────────────────────────────────────────────────

const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
});

// ── POST /api/orgs ──────────────────────────────────────────

router.post(
  '/',
  authenticate,
  validate(createOrgSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, slug } = req.body;

      // Check slug uniqueness
      const existing = await query('SELECT id FROM organizations WHERE slug = $1', [slug]);
      if (existing.rows.length > 0) {
        throw new ConflictError('Organization slug already taken');
      }

      // Create org
      const result = await query(
        `INSERT INTO organizations (name, slug, created_by)
         VALUES ($1, $2, $3)
         RETURNING id, name, slug, created_at`,
        [name, slug, req.user!.userId]
      );

      const org = result.rows[0];

      // Add creator as owner
      await query(
        `INSERT INTO org_members (organization_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [org.id, req.user!.userId]
      );

      res.status(201).json({ organization: org });
    } catch (error) {
      next(error);
    }
  }
);

// ── GET /api/orgs ───────────────────────────────────────────

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await query(
        `SELECT o.*, om.role as user_role,
                (SELECT count(*) FROM org_members WHERE organization_id = o.id) as member_count,
                (SELECT count(*) FROM projects WHERE organization_id = o.id) as project_count
         FROM organizations o
         JOIN org_members om ON om.organization_id = o.id AND om.user_id = $1
         ORDER BY o.created_at DESC`,
        [req.user!.userId]
      );

      res.json({ organizations: result.rows });
    } catch (error) {
      next(error);
    }
  }
);

// ── GET /api/orgs/:orgId ────────────────────────────────────

router.get(
  '/:orgId',
  authenticate,
  requireOrgAccess('orgId'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await query(
        `SELECT o.*,
                json_agg(json_build_object(
                  'userId', u.id, 'email', u.email, 'name', u.name, 'role', om.role
                )) as members
         FROM organizations o
         JOIN org_members om ON om.organization_id = o.id
         JOIN users u ON u.id = om.user_id
         WHERE o.id = $1
         GROUP BY o.id`,
        [req.params.orgId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Organization', req.params.orgId);
      }

      res.json({ organization: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// ── POST /api/orgs/:orgId/members ───────────────────────────

router.post(
  '/:orgId/members',
  authenticate,
  requireOrgAccess('orgId'),
  validate(addMemberSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, role } = req.body;

      // Find user by email
      const userResult = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (userResult.rows.length === 0) {
        throw new NotFoundError('User with email', email);
      }

      const userId = userResult.rows[0].id;

      // Check if already a member
      const existing = await query(
        'SELECT id FROM org_members WHERE organization_id = $1 AND user_id = $2',
        [req.params.orgId, userId]
      );
      if (existing.rows.length > 0) {
        throw new ConflictError('User is already a member of this organization');
      }

      await query(
        `INSERT INTO org_members (organization_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [req.params.orgId, userId, role]
      );

      res.status(201).json({ message: 'Member added successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
