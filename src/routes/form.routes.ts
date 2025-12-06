import { Router } from 'express';

import { FormController } from '../controllers/form.controller';

const router = Router();

/**
 * GET /api/forms
 * Fetch all forms from the database
 */
router.get('/', FormController.getAllForms);

/**
 * GET /api/forms/since?timestamp=<ms or ISO string>
 * Fetch all forms updated after a specific timestamp (timestamp query param also accepts "since" for backwards compatibility)
 */
router.get('/since', FormController.getFormsSince);

/**
 * GET /api/forms/:id
 * Fetch a single form by ID
 */
router.get('/:id', FormController.getFormById);

export default router;
