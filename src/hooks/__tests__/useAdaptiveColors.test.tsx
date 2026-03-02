import { describe, it, expect } from 'vitest';
import { getAdaptiveCategoryColors } from '../useAdaptiveColors';

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
