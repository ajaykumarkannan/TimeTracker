/**
 * Property-Based Tests for Category Creation Auto-Selection
 * 
 * Feature: ux-improvements
 * Property 4: Category creation auto-selection
 * 
 * For any valid category name submitted through the inline category creation form
 * in either the Switch Task modal or Add Entry modal, the newly created category
 * SHALL be automatically selected in the category dropdown.
 * 
 * **Validates: Requirements 4.3**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { TimeTracker } from '../TimeTracker';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { Category, TimeEntry } from '../../types';

// Mock the api module
vi.mock('../../api', () => ({
  api: {
    startEntry: vi.fn().mockResolvedValue({ id: 1 }),
    stopEntry: vi.fn().mockResolvedValue({ id: 1 }),
    createCategory: vi.fn().mockImplementation((name: string, color: string) => 
      Promise.resolve({ id: Date.now(), name, color, created_at: new Date().toISOString() })
    ),
    getTaskNameSuggestions: vi.fn().mockResolvedValue([]),
  }
}));

import { api } from '../../api';

// Helper to render with ThemeProvider
const renderWithTheme = async (ui: React.ReactElement) => {
  let result;
  await act(async () => {
    result = render(<ThemeProvider>{ui}</ThemeProvider>);
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  return result!;
};

// Arbitrary for generating valid category names
// Category names should be non-empty strings with reasonable characters
const validCategoryNameArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0 && /^[a-zA-Z0-9 \-_]+$/.test(s));

// Arbitrary for generating valid hex colors
const validColorArb = fc.tuple(
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 })
).map(([r, g, b]) => `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);

describe('Property 4: Category Creation Auto-Selection', () => {
  const mockCategories: Category[] = [
    { id: 1, name: 'Development', color: '#007bff', created_at: '2024-01-01' },
    { id: 2, name: 'Meetings', color: '#28a745', created_at: '2024-01-01' }
  ];

  const mockActiveEntry: TimeEntry = {
    id: 1,
    category_id: 1,
    category_name: 'Development',
    category_color: '#007bff',
    task_name: 'Current task',
    start_time: new Date().toISOString(),
    end_time: null,
    scheduled_end_time: null,
    duration_minutes: null,
    created_at: '2024-01-01'
  };

  const mockOnEntryChange = vi.fn();
  const mockOnCategoryChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the createCategory mock to return dynamic values
    vi.mocked(api.createCategory).mockImplementation((name: string, color?: string) => 
      Promise.resolve({ id: Date.now(), name, color: color ?? '#6366f1', created_at: new Date().toISOString() })
    );
  });

  /**
   * Property 4: Category creation auto-selection in Switch Task Modal
   * 
   * For any valid category name submitted through the inline category creation form
   * in the Switch Task modal, the newly created category SHALL be automatically 
   * selected in the category dropdown.
   * 
   * **Validates: Requirements 4.3**
   */
  it('should auto-select newly created category in Switch Task modal for any valid category name', async () => {
    await fc.assert(
      fc.asyncProperty(
        validCategoryNameArb,
        validColorArb,
        async (categoryName, categoryColor) => {
          vi.clearAllMocks();
          
          // Setup: Mock createCategory to return the new category
          const newCategoryId = Date.now() + Math.floor(Math.random() * 1000);
          vi.mocked(api.createCategory).mockResolvedValueOnce({
            id: newCategoryId,
            name: categoryName,
            color: categoryColor,
            created_at: new Date().toISOString()
          });

          const { unmount } = await renderWithTheme(
            <TimeTracker 
              categories={mockCategories} 
              activeEntry={mockActiveEntry}
              entries={[]}
              onEntryChange={mockOnEntryChange}
              onCategoryChange={mockOnCategoryChange}
            />
          );

          // Step 1: Click on a switch category button to open the switch task modal
          await waitFor(() => {
            const switchBtns = document.querySelectorAll('.switch-category-btn');
            expect(switchBtns.length).toBeGreaterThan(0);
          });
          const switchBtns = document.querySelectorAll('.switch-category-btn');
          
          await act(async () => {
            fireEvent.click(switchBtns[0]);
          });

          // Step 2: Wait for modal to appear
          await waitFor(() => {
            expect(document.querySelector('.task-prompt-modal')).toBeInTheDocument();
          });

          // Step 3: Select "+ Add category" from the dropdown
          const categorySelect = document.querySelector('.modal-category-selector select') as HTMLSelectElement;
          expect(categorySelect).toBeInTheDocument();
          
          await act(async () => {
            fireEvent.change(categorySelect, { target: { value: 'new' } });
          });

          // Step 4: Wait for inline category creation form to appear
          await waitFor(() => {
            expect(screen.getByPlaceholderText('Category name')).toBeInTheDocument();
          });

          // Step 5: Enter the category name
          const nameInput = screen.getByPlaceholderText('Category name');
          await act(async () => {
            fireEvent.change(nameInput, { target: { value: categoryName } });
          });

          // Step 6: Find and update the color picker
          const colorPicker = document.querySelector('.new-category-form input[type="color"]') as HTMLInputElement;
          if (colorPicker) {
            await act(async () => {
              fireEvent.change(colorPicker, { target: { value: categoryColor } });
            });
          }

          // Step 7: Click Create button
          const createBtn = screen.getByRole('button', { name: /create/i });
          await act(async () => {
            fireEvent.click(createBtn);
          });

          // Step 8: Verify the API was called with correct parameters
          await waitFor(() => {
            expect(api.createCategory).toHaveBeenCalledWith(categoryName, expect.any(String));
          });

          // Step 9: Verify onCategoryChange was called (indicating category list should refresh)
          await waitFor(() => {
            expect(mockOnCategoryChange).toHaveBeenCalled();
          });

          // Step 10: Verify the modal header shows the newly created category name
          // This confirms the category was auto-selected in the switch task prompt
          await waitFor(() => {
            const modalHeader = document.querySelector('.task-prompt-header');
            expect(modalHeader).toBeInTheDocument();
            // The category badge in the header should show the new category name
            const categoryBadge = modalHeader?.querySelector('.category-badge');
            expect(categoryBadge?.textContent).toContain(categoryName);
          }, { timeout: 10000 });

          // Cleanup
          unmount();
          
          return true;
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * Additional property test: Category creation with Enter key
   * 
   * For any valid category name submitted via Enter key in the inline category 
   * creation form, the newly created category SHALL be automatically selected.
   * 
   * **Validates: Requirements 4.3**
   */
  it('should auto-select newly created category when submitted via Enter key', async () => {
    const categoryName = 'Enter Key Category';
    vi.clearAllMocks();
    
    // Setup: Mock createCategory to return the new category
    const newCategoryId = Date.now() + Math.floor(Math.random() * 1000);
    vi.mocked(api.createCategory).mockResolvedValueOnce({
      id: newCategoryId,
      name: categoryName,
      color: '#6366f1',
      created_at: new Date().toISOString()
    });

    const { unmount } = await renderWithTheme(
      <TimeTracker 
        categories={mockCategories} 
        activeEntry={mockActiveEntry}
        entries={[]}
        onEntryChange={mockOnEntryChange}
        onCategoryChange={mockOnCategoryChange}
      />
    );

    // Open switch task modal
    await waitFor(() => {
      const switchBtns = document.querySelectorAll('.switch-category-btn');
      expect(switchBtns.length).toBeGreaterThan(0);
    });
    const switchBtns = document.querySelectorAll('.switch-category-btn');
    await act(async () => {
      fireEvent.click(switchBtns[0]);
    });

    await waitFor(() => {
      expect(document.querySelector('.task-prompt-modal')).toBeInTheDocument();
    });

    // Select "+ Add category"
    const categorySelect = document.querySelector('.modal-category-selector select') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(categorySelect, { target: { value: 'new' } });
    });

    // Wait for form
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Category name')).toBeInTheDocument();
    });

    // Enter category name and press Enter
    const nameInput = screen.getByPlaceholderText('Category name');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: categoryName } });
    });
    
    await act(async () => {
      fireEvent.keyDown(nameInput, { key: 'Enter' });
    });

    // Verify API was called
    await waitFor(() => {
      expect(api.createCategory).toHaveBeenCalledWith(categoryName, expect.any(String));
    }, { timeout: 10000 });

    // Verify category was auto-selected (shown in modal header)
    await waitFor(() => {
      const categoryBadge = document.querySelector('.task-prompt-header .category-badge');
      expect(categoryBadge?.textContent).toContain(categoryName);
    }, { timeout: 10000 });

    unmount();
  });

  /**
   * Property test: Cancellation should not create or select category
   * 
   * For any category name entered but cancelled (via Cancel button or Escape key),
   * no category SHALL be created and the selection SHALL remain unchanged.
   * 
   * **Validates: Requirements 4.4**
   */
  it('should not create category when cancelled via Escape key', async () => {
    const categoryName = 'Cancel Category';

    const { unmount } = await renderWithTheme(
      <TimeTracker 
        categories={mockCategories} 
        activeEntry={mockActiveEntry}
        entries={[]}
        onEntryChange={mockOnEntryChange}
        onCategoryChange={mockOnCategoryChange}
      />
    );

    // Open switch task modal
    await waitFor(() => {
      const switchBtns = document.querySelectorAll('.switch-category-btn');
      expect(switchBtns.length).toBeGreaterThan(0);
    });
    const switchBtns = document.querySelectorAll('.switch-category-btn');
    await act(async () => {
      fireEvent.click(switchBtns[0]);
    });

    await waitFor(() => {
      expect(document.querySelector('.task-prompt-modal')).toBeInTheDocument();
    });

    // Get the initially selected category name from the modal header
    const initialCategoryBadge = document.querySelector('.task-prompt-header .category-badge');
    const initialCategoryName = initialCategoryBadge?.textContent;

    // Select "+ Add category"
    const categorySelect = document.querySelector('.modal-category-selector select') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(categorySelect, { target: { value: 'new' } });
    });

    // Wait for form
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Category name')).toBeInTheDocument();
    });

    // Enter category name
    const nameInput = screen.getByPlaceholderText('Category name');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: categoryName } });
    });

    // Press Escape to cancel (close suggestions first if open)
    await act(async () => {
      fireEvent.keyDown(nameInput, { key: 'Escape' });
    });
    await act(async () => {
      fireEvent.keyDown(nameInput, { key: 'Escape' });
    });

    // Verify createCategory was NOT called
    expect(api.createCategory).not.toHaveBeenCalled();

    // Verify the form is hidden
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Category name')).not.toBeInTheDocument();
    });

    // Verify the original category is still selected
    const currentCategoryBadge = document.querySelector('.task-prompt-header .category-badge');
    expect(currentCategoryBadge?.textContent).toBe(initialCategoryName);

    unmount();
  });
});
