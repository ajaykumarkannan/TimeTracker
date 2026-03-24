import { useState } from 'react';
import { api } from '../api';
import { Category } from '../types';
import { DEFAULT_CATEGORY_COLOR } from '../utils/colorUtils';

interface InlineCategoryFormProps {
  /** Visual variant: 'labeled' shows Cancel/Create text buttons, 'compact' shows ✓/✕ icons */
  variant?: 'labeled' | 'compact';
  /** Initial color value; defaults to DEFAULT_CATEGORY_COLOR */
  initialColor?: string;
  /** Called with the newly created category after a successful API call */
  onCreated: (category: Category) => void;
  /** Called when the user cancels (Escape or Cancel button) */
  onCancel: () => void;
  /** Extra CSS class name for the text input */
  inputClassName?: string;
  /** Extra CSS class name for the color picker */
  colorClassName?: string;
  /** CSS class names for the save and cancel buttons (compact variant) */
  saveBtnClassName?: string;
  cancelBtnClassName?: string;
}

export function InlineCategoryForm({
  variant = 'labeled',
  initialColor = DEFAULT_CATEGORY_COLOR,
  onCreated,
  onCancel,
  inputClassName,
  colorClassName = 'color-picker',
  saveBtnClassName,
  cancelBtnClassName,
}: InlineCategoryFormProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(initialColor);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const category = await api.createCategory(name.trim(), color);
      onCreated(category);
    } catch (error) {
      console.error('Failed to create category:', error);
    }
    setCreating(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && name.trim()) handleCreate();
    if (e.key === 'Escape') onCancel();
  };

  if (variant === 'compact') {
    return (
      <>
        <input
          type="text"
          className={inputClassName}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          autoFocus
          onKeyDown={handleKeyDown}
        />
        <input
          type="color"
          className={colorClassName}
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <button
          type="button"
          className={saveBtnClassName}
          onClick={handleCreate}
          disabled={creating || !name.trim()}
          title="Create"
        >
          ✓
        </button>
        <button
          type="button"
          className={cancelBtnClassName}
          onClick={onCancel}
          title="Cancel"
        >
          ✕
        </button>
      </>
    );
  }

  // Labeled variant
  return (
    <>
      <input
        type="text"
        className={inputClassName}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Category name"
        autoFocus
        onKeyDown={handleKeyDown}
      />
      <input
        type="color"
        className={colorClassName}
        value={color}
        onChange={(e) => setColor(e.target.value)}
      />
      <button className="btn btn-ghost" onClick={onCancel}>
        Cancel
      </button>
      <button
        className="btn btn-primary"
        onClick={handleCreate}
        disabled={creating || !name.trim()}
      >
        Create
      </button>
    </>
  );
}
