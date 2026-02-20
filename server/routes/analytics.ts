import { Router, Response } from 'express';
import { getProvider } from '../database';
import { logger } from '../logger';
import { flexAuthMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(flexAuthMiddleware);

// Update a task name (rename and/or change category for all entries with that task name)
router.put('/task-names', async (req: AuthRequest, res: Response) => {
  try {
    const { oldTaskName, newTaskName, newCategoryId } = req.body;
    
    if (!oldTaskName) {
      return res.status(400).json({ error: 'oldTaskName is required' });
    }
    
    if (!newTaskName && newCategoryId === undefined) {
      return res.status(400).json({ error: 'Either newTaskName or newCategoryId is required' });
    }

    const provider = getProvider();
    const userId = req.userId as number;

    // Verify category exists if changing category
    if (newCategoryId !== undefined) {
      const category = await provider.findCategoryById(userId, Number(newCategoryId));
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }
    }

    // Build the update query dynamically
    const updates: string[] = [];
    const params: (string | number)[] = [];
    
    if (newTaskName) {
      updates.push('task_name = ?');
      params.push(newTaskName);
    }
    
    if (newCategoryId !== undefined) {
      updates.push('category_id = ?');
      params.push(newCategoryId);
    }
    
    params.push(oldTaskName, userId);

    const updatedCount = await provider.updateTimeEntriesByTaskName(userId, oldTaskName, {
      ...(newTaskName ? { task_name: newTaskName } : {}),
      ...(newCategoryId !== undefined ? { category_id: Number(newCategoryId) } : {})
    });

    logger.info('Task name updated', { 
      userId, 
      oldTaskName, 
      newTaskName, 
      newCategoryId,
      updatedCount 
    });

    res.json({ 
      success: true, 
      updatedCount,
      oldTaskName,
      newTaskName: newTaskName || oldTaskName,
      newCategoryId
    });
  } catch (error) {
    logger.error('Error updating task name', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to update task name' });
  }
});

// Get all task names (paginated) for a date range
router.get('/task-names', async (req: AuthRequest, res: Response) => {
  try {
    const start = req.query.start as string;
    const end = req.query.end as string;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
    const offset = (page - 1) * pageSize;
    const sortBy = (req.query.sortBy as string) || 'time'; // time, alpha, count, recent
    
    // Optional filters
    const searchQuery = (req.query.search as string || '').trim().toLowerCase();
    const categoryFilter = (req.query.category as string || '').trim();

    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    const provider = getProvider();
    const userId = req.userId as number;

    const { taskNames, totalCount } = await provider.listTaskNames({
      userId,
      start,
      end,
      page,
      pageSize,
      sortBy,
      searchQuery: searchQuery || undefined,
      categoryFilter: categoryFilter || undefined
    });

    res.json({
      taskNames,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });
  } catch (error) {
    logger.error('Error fetching task names', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to fetch task names' });
  }
});

// Get category drilldown with paginated task names
router.get('/category/:categoryName', async (req: AuthRequest, res: Response) => {
  try {
    const { categoryName } = req.params;
    const start = req.query.start as string;
    const end = req.query.end as string;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
    const offset = (page - 1) * pageSize;

    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    const provider = getProvider();
    const userId = req.userId as number;

    const { category, taskNames, totalCount } = await provider.getCategoryDrilldown({
      userId,
      categoryName,
      start,
      end,
      page,
      pageSize
    });

    res.json({
      category,
      taskNames,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });
  } catch (error) {
    logger.error('Error fetching category drilldown', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to fetch category drilldown' });
  }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const start = req.query.start as string;
    const end = req.query.end as string;
    const timezoneOffset = parseInt(req.query.timezoneOffset as string) || 0; // Minutes offset from UTC
    
    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    const provider = getProvider();
    const userId = req.userId as number;

    const { byCategory, daily, topTasks, previousTotal } = await provider.getAnalyticsSummary({
      userId,
      start,
      end,
      timezoneOffset
    });

    // Calculate summary
    const totalMinutes = byCategory.reduce((sum, cat) => sum + cat.minutes, 0);
    const totalEntries = byCategory.reduce((sum, cat) => sum + cat.count, 0);
    const daysInPeriod = Math.max(1, daily.length);
    const avgMinutesPerDay = Math.round(totalMinutes / daysInPeriod);

    // Get previous period for comparison
    const startDate = new Date(start as string);
    const endDate = new Date(end as string);
    const periodLength = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - periodLength).toISOString();
    const prevEnd = start as string;

    const change = previousTotal > 0 
      ? Math.round(((totalMinutes - previousTotal) / previousTotal) * 100)
      : 0;

    res.json({
      period: { start, end },
      summary: {
        totalMinutes,
        totalEntries,
        avgMinutesPerDay,
        previousTotal,
        change
      },
      byCategory,
      daily,
      topTasks
    });
  } catch (error) {
    logger.error('Error fetching analytics', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
