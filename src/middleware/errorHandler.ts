import { Request, Response, NextFunction } from 'express';

import { AppError } from '../types';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  void _next; // Express recognises error middleware by its four-argument arity.
  logger.error('Request failed', { name: err.name, path: req.path, method: req.method });

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  const status = (err as Error & { status?: number }).status;
  return res.status(status && status >= 400 && status < 500 ? status : 500).json({
    success: false,
    error:
      status && status >= 400 && status < 500 ? 'Invalid request body' : 'Internal server error',
  });
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    message: `Route ${req.method} ${req.path} not found`,
  });
};
