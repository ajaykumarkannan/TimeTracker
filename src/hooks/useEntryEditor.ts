import { useState, useRef, useCallback } from 'react';
import { TimeEntry, Category } from '../types';
import { api } from '../api';
import { formatDateOnly, formatTimeOnly, combineDateAndTime, adjustDateForMidnightCrossing } from '../utils/timeUtils';

export type EditField = 'category' | 'description' | 'startTime' | 'endTime' | null;

/** User-friendly error message for save failures */
export function saveErrorMessage(error: unknown): string {
  return error instanceof Error && error.name === 'RateLimitError'
    ? 'Rate limited — try again in a moment'
    : 'Failed to save — please try again';
}

interface UseEntryEditorParams {
  entries: TimeEntry[];
  categories: Category[];
  activeEntry: TimeEntry | null;
  onEntryChange: (optimistic?: { active?: TimeEntry | null; stopped?: TimeEntry }, options?: { skipListRefresh?: boolean }) => void;
  onCategoryChange: () => void;
  isMobileRef: React.RefObject<boolean>;
  /** Called to update the local entries array optimistically */
  setEntries: React.Dispatch<React.SetStateAction<TimeEntry[]>>;
  /** Called to close inline suggestions when editing ends */
  closeInlineSuggestions: () => void;
}

export function useEntryEditor({
  entries,
  categories,
  activeEntry,
  onEntryChange,
  isMobileRef,
  setEntries,
  closeInlineSuggestions,
}: UseEntryEditorParams) {
  // Editing state
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
  // Flag to suppress blur-save when Enter already triggered a save
  const enterSavingRef = useRef(false);
  // Refs that mirror editStartTimeOnly/editEndTimeOnly for synchronous reads in handleKeyDown/handleSave
  const editStartTimeOnlyRef = useRef<string>('');
  const editEndTimeOnlyRef = useRef<string>('');

  // Mobile time-edit modal state
  const [showTimeEditModal, setShowTimeEditModal] = useState(false);
  // Inline new category form state
  const [showNewCategory, setShowNewCategory] = useState(false);

  const startEdit = useCallback((entry: TimeEntry, field: EditField) => {
    cancelledRef.current = false;
    enterSavingRef.current = false;
    setEditingId(entry.id);
    setEditField(field);
    editingIdRef.current = entry.id;
    editFieldRef.current = field;
    setEditCategory(entry.category_id ?? categories[0]?.id ?? 0);
    setEditDescription(entry.task_name || '');
    // Split date/time for time-first editing; also initialize refs for synchronous reads
    setEditStartDate(formatDateOnly(entry.start_time));
    editStartTimeOnlyRef.current = formatTimeOnly(entry.start_time);
    setEditStartTimeOnly(formatTimeOnly(entry.start_time));
    if (entry.end_time) {
      setEditEndDate(formatDateOnly(entry.end_time));
      editEndTimeOnlyRef.current = formatTimeOnly(entry.end_time);
      setEditEndTimeOnly(formatTimeOnly(entry.end_time));
    } else {
      setEditEndDate('');
      editEndTimeOnlyRef.current = '';
      setEditEndTimeOnly('');
    }
    setEditTimeError(null);
    // On mobile, use a modal for time editing instead of inline
    if (isMobileRef.current && (field === 'startTime' || field === 'endTime')) {
      setShowTimeEditModal(true);
    }
  }, [categories, isMobileRef]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setEditingId(null);
    setEditField(null);
    editingIdRef.current = null;
    editFieldRef.current = null;
    setShowNewCategory(false);
    setEditTimeError(null);
    closeInlineSuggestions();
  }, [closeInlineSuggestions]);

  const handleSave = useCallback(async (entryId: number) => {
    // If the user pressed Escape to cancel, skip the save
    if (cancelledRef.current) return;
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    // Reconstruct datetimes from split date/time state; use refs for time values to get
    // the most recent value even if onChange hasn't fired yet (e.g. Enter before blur)
    const currentEditField = editFieldRef.current;
    const newStart = currentEditField === 'startTime'
      ? combineDateAndTime(editStartDate, editStartTimeOnlyRef.current).toISOString()
      : entry.start_time;
    const newEnd = currentEditField === 'endTime'
      ? (editEndDate && editEndTimeOnlyRef.current ? combineDateAndTime(editEndDate, editEndTimeOnlyRef.current).toISOString() : null)
      : entry.end_time;

    // Validate time range only when editing time fields — not for description/category edits
    if ((currentEditField === 'startTime' || currentEditField === 'endTime') && newEnd && new Date(newStart) >= new Date(newEnd)) {
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
      closeInlineSuggestions();
      // Notify parent with optimistic data so it doesn't do a full refetch
      // (a bare onEntryChange() fires 2-5 extra API requests per save).
      if (activeEntry && activeEntry.id === entryId) {
        onEntryChange({ active: optimistic });
      } else {
        onEntryChange({ stopped: optimistic });
      }
    } catch (error) {
      console.error('Failed to update entry:', error);
      // Show error inline so the user knows the save failed (don't close the editor)
      setEditTimeError(saveErrorMessage(error));
    }
  }, [entries, editStartDate, editEndDate, editCategory, editDescription, categories, activeEntry, onEntryChange, setEntries, closeInlineSuggestions]);

  // Deferred blur handler: gives click/touch events on sibling edit buttons
  // time to fire startEdit before we save and clear the editing state.
  // Used by ALL inline edit fields (category, description, time) so that
  // clicking between fields or onto the Save/Cancel buttons doesn't
  // prematurely close the editor on desktop (PC).
  const handleDeferredBlur = useCallback((entryId: number, field: EditField, e?: React.FocusEvent) => {
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
      // If the user pressed Escape to cancel, don't save
      if (cancelledRef.current) {
        cancelledRef.current = false;
        return;
      }
      // If Enter/submit already triggered a save, don't double-save
      if (enterSavingRef.current) {
        enterSavingRef.current = false;
        return;
      }
      // If the user tapped another editable field, startEdit already ran
      // and changed the refs — bail out so we don't clobber the new edit.
      if (editFieldRef.current !== snapshotField || editingIdRef.current !== snapshotId) return;
      handleSave(entryId);
    }, 150);
  }, [handleSave]);

  // Legacy alias — time inputs used to have a separate handler
  const handleTimeBlur = handleDeferredBlur;

  // Save handler for the mobile time-edit modal — saves both start and end.
  const handleTimeModalSave = useCallback(async () => {
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
      // Close modal (inline below replaces handleTimeModalClose call to avoid circular dep)
      setShowTimeEditModal(false);
      setEditingId(null);
      setEditField(null);
      editingIdRef.current = null;
      editFieldRef.current = null;
      setEditTimeError(null);
      if (activeEntry && activeEntry.id === editingId) {
        onEntryChange({ active: optimistic });
      } else {
        onEntryChange({ stopped: optimistic });
      }
    } catch (error) {
      console.error('Failed to update entry:', error);
      setEditTimeError(saveErrorMessage(error));
    }
  }, [editingId, entries, editStartDate, editStartTimeOnly, editEndDate, editEndTimeOnly, editCategory, editDescription, categories, activeEntry, onEntryChange, setEntries]);

  const handleTimeModalClose = useCallback(() => {
    setShowTimeEditModal(false);
    setEditingId(null);
    setEditField(null);
    editingIdRef.current = null;
    editFieldRef.current = null;
    setEditTimeError(null);
  }, []);

  const handleCategorySelectChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>, _entryId: number) => {
    const value = e.target.value;
    if (value === 'new') {
      setShowNewCategory(true);
    } else {
      setEditCategory(Number(value));
      setShowNewCategory(false);
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, entryId: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      // Sync DOM value to refs before handleSave reads them, since onChange may not
      // have fired yet for the current time input segment (e.g. user typed one digit of MM)
      const target = e.target as HTMLInputElement;
      if (target.type === 'time') {
        if (editFieldRef.current === 'startTime') {
          editStartTimeOnlyRef.current = target.value;
          setEditStartTimeOnly(target.value);
        } else if (editFieldRef.current === 'endTime') {
          editEndTimeOnlyRef.current = target.value;
          setEditEndTimeOnly(target.value);
        }
      }
      enterSavingRef.current = true;
      handleSave(entryId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  }, [handleSave, handleCancel]);

  // Handle form submission for time inputs (Enter key may not work consistently on datetime-local)
  const handleTimeInputSubmit = useCallback((e: React.FormEvent, entryId: number) => {
    e.preventDefault();
    enterSavingRef.current = true;
    handleSave(entryId);
  }, [handleSave]);

  // Inline/modal edit: handlers for split time/date with midnight crossing
  const handleEditStartTimeOnlyChange = useCallback((newTime: string) => {
    const adjusted = adjustDateForMidnightCrossing(editStartTimeOnly, newTime, editStartDate);
    editStartTimeOnlyRef.current = newTime;
    setEditStartTimeOnly(newTime);
    if (adjusted !== editStartDate) setEditStartDate(adjusted);
    setEditTimeError(null);
  }, [editStartTimeOnly, editStartDate]);

  const handleEditStartDateChange = useCallback((newDate: string) => {
    setEditStartDate(newDate);
    setEditTimeError(null);
  }, []);

  const handleEditEndTimeOnlyChange = useCallback((newTime: string) => {
    const adjusted = adjustDateForMidnightCrossing(editEndTimeOnly, newTime, editEndDate);
    editEndTimeOnlyRef.current = newTime;
    setEditEndTimeOnly(newTime);
    if (adjusted !== editEndDate) setEditEndDate(adjusted);
    setEditTimeError(null);
  }, [editEndTimeOnly, editEndDate]);

  const handleEditEndDateChange = useCallback((newDate: string) => {
    setEditEndDate(newDate);
    setEditTimeError(null);
  }, []);

  return {
    // State
    editingId,
    editField,
    editCategory,
    editDescription,
    editStartDate,
    editStartTimeOnly,
    editEndDate,
    editEndTimeOnly,
    editTimeError,
    showTimeEditModal,
    showNewCategory,
    setShowNewCategory,
    setEditCategory,
    setEditDescription,
    setEditingId,
    setEditField,

    // Refs
    editFieldRef,
    editingIdRef,
    cancelledRef,
    enterSavingRef,

    // Handlers
    startEdit,
    handleCancel,
    handleSave,
    handleDeferredBlur,
    handleTimeBlur,
    handleTimeInputSubmit,
    handleTimeModalSave,
    handleTimeModalClose,
    handleCategorySelectChange,
    handleKeyDown,
    handleEditStartTimeOnlyChange,
    handleEditEndTimeOnlyChange,
    handleEditStartDateChange,
    handleEditEndDateChange,
  };
}
