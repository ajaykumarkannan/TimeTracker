import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

// Helper to render with ThemeProvider
const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
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

  it('renders start form when no active entry', () => {
    renderWithTheme(
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
    renderWithTheme(
      <TimeTracker 
        categories={mockCategories} 
        activeEntry={null}
        entries={mockEntries}
        onEntryChange={mockOnEntryChange}
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '1' } });
    
    const startButton = screen.getByRole('button', { name: /start/i });
    fireEvent.click(startButton);
    
    await waitFor(() => {
      expect(api.startEntry).toHaveBeenCalledWith(1, undefined);
      expect(mockOnEntryChange).toHaveBeenCalled();
    });
  });

  it('displays active timer with category name', () => {
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

    renderWithTheme(
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

    renderWithTheme(
      <TimeTracker 
        categories={mockCategories} 
        activeEntry={activeEntry}
        entries={mockEntries}
        onEntryChange={mockOnEntryChange}
        onCategoryChange={mockOnCategoryChange}
      />
    );
    
    const stopButton = screen.getByRole('button', { name: /stop/i });
    fireEvent.click(stopButton);
    
    await waitFor(() => {
      expect(api.stopEntry).toHaveBeenCalledWith(1);
      expect(mockOnEntryChange).toHaveBeenCalled();
    });
  });

  it('disables start button when no category selected', () => {
    renderWithTheme(
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
