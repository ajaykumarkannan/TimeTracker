import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { api } from '../api';
import { fuzzyMatch } from '../utils/fuzzyMatch';

export interface TaskSuggestion {
  task_name: string;
  categoryId: number;
  count: number;
  totalMinutes: number;
  lastUsed: string;
}

export interface UseTaskSuggestionsOptions {
  /** The current text value of the input */
  value: string;
  /** Number of entries — triggers a refetch when it changes */
  entryCount: number;
  /** If set, suggestions matching this category are sorted first */
  preferCategoryId?: number | null;
  /** Secondary sort when scores are equal: 'recency' (default) or 'count' */
  tiebreaker?: 'recency' | 'count';
  /**
   * When true, suggestions auto-open reactively when value/category changes.
   * When false (default), suggestions only open on explicit focus.
   */
  autoOpen?: boolean;
}

export function useTaskSuggestions({
  value,
  entryCount,
  preferCategoryId = null,
  tiebreaker = 'recency',
  autoOpen = false,
}: UseTaskSuggestionsOptions) {
  const [cachedSuggestions, setCachedSuggestions] = useState<TaskSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const suppressRef = useRef(false);

  // Fetch all suggestions once and cache them
  useEffect(() => {
    api.getTaskNameSuggestions(undefined, undefined)
      .then(setCachedSuggestions)
      .catch(err => console.error('Failed to fetch suggestions:', err));
  }, [entryCount]);

  // Filter and sort suggestions locally
  const suggestions = useMemo(() => {
    let filtered = [...cachedSuggestions];

    const tiebreakerFn = tiebreaker === 'recency'
      ? (a: TaskSuggestion, b: TaskSuggestion) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
      : (a: TaskSuggestion, b: TaskSuggestion) => b.count - a.count;

    const categoryBoost = (a: TaskSuggestion, b: TaskSuggestion) => {
      if (!preferCategoryId) return 0;
      const aIn = a.categoryId === preferCategoryId ? 1 : 0;
      const bIn = b.categoryId === preferCategoryId ? 1 : 0;
      return bIn - aIn;
    };

    if (value) {
      filtered = filtered
        .map(s => ({ ...s, ...fuzzyMatch(value, s.task_name) }))
        .filter(s => s.match)
        .sort((a, b) => categoryBoost(a, b) || (b.score - a.score) || tiebreakerFn(a, b));
    } else {
      filtered.sort((a, b) => categoryBoost(a, b) || tiebreakerFn(a, b));
    }

    return filtered.slice(0, 8);
  }, [cachedSuggestions, preferCategoryId, value, tiebreaker]);

  // Auto-open mode: reactively show suggestions when data changes
  useEffect(() => {
    if (autoOpen) {
      if (suggestions.length > 0 && (preferCategoryId || value) && !suppressRef.current) {
        setShowSuggestions(true);
      } else if (suggestions.length === 0) {
        setShowSuggestions(false);
      }
    }
    setSelectedIndex(-1);
  }, [suggestions, preferCategoryId, value, autoOpen]);

  // Click-outside dismissal
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        listRef.current && !listRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const open = useCallback(() => {
    if (suggestions.length > 0 && !suppressRef.current) {
      setShowSuggestions(true);
    }
  }, [suggestions.length]);

  const close = useCallback(() => {
    setShowSuggestions(false);
    setSelectedIndex(-1);
  }, []);

  /**
   * Call from onSelect after setting your external state.
   * Suppresses the next auto-open / onFocus reopen, then refocuses.
   */
  const completeSelection = useCallback(() => {
    suppressRef.current = true;
    setShowSuggestions(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  }, []);

  /**
   * onFocus handler for the input. In focus-driven mode, opens the dropdown
   * unless a selection was just made.
   */
  const handleFocus = useCallback(() => {
    if (suppressRef.current) {
      suppressRef.current = false;
      return;
    }
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  }, [suggestions.length]);

  /**
   * onChange handler for the input. Clears the suppress flag so typing
   * can reopen suggestions in auto-open mode.
   */
  const clearSuppress = useCallback(() => {
    suppressRef.current = false;
  }, []);

  /**
   * Keyboard handler for the input. Handles arrow navigation, Enter, Escape.
   * Returns the selected suggestion on Enter (if one is highlighted), or null.
   * The caller is responsible for the actual selection side-effects.
   */
  const handleKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLInputElement>,
    onEnterWithoutSelection?: () => void,
  ): TaskSuggestion | null => {
    if (e.key === 'Escape') {
      if (showSuggestions) {
        suppressRef.current = true;
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
      return null;
    }

    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') {
        onEnterWithoutSelection?.();
      }
      return null;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => prev < suggestions.length - 1 ? prev + 1 : prev);
        return null;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        return null;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          return suggestions[selectedIndex];
        }
        onEnterWithoutSelection?.();
        return null;
      default:
        return null;
    }
  }, [showSuggestions, suggestions, selectedIndex]);

  return {
    suggestions,
    showSuggestions,
    selectedIndex,
    setSelectedIndex,
    inputRef,
    listRef,
    open,
    close,
    completeSelection,
    handleFocus,
    handleKeyDown,
    clearSuppress,
  };
}
