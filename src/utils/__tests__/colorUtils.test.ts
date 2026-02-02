import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  rgbToHsl,
  hslToHex,
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
  });
});
