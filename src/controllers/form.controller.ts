import { Request, Response, NextFunction } from 'express';
import { FormService } from '../services/form.service';
import type { ApiResponse } from '../types';
import type { Form } from '../db/schema';

type FormsSinceQuery = {
  timestamp?: string | string[];
  since?: string | string[];
};

type FormParams = { id: string } & Record<string, string>;

const parseTimestampQuery = (value?: string | string[]): number => {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue) {
    return NaN;
  }
  const parsedFromDate = Date.parse(rawValue);
  if (!Number.isNaN(parsedFromDate)) {
    return parsedFromDate;
  }
  const parsedNumber = Number(rawValue);
  return Number.isFinite(parsedNumber) ? parsedNumber : NaN;
};

export class FormController {
  static async getAllForms(
    _req: Request,
    res: Response<ApiResponse<Form[]>>,
    next: NextFunction
  ) {
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

  static async getFormsSince(
    req: Request<Record<string, string>, ApiResponse<Form[]>, unknown, FormsSinceQuery>,
    res: Response<ApiResponse<Form[]>>,
    next: NextFunction
  ) {
    try {
      const timestamp = parseTimestampQuery(req.query.timestamp ?? req.query.since);
      const data = await FormService.getFormsSince(timestamp);
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
        res.status(500).json({
          success: false,
          error: 'Database error occurred',
        });
        return;
      }
      next(error);
    }
  }

  static async getFormById(
    req: Request<FormParams, ApiResponse<Form>>,
    res: Response<ApiResponse<Form>>,
    next: NextFunction
  ) {
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
