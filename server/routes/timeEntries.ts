import { Router, Response } from 'express';
import { getProvider } from '../database';
import { logger } from '../logger';
import { flexAuthMiddleware, AuthRequest } from '../middleware/auth';
import { calculateDurationMinutes } from '../utils/queryHelpers';
import {
  validateDateParam,
  validatePositiveInt,
  validateCategoryId,
  validateTaskName,
  isValidISODate
} from '../utils/validation';
import { broadcastSyncEvent } from './sync';

const router = Router();

router.use(flexAuthMiddleware);

// Get all time entries for user with pagination
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const provider = getProvider();
    
    // Optional category filter
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : null;
    
    // Optional search query (searches task_name and category_name)
    const searchQuery = (req.query.search as string || '').trim().toLowerCase();
    
    // When filtering by category or search, use a higher default limit to return all matching entries
    const hasFilters = categoryId || searchQuery;
    const defaultLimit = hasFilters ? 1000 : 100;
    
    // Validate query parameters
    const limit = Math.min(validatePositiveInt(req.query.limit, 'limit', defaultLimit), 5000);
    const offset = validatePositiveInt(req.query.offset, 'offset', 0);
    
    let startDate: string | null;
    let endDate: string | null;
    try {
      startDate = validateDateParam(req.query.startDate, 'startDate');
      endDate = validateDateParam(req.query.endDate, 'endDate');
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
    
    const entries = await provider.listTimeEntries({
      userId: req.userId as number,
      limit,
      offset,
      startDate: startDate || null,
      endDate: endDate || null,
      categoryId: categoryId || null,
      searchQuery
    });
    res.json(entries);
  } catch (error) {
    logger.error('Error fetching time entries', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

// Get active entry
router.get('/active', async (req: AuthRequest, res: Response) => {
  try {
    const provider = getProvider();
    const entry = await provider.getActiveTimeEntry(req.userId as number);
    res.json(entry || null);
  } catch (error) {
    logger.error('Error fetching active entry', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to fetch active entry' });
  }
});

// Start new entry
router.post('/start', async (req: AuthRequest, res: Response) => {
  try {
    let categoryId: number;
    let taskName: string | null;
    
    try {
      categoryId = validateCategoryId(req.body.category_id);
      taskName = validateTaskName(req.body.task_name);
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const provider = getProvider();

    const category = await provider.findCategoryById(req.userId as number, categoryId);
    if (!category) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const active = await provider.findActiveTimeEntry(req.userId as number);
    if (active) {
      const endTime = new Date().toISOString();
      const duration = calculateDurationMinutes(active.start_time, endTime);
      await provider.updateTimeEntry(req.userId as number, active.id, {
        end_time: endTime,
        duration_minutes: duration
      });
    }

    const startTime = new Date().toISOString();
    const created = await provider.createTimeEntry({
      user_id: req.userId as number,
      category_id: categoryId,
      task_name: taskName,
      start_time: startTime,
      end_time: null,
      scheduled_end_time: null,
      duration_minutes: null
    });
    broadcastSyncEvent(req.userId as number, 'time-entries');
    const entry = await provider.getActiveTimeEntry(req.userId as number);
    logger.info('Time entry started', { entryId: entry.id, userId: req.userId as number });
    res.status(201).json(entry || created);
  } catch (error) {
    logger.error('Error starting time entry', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to start time entry' });
  }
});

// Stop entry
router.post('/:id/stop', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const provider = getProvider();

    const existing = await provider.findTimeEntryById(req.userId as number, Number(id));
    if (!existing || existing.end_time) {
      return res.status(404).json({ error: 'Active entry not found' });
    }

    const startTime = existing.start_time;
    const endTime = new Date().toISOString();
    const duration = calculateDurationMinutes(startTime, endTime);

    await provider.updateTimeEntry(req.userId as number, Number(id), {
      end_time: endTime,
      duration_minutes: duration,
      scheduled_end_time: null
    });
    broadcastSyncEvent(req.userId as number, 'time-entries');
    const entry = await provider.findTimeEntryWithCategoryById(req.userId as number, Number(id));
    logger.info('Time entry stopped', { entryId: id, duration, userId: req.userId as number });
    res.json(entry);
  } catch (error) {
    logger.error('Error stopping time entry', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to stop time entry' });
  }
});

// Schedule auto-stop for active entry
router.post('/:id/schedule-stop', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { scheduled_end_time } = req.body;
    const provider = getProvider();
    const existing = await provider.findTimeEntryById(req.userId as number, Number(id));
    if (!existing || existing.end_time) {
      return res.status(404).json({ error: 'Active entry not found' });
    }

    // Validate scheduled_end_time
    if (!scheduled_end_time || !isValidISODate(scheduled_end_time)) {
      return res.status(400).json({ error: 'scheduled_end_time must be a valid ISO 8601 date' });
    }

    const scheduledTime = new Date(scheduled_end_time);
    if (scheduledTime <= new Date()) {
      return res.status(400).json({ error: 'scheduled_end_time must be in the future' });
    }

    await provider.updateTimeEntry(req.userId as number, Number(id), { scheduled_end_time });
    broadcastSyncEvent(req.userId as number, 'time-entries');
    const entry = await provider.findTimeEntryWithCategoryById(req.userId as number, Number(id));
    logger.info('Scheduled stop time set', { entryId: id, scheduledEndTime: scheduled_end_time, userId: req.userId as number });
    res.json(entry);
  } catch (error) {
    logger.error('Error scheduling stop time', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to schedule stop time' });
  }
});

// Clear scheduled stop for active entry
router.delete('/:id/schedule-stop', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const provider = getProvider();
    const existing = await provider.findTimeEntryById(req.userId as number, Number(id));
    if (!existing || existing.end_time) {
      return res.status(404).json({ error: 'Active entry not found' });
    }

    await provider.updateTimeEntry(req.userId as number, Number(id), { scheduled_end_time: null });
    broadcastSyncEvent(req.userId as number, 'time-entries');
    const entry = await provider.findTimeEntryWithCategoryById(req.userId as number, Number(id));
    logger.info('Scheduled stop time cleared', { entryId: id, userId: req.userId as number });
    res.json(entry);
  } catch (error) {
    logger.error('Error clearing scheduled stop time', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to clear scheduled stop time' });
  }
});

// Update entry
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { category_id, task_name, start_time, end_time } = req.body;
    const provider = getProvider();
    const existing = await provider.findTimeEntryById(req.userId as number, Number(id));
    if (!existing) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    if (category_id) {
      const category = await provider.findCategoryById(req.userId as number, Number(category_id));
      if (!category) {
        return res.status(400).json({ error: 'Invalid category' });
      }
    }

    // Calculate new duration if times are being updated
    const currentStart = existing.start_time;
    const currentEnd = existing.end_time;
    const newStart = start_time || currentStart;
    const newEnd = end_time !== undefined ? end_time : currentEnd;
    
    const duration = newEnd ? calculateDurationMinutes(newStart, newEnd) : null;

    await provider.updateTimeEntry(req.userId as number, Number(id), {
      category_id: category_id || null,
      task_name,
      start_time: start_time || null,
      end_time: newEnd,
      duration_minutes: duration
    });
    broadcastSyncEvent(req.userId as number, 'time-entries');
    const entry = await provider.findTimeEntryWithCategoryById(req.userId as number, Number(id));
    logger.info('Time entry updated', { entryId: id, userId: req.userId as number });
    res.json(entry);
  } catch (error) {
    logger.error('Error updating time entry', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

// Create manual entry (for past tasks)
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    let categoryId: number;
    let taskName: string | null;
    let startTime: string;
    let endTime: string;
    
    try {
      categoryId = validateCategoryId(req.body.category_id);
      taskName = validateTaskName(req.body.task_name);
      
      if (!req.body.start_time || !isValidISODate(req.body.start_time)) {
        throw new Error('start_time must be a valid ISO 8601 date');
      }
      startTime = req.body.start_time;
      
      if (!req.body.end_time || !isValidISODate(req.body.end_time)) {
        throw new Error('end_time must be a valid ISO 8601 date');
      }
      endTime = req.body.end_time;
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const provider = getProvider();
    const category = await provider.findCategoryById(req.userId as number, categoryId);
    if (!category) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Calculate duration
    const duration = calculateDurationMinutes(startTime, endTime);
    
    if (duration < 0) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    const created = await provider.createTimeEntry({
      user_id: req.userId as number,
      category_id: categoryId,
      task_name: taskName,
      start_time: startTime,
      end_time: endTime,
      scheduled_end_time: null,
      duration_minutes: duration
    });
    broadcastSyncEvent(req.userId as number, 'time-entries');
    const entry = await provider.findTimeEntryWithCategoryById(req.userId as number, created.id);
    logger.info('Manual time entry created', { entryId: created.id, userId: req.userId as number });
    res.status(201).json(entry || created);
  } catch (error) {
    logger.error('Error creating manual time entry', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to create time entry' });
  }
});

// Delete entry
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const provider = getProvider();
    const existing = await provider.findTimeEntryById(req.userId as number, Number(id));
    if (!existing) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    await provider.deleteTimeEntry(req.userId as number, Number(id));
    broadcastSyncEvent(req.userId as number, 'time-entries');

    logger.info('Time entry deleted', { entryId: id, userId: req.userId as number });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting time entry', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

// Get task name suggestions based on history
router.get('/suggestions', async (req: AuthRequest, res: Response) => {
  try {
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : null;
    const query = (req.query.q as string || '').toLowerCase().trim();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const provider = getProvider();
    const suggestions = await provider.listTaskSuggestions(req.userId as number, categoryId, query, limit);
    res.json(suggestions);
  } catch (error) {
    logger.error('Error fetching task name suggestions', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Merge task names - update all entries with source task names to use target task name and optionally target category
router.post('/merge-task-names', async (req: AuthRequest, res: Response) => {
  try {
    const { sourceTaskNames, targetTaskName, targetCategoryName } = req.body;
    
    if (!Array.isArray(sourceTaskNames) || sourceTaskNames.length === 0) {
      return res.status(400).json({ error: 'sourceTaskNames must be a non-empty array' });
    }
    
    if (typeof targetTaskName !== 'string' || !targetTaskName.trim()) {
      return res.status(400).json({ error: 'targetTaskName must be a non-empty string' });
    }

    const provider = getProvider();
    const userId = req.userId as number;
    const totalEntries = await provider.countTimeEntriesByTaskNames(userId, sourceTaskNames);
    if (totalEntries === 0) {
      return res.status(404).json({ error: 'No entries found with the specified task names' });
    }

    let targetCategoryId: number | undefined;
    if (targetCategoryName) {
      const category = await provider.findCategoryByName(userId, targetCategoryName);
      if (category) {
        targetCategoryId = category.id;
      }
    }

    await provider.updateTimeEntriesForMerge(userId, sourceTaskNames, {
      task_name: targetTaskName.trim(),
      ...(targetCategoryId !== undefined ? { category_id: targetCategoryId } : {})
    });
    broadcastSyncEvent(userId, 'time-entries');

    logger.info('Task names merged', { 
      sourceTaskNames, 
      targetTaskName,
      targetCategoryName,
      entriesUpdated: totalEntries, 
      userId
    });

    res.json({ 
      merged: sourceTaskNames.length, 
      entriesUpdated: totalEntries,
      targetTaskName: targetTaskName.trim()
    });
  } catch (error) {
    logger.error('Error merging task names', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to merge task names' });
  }
});

// Update all entries with a specific task_name+category to new task_name and/or category
router.post('/update-task-name-bulk', async (req: AuthRequest, res: Response) => {
  try {
    const { oldTaskName, oldCategoryName, newTaskName, newCategoryName } = req.body;
    
    if (typeof oldTaskName !== 'string' || !oldTaskName.trim()) {
      return res.status(400).json({ error: 'oldTaskName must be a non-empty string' });
    }
    
    if (typeof oldCategoryName !== 'string' || !oldCategoryName.trim()) {
      return res.status(400).json({ error: 'oldCategoryName must be a non-empty string' });
    }
    
    // At least one of newTaskName or newCategoryName must be provided
    if (!newTaskName && !newCategoryName) {
      return res.status(400).json({ error: 'At least one of newTaskName or newCategoryName must be provided' });
    }

    const provider = getProvider();
    const userId = req.userId as number;

    const oldCategory = await provider.findCategoryByName(userId, oldCategoryName.trim());
    if (!oldCategory) {
      return res.status(404).json({ error: 'Old category not found' });
    }
    const oldCategoryId = oldCategory.id;
    
    const totalEntries = await provider.countTimeEntriesByTaskNameAndCategory(userId, oldTaskName.trim(), oldCategoryId);
    
    if (totalEntries === 0) {
      return res.status(404).json({ error: 'No entries found with the specified task name and category' });
    }
    
    let newCategoryId: number | null = null;
    if (newCategoryName) {
      const newCategory = await provider.findCategoryByName(userId, newCategoryName.trim());
      if (!newCategory) {
        return res.status(404).json({ error: 'New category not found' });
      }
      newCategoryId = newCategory.id;
    }
    
    // Build the update query based on what's being changed
    const finalTaskName = newTaskName ? newTaskName.trim() : oldTaskName.trim();
    const finalCategoryId = newCategoryId !== null ? newCategoryId : oldCategoryId;

    await provider.updateTimeEntriesForBulkUpdate(userId, oldTaskName.trim(), oldCategoryId, {
      task_name: finalTaskName,
      category_id: finalCategoryId
    });
    broadcastSyncEvent(userId, 'time-entries');

    logger.info('Task names updated in bulk', { 
      oldTaskName, 
      oldCategoryName,
      newTaskName: finalTaskName,
      newCategoryName: newCategoryName || oldCategoryName,
      entriesUpdated: totalEntries, 
      userId
    });

    res.json({ entriesUpdated: totalEntries });
  } catch (error) {
    logger.error('Error updating task names in bulk', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to update task names' });
  }
});

// Delete all entries for a specific date
router.delete('/by-date/:date', async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.params;
    const provider = getProvider();

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;

    // Count entries to be deleted (excluding active entries)
    const count = await provider.deleteTimeEntriesByDate(req.userId as number, startOfDay, endOfDay);

    if (count === 0) {
      return res.status(404).json({ error: 'No completed entries found for this date' });
    }

    broadcastSyncEvent(req.userId as number, 'time-entries');

    logger.info('Time entries deleted for date', { date, count, userId: req.userId as number });
    res.json({ deleted: count });
  } catch (error) {
    logger.error('Error deleting time entries by date', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to delete time entries' });
  }
});

export default router;
