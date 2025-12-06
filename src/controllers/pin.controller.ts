import { Request, Response, NextFunction } from 'express';
import { PinService } from '../services/pin.service';
import type { ApiResponse, Pin } from '@assetmapping/shared-types';

type PinsSinceQuery = {
  timestamp?: string | string[];
  since?: string | string[];
};

type PinParams = { id: string } & Record<string, string>;

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

export class PinController {
  static async getAllPins(
    _req: Request,
    res: Response<ApiResponse<Pin[]>>,
    next: NextFunction
  ) {
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

  static async getPinsSince(
    req: Request<Record<string, string>, ApiResponse<Pin[]>, unknown, PinsSinceQuery>,
    res: Response<ApiResponse<Pin[]>>,
    next: NextFunction
  ) {
    try {
      const timestamp = parseTimestampQuery(req.query.timestamp ?? req.query.since);
      const data = await PinService.getPinsSince(timestamp);
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

  static async getPinById(
    req: Request<PinParams, ApiResponse<Pin>>,
    res: Response<ApiResponse<Pin>>,
    next: NextFunction
  ) {
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
