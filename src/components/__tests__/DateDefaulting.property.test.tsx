/**
 * Property-Based Tests for Date Defaulting in Add Entry Modal
 * 
 * Feature: ux-improvements
 * Properties 5, 6, 7: Date defaulting synchronization
 * 
 * These tests verify the date defaulting behavior when adding past entries:
 * - Property 5: End date auto-syncs with start date when not manually edited
 * - Property 6: End time is preserved during automatic date sync
 * - Property 7: Manual end date edits prevent future auto-sync
 * 
 * **Validates: Requirements 6.1, 6.2, 6.3**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { TimeEntryList } from '../TimeEntryList';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { Category } from '../../types';

// Mock the api module
vi.mock('../../api', () => ({
  api: {
    getTimeEntries: vi.fn().mockResolvedValue([]),
    createManualEntry: vi.fn().mockResolvedValue({ id: 1 }),
    createCategory: vi.fn().mockImplementation((name: string, color: string) => 
      Promise.resolve({ id: Date.now(), name, color, created_at: new Date().toISOString() })
    ),
    getTaskNameSuggestions: vi.fn().mockResolvedValue([]),
  }
}));

// Helper to render with ThemeProvider and return cleanup function
const renderWithTheme = async (ui: React.ReactElement) => {
  // Ensure clean state before rendering
  cleanup();
  
  let result;
  await act(async () => {
    result = render(<ThemeProvider>{ui}</ThemeProvider>);
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  return result!;
};

// Arbitrary for generating valid dates (YYYY-MM-DD format)
// Using integer-based generation to avoid Date object edge cases
const validDateArb = fc.tuple(
  fc.integer({ min: 2020, max: 2030 }),  // year
  fc.integer({ min: 1, max: 12 }),        // month
  fc.integer({ min: 1, max: 28 })         // day (use 28 to avoid month-end issues)
).map(([year, month, day]) => {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
});

// Arbitrary for generating valid times (HH:MM format)
const validTimeArb = fc.tuple(
  fc.integer({ min: 0, max: 23 }),
  fc.integer({ min: 0, max: 59 })
).map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

// Arbitrary for generating a sequence of different dates
const differentDatesArb = fc.tuple(validDateArb, validDateArb)
  .filter(([d1, d2]) => d1 !== d2);

describe('Date Defaulting Property Tests', () => {
  const mockCategories: Category[] = [
    { id: 1, name: 'Development', color: '#007bff', created_at: '2024-01-01' },
    { id: 2, name: 'Meetings', color: '#28a745', created_at: '2024-01-01' }
  ];

  const mockOnEntryChange = vi.fn();
  const mockOnCategoryChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * Helper function to open the Add Entry modal using container-scoped query
   */
  const openAddEntryModal = async (container: HTMLElement) => {
    const addButton = await waitFor(() => {
      const button = container.querySelector('.btn.btn-primary.btn-sm') as HTMLButtonElement | null;
      expect(button).toBeInTheDocument();
      return button as HTMLButtonElement;
    });
    
    await act(async () => {
      fireEvent.click(addButton);
    });
    
    await waitFor(() => {
      expect(container.querySelector('.manual-entry-modal')).toBeInTheDocument();
    });
  };

  /**
   * Helper function to get date input values from the modal
   */
  const getDateInputs = (container: HTMLElement) => {
    const modal = container.querySelector('.manual-entry-modal');
    const dateInputs = modal?.querySelectorAll('input[type="date"]') as NodeListOf<HTMLInputElement>;
    const timeInputs = modal?.querySelectorAll('input[type="time"]') as NodeListOf<HTMLInputElement>;
    
    return {
      startDateInput: dateInputs?.[0],
      endDateInput: dateInputs?.[1],
      startTimeInput: timeInputs?.[0],
      endTimeInput: timeInputs?.[1]
    };
  };

  /**
   * Property 5: Date Defaulting Synchronization
   * 
   * For any start date change in the Add Entry modal where the end date has not 
   * been manually edited, the end date SHALL equal the start date after the change.
   * 
   * **Validates: Requirements 6.1**
   */
  describe('Property 5: Date Defaulting Synchronization', () => {
    it('should auto-sync end date to match start date when end date has not been manually edited', async () => {
      await fc.assert(
        fc.asyncProperty(
          validDateArb,
          async (newStartDate) => {
            vi.clearAllMocks();
            cleanup();

            const { container, unmount } = await renderWithTheme(
              <TimeEntryList 
                categories={mockCategories}
                onEntryChange={mockOnEntryChange}
                onCategoryChange={mockOnCategoryChange}
              />
            );

            // Open the Add Entry modal
            await openAddEntryModal(container);

            // Get the date inputs
            const { startDateInput, endDateInput } = getDateInputs(container);
            expect(startDateInput).toBeInTheDocument();
            expect(endDateInput).toBeInTheDocument();

            // Change the start date
            await act(async () => {
              fireEvent.change(startDateInput, { target: { value: newStartDate } });
            });

            // Verify end date matches start date (auto-synced)
            expect(endDateInput.value).toBe(newStartDate);

            // Cleanup
            unmount();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should sync end date for multiple consecutive start date changes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validDateArb, { minLength: 2, maxLength: 5 }),
          async (dateSequence) => {
            vi.clearAllMocks();
            cleanup();

            const { container, unmount } = await renderWithTheme(
              <TimeEntryList 
                categories={mockCategories}
                onEntryChange={mockOnEntryChange}
                onCategoryChange={mockOnCategoryChange}
              />
            );

            await openAddEntryModal(container);
            const { startDateInput, endDateInput } = getDateInputs(container);

            // Apply each date in sequence and verify sync
            for (const date of dateSequence) {
              await act(async () => {
                fireEvent.change(startDateInput, { target: { value: date } });
              });
              
              // End date should always match start date when not manually edited
              expect(endDateInput.value).toBe(date);
            }

            unmount();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: End Time Preservation During Date Sync
   * 
   * For any automatic end date update triggered by a start date change, 
   * the end time value SHALL remain unchanged from its previous value.
   * 
   * **Validates: Requirements 6.2**
   */
  describe('Property 6: End Time Preservation During Date Sync', () => {
    it('should preserve end time when end date is auto-synced', async () => {
      await fc.assert(
        fc.asyncProperty(
          validDateArb,
          validTimeArb,
          async (newStartDate, endTimeValue) => {
            vi.clearAllMocks();
            cleanup();

            const { container, unmount } = await renderWithTheme(
              <TimeEntryList 
                categories={mockCategories}
                onEntryChange={mockOnEntryChange}
                onCategoryChange={mockOnCategoryChange}
              />
            );

            await openAddEntryModal(container);
            const { startDateInput, endDateInput, endTimeInput } = getDateInputs(container);

            // First, set a specific end time
            await act(async () => {
              fireEvent.change(endTimeInput, { target: { value: endTimeValue } });
            });

            // Capture the end time before changing start date
            const endTimeBefore = endTimeInput.value;

            // Change the start date (should trigger end date sync)
            await act(async () => {
              fireEvent.change(startDateInput, { target: { value: newStartDate } });
            });

            // Verify end date was synced
            expect(endDateInput.value).toBe(newStartDate);
            
            // Verify end time was preserved
            expect(endTimeInput.value).toBe(endTimeBefore);

            unmount();
            return true;
          }
        ),
        { numRuns: 25 }
      );
    }, 15000);

    it('should preserve end time across multiple start date changes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validDateArb, { minLength: 2, maxLength: 4 }),
          validTimeArb,
          async (dateSequence, endTimeValue) => {
            vi.clearAllMocks();
            cleanup();

            const { container, unmount } = await renderWithTheme(
              <TimeEntryList 
                categories={mockCategories}
                onEntryChange={mockOnEntryChange}
                onCategoryChange={mockOnCategoryChange}
              />
            );

            await openAddEntryModal(container);
            const { startDateInput, endTimeInput } = getDateInputs(container);

            // Set a specific end time
            await act(async () => {
              fireEvent.change(endTimeInput, { target: { value: endTimeValue } });
            });

            // Apply multiple start date changes
            for (const date of dateSequence) {
              await act(async () => {
                fireEvent.change(startDateInput, { target: { value: date } });
              });
              
              // End time should remain unchanged throughout
              expect(endTimeInput.value).toBe(endTimeValue);
            }

            unmount();
            return true;
          }
        ),
        { numRuns: 25 }
      );
    }, 15000);
  });

  /**
   * Property 7: Manual End Date Override Preservation
   * 
   * For any sequence of date changes where the user manually sets the end date, 
   * subsequent start date changes SHALL NOT modify the end date value.
   * 
   * **Validates: Requirements 6.3**
   */
  describe('Property 7: Manual End Date Override Preservation', () => {
    it('should not modify end date after user manually sets it', async () => {
      await fc.assert(
        fc.asyncProperty(
          differentDatesArb,
          validDateArb,
          async ([manualEndDate, newStartDate], subsequentStartDate) => {
            vi.clearAllMocks();
            cleanup();

            const { container, unmount } = await renderWithTheme(
              <TimeEntryList 
                categories={mockCategories}
                onEntryChange={mockOnEntryChange}
                onCategoryChange={mockOnCategoryChange}
              />
            );

            await openAddEntryModal(container);
            const { startDateInput, endDateInput } = getDateInputs(container);

            // First, manually set the end date (this marks it as manually edited)
            await act(async () => {
              fireEvent.change(endDateInput, { target: { value: manualEndDate } });
            });

            // Verify end date was set
            expect(endDateInput.value).toBe(manualEndDate);

            // Now change the start date
            await act(async () => {
              fireEvent.change(startDateInput, { target: { value: newStartDate } });
            });

            // End date should NOT have changed (manual override preserved)
            expect(endDateInput.value).toBe(manualEndDate);

            // Change start date again
            await act(async () => {
              fireEvent.change(startDateInput, { target: { value: subsequentStartDate } });
            });

            // End date should still be the manually set value
            expect(endDateInput.value).toBe(manualEndDate);

            unmount();
            return true;
          }
        ),
        { numRuns: 25 }
      );
    }, 15000);

    it('should preserve manual end date through multiple start date changes', async () => {
      await fc.assert(
        fc.asyncProperty(
          validDateArb,
          fc.array(validDateArb, { minLength: 2, maxLength: 5 }),
          async (manualEndDate, startDateSequence) => {
            vi.clearAllMocks();
            cleanup();

            const { container, unmount } = await renderWithTheme(
              <TimeEntryList 
                categories={mockCategories}
                onEntryChange={mockOnEntryChange}
                onCategoryChange={mockOnCategoryChange}
              />
            );

            await openAddEntryModal(container);
            const { startDateInput, endDateInput } = getDateInputs(container);

            // Manually set the end date first
            await act(async () => {
              fireEvent.change(endDateInput, { target: { value: manualEndDate } });
            });

            // Apply multiple start date changes
            for (const startDate of startDateSequence) {
              await act(async () => {
                fireEvent.change(startDateInput, { target: { value: startDate } });
              });
              
              // End date should remain the manually set value
              expect(endDateInput.value).toBe(manualEndDate);
            }

            unmount();
            return true;
          }
        ),
        { numRuns: 25 }
      );
    }, 15000);

    it('should reset manual flag when modal is reopened', async () => {
      await fc.assert(
        fc.asyncProperty(
          validDateArb,
          validDateArb,
          async (manualEndDate, newStartDate) => {
            vi.clearAllMocks();
            cleanup();

            const { container, unmount } = await renderWithTheme(
              <TimeEntryList 
                categories={mockCategories}
                onEntryChange={mockOnEntryChange}
                onCategoryChange={mockOnCategoryChange}
              />
            );

            // First session: manually set end date
            await openAddEntryModal(container);
            const { endDateInput } = getDateInputs(container);
            
            await act(async () => {
              fireEvent.change(endDateInput, { target: { value: manualEndDate } });
            });

            // Close the modal by clicking cancel button
            const cancelButton = container.querySelector('.manual-entry-actions .btn-ghost') as HTMLButtonElement;
            expect(cancelButton).toBeInTheDocument();
            
            await act(async () => {
              fireEvent.click(cancelButton);
            });

            await waitFor(() => {
              expect(container.querySelector('.manual-entry-modal')).not.toBeInTheDocument();
            });

            // Reopen the modal
            await openAddEntryModal(container);
            const inputs = getDateInputs(container);

            // Change start date - should now auto-sync since manual flag was reset
            await act(async () => {
              fireEvent.change(inputs.startDateInput, { target: { value: newStartDate } });
            });

            // End date should sync with start date (manual flag was reset)
            expect(inputs.endDateInput.value).toBe(newStartDate);

            unmount();
            return true;
          }
        ),
        { numRuns: 25 }
      );
    }, 15000);
  });
});
