import { Request, Response } from 'express';

import { AppError } from '../types';
import { logger } from '../utils/logger';

export const errorHandler = (err: Error | AppError, req: Request, res: Response) => {
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  // Unknown errors
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && {
      message: err.message,
      stack: err.stack,
    }),
  });
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    message: `Route ${req.method} ${req.path} not found`,
  });
};
