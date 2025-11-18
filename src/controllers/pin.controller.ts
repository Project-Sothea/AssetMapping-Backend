import { Request, Response, NextFunction } from 'express';
import { PinService } from '../services/pin.service';
import { logger } from '../utils/logger';

export class PinController {
  static async getAllPins(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await PinService.getAllPins();
      res.json({
        success: true,
        data,
        message: 'Pins fetched successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPinsSince(req: Request, res: Response, next: NextFunction) {
    try {
      const { timestamp } = req.params;
      const data = await PinService.getPinsSince(parseInt(timestamp, 10));
      res.json({
        success: true,
        data,
        message: 'Pins fetched successfully',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid timestamp') {
        res.status(400).json({
          success: false,
          error: error.message,
        });
        return;
      }
      if (error && typeof error === 'object' && 'message' in error) {
        res.status(500).json({
          success: false,
          error: 'Database error occurred',
        });
        return;
      }
      next(error);
    }
  }

  static async getPinById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = await PinService.getPinById(id);
      res.json({
        success: true,
        data,
        message: 'Pin fetched successfully',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Pin not found') {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }
      next(error);
    }
  }
}
