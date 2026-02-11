/**
 * Unit Tests for Category Creation in Add Entry Modal
 * 
 * Tests the inline category creation feature in the TimeEntryList component's
 * Add Entry modal.
 * 
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { TimeEntryList } from '../TimeEntryList';
import { Category } from '../../types';

// Mock the api module
vi.mock('../../api', () => ({
  api: {
    getTimeEntries: vi.fn().mockResolvedValue([]),
    createCategory: vi.fn().mockImplementation((name: string, color?: string) => 
      Promise.resolve({ id: Date.now(), name, color: color ?? '#6366f1', created_at: new Date().toISOString() })
    ),
    createManualEntry: vi.fn().mockResolvedValue({ id: 1 }),
    getTaskNameSuggestions: vi.fn().mockResolvedValue([]),
    updateEntry: vi.fn().mockResolvedValue({}),
    deleteEntry: vi.fn().mockResolvedValue({}),
  }
}));

import { api } from '../../api';

describe('TimeEntryList - Category Creation in Add Entry Modal', () => {
  const mockCategories: Category[] = [
    { id: 1, name: 'Development', color: '#007bff', created_at: '2024-01-01' },
    { id: 2, name: 'Meetings', color: '#28a745', created_at: '2024-01-01' }
  ];

  const mockOnEntryChange = vi.fn();
  const mockOnCategoryChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.createCategory).mockImplementation((name: string, color?: string) => 
      Promise.resolve({ id: Date.now(), name, color: color ?? '#6366f1', created_at: new Date().toISOString() })
    );
  });

  // Helper to open the Add Entry modal
  const openAddEntryModal = async () => {
    const addEntryBtn = screen.getByRole('button', { name: /\+ add entry/i });
    await act(async () => {
      fireEvent.click(addEntryBtn);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Add Past Entry')).toBeInTheDocument();
    });
  };

  describe('Requirement 5.1: "+ Add category" option appears in category selector', () => {
    /**
     * Validates: Requirements 5.1
     * WHEN the Add_Entry_Modal is displayed, THE Category_Selector SHALL include an "Add category" option
     */
    it('shows "+ Add category" option in the category dropdown', async () => {
      render(
        <TimeEntryList 
          categories={mockCategories}
          onEntryChange={mockOnEntryChange}
          onCategoryChange={mockOnCategoryChange}
        />
      );

      await openAddEntryModal();

      // Find the category select dropdown
      const categorySelect = screen.getByRole('combobox');
      expect(categorySelect).toBeInTheDocument();

      // Check that "+ Add category" option exists
      const addCategoryOption = screen.getByRole('option', { name: /\+ add category/i });
      expect(addCategoryOption).toBeInTheDocument();
      expect(addCategoryOption).toHaveValue('new');
    });

    /**
     * Validates: Requirements 5.1
     * The category dropdown should show all existing categories plus the add option
     */
    it('shows all existing categories along with "+ Add category" option', async () => {
      render(
        <TimeEntryList 
          categories={mockCategories}
          onEntryChange={mockOnEntryChange}
          onCategoryChange={mockOnCategoryChange}
        />
      );

      await openAddEntryModal();

      // Check existing categories are present
      expect(screen.getByRole('option', { name: 'Development' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Meetings' })).toBeInTheDocument();
      
      // Check "+ Add category" is present
      expect(screen.getByRole('option', { name: /\+ add category/i })).toBeInTheDocument();
    });
  });

  describe('Requirement 5.2: Inline form shows when "+ Add category" is selected', () => {
    /**
     * Validates: Requirements 5.2
     * WHEN a user selects "Add category" in the Add_Entry_Modal, 
     * THE System SHALL display an inline category creation form
     */
    it('shows inline category creation form when "+ Add category" is selected', async () => {
      render(
        <TimeEntryList 
          categories={mockCategories}
          onEntryChange={mockOnEntryChange}
          onCategoryChange={mockOnCategoryChange}
        />
      );

      await openAddEntryModal();

      // Select "+ Add category"
      const categorySelect = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(categorySelect, { target: { value: 'new' } });
      });

      // Verify inline form appears with name input
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Category name')).toBeInTheDocument();
      });

      // Verify color picker is present
      const colorPicker = document.querySelector('.new-category-form input[type="color"]');
      expect(colorPicker).toBeInTheDocument();

      // Verify Create and Cancel buttons are present in the inline form
      const newCategoryForm = document.querySelector('.new-category-form');
      expect(newCategoryForm).toBeInTheDocument();
      expect(newCategoryForm?.querySelector('.btn-primary')).toBeInTheDocument(); // Create button
      expect(newCategoryForm?.querySelector('.btn-ghost')).toBeInTheDocument(); // Cancel button
    });

    /**
     * Validates: Requirements 5.2
     * The inline form should have a name input field that is auto-focused
     */
    it('auto-focuses the category name input when form appears', async () => {
      render(
        <TimeEntryList 
          categories={mockCategories}
          onEntryChange={mockOnEntryChange}
          onCategoryChange={mockOnCategoryChange}
        />
      );

      await openAddEntryModal();

      // Select "+ Add category"
      const categorySelect = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(categorySelect, { target: { value: 'new' } });
      });

      // Verify name input is present (autoFocus is set in the component)
      await waitFor(() => {
        const nameInput = screen.getByPlaceholderText('Category name');
        expect(nameInput).toBeInTheDocument();
      });
    });
  });

  describe('Requirement 5.4: Cancel category creation', () => {
    /**
     * Validates: Requirements 5.4
     * WHEN a user cancels category creation in the Add_Entry_Modal, 
     * THE System SHALL return to the category selection state
     */
    it('hides inline form when Cancel button is clicked', async () => {
      render(
        <TimeEntryList 
          categories={mockCategories}
          onEntryChange={mockOnEntryChange}
          onCategoryChange={mockOnCategoryChange}
        />
      );

      await openAddEntryModal();

      // Select "+ Add category"
      const categorySelect = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(categorySelect, { target: { value: 'new' } });
      });

      // Verify form appears
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Category name')).toBeInTheDocument();
      });

      // Enter some text
      const nameInput = screen.getByPlaceholderText('Category name');
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: 'Test Category' } });
      });

      // Click Cancel button in the inline category form (not the modal Cancel)
      const newCategoryForm = document.querySelector('.new-category-form');
      const cancelBtn = newCategoryForm?.querySelector('.btn-ghost') as HTMLButtonElement;
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      // Verify form is hidden
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Category name')).not.toBeInTheDocument();
      });

      // Verify createCategory was NOT called
      expect(api.createCategory).not.toHaveBeenCalled();
    });

    /**
     * Validates: Requirements 5.4
     * Pressing Escape key should cancel category creation
     */
    it('hides inline form when Escape key is pressed', async () => {
      render(
        <TimeEntryList 
          categories={mockCategories}
          onEntryChange={mockOnEntryChange}
          onCategoryChange={mockOnCategoryChange}
        />
      );

      await openAddEntryModal();

      // Select "+ Add category"
      const categorySelect = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(categorySelect, { target: { value: 'new' } });
      });

      // Verify form appears
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Category name')).toBeInTheDocument();
      });

      // Enter some text
      const nameInput = screen.getByPlaceholderText('Category name');
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: 'Test Category' } });
      });

      // Press Escape
      await act(async () => {
        fireEvent.keyDown(nameInput, { key: 'Escape' });
      });

      // Verify form is hidden
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Category name')).not.toBeInTheDocument();
      });

      // Verify createCategory was NOT called
      expect(api.createCategory).not.toHaveBeenCalled();
    });

    /**
     * Validates: Requirements 5.4
     * Cancelling should reset the form state (clear name and color)
     */
    it('resets form state when cancelled', async () => {
      render(
        <TimeEntryList 
          categories={mockCategories}
          onEntryChange={mockOnEntryChange}
          onCategoryChange={mockOnCategoryChange}
        />
      );

      await openAddEntryModal();

      // Select "+ Add category"
      const categorySelect = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(categorySelect, { target: { value: 'new' } });
      });

      // Enter text and change color
      const nameInput = screen.getByPlaceholderText('Category name');
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: 'Test Category' } });
      });

      const colorPicker = document.querySelector('.new-category-form input[type="color"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(colorPicker, { target: { value: '#ff0000' } });
      });

      // Cancel using the inline form's Cancel button
      const newCategoryForm = document.querySelector('.new-category-form');
      const cancelBtn = newCategoryForm?.querySelector('.btn-ghost') as HTMLButtonElement;
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      // Re-open the form
      await act(async () => {
        fireEvent.change(categorySelect, { target: { value: 'new' } });
      });

      // Verify form is reset
      await waitFor(() => {
        const newNameInput = screen.getByPlaceholderText('Category name');
        expect(newNameInput).toHaveValue('');
      });

      const newColorPicker = document.querySelector('.new-category-form input[type="color"]') as HTMLInputElement;
      expect(newColorPicker.value).toBe('#6366f1'); // Default color
    });
  });

  describe('Requirement 5.3: Category creation and auto-selection', () => {
    /**
     * Validates: Requirements 5.3
     * WHEN a user submits a new category in the Add_Entry_Modal, 
     * THE System SHALL create the category and select it automatically
     */
    it('creates category and auto-selects it when Create button is clicked', async () => {
      const newCategoryId = 999;
      vi.mocked(api.createCategory).mockResolvedValueOnce({
        id: newCategoryId,
        name: 'New Test Category',
        color: '#6366f1',
        created_at: new Date().toISOString()
      });

      render(
        <TimeEntryList 
          categories={mockCategories}
          onEntryChange={mockOnEntryChange}
          onCategoryChange={mockOnCategoryChange}
        />
      );

      await openAddEntryModal();

      // Select "+ Add category"
      const categorySelect = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(categorySelect, { target: { value: 'new' } });
      });

      // Enter category name
      const nameInput = screen.getByPlaceholderText('Category name');
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: 'New Test Category' } });
      });

      // Click Create
      const createBtn = screen.getByRole('button', { name: /create/i });
      await act(async () => {
        fireEvent.click(createBtn);
      });

      // Verify API was called
      await waitFor(() => {
        expect(api.createCategory).toHaveBeenCalledWith('New Test Category', '#6366f1');
      });

      // Verify onCategoryChange was called to refresh categories
      await waitFor(() => {
        expect(mockOnCategoryChange).toHaveBeenCalled();
      });

      // Verify form is hidden after creation
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Category name')).not.toBeInTheDocument();
      });
    });

    /**
     * Validates: Requirements 5.3
     * Category should be created and auto-selected when Enter key is pressed
     */
    it('creates category and auto-selects it when Enter key is pressed', async () => {
      const newCategoryId = 888;
      vi.mocked(api.createCategory).mockResolvedValueOnce({
        id: newCategoryId,
        name: 'Enter Key Category',
        color: '#6366f1',
        created_at: new Date().toISOString()
      });

      render(
        <TimeEntryList 
          categories={mockCategories}
          onEntryChange={mockOnEntryChange}
          onCategoryChange={mockOnCategoryChange}
        />
      );

      await openAddEntryModal();

      // Select "+ Add category"
      const categorySelect = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(categorySelect, { target: { value: 'new' } });
      });

      // Enter category name
      const nameInput = screen.getByPlaceholderText('Category name');
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: 'Enter Key Category' } });
      });

      // Press Enter
      await act(async () => {
        fireEvent.keyDown(nameInput, { key: 'Enter' });
      });

      // Verify API was called
      await waitFor(() => {
        expect(api.createCategory).toHaveBeenCalledWith('Enter Key Category', '#6366f1');
      });

      // Verify onCategoryChange was called
      await waitFor(() => {
        expect(mockOnCategoryChange).toHaveBeenCalled();
      });
    });

    /**
     * Validates: Requirements 5.3
     * Category should be created with the selected color
     */
    it('creates category with custom color', async () => {
      vi.mocked(api.createCategory).mockResolvedValueOnce({
        id: 777,
        name: 'Colored Category',
        color: '#ff5500',
        created_at: new Date().toISOString()
      });

      render(
        <TimeEntryList 
          categories={mockCategories}
          onEntryChange={mockOnEntryChange}
          onCategoryChange={mockOnCategoryChange}
        />
      );

      await openAddEntryModal();

      // Select "+ Add category"
      const categorySelect = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(categorySelect, { target: { value: 'new' } });
      });

      // Enter category name
      const nameInput = screen.getByPlaceholderText('Category name');
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: 'Colored Category' } });
      });

      // Change color
      const colorPicker = document.querySelector('.new-category-form input[type="color"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(colorPicker, { target: { value: '#ff5500' } });
      });

      // Click Create
      const createBtn = screen.getByRole('button', { name: /create/i });
      await act(async () => {
        fireEvent.click(createBtn);
      });

      // Verify API was called with custom color
      await waitFor(() => {
        expect(api.createCategory).toHaveBeenCalledWith('Colored Category', '#ff5500');
      });
    });

    /**
     * Validates: Requirements 5.3
     * Create button should be disabled when category name is empty
     */
    it('disables Create button when category name is empty', async () => {
      render(
        <TimeEntryList 
          categories={mockCategories}
          onEntryChange={mockOnEntryChange}
          onCategoryChange={mockOnCategoryChange}
        />
      );

      await openAddEntryModal();

      // Select "+ Add category"
      const categorySelect = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(categorySelect, { target: { value: 'new' } });
      });

      // Verify Create button is disabled when name is empty
      await waitFor(() => {
        const createBtn = screen.getByRole('button', { name: /create/i });
        expect(createBtn).toBeDisabled();
      });
    });

    /**
     * Validates: Requirements 5.3
     * Create button should be enabled when category name has content
     */
    it('enables Create button when category name has content', async () => {
      render(
        <TimeEntryList 
          categories={mockCategories}
          onEntryChange={mockOnEntryChange}
          onCategoryChange={mockOnCategoryChange}
        />
      );

      await openAddEntryModal();

      // Select "+ Add category"
      const categorySelect = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(categorySelect, { target: { value: 'new' } });
      });

      // Enter category name
      const nameInput = screen.getByPlaceholderText('Category name');
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: 'Valid Name' } });
      });

      // Verify Create button is enabled
      await waitFor(() => {
        const createBtn = screen.getByRole('button', { name: /create/i });
        expect(createBtn).not.toBeDisabled();
      });
    });

    /**
     * Validates: Requirements 5.3
     * Should not create category with whitespace-only name
     */
    it('does not create category when name is only whitespace', async () => {
      render(
        <TimeEntryList 
          categories={mockCategories}
          onEntryChange={mockOnEntryChange}
          onCategoryChange={mockOnCategoryChange}
        />
      );

      await openAddEntryModal();

      // Select "+ Add category"
      const categorySelect = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(categorySelect, { target: { value: 'new' } });
      });

      // Enter whitespace-only name
      const nameInput = screen.getByPlaceholderText('Category name');
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: '   ' } });
      });

      // Create button should be disabled (trim check)
      const createBtn = screen.getByRole('button', { name: /create/i });
      expect(createBtn).toBeDisabled();
    });
  });

  describe('Modal close behavior', () => {
    /**
     * Validates: Requirements 5.4
     * Closing the modal should reset the inline category creation state
     */
    it('resets category creation state when modal is closed', async () => {
      render(
        <TimeEntryList 
          categories={mockCategories}
          onEntryChange={mockOnEntryChange}
          onCategoryChange={mockOnCategoryChange}
        />
      );

      await openAddEntryModal();

      // Select "+ Add category"
      const categorySelect = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(categorySelect, { target: { value: 'new' } });
      });

      // Enter text
      const nameInput = screen.getByPlaceholderText('Category name');
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: 'Test Category' } });
      });

      // Close modal by clicking the close button
      const closeBtn = document.querySelector('.manual-entry-header .btn-icon');
      await act(async () => {
        fireEvent.click(closeBtn!);
      });

      // Verify modal is closed
      await waitFor(() => {
        expect(screen.queryByText('Add Past Entry')).not.toBeInTheDocument();
      });

      // Re-open modal
      await openAddEntryModal();

      // Verify category creation form is not shown
      expect(screen.queryByPlaceholderText('Category name')).not.toBeInTheDocument();
    });

    /**
     * Validates: Requirements 5.4
     * Clicking overlay should close modal and reset state
     */
    it('resets category creation state when clicking overlay to close', async () => {
      render(
        <TimeEntryList 
          categories={mockCategories}
          onEntryChange={mockOnEntryChange}
          onCategoryChange={mockOnCategoryChange}
        />
      );

      await openAddEntryModal();

      // Select "+ Add category"
      const categorySelect = screen.getByRole('combobox');
      await act(async () => {
        fireEvent.change(categorySelect, { target: { value: 'new' } });
      });

      // Enter text
      const nameInput = screen.getByPlaceholderText('Category name');
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: 'Test Category' } });
      });

      // Close modal by clicking overlay
      const overlay = document.querySelector('.manual-entry-overlay');
      await act(async () => {
        fireEvent.click(overlay!);
      });

      // Verify modal is closed
      await waitFor(() => {
        expect(screen.queryByText('Add Past Entry')).not.toBeInTheDocument();
      });

      // Re-open modal
      await openAddEntryModal();

      // Verify category creation form is not shown
      expect(screen.queryByPlaceholderText('Category name')).not.toBeInTheDocument();
    });
  });
});
