import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { TimeTracker } from '../TimeTracker';
import { ThemeProvider } from '../../contexts/ThemeContext';

// Mock the api module
vi.mock('../../api', () => ({
  api: {
    startEntry: vi.fn().mockResolvedValue({ id: 1 }),
    stopEntry: vi.fn().mockResolvedValue({ id: 1 }),
    createCategory: vi.fn().mockResolvedValue({ id: 3, name: 'New', color: '#000' }),
    getDescriptionSuggestions: vi.fn().mockResolvedValue([]),
  }
}));

import { api } from '../../api';

// Helper to render with ThemeProvider and wait for effects
const renderWithTheme = async (ui: React.ReactElement) => {
  let result;
  await act(async () => {
    result = render(<ThemeProvider>{ui}</ThemeProvider>);
  });
  // Wait for any pending state updates
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  return result!;
};

describe('TimeTracker', () => {
  const mockCategories = [
    { id: 1, name: 'Development', color: '#007bff', created_at: '2024-01-01' },
    { id: 2, name: 'Meetings', color: '#28a745', created_at: '2024-01-01' }
  ];

  const mockEntries = [
    {
      id: 1,
      category_id: 1,
      category_name: 'Development',
      category_color: '#007bff',
      description: 'Previous task',
      start_time: '2024-01-01T10:00:00Z',
      end_time: '2024-01-01T11:00:00Z',
      duration_minutes: 60,
      created_at: '2024-01-01'
    }
  ];

  const mockOnEntryChange = vi.fn();
  const mockOnCategoryChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders start form when no active entry', async () => {
    await renderWithTheme(
      <TimeTracker 
        categories={mockCategories} 
        activeEntry={null}
        entries={mockEntries}
        onEntryChange={mockOnEntryChange}
        onCategoryChange={mockOnCategoryChange}
      />
    );
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });

  it('starts timer when category selected and start clicked', async () => {
    await renderWithTheme(
      <TimeTracker 
        categories={mockCategories} 
        activeEntry={null}
        entries={mockEntries}
        onEntryChange={mockOnEntryChange}
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    const select = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(select, { target: { value: '1' } });
    });
    
    const startButton = screen.getByRole('button', { name: /start/i });
    await act(async () => {
      fireEvent.click(startButton);
    });
    
    await waitFor(() => {
      expect(api.startEntry).toHaveBeenCalledWith(1, undefined);
      expect(mockOnEntryChange).toHaveBeenCalled();
    });
  });

  it('displays active timer with category name', async () => {
    const activeEntry = {
      id: 1,
      category_id: 1,
      category_name: 'Development',
      category_color: '#007bff',
      description: 'Working on feature',
      start_time: new Date(Date.now() - 3661000).toISOString(),
      end_time: null,
      duration_minutes: null,
      created_at: '2024-01-01'
    };

    await renderWithTheme(
      <TimeTracker 
        categories={mockCategories} 
        activeEntry={activeEntry}
        entries={mockEntries}
        onEntryChange={mockOnEntryChange}
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    // Use getAllByText since Development appears in both active timer and switch options
    expect(screen.getAllByText('Development').length).toBeGreaterThan(0);
    expect(screen.getByText('Working on feature')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
  });

  it('stops timer when stop button clicked', async () => {
    const activeEntry = {
      id: 1,
      category_id: 1,
      category_name: 'Development',
      category_color: '#007bff',
      description: null,
      start_time: new Date().toISOString(),
      end_time: null,
      duration_minutes: null,
      created_at: '2024-01-01'
    };

    await renderWithTheme(
      <TimeTracker 
        categories={mockCategories} 
        activeEntry={activeEntry}
        entries={mockEntries}
        onEntryChange={mockOnEntryChange}
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    const stopButton = screen.getByRole('button', { name: /stop/i });
    await act(async () => {
      fireEvent.click(stopButton);
    });
    
    await waitFor(() => {
      expect(api.stopEntry).toHaveBeenCalledWith(1);
      expect(mockOnEntryChange).toHaveBeenCalled();
    });
  });

  it('disables start button when no category selected', async () => {
    await renderWithTheme(
      <TimeTracker 
        categories={mockCategories} 
        activeEntry={null}
        entries={mockEntries}
        onEntryChange={mockOnEntryChange}
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    const startButton = screen.getByRole('button', { name: /start/i });
    expect(startButton).toBeDisabled();
  });
});
