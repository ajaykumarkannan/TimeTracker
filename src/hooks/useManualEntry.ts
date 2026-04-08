import { useState, useCallback } from 'react';
import { Category } from '../types';
import { api } from '../api';
import { formatDateOnly, formatTimeOnly, combineDateAndTime, adjustDateForMidnightCrossing } from '../utils/timeUtils';
import { useTaskSuggestions } from './useTaskSuggestions';

interface UseManualEntryParams {
  categories: Category[];
  onEntryChange: () => void;
  /** Number of entries — passed through to useTaskSuggestions for refetch triggers */
  entryCount: number;
}

export function useManualEntry({
  onEntryChange,
  entryCount,
}: UseManualEntryParams) {
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

  // Track if user has manually edited end date (for date defaulting feature)
  const [endDateManuallySet, setEndDateManuallySet] = useState(false);

  // Task name suggestions for manual entry
  const manualSuggestions = useTaskSuggestions({
    value: manualDescription,
    entryCount,
    tiebreaker: 'count',
    autoOpen: false,
  });

  const openManualEntry = useCallback(() => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    setManualStartDate(formatDateOnly(oneHourAgo.toISOString()));
    setManualStartTime(formatTimeOnly(oneHourAgo.toISOString()));
    setManualEndDate(formatDateOnly(now.toISOString()));
    setManualEndTime(formatTimeOnly(now.toISOString()));
    setManualCategory('');
    setManualDescription('');
    setManualError('');
    manualSuggestions.close();
    setEndDateManuallySet(false);
    setShowManualEntry(true);
  }, [manualSuggestions]);

  // Open manual entry with pre-filled break time range
  const openBreakEntry = useCallback((breakStart: string, breakEnd: string) => {
    setManualStartDate(formatDateOnly(breakStart));
    setManualStartTime(formatTimeOnly(breakStart));
    setManualEndDate(formatDateOnly(breakEnd));
    setManualEndTime(formatTimeOnly(breakEnd));
    setManualCategory('');
    setManualDescription('');
    setManualError('');
    manualSuggestions.close();
    setEndDateManuallySet(true); // Prevent auto-sync since we're setting both
    setShowManualEntry(true);
  }, [manualSuggestions]);

  const closeManualEntry = useCallback(() => {
    setShowManualEntry(false);
    setManualError('');
    manualSuggestions.close();
    setShowManualNewCategory(false);
  }, [manualSuggestions]);

  // Handler for start date change - auto-syncs end date if not manually edited
  const handleStartDateChange = useCallback((newStartDate: string) => {
    setManualStartDate(newStartDate);

    // Auto-set end date if not manually edited (preserves end time value)
    if (!endDateManuallySet) {
      setManualEndDate(newStartDate);
    }
  }, [endDateManuallySet]);

  // Handler for end date change - marks as manually set
  const handleEndDateChange = useCallback((newEndDate: string) => {
    setManualEndDate(newEndDate);
    setEndDateManuallySet(true);
  }, []);

  // Adjust date when time crosses the midnight boundary (manual entry forms).
  // Handler for start time change - auto-adjusts date on midnight crossing
  const handleStartTimeChange = useCallback((newTime: string) => {
    setManualStartTime(prev => {
      const newStartDate = adjustDateForMidnightCrossing(prev, newTime, manualStartDate);
      if (newStartDate !== manualStartDate) {
        setManualStartDate(newStartDate);
        // Also sync end date if it hasn't been manually set
        if (!endDateManuallySet) {
          setManualEndDate(newStartDate);
        }
      }
      return newTime;
    });
  }, [manualStartDate, endDateManuallySet]);

  // Handler for end time change - auto-adjusts date on midnight crossing
  const handleEndTimeChange = useCallback((newTime: string) => {
    setManualEndTime(prev => {
      const newEndDate = adjustDateForMidnightCrossing(prev, newTime, manualEndDate);
      if (newEndDate !== manualEndDate) {
        setManualEndDate(newEndDate);
      }
      return newTime;
    });
  }, [manualEndDate]);

  const handleManualSuggestionSelect = useCallback((suggestion: { task_name: string; categoryId: number }) => {
    setManualDescription(suggestion.task_name);
    // Auto-select category based on suggestion's past history
    setManualCategory(prev => {
      if (!prev || prev !== suggestion.categoryId) {
        return suggestion.categoryId;
      }
      return prev;
    });
    manualSuggestions.completeSelection();
  }, [manualSuggestions]);

  const handleManualSubmit = useCallback(async () => {
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
      onEntryChange();
    } catch (error) {
      setManualError('Failed to create entry. Please try again.');
      console.error('Failed to create manual entry:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [manualCategory, manualStartDate, manualStartTime, manualEndDate, manualEndTime, manualDescription, closeManualEntry, onEntryChange]);

  return {
    // State
    showManualEntry,
    manualCategory,
    setManualCategory,
    manualDescription,
    setManualDescription,
    manualStartDate,
    manualStartTime,
    manualEndDate,
    manualEndTime,
    manualError,
    isSubmitting,
    showManualNewCategory,
    setShowManualNewCategory,

    // Handlers
    openManualEntry,
    openBreakEntry,
    closeManualEntry,
    handleStartDateChange,
    handleEndDateChange,
    handleStartTimeChange,
    handleEndTimeChange,
    handleManualSubmit,
    handleManualSuggestionSelect,

    // Task suggestions (pass-through for JSX)
    manualSuggestions,
  };
}
