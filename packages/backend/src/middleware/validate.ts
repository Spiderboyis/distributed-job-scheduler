import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../utils/errors.js';

/**
 * Zod validation middleware factory.
 *
 * Validates request body, query params, or route params against a Zod schema.
 * Returns 400 with structured error details on validation failure.
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const data = schema.parse(req[source]);
      // Replace the raw data with parsed (coerced) data
      (req as any)[source] = data;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));
        next(new ValidationError('Validation failed', details));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Pagination middleware — extracts and validates pagination params.
 */
export function paginate(req: Request, _res: Response, next: NextFunction): void {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  (req as any).pagination = { page, limit, offset };
  next();
}
