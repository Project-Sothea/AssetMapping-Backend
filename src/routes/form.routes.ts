import { Router, Request, Response, NextFunction } from 'express';
import { validationService } from '../services/validation.service';
import { validateRequest } from '../middleware/validation';
import { FormDataSchema, FormData } from '../types';
import supabase from '../config/supabase';
import { logger } from '../utils/logger';
import { syncService } from '../services/sync.service';
import { z } from 'zod';

const router = Router();

/**
 * GET /api/forms
 * Fetch all forms
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('Fetching all forms');

    const { data, error } = await supabase
      .from('forms')
      .select('*')
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
 * POST /api/forms/validate
 * Validate form data without saving
 */
router.post(
  '/validate',
  validateRequest(FormDataSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedForm = validationService.validateForm(req.body);
      const sanitizedForm = validationService.sanitizeFormData(validatedForm);

      res.json({
        success: true,
        data: sanitizedForm,
        message: 'Form data is valid',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/forms
 * Create or update a form with versioning support
 */
const FormUpsertSchema = FormDataSchema.extend({
  baseVersion: z.number().optional(),
  userId: z.string().min(1),
});

router.post(
  '/',
  validateRequest(FormUpsertSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { baseVersion, userId, ...formData } = req.body;

      logger.info('Form upsert request', {
        formId: formData.id,
        baseVersion,
        userId,
      });

      const result = await syncService.upsertFormWithVersion(
        formData as FormData,
        userId,
        baseVersion
      );

      // Return 409 Conflict if there's a version mismatch
      if (result.conflict) {
        logger.warn('Form version conflict', {
          formId: formData.id,
          baseVersion,
          currentVersion: result.version,
        });

        return res.status(409).json({
          success: false,
          conflict: true,
          message: 'Version conflict detected',
          currentVersion: result.version,
          currentState: result.form,
        });
      }

      res.json({
        success: true,
        data: result.form,
        version: result.version,
        message: formData.id ? 'Form updated successfully' : 'Form created successfully',
      });
    } catch (error) {
      next(error);
    }
    return;
  }
);

/**
 * GET /api/forms/:id
 * Get a single form by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    logger.info('Fetching form', { formId: id });

    const { data, error } = await supabase.from('forms').select('*').eq('id', id).single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Form not found',
        });
      }
      throw error;
    }

    res.json({
      success: true,
      data,
      message: 'Form fetched successfully',
    });
  } catch (error) {
    next(error);
  }
  return;
});

/**
 * DELETE /api/forms/:id
 * Delete a form
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

    logger.info('Deleting form', { formId: id, userId });

    const { error } = await supabase.from('forms').delete().eq('id', id);

    if (error) {
      logger.error('Error deleting form', { error, formId: id });
      throw error;
    }

    // TODO: Emit FormDeleted event to outbox

    res.json({
      success: true,
      message: 'Form deleted successfully',
    });
  } catch (error) {
    next(error);
  }
  return;
});

export default router;
