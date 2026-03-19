import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { TimeEntry, Category } from '../types';
import { api } from '../api';
import { formatTime, formatTimeCompact, formatDuration, formatDate, formatDateOnly, formatTimeOnly, combineDateAndTime } from '../utils/timeUtils';
import { fuzzyMatch } from '../utils/fuzzyMatch';
import { useTheme } from '../contexts/ThemeContext';
import { getAdaptiveCategoryColors } from '../hooks/useAdaptiveColors';
import './TimeEntryList.css';

// Debounce hook for search input
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

function formatBreakDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  if (rh === 0 && m === 0) return `${d}d`;
  if (m === 0) return `${d}d ${rh}h`;
  return `${d}d ${rh}h ${m}m`;
}

interface Props {
  categories: Category[];
  activeEntry: TimeEntry | null;
  onEntryChange: (optimistic?: { active?: TimeEntry | null; stopped?: TimeEntry }) => void;
  onCategoryChange: () => void;
  refreshKey?: number;
  lastOptimistic?: { active?: TimeEntry | null; stopped?: TimeEntry } | null;
}

type EditField = 'category' | 'description' | 'startTime' | 'endTime' | null;

interface MergeCandidate {
  entries: TimeEntry[];
  categoryName: string;
  description: string | null;
}

interface ShortEntry {
  entry: TimeEntry;
  durationSeconds: number;
}

export function TimeEntryList({ categories, activeEntry, onEntryChange, onCategoryChange, refreshKey, lastOptimistic }: Props) {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editField, setEditField] = useState<EditField>(null);
  const [editCategory, setEditCategory] = useState<number>(0);
  const [editDescription, setEditDescription] = useState<string>('');
  // Split date/time state for inline & modal editing (time-first UX)
  const [editStartDate, setEditStartDate] = useState<string>('');
  const [editStartTimeOnly, setEditStartTimeOnly] = useState<string>('');
  const [editEndDate, setEditEndDate] = useState<string>('');
  const [editEndTimeOnly, setEditEndTimeOnly] = useState<string>('');
  // Validation error shown during inline/modal time editing
  const [editTimeError, setEditTimeError] = useState<string | null>(null);

  // Track current edit field in a ref so deferred blur can check it
  const editFieldRef = useRef<EditField>(null);
  const editingIdRef = useRef<number | null>(null);
  // Flag to suppress blur-save when user pressed Escape to cancel
  const cancelledRef = useRef(false);

  // Swipe-to-reveal state for mobile entry actions
  const [swipedEntryId, setSwipedEntryId] = useState<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; id: number } | null>(null);

  // Mobile time-edit modal state
  const [showTimeEditModal, setShowTimeEditModal] = useState(false);
  const isMobileRef = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    isMobileRef.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => { isMobileRef.current = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  // Inline new category form state
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#6366f1');
  const [creatingCategory, setCreatingCategory] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [activePreset, setActivePreset] = useState<'today' | 'week' | 'month' | 'all' | null>('week');

  // Debounce search query to avoid excessive API calls while typing
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Initialize date filters to "This Week" on mount
  const [dateFrom, setDateFrom] = useState(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff);
    return `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`;
  });
  const [dateTo, setDateTo] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  // Manual entry form state
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualCategory, setManualCategory] = useState<number | ''>('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualStartDate, setManualStartDate] = useState('');
  const [manualStartTime, setManualStartTime] = useState('');
  const [manualEndDate, setManualEndDate] = useState('');
  const [manualEndTime, setManualEndTime] = useState('');
  const [manualError, setManualError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State for inline category creation in Add Entry modal
  const [showManualNewCategory, setShowManualNewCategory] = useState(false);
  const [manualNewCategoryName, setManualNewCategoryName] = useState('');
  const [manualNewCategoryColor, setManualNewCategoryColor] = useState('#6366f1');

  // Track if user has manually edited end date (for date defaulting feature)
  const [endDateManuallySet, setEndDateManuallySet] = useState(false);

  // Cleanup suggestions state
  const [showCleanupBanner, setShowCleanupBanner] = useState(true);
  const [dismissedMerges, setDismissedMerges] = useState<Set<string>>(new Set());
  const [dismissedShortEntries, setDismissedShortEntries] = useState<Set<number>>(new Set());

  // Task name suggestions for manual entry
  const [cachedSuggestions, setCachedSuggestions] = useState<{ task_name: string; categoryId: number; count: number; totalMinutes: number; lastUsed: string }[]>([]);
  const [showManualSuggestions, setShowManualSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const manualDescriptionRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const justSelectedSuggestionRef = useRef(false);

  // Fetch suggestions for manual entry
  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const results = await api.getTaskNameSuggestions(undefined, undefined);
        setCachedSuggestions(results);
      } catch (error) {
        console.error('Failed to fetch suggestions:', error);
      }
    };
    fetchSuggestions();
  }, [entries.length]); // Refetch when entries change

  // Filter suggestions based on task name input (shows all categories)
  const manualSuggestions = useMemo(() => {
    let filtered = cachedSuggestions;

    // Fuzzy filter by task name
    if (manualDescription) {
      filtered = filtered
        .map(s => ({ ...s, ...fuzzyMatch(manualDescription, s.task_name) }))
        .filter(s => s.match)
        .sort((a, b) => b.score - a.score || b.count - a.count);
    } else {
      // No query - sort by count
      filtered = filtered.sort((a, b) => b.count - a.count);
    }

    return filtered.slice(0, 8);
  }, [cachedSuggestions, manualDescription]);

  // Reset suggestion selection when suggestions list changes
  useEffect(() => {
    setSelectedSuggestionIndex(-1);
  }, [manualSuggestions]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        manualDescriptionRef.current &&
        !manualDescriptionRef.current.contains(e.target as Node)
      ) {
        setShowManualSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load entries based on date filter
  const loadEntries = useCallback(async (background = false) => {
    // Only show loading spinner on initial load, not background refreshes
    if (!background) setLoading(true);
    try {
      // Convert local date strings to local timezone ISO strings
      // This ensures the server filters based on the user's intended local dates
      let startDate: string | undefined;
      let endDate: string | undefined;

      if (dateFrom) {
        const [year, month, day] = dateFrom.split('-').map(Number);
        const localStart = new Date(year, month - 1, day, 0, 0, 0, 0);
        startDate = localStart.toISOString();
      }

      if (dateTo) {
        const [year, month, day] = dateTo.split('-').map(Number);
        const localEnd = new Date(year, month - 1, day, 23, 59, 59, 999);
        endDate = localEnd.toISOString();
      }

      // Pass category and search filters to server for proper filtering across all entries
      const categoryIdParam = categoryFilter !== 'all' ? categoryFilter : undefined;
      const searchParam = debouncedSearchQuery.trim() || undefined;

      const data = await api.getTimeEntries(startDate, endDate, categoryIdParam, searchParam);
      setEntries(data);
    } catch (error) {
      console.error('Failed to load entries:', error);
    }
    if (!background) setLoading(false);
  }, [dateFrom, dateTo, categoryFilter, debouncedSearchQuery]);

  // Load entries when date filter changes
  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Reload entries when parent signals a change via refreshKey
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      loadEntries(true); // background refresh — no loading spinner
    }
  }, [refreshKey, loadEntries]);

  // Apply optimistic updates from parent without a full reload
  useEffect(() => {
    if (!lastOptimistic) return;
    const { stopped, active } = lastOptimistic;
    setEntries(prev => {
      let updated = prev;
      if (stopped) {
        updated = updated.map(e => e.id === stopped.id ? stopped : e);
      }
      if (active) {
        if (!updated.some(e => e.id === active.id)) {
          updated = [active, ...updated];
        }
      }
      return updated;
    });
  }, [lastOptimistic]);

  // Reload entries when onEntryChange is triggered externally
  const handleEntryChangeInternal = useCallback(async () => {
    await loadEntries();
    onEntryChange();
  }, [loadEntries, onEntryChange]);

  // Detect back-to-back entries that can be merged (same category + note, consecutive)
  const mergeCandidates = useMemo((): MergeCandidate[] => {
    const candidates: MergeCandidate[] = [];
    // Sort by start time ascending to find consecutive entries
    // Type guard ensures end_time is defined for all entries in sorted array
    const sorted = [...entries]
      .filter((e): e is TimeEntry & { end_time: string } => e.end_time !== null)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    let i = 0;
    while (i < sorted.length) {
      const current = sorted[i];
      const group: (TimeEntry & { end_time: string })[] = [current];

      // Look for consecutive entries with same category and task name
      let j = i + 1;
      while (j < sorted.length) {
        const next = sorted[j];
        const prev = group[group.length - 1];

        // Check if same category and task_name
        if (next.category_id !== current.category_id || next.task_name !== current.task_name) break;

        // Check if back-to-back (within 1 minute gap)
        const prevEnd = new Date(prev.end_time).getTime();
        const nextStart = new Date(next.start_time).getTime();
        const gapMs = nextStart - prevEnd;

        if (gapMs < 0 || gapMs > 60000) break; // More than 1 minute gap

        group.push(next);
        j++;
      }

      if (group.length > 1) {
        const key = group.map(e => e.id).sort((a, b) => a - b).join('-');
        if (!dismissedMerges.has(key)) {
          candidates.push({
            entries: group,
            categoryName: current.category_name,
            description: current.task_name
          });
        }
      }

      i = j > i + 1 ? j : i + 1;
    }

    return candidates;
  }, [entries, dismissedMerges]);

  // Detect entries less than 1 minute
  const shortEntries = useMemo((): ShortEntry[] => {
    return entries
      .filter(e => {
        if (!e.end_time || dismissedShortEntries.has(e.id)) return false;
        const start = new Date(e.start_time).getTime();
        const end = new Date(e.end_time).getTime();
        const durationMs = end - start;
        return durationMs < 60000 && durationMs >= 0;
      })
      .map(e => ({
        entry: e,
        durationSeconds: e.end_time
          ? Math.round((new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 1000)
          : 0
      }));
  }, [entries, dismissedShortEntries]);

  const hasCleanupSuggestions = mergeCandidates.length > 0 || shortEntries.length > 0;

  // Check for overlaps with other entries (with 1-minute tolerance for back-to-back meetings)
  const checkOverlap = (entryId: number, start: Date, end: Date | null): TimeEntry | null => {
    if (!end) return null;

    const ONE_MINUTE_MS = 60 * 1000;

    for (const entry of entries) {
      if (entry.id === entryId) continue;

      const entryStart = new Date(entry.start_time);
      const entryEnd = entry.end_time ? new Date(entry.end_time) : new Date();

      // Check if ranges overlap
      if (start < entryEnd && end > entryStart) {
        // Calculate the actual overlap duration
        const overlapStart = Math.max(start.getTime(), entryStart.getTime());
        const overlapEnd = Math.min(end.getTime(), entryEnd.getTime());
        const overlapMs = overlapEnd - overlapStart;

        // Ignore overlaps of 1 minute or less (tolerance for back-to-back meetings)
        if (overlapMs <= ONE_MINUTE_MS) {
          continue;
        }

        return entry;
      }
    }
    return null;
  };

  // Get overlaps for display
  const overlaps = useMemo(() => {
    const result: { [id: number]: TimeEntry } = {};
    for (const entry of entries) {
      if (!entry.end_time) continue;
      const start = new Date(entry.start_time);
      const end = new Date(entry.end_time);
      const overlap = checkOverlap(entry.id, start, end);
      if (overlap) {
        result[entry.id] = overlap;
      }
    }
    return result;
  }, [entries]);

  // Detect entries with invalid time ranges (start >= end)
  const invalidTimeRanges = useMemo(() => {
    const result = new Set<number>();
    for (const entry of entries) {
      if (entry.end_time && new Date(entry.start_time) >= new Date(entry.end_time)) {
        result.add(entry.id);
      }
    }
    return result;
  }, [entries]);

  // Filter entries based on search, category, and date range
  // Note: Primary filtering is now done server-side, but we keep client-side date filtering
  // for accurate display grouping based on local timezone
  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      // Date range filter (client-side for accurate local timezone handling)
      const entryDate = new Date(entry.start_time);
      if (dateFrom) {
        // Parse YYYY-MM-DD as local date by splitting and using Date constructor
        const [year, month, day] = dateFrom.split('-').map(Number);
        const fromDate = new Date(year, month - 1, day, 0, 0, 0, 0);
        if (entryDate < fromDate) return false;
      }
      if (dateTo) {
        const [year, month, day] = dateTo.split('-').map(Number);
        const toDate = new Date(year, month - 1, day, 23, 59, 59, 999);
        if (entryDate > toDate) return false;
      }

      return true;
    });
  }, [entries, dateFrom, dateTo]);

  const hasActiveFilters = searchQuery || categoryFilter !== 'all' || dateFrom || dateTo;

  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setDateFrom('');
    setDateTo('');
    setActivePreset(null);
  };

  const applyDatePreset = (preset: 'today' | 'week' | 'month' | 'all') => {
    const today = new Date();
    // Format as YYYY-MM-DD in local timezone
    const formatDateLocal = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
      setActivePreset('all');
      return;
    }

    let fromDate: Date;

    if (preset === 'today') {
      fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    } else if (preset === 'week') {
      const dayOfWeek = today.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as start of week
      fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff);
    } else { // month
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    setDateFrom(formatDateLocal(fromDate));
    setDateTo(formatDateLocal(today));
    setActivePreset(preset);
  };

  const handleSelect = (id: number) => {
    // Don't clear editing state when clicking within the same entry being edited.
    // On PC, clicks on padding/whitespace inside entry-item bubble up here
    // and would close the editor unexpectedly.
    if (editingId !== null && editingId === id) {
      setSelected(id);
      return;
    }
    if (editingId !== null) {
      setEditingId(null);
      setEditField(null);
      editingIdRef.current = null;
      editFieldRef.current = null;
    }
    setSelected(id);
  };

  const startEdit = (entry: TimeEntry, field: EditField) => {
    cancelledRef.current = false;
    setEditingId(entry.id);
    setEditField(field);
    editingIdRef.current = entry.id;
    editFieldRef.current = field;
    setEditCategory(entry.category_id ?? categories[0]?.id ?? 0);
    setEditDescription(entry.task_name || '');
    // Split date/time for time-first editing
    setEditStartDate(formatDateOnly(entry.start_time));
    setEditStartTimeOnly(formatTimeOnly(entry.start_time));
    if (entry.end_time) {
      setEditEndDate(formatDateOnly(entry.end_time));
      setEditEndTimeOnly(formatTimeOnly(entry.end_time));
    } else {
      setEditEndDate('');
      setEditEndTimeOnly('');
    }
    setEditTimeError(null);
    // On mobile, use a modal for time editing instead of inline
    if (isMobileRef.current && (field === 'startTime' || field === 'endTime')) {
      setShowTimeEditModal(true);
    }
  };

  const openManualEntry = () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    setManualStartDate(formatDateOnly(oneHourAgo.toISOString()));
    setManualStartTime(formatTimeOnly(oneHourAgo.toISOString()));
    setManualEndDate(formatDateOnly(now.toISOString()));
    setManualEndTime(formatTimeOnly(now.toISOString()));
    setManualCategory('');
    setManualDescription('');
    setManualError('');
    setShowManualSuggestions(false);
    setSelectedSuggestionIndex(-1);
    setEndDateManuallySet(false);
    setShowManualEntry(true);
  };

  // Open manual entry with pre-filled break time range
  const openBreakEntry = (breakStart: string, breakEnd: string) => {
    setManualStartDate(formatDateOnly(breakStart));
    setManualStartTime(formatTimeOnly(breakStart));
    setManualEndDate(formatDateOnly(breakEnd));
    setManualEndTime(formatTimeOnly(breakEnd));
    setManualCategory('');
    setManualDescription('');
    setManualError('');
    setShowManualSuggestions(false);
    setSelectedSuggestionIndex(-1);
    setEndDateManuallySet(true); // Prevent auto-sync since we're setting both
    setShowManualEntry(true);
  };

  const closeManualEntry = () => {
    setShowManualEntry(false);
    setManualError('');
    setShowManualSuggestions(false);
    setSelectedSuggestionIndex(-1);
    // Reset inline category creation state
    setShowManualNewCategory(false);
    setManualNewCategoryName('');
    setManualNewCategoryColor('#6366f1');
  };

  // Handler for creating category in manual entry context
  const handleCreateManualCategory = async () => {
    if (!manualNewCategoryName.trim()) return;
    try {
      const category = await api.createCategory(manualNewCategoryName.trim(), manualNewCategoryColor);
      // Auto-select the newly created category
      setManualCategory(category.id);
      // Reset inline category creation state
      setManualNewCategoryName('');
      setManualNewCategoryColor('#6366f1');
      setShowManualNewCategory(false);
      // Notify parent to refresh categories
      onCategoryChange();
    } catch (error) {
      console.error('Failed to create category:', error);
    }
  };

  // Handler for start date change - auto-syncs end date if not manually edited
  const handleStartDateChange = (newStartDate: string) => {
    setManualStartDate(newStartDate);

    // Auto-set end date if not manually edited (preserves end time value)
    if (!endDateManuallySet) {
      setManualEndDate(newStartDate);
    }
  };

  // Handler for end date change - marks as manually set
  const handleEndDateChange = (newEndDate: string) => {
    setManualEndDate(newEndDate);
    setEndDateManuallySet(true);
  };

  // Adjust date when time crosses the midnight boundary.
  // Detects when the user scrolls/changes time across midnight:
  //   e.g. 11:55 PM (23:55) -> 12:05 AM (00:05) means next day
  //   e.g. 12:05 AM (00:05) -> 11:55 PM (23:55) means previous day
  // Uses local date arithmetic to avoid UTC conversion bugs across timezones.
  const adjustDateForMidnightCrossing = (oldTime: string, newTime: string, currentDate: string): string => {
    if (!oldTime || !newTime || !currentDate) return currentDate;
    const oldHour = parseInt(oldTime.split(':')[0], 10);
    const newHour = parseInt(newTime.split(':')[0], 10);
    const hourDiff = newHour - oldHour;
    const [year, month, day] = currentDate.split('-').map(Number);
    // Large backward jump (e.g. 23->0, 22->1) means crossed midnight forward
    if (hourDiff < -12) {
      const d = new Date(year, month - 1, day + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    // Large forward jump (e.g. 0->23, 1->22) means crossed midnight backward
    if (hourDiff > 12) {
      const d = new Date(year, month - 1, day - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return currentDate;
  };

  // Handler for start time change - auto-adjusts date on midnight crossing
  const handleStartTimeChange = (newTime: string) => {
    const newStartDate = adjustDateForMidnightCrossing(manualStartTime, newTime, manualStartDate);
    setManualStartTime(newTime);
    if (newStartDate !== manualStartDate) {
      setManualStartDate(newStartDate);
      // Also sync end date if it hasn't been manually set
      if (!endDateManuallySet) {
        setManualEndDate(newStartDate);
      }
    }
  };

  // Handler for end time change - auto-adjusts date on midnight crossing
  const handleEndTimeChange = (newTime: string) => {
    const newEndDate = adjustDateForMidnightCrossing(manualEndTime, newTime, manualEndDate);
    setManualEndTime(newTime);
    if (newEndDate !== manualEndDate) {
      setManualEndDate(newEndDate);
    }
  };

  // Inline/modal edit: handlers for split time/date with midnight crossing
  const handleEditStartTimeOnlyChange = (newTime: string) => {
    const adjusted = adjustDateForMidnightCrossing(editStartTimeOnly, newTime, editStartDate);
    setEditStartTimeOnly(newTime);
    if (adjusted !== editStartDate) setEditStartDate(adjusted);
    setEditTimeError(null);
  };
  const handleEditStartDateChange = (newDate: string) => {
    setEditStartDate(newDate);
    setEditTimeError(null);
  };
  const handleEditEndTimeOnlyChange = (newTime: string) => {
    const adjusted = adjustDateForMidnightCrossing(editEndTimeOnly, newTime, editEndDate);
    setEditEndTimeOnly(newTime);
    if (adjusted !== editEndDate) setEditEndDate(adjusted);
    setEditTimeError(null);
  };
  const handleEditEndDateChange = (newDate: string) => {
    setEditEndDate(newDate);
    setEditTimeError(null);
  };

  const handleManualSuggestionSelect = (suggestion: { task_name: string; categoryId: number }) => {
    setManualDescription(suggestion.task_name);
    // Auto-select category based on suggestion's past history
    if (!manualCategory || manualCategory !== suggestion.categoryId) {
      setManualCategory(suggestion.categoryId);
    }
    setShowManualSuggestions(false);
    setSelectedSuggestionIndex(-1);
    // Suppress the onFocus handler from reopening suggestions after selection
    justSelectedSuggestionRef.current = true;
    manualDescriptionRef.current?.focus();
  };

  const handleManualDescriptionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showManualSuggestions || manualSuggestions.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev =>
          prev < manualSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        if (selectedSuggestionIndex >= 0) {
          e.preventDefault();
          handleManualSuggestionSelect(manualSuggestions[selectedSuggestionIndex]);
        }
        break;
      case 'Escape':
        setShowManualSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  };

  const handleManualSubmit = async () => {
    if (!manualCategory) {
      setManualError('Please select a category');
      return;
    }
    if (!manualStartDate || !manualStartTime || !manualEndDate || !manualEndTime) {
      setManualError('Please set start and end date/time');
      return;
    }
    const start = combineDateAndTime(manualStartDate, manualStartTime);
    const end = combineDateAndTime(manualEndDate, manualEndTime);
    if (end <= start) {
      setManualError('End time must be after start time');
      return;
    }
    setIsSubmitting(true);
    setManualError('');
    try {
      await api.createManualEntry(manualCategory as number, start.toISOString(), end.toISOString(), manualDescription || undefined);
      closeManualEntry();
      handleEntryChangeInternal();
    } catch (error) {
      setManualError('Failed to create entry. Please try again.');
      console.error('Failed to create manual entry:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSave = async (entryId: number) => {
    // If the user pressed Escape to cancel, skip the save
    if (cancelledRef.current) return;
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    // Reconstruct datetimes from split date/time state
    const newStart = editField === 'startTime'
      ? combineDateAndTime(editStartDate, editStartTimeOnly).toISOString()
      : entry.start_time;
    const newEnd = editField === 'endTime'
      ? (editEndDate && editEndTimeOnly ? combineDateAndTime(editEndDate, editEndTimeOnly).toISOString() : null)
      : entry.end_time;

    // Validate time range only when editing time fields — not for description/category edits
    if ((editField === 'startTime' || editField === 'endTime') && newEnd && new Date(newStart) >= new Date(newEnd)) {
      setEditTimeError('Start must be before end');
      return;
    }

    setEditTimeError(null);

    try {
      const saved = await api.updateEntry(entryId, {
        category_id: editCategory,
        task_name: editDescription || null,
        start_time: newStart,
        end_time: newEnd
      });
      // Update local state to avoid a full reload
      const category = categories.find(c => c.id === editCategory) || null;
      const optimistic: TimeEntry = {
        ...entry,
        ...saved,
        category_name: category ? category.name : entry.category_name,
        category_color: category ? category.color : entry.category_color,
      };
      // Recalculate duration_minutes if end_time present
      if (optimistic.end_time) {
        const durMs = new Date(optimistic.end_time).getTime() - new Date(optimistic.start_time).getTime();
        optimistic.duration_minutes = Math.max(0, Math.round(durMs / 60000));
      }
      setEntries(prev => prev.map(e => e.id === entryId ? optimistic : e));
      setEditingId(null);
      setEditField(null);
      editingIdRef.current = null;
      editFieldRef.current = null;
      // Notify parent with optimistic data so it doesn't do a full refetch
      // (a bare onEntryChange() fires 2-5 extra API requests per save).
      if (activeEntry && activeEntry.id === entryId) {
        onEntryChange({ active: optimistic });
      } else {
        onEntryChange({ stopped: optimistic });
      }
    } catch (error) {
      console.error('Failed to update entry:', error);
    }
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    setEditingId(null);
    setEditField(null);
    editingIdRef.current = null;
    editFieldRef.current = null;
    setShowNewCategory(false);
    setNewCategoryName('');
    setNewCategoryColor('#6366f1');
    setEditTimeError(null);
  };

  // Deferred blur handler: gives click/touch events on sibling edit buttons
  // time to fire startEdit before we save and clear the editing state.
  // Used by ALL inline edit fields (category, description, time) so that
  // clicking between fields or onto the Save/Cancel buttons doesn't
  // prematurely close the editor on desktop (PC).
  const handleDeferredBlur = (entryId: number, field: EditField, e?: React.FocusEvent) => {
    // If focus is moving to another element inside the same inline-edit form
    // (e.g. clicking the date input after the time input), don't save.
    // relatedTarget is the element *receiving* focus — available immediately,
    // unlike document.activeElement which may not have updated yet.
    const target = e?.relatedTarget as HTMLElement | null;
    if (target?.closest('.inline-edit-time-form')) {
      return;
    }
    const snapshotField = field;
    const snapshotId = entryId;
    setTimeout(() => {
      // If the user pressed Escape, don't save
      if (cancelledRef.current) {
        cancelledRef.current = false;
        return;
      }
      // If the user tapped another editable field, startEdit already ran
      // and changed the refs — bail out so we don't clobber the new edit.
      if (editFieldRef.current !== snapshotField || editingIdRef.current !== snapshotId) return;
      handleSave(entryId);
    }, 150);
  };

  // Legacy alias — time inputs used to have a separate handler
  const handleTimeBlur = handleDeferredBlur;

  // Save handler for the mobile time-edit modal — saves both start and end.
  const handleTimeModalSave = async () => {
    if (!editingId) return;
    const entry = entries.find(e => e.id === editingId);
    if (!entry) return;

    const newStart = combineDateAndTime(editStartDate, editStartTimeOnly).toISOString();
    const newEnd = editEndDate && editEndTimeOnly
      ? combineDateAndTime(editEndDate, editEndTimeOnly).toISOString()
      : entry.end_time;

    // Validate: start must be before end
    if (newEnd && new Date(newStart) >= new Date(newEnd)) {
      setEditTimeError('Start must be before end');
      return;
    }

    setEditTimeError(null);

    try {
      const saved = await api.updateEntry(editingId, {
        category_id: editCategory,
        task_name: editDescription || null,
        start_time: newStart,
        end_time: newEnd
      });
      const category = categories.find(c => c.id === editCategory) || null;
      const optimistic: TimeEntry = {
        ...entry,
        ...saved,
        category_name: category ? category.name : entry.category_name,
        category_color: category ? category.color : entry.category_color,
      };
      if (optimistic.end_time) {
        const durMs = new Date(optimistic.end_time).getTime() - new Date(optimistic.start_time).getTime();
        optimistic.duration_minutes = Math.max(0, Math.round(durMs / 60000));
      }
      setEntries(prev => prev.map(e => e.id === editingId ? optimistic : e));
      handleTimeModalClose();
      if (activeEntry && activeEntry.id === editingId) {
        onEntryChange({ active: optimistic });
      } else {
        onEntryChange({ stopped: optimistic });
      }
    } catch (error) {
      console.error('Failed to update entry:', error);
    }
  };

  const handleTimeModalClose = () => {
    setShowTimeEditModal(false);
    setEditingId(null);
    setEditField(null);
    editingIdRef.current = null;
    editFieldRef.current = null;
    setEditTimeError(null);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    setCreatingCategory(true);
    try {
      const newCategory = await api.createCategory(newCategoryName.trim(), newCategoryColor);
      setEditCategory(newCategory.id);
      setShowNewCategory(false);
      setNewCategoryName('');
      setNewCategoryColor('#6366f1');
      onCategoryChange();
    } catch (error) {
      console.error('Failed to create category:', error);
    }
    setCreatingCategory(false);
  };

  const handleCategorySelectChange = (e: React.ChangeEvent<HTMLSelectElement>, _entryId: number) => {
    const value = e.target.value;
    if (value === 'new') {
      setShowNewCategory(true);
    } else {
      setEditCategory(Number(value));
      setShowNewCategory(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, entryId: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleSave(entryId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  // Handle form submission for time inputs (Enter key may not work consistently on datetime-local)
  const handleTimeInputSubmit = (e: React.FormEvent, entryId: number) => {
    e.preventDefault();
    handleSave(entryId);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this time entry?')) return;
    try {
      await api.deleteEntry(id);
      handleEntryChangeInternal();
    } catch (error) {
      console.error('Failed to delete entry:', error);
    }
  };

  const handleResume = async (entry: TimeEntry) => {
    try {
      await api.updateEntry(entry.id, { end_time: null } as Partial<TimeEntry>);
      onEntryChange({ active: { ...entry, end_time: null, duration_minutes: null } as unknown as TimeEntry });
      loadEntries();
    } catch (error) {
      console.error('Failed to resume entry:', error);
    }
  };

  const handleRestart = async (entry: TimeEntry) => {
    try {
      const newEntry = await api.startEntry(entry.category_id, entry.task_name || undefined);
      onEntryChange({ active: newEntry });
      loadEntries();
    } catch (error) {
      console.error('Failed to restart entry:', error);
    }
  };

  // Swipe-to-reveal touch handlers for mobile
  const handleTouchStart = useCallback((entryId: number, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, id: entryId };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const entryId = touchStartRef.current.id;
    touchStartRef.current = null;

    // Only register horizontal swipes (not vertical scrolls)
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;

    if (dx < 0) {
      // Swipe left → reveal actions
      setSwipedEntryId(entryId);
    } else {
      // Swipe right → hide actions
      setSwipedEntryId(null);
    }
  }, []);

  const handleMergeEntries = async (candidate: MergeCandidate) => {
    const sorted = [...candidate.entries].sort((a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    try {
      // Update the first entry to span the entire range
      await api.updateEntry(first.id, {
        category_id: first.category_id,
        task_name: first.task_name,
        start_time: first.start_time,
        end_time: last.end_time
      });

      // Delete the other entries
      for (let i = 1; i < sorted.length; i++) {
        await api.deleteEntry(sorted[i].id);
      }

      handleEntryChangeInternal();
    } catch (error) {
      console.error('Failed to merge entries:', error);
    }
  };

  const handleDismissMerge = (candidate: MergeCandidate) => {
    const key = candidate.entries.map(e => e.id).sort((a, b) => a - b).join('-');
    setDismissedMerges(prev => new Set([...prev, key]));
  };

  const handleDeleteShortEntry = async (entry: TimeEntry) => {
    try {
      await api.deleteEntry(entry.id);
      handleEntryChangeInternal();
    } catch (error) {
      console.error('Failed to delete entry:', error);
    }
  };

  const handleDismissShortEntry = (entryId: number) => {
    setDismissedShortEntries(prev => new Set([...prev, entryId]));
  };

  const handleDeleteDay = async (dateKey: string) => {
    const date = new Date(dateKey);
    const dateStr = date.toISOString().split('T')[0];
    const dayEntries = grouped[dateKey] || [];
    const totalCount = dayEntries.length;
    const hasActive = dayEntries.some(e => !e.end_time);

    if (totalCount === 0) {
      alert('No entries to delete for this day.');
      return;
    }

    const activeNote = hasActive ? ' (including running timer)' : '';
    if (!confirm(`Delete all ${totalCount} ${totalCount === 1 ? 'entry' : 'entries'} for ${formatDate(dayEntries[0].start_time)}${activeNote}?`)) {
      return;
    }

    try {
      await api.deleteEntriesByDate(dateStr);
      if (hasActive) {
        onEntryChange({ active: null });
      }
      handleEntryChangeInternal();
    } catch (error) {
      console.error('Failed to delete entries:', error);
      alert('Failed to delete entries. Please try again.');
    }
  };

  const handleApplyAll = async () => {
    // Merge all candidates first
    for (const candidate of mergeCandidates) {
      await handleMergeEntries(candidate);
    }
    // Then delete all short entries
    for (const { entry } of shortEntries) {
      try {
        await api.deleteEntry(entry.id);
      } catch (error) {
        console.error('Failed to delete entry:', error);
      }
    }
    handleEntryChangeInternal();
  };

  const getTotalMinutes = () => {
    return filteredEntries.reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0);
  };

  // Find the most recently completed entry (latest end_time) for resume vs restart logic
  const mostRecentCompletedId = useMemo(() => {
    const completed = filteredEntries.filter((e): e is TimeEntry & { end_time: string } => !!e.end_time);
    if (completed.length === 0) return null;
    return completed.reduce((latest, e) =>
      new Date(e.end_time).getTime() > new Date(latest.end_time).getTime() ? e : latest
    ).id;
  }, [filteredEntries]);

  const groupByDate = () => {
    const groups: { [key: string]: TimeEntry[] } = {};
    filteredEntries.forEach(entry => {
      const date = new Date(entry.start_time).toDateString();
      if (!groups[date]) groups[date] = [];
      groups[date].push(entry);
    });
    return groups;
  };

  const grouped = groupByDate();
  const totalMinutes = getTotalMinutes();

  return (
    <div className="time-entry-list card">
      <div className="card-header">
        <h2 className="card-title">History</h2>
        <div className="header-actions">
          <button className="btn btn-primary btn-sm" onClick={openManualEntry}>+ Add Entry</button>
          <button
            className={`btn-icon filter-toggle ${showFilters ? 'active' : ''} ${hasActiveFilters ? 'has-filters' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            title="Toggle filters"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M4 8h8M6 12h4" strokeLinecap="round"/>
            </svg>
            {hasActiveFilters && <span className="filter-badge" />}
          </button>
          <div className="total-badge">
            {formatDuration(totalMinutes)}
            {hasActiveFilters && entries.length !== filteredEntries.length && (
              <span className="filtered-count"> ({filteredEntries.length}/{entries.length})</span>
            )}
          </div>
        </div>
      </div>

      {showManualEntry && (
        <div className="manual-entry-overlay" onClick={closeManualEntry}>
          <div className="manual-entry-modal" onClick={e => e.stopPropagation()}>
            <div className="manual-entry-header">
              <h3>Add Past Entry</h3>
              <button className="btn-icon" onClick={closeManualEntry}>×</button>
            </div>
            <div className="manual-entry-form">
              <div className="form-group">
                <label>Category</label>
                <select
                  value={manualCategory}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'new') {
                      setShowManualNewCategory(true);
                    } else {
                      setManualCategory(val ? Number(val) : '');
                      setShowManualNewCategory(false);
                    }
                  }}
                >
                  <option value="">Select category...</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                  <option value="new">+ Add category</option>
                </select>
              </div>

              {/* Inline category creation form */}
              {showManualNewCategory && (
                <div className="new-category-form animate-slide-in">
                  <input
                    type="text"
                    value={manualNewCategoryName}
                    onChange={(e) => setManualNewCategoryName(e.target.value)}
                    placeholder="Category name"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateManualCategory();
                      if (e.key === 'Escape') {
                        setShowManualNewCategory(false);
                        setManualNewCategoryName('');
                        setManualNewCategoryColor('#6366f1');
                      }
                    }}
                  />
                  <input
                    type="color"
                    value={manualNewCategoryColor}
                    onChange={(e) => setManualNewCategoryColor(e.target.value)}
                    className="color-picker"
                  />
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setShowManualNewCategory(false);
                      setManualNewCategoryName('');
                      setManualNewCategoryColor('#6366f1');
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleCreateManualCategory}
                    disabled={!manualNewCategoryName.trim()}
                  >
                    Create
                  </button>
                </div>
              )}
              <div className="form-group">
                <label>Task <span className="optional">(optional)</span></label>
                <div className="description-input-wrapper">
                  <input
                    ref={manualDescriptionRef}
                    type="text"
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    onFocus={() => {
                      if (justSelectedSuggestionRef.current) {
                        justSelectedSuggestionRef.current = false;
                        return;
                      }
                      if (manualSuggestions.length > 0) setShowManualSuggestions(true);
                    }}
                    onKeyDown={handleManualDescriptionKeyDown}
                    placeholder="What were you working on?"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore
                    data-form-type="other"
                  />
                  {showManualSuggestions && manualSuggestions.length > 0 && (
                    <div className="description-suggestions" ref={suggestionsRef}>
                      {manualSuggestions.map((suggestion, idx) => {
                        const cat = categories.find(c => c.id === suggestion.categoryId);
                        return (
                          <button
                            key={`${suggestion.categoryId}-${suggestion.task_name}`}
                            className={`suggestion-item ${idx === selectedSuggestionIndex ? 'selected' : ''}`}
                            onClick={() => handleManualSuggestionSelect(suggestion)}
                            onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                            type="button"
                          >
                            <span className="suggestion-text">{suggestion.task_name}</span>
                            <span className="suggestion-meta">
                              <span
                                className="category-dot"
                                style={{ backgroundColor: cat?.color || '#6366f1' }}
                              />
                              <span className="suggestion-category">{cat?.name || 'Unknown'}</span>
                              <span className="suggestion-count">×{suggestion.count}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="form-row-datetime">
                <div className="form-group">
                  <label>Start Time</label>
                  <input type="time" value={manualStartTime} onChange={(e) => handleStartTimeChange(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" value={manualStartDate} onChange={(e) => handleStartDateChange(e.target.value)} />
                </div>
              </div>
              <div className="form-row-datetime">
                <div className="form-group">
                  <label>End Time</label>
                  <input type="time" value={manualEndTime} onChange={(e) => handleEndTimeChange(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input type="date" value={manualEndDate} onChange={(e) => handleEndDateChange(e.target.value)} />
                </div>
              </div>
              {manualError && <div className="manual-entry-error">{manualError}</div>}
              <div className="manual-entry-actions">
                <button className="btn btn-ghost" onClick={closeManualEntry}>Cancel</button>
                <button className="btn btn-primary" onClick={handleManualSubmit} disabled={isSubmitting}>
                  {isSubmitting ? 'Adding...' : 'Add Entry'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFilters && (
        <div className="filters-panel">
          <div className="date-presets">
            <button
              className={`preset-btn ${activePreset === 'today' ? 'active' : ''}`}
              onClick={() => applyDatePreset('today')}
            >
              Today
            </button>
            <button
              className={`preset-btn ${activePreset === 'week' ? 'active' : ''}`}
              onClick={() => applyDatePreset('week')}
            >
              This Week
            </button>
            <button
              className={`preset-btn ${activePreset === 'month' ? 'active' : ''}`}
              onClick={() => applyDatePreset('month')}
            >
              This Month
            </button>
            <button
              className={`preset-btn ${activePreset === 'all' ? 'active' : ''}`}
              onClick={() => applyDatePreset('all')}
            >
              All Time
            </button>
          </div>
          <div className="filter-row">
            <div className="filter-group search-group">
              <input
                type="text"
                className="filter-input search-input"
                placeholder="Search tasks & categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="clear-search" onClick={() => setSearchQuery('')}>×</button>
              )}
            </div>
            <div className="filter-group">
              <select
                className="filter-select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              >
                <option value="all">All categories</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="filter-row">
            <div className="filter-group date-group">
              <label className="filter-label">From</label>
              <input
                type="date"
                className="filter-input date-input"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setActivePreset(null); }}
              />
            </div>
            <div className="filter-group date-group">
              <label className="filter-label">To</label>
              <input
                type="date"
                className="filter-input date-input"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setActivePreset(null); }}
              />
            </div>
            {hasActiveFilters && (
              <button className="btn-text clear-filters" onClick={clearFilters}>
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* Cleanup suggestions banner */}
      {showCleanupBanner && hasCleanupSuggestions && (
        <div className="cleanup-banner">
          <div className="cleanup-header">
            <span className="cleanup-icon">🧹</span>
            <span className="cleanup-title">Cleanup Suggestions</span>
            <button className="btn btn-sm btn-primary cleanup-apply-all" onClick={handleApplyAll}>
              Apply All
            </button>
            <button className="btn-icon cleanup-close" onClick={() => setShowCleanupBanner(false)}>×</button>
          </div>

          {mergeCandidates.map((candidate, idx) => {
            const totalMinutes = candidate.entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
            return (
              <div key={idx} className="cleanup-item">
                <div className="cleanup-item-info">
                  <span className="cleanup-item-icon">🔗</span>
                  <span className="cleanup-item-text">
                    Merge {candidate.entries.length} consecutive "{candidate.categoryName}" entries
                    {candidate.description && <span className="cleanup-description"> ({candidate.description})</span>}
                    <span className="cleanup-duration"> — {formatDuration(totalMinutes)} total</span>
                  </span>
                </div>
                <div className="cleanup-item-actions">
                  <button className="btn btn-sm btn-primary" onClick={() => handleMergeEntries(candidate)}>Merge</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => handleDismissMerge(candidate)}>Dismiss</button>
                </div>
              </div>
            );
          })}

          {shortEntries.map(({ entry, durationSeconds }) => (
            <div key={entry.id} className="cleanup-item">
              <div className="cleanup-item-info">
                <span className="cleanup-item-icon">⏱️</span>
                <span className="cleanup-item-text">
                  Short entry: "{entry.category_name}"
                  {entry.task_name && <span className="cleanup-description"> ({entry.task_name})</span>}
                  <span className="cleanup-duration"> — {durationSeconds}s</span>
                </span>
              </div>
              <div className="cleanup-item-actions">
                <button className="btn btn-sm btn-danger" onClick={() => handleDeleteShortEntry(entry)}>Delete</button>
                <button className="btn btn-sm btn-ghost" onClick={() => handleDismissShortEntry(entry.id)}>Keep</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="empty-state">
          <div className="loading-spinner" />
          <p>Loading entries...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>No entries yet</p>
          <p className="empty-hint">Start tracking to build your history</p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <p>No matching entries</p>
          <p className="empty-hint">Try adjusting your filters</p>
          <button className="btn-text" onClick={clearFilters}>Clear filters</button>
        </div>
      ) : (
        <div className="entries-by-date">
          {Object.entries(grouped).map(([dateKey, dateEntries]) => (
            <div key={dateKey} className="date-group">
              <div className="date-header">
                <span>{formatDate(dateEntries[0].start_time)}</span>
                <button
                  className="btn-icon delete-day-btn"
                  onClick={() => handleDeleteDay(dateKey)}
                  title="Delete all entries for this day"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4M12.667 4v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
              <div className="entries">
                {dateEntries.map((entry, index) => {
                  const isEditing = editingId === entry.id;
                  const isSelected = selected === entry.id;
                  const hasOverlap = overlaps[entry.id];
                  const hasInvalidRange = invalidTimeRanges.has(entry.id);

                  // Calculate break from previous entry (entries are sorted by start_time desc)
                  // So "previous" in the list is actually the entry that started AFTER this one
                  const prevEntry = index > 0 ? dateEntries[index - 1] : null;
                  let breakMinutes = 0;
                  let breakStartTime = '';
                  let breakEndTime = '';
                  if (prevEntry && entry.end_time && prevEntry.start_time) {
                    const thisEnd = new Date(entry.end_time).getTime();
                    const prevStart = new Date(prevEntry.start_time).getTime();
                    breakMinutes = Math.round((prevStart - thisEnd) / 60000);
                    breakStartTime = entry.end_time;
                    breakEndTime = prevEntry.start_time;
                  }
                  const showBreak = breakMinutes > 5;

                  return (
                    <div key={entry.id}>
                      {showBreak && (
                        <button
                          className="break-indicator"
                          onClick={() => openBreakEntry(breakStartTime, breakEndTime)}
                          title="Click to add entry for this break"
                        >
                          <span className="break-line" />
                          <span className="break-text">{formatBreakDuration(breakMinutes)} break</span>
                          <span className="break-line" />
                        </button>
                      )}
                      <div
                        className={`entry-item ${isSelected ? 'selected' : ''} ${hasOverlap ? 'has-overlap' : ''} ${hasInvalidRange ? 'has-invalid-range' : ''} ${swipedEntryId === entry.id ? 'swiped' : ''}`}
                        onClick={() => { if (swipedEntryId === entry.id) { setSwipedEntryId(null); } else { handleSelect(entry.id); } }}
                        onTouchStart={(e) => handleTouchStart(entry.id, e)}
                        onTouchEnd={handleTouchEnd}
                      >

                      <div className="entry-content">
                        <div className="entry-main">
                          {isEditing && editField === 'category' ? (
                            showNewCategory ? (
                              <div className="inline-new-category" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  className="inline-edit-input"
                                  value={newCategoryName}
                                  onChange={(e) => setNewCategoryName(e.target.value)}
                                  placeholder="Category name"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreateCategory();
                                    if (e.key === 'Escape') { setShowNewCategory(false); setNewCategoryName(''); }
                                  }}
                                />
                                <input
                                  type="color"
                                  className="inline-color-picker"
                                  value={newCategoryColor}
                                  onChange={(e) => setNewCategoryColor(e.target.value)}
                                />
                                <button
                                  type="button"
                                  className="inline-edit-save-btn"
                                  onClick={handleCreateCategory}
                                  disabled={creatingCategory || !newCategoryName.trim()}
                                  title="Create"
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  className="inline-edit-cancel-btn"
                                  onClick={() => { setShowNewCategory(false); setNewCategoryName(''); }}
                                  title="Cancel"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <select
                                className="inline-edit-select"
                                value={editCategory}
                                onChange={(e) => handleCategorySelectChange(e, entry.id)}
                                onBlur={(e) => !showNewCategory && handleDeferredBlur(entry.id, 'category', e)}
                                onKeyDown={(e) => handleKeyDown(e, entry.id)}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              >
                                {categories.map(cat => (
                                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                                <option value="new">+ Add Category</option>
                              </select>
                            )
                          ) : (() => {
                            const colors = getAdaptiveCategoryColors(entry.category_color, isDarkMode);
                            return (
                              <span
                                className="entry-category category-badge editable"
                                style={{ backgroundColor: colors.bgColor, color: '#fff' }}
                                onClick={(e) => { e.stopPropagation(); startEdit(entry, 'category'); }}
                              >
                                <span className="category-dot" style={{ backgroundColor: colors.dotColor }} />
                                <span className="category-badge-text">{entry.category_name}</span>
                              </span>
                            );
                          })()}
                          {isEditing && editField === 'description' ? (
                            <input
                              type="text"
                              className="inline-edit-input"
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              onBlur={(e) => handleDeferredBlur(entry.id, 'description', e)}
                              onKeyDown={(e) => handleKeyDown(e, entry.id)}
                              placeholder="Add a task name..."
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span
                              className="entry-description editable"
                              onDoubleClick={(e) => { e.stopPropagation(); startEdit(entry, 'description'); }}
                            >
                              {entry.task_name || '—'}
                            </span>
                          )}
                        </div>
                        <div className="entry-meta">
                          {isEditing && editField === 'startTime' && !showTimeEditModal ? (
                            <form
                              className="inline-edit-time-form"
                              onSubmit={(e) => handleTimeInputSubmit(e, entry.id)}
                              onKeyDown={(e) => handleKeyDown(e, entry.id)}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="time"
                                className="inline-edit-time inline-edit-time-only"
                                value={editStartTimeOnly}
                                onChange={(e) => handleEditStartTimeOnlyChange(e.target.value)}
                                onBlur={(e) => handleTimeBlur(entry.id, 'startTime', e)}
                                autoFocus
                              />
                              <input
                                type="date"
                                className="inline-edit-time inline-edit-date"
                                value={editStartDate}
                                onChange={(e) => handleEditStartDateChange(e.target.value)}
                                onBlur={(e) => handleTimeBlur(entry.id, 'startTime', e)}
                              />
                              <button type="submit" className="inline-edit-save-btn" title="Save">✓</button>
                              <button type="button" className="inline-edit-cancel-btn" onClick={handleCancel} title="Cancel">✕</button>
                              {editTimeError && <span className="inline-edit-time-error">{editTimeError}</span>}
                            </form>
                          ) : (
                             <button
                              className="entry-time-btn editable"
                              onClick={(e) => { e.stopPropagation(); startEdit(entry, 'startTime'); }}
                              title="Tap to edit start time"
                            >
                              <span className="time-full">{formatTime(entry.start_time)}</span>
                              <span className="time-compact">{formatTimeCompact(entry.start_time)}</span>
                            </button>
                          )}
                          <span className="end-time-group">
                            <span className="time-separator">&nbsp;–&nbsp;</span>
                            {isEditing && editField === 'endTime' && !showTimeEditModal ? (
                              <form
                                className="inline-edit-time-form"
                                onSubmit={(e) => handleTimeInputSubmit(e, entry.id)}
                                onKeyDown={(e) => handleKeyDown(e, entry.id)}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="time"
                                  className="inline-edit-time inline-edit-time-only"
                                  value={editEndTimeOnly}
                                  onChange={(e) => handleEditEndTimeOnlyChange(e.target.value)}
                                  onBlur={(e) => handleTimeBlur(entry.id, 'endTime', e)}
                                  autoFocus
                                />
                                <input
                                  type="date"
                                  className="inline-edit-time inline-edit-date"
                                  value={editEndDate}
                                  onChange={(e) => handleEditEndDateChange(e.target.value)}
                                  onBlur={(e) => handleTimeBlur(entry.id, 'endTime', e)}
                                />
                                <button type="submit" className="inline-edit-save-btn" title="Save">✓</button>
                                <button type="button" className="inline-edit-cancel-btn" onClick={handleCancel} title="Cancel">✕</button>
                                {editTimeError && <span className="inline-edit-time-error">{editTimeError}</span>}
                              </form>
                            ) : (
                              <button
                                className={`entry-time-btn editable ${!entry.end_time ? 'active-time' : ''}`}
                              onClick={(e) => {
                                if (entry.end_time) {
                                  e.stopPropagation();
                                  startEdit(entry, 'endTime');
                                }
                              }}
                              disabled={!entry.end_time}
                              title={entry.end_time ? "Tap to edit end time" : "Currently tracking"}
                            >
                              {entry.end_time ? (
                                <>
                                  <span className="time-full">{formatTime(entry.end_time)}</span>
                                  <span className="time-compact">{formatTimeCompact(entry.end_time)}</span>
                                </>
                              ) : 'now'}
                            </button>
                          )}
                          </span>
                          <button
                            className={`entry-duration-btn ${!entry.end_time ? 'active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); startEdit(entry, 'startTime'); }}
                            title="Tap to edit times"
                          >
                            {formatDuration(entry.duration_minutes)}
                          </button>
                        </div>
                      </div>
                      {hasOverlap && (
                        <span className="overlap-warning" title={`Overlaps with: ${hasOverlap.category_name}`}>
                          ⚠️
                        </span>
                      )}
                      {hasInvalidRange && (
                        <span className="overlap-warning" title="Start time is after end time — click to fix">
                          ⛔
                        </span>
                      )}
                      {/* Desktop hover actions */}
                      {entry.end_time && (
                        <div className="entry-actions">
                          {entry.id === mostRecentCompletedId && !activeEntry ? (
                            <button
                              className="btn-icon resume-btn"
                              onClick={(e) => { e.stopPropagation(); handleResume(entry); }}
                              title="Resume"
                            >
                              ▶
                            </button>
                          ) : (
                            <button
                              className="btn-icon restart-btn"
                              onClick={(e) => { e.stopPropagation(); handleRestart(entry); }}
                              title="Start new"
                            >
                              ↻
                            </button>
                          )}
                          <button
                            className="btn-icon delete-btn"
                            onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                            title="Delete"
                          >
                            ×
                          </button>
                        </div>
                      )}
                      {!entry.end_time && (
                        <div className="entry-actions">
                          <span className="btn-icon" style={{ visibility: 'hidden' }}>↻</span>
                          <button
                            className="btn-icon delete-btn"
                            onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                            title="Delete"
                          >
                            ×
                          </button>
                        </div>
                      )}
                      {/* Mobile swipe actions */}
                      <div className="swipe-actions">
                        {entry.end_time && (
                          entry.id === mostRecentCompletedId && !activeEntry ? (
                            <button
                              className="swipe-action-btn resume"
                              onClick={(e) => { e.stopPropagation(); setSwipedEntryId(null); handleResume(entry); }}
                            >
                              ▶
                            </button>
                          ) : (
                            <button
                              className="swipe-action-btn restart"
                              onClick={(e) => { e.stopPropagation(); setSwipedEntryId(null); handleRestart(entry); }}
                            >
                              ↻
                            </button>
                          )
                        )}
                        <button
                          className="swipe-action-btn delete"
                          onClick={(e) => { e.stopPropagation(); setSwipedEntryId(null); handleDelete(entry.id); }}
                        >
                          ×
                        </button>
                      </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mobile time-edit modal */}
      {showTimeEditModal && editingId && (
        <div className="time-edit-overlay" onClick={handleTimeModalClose}>
          <div className="time-edit-modal" onClick={e => e.stopPropagation()}>
            <div className="time-edit-header">
              <h3>Edit Time</h3>
              <button className="btn-icon" onClick={handleTimeModalClose} title="Close">✕</button>
            </div>
            <div className="time-edit-body">
              <label className="time-edit-label">
                Start Time
                <input
                  type="time"
                  className="time-edit-input"
                  value={editStartTimeOnly}
                  onChange={(e) => {
                    if (e.target.value) handleEditStartTimeOnlyChange(e.target.value);
                  }}
                  autoFocus={editField === 'startTime'}
                />
              </label>
              <label className="time-edit-label">
                Start Date
                <input
                  type="date"
                  className="time-edit-input"
                  value={editStartDate}
                  onChange={(e) => {
                    if (e.target.value) handleEditStartDateChange(e.target.value);
                  }}
                />
              </label>
              {editEndTimeOnly !== '' && (
                <>
                  <label className="time-edit-label">
                    End Time
                    <input
                      type="time"
                      className="time-edit-input"
                      value={editEndTimeOnly}
                      onChange={(e) => {
                        if (e.target.value) handleEditEndTimeOnlyChange(e.target.value);
                      }}
                      autoFocus={editField === 'endTime'}
                    />
                  </label>
                  <label className="time-edit-label">
                    End Date
                    <input
                      type="date"
                      className="time-edit-input"
                      value={editEndDate}
                      onChange={(e) => {
                        if (e.target.value) handleEditEndDateChange(e.target.value);
                      }}
                    />
                  </label>
                </>
              )}
              {editTimeError && <div className="time-edit-error">{editTimeError}</div>}
            </div>
            <div className="time-edit-actions">
              <button className="btn btn-secondary" onClick={handleTimeModalClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleTimeModalSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
