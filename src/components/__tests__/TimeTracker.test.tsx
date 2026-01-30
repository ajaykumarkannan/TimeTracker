import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TimeTracker } from '../TimeTracker';

describe('TimeTracker', () => {
  const mockCategories = [
    { id: 1, name: 'Development', color: '#007bff', created_at: '2024-01-01' },
    { id: 2, name: 'Meetings', color: '#28a745', created_at: '2024-01-01' }
  ];

  const mockOnEntryChange = vi.fn();
  const mockOnCategoryChange = vi.fn();
  const mockApi = {
    startEntry: vi.fn().mockResolvedValue({ id: 1 }),
    stopEntry: vi.fn().mockResolvedValue({ id: 1 }),
    createCategory: vi.fn().mockResolvedValue({ id: 3, name: 'New', color: '#000' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders start form when no active entry', () => {
    render(
      <TimeTracker 
        categories={mockCategories} 
        activeEntry={null} 
        onEntryChange={mockOnEntryChange}
        onCategoryChange={mockOnCategoryChange}
        currentApi={mockApi}
      />
    );
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });

  it('starts timer when category selected and start clicked', async () => {
    render(
      <TimeTracker 
        categories={mockCategories} 
        activeEntry={null} 
        onEntryChange={mockOnEntryChange}
        onCategoryChange={mockOnCategoryChange}
        currentApi={mockApi}
      />
    );
    
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '1' } });
    
    const startButton = screen.getByRole('button', { name: /start/i });
    fireEvent.click(startButton);
    
    await waitFor(() => {
      expect(mockApi.startEntry).toHaveBeenCalledWith(1, undefined);
      expect(mockOnEntryChange).toHaveBeenCalled();
    });
  });

  it('displays active timer with category name', () => {
    const activeEntry = {
      id: 1,
      category_id: 1,
      category_name: 'Development',
      category_color: '#007bff',
      note: 'Working on feature',
      start_time: new Date(Date.now() - 3661000).toISOString(),
      end_time: null,
      duration_minutes: null,
      created_at: '2024-01-01'
    };

    render(
      <TimeTracker 
        categories={mockCategories} 
        activeEntry={activeEntry} 
        onEntryChange={mockOnEntryChange}
        onCategoryChange={mockOnCategoryChange}
        currentApi={mockApi}
      />
    );
    
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.getByText('Working on feature')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
  });

  it('stops timer when stop button clicked', async () => {
    const activeEntry = {
      id: 1,
      category_id: 1,
      category_name: 'Development',
      category_color: '#007bff',
      note: null,
      start_time: new Date().toISOString(),
      end_time: null,
      duration_minutes: null,
      created_at: '2024-01-01'
    };

    render(
      <TimeTracker 
        categories={mockCategories} 
        activeEntry={activeEntry} 
        onEntryChange={mockOnEntryChange}
        onCategoryChange={mockOnCategoryChange}
        currentApi={mockApi}
      />
    );
    
    const stopButton = screen.getByRole('button', { name: /stop/i });
    fireEvent.click(stopButton);
    
    await waitFor(() => {
      expect(mockApi.stopEntry).toHaveBeenCalledWith(1);
      expect(mockOnEntryChange).toHaveBeenCalled();
    });
  });

  it('disables start button when no category selected', () => {
    render(
      <TimeTracker 
        categories={mockCategories} 
        activeEntry={null} 
        onEntryChange={mockOnEntryChange}
        onCategoryChange={mockOnCategoryChange}
        currentApi={mockApi}
      />
    );
    
    const startButton = screen.getByRole('button', { name: /start/i });
    expect(startButton).toBeDisabled();
  });
});
