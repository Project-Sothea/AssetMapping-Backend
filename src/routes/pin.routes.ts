import { Router, Request, Response, NextFunction } from 'express';
import { validationService } from '../services/validation.service';
import { validateRequest } from '../middleware/validation';
import { PinDataSchema, PinData } from '../types';
import supabase from '../config/supabase';
import { logger } from '../utils/logger';
import { syncService } from '../services/sync.service';
import { z } from 'zod';

const router = Router();

/**
 * GET /api/pins
 * Fetch all pins
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('Fetching all pins');

    const { data, error } = await supabase
      .from('pins')
      .select('*')
      .order('createdAt', { ascending: false });

    if (error) {
      logger.error('Error fetching pins', { error });
      throw error;
    }

    logger.info('Successfully fetched pins', { count: data?.length || 0 });

    res.json({
      success: true,
      data: data || [],
      message: 'Pins fetched successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pins/validate
 * Validate pin data without saving
 */
router.post(
  '/validate',
  validateRequest(PinDataSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedPin = validationService.validatePin(req.body);

      res.json({
        success: true,
        data: validatedPin,
        message: 'Pin data is valid',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/pins
 * Create or update a pin with versioning support
 */
const PinUpsertSchema = PinDataSchema.extend({
  baseVersion: z.number().optional(),
  userId: z.string().min(1),
});

router.post(
  '/',
  validateRequest(PinUpsertSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { baseVersion, userId, ...pinData } = req.body;

      logger.info('Pin upsert request', {
        pinId: pinData.id,
        baseVersion,
        userId,
      });

      const result = await syncService.upsertPinWithVersion(
        pinData as PinData,
        userId,
        baseVersion
      );

      // Return 409 Conflict if there's a version mismatch
      if (result.conflict) {
        logger.warn('Pin version conflict', {
          pinId: pinData.id,
          baseVersion,
          currentVersion: result.version,
        });

        return res.status(409).json({
          success: false,
          conflict: true,
          message: 'Version conflict detected',
          currentVersion: result.version,
          currentState: result.pin,
        });
      }

      res.json({
        success: true,
        data: result.pin,
        version: result.version,
        message: pinData.id ? 'Pin updated successfully' : 'Pin created successfully',
      });
    } catch (error) {
      next(error);
    }
    return;
  }
);

/**
 * GET /api/pins/:id
 * Get a single pin by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    logger.info('Fetching pin', { pinId: id });

    const { data, error } = await supabase.from('pins').select('*').eq('id', id).single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Pin not found',
        });
      }
      throw error;
    }

    res.json({
      success: true,
      data,
      message: 'Pin fetched successfully',
    });
  } catch (error) {
    next(error);
  }
  return;
});

/**
 * DELETE /api/pins/:id
 * Delete a pin
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.body.userId || req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    logger.info('Deleting pin', { pinId: id, userId });

    const { error } = await supabase.from('pins').delete().eq('id', id);

    if (error) {
      logger.error('Error deleting pin', { error, pinId: id });
      throw error;
    }

    // TODO: Emit PinDeleted event to outbox

    res.json({
      success: true,
      message: 'Pin deleted successfully',
    });
  } catch (error) {
    next(error);
  }
  return;
});

export default router;
