import { useState, useMemo } from 'react';
import { Category } from '../types';
import { api } from '../api';
import './CategoryManager.css';

// Primary color palette - visually distinct colors
const COLOR_PALETTE = [
  '#6366f1', // Indigo (primary)
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#84cc16', // Lime
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#a855f7', // Purple
  '#eab308', // Yellow
];

function getNextAvailableColor(usedColors: (string | null)[]): string {
  const normalizedUsed = new Set(usedColors.map(c => c?.toLowerCase()));
  for (const color of COLOR_PALETTE) {
    if (!normalizedUsed.has(color.toLowerCase())) {
      return color;
    }
  }
  // All palette colors used, return a random one
  return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
}

interface Props {
  categories: Category[];
  onCategoryChange: () => void;
}

export function CategoryManager({ categories, onCategoryChange }: Props) {
  const nextColor = useMemo(() => {
    const usedColors = categories.map(c => c.color);
    return getNextAvailableColor(usedColors);
  }, [categories]);

  const [name, setName] = useState('');
  const [color, setColor] = useState(nextColor);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [replacementId, setReplacementId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Update default color when categories change (and not editing)
  useMemo(() => {
    if (!editingId) {
      setColor(nextColor);
    }
  }, [nextColor, editingId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      if (editingId) {
        await api.updateCategory(editingId, name, color);
        setEditingId(null);
      } else {
        await api.createCategory(name, color);
      }
      setName('');
      setColor(nextColor);
      onCategoryChange();
    } catch (error) {
      console.error('Failed to save category:', error);
    }
  };

  const handleEdit = (category: Category) => {
    setName(category.name);
    setColor(category.color || '#6366f1');
    setEditingId(category.id);
  };

  const handleDeleteClick = async (category: Category) => {
    // Try to delete without replacement first (works if no linked entries)
    try {
      await api.deleteCategory(category.id);
      onCategoryChange();
      return;
    } catch (error) {
      // If replacement is required, show the modal
      if (error instanceof Error && error.message === 'Replacement category is required') {
        // Can't show replacement modal if this is the last category
        if (categories.length <= 1) {
          setDeleteError('Cannot delete the last category when it has linked entries');
          setTimeout(() => setDeleteError(null), 3000);
          return;
        }
        const defaultReplacement = categories.find(c => c.id !== category.id);
        setReplacementId(defaultReplacement?.id || null);
        setDeletingCategory(category);
        return;
      }
      // Other errors
      console.error('Failed to delete category:', error);
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete category');
      setTimeout(() => setDeleteError(null), 3000);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingCategory || !replacementId) return;
    
    try {
      await api.deleteCategory(deletingCategory.id, replacementId);
      setDeletingCategory(null);
      setReplacementId(null);
      onCategoryChange();
    } catch (error) {
      console.error('Failed to delete category:', error);
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete category');
      setTimeout(() => setDeleteError(null), 3000);
    }
  };

  const handleDeleteCancel = () => {
    setDeletingCategory(null);
    setReplacementId(null);
  };

  const handleCancel = () => {
    setName('');
    setColor(nextColor);
    setEditingId(null);
  };

  const availableReplacements = categories.filter(c => c.id !== deletingCategory?.id);

  return (
    <div className="category-manager">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{editingId ? 'Edit Category' : 'New Category'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="category-form">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Category name"
            className="category-name-input"
            required
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="color-picker-small"
          />
          <div className="btn-group">
            {editingId && (
              <button type="button" className="btn btn-ghost" onClick={handleCancel}>
                Cancel
              </button>
            )}
            <button type="submit" className="btn btn-primary">
              {editingId ? 'Update' : 'Add'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Categories</h2>
        </div>
        {categories.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📁</div>
            <p>No categories yet</p>
            <p className="empty-hint">Create one above to get started</p>
          </div>
        ) : (
          <div className="categories-list">
            {categories.map(category => (
              <div key={category.id} className="category-item">
                <div className="category-info">
                  <div 
                    className="category-color" 
                    style={{ backgroundColor: category.color || '#6366f1' }}
                  />
                  <span className="category-name">{category.name}</span>
                </div>
                <div className="category-actions">
                  <button 
                    className="btn-icon" 
                    onClick={() => handleEdit(category)}
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button 
                    className="btn-icon" 
                    onClick={() => handleDeleteClick(category)}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {deleteError && (
          <div className="error-toast">{deleteError}</div>
        )}
      </div>

      {deletingCategory && (
        <div className="modal-overlay" onClick={handleDeleteCancel}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Delete Category</h3>
            <p>
              Deleting "<strong>{deletingCategory.name}</strong>" will reassign all its time entries to another category.
            </p>
            <div className="form-group">
              <label>Move entries to:</label>
              <select 
                value={replacementId || ''} 
                onChange={e => setReplacementId(Number(e.target.value))}
                className="replacement-select"
              >
                {availableReplacements.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={handleDeleteCancel}>
                Cancel
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleDeleteConfirm}
                disabled={!replacementId}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
