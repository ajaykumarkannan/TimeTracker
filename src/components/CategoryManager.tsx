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
  const [color, setColor] = useState('#007bff');
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
      setColor('#007bff');
      onUpdate();
    } catch (error) {
      console.error('Failed to save category:', error);
    }
  };

  const handleEdit = (category: Category) => {
    setName(category.name);
    setColor(category.color || '#007bff');
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
    setColor('#007bff');
    setEditingId(null);
  };

  return (
    <div className="category-manager">
      <div className="category-form">
        <h2>{editingId ? 'Edit Category' : 'Add Category'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Meetings, Development, Break"
                required
              />
            </div>
            <div className="form-group">
              <label>Color</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              {editingId ? 'Update' : 'Add'} Category
            </button>
            {editingId && (
              <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="category-list">
        <h2>Categories</h2>
        {categories.length === 0 ? (
          <p className="empty-state">No categories yet. Add one above to get started!</p>
        ) : (
          <div className="categories">
            {categories.map(category => (
              <div key={category.id} className="category-item">
                <div className="category-info">
                  <div 
                    className="category-color" 
                    style={{ backgroundColor: category.color || '#ccc' }}
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
