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

/**
 * GET /api/forms/:id
 * Fetch a single form by ID
 * Used by frontend for real-time sync of specific form updates
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    logger.info('Fetching single form', { formId: id });

    const { data, error } = await supabase
      .from('forms')
      .select('*')
      .eq('id', id)
      .is('deletedAt', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        logger.warn('Form not found', { formId: id });
        res.status(404).json({
          success: false,
          error: 'Form not found',
        });
        return;
      }
      logger.error('Error fetching form', { error, formId: id });
      throw error;
    }

    logger.info('Successfully fetched form', { formId: id });

    res.json({
      success: true,
      data,
      message: 'Form fetched successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
