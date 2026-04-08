import { useState, useMemo, useCallback } from 'react';
import { TimeEntry, Category } from '../types';
import { api } from '../api';

const DISMISSED_SHORT_KEY = 'chronoflow:dismissedShortEntries';
const DISMISSED_MERGE_KEY = 'chronoflow:dismissedMerges';

export interface MergeCandidate {
  entries: TimeEntry[];
  categoryName: string;
  description: string | null;
}

export interface ShortEntry {
  entry: TimeEntry;
  durationSeconds: number;
}

interface UseCleanupSuggestionsParams {
  entries: TimeEntry[];
  categories: Category[];
  activeEntry: TimeEntry | null;
  onEntryChange: () => void;
  loadEntries: () => Promise<void>;
}

export function useCleanupSuggestions({
  entries,
  onEntryChange,
}: UseCleanupSuggestionsParams) {
  // Banner visibility state
  const [showCleanupBanner, setShowCleanupBanner] = useState(true);

  // Dismissed merge groups (persisted to localStorage)
  const [dismissedMerges, setDismissedMerges] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_MERGE_KEY);
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch { return new Set(); }
  });

  // Dismissed short entries (persisted to localStorage)
  const [dismissedShortEntries, setDismissedShortEntries] = useState<Set<number>>(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_SHORT_KEY);
      return stored ? new Set(JSON.parse(stored) as number[]) : new Set();
    } catch { return new Set(); }
  });

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

  // Build the batch-merge payload for a single merge candidate
  const buildMergeGroup = useCallback((candidate: MergeCandidate) => {
    const sorted = [...candidate.entries].sort((a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    return {
      keepId: first.id,
      deleteIds: sorted.slice(1).map(e => e.id),
      update: {
        category_id: first.category_id,
        task_name: first.task_name,
        start_time: first.start_time,
        end_time: last.end_time
      }
    };
  }, []);

  const handleMergeEntries = useCallback(async (candidate: MergeCandidate) => {
    try {
      await api.batchMergeEntries([buildMergeGroup(candidate)]);
      onEntryChange();
    } catch (error) {
      console.error('Failed to merge entries:', error);
    }
  }, [buildMergeGroup, onEntryChange]);

  const handleDismissMerge = useCallback((candidate: MergeCandidate) => {
    const key = candidate.entries.map(e => e.id).sort((a, b) => a - b).join('-');
    setDismissedMerges(prev => {
      const next = new Set([...prev, key]);
      try { localStorage.setItem(DISMISSED_MERGE_KEY, JSON.stringify([...next])); } catch { /* quota */ }
      return next;
    });
  }, []);

  const handleDeleteShortEntry = useCallback(async (entry: TimeEntry) => {
    try {
      await api.deleteEntry(entry.id);
      onEntryChange();
    } catch (error) {
      console.error('Failed to delete entry:', error);
    }
  }, [onEntryChange]);

  const handleDismissShortEntry = useCallback((entryId: number) => {
    setDismissedShortEntries(prev => {
      const next = new Set([...prev, entryId]);
      try { localStorage.setItem(DISMISSED_SHORT_KEY, JSON.stringify([...next])); } catch { /* quota */ }
      return next;
    });
  }, []);

  const handleApplyAll = useCallback(async () => {
    try {
      // Batch merge all candidates (1 API call instead of N sequential calls per group)
      if (mergeCandidates.length > 0) {
        await api.batchMergeEntries(mergeCandidates.map(buildMergeGroup));
      }
      // Batch delete all short entries (1 API call instead of N sequential calls)
      if (shortEntries.length > 0) {
        await api.batchDeleteEntries(shortEntries.map(({ entry }) => entry.id));
      }
      onEntryChange();
    } catch (error) {
      console.error('Failed to apply all:', error);
      onEntryChange();
    }
  }, [mergeCandidates, shortEntries, buildMergeGroup, onEntryChange]);

  return {
    showCleanupBanner,
    setShowCleanupBanner,
    mergeCandidates,
    shortEntries,
    hasCleanupSuggestions,
    handleMergeEntries,
    handleDismissMerge,
    handleDeleteShortEntry,
    handleDismissShortEntry,
    handleApplyAll,
  };
}
