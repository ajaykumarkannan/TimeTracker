import { useState } from 'react';
import { Category } from '../types';
import { api } from '../api';
import './CategoryManager.css';

interface Props {
  categories: Category[];
  onUpdate: () => void;
}

export function CategoryManager({ categories, onUpdate }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [editingId, setEditingId] = useState<number | null>(null);

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
      setColor('#6366f1');
      onUpdate();
    } catch (error) {
      console.error('Failed to save category:', error);
    }
  };

  const handleEdit = (category: Category) => {
    setName(category.name);
    setColor(category.color || '#6366f1');
    setEditingId(category.id);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this category? All associated time entries will also be deleted.')) {
      return;
    }
    try {
      await api.deleteCategory(id);
      onUpdate();
    } catch (error) {
      console.error('Failed to delete category:', error);
    }
  };

  const handleCancel = () => {
    setName('');
    setColor('#6366f1');
    setEditingId(null);
  };

  return (
    <div className="category-manager">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{editingId ? 'Edit Category' : 'New Category'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="category-form">
          <div className="form-group flex-1">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Category name"
              className="category-name-input"
              required
            />
          </div>
          <div className="form-group">
            <label>Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="color-picker"
            />
          </div>
          <div className="form-actions">
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
                    onClick={() => handleDelete(category.id)}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
