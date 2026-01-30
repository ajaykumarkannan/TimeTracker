# Agent Steering Rules

This file contains instructions and guidelines for Kiro to follow when working in this workspace.

## Project Context

ChronoFlow is a time tracking webapp that helps users understand where their work hours go. Users can create color-coded categories, add notes to time entries, and view analytics on their time usage.

### Key Features

- One-click time tracking with quick-start buttons
- Custom color-coded categories with 5 defaults (Meetings, Deep Work, Email & Communication, Planning, Break)
- Detailed notes on time entries
- Analytics dashboard with charts and insights
- Dark/light/system theme support
- Two usage modes: Guest (anonymous session) and Account (registered user)
- Idle detection to pause tracking when inactive
- Browser extension for quick access

### Usage Modes

- **Guest Mode**: Users can start tracking immediately without registration. Data is stored server-side with an anonymous session ID. Guests can later convert to a registered account.
- **Account Mode**: Registered users with email/password authentication. Data syncs across devices via JWT tokens.

Both modes use the same server-side SQLite database - there is no localStorage-based data storage.

## Tech Stack (Established)

### Frontend

- **React 18** with TypeScript
- **Vite** for build tooling and dev server
- **CSS** with CSS variables for theming (no CSS framework)

### Backend

- **Express.js** with TypeScript
- **sql.js** (SQLite compiled to WebAssembly) for database
- **JWT** with refresh tokens for authentication
- **Winston** for logging

### Testing

- **Vitest** for unit tests
- **React Testing Library** for component tests
- **Playwright** for E2E tests

### Infrastructure

- **Docker** and docker-compose for containerization
- **Git** for version control

## Project Structure

```text
├── server/           # Backend Express server
│   ├── routes/       # API route handlers
│   ├── middleware/   # Auth middleware (flexAuthMiddleware for guest+account)
│   ├── __tests__/    # Server unit tests
│   ├── database.ts   # SQLite database setup
│   └── logger.ts     # Winston logger config
├── src/              # Frontend React app
│   ├── components/   # React components with co-located CSS
│   │   └── __tests__/ # Component tests
│   ├── contexts/     # Auth & Theme React contexts
│   ├── hooks/        # Custom hooks (useIdleDetection)
│   ├── api.ts        # API client (handles both guest sessions and JWT auth)
│   └── types.ts      # Shared TypeScript types
├── e2e/              # Playwright E2E tests
├── extension/        # Browser extension (popup)
├── public/           # Static assets
├── logs/             # Winston log files
└── data/             # SQLite database file
```

## Development Workflow

### Git Workflow

- **Always work on `develop` branch**: All development happens on the `develop` branch, not `main`
- **Create feature branches from develop**: For new features, branch off `develop` (`git checkout -b feature/my-feature develop`)
- **Commit frequently**: Make small, incremental commits as you work rather than one large commit at the end
- **Write meaningful commit messages**: Describe what changed and why
- **Merge back to develop**: When a feature is complete, merge it back to `develop`
- **Ask before merging to main**: Never merge to `main` without explicit human approval
- **Use Pull Requests for main**: When ready to release, create a PR from `develop` to `main` and wait for human review

#### Branch Strategy

```
main (production-ready)
  └── develop (integration branch)
        ├── feature/feature-a
        ├── feature/feature-b
        └── fix/bug-fix
```

#### Agent Rules for Branching

1. **Check current branch first**: Before making changes, verify you're on `develop` or a feature branch
2. **Never commit directly to main**: All changes must go through `develop` first
3. **Create PRs for main merges**: Use `gh pr create --base main --head develop` when ready to merge
4. **Wait for human approval**: After creating a PR to main, stop and ask the human to review and approve

### Commands

- `npm run dev` - Start both client and server in dev mode
- `npm run build` - Build for production
- `npm start` - Run production build
- `npm test` - Run unit tests
- `npm run test:e2e` - Run Playwright E2E tests
- `npm run lint` - Run ESLint

### Docker

```bash
docker-compose up --build  # Build and run
```

App runs on `http://localhost:3001`

### Code Style

- TypeScript strict mode
- ESLint for linting
- Co-locate CSS files with components (ComponentName.css)
- Use CSS variables for theming (defined in index.css)

## API Design

All API routes are prefixed with `/api/`:

- `/api/auth/*` - Authentication (register, login, refresh, logout, me)
- `/api/time-entries/*` - Time entry CRUD + start/stop
- `/api/categories/*` - Category CRUD
- `/api/analytics` - Analytics data with date range

### Authentication

- **JWT Auth**: Registered users send `Authorization: Bearer <token>` header
- **Guest Auth**: Anonymous users send `X-Session-ID: <uuid>` header
- Routes use `flexAuthMiddleware` which accepts either authentication method
- Default categories are created automatically for new users (both guest and registered)

## Testing Guidelines

- Unit tests go in `__tests__` folders adjacent to source files
- Use React Testing Library for component tests
- Mock API calls in frontend tests
- E2E tests cover critical user flows
- Run `npm test` before committing

## Agent Testing Requirements

**All agents must follow these testing practices when making changes:**

1. **Run existing tests first**: Before making changes, run `npm test` to ensure the test suite passes
2. **Test your changes**: After making changes, run both unit tests (`npm test`) and E2E tests (`npm run test:e2e`) to verify nothing is broken
3. **Add tests for new features**: When adding new functionality, write corresponding tests:
   - Unit tests for new utility functions, hooks, and API routes
   - Component tests for new React components
   - E2E tests for new user-facing flows
4. **Update tests when modifying existing code**: If you change existing behavior, update the relevant tests to match
5. **Don't skip failing tests**: If tests fail, fix the underlying issue rather than skipping or deleting tests

## Logging

Winston logger configured in `server/logger.ts`:

- Logs to `logs/combined.log` (all levels)
- Logs to `logs/error.log` (errors only)
- Console output in development
- Log levels: error, warn, info, http, debug

## Environment Variables

| Variable | Default | Description |
| ------------ | ------------------------- | ------------------- |
| `PORT` | 3001 | Server port |
| `DB_PATH` | ./data/timetracker.db | Database file path |
| `JWT_SECRET` | (dev default) | JWT signing secret |
| `NODE_ENV` | development | Environment |

## Documentation Maintenance

**Important**: As the project evolves, keep documentation in sync:

- Update this `AGENTS.md` file when adding new features, changing architecture, or modifying development workflows
- Update `README.md` when user-facing features, API endpoints, or setup instructions change
- Review both files periodically to ensure accuracy
