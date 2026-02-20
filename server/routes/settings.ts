import { Router, Response } from 'express';
import { getProvider } from '../database';
import { logger } from '../logger';
import { flexAuthMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(flexAuthMiddleware);

// Get user settings
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const provider = getProvider();
    const userId = req.userId as number;

    const settings = await provider.getUserSettings(userId);
    if (!settings) {
      // Return defaults if no settings exist
      return res.json({ timezone: 'UTC' });
    }

    res.json({
      timezone: settings.timezone
    });
  } catch (error) {
    logger.error('Error fetching settings', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update user settings
router.put('/', async (req: AuthRequest, res: Response) => {
  try {
    const provider = getProvider();
    const userId = req.userId as number;
    const { timezone } = req.body;

    // Validate timezone if provided
    if (timezone !== undefined) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
      } catch {
        return res.status(400).json({ error: 'Invalid timezone' });
      }
    }

    // Upsert settings
    await provider.upsertUserSettings(userId, timezone || 'UTC');
    logger.info('User settings updated', { userId, timezone });

    res.json({ timezone: timezone || 'UTC' });
  } catch (error) {
    logger.error('Error updating settings', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Reset all user data
router.post('/reset', async (req: AuthRequest, res: Response) => {
  try {
    const provider = getProvider();
    const userId = req.userId as number;

    await provider.deleteTimeEntriesForUser(userId);
    await provider.deleteCategoriesForUser(userId);
    await provider.createDefaultCategories(userId);

    logger.info('User data reset', { userId });
    res.json({ message: 'Data reset successfully' });
  } catch (error) {
    logger.error('Error resetting data', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to reset data' });
  }
});

export default router;
