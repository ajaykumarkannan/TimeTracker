import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { TimeEntryList } from '../TimeEntryList';
import { api } from '../../api';
import type { Category, TimeEntry } from '../../types';

vi.mock('../../api', () => ({
  api: {
    getTimeEntries: vi.fn(),
    getTaskNameSuggestions: vi.fn(),
    createManualEntry: vi.fn(),
    createCategory: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
    deleteEntriesByDate: vi.fn()
  }
}));

const mockApi = api as any;

const categories: Category[] = [
  { id: 1, name: 'Deep Work', color: '#10b981', created_at: '2026-02-01' },
  { id: 2, name: 'Meetings', color: '#6366f1', created_at: '2026-02-01' }
];

const baseEntry = (overrides: Partial<TimeEntry>): TimeEntry => ({
  id: 1,
  user_id: 1,
  category_id: 1,
  category_name: 'Deep Work',
  category_color: '#10b981',
  task_name: 'Focus',
  start_time: '2026-02-10T10:00:00.000Z',
  end_time: '2026-02-10T10:30:00.000Z',
  scheduled_end_time: null,
  duration_minutes: 30,
  created_at: '2026-02-10T10:00:00.000Z',
  ...overrides
});

describe('TimeEntryList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getTaskNameSuggestions.mockResolvedValue([]);
    mockApi.getTimeEntries.mockResolvedValue([]);
    mockApi.createManualEntry.mockResolvedValue({ id: 123 });
    mockApi.createCategory.mockResolvedValue({ id: 3, name: 'New', color: '#333', created_at: '2026-02-01' });
    mockApi.updateEntry.mockResolvedValue({});
    mockApi.deleteEntry.mockResolvedValue({});
    mockApi.deleteEntriesByDate.mockResolvedValue({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  });

  it('opens manual entry modal and validates required fields', async () => {
    render(
      <TimeEntryList
        categories={categories}
        onEntryChange={vi.fn()}
        onCategoryChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockApi.getTimeEntries).toHaveBeenCalled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add Entry' }));
    });

    const submitButton = screen.getByRole('button', { name: 'Add Entry' });
    fireEvent.click(submitButton);

    expect(await screen.findByText('Please select a category')).toBeInTheDocument();

    const modal = document.querySelector('.manual-entry-modal') as HTMLElement;
    const categorySelect = modal.querySelector('select') as HTMLSelectElement;
    fireEvent.change(categorySelect, { target: { value: '1' } });
    const timeInputs = modal.querySelectorAll('input[type="time"]') as NodeListOf<HTMLInputElement>;
    const startTimeInputEmpty = timeInputs[0];
    fireEvent.change(startTimeInputEmpty, { target: { value: '' } });

    fireEvent.click(submitButton);
    expect(await screen.findByText('Please set start and end date/time')).toBeInTheDocument();

    const timeInputsAfter = modal.querySelectorAll('input[type="time"]') as NodeListOf<HTMLInputElement>;
    const startTimeInputFilled = timeInputsAfter[0];
    const endTimeInputFilled = timeInputsAfter[1];
    fireEvent.change(startTimeInputFilled, { target: { value: '10:00' } });
    fireEvent.change(endTimeInputFilled, { target: { value: '10:00' } });
    fireEvent.click(submitButton);

    expect(await screen.findByText('End time must be after start time')).toBeInTheDocument();
  });

  it('submits a valid manual entry', async () => {
    render(
      <TimeEntryList
        categories={categories}
        onEntryChange={vi.fn()}
        onCategoryChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockApi.getTimeEntries).toHaveBeenCalled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add Entry' }));
    });

    const modal = document.querySelector('.manual-entry-modal') as HTMLElement;
    const categorySelect = modal.querySelector('select') as HTMLSelectElement;
    fireEvent.change(categorySelect, { target: { value: '1' } });
    const dateInputs = modal.querySelectorAll('input[type="date"]') as NodeListOf<HTMLInputElement>;
    const timeInputs = modal.querySelectorAll('input[type="time"]') as NodeListOf<HTMLInputElement>;
    fireEvent.change(dateInputs[0], { target: { value: '2026-02-10' } });
    fireEvent.change(timeInputs[0], { target: { value: '10:00' } });
    fireEvent.change(dateInputs[1], { target: { value: '2026-02-10' } });
    fireEvent.change(timeInputs[1], { target: { value: '10:30' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Entry' }));

    await waitFor(() => {
      expect(mockApi.createManualEntry).toHaveBeenCalled();
    });
  });

  it('shows filters panel and clears filters', async () => {
    render(
      <TimeEntryList
        categories={categories}
        onEntryChange={vi.fn()}
        onCategoryChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockApi.getTimeEntries).toHaveBeenCalled();
    });

    await act(async () => {
      fireEvent.click(screen.getByTitle('Toggle filters'));
    });

    const searchInput = screen.getByPlaceholderText('Search tasks & categories...');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'focus' } });
      fireEvent.click(screen.getByText('Clear all'));
    });

    expect(searchInput).toHaveValue('');
  });

  it('renders cleanup suggestions and applies all actions', async () => {
    const entries = [
      baseEntry({ id: 1 }),
      baseEntry({ id: 2, start_time: '2026-02-10T10:30:00.000Z', end_time: '2026-02-10T11:00:00.000Z' }),
      baseEntry({
        id: 3,
        category_id: 2,
        category_name: 'Meetings',
        category_color: '#6366f1',
        task_name: 'Short',
        start_time: '2026-02-10T12:00:00.000Z',
        end_time: '2026-02-10T12:00:30.000Z',
        duration_minutes: 0
      })
    ];
    mockApi.getTimeEntries.mockResolvedValueOnce(entries);

    const onEntryChange = vi.fn();
    render(
      <TimeEntryList
        categories={categories}
        onEntryChange={onEntryChange}
        onCategoryChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Cleanup Suggestions')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply All' }));
    });

    await waitFor(() => {
      expect(mockApi.updateEntry).toHaveBeenCalled();
      expect(mockApi.deleteEntry).toHaveBeenCalled();
      expect(onEntryChange).toHaveBeenCalled();
    });
  });

  it('edits entry description and saves on blur', async () => {
    const entries = [baseEntry({ id: 10 })];
    mockApi.getTimeEntries.mockResolvedValueOnce(entries);

    render(
      <TimeEntryList
        categories={categories}
        onEntryChange={vi.fn()}
        onCategoryChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Focus')).toBeInTheDocument();
    });

    const description = screen.getByText('Focus');
    await act(async () => {
      fireEvent.doubleClick(description);
    });

    const input = screen.getByPlaceholderText('Add a task name...');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Deep focus' } });
      fireEvent.blur(input);
    });

    await waitFor(() => {
      expect(mockApi.updateEntry).toHaveBeenCalled();
    });
  });

  it('shows overlap warning when entries intersect', async () => {
    const entries = [
      baseEntry({ id: 1, start_time: '2026-02-10T10:00:00.000Z', end_time: '2026-02-10T11:00:00.000Z' }),
      baseEntry({ id: 2, start_time: '2026-02-10T10:30:00.000Z', end_time: '2026-02-10T11:30:00.000Z' })
    ];
    mockApi.getTimeEntries.mockResolvedValueOnce(entries);

    render(
      <TimeEntryList
        categories={categories}
        onEntryChange={vi.fn()}
        onCategoryChange={vi.fn()}
      />
    );

    await waitFor(() => {
      const warnings = document.querySelectorAll('.overlap-warning');
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  it('deletes entries for a day when confirmed', async () => {
    const entries = [baseEntry({ id: 20 })];
    mockApi.getTimeEntries.mockResolvedValueOnce(entries);

    render(
      <TimeEntryList
        categories={categories}
        onEntryChange={vi.fn()}
        onCategoryChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTitle('Delete all entries for this day')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTitle('Delete all entries for this day'));
    });

    await waitFor(() => {
      expect(mockApi.deleteEntriesByDate).toHaveBeenCalled();
    });
  });
});
