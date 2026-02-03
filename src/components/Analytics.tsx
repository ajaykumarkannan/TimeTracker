import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';
import { AnalyticsData, Period, DailyTotal, TimeEntry, CategoryDrilldown, DescriptionsPaginated, Category } from '../types';
import './Analytics.css';

type AggregatedTotal = {
  label: string;
  startDate: string;
  endDate: string;
  minutes: number;
  byCategory: Record<string, number>;
};

type PeriodType = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all';

const STORAGE_KEY = 'chronoflow-analytics-period';

function getStoredPeriod(): Period {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ['day', 'week', 'month', 'quarter', 'year', 'all', 'last7', 'last30', 'last90'].includes(stored)) {
      return stored as Period;
    }
  } catch {
    // localStorage not available
  }
  return 'week';
}

export function Analytics() {
  const [period, setPeriod] = useState<Period>(getStoredPeriod);
  const [periodOffset, setPeriodOffset] = useState(0); // 0 = current, -1 = previous, etc.
  const [dayOffset, setDayOffset] = useState(0); // For "last N days" periods: shifts the window by days
  const [showPreviousMenu, setShowPreviousMenu] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const previousMenuRef = useRef<HTMLDivElement>(null);
  
  // Drill-down state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryDrilldown, setCategoryDrilldown] = useState<CategoryDrilldown | null>(null);
  const [categoryDrilldownPage, setCategoryDrilldownPage] = useState(1);
  const [categoryDrilldownLoading, setCategoryDrilldownLoading] = useState(false);
  
  // All descriptions state (paginated)
  const [descriptions, setDescriptions] = useState<DescriptionsPaginated | null>(null);
  const [descriptionsPage, setDescriptionsPage] = useState(1);
  const [descriptionsPageSize, setDescriptionsPageSize] = useState(10);
  const [descriptionsLoading, setDescriptionsLoading] = useState(false);
  const [descriptionsSortBy, setDescriptionsSortBy] = useState<'time' | 'alpha' | 'count' | 'recent'>('time');
  
  // Merge descriptions state - track by "description|category" key
  const [selectedDescriptions, setSelectedDescriptions] = useState<Set<string>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string>('');
  const [mergeCategoryTarget, setMergeCategoryTarget] = useState<string>('');
  const [merging, setMerging] = useState(false);

  // Inline editing state
  const [editingDescription, setEditingDescription] = useState<string | null>(null);
  const [editDescriptionValue, setEditDescriptionValue] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);

  // Load categories for inline editing dropdown
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await api.getCategories();
        setCategories(cats);
      } catch (error) {
        console.error('Failed to load categories:', error);
      }
    };
    loadCategories();
  }, []);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (previousMenuRef.current && !previousMenuRef.current.contains(e.target as Node)) {
        setShowPreviousMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch active entry
  useEffect(() => {
    const loadActiveEntry = async () => {
      try {
        const entry = await api.getActiveEntry();
        setActiveEntry(entry);
      } catch (error) {
        console.error('Failed to load active entry:', error);
      }
    };
    loadActiveEntry();
    // Poll for active entry changes every 30 seconds
    const interval = setInterval(loadActiveEntry, 30000);
    return () => clearInterval(interval);
  }, []);

  // Update elapsed time for active entry
  useEffect(() => {
    if (!activeEntry) {
      setElapsed(0);
      return;
    }
    const updateElapsed = () => {
      const start = new Date(activeEntry.start_time).getTime();
      const now = Date.now();
      setElapsed(Math.floor((now - start) / 1000));
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeEntry]);

  // Get Monday of the week containing the given date
  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // Get Sunday of the week containing the given date
  const getWeekEnd = (date: Date): Date => {
    const weekStart = getWeekStart(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return weekEnd;
  };

  const getDateRange = (p: Period, offset: number = 0): { start: Date; end: Date } => {
    const now = new Date();
    
    // Handle "last X days" periods with optional day offset
    if (p === 'last7' || p === 'last30' || p === 'last90') {
      const end = new Date(now);
      // Apply day offset (negative means going back in time)
      end.setDate(end.getDate() + offset);
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setHours(0, 0, 0, 0);
      
      switch (p) {
        case 'last7':
          start.setDate(end.getDate() - 6);
          break;
        case 'last30':
          start.setDate(end.getDate() - 29);
          break;
        case 'last90':
          start.setDate(end.getDate() - 89);
          break;
      }
      return { start, end };
    }

    let start: Date;
    let end: Date;

    switch (p) {
      case 'day': {
        // Single day view
        const targetDay = new Date(now);
        targetDay.setDate(targetDay.getDate() + offset);
        start = new Date(targetDay);
        start.setHours(0, 0, 0, 0);
        end = new Date(targetDay);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case 'week': {
        // Current week: Monday to Sunday
        const weekStart = getWeekStart(now);
        weekStart.setDate(weekStart.getDate() + (offset * 7));
        start = weekStart;
        end = getWeekEnd(weekStart);
        break;
      }
      case 'month': {
        // Current calendar month
        const targetMonth = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        start = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case 'quarter': {
        // Current calendar quarter
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const targetQuarter = currentQuarter + offset;
        const targetYear = now.getFullYear() + Math.floor(targetQuarter / 4);
        const adjustedQuarter = ((targetQuarter % 4) + 4) % 4;
        const quarterStartMonth = adjustedQuarter * 3;
        start = new Date(targetYear, quarterStartMonth, 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(targetYear, quarterStartMonth + 3, 0);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case 'year': {
        // Current calendar year
        const targetYear = now.getFullYear() + offset;
        start = new Date(targetYear, 0, 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(targetYear, 11, 31);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case 'all':
      default: {
        // All time - no offset support
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
        start = new Date(now);
        start.setFullYear(end.getFullYear() - 5);
        start.setHours(0, 0, 0, 0);
        break;
      }
    }
    
    return { start, end };
  };

  // Determine aggregation level based on period
  const getAggregation = (p: Period): 'hour' | 'day' | 'week' | 'month' => {
    switch (p) {
      case 'day':
        return 'hour';
      case 'week':
      case 'last7':
        return 'day';
      case 'month':
      case 'quarter':
      case 'last30':
      case 'last90':
        return 'week';
      case 'year':
      case 'all':
        return 'month';
    }
  };

  // Helper functions - defined before useMemo hooks that use them
  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const csvData = await api.exportCSV();
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chronoflow-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
    setExporting(false);
  };

  const handlePeriodChange = (newPeriod: PeriodType) => {
    setPeriod(newPeriod);
    setPeriodOffset(0);
    setShowPreviousMenu(false);
    try { localStorage.setItem(STORAGE_KEY, newPeriod); } catch { /* ignore */ }
  };

  const handlePreviousPeriod = (lastDays: 'last7' | 'last30' | 'last90') => {
    setPeriod(lastDays);
    setPeriodOffset(0);
    setDayOffset(0);
    setShowPreviousMenu(false);
    try { localStorage.setItem(STORAGE_KEY, lastDays); } catch { /* ignore */ }
  };

  const isLastNDaysPeriod = period === 'last7' || period === 'last30' || period === 'last90';
  const canNavigatePrevious = period !== 'all';
  const canNavigateNext = canNavigatePrevious && (isLastNDaysPeriod ? dayOffset < 0 : periodOffset < 0);

  const navigatePeriod = (direction: -1 | 1) => {
    if (isLastNDaysPeriod) {
      setDayOffset(prev => prev + direction);
    } else {
      setPeriodOffset(prev => prev + direction);
    }
  };

  // Handle drill-down into a specific time bucket (day, week, or month)
  // Instead of using custom ranges with back button, simply switch to the appropriate period
  const handleChartDrilldown = (startDate: string, endDate: string) => {
    // Determine what period to drill down to based on current aggregation
    const aggregation = getAggregation(period);
    
    if (aggregation === 'hour') {
      // Already at day view, can't drill down further
      return;
    }
    
    const targetDate = new Date(startDate + 'T12:00:00');
    const now = new Date();
    
    if (aggregation === 'day') {
      // Drilling from week view into a specific day
      // Calculate offset from today
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const daysDiff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      setPeriod('day');
      setPeriodOffset(daysDiff);
    } else if (aggregation === 'week') {
      // Drilling from month/quarter view into a specific week
      // Calculate week offset from current week
      const currentWeekStart = getWeekStart(now);
      const targetWeekStart = getWeekStart(targetDate);
      const weeksDiff = Math.round((targetWeekStart.getTime() - currentWeekStart.getTime()) / (1000 * 60 * 60 * 24 * 7));
      
      setPeriod('week');
      setPeriodOffset(weeksDiff);
    } else if (aggregation === 'month') {
      // Drilling from year/all view into a specific month
      // Calculate month offset from current month
      const currentMonth = now.getFullYear() * 12 + now.getMonth();
      const targetMonth = targetDate.getFullYear() * 12 + targetDate.getMonth();
      const monthsDiff = targetMonth - currentMonth;
      
      setPeriod('month');
      setPeriodOffset(monthsDiff);
    }
  };

  // Merge descriptions handlers - use "description|category" as key
  const makeSelectionKey = (description: string, categoryName: string) => `${description}|${categoryName}`;
  const parseSelectionKey = (key: string) => {
    const lastPipe = key.lastIndexOf('|');
    return {
      description: key.substring(0, lastPipe),
      categoryName: key.substring(lastPipe + 1)
    };
  };

  const toggleDescriptionSelection = (description: string, categoryName: string) => {
    const key = makeSelectionKey(description, categoryName);
    setSelectedDescriptions(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const openMergeModal = () => {
    if (selectedDescriptions.size < 2) return;
    // Default to the first selected description as target
    const firstKey = Array.from(selectedDescriptions)[0];
    const { description, categoryName } = parseSelectionKey(firstKey);
    setMergeTarget(description);
    setMergeCategoryTarget(categoryName);
    setShowMergeModal(true);
  };

  // Get unique categories from selected descriptions
  const getSelectedCategories = (): string[] => {
    const categories = new Set<string>();
    for (const key of selectedDescriptions) {
      const { categoryName } = parseSelectionKey(key);
      categories.add(categoryName);
    }
    return Array.from(categories);
  };

  // Get unique descriptions from selected items
  const getSelectedDescriptionTexts = (): string[] => {
    const descs = new Set<string>();
    for (const key of selectedDescriptions) {
      const { description } = parseSelectionKey(key);
      descs.add(description);
    }
    return Array.from(descs);
  };

  const handleMerge = async () => {
    if (!mergeTarget || selectedDescriptions.size < 2) return;
    setMerging(true);
    try {
      // Get unique description texts from selected items
      const sourceDescriptions = getSelectedDescriptionTexts();
      const selectedCategories = getSelectedCategories();
      // Only pass category if there are multiple categories being merged
      const targetCategory = selectedCategories.length > 1 ? mergeCategoryTarget : undefined;
      await api.mergeDescriptions(sourceDescriptions, mergeTarget, targetCategory);
      // Clear selection and refresh data
      setSelectedDescriptions(new Set());
      setShowMergeModal(false);
      // Trigger data refresh
      const { start, end } = getDateRange(period, effectiveOffset);
      const result = await api.getDescriptions(start.toISOString(), end.toISOString(), descriptionsPage, descriptionsPageSize, descriptionsSortBy);
      setDescriptions(result);
    } catch (error) {
      console.error('Failed to merge descriptions:', error);
    }
    setMerging(false);
  };

  // Inline editing handlers
  const startEditing = (description: string, categoryName: string) => {
    setEditingDescription(description);
    setEditDescriptionValue(description);
    const cat = categories.find(c => c.name === categoryName);
    setEditCategoryId(cat?.id || null);
  };

  const cancelEditing = () => {
    setEditingDescription(null);
    setEditDescriptionValue('');
    setEditCategoryId(null);
  };

  const saveEditing = async () => {
    if (!editingDescription) return;
    
    const hasDescriptionChange = editDescriptionValue !== editingDescription;
    const originalCat = descriptions?.descriptions.find(d => d.description === editingDescription);
    const originalCatId = categories.find(c => c.name === originalCat?.category_name)?.id;
    const hasCategoryChange = editCategoryId !== null && editCategoryId !== originalCatId;
    
    if (!hasDescriptionChange && !hasCategoryChange) {
      cancelEditing();
      return;
    }

    setSaving(true);
    try {
      await api.updateDescription(
        editingDescription,
        hasDescriptionChange ? editDescriptionValue : undefined,
        hasCategoryChange && editCategoryId !== null ? editCategoryId : undefined
      );
      // Refresh descriptions
      const { start, end } = getDateRange(period, effectiveOffset);
      const result = await api.getDescriptions(start.toISOString(), end.toISOString(), descriptionsPage, descriptionsPageSize, descriptionsSortBy);
      setDescriptions(result);
      // Also refresh analytics data to update category totals
      const analytics = await api.getAnalytics(start.toISOString(), end.toISOString());
      setData(analytics);
      cancelEditing();
    } catch (error) {
      console.error('Failed to update description:', error);
    }
    setSaving(false);
  };

  // Get the effective offset based on period type
  const effectiveOffset = isLastNDaysPeriod ? dayOffset : periodOffset;

  useEffect(() => {
    const loadAnalytics = async () => {
      setLoading(true);
      try {
        const { start, end } = getDateRange(period, effectiveOffset);
        const analytics = await api.getAnalytics(start.toISOString(), end.toISOString());
        setData(analytics);
        // Reset drill-down state when period changes
        setSelectedCategory(null);
        setCategoryDrilldown(null);
        setCategoryDrilldownPage(1);
        setDescriptionsPage(1);
      } catch (error) {
        console.error('Failed to load analytics:', error);
      }
      setLoading(false);
    };

    loadAnalytics();
  }, [period, effectiveOffset]);

  // Load all descriptions (paginated)
  useEffect(() => {
    const loadDescriptions = async () => {
      if (!data) return;
      setDescriptionsLoading(true);
      try {
        const { start, end } = getDateRange(period, effectiveOffset);
        const result = await api.getDescriptions(start.toISOString(), end.toISOString(), descriptionsPage, descriptionsPageSize, descriptionsSortBy);
        setDescriptions(result);
      } catch (error) {
        console.error('Failed to load descriptions:', error);
      }
      setDescriptionsLoading(false);
    };

    loadDescriptions();
  }, [data, descriptionsPage, descriptionsPageSize, descriptionsSortBy, period, effectiveOffset]);

  // Load category drilldown when a category is selected
  useEffect(() => {
    const loadCategoryDrilldown = async () => {
      if (!selectedCategory || !data) {
        setCategoryDrilldown(null);
        return;
      }
      setCategoryDrilldownLoading(true);
      try {
        const { start, end } = getDateRange(period, effectiveOffset);
        const result = await api.getCategoryDrilldown(selectedCategory, start.toISOString(), end.toISOString(), categoryDrilldownPage, 20);
        setCategoryDrilldown(result);
      } catch (error) {
        console.error('Failed to load category drilldown:', error);
      }
      setCategoryDrilldownLoading(false);
    };

    loadCategoryDrilldown();
  }, [selectedCategory, categoryDrilldownPage, data, period, effectiveOffset]);

  // Fill in missing days with 0 minutes (skip for 'all' period - too slow)
  const filledDaily = useMemo(() => {
    if (!data) return [];
    
    // For 'all' period, just use the raw data - no need to fill gaps
    if (period === 'all') {
      return data.daily;
    }
    
    const { start, end } = getDateRange(period, effectiveOffset);
    const dailyMap = new Map(data.daily.map(d => [d.date, d]));
    const filled: DailyTotal[] = [];
    
    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const existing = dailyMap.get(dateStr);
      filled.push(existing || { date: dateStr, minutes: 0, byCategory: {} });
      current.setDate(current.getDate() + 1);
    }
    
    return filled;
  }, [data, period, effectiveOffset]);

  // Aggregate daily data into hours, weeks, or months based on period
  const aggregatedData = useMemo((): AggregatedTotal[] => {
    if (!data || filledDaily.length === 0) return [];
    
    const aggregation = getAggregation(period);
    
    if (aggregation === 'hour') {
      // For day view, show hourly breakdown
      // Since we don't have hourly data from the API, we'll show the single day
      // In a real implementation, you'd want hourly data from the backend
      return filledDaily.map(d => ({
        label: formatShortDate(d.date),
        startDate: d.date,
        endDate: d.date,
        minutes: d.minutes,
        byCategory: d.byCategory
      }));
    }
    
    if (aggregation === 'day') {
      // No aggregation needed for week view
      return filledDaily.map(d => ({
        label: formatShortDate(d.date),
        startDate: d.date,
        endDate: d.date,
        minutes: d.minutes,
        byCategory: d.byCategory
      }));
    }
    
    const buckets = new Map<string, AggregatedTotal>();
    
    for (const day of filledDaily) {
      const date = new Date(day.date + 'T12:00:00');
      let bucketKey: string;
      let label: string;
      let startDate: string;
      let endDate: string;
      
      if (aggregation === 'week') {
        const weekStart = getWeekStart(date);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        bucketKey = weekStart.toISOString().split('T')[0];
        startDate = bucketKey;
        endDate = weekEnd.toISOString().split('T')[0];
        
        // Format: "Jan 6-12" or "Dec 30 - Jan 5"
        const startMonth = weekStart.toLocaleDateString(undefined, { month: 'short' });
        const endMonth = weekEnd.toLocaleDateString(undefined, { month: 'short' });
        if (startMonth === endMonth) {
          label = `${startMonth} ${weekStart.getDate()}-${weekEnd.getDate()}`;
        } else {
          label = `${startMonth} ${weekStart.getDate()} - ${endMonth} ${weekEnd.getDate()}`;
        }
      } else {
        // Monthly aggregation
        bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        startDate = monthStart.toISOString().split('T')[0];
        endDate = monthEnd.toISOString().split('T')[0];
        label = date.toLocaleDateString(undefined, { month: 'short', year: period === 'all' ? '2-digit' : undefined });
      }
      
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, {
          label,
          startDate,
          endDate,
          minutes: 0,
          byCategory: {}
        });
      }
      
      const bucket = buckets.get(bucketKey);
      if (!bucket) continue;
      bucket.minutes += day.minutes;
      
      // Merge category data
      for (const [catName, mins] of Object.entries(day.byCategory)) {
        bucket.byCategory[catName] = (bucket.byCategory[catName] || 0) + mins;
      }
    }
    
    // Sort buckets by start date to ensure chronological order
    let result = Array.from(buckets.values()).sort((a, b) => 
      a.startDate.localeCompare(b.startDate)
    );
    
    // For "all time" view, only show months with activity
    if (period === 'all') {
      result = result.filter(b => b.minutes > 0);
    }
    
    return result;
  }, [filledDaily, period, data]);

  // Determine if we need vertical labels (long labels or many items)
  const needsVerticalLabels = useMemo(() => {
    if (aggregatedData.length === 0) return false;
    const aggregation = getAggregation(period);
    // Use vertical labels for week aggregation (long date ranges) or many items
    return aggregation === 'week' || aggregatedData.length > 12;
  }, [aggregatedData, period]);

  // Determine if chart needs scrolling based on period and item count
  const needsScrolling = useMemo(() => {
    const aggregation = getAggregation(period);
    if (aggregation === 'hour') return false; // Day view (single day or few days) always fits
    if (aggregation === 'day') return false; // Week view (7 days) always fits
    if (aggregation === 'week') return aggregatedData.length > 6; // Month (5 weeks) fits, quarter (13+ weeks) scrolls
    return aggregatedData.length > 12; // Year (12 months) fits, all time may scroll
  }, [aggregatedData, period]);

  // Check if drill-down is possible (not at the most granular level)
  const canDrillDown = useMemo(() => {
    const aggregation = getAggregation(period);
    return aggregation !== 'hour';
  }, [period]);

  // Ref for scrolling to end
  const chartRef = useRef<HTMLDivElement>(null);

  // Scroll to end (newest) when data changes
  useEffect(() => {
    if (chartRef.current && needsScrolling) {
      chartRef.current.scrollLeft = chartRef.current.scrollWidth;
    }
  }, [aggregatedData, needsScrolling]);

  // Build category color map for stacked bars
  const categoryColorMap = useMemo(() => {
    if (!data) return new Map<string, string>();
    return new Map(data.byCategory.map(c => [c.name, c.color]));
  }, [data]);

  const formatDuration = (minutes: number) => {
    if (minutes === 0) return '0m';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatFullDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    if (startDate === endDate) {
      return formatFullDate(startDate);
    }
    const start = new Date(startDate + 'T12:00:00');
    const end = new Date(endDate + 'T12:00:00');
    return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  };

  const getMaxMinutes = () => {
    if (aggregatedData.length === 0) return 60;
    const max = Math.max(...aggregatedData.map(d => d.minutes));
    return max > 0 ? max : 60;
  };

  const getChartTitle = () => {
    const aggregation = getAggregation(period);
    switch (aggregation) {
      case 'hour':
        return 'Day View';
      case 'day':
        return 'Daily Breakdown';
      case 'week':
        return 'Weekly Breakdown';
      case 'month':
        return 'Monthly Breakdown';
    }
  };

  const getChartHint = () => {
    const { start, end } = getDateRange(period, effectiveOffset);
    const formatRange = (s: Date, e: Date) => {
      const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
      if (s.getFullYear() !== e.getFullYear()) {
        return `${s.toLocaleDateString(undefined, { ...opts, year: 'numeric' })} - ${e.toLocaleDateString(undefined, { ...opts, year: 'numeric' })}`;
      }
      return `${s.toLocaleDateString(undefined, opts)} - ${e.toLocaleDateString(undefined, opts)}`;
    };

    switch (period) {
      case 'day':
        return start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      case 'week':
        return formatRange(start, end);
      case 'month':
        return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      case 'quarter': {
        const q = Math.floor(start.getMonth() / 3) + 1;
        return `Q${q} ${start.getFullYear()}`;
      }
      case 'year':
        return start.getFullYear().toString();
      case 'last7':
        return 'Last 7 days';
      case 'last30':
        return 'Last 30 days';
      case 'last90':
        return 'Last 90 days';
      case 'all':
        return 'All time (by month)';
    }
  };

  if (loading) {
    return (
      <div className="analytics-loading">
        <div className="loading-spinner" />
        Loading analytics...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="analytics-error">
        Failed to load analytics
      </div>
    );
  }

  const maxMinutes = getMaxMinutes();
  const hasData = data.summary.totalMinutes > 0;

  return (
    <div className="analytics">
      {/* Period selector */}
      <div className="analytics-header">
        <div className="period-selector-wrapper">
          <div className="period-selector">
            <button className={period === 'day' ? 'active' : ''} onClick={() => handlePeriodChange('day')}>Day</button>
            <button className={period === 'week' ? 'active' : ''} onClick={() => handlePeriodChange('week')}>Week</button>
            <button className={period === 'month' ? 'active' : ''} onClick={() => handlePeriodChange('month')}>Month</button>
            <button className={period === 'quarter' ? 'active' : ''} onClick={() => handlePeriodChange('quarter')}>Quarter</button>
            <button className={period === 'year' ? 'active' : ''} onClick={() => handlePeriodChange('year')}>Year</button>
            <button className={period === 'all' ? 'active' : ''} onClick={() => handlePeriodChange('all')}>All</button>
            <div className="period-dropdown" ref={previousMenuRef}>
              <button 
                className={`dropdown-trigger ${period === 'last7' || period === 'last30' || period === 'last90' ? 'active' : ''}`}
                onClick={() => setShowPreviousMenu(!showPreviousMenu)}
              >
                Previous
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6,9 12,15 18,9" />
                </svg>
              </button>
              {showPreviousMenu && (
                <div className="dropdown-menu">
                  <button className={period === 'last7' ? 'active' : ''} onClick={() => handlePreviousPeriod('last7')}>Last 7 days</button>
                  <button className={period === 'last30' ? 'active' : ''} onClick={() => handlePreviousPeriod('last30')}>Last 30 days</button>
                  <button className={period === 'last90' ? 'active' : ''} onClick={() => handlePreviousPeriod('last90')}>Last 90 days</button>
                </div>
              )}
            </div>
          </div>
          {canNavigatePrevious && (
            <div className="period-nav">
              <button className="period-nav-btn" onClick={() => navigatePeriod(-1)} title="Previous">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15,18 9,12 15,6" />
                </svg>
              </button>
              <button className="period-nav-btn" onClick={() => navigatePeriod(1)} disabled={!canNavigateNext} title="Next">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9,18 15,12 9,6" />
                </svg>
              </button>
            </div>
          )}
        </div>
        <button className="export-btn" onClick={handleExport} disabled={exporting}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Current ongoing task */}
      {activeEntry && (
        <div className="active-task-card">
          <div className="active-task-indicator">
            <span className="pulse-dot" />
            <span className="active-label">Currently tracking</span>
          </div>
          <div className="active-task-info">
            <span 
              className="category-badge" 
              style={{ 
                backgroundColor: `${activeEntry.category_color}20`,
                color: activeEntry.category_color || 'var(--primary)'
              }}
            >
              <span className="category-dot" style={{ backgroundColor: activeEntry.category_color || 'var(--primary)' }} />
              {activeEntry.category_name}
            </span>
            {activeEntry.description && <span className="active-task-description">{activeEntry.description}</span>}
          </div>
          <div className="active-task-timer">{formatElapsed(elapsed)}</div>
        </div>
      )}

      {/* Summary cards */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-label">Total Time</div>
          <div className="summary-value">{formatDuration(data.summary.totalMinutes)}</div>
          {data.summary.change !== 0 && (
            <div className={`summary-change ${data.summary.change > 0 ? 'positive' : 'negative'}`}>
              {data.summary.change > 0 ? '↑' : '↓'} {Math.abs(data.summary.change)}% vs previous
            </div>
          )}
        </div>
        <div className="summary-card">
          <div className="summary-label">Entries</div>
          <div className="summary-value">{data.summary.totalEntries}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Daily Average</div>
          <div className="summary-value">{formatDuration(data.summary.avgMinutesPerDay)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Active Days</div>
          <div className="summary-value">{data.daily.length}</div>
        </div>
      </div>

      {/* Daily/Weekly/Monthly chart - stacked bars */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{getChartTitle()}</h2>
          {hasData && (
            <span className="chart-hint">
              {getChartHint()}
              {canDrillDown && <span className="chart-hint-action"> · Click to drill down</span>}
            </span>
          )}
        </div>
        <div 
          ref={chartRef}
          className={`daily-chart ${!hasData ? 'empty' : ''} view-${getAggregation(period)} ${needsVerticalLabels ? 'vertical-labels' : ''} ${needsScrolling ? 'scrollable' : ''}`}
        >
          {aggregatedData.map((bucket) => {
            const today = new Date().toISOString().split('T')[0];
            const isToday = bucket.startDate <= today && bucket.endDate >= today;
            const hasMinutes = bucket.minutes > 0;
            const categoryEntries = Object.entries(bucket.byCategory).filter(([_, mins]) => mins > 0);
            // Calculate flex ratio: bar takes up proportional space, spacer takes the rest
            const barRatio = bucket.minutes / maxMinutes;
            const spacerRatio = 1 - barRatio;
            const isClickable = canDrillDown && hasMinutes;
            
            return (
              <div 
                key={bucket.startDate} 
                className={`chart-bar-container ${isToday ? 'today' : ''} ${!hasMinutes ? 'empty' : ''} ${isClickable ? 'clickable' : ''}`} 
                title={`${formatDateRange(bucket.startDate, bucket.endDate)}: ${formatDuration(bucket.minutes)}${isClickable ? ' (click to drill down)' : ''}`}
                onClick={isClickable ? () => handleChartDrilldown(bucket.startDate, bucket.endDate) : undefined}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleChartDrilldown(bucket.startDate, bucket.endDate); } : undefined}
              >
                <div className="chart-bar-wrapper">
                  {/* Spacer pushes the bar stack to the bottom */}
                  <div style={{ flex: spacerRatio }} />
                  <div className="chart-bar-stack" style={{ flex: hasMinutes ? barRatio : 0, minHeight: hasMinutes ? '4px' : 0 }}>
                    {categoryEntries.map(([catName, mins]) => {
                      const segmentPercent = (mins / bucket.minutes) * 100;
                      const color = categoryColorMap.get(catName) || 'var(--primary)';
                      return (
                        <div
                          key={catName}
                          className="chart-bar-segment"
                          style={{ 
                            flex: segmentPercent,
                            backgroundColor: color
                          }}
                          title={`${catName}: ${formatDuration(mins)}`}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="chart-label">{bucket.label}</div>
                <div className="chart-value">{hasMinutes ? formatDuration(bucket.minutes) : '—'}</div>
              </div>
            );
          })}
        </div>
        {/* Legend for stacked chart */}
        {hasData && data.byCategory.filter(c => c.minutes > 0).length > 0 && (
          <div className="chart-legend">
            {data.byCategory.filter(c => c.minutes > 0).map(cat => (
              <div key={cat.name} className="legend-item">
                <div className="legend-dot" style={{ backgroundColor: cat.color }} />
                <span className="legend-label">{cat.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Category breakdown */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">By Category</h2>
          {selectedCategory && (
            <button className="back-btn" onClick={() => { setSelectedCategory(null); setCategoryDrilldownPage(1); }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15,18 9,12 15,6" />
              </svg>
              Back to all
            </button>
          )}
        </div>
        {!hasData ? (
          <div className="empty-state"><p>No data for this period</p></div>
        ) : selectedCategory && categoryDrilldown ? (
          // Category drilldown view
          <div className="category-drilldown">
            <div className="drilldown-header">
              <div className="category-info">
                <div className="category-dot" style={{ backgroundColor: categoryDrilldown.category.color }} />
                <span className="category-name">{categoryDrilldown.category.name}</span>
              </div>
              <div className="category-stats">
                <span className="category-time">{formatDuration(categoryDrilldown.category.minutes)}</span>
                <span className="category-count">{categoryDrilldown.category.count} entries</span>
              </div>
            </div>
            {categoryDrilldownLoading ? (
              <div className="drilldown-loading">Loading...</div>
            ) : categoryDrilldown.descriptions.length === 0 ? (
              <div className="empty-state"><p>No descriptions for this category</p></div>
            ) : (
              <>
                <div className="descriptions-list">
                  {categoryDrilldown.descriptions.map((item, i) => (
                    <div key={i} className="task-row">
                      <span className="task-name">{item.description}</span>
                      <span className="task-count">{item.count}×</span>
                      <span className="task-time">{formatDuration(item.total_minutes)}</span>
                    </div>
                  ))}
                </div>
                {categoryDrilldown.pagination.totalPages > 1 && (
                  <div className="pagination">
                    <button 
                      className="pagination-btn" 
                      disabled={categoryDrilldownPage === 1}
                      onClick={() => setCategoryDrilldownPage(p => p - 1)}
                    >
                      Previous
                    </button>
                    <span className="pagination-info">
                      Page {categoryDrilldown.pagination.page} of {categoryDrilldown.pagination.totalPages}
                    </span>
                    <button 
                      className="pagination-btn" 
                      disabled={categoryDrilldownPage >= categoryDrilldown.pagination.totalPages}
                      onClick={() => setCategoryDrilldownPage(p => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="category-breakdown">
            {data.byCategory.filter(c => c.minutes > 0).map(cat => {
              const percentage = Math.round((cat.minutes / data.summary.totalMinutes) * 100);
              return (
                <div 
                  key={cat.name} 
                  className="category-row clickable"
                  onClick={() => { setSelectedCategory(cat.name); setCategoryDrilldownPage(1); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setSelectedCategory(cat.name); setCategoryDrilldownPage(1); } }}
                >
                  <div className="category-info">
                    <div className="category-dot" style={{ backgroundColor: cat.color }} />
                    <span className="category-name">{cat.name}</span>
                  </div>
                  <div className="category-bar-wrapper">
                    <div className="category-bar" style={{ width: `${percentage}%`, backgroundColor: cat.color }} />
                  </div>
                  <div className="category-stats">
                    <span className="category-time">{formatDuration(cat.minutes)}</span>
                    <span className="category-percent">{percentage}%</span>
                  </div>
                  <svg className="chevron-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9,18 15,12 9,6" />
                  </svg>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* All descriptions (paginated) */}
      {descriptions && descriptions.pagination.totalCount > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">All Descriptions</h2>
            <div className="descriptions-header-controls">
              {selectedDescriptions.size >= 2 && (
                <button className="merge-btn" onClick={openMergeModal}>
                  Merge {selectedDescriptions.size} selected
                </button>
              )}
              {selectedDescriptions.size > 0 && selectedDescriptions.size < 2 && (
                <span className="merge-hint">Select 2+ to merge</span>
              )}
              <select 
                className="sort-select"
                value={descriptionsSortBy}
                onChange={(e) => { setDescriptionsSortBy(e.target.value as 'time' | 'alpha' | 'count' | 'recent'); setDescriptionsPage(1); }}
              >
                <option value="time">Sort by Time</option>
                <option value="alpha">Sort A-Z</option>
                <option value="count">Sort by Instances</option>
                <option value="recent">Sort by Recent</option>
              </select>
              <span className="descriptions-count">{descriptions.pagination.totalCount} total</span>
            </div>
          </div>
          {descriptionsLoading ? (
            <div className="drilldown-loading">Loading...</div>
          ) : (
            <>
              <div className="top-tasks">
                {descriptions.descriptions.map((item, i) => {
                  const selectionKey = makeSelectionKey(item.description, item.category_name);
                  const isEditing = editingDescription === item.description;
                  return (
                    <div key={`${item.description}-${item.category_name}-${i}`} className={`task-row ${selectedDescriptions.has(selectionKey) ? 'selected' : ''} ${isEditing ? 'editing' : ''}`}>
                      <label className="task-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedDescriptions.has(selectionKey)}
                          onChange={() => toggleDescriptionSelection(item.description, item.category_name)}
                          disabled={isEditing}
                        />
                      </label>
                      <span className="task-rank">#{(descriptionsPage - 1) * descriptionsPageSize + i + 1}</span>
                      {isEditing ? (
                        <>
                          <input
                            type="text"
                            className="task-name-input"
                            value={editDescriptionValue}
                            onChange={(e) => setEditDescriptionValue(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditing();
                              if (e.key === 'Escape') cancelEditing();
                            }}
                          />
                          <select
                            className="task-category-select"
                            value={editCategoryId || ''}
                            onChange={(e) => setEditCategoryId(Number(e.target.value))}
                          >
                            {categories.map(cat => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                          <div className="task-edit-actions">
                            <button className="task-edit-btn save" onClick={saveEditing} disabled={saving} title="Save">
                              {saving ? '...' : '✓'}
                            </button>
                            <button className="task-edit-btn cancel" onClick={cancelEditing} disabled={saving} title="Cancel">
                              ✕
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="task-name">{item.description}</span>
                          <span 
                            className="task-category"
                            style={{ 
                              backgroundColor: `${item.category_color || 'var(--primary)'}20`,
                              color: item.category_color || 'var(--primary)'
                            }}
                          >
                            <span className="task-category-dot" style={{ backgroundColor: item.category_color || 'var(--primary)' }} />
                            {item.category_name}
                          </span>
                          <span className="task-count">{item.count}×</span>
                          <span className="task-time">{formatDuration(item.total_minutes)}</span>
                          <button 
                            className="task-edit-trigger" 
                            onClick={() => startEditing(item.description, item.category_name)}
                            title="Edit description"
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="pagination">
                <button 
                  className="pagination-btn" 
                  disabled={descriptionsPage === 1}
                  onClick={() => setDescriptionsPage(p => p - 1)}
                >
                  Previous
                </button>
                <span className="pagination-info">
                  Page {descriptions.pagination.page} of {descriptions.pagination.totalPages}
                </span>
                <button 
                  className="pagination-btn" 
                  disabled={descriptionsPage >= descriptions.pagination.totalPages}
                  onClick={() => setDescriptionsPage(p => p + 1)}
                >
                  Next
                </button>
                <select 
                  className="page-size-select"
                  value={descriptionsPageSize}
                  onChange={(e) => { setDescriptionsPageSize(Number(e.target.value)); setDescriptionsPage(1); }}
                >
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                </select>
              </div>
            </>
          )}
        </div>
      )}

      {/* Merge descriptions modal */}
      {showMergeModal && (() => {
        const uniqueDescriptions = getSelectedDescriptionTexts();
        const uniqueCategories = getSelectedCategories();
        const hasMultipleCategories = uniqueCategories.length > 1;
        
        // Get category colors from descriptions data
        const categoryColors: Record<string, string | null> = {};
        if (descriptions) {
          for (const item of descriptions.descriptions) {
            if (uniqueCategories.includes(item.category_name)) {
              categoryColors[item.category_name] = item.category_color;
            }
          }
        }
        
        return (
          <div className="modal-overlay" onClick={() => setShowMergeModal(false)}>
            <div className="merge-modal" onClick={e => e.stopPropagation()}>
              <h3>Merge Descriptions</h3>
              <p className="merge-info">
                Select which description to keep. All {selectedDescriptions.size} items will be merged into the selected one.
              </p>
              
              <div className="merge-section">
                <h4 className="merge-section-title">Target Description</h4>
                <div className="merge-options">
                  {uniqueDescriptions.map(desc => (
                    <label key={desc} className={`merge-option ${mergeTarget === desc ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="mergeTarget"
                        value={desc}
                        checked={mergeTarget === desc}
                        onChange={() => setMergeTarget(desc)}
                      />
                      <span className="merge-option-text">{desc}</span>
                    </label>
                  ))}
                </div>
              </div>
              
              {hasMultipleCategories && (
                <div className="merge-section">
                  <h4 className="merge-section-title">Target Category</h4>
                  <p className="merge-info merge-category-hint">
                    Selected items have different categories. Choose which category to use.
                  </p>
                  <div className="merge-options">
                    {uniqueCategories.map(cat => (
                      <label key={cat} className={`merge-option ${mergeCategoryTarget === cat ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="mergeCategoryTarget"
                          value={cat}
                          checked={mergeCategoryTarget === cat}
                          onChange={() => setMergeCategoryTarget(cat)}
                        />
                        <span 
                          className="merge-option-category"
                          style={{ 
                            backgroundColor: `${categoryColors[cat] || 'var(--primary)'}20`,
                            color: categoryColors[cat] || 'var(--primary)'
                          }}
                        >
                          <span className="merge-option-category-dot" style={{ backgroundColor: categoryColors[cat] || 'var(--primary)' }} />
                          {cat}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="merge-actions">
                <button className="btn btn-ghost" onClick={() => setShowMergeModal(false)} disabled={merging}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleMerge} disabled={merging || !mergeTarget || (hasMultipleCategories && !mergeCategoryTarget)}>
                  {merging ? 'Merging...' : 'Merge'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Insights */}
      {hasData && (
        <div className="card insights-card">
          <div className="card-header">
            <h2 className="card-title">Insights</h2>
          </div>
          <div className="insights">
            {data.byCategory.length > 0 && data.byCategory[0].minutes > 0 && (
              <div className="insight">
                <span className="insight-icon">🎯</span>
                <span>
                  <strong>{data.byCategory[0].name}</strong> takes up most of your time 
                  ({Math.round((data.byCategory[0].minutes / data.summary.totalMinutes) * 100)}%)
                </span>
              </div>
            )}
            {data.summary.change > 20 && (
              <div className="insight">
                <span className="insight-icon">📈</span>
                <span>You tracked <strong>{data.summary.change}% more</strong> time than the previous period</span>
              </div>
            )}
            {data.summary.change < -20 && (
              <div className="insight">
                <span className="insight-icon">📉</span>
                <span>You tracked <strong>{Math.abs(data.summary.change)}% less</strong> time than the previous period</span>
              </div>
            )}
            {data.daily.length > 0 && (
              <div className="insight">
                <span className="insight-icon">📅</span>
                <span>
                  Most tracked day: <strong>
                    {formatFullDate(data.daily.reduce((max, d) => d.minutes > max.minutes ? d : max, data.daily[0]).date)}
                  </strong>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
