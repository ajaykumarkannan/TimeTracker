/**
 * Color utilities for adaptive category colors that work well in both light and dark modes.
 * 
 * The key insight: category colors need different treatment in light vs dark mode:
 * - Light mode: Use the color as-is for text, with a light tinted background
 * - Dark mode: Lighten saturated colors for better contrast, use a darker tinted background
 */

/**
 * Parse a hex color to RGB components
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Convert HSL to hex
 */
export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Calculate relative luminance for contrast calculations
 */
export function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Get adaptive text color for a category based on theme
 * In dark mode, we lighten dark/saturated colors for better visibility
 */
export function getAdaptiveTextColor(baseColor: string, isDarkMode: boolean): string {
  const rgb = hexToRgb(baseColor);
  if (!rgb) return baseColor;

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  if (isDarkMode) {
    // In dark mode, ensure minimum lightness for readability
    // Also slightly desaturate very saturated colors
    const minLightness = 65;
    const maxSaturation = 85;
    
    const newLightness = Math.max(hsl.l, minLightness);
    const newSaturation = Math.min(hsl.s, maxSaturation);
    
    return hslToHex(hsl.h, newSaturation, newLightness);
  } else {
    // In light mode, ensure maximum lightness for readability against white
    // Darken very light colors
    const maxLightness = 45;
    const minSaturation = 50;
    
    const newLightness = Math.min(hsl.l, maxLightness);
    const newSaturation = Math.max(hsl.s, minSaturation);
    
    return hslToHex(hsl.h, newSaturation, newLightness);
  }
}

/**
 * Get adaptive background color for a category badge
 * Creates a subtle tinted background that works in both themes
 */
export function getAdaptiveBgColor(baseColor: string, isDarkMode: boolean): string {
  const rgb = hexToRgb(baseColor);
  if (!rgb) return isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  if (isDarkMode) {
    // Dark mode: darker, more subtle background
    return hslToHex(hsl.h, Math.min(hsl.s, 40), 20);
  } else {
    // Light mode: light tinted background
    return hslToHex(hsl.h, Math.min(hsl.s, 30), 95);
  }
}

/**
 * Get the dot/indicator color - this stays closer to the original
 * but with slight adjustments for visibility
 */
export function getAdaptiveDotColor(baseColor: string, isDarkMode: boolean): string {
  const rgb = hexToRgb(baseColor);
  if (!rgb) return baseColor;

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  if (isDarkMode) {
    // Slightly lighten in dark mode for visibility
    const newLightness = Math.max(hsl.l, 55);
    return hslToHex(hsl.h, hsl.s, newLightness);
  }
  
  return baseColor;
}
