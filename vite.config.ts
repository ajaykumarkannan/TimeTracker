import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4848,
    proxy: {
      '/api': {
        target: 'http://localhost:4847',
        changeOrigin: true
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['**/node_modules/**', '**/e2e/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        'e2e/**',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/__tests__/**',
        'src/test/**',
        'vite.config.ts',
        'eslint.config.js',
        'playwright.config.ts'
      ],
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 40,
        lines: 50
      }
    }
  }
})
