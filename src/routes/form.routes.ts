import { Router, Request, Response, NextFunction } from 'express';
import supabase from '../config/supabase';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/forms
 * Fetch all forms from the database
 * Used by frontend to pull updates and sync local database
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('Fetching all forms');

    const { data, error } = await supabase
      .from('forms')
      .select('*')
      .is('deletedAt', null) // Only return non-deleted forms
      .order('createdAt', { ascending: false });

    if (error) {
      logger.error('Error fetching forms', { error });
      throw error;
    }

    logger.info('Successfully fetched forms', { count: data?.length || 0 });

    res.json({
      success: true,
      data: data || [],
      message: 'Forms fetched successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
