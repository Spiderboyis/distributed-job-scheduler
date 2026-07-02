import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Assigns a unique request ID for tracing.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) || uuidv4();
  res.setHeader('X-Request-Id', id);
  (req as any).requestId = id;
  next();
}

/**
 * Global error handler. Converts errors to structured JSON responses.
 *
 * Response format:
 * {
 *   "error": {
 *     "code": "VALIDATION_ERROR",
 *     "message": "Invalid email format",
 *     "details": { ... },
 *     "requestId": "uuid"
 *   }
 * }
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req as any).requestId || 'unknown';

  // Log the error
  if (err instanceof AppError && err.isOperational) {
    console.error(`[Error] ${err.statusCode} ${err.code}: ${err.message} (${requestId})`);
  } else {
    console.error(`[Error] Unhandled error (${requestId}):`, err);
  }

  if (err instanceof AppError) {
    const response: any = {
      error: {
        code: err.code,
        message: err.message,
        requestId,
      },
    };

    // Include validation details if present
    if ((err as any).details) {
      response.error.details = (err as any).details;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle known library errors
  if (err.name === 'SyntaxError' && 'body' in err) {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON',
        requestId,
      },
    });
    return;
  }

  // Unknown errors — hide details in production
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
      requestId,
    },
  });
}

/**
 * 404 handler for undefined routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}
