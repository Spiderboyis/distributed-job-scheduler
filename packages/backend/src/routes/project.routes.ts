import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

const router = Router();

// ── Schemas ─────────────────────────────────────────────────

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  organizationId: z.string().uuid(),
});

// ── POST /api/projects ──────────────────────────────────────

router.post(
  '/',
  authenticate,
  validate(createProjectSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, slug, organizationId } = req.body;

      // Verify user is member of org
      const memberCheck = await query(
        'SELECT role FROM org_members WHERE organization_id = $1 AND user_id = $2',
        [organizationId, req.user!.userId]
      );
      if (memberCheck.rows.length === 0) {
        throw new NotFoundError('Organization', organizationId);
      }

      // Generate API key
      const apiKey = `jsk_${crypto.randomBytes(24).toString('hex')}`;

      const result = await query(
        `INSERT INTO projects (organization_id, name, slug, api_key)
         VALUES ($1, $2, $3, $4)
         RETURNING id, organization_id, name, slug, api_key, created_at`,
        [organizationId, name, slug, apiKey]
      );

      res.status(201).json({ project: result.rows[0] });
    } catch (error: any) {
      if (error.code === '23505') {
        next(new ConflictError('Project slug already exists in this organization'));
      } else {
        next(error);
      }
    }
  }
);

// ── GET /api/projects ───────────────────────────────────────

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.query.organizationId as string;

      let sql = `
        SELECT p.*,
               o.name as organization_name,
               (SELECT count(*) FROM queues WHERE project_id = p.id) as queue_count
        FROM projects p
        JOIN organizations o ON o.id = p.organization_id
        JOIN org_members om ON om.organization_id = o.id AND om.user_id = $1
      `;
      const params: any[] = [req.user!.userId];

      if (orgId) {
        sql += ' WHERE p.organization_id = $2';
        params.push(orgId);
      }

      sql += ' ORDER BY p.created_at DESC';

      const result = await query(sql, params);
      res.json({ projects: result.rows });
    } catch (error) {
      next(error);
    }
  }
);

// ── GET /api/projects/:projectId ────────────────────────────

router.get(
  '/:projectId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await query(
        `SELECT p.*, o.name as organization_name
         FROM projects p
         JOIN organizations o ON o.id = p.organization_id
         JOIN org_members om ON om.organization_id = o.id AND om.user_id = $2
         WHERE p.id = $1`,
        [req.params.projectId, req.user!.userId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Project', req.params.projectId);
      }

      res.json({ project: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// ── POST /api/projects/:projectId/regenerate-key ────────────

router.post(
  '/:projectId/regenerate-key',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const newApiKey = `jsk_${crypto.randomBytes(24).toString('hex')}`;

      const result = await query(
        `UPDATE projects SET api_key = $1
         WHERE id = $2
         AND organization_id IN (
           SELECT organization_id FROM org_members WHERE user_id = $3
         )
         RETURNING id, api_key`,
        [newApiKey, req.params.projectId, req.user!.userId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Project', req.params.projectId);
      }

      res.json({ apiKey: result.rows[0].api_key });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
