import { useState, useMemo, useRef, useEffect } from 'react';
import { Category } from '../types';
import { api } from '../api';
import { DEFAULT_CATEGORY_COLOR, getNextAvailableColor } from '../utils/colorUtils';
import { Modal } from './Modal';
import './CategoryManager.css';

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
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [replacementId, setReplacementId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Update default color when categories change
  useMemo(() => {
    setColor(nextColor);
  }, [nextColor]);

  // Focus the inline edit input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await api.createCategory(name, color);
      setName('');
      setColor(nextColor);
      onCategoryChange();
    } catch (error) {
      console.error('Failed to save category:', error);
    }
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditColor(category.color || DEFAULT_CATEGORY_COLOR);
  };

  const handleEditSubmit = async (categoryId: number) => {
    if (!editName.trim()) return;

    try {
      await api.updateCategory(categoryId, editName, editColor);
      setEditingId(null);
      setEditName('');
      setEditColor('');
      onCategoryChange();
    } catch (error) {
      console.error('Failed to update category:', error);
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, categoryId: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditSubmit(categoryId);
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
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

  const availableReplacements = categories.filter(c => c.id !== deletingCategory?.id);

  return (
    <div className="category-manager">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">New Category</h2>
        </div>
        <form onSubmit={handleCreate} className="category-form">
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
            <button type="submit" className="btn btn-primary">
              Add
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
              <div key={category.id} className={`category-item ${editingId === category.id ? 'category-item-editing' : ''}`}>
                {editingId === category.id ? (
                  <div className="category-edit-inline">
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="color-picker-small"
                    />
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => handleEditKeyDown(e, category.id)}
                      className="category-edit-input"
                      placeholder="Category name"
                    />
                    <div className="category-edit-actions">
                      <button
                        className="btn-icon"
                        onClick={() => handleEditSubmit(category.id)}
                        title="Save"
                        disabled={!editName.trim()}
                      >
                        ✓
                      </button>
                      <button
                        className="btn-icon"
                        onClick={handleEditCancel}
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="category-info">
                      <div 
                        className="category-color" 
                        style={{ backgroundColor: category.color || DEFAULT_CATEGORY_COLOR }}
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
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        
        {deleteError && (
          <div className="error-toast">{deleteError}</div>
        )}
      </div>

      {deletingCategory && (
        <Modal title="Delete Category" onClose={handleDeleteCancel} className="delete-category-modal">
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
        </Modal>
      )}
    </div>
  );
}
