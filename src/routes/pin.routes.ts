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

export default router;
