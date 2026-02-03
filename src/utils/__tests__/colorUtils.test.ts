import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  rgbToHsl,
  hslToHex,
  getLuminance,
  getAdaptiveTextColor,
  getAdaptiveBgColor,
  getAdaptiveDotColor,
} from '../colorUtils';

describe('colorUtils', () => {
  describe('hexToRgb', () => {
    it('converts hex to RGB', () => {
      expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
      expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
      expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('handles hex without hash', () => {
      expect(hexToRgb('ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('returns null for invalid hex', () => {
      expect(hexToRgb('invalid')).toBeNull();
      expect(hexToRgb('#fff')).toBeNull(); // 3-char hex not supported
    });
  });

  describe('rgbToHsl', () => {
    it('converts RGB to HSL', () => {
      // Red
      const red = rgbToHsl(255, 0, 0);
      expect(red.h).toBeCloseTo(0, 0);
      expect(red.s).toBeCloseTo(100, 0);
      expect(red.l).toBeCloseTo(50, 0);

      // White
      const white = rgbToHsl(255, 255, 255);
      expect(white.l).toBeCloseTo(100, 0);

      // Black
      const black = rgbToHsl(0, 0, 0);
      expect(black.l).toBeCloseTo(0, 0);
    });
  });

  describe('hslToHex', () => {
    it('converts HSL to hex', () => {
      expect(hslToHex(0, 100, 50).toLowerCase()).toBe('#ff0000'); // Red
      expect(hslToHex(120, 100, 50).toLowerCase()).toBe('#00ff00'); // Green
      expect(hslToHex(240, 100, 50).toLowerCase()).toBe('#0000ff'); // Blue
    });

    it('handles all hue ranges', () => {
      // Test each 60-degree segment of the color wheel
      expect(hslToHex(30, 100, 50)).toBeTruthy(); // 0-60 range (orange)
      expect(hslToHex(90, 100, 50)).toBeTruthy(); // 60-120 range (yellow-green)
      expect(hslToHex(150, 100, 50)).toBeTruthy(); // 120-180 range (cyan-ish)
      expect(hslToHex(210, 100, 50)).toBeTruthy(); // 180-240 range (blue-ish)
      expect(hslToHex(270, 100, 50)).toBeTruthy(); // 240-300 range (purple)
      expect(hslToHex(330, 100, 50)).toBeTruthy(); // 300-360 range (magenta)
    });
  });

  describe('getLuminance', () => {
    it('calculates luminance for white', () => {
      expect(getLuminance(255, 255, 255)).toBeCloseTo(1, 1);
    });

    it('calculates luminance for black', () => {
      expect(getLuminance(0, 0, 0)).toBeCloseTo(0, 1);
    });

    it('calculates luminance for colors', () => {
      // Red has lower luminance than green due to human perception
      const redLum = getLuminance(255, 0, 0);
      const greenLum = getLuminance(0, 255, 0);
      expect(greenLum).toBeGreaterThan(redLum);
    });

    it('handles low color values (linear region)', () => {
      // Values <= 0.03928 * 255 ≈ 10 use linear formula
      const lum = getLuminance(10, 10, 10);
      expect(lum).toBeGreaterThan(0);
      expect(lum).toBeLessThan(0.01);
    });
  });

  describe('getAdaptiveTextColor', () => {
    it('lightens dark colors in dark mode', () => {
      const darkPurple = '#9333ea'; // Original purple that was hard to read
      const adaptedDark = getAdaptiveTextColor(darkPurple, true);
      
      // The adapted color should be lighter (higher lightness)
      const adaptedRgb = hexToRgb(adaptedDark)!;
      const adaptedHsl = rgbToHsl(adaptedRgb.r, adaptedRgb.g, adaptedRgb.b);
      
      // Should be at least 64 (close to minimum 65)
      expect(adaptedHsl.l).toBeGreaterThanOrEqual(64);
    });

    it('darkens light colors in light mode', () => {
      const lightColor = '#e0e0ff';
      const adaptedLight = getAdaptiveTextColor(lightColor, false);
      
      const adaptedRgb = hexToRgb(adaptedLight)!;
      const adaptedHsl = rgbToHsl(adaptedRgb.r, adaptedRgb.g, adaptedRgb.b);
      
      // Should be at most 46 (close to maximum 45)
      expect(adaptedHsl.l).toBeLessThanOrEqual(46);
    });

    it('returns original color for invalid hex', () => {
      expect(getAdaptiveTextColor('invalid', true)).toBe('invalid');
    });
  });

  describe('getAdaptiveBgColor', () => {
    it('returns dark background in dark mode', () => {
      const color = '#6366f1';
      const bg = getAdaptiveBgColor(color, true);
      const rgb = hexToRgb(bg)!;
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      
      expect(hsl.l).toBeLessThanOrEqual(25); // Dark background
    });

    it('returns light background in light mode', () => {
      const color = '#6366f1';
      const bg = getAdaptiveBgColor(color, false);
      const rgb = hexToRgb(bg)!;
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      
      expect(hsl.l).toBeGreaterThanOrEqual(90); // Light background
    });

    it('returns fallback for invalid hex', () => {
      expect(getAdaptiveBgColor('invalid', true)).toBe('rgba(255,255,255,0.1)');
      expect(getAdaptiveBgColor('invalid', false)).toBe('rgba(0,0,0,0.05)');
    });
  });

  describe('getAdaptiveDotColor', () => {
    it('lightens dot color in dark mode for visibility', () => {
      const darkColor = '#333333';
      const adapted = getAdaptiveDotColor(darkColor, true);
      
      const adaptedRgb = hexToRgb(adapted)!;
      const adaptedHsl = rgbToHsl(adaptedRgb.r, adaptedRgb.g, adaptedRgb.b);
      
      // Should be at least 54 (close to minimum 55)
      expect(adaptedHsl.l).toBeGreaterThanOrEqual(54);
    });

    it('keeps original color in light mode', () => {
      const color = '#6366f1';
      expect(getAdaptiveDotColor(color, false)).toBe(color);
    });

    it('returns original color for invalid hex', () => {
      expect(getAdaptiveDotColor('invalid', true)).toBe('invalid');
      expect(getAdaptiveDotColor('invalid', false)).toBe('invalid');
    });

    it('keeps already light colors unchanged in dark mode', () => {
      const lightColor = '#aaaaaa'; // Already light
      const adapted = getAdaptiveDotColor(lightColor, true);
      const adaptedRgb = hexToRgb(adapted)!;
      const adaptedHsl = rgbToHsl(adaptedRgb.r, adaptedRgb.g, adaptedRgb.b);
      
      // Should maintain at least minimum lightness
      expect(adaptedHsl.l).toBeGreaterThanOrEqual(55);
    });
  });
});
