import { Router } from 'express';
import { PinController } from '../controllers/pin.controller';

const router = Router();

/**
 * GET /api/pins
 * Fetch all pins from the database
 */
router.get('/', PinController.getAllPins);

/**
 * GET /api/pins/since?timestamp=<ms or ISO string>
 * Fetch all pins updated after a specific timestamp (timestamp query param also accepts "since" for backwards compatibility)
 */
router.get('/since', PinController.getPinsSince);

/**
 * GET /api/pins/:id
 * Fetch a single pin by ID
 */
router.get('/:id', PinController.getPinById);

export default router;
