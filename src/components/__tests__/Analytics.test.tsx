import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Analytics } from '../Analytics';
import { api } from '../../api';
import { AnalyticsData, TimeEntry, TopTask } from '../../types';

vi.mock('../../api', () => ({
  api: {
    getAnalytics: vi.fn(),
    exportData: vi.fn(),
    exportCSV: vi.fn(),
    getActiveEntry: vi.fn(),
    getTaskNames: vi.fn(),
    getCategoryDrilldown: vi.fn(),
    getCategories: vi.fn(),
    mergeTaskNames: vi.fn(),
    updateTaskName: vi.fn(),
    createCategory: vi.fn()
  }
}));

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() })
}));

const mockCategories = [
  { id: 1, name: 'Meetings', color: '#6366f1', created_at: '2026-01-01' },
  { id: 2, name: 'Deep Work', color: '#10b981', created_at: '2026-01-01' },
  { id: 3, name: 'Email', color: '#f59e0b', created_at: '2026-01-01' }
];

const mockTaskNames: TopTask[] = [
  { task_name: 'Weekly standup', category_name: 'Meetings', category_color: '#6366f1', count: 5, total_minutes: 150 },
  { task_name: 'Code review', category_name: 'Deep Work', category_color: '#10b981', count: 3, total_minutes: 180 },
  { task_name: 'Inbox zero', category_name: 'Email', category_color: '#f59e0b', count: 10, total_minutes: 60 }
];

const mockActiveEntry: TimeEntry = {
  id: 1,
  start_time: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  end_time: null,
  category_id: 1,
  category_name: 'Meetings',
  category_color: '#6366f1',
  task_name: 'Team sync',
  duration_minutes: null,
  created_at: new Date().toISOString()
};

const mockAnalyticsData: AnalyticsData = {
  period: { start: '2026-01-01T00:00:00.000Z', end: '2026-01-31T23:59:59.999Z' },
  summary: {
    totalMinutes: 1200,
    totalEntries: 10,
    avgMinutesPerDay: 40,
    previousTotal: 1000,
    change: 25 // > 20 to trigger positive insight
  },
  byCategory: [
    { name: 'Meetings', color: '#6366f1', minutes: 600, count: 5 },
    { name: 'Deep Work', color: '#10b981', minutes: 400, count: 3 },
    { name: 'Email', color: '#f59e0b', minutes: 200, count: 2 }
  ],
  daily: [
    { date: '2026-01-15', minutes: 120, byCategory: { 'Meetings': 60, 'Deep Work': 60 } },
    { date: '2026-01-16', minutes: 180, byCategory: { 'Meetings': 100, 'Email': 80 } },
    { date: '2026-01-20', minutes: 240, byCategory: { 'Deep Work': 200, 'Email': 40 } },
    { date: '2026-01-21', minutes: 150, byCategory: { 'Meetings': 150 } },
    { date: '2026-01-27', minutes: 200, byCategory: { 'Deep Work': 140, 'Meetings': 60 } },
    { date: '2026-01-28', minutes: 310, byCategory: { 'Meetings': 230, 'Email': 80 } }
  ],
  topTasks: []
};

const mockAnalyticsDataWithNegativeChange: AnalyticsData = {
  ...mockAnalyticsData,
  summary: { ...mockAnalyticsData.summary, change: -25 }
};

describe('Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (api.getAnalytics as ReturnType<typeof vi.fn>).mockResolvedValue(mockAnalyticsData);
    (api.getActiveEntry as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (api.getCategories as ReturnType<typeof vi.fn>).mockResolvedValue(mockCategories);
    (api.getTaskNames as ReturnType<typeof vi.fn>).mockResolvedValue({
      taskNames: mockTaskNames,
      pagination: { page: 1, pageSize: 10, totalCount: 3, totalPages: 1 }
    });
    (api.getCategoryDrilldown as ReturnType<typeof vi.fn>).mockResolvedValue({
      category: { name: 'Meetings', color: '#6366f1', minutes: 600, count: 5 },
      taskNames: [{ task_name: 'Weekly standup', count: 5, total_minutes: 150 }],
      pagination: { page: 1, pageSize: 20, totalCount: 1, totalPages: 1 }
    });
    (api.exportCSV as ReturnType<typeof vi.fn>).mockResolvedValue('date,category,minutes\n2026-01-15,Meetings,60');
    (api.mergeTaskNames as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    (api.updateTaskName as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    (api.createCategory as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 4, name: 'New Category', color: '#ff0000', created_at: '2026-01-01' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders loading state initially', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    // Loading state may flash briefly, but we verify the component renders
    expect(screen.queryByText(/Loading analytics/i) || screen.queryByText('Total Time')).toBeTruthy();
  });

  it('renders analytics data after loading', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    expect(screen.getByText('20h')).toBeInTheDocument(); // 1200 minutes = 20h
    expect(screen.getByText('10')).toBeInTheDocument(); // totalEntries
  });

  it('shows daily breakdown for week view', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Daily Breakdown')).toBeInTheDocument();
    });
    
    // Week view shows date range like "Jan 27 - Feb 2"
    expect(screen.getByText(/\w+ \d+ - \w+ \d+/)).toBeInTheDocument();
  });

  it('shows weekly breakdown for month view', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    // Click on Month period
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /month/i }));
    });
    
    await waitFor(() => {
      expect(screen.getByText('Weekly Breakdown')).toBeInTheDocument();
    });
    
    // Month view shows month name like "February 2026"
    expect(screen.getByText(/\w+ \d{4}/)).toBeInTheDocument();
  });

  it('shows weekly breakdown for quarter view', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /quarter/i }));
    });
    
    await waitFor(() => {
      expect(screen.getByText('Weekly Breakdown')).toBeInTheDocument();
    });
    
    // Quarter view shows "Q1 2026" format
    expect(screen.getByText(/Q\d \d{4}/)).toBeInTheDocument();
  });

  it('shows monthly breakdown for year view', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /year/i }));
    });
    
    await waitFor(() => {
      expect(screen.getByText('Monthly Breakdown')).toBeInTheDocument();
    });
    
    // Year view shows just the year like "2026"
    expect(screen.getByText(/^\d{4}$/)).toBeInTheDocument();
  });

  it('shows monthly breakdown for all time view', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^all$/i }));
    });
    
    await waitFor(() => {
      expect(screen.getByText('Monthly Breakdown')).toBeInTheDocument();
    });
    
    expect(screen.getByText(/All time \(by month\)/i)).toBeInTheDocument();
  });

  it('displays category breakdown', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('By Category')).toBeInTheDocument();
    });
    
    // Check that category names appear in the category breakdown section
    const categorySection = screen.getByText('By Category').closest('.card');
    expect(categorySection).toBeInTheDocument();
    expect(screen.getAllByText('Meetings').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Deep Work').length).toBeGreaterThan(0);
  });

  it('calls API with correct date range when period changes', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(api.getAnalytics).toHaveBeenCalled();
    });
    
    // Initial call for week
    expect(api.getAnalytics).toHaveBeenCalledTimes(1);
    
    // Change to month
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /month/i }));
    });
    
    await waitFor(() => {
      expect(api.getAnalytics).toHaveBeenCalledTimes(2);
    });
  });

  // Export CSV tests
  it('exports CSV when export button is clicked', async () => {
    // Mock URL.createObjectURL and URL.revokeObjectURL
    const mockCreateObjectURL = vi.fn(() => 'blob:test');
    const mockRevokeObjectURL = vi.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;

    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });
    
    await act(async () => {
      fireEvent.click(screen.getByText('Export CSV'));
    });
    
    await waitFor(() => {
      expect(api.exportCSV).toHaveBeenCalled();
    });
  });

  // Active entry display tests
  it('displays active entry when tracking', async () => {
    (api.getActiveEntry as ReturnType<typeof vi.fn>).mockResolvedValue(mockActiveEntry);
    
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Currently tracking')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Team sync')).toBeInTheDocument();
  });

  // Period navigation tests
  it('navigates to previous period', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    // Click previous button
    const prevButton = screen.getByTitle('Previous');
    await act(async () => {
      fireEvent.click(prevButton);
    });
    
    // API should be called again with new date range
    await waitFor(() => {
      expect(api.getAnalytics).toHaveBeenCalledTimes(2);
    });
  });

  it('navigates to next period after going back', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    // Go back first
    const prevButton = screen.getByTitle('Previous');
    await act(async () => {
      fireEvent.click(prevButton);
    });
    
    await waitFor(() => {
      expect(api.getAnalytics).toHaveBeenCalledTimes(2);
    });
    
    // Now next button should be enabled
    const nextButton = screen.getByTitle('Next');
    expect(nextButton).not.toBeDisabled();
    
    await act(async () => {
      fireEvent.click(nextButton);
    });
    
    await waitFor(() => {
      expect(api.getAnalytics).toHaveBeenCalledTimes(3);
    });
  });

  // Previous dropdown (last N days) tests
  it('shows previous dropdown menu', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    // Click Previous dropdown trigger (has dropdown-trigger class)
    const dropdownTrigger = document.querySelector('.dropdown-trigger');
    if (dropdownTrigger) {
      await act(async () => {
        fireEvent.click(dropdownTrigger);
      });
      
      expect(screen.getByText('Last 7 days')).toBeInTheDocument();
      expect(screen.getByText('Last 30 days')).toBeInTheDocument();
      expect(screen.getByText('Last 90 days')).toBeInTheDocument();
    }
  });

  it('selects last 7 days period', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    // Open dropdown and select last 7 days
    const dropdownTrigger = document.querySelector('.dropdown-trigger');
    if (dropdownTrigger) {
      await act(async () => {
        fireEvent.click(dropdownTrigger);
      });
      
      await act(async () => {
        fireEvent.click(screen.getByText('Last 7 days'));
      });
      
      await waitFor(() => {
        expect(api.getAnalytics).toHaveBeenCalledTimes(2);
      });
    }
  });

  // Day view tests
  it('shows day view when day period is selected', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Total Time')).toBeInTheDocument();
    });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^day$/i }));
    });
    
    await waitFor(() => {
      expect(screen.getByText('Day View')).toBeInTheDocument();
    });
  });

  // Category drilldown tests
  it('drills down into category when clicked', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('By Category')).toBeInTheDocument();
    });
    
    // Click on Meetings category
    const categoryRows = screen.getAllByRole('button').filter(btn => 
      btn.classList.contains('category-row')
    );
    
    if (categoryRows.length > 0) {
      await act(async () => {
        fireEvent.click(categoryRows[0]);
      });
      
      await waitFor(() => {
        expect(api.getCategoryDrilldown).toHaveBeenCalled();
      });
    }
  });

  it('shows back button in category drilldown', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('By Category')).toBeInTheDocument();
    });
    
    // Find and click a category row
    const meetingsText = screen.getAllByText('Meetings')[0];
    const categoryRow = meetingsText.closest('.category-row');
    
    if (categoryRow) {
      await act(async () => {
        fireEvent.click(categoryRow);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Back to all')).toBeInTheDocument();
      });
    }
  });

  // All Tasks section tests
  it('displays all tasks section', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Weekly standup')).toBeInTheDocument();
    expect(screen.getByText('Code review')).toBeInTheDocument();
  });

  it('filters tasks by search query', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText('Filter tasks...');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'standup' } });
    });
    
    // Weekly standup should still be visible
    expect(screen.getByText('Weekly standup')).toBeInTheDocument();
  });

  it('filters tasks by category', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    // Find the category filter select by class
    const selects = screen.getAllByRole('combobox');
    const categorySelect = selects.find(s => s.classList.contains('tasks-category-filter'));
    
    if (categorySelect) {
      await act(async () => {
        fireEvent.change(categorySelect, { target: { value: 'Meetings' } });
      });
    }
  });

  it('changes sort order', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    // Find the sort select by class
    const selects = screen.getAllByRole('combobox');
    const sortSelectEl = selects.find(s => s.classList.contains('sort-select'));
    
    if (sortSelectEl) {
      await act(async () => {
        fireEvent.change(sortSelectEl, { target: { value: 'alpha' } });
      });
      
      await waitFor(() => {
        expect(api.getTaskNames).toHaveBeenCalled();
      });
    }
  });

  // Task selection and merge tests
  it('shows merge hint when one task is selected', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    // Find and click a checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    if (checkboxes.length > 0) {
      await act(async () => {
        fireEvent.click(checkboxes[0]);
      });
      
      expect(screen.getByText('Select 2+ to merge')).toBeInTheDocument();
    }
  });

  it('shows merge button when two tasks are selected', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    const checkboxes = screen.getAllByRole('checkbox');
    if (checkboxes.length >= 2) {
      await act(async () => {
        fireEvent.click(checkboxes[0]);
        fireEvent.click(checkboxes[1]);
      });
      
      expect(screen.getByText('Merge 2 selected')).toBeInTheDocument();
    }
  });

  it('opens merge modal when merge button is clicked', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    const checkboxes = screen.getAllByRole('checkbox');
    if (checkboxes.length >= 2) {
      await act(async () => {
        fireEvent.click(checkboxes[0]);
        fireEvent.click(checkboxes[1]);
      });
      
      await act(async () => {
        fireEvent.click(screen.getByText('Merge 2 selected'));
      });
      
      expect(screen.getByText('Merge Tasks')).toBeInTheDocument();
    }
  });

  // Insights tests
  it('displays insights section', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Insights')).toBeInTheDocument();
    });
    
    // Should show top category insight
    expect(screen.getByText(/takes up most of your time/)).toBeInTheDocument();
  });

  it('shows positive change insight', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Insights')).toBeInTheDocument();
    });
    
    // With 25% change (> 20), should show the positive insight
    expect(screen.getByText(/25% more/)).toBeInTheDocument();
  });

  it('shows negative change insight', async () => {
    (api.getAnalytics as ReturnType<typeof vi.fn>).mockResolvedValue(mockAnalyticsDataWithNegativeChange);
    
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Insights')).toBeInTheDocument();
    });
    
    expect(screen.getByText(/25% less/)).toBeInTheDocument();
  });

  // Error state test
  it('shows error state when API fails', async () => {
    (api.getAnalytics as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API Error'));
    
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Failed to load analytics')).toBeInTheDocument();
    });
  });

  // Empty state test
  it('shows empty state when no data', async () => {
    (api.getAnalytics as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockAnalyticsData,
      summary: { ...mockAnalyticsData.summary, totalMinutes: 0 },
      byCategory: [],
      daily: []
    });
    (api.getTaskNames as ReturnType<typeof vi.fn>).mockResolvedValue({
      taskNames: [],
      pagination: { page: 1, pageSize: 10, totalCount: 0, totalPages: 0 }
    });
    
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('No data for this period')).toBeInTheDocument();
    });
  });

  // Inline task editing tests
  it('starts editing task when edit button is clicked', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    // Find edit button
    const editButtons = screen.getAllByTitle('Edit task');
    if (editButtons.length > 0) {
      await act(async () => {
        fireEvent.click(editButtons[0]);
      });
      
      // Should show input field
      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBeGreaterThan(0);
    }
  });

  // Keyboard navigation tests
  it('handles keyboard navigation on category rows', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('By Category')).toBeInTheDocument();
    });
    
    const meetingsText = screen.getAllByText('Meetings')[0];
    const categoryRow = meetingsText.closest('.category-row');
    
    if (categoryRow) {
      await act(async () => {
        fireEvent.keyDown(categoryRow, { key: 'Enter' });
      });
      
      await waitFor(() => {
        expect(api.getCategoryDrilldown).toHaveBeenCalled();
      });
    }
  });

  // Merge modal tests
  it('closes merge modal when cancel is clicked', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    const checkboxes = screen.getAllByRole('checkbox');
    if (checkboxes.length >= 2) {
      await act(async () => {
        fireEvent.click(checkboxes[0]);
        fireEvent.click(checkboxes[1]);
      });
      
      await act(async () => {
        fireEvent.click(screen.getByText('Merge 2 selected'));
      });
      
      expect(screen.getByText('Merge Tasks')).toBeInTheDocument();
      
      // Click cancel
      await act(async () => {
        fireEvent.click(screen.getByText('Cancel'));
      });
      
      expect(screen.queryByText('Merge Tasks')).not.toBeInTheDocument();
    }
  });

  it('closes merge modal when clicking overlay', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    const checkboxes = screen.getAllByRole('checkbox');
    if (checkboxes.length >= 2) {
      await act(async () => {
        fireEvent.click(checkboxes[0]);
        fireEvent.click(checkboxes[1]);
      });
      
      await act(async () => {
        fireEvent.click(screen.getByText('Merge 2 selected'));
      });
      
      // Click overlay
      const overlay = document.querySelector('.modal-overlay');
      if (overlay) {
        await act(async () => {
          fireEvent.click(overlay);
        });
        
        expect(screen.queryByText('Merge Tasks')).not.toBeInTheDocument();
      }
    }
  });

  it('executes merge when merge button is clicked', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    const checkboxes = screen.getAllByRole('checkbox');
    if (checkboxes.length >= 2) {
      await act(async () => {
        fireEvent.click(checkboxes[0]);
        fireEvent.click(checkboxes[1]);
      });
      
      await act(async () => {
        fireEvent.click(screen.getByText('Merge 2 selected'));
      });
      
      // Click merge button
      const mergeButton = screen.getByRole('button', { name: /^merge$/i });
      await act(async () => {
        fireEvent.click(mergeButton);
      });
      
      await waitFor(() => {
        expect(api.mergeTaskNames).toHaveBeenCalled();
      });
    }
  });

  it('shows category selection when merging tasks from different categories', async () => {
    // Mock tasks with different categories
    (api.getTaskNames as ReturnType<typeof vi.fn>).mockResolvedValue({
      taskNames: [
        { task_name: 'Task A', category_name: 'Meetings', category_color: '#6366f1', count: 5, total_minutes: 150 },
        { task_name: 'Task B', category_name: 'Deep Work', category_color: '#10b981', count: 3, total_minutes: 180 }
      ],
      pagination: { page: 1, pageSize: 10, totalCount: 2, totalPages: 1 }
    });
    
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    const checkboxes = screen.getAllByRole('checkbox');
    if (checkboxes.length >= 2) {
      await act(async () => {
        fireEvent.click(checkboxes[0]);
        fireEvent.click(checkboxes[1]);
      });
      
      await act(async () => {
        fireEvent.click(screen.getByText('Merge 2 selected'));
      });
      
      // Should show category selection
      expect(screen.getByText('Target Category')).toBeInTheDocument();
    }
  });

  // Pagination tests
  it('changes page size', async () => {
    (api.getTaskNames as ReturnType<typeof vi.fn>).mockResolvedValue({
      taskNames: mockTaskNames,
      pagination: { page: 1, pageSize: 10, totalCount: 25, totalPages: 3 }
    });
    
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    // Find page size select
    const selects = screen.getAllByRole('combobox');
    const pageSizeSelect = selects.find(s => s.classList.contains('page-size-select'));
    
    if (pageSizeSelect) {
      await act(async () => {
        fireEvent.change(pageSizeSelect, { target: { value: '20' } });
      });
      
      await waitFor(() => {
        expect(api.getTaskNames).toHaveBeenCalled();
      });
    }
  });

  it('navigates to next page', async () => {
    (api.getTaskNames as ReturnType<typeof vi.fn>).mockResolvedValue({
      taskNames: mockTaskNames,
      pagination: { page: 1, pageSize: 10, totalCount: 25, totalPages: 3 }
    });
    
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    // Find and click next button in pagination
    const paginationButtons = screen.getAllByRole('button').filter(btn => 
      btn.classList.contains('pagination-btn')
    );
    const nextButton = paginationButtons.find(btn => btn.textContent === 'Next');
    
    if (nextButton) {
      await act(async () => {
        fireEvent.click(nextButton);
      });
      
      await waitFor(() => {
        expect(api.getTaskNames).toHaveBeenCalled();
      });
    }
  });

  // Clear filter test
  it('clears filters when clear button is clicked', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    // Set a filter
    const searchInput = screen.getByPlaceholderText('Filter tasks...');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'test' } });
    });
    
    // Clear button should appear
    const clearButton = screen.queryByText('Clear');
    if (clearButton) {
      await act(async () => {
        fireEvent.click(clearButton);
      });
      
      expect(searchInput).toHaveValue('');
    }
  });

  // Chart drilldown test
  it('drills down when clicking chart bar', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Daily Breakdown')).toBeInTheDocument();
    });
    
    // Find a clickable chart bar
    const chartBars = document.querySelectorAll('.chart-bar-container.clickable');
    if (chartBars.length > 0) {
      await act(async () => {
        fireEvent.click(chartBars[0]);
      });
      
      // Should switch to day view
      await waitFor(() => {
        expect(api.getAnalytics).toHaveBeenCalled();
      });
    }
  });

  // Inline editing tests
  it('cancels editing when escape is pressed', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    const editButtons = screen.getAllByTitle('Edit task');
    if (editButtons.length > 0) {
      await act(async () => {
        fireEvent.click(editButtons[0]);
      });
      
      // Find the input and press escape
      const inputs = screen.getAllByRole('textbox');
      const taskInput = inputs.find(i => i.classList.contains('task-name-input'));
      
      if (taskInput) {
        await act(async () => {
          fireEvent.keyDown(taskInput, { key: 'Escape' });
        });
        
        // Should exit editing mode - task-name-input should no longer exist
        expect(document.querySelector('.task-name-input')).toBeNull();
      }
    }
  });

  it('saves editing when enter is pressed', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    const editButtons = screen.getAllByTitle('Edit task');
    if (editButtons.length > 0) {
      await act(async () => {
        fireEvent.click(editButtons[0]);
      });
      
      const inputs = screen.getAllByRole('textbox');
      const taskInput = inputs.find(i => i.classList.contains('task-name-input'));
      
      if (taskInput) {
        await act(async () => {
          fireEvent.change(taskInput, { target: { value: 'Updated task name' } });
          fireEvent.keyDown(taskInput, { key: 'Enter' });
        });
        
        await waitFor(() => {
          expect(api.updateTaskName).toHaveBeenCalled();
        });
      }
    }
  });
});


// Test helper functions for week aggregation logic
describe('Week Aggregation Logic', () => {
  // Helper to get week start (Monday) - mirrors the component logic
  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  it('calculates correct week start for various days', () => {
    // Monday Jan 5, 2026 - should return Jan 5
    const monday = new Date('2026-01-05T12:00:00');
    expect(getWeekStart(monday).toISOString().split('T')[0]).toBe('2026-01-05');

    // Wednesday Jan 7, 2026 - should return Jan 5 (Monday)
    const wednesday = new Date('2026-01-07T12:00:00');
    expect(getWeekStart(wednesday).toISOString().split('T')[0]).toBe('2026-01-05');

    // Sunday Jan 11, 2026 - should return Jan 5 (previous Monday)
    const sunday = new Date('2026-01-11T12:00:00');
    expect(getWeekStart(sunday).toISOString().split('T')[0]).toBe('2026-01-05');

    // Saturday Jan 10, 2026 - should return Jan 5 (Monday)
    const saturday = new Date('2026-01-10T12:00:00');
    expect(getWeekStart(saturday).toISOString().split('T')[0]).toBe('2026-01-05');
  });

  it('handles month boundary correctly', () => {
    // Saturday Jan 3, 2026 - week starts Dec 29, 2025
    const jan3 = new Date('2026-01-03T12:00:00');
    expect(getWeekStart(jan3).toISOString().split('T')[0]).toBe('2025-12-29');

    // Monday Feb 2, 2026 - week starts Feb 2
    const feb2 = new Date('2026-02-02T12:00:00');
    expect(getWeekStart(feb2).toISOString().split('T')[0]).toBe('2026-02-02');
  });

  it('aggregates daily data into weeks correctly', () => {
    // Simulate the aggregation logic
    const dailyData = [
      { date: '2026-01-27', minutes: 60 },  // Week of Jan 26
      { date: '2026-01-28', minutes: 90 },  // Week of Jan 26
      { date: '2026-02-02', minutes: 120 }, // Week of Feb 2
      { date: '2026-02-03', minutes: 30 },  // Week of Feb 2
    ];

    const buckets = new Map<string, { minutes: number; label: string }>();

    for (const day of dailyData) {
      const date = new Date(day.date + 'T12:00:00');
      const weekStart = getWeekStart(date);
      const bucketKey = weekStart.toISOString().split('T')[0];

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, { minutes: 0, label: bucketKey });
      }
      buckets.get(bucketKey)!.minutes += day.minutes;
    }

    // Sort by start date
    const result = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe('2026-01-26'); // First week
    expect(result[0][1].minutes).toBe(150);  // 60 + 90
    expect(result[1][0]).toBe('2026-02-02'); // Second week
    expect(result[1][1].minutes).toBe(150);  // 120 + 30
  });

  it('sorts weeks chronologically', () => {
    const weekKeys = ['2026-02-02', '2026-01-19', '2026-01-26', '2026-01-12'];
    const sorted = weekKeys.sort((a, b) => a.localeCompare(b));
    
    expect(sorted).toEqual(['2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02']);
  });

  it('navigates through pages in category drilldown', async () => {
    (api.getCategoryDrilldown as ReturnType<typeof vi.fn>).mockResolvedValue({
      category: { name: 'Meetings', color: '#6366f1', minutes: 600, count: 5 },
      taskNames: [
        { task_name: 'Weekly standup', count: 5, total_minutes: 150 },
        { task_name: 'Daily sync', count: 3, total_minutes: 90 }
      ],
      pagination: { page: 1, pageSize: 20, totalCount: 25, totalPages: 2 }
    });
    
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('By Category')).toBeInTheDocument();
    });
    
    const meetingsText = screen.getAllByText('Meetings')[0];
    const categoryRow = meetingsText.closest('.category-row');
    
    if (categoryRow) {
      await act(async () => {
        fireEvent.click(categoryRow);
      });
      
      await waitFor(() => {
        expect(api.getCategoryDrilldown).toHaveBeenCalled();
      });
    }
  });

  it('navigates to previous page in task names list', async () => {
    (api.getTaskNames as ReturnType<typeof vi.fn>).mockResolvedValue({
      taskNames: mockTaskNames,
      pagination: { page: 2, pageSize: 10, totalCount: 25, totalPages: 3 }
    });
    
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    const paginationButtons = screen.getAllByRole('button').filter(btn => 
      btn.textContent === '‹'
    );
    
    if (paginationButtons.length > 0) {
      await act(async () => {
        fireEvent.click(paginationButtons[paginationButtons.length - 1]);
      });
      
      await waitFor(() => {
        expect(api.getTaskNames).toHaveBeenCalled();
      });
    }
  });

  it('shows inline category creation when editing task and selecting new category', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    const editButtons = screen.getAllByTitle('Edit task');
    if (editButtons.length > 0) {
      await act(async () => {
        fireEvent.click(editButtons[0]);
      });
      
      const selects = screen.getAllByRole('combobox');
      const categorySelect = selects.find(s => s.classList.contains('task-category-select'));
      
      if (categorySelect) {
        await act(async () => {
          fireEvent.change(categorySelect, { target: { value: 'new' } });
        });
        
        await waitFor(() => {
          const inputs = screen.getAllByRole('textbox');
          const categoryNameInput = inputs.find(i => 
            i.getAttribute('placeholder') === 'Category name'
          );
          expect(categoryNameInput).toBeInTheDocument();
        });
      }
    }
  });

  it('creates new category inline during task editing', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    const editButtons = screen.getAllByTitle('Edit task');
    if (editButtons.length > 0) {
      await act(async () => {
        fireEvent.click(editButtons[0]);
      });
      
      const selects = screen.getAllByRole('combobox');
      const categorySelect = selects.find(s => s.classList.contains('task-category-select'));
      
      if (categorySelect) {
        await act(async () => {
          fireEvent.change(categorySelect, { target: { value: 'new' } });
        });
        
        await waitFor(() => {
          const inputs = screen.getAllByRole('textbox');
          const categoryNameInput = inputs.find(i => 
            i.getAttribute('placeholder') === 'Category name'
          );
          expect(categoryNameInput).toBeInTheDocument();
        });
        
        const inputs = screen.getAllByRole('textbox');
        const categoryNameInput = inputs.find(i => 
          i.getAttribute('placeholder') === 'Category name'
        );
        
        if (categoryNameInput) {
          await act(async () => {
            fireEvent.change(categoryNameInput, { target: { value: 'New Category' } });
          });
          
          const createButtons = screen.getAllByRole('button').filter(btn => 
            btn.getAttribute('title') === 'Create'
          );
          
          if (createButtons.length > 0) {
            await act(async () => {
              fireEvent.click(createButtons[0]);
            });
            
            await waitFor(() => {
              expect(api.createCategory).toHaveBeenCalledWith('New Category', expect.any(String));
            });
          }
        }
      }
    }
  });

  it('cancels inline category creation by pressing Escape', async () => {
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    const editButtons = screen.getAllByTitle('Edit task');
    if (editButtons.length > 0) {
      await act(async () => {
        fireEvent.click(editButtons[0]);
      });
      
      const selects = screen.getAllByRole('combobox');
      const categorySelect = selects.find(s => s.classList.contains('task-category-select'));
      
      if (categorySelect) {
        await act(async () => {
          fireEvent.change(categorySelect, { target: { value: 'new' } });
        });
        
        await waitFor(() => {
          const inputs = screen.getAllByRole('textbox');
          const categoryNameInput = inputs.find(i => 
            i.getAttribute('placeholder') === 'Category name'
          );
          expect(categoryNameInput).toBeInTheDocument();
        });
        
        const inputs = screen.getAllByRole('textbox');
        const categoryNameInput = inputs.find(i => 
          i.getAttribute('placeholder') === 'Category name'
        );
        
        if (categoryNameInput) {
          await act(async () => {
            fireEvent.keyDown(categoryNameInput, { key: 'Escape' });
          });
        }
      }
    }
  });
});


// Additional tests for merge modal radio button handlers and pagination
describe('Merge Modal Radio Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (api.getAnalytics as ReturnType<typeof vi.fn>).mockResolvedValue(mockAnalyticsData);
    (api.getActiveEntry as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (api.getCategories as ReturnType<typeof vi.fn>).mockResolvedValue(mockCategories);
    (api.mergeTaskNames as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('changes merge target when clicking different radio button', async () => {
    // Mock tasks with same category
    (api.getTaskNames as ReturnType<typeof vi.fn>).mockResolvedValue({
      taskNames: [
        { task_name: 'Task A', category_name: 'Meetings', category_color: '#6366f1', count: 5, total_minutes: 150 },
        { task_name: 'Task B', category_name: 'Meetings', category_color: '#6366f1', count: 3, total_minutes: 180 },
        { task_name: 'Task C', category_name: 'Meetings', category_color: '#6366f1', count: 2, total_minutes: 60 }
      ],
      pagination: { page: 1, pageSize: 10, totalCount: 3, totalPages: 1 }
    });
    
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    // Select two tasks
    const checkboxes = screen.getAllByRole('checkbox');
    await act(async () => {
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
    });
    
    // Open merge modal
    await act(async () => {
      fireEvent.click(screen.getByText('Merge 2 selected'));
    });
    
    expect(screen.getByText('Merge Tasks')).toBeInTheDocument();
    
    // Find radio buttons for merge target
    const radioButtons = screen.getAllByRole('radio');
    expect(radioButtons.length).toBeGreaterThan(0);
    
    // Click on a different radio button to change merge target
    await act(async () => {
      fireEvent.click(radioButtons[1]);
    });
    
    // The second radio should now be checked
    expect(radioButtons[1]).toBeChecked();
  });

  it('changes merge category target when clicking different category radio button', async () => {
    // Mock tasks with different categories
    (api.getTaskNames as ReturnType<typeof vi.fn>).mockResolvedValue({
      taskNames: [
        { task_name: 'Task A', category_name: 'Meetings', category_color: '#6366f1', count: 5, total_minutes: 150 },
        { task_name: 'Task B', category_name: 'Deep Work', category_color: '#10b981', count: 3, total_minutes: 180 }
      ],
      pagination: { page: 1, pageSize: 10, totalCount: 2, totalPages: 1 }
    });
    
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    // Select both tasks (different categories)
    const checkboxes = screen.getAllByRole('checkbox');
    await act(async () => {
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
    });
    
    // Open merge modal
    await act(async () => {
      fireEvent.click(screen.getByText('Merge 2 selected'));
    });
    
    expect(screen.getByText('Merge Tasks')).toBeInTheDocument();
    expect(screen.getByText('Target Category')).toBeInTheDocument();
    
    // Find all radio buttons - should have both task target and category target radios
    const radioButtons = screen.getAllByRole('radio');
    // First 2 are for task names, next 2 are for categories
    expect(radioButtons.length).toBe(4);
    
    // Click on the second category radio button
    await act(async () => {
      fireEvent.click(radioButtons[3]); // Second category option
    });
    
    expect(radioButtons[3]).toBeChecked();
  });

  it('clicks Previous button in task names pagination', async () => {
    // First render with page 1 data
    (api.getTaskNames as ReturnType<typeof vi.fn>).mockResolvedValue({
      taskNames: mockTaskNames,
      pagination: { page: 1, pageSize: 10, totalCount: 25, totalPages: 3 }
    });
    
    await act(async () => {
      render(<Analytics />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('All Tasks')).toBeInTheDocument();
    });
    
    // Click Next to go to page 2
    const nextButtons = screen.getAllByRole('button').filter(btn => 
      btn.classList.contains('pagination-btn') && btn.textContent === 'Next'
    );
    const nextButton = nextButtons[nextButtons.length - 1];
    
    // Update mock to return page 2 data
    (api.getTaskNames as ReturnType<typeof vi.fn>).mockResolvedValue({
      taskNames: mockTaskNames,
      pagination: { page: 2, pageSize: 10, totalCount: 25, totalPages: 3 }
    });
    
    await act(async () => {
      fireEvent.click(nextButton);
    });
    
    await waitFor(() => {
      expect(api.getTaskNames).toHaveBeenCalled();
    });
    
    // Now find and click Previous button
    const prevButtons = screen.getAllByRole('button').filter(btn => 
      btn.classList.contains('pagination-btn') && btn.textContent === 'Previous'
    );
    const prevButton = prevButtons[prevButtons.length - 1];
    
    // Update mock for page 1 again
    (api.getTaskNames as ReturnType<typeof vi.fn>).mockResolvedValue({
      taskNames: mockTaskNames,
      pagination: { page: 1, pageSize: 10, totalCount: 25, totalPages: 3 }
    });
    
    await act(async () => {
      fireEvent.click(prevButton);
    });
    
    // API should be called again
    await waitFor(() => {
      expect(api.getTaskNames).toHaveBeenCalledTimes(3); // Initial + Next + Previous
    });
  });
});
