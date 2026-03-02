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
 * Get adaptive colors for a category that work well in both light and dark modes.
 * Non-hook version for use in components that compute colors for multiple categories.
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
