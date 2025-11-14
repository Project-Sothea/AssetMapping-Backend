// filepath: /Users/luciusyeojunjie/Desktop/repos/ProjectSothea/AssetMapping-Backend/src/routes/form.routes.ts
import { Router } from 'express';
import { FormController } from '../controllers/form.controller';

const router = Router();

/**
 * GET /api/forms
 * Fetch all forms from the database
 */
router.get('/', FormController.getAllForms);

/**
 * GET /api/forms/since/:timestamp
 * Fetch all forms updated after a specific timestamp
 */
router.get('/since/:timestamp', FormController.getFormsSince);

/**
 * GET /api/forms/:id
 * Fetch a single form by ID
 */
router.get('/:id', FormController.getFormById);

export default router;
