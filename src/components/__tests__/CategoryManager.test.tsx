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

  it('deletes category directly when no linked entries', async () => {
    // Mock successful delete (no linked entries)
    vi.mocked(api.deleteCategory).mockResolvedValueOnce(undefined);
    
    render(
      <CategoryManager 
        categories={mockCategories} 
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    // Click delete on first category
    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);
    
    // Should delete directly without modal
    await waitFor(() => {
      expect(api.deleteCategory).toHaveBeenCalledWith(1);
      expect(mockOnCategoryChange).toHaveBeenCalled();
    });
    
    // Modal should NOT appear
    expect(screen.queryByText(/Delete Category/)).not.toBeInTheDocument();
  });

  it('shows replacement modal when category has linked entries', async () => {
    // Mock delete failure requiring replacement
    vi.mocked(api.deleteCategory).mockRejectedValueOnce(new Error('Replacement category is required'));
    
    render(
      <CategoryManager 
        categories={mockCategories} 
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    // Click delete on first category
    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);
    
    // Modal should appear after failed delete attempt
    await waitFor(() => {
      expect(screen.getByText(/Delete Category/)).toBeInTheDocument();
      expect(screen.getByText(/Move entries to:/)).toBeInTheDocument();
    });
    
    // Confirm deletion with replacement
    const confirmButton = screen.getByRole('button', { name: /^Delete$/i });
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(api.deleteCategory).toHaveBeenCalledWith(1, 2); // Delete category 1, move to category 2
    });
  });

  it('cancels delete when cancel button clicked', async () => {
    // Mock delete failure requiring replacement
    vi.mocked(api.deleteCategory).mockRejectedValueOnce(new Error('Replacement category is required'));
    
    render(
      <CategoryManager 
        categories={mockCategories} 
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    // Click delete on first category
    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);
    
    // Modal should appear
    await waitFor(() => {
      expect(screen.getByText(/Delete Category/)).toBeInTheDocument();
    });
    
    // Click cancel
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);
    
    // Modal should close
    await waitFor(() => {
      expect(screen.queryByText(/Delete Category/)).not.toBeInTheDocument();
    });
  });

  it('allows deletion of last category when no linked entries', async () => {
    const singleCategory = [
      { id: 1, name: 'Only Category', color: '#007bff', created_at: '2024-01-01' }
    ];
    
    // Mock successful delete (no linked entries)
    vi.mocked(api.deleteCategory).mockResolvedValueOnce(undefined);
    
    render(
      <CategoryManager 
        categories={singleCategory} 
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    // Click delete on the only category
    const deleteButton = screen.getByTitle('Delete');
    fireEvent.click(deleteButton);
    
    // Should delete directly
    await waitFor(() => {
      expect(api.deleteCategory).toHaveBeenCalledWith(1);
      expect(mockOnCategoryChange).toHaveBeenCalled();
    });
  });

  it('prevents deletion of last category when it has linked entries', async () => {
    const singleCategory = [
      { id: 1, name: 'Only Category', color: '#007bff', created_at: '2024-01-01' }
    ];
    
    // Mock delete failure requiring replacement (has linked entries)
    vi.mocked(api.deleteCategory).mockRejectedValueOnce(new Error('Replacement category is required'));
    
    render(
      <CategoryManager 
        categories={singleCategory} 
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    // Click delete on the only category
    const deleteButton = screen.getByTitle('Delete');
    fireEvent.click(deleteButton);
    
    // Should show error since we can't offer a replacement
    await waitFor(() => {
      expect(screen.getByText(/Cannot delete the last category when it has linked entries/)).toBeInTheDocument();
    });
    
    // Modal should NOT appear (no replacement options available)
    expect(screen.queryByText(/Delete Category/)).not.toBeInTheDocument();
  });

  it('cancels edit when cancel button clicked', async () => {
    render(
      <CategoryManager 
        categories={mockCategories} 
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    // Click edit button on first category
    const editButtons = screen.getAllByTitle('Edit');
    fireEvent.click(editButtons[0]);
    
    // Should show edit form
    expect(screen.getByDisplayValue('Development')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    
    // Click cancel
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);
    
    // Form should reset - input should be empty
    const input = screen.getByPlaceholderText(/category name/i);
    expect(input).toHaveValue('');
    
    // Should show Add button again (not Update)
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
  });

  it('shows error toast for non-replacement delete errors', async () => {
    // Mock delete failure with a different error
    vi.mocked(api.deleteCategory).mockRejectedValueOnce(new Error('Database error'));
    
    render(
      <CategoryManager 
        categories={mockCategories} 
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    // Click delete on first category
    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);
    
    // Should show error toast
    await waitFor(() => {
      expect(screen.getByText(/Database error/)).toBeInTheDocument();
    });
  });

  it('closes modal when clicking overlay', async () => {
    // Mock delete failure requiring replacement
    vi.mocked(api.deleteCategory).mockRejectedValueOnce(new Error('Replacement category is required'));
    
    render(
      <CategoryManager 
        categories={mockCategories} 
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    // Click delete on first category
    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);
    
    // Modal should appear
    await waitFor(() => {
      expect(screen.getByText(/Delete Category/)).toBeInTheDocument();
    });
    
    // Click on overlay (outside modal)
    const overlay = document.querySelector('.modal-overlay');
    fireEvent.click(overlay!);
    
    // Modal should close
    await waitFor(() => {
      expect(screen.queryByText(/Delete Category/)).not.toBeInTheDocument();
    });
  });

  it('shows error when delete confirmation fails', async () => {
    // First call: requires replacement
    vi.mocked(api.deleteCategory).mockRejectedValueOnce(new Error('Replacement category is required'));
    // Second call: fails with error
    vi.mocked(api.deleteCategory).mockRejectedValueOnce(new Error('Server error'));
    
    render(
      <CategoryManager 
        categories={mockCategories} 
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    // Click delete on first category
    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);
    
    // Modal should appear
    await waitFor(() => {
      expect(screen.getByText(/Delete Category/)).toBeInTheDocument();
    });
    
    // Confirm deletion
    const confirmButton = screen.getByRole('button', { name: /^Delete$/i });
    fireEvent.click(confirmButton);
    
    // Should show error toast
    await waitFor(() => {
      expect(screen.getByText(/Server error/)).toBeInTheDocument();
    });
  });

  it('handles create category error gracefully', async () => {
    vi.mocked(api.createCategory).mockRejectedValueOnce(new Error('Failed to create'));
    
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
      expect(api.createCategory).toHaveBeenCalled();
    });
    
    // Should not call onCategoryChange on error
    expect(mockOnCategoryChange).not.toHaveBeenCalled();
  });

  it('changes replacement category in modal', async () => {
    const threeCategories = [
      { id: 1, name: 'Development', color: '#007bff', created_at: '2024-01-01' },
      { id: 2, name: 'Meetings', color: '#28a745', created_at: '2024-01-01' },
      { id: 3, name: 'Planning', color: '#ffc107', created_at: '2024-01-01' }
    ];
    
    // Mock delete failure requiring replacement
    vi.mocked(api.deleteCategory).mockRejectedValueOnce(new Error('Replacement category is required'));
    
    render(
      <CategoryManager 
        categories={threeCategories} 
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    // Click delete on first category
    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);
    
    // Modal should appear
    await waitFor(() => {
      expect(screen.getByText(/Delete Category/)).toBeInTheDocument();
    });
    
    // Change replacement selection
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '3' } });
    
    // Confirm deletion
    const confirmButton = screen.getByRole('button', { name: /^Delete$/i });
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(api.deleteCategory).toHaveBeenCalledWith(1, 3); // Delete category 1, move to category 3
    });
  });
});
