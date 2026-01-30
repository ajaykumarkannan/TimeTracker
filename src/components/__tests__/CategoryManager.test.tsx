import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CategoryManager } from '../CategoryManager';

// Mock the api module
vi.mock('../../api', () => ({
  api: {
    createCategory: vi.fn().mockResolvedValue({ id: 3, name: 'New', color: '#000' }),
    updateCategory: vi.fn().mockResolvedValue({ id: 1, name: 'Updated', color: '#000' }),
    deleteCategory: vi.fn().mockResolvedValue(undefined),
  }
}));

import { api } from '../../api';

describe('CategoryManager', () => {
  const mockCategories = [
    { id: 1, name: 'Development', color: '#007bff', created_at: '2024-01-01' },
    { id: 2, name: 'Meetings', color: '#28a745', created_at: '2024-01-01' }
  ];

  const mockOnCategoryChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders category list', () => {
    render(
      <CategoryManager 
        categories={mockCategories} 
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.getByText('Meetings')).toBeInTheDocument();
  });

  it('creates new category', async () => {
    render(
      <CategoryManager 
        categories={[]} 
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    const input = screen.getByPlaceholderText(/category name/i);
    fireEvent.change(input, { target: { value: 'New Category' } });
    
    const button = screen.getByRole('button', { name: /add/i });
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(api.createCategory).toHaveBeenCalledWith('New Category', '#6366f1');
      expect(mockOnCategoryChange).toHaveBeenCalled();
    });
  });

  it('shows empty state when no categories', () => {
    render(
      <CategoryManager 
        categories={[]} 
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    expect(screen.getByText(/No categories yet/)).toBeInTheDocument();
  });

  it('edits existing category', async () => {
    render(
      <CategoryManager 
        categories={mockCategories} 
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    // Click edit button on first category
    const editButtons = screen.getAllByTitle('Edit');
    fireEvent.click(editButtons[0]);
    
    // Should show edit form with category name
    const input = screen.getByDisplayValue('Development');
    expect(input).toBeInTheDocument();
    
    // Change name and submit
    fireEvent.change(input, { target: { value: 'Updated Dev' } });
    const updateButton = screen.getByRole('button', { name: /update/i });
    fireEvent.click(updateButton);
    
    await waitFor(() => {
      expect(api.updateCategory).toHaveBeenCalledWith(1, 'Updated Dev', '#007bff');
      expect(mockOnCategoryChange).toHaveBeenCalled();
    });
  });

  it('deletes category with confirmation', async () => {
    // Mock window.confirm
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    
    render(
      <CategoryManager 
        categories={mockCategories} 
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);
    
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(api.deleteCategory).toHaveBeenCalledWith(1);
      expect(mockOnCategoryChange).toHaveBeenCalled();
    });
    
    confirmSpy.mockRestore();
  });

  it('cancels delete when not confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    
    render(
      <CategoryManager 
        categories={mockCategories} 
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);
    
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(api.deleteCategory).not.toHaveBeenCalled();
    });
    
    confirmSpy.mockRestore();
  });
});
