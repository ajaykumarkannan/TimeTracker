import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAdaptiveCategoryColor, getAdaptiveCategoryColors } from '../useAdaptiveColors';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

describe('useAdaptiveCategoryColor', () => {
  it('returns colors for a given base color', () => {
    const { result } = renderHook(() => useAdaptiveCategoryColor('#ff0000'), { wrapper });
    
    expect(result.current.textColor).toBeDefined();
    expect(result.current.bgColor).toBeDefined();
    expect(result.current.dotColor).toBeDefined();
  });

  it('uses default color when null is provided', () => {
    const { result } = renderHook(() => useAdaptiveCategoryColor(null), { wrapper });
    
    expect(result.current.textColor).toBeDefined();
    expect(result.current.bgColor).toBeDefined();
    expect(result.current.dotColor).toBeDefined();
  });

  it('returns valid hex colors', () => {
    const { result } = renderHook(() => useAdaptiveCategoryColor('#ff0000'), { wrapper });
    
    // All colors should be valid hex colors
    expect(result.current.textColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(result.current.bgColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(result.current.dotColor).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe('getAdaptiveCategoryColors', () => {
  it('returns colors for light mode', () => {
    const colors = getAdaptiveCategoryColors('#ff0000', false);
    
    expect(colors.textColor).toBeDefined();
    expect(colors.bgColor).toBeDefined();
    expect(colors.dotColor).toBeDefined();
  });

  it('returns colors for dark mode', () => {
    const colors = getAdaptiveCategoryColors('#ff0000', true);
    
    expect(colors.textColor).toBeDefined();
    expect(colors.bgColor).toBeDefined();
    expect(colors.dotColor).toBeDefined();
  });

  it('uses default color when null is provided', () => {
    const colors = getAdaptiveCategoryColors(null, false);
    
    expect(colors.textColor).toBeDefined();
    expect(colors.bgColor).toBeDefined();
    expect(colors.dotColor).toBeDefined();
  });

  it('returns different colors for different modes', () => {
    const lightColors = getAdaptiveCategoryColors('#ff0000', false);
    const darkColors = getAdaptiveCategoryColors('#ff0000', true);
    
    // At least one color should be different between modes
    const hasDifference = 
      lightColors.bgColor !== darkColors.bgColor ||
      lightColors.textColor !== darkColors.textColor ||
      lightColors.dotColor !== darkColors.dotColor;
    
    expect(hasDifference).toBe(true);
  });
});
