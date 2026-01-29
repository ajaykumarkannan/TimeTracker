import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CategoryManager } from '../CategoryManager';
import { api } from '../../api';

vi.mock('../../api');

describe('CategoryManager', () => {
  const mockCategories = [
    { id: 1, name: 'Development', color: '#007bff', created_at: '2024-01-01' },
    { id: 2, name: 'Meetings', color: '#28a745', created_at: '2024-01-01' }
  ];

  const mockOnUpdate = vi.fn();

  it('renders category list', () => {
    render(<CategoryManager categories={mockCategories} onUpdate={mockOnUpdate} />);
    
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.getByText('Meetings')).toBeInTheDocument();
  });

  it('creates new category', async () => {
    vi.mocked(api.createCategory).mockResolvedValue({} as any);
    
    render(<CategoryManager categories={[]} onUpdate={mockOnUpdate} />);
    
    const input = screen.getByPlaceholderText(/e.g., Meetings/);
    fireEvent.change(input, { target: { value: 'New Category' } });
    
    const button = screen.getByRole('button', { name: /add category/i });
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(api.createCategory).toHaveBeenCalledWith('New Category', '#007bff');
      expect(mockOnUpdate).toHaveBeenCalled();
    });
  });

  it('edits existing category', async () => {
    vi.mocked(api.updateCategory).mockResolvedValue({} as any);
    
    render(<CategoryManager categories={mockCategories} onUpdate={mockOnUpdate} />);
    
    const editButtons = screen.getAllByTitle('Edit');
    fireEvent.click(editButtons[0]);
    
    const input = screen.getByDisplayValue('Development');
    fireEvent.change(input, { target: { value: 'Updated Dev' } });
    
    const updateButton = screen.getByText('Update Category');
    fireEvent.click(updateButton);
    
    await waitFor(() => {
      expect(api.updateCategory).toHaveBeenCalledWith(1, 'Updated Dev', '#007bff');
      expect(mockOnUpdate).toHaveBeenCalled();
    });
  });

  it('deletes category with confirmation', async () => {
    vi.mocked(api.deleteCategory).mockResolvedValue();
    global.confirm = vi.fn(() => true);
    
    render(<CategoryManager categories={mockCategories} onUpdate={mockOnUpdate} />);
    
    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);
    
    await waitFor(() => {
      expect(api.deleteCategory).toHaveBeenCalledWith(1);
      expect(mockOnUpdate).toHaveBeenCalled();
    });
  });

  it('shows empty state when no categories', () => {
    render(<CategoryManager categories={[]} onUpdate={mockOnUpdate} />);
    
    expect(screen.getByText(/No categories yet/)).toBeInTheDocument();
  });
});
