import { Router, Request, Response, NextFunction } from 'express';
import supabase from '../config/supabase';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/pins
 * Fetch all pins from the database
 * Used by frontend to pull updates and sync local database
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('Fetching all pins');

    const { data, error } = await supabase
      .from('pins')
      .select('*')
      .is('deletedAt', null) // Only return non-deleted pins
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
 * GET /api/pins/since/:timestamp
 * Fetch all pins updated after a specific timestamp
 * Used by frontend for incremental sync after reconnection
 */
router.get('/since/:timestamp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timestamp } = req.params;
    logger.info('Fetching pins since timestamp', { timestamp });

    // Convert Unix timestamp to ISO string
    const date = new Date(parseInt(timestamp, 10));
    if (isNaN(date.getTime())) {
      res.status(400).json({
        success: false,
        error: 'Invalid timestamp',
      });
      return;
    }

    const { data, error } = await supabase
      .from('pins')
      .select('*')
      .is('deletedAt', null)
      .gte('updatedAt', date.toISOString())
      .order('updatedAt', { ascending: true });

    if (error) {
      logger.error('Error fetching pins since timestamp', { error, timestamp });
      throw error;
    }

    logger.info('Successfully fetched pins since timestamp', {
      timestamp,
      count: data?.length || 0,
    });

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
 * GET /api/pins/:id
 * Fetch a single pin by ID
 * Used by frontend for real-time sync of specific pin updates
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    logger.info('Fetching single pin', { pinId: id });

    const { data, error } = await supabase
      .from('pins')
      .select('*')
      .eq('id', id)
      .is('deletedAt', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        logger.warn('Pin not found', { pinId: id });
        res.status(404).json({
          success: false,
          error: 'Pin not found',
        });
        return;
      }
      logger.error('Error fetching pin', { error, pinId: id });
      throw error;
    }

    logger.info('Successfully fetched pin', { pinId: id });

    res.json({
      success: true,
      data,
      message: 'Pin fetched successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
