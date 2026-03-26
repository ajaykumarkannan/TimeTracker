import React from 'react';
import type { Category } from '../types';
import type { TaskSuggestion } from '../hooks/useTaskSuggestions';
import { getAdaptiveCategoryColors } from '../hooks/useAdaptiveColors';

interface TaskSuggestionInputProps {
  /** Current text value */
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Ref forwarded to the <input> element */
  inputRef: React.Ref<HTMLInputElement>;
  /** Ref for the dropdown container */
  listRef: React.Ref<HTMLDivElement>;
  /** Filtered suggestions to display */
  suggestions: TaskSuggestion[];
  /** Whether the dropdown is visible */
  show: boolean;
  /** Currently highlighted index (-1 = none) */
  selectedIndex: number;
  onSelect: (suggestion: TaskSuggestion) => void;
  onHover: (index: number) => void;
  /** Full category list for looking up names/colors */
  categories: Category[];
  /** Use adaptive dark/light dot colors */
  isDarkMode?: boolean;
  /** Extra class on the wrapper div */
  className?: string;
}

export function TaskSuggestionInput({
  value,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  placeholder = 'Task (optional)',
  autoFocus = false,
  inputRef,
  listRef,
  suggestions,
  show,
  selectedIndex,
  onSelect,
  onHover,
  categories,
  isDarkMode = false,
  className,
}: TaskSuggestionInputProps) {
  return (
    <div className={`description-input-wrapper${className ? ` ${className}` : ''}`}>
      <input
        ref={inputRef}
        type="text"
        name="task-description"
        className="switch-description-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        data-lpignore="true"
        data-1p-ignore
        data-bw-autofill="false"
        data-protonpass-ignore
        data-form-type="other"
      />
      {show && suggestions.length > 0 && (
        <div className="description-suggestions" ref={listRef}>
          {suggestions.map((suggestion, idx) => {
            const cat = categories.find(c => c.id === suggestion.categoryId);
            const dotColor = getAdaptiveCategoryColors(cat?.color || null, isDarkMode).dotColor;
            return (
              <button
                key={`${suggestion.categoryId}-${suggestion.task_name}`}
                className={`suggestion-item ${idx === selectedIndex ? 'selected' : ''}`}
                onClick={() => onSelect(suggestion)}
                onMouseEnter={() => onHover(idx)}
                type="button"
              >
                <span className="suggestion-text">{suggestion.task_name}</span>
                <span className="suggestion-meta">
                  <span className="category-dot" style={{ backgroundColor: dotColor }} />
                  <span className="suggestion-category">{cat?.name || 'Unknown'}</span>
                  <span className="suggestion-count">×{suggestion.count}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
