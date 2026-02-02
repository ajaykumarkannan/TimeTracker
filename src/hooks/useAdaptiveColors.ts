import { useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import {
  getAdaptiveTextColor,
  getAdaptiveBgColor,
  getAdaptiveDotColor,
} from '../utils/colorUtils';

export interface AdaptiveCategoryColors {
  textColor: string;
  bgColor: string;
  dotColor: string;
}

/**
 * Hook to get adaptive colors for a category that work well in both light and dark modes
 */
export function useAdaptiveCategoryColor(baseColor: string | null): AdaptiveCategoryColors {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';
  const color = baseColor || '#6366f1'; // Default indigo

  return useMemo(() => ({
    textColor: getAdaptiveTextColor(color, isDarkMode),
    bgColor: getAdaptiveBgColor(color, isDarkMode),
    dotColor: getAdaptiveDotColor(color, isDarkMode),
  }), [color, isDarkMode]);
}

/**
 * Non-hook version for use in components that need to compute colors for multiple categories
 */
export function getAdaptiveCategoryColors(
  baseColor: string | null,
  isDarkMode: boolean
): AdaptiveCategoryColors {
  const color = baseColor || '#6366f1';
  return {
    textColor: getAdaptiveTextColor(color, isDarkMode),
    bgColor: getAdaptiveBgColor(color, isDarkMode),
    dotColor: getAdaptiveDotColor(color, isDarkMode),
  };
}
