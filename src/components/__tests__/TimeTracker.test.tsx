import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TimeTracker } from '../TimeTracker';
import { api } from '../../api';

vi.mock('../../api');

describe('TimeTracker', () => {
  const mockCategories = [
    { id: 1, name: 'Development', color: '#007bff', created_at: '2024-01-01' },
    { id: 2, name: 'Meetings', color: '#28a745', created_at: '2024-01-01' }
  ];

  const mockOnUpdate = vi.fn();

  it('renders start form when no active entry', () => {
    render(<TimeTracker categories={mockCategories} activeEntry={null} onUpdate={mockOnUpdate} />);
    expect(screen.getByText('Start Tracking')).toBeInTheDocument();
    expect(screen.getByText('Start Timer')).toBeInTheDocument();
  });

  it('starts timer when category selected and start clicked', async () => {
    vi.mocked(api.startEntry).mockResolvedValue({} as any);
    
    render(<TimeTracker categories={mockCategories} activeEntry={null} onUpdate={mockOnUpdate} />);
    
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '1' } });
    
    const startButton = screen.getByText('Start Timer');
    fireEvent.click(startButton);
    
    await waitFor(() => {
      expect(api.startEntry).toHaveBeenCalledWith(1, undefined);
      expect(mockOnUpdate).toHaveBeenCalled();
    });
  });

  it('displays active timer with elapsed time', () => {
    const activeEntry = {
      id: 1,
      category_id: 1,
      category_name: 'Development',
      category_color: '#007bff',
      note: 'Working on feature',
      start_time: new Date(Date.now() - 3661000).toISOString(), // 1h 1m 1s ago
      end_time: null,
      duration_minutes: null,
      created_at: '2024-01-01'
    };

    render(<TimeTracker categories={mockCategories} activeEntry={activeEntry} onUpdate={mockOnUpdate} />);
    
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.getByText('Working on feature')).toBeInTheDocument();
    expect(screen.getByText('Stop Timer')).toBeInTheDocument();
  });

  it('stops timer when stop button clicked', async () => {
    vi.mocked(api.stopEntry).mockResolvedValue({} as any);
    
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

    render(<TimeTracker categories={mockCategories} activeEntry={activeEntry} onUpdate={mockOnUpdate} />);
    
    const stopButton = screen.getByText('Stop Timer');
    fireEvent.click(stopButton);
    
    await waitFor(() => {
      expect(api.stopEntry).toHaveBeenCalledWith(1);
      expect(mockOnUpdate).toHaveBeenCalled();
    });
  });

  it('disables start button when no category selected', () => {
    render(<TimeTracker categories={mockCategories} activeEntry={null} onUpdate={mockOnUpdate} />);
    
    const startButton = screen.getByText('Start Timer');
    expect(startButton).toBeDisabled();
  });
});
