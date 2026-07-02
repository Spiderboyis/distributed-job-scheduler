import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import { UnauthorizedError } from '../utils/errors.js';
import { query } from '../config/database.js';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
      };
      projectId?: string;
    }
  }
}

/**
 * JWT Authentication middleware.
 * Extracts and verifies the Bearer token from the Authorization header.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);

    req.user = {
      userId: payload.userId,
      email: payload.email,
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      next(new UnauthorizedError('Token expired'));
    } else if (error.name === 'JsonWebTokenError') {
      next(new UnauthorizedError('Invalid token'));
    } else {
      next(error);
    }
  }
}

/**
 * API Key Authentication middleware.
 * Alternative auth via X-API-Key header for programmatic access.
 */
export async function authenticateApiKey(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
      // Fall through to JWT auth
      return authenticate(req, _res, next);
    }

    const result = await query(
      `SELECT p.id as project_id, p.organization_id, o.created_by as user_id
       FROM projects p
       JOIN organizations o ON o.id = p.organization_id
       WHERE p.api_key = $1`,
      [apiKey]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Invalid API key');
    }

    req.user = { userId: result.rows[0].user_id, email: '' };
    req.projectId = result.rows[0].project_id;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Verify the user has access to the specified organization.
 */
export function requireOrgAccess(paramName = 'orgId') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();

      const orgId = req.params[paramName];
      const result = await query(
        'SELECT role FROM org_members WHERE organization_id = $1 AND user_id = $2',
        [orgId, req.user.userId]
      );

      if (result.rows.length === 0) {
        throw new UnauthorizedError('Not a member of this organization');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
