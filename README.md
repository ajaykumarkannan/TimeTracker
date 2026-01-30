# ChronoFlow ⏱️

A beautiful, simple time tracking app to help you understand where your hours go.

![ChronoFlow](https://img.shields.io/badge/version-1.0.0-blue)

## Features

- **One-Click Tracking** - Start and stop timers instantly with quick-start buttons
- **Custom Categories** - Organize time with color-coded categories
- **Detailed Notes** - Add context to every time entry
- **Insightful Analytics** - See where your time goes with charts and insights
- **Dark Mode** - Easy on the eyes with light/dark/system themes
- **Two Modes** - Use with an account (cloud) or locally in your browser

## Quick Start

### Using Docker (Recommended)

```bash
docker-compose up --build
```

Visit http://localhost:3001

### Manual Setup

```bash
# Install dependencies
npm install

# Development mode (hot reload)
npm run dev

# Production build
npm run build
npm start
```

## Usage Modes

### ☁️ Account Mode
Create an account to sync your data across devices. Your tracking history is stored securely on the server with JWT authentication.

### 👤 Guest Mode
No account needed! Start tracking immediately with an anonymous session. Your data is stored server-side and you can convert to a full account later to preserve your history.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Express.js, TypeScript
- **Database**: SQLite (sql.js)
- **Auth**: JWT with refresh tokens
- **Styling**: CSS with CSS variables for theming

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/refresh` | Refresh token |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |

### Time Tracking
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/time-entries` | List entries |
| GET | `/api/time-entries/active` | Get active entry |
| POST | `/api/time-entries/start` | Start tracking |
| POST | `/api/time-entries/:id/stop` | Stop tracking |
| PUT | `/api/time-entries/:id` | Update entry |
| DELETE | `/api/time-entries/:id` | Delete entry |

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create category |
| PUT | `/api/categories/:id` | Update category |
| DELETE | `/api/categories/:id` | Delete category |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics` | Get analytics (requires `start` and `end` query params) |

### Export & Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/export` | Export all user data as JSON |
| POST | `/api/settings/reset` | Reset all user data to defaults |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `DB_PATH` | ./data/timetracker.db | Database file path |
| `JWT_SECRET` | (dev default) | JWT signing secret |
| `NODE_ENV` | development | Environment |

## Development

```bash
# Run tests
npm test

# Run E2E tests
npm run test:e2e

# Lint code
npm run lint
```

## Project Structure

```
├── server/           # Backend Express server
│   ├── routes/       # API route handlers
│   ├── middleware/   # Auth middleware
│   ├── database.ts   # SQLite database setup
│   └── logger.ts     # Winston logger
├── src/              # Frontend React app
│   ├── components/   # React components with co-located CSS
│   ├── contexts/     # Auth & Theme contexts
│   ├── hooks/        # Custom hooks (useIdleDetection)
│   ├── api.ts        # API client (handles guest sessions & JWT auth)
│   └── types.ts      # TypeScript types
├── e2e/              # Playwright E2E tests
└── extension/        # Browser extension
```

## License

MIT
