# Time Tracker

A local web application for tracking time spent on different work categories with optional notes.

## Features

- ⏱️ **Real-time Timer**: Start/stop timer with live elapsed time display
- 📁 **Categories**: Create custom categories with colors to organize your time
- 📝 **Notes**: Add optional notes to each time entry
- 📊 **History**: View all time entries grouped by date with total time tracked
- 🐳 **Docker Ready**: Easy deployment with Docker and Docker Compose
- 🔒 **Local First**: All data stored locally in SQLite database

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite (better-sqlite3)
- **Logging**: Winston
- **Testing**: Vitest (unit) + Playwright (e2e)
- **Containerization**: Docker + Docker Compose

## Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn
- Docker (optional, for containerized deployment)

### Development Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start development servers**:
   ```bash
   npm run dev
   ```
   This starts both the backend (port 3001) and frontend (port 3000) concurrently.

3. **Open your browser**:
   Navigate to `http://localhost:3000`

### Docker Deployment

1. **Build and run with Docker Compose**:
   ```bash
   docker-compose up -d
   ```

2. **Access the application**:
   Navigate to `http://localhost:3001`

3. **Stop the container**:
   ```bash
   docker-compose down
   ```

The database will persist in the `./data` directory.

## Usage Guide

### Creating Categories

1. Click the **Categories** tab in the navigation
2. Enter a category name (e.g., "Development", "Meetings", "Break")
3. Choose a color to visually identify the category
4. Click **Add Category**

### Tracking Time

1. Go to the **Tracker** tab
2. Select a category from the dropdown
3. Optionally add a note describing what you're working on
4. Click **Start Timer**
5. The timer will display elapsed time in real-time
6. Click **Stop Timer** when finished

### Viewing History

- All completed time entries appear below the tracker
- Entries are grouped by date
- Each entry shows:
  - Category name and color
  - Start time
  - Duration
  - Note (if provided)
- Total time tracked is displayed at the top

### Managing Data

- **Edit Category**: Click the ✏️ icon next to a category
- **Delete Category**: Click the 🗑️ icon (warning: deletes all associated time entries)
- **Delete Entry**: Click the 🗑️ icon next to any time entry

## Development

### Available Scripts

```bash
# Development
npm run dev              # Start both frontend and backend in dev mode
npm run dev:client       # Start only frontend (Vite)
npm run dev:server       # Start only backend (tsx watch)

# Building
npm run build            # Build both frontend and backend
npm run build:client     # Build frontend only
npm run build:server     # Build backend only

# Production
npm start                # Run production build

# Testing
npm test                 # Run unit tests
npm run test:watch       # Run unit tests in watch mode
npm run test:e2e         # Run end-to-end tests

# Linting
npm run lint             # Run ESLint
```

### Project Structure

```
.
├── src/                    # Frontend React application
│   ├── components/         # React components
│   │   ├── TimeTracker.tsx
│   │   ├── CategoryManager.tsx
│   │   └── TimeEntryList.tsx
│   ├── api.ts             # API client
│   ├── types.ts           # TypeScript types
│   └── main.tsx           # Entry point
├── server/                # Backend Express application
│   ├── routes/            # API routes
│   │   ├── categories.ts
│   │   └── timeEntries.ts
│   ├── database.ts        # SQLite setup
│   ├── logger.ts          # Winston logger
│   └── index.ts           # Server entry point
├── e2e/                   # End-to-end tests
├── data/                  # SQLite database (created on first run)
├── logs/                  # Application logs
└── docker-compose.yml     # Docker configuration
```

## Testing

### Unit Tests

Unit tests cover:
- Component rendering and interactions
- API calls and error handling
- Database operations
- Timer functionality

Run with:
```bash
npm test
```

### End-to-End Tests

E2E tests cover:
- Complete user workflows
- Category management
- Time tracking
- Data persistence

Run with:
```bash
npm run test:e2e
```

## Logging

The application uses Winston for structured logging:

- **Console**: Colorized output for development
- **Files**: 
  - `logs/error.log`: Error-level logs only
  - `logs/combined.log`: All logs

Log levels: error, warn, info, debug

Set log level via environment variable:
```bash
LOG_LEVEL=debug npm run dev
```

## Database

SQLite database schema:

### Categories Table
```sql
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Time Entries Table
```sql
CREATE TABLE time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  note TEXT,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  duration_minutes INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
)
```

## Environment Variables

- `PORT`: Server port (default: 3001)
- `DB_PATH`: Database file path (default: ./data/timetracker.db)
- `LOG_LEVEL`: Logging level (default: info)
- `NODE_ENV`: Environment (development/production)

## Git Workflow

Initialize git repository:
```bash
git init
git add .
git commit -m "Initial commit: Time Tracker app"
```

The `.gitignore` file excludes:
- node_modules
- dist
- Database files (*.db)
- Logs
- Test results

## Troubleshooting

### Port Already in Use
If ports 3000 or 3001 are in use, modify:
- Frontend: `vite.config.ts` → `server.port`
- Backend: Set `PORT` environment variable

### Database Locked
If you get "database is locked" errors:
- Ensure only one instance is running
- Check file permissions on `data/` directory

### Docker Issues
- Ensure Docker daemon is running
- Check logs: `docker-compose logs -f`
- Rebuild: `docker-compose up --build`

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test && npm run test:e2e`
5. Submit a pull request
