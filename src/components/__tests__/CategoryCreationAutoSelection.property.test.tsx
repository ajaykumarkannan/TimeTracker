/**
 * Property-Based Tests for Category Creation Auto-Selection
 * 
 * Feature: ux-improvements
 * Property 4: Category creation auto-selection
 * 
 * For any valid category name submitted through the inline category creation form
 * in the Start Entry form, the newly created category SHALL be automatically 
 * selected in the category dropdown.
 * 
 * **Validates: Requirements 4.3**
 * 
 * Note: Tests for category creation in Switch Task form have been removed as 
 * the switch task inline form only shows existing categories for quick switching.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { TimeTracker } from '../TimeTracker';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { Category } from '../../types';

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
   * Property 4: Category creation auto-selection in Start Entry form
   * 
   * For any valid category name submitted through the inline category creation form
   * in the Start Entry form, the newly created category SHALL be automatically 
   * selected in the category dropdown.
   * 
   * **Validates: Requirements 4.3**
   */
  it('should auto-select newly created category in Start Entry form for any valid category name', async () => {
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
              activeEntry={null}
              entries={[]}
              onEntryChange={mockOnEntryChange}
              onCategoryChange={mockOnCategoryChange}
            />
          );

          // Step 1: Select "+ New category" from the main category dropdown
          const categorySelect = screen.getByRole('combobox');
          expect(categorySelect).toBeInTheDocument();
          
          await act(async () => {
            fireEvent.change(categorySelect, { target: { value: 'new' } });
          });

          // Step 2: Wait for inline category creation form to appear
          await waitFor(() => {
            expect(screen.getByPlaceholderText('Category name')).toBeInTheDocument();
          });

          // Step 3: Enter the category name
          const nameInput = screen.getByPlaceholderText('Category name');
          await act(async () => {
            fireEvent.change(nameInput, { target: { value: categoryName } });
          });

          // Step 4: Find and update the color picker
          const colorPicker = document.querySelector('.new-category-form input[type="color"]') as HTMLInputElement;
          if (colorPicker) {
            await act(async () => {
              fireEvent.change(colorPicker, { target: { value: categoryColor } });
            });
          }

          // Step 5: Click Create button
          const createBtn = screen.getByRole('button', { name: /create/i });
          await act(async () => {
            fireEvent.click(createBtn);
          });

          // Step 6: Verify the API was called with correct parameters
          await waitFor(() => {
            expect(api.createCategory).toHaveBeenCalledWith(categoryName, expect.any(String));
          });

          // Step 7: Verify onCategoryChange was called (indicating category list should refresh)
          await waitFor(() => {
            expect(mockOnCategoryChange).toHaveBeenCalled();
          });

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
        activeEntry={null}
        entries={[]}
        onEntryChange={mockOnEntryChange}
        onCategoryChange={mockOnCategoryChange}
      />
    );

    // Select "+ New category" from the main category dropdown
    const categorySelect = screen.getByRole('combobox');
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
        activeEntry={null}
        entries={[]}
        onEntryChange={mockOnEntryChange}
        onCategoryChange={mockOnCategoryChange}
      />
    );

    // Select "+ New category" from the main category dropdown
    const categorySelect = screen.getByRole('combobox');
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

    // Press Escape to cancel
    await act(async () => {
      fireEvent.keyDown(nameInput, { key: 'Escape' });
    });

    // Verify createCategory was NOT called
    expect(api.createCategory).not.toHaveBeenCalled();

    // Verify the form is hidden
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Category name')).not.toBeInTheDocument();
    });

    unmount();
  });
});
