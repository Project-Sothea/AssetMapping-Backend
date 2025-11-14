// filepath: /Users/luciusyeojunjie/Desktop/repos/ProjectSothea/AssetMapping-Backend/src/controllers/form.controller.ts
import { Request, Response, NextFunction } from 'express';
import { FormService } from '../services/form.service';
import { logger } from '../utils/logger';

export class FormController {
  static async getAllForms(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await FormService.getAllForms();
      res.json({
        success: true,
        data,
        message: 'Forms fetched successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getFormsSince(req: Request, res: Response, next: NextFunction) {
    try {
      const { timestamp } = req.params;
      const data = await FormService.getFormsSince(parseInt(timestamp, 10));
      res.json({
        success: true,
        data,
        message: 'Forms fetched successfully',
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
        logger.error('Supabase error in getFormsSince', { error });
        res.status(500).json({
          success: false,
          error: 'Database error occurred',
        });
        return;
      }
      next(error);
    }
  }

  static async getFormById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = await FormService.getFormById(id);
      res.json({
        success: true,
        data,
        message: 'Form fetched successfully',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Form not found') {
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
