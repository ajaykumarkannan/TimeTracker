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
- Scheduled auto-stop: Set a timer to automatically stop tracking after a duration or at a specific time
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
├── logs/             # Winston log files (dev only; Docker uses named volume)
└── data/             # SQLite database file (dev only; Docker uses named volume)
```

## Development Workflow

### Git Workflow

- **Work on feature branches**: Create feature branches from `main` for new work. If there are multiple changes in flight by different agents, ask the user what they would like.
- **Commit frequently**: Make small, incremental commits as you work rather than one large commit at the end
- **Write meaningful commit messages**: Describe what changed and why
- **Ask before merging to main**: Never merge to `main` without explicit human approval
- **Use Pull Requests**: Create a PR from your feature branch to `main` and wait for CI to pass and human review

#### Branch Strategy

```
main (production-ready)
  ├── feature/feature-a
  ├── feature/feature-b
  └── fix/bug-fix
```

#### Agent Rules for Branching

1. **Check current branch first**: Before making changes, verify you're on a feature branch (not `main`)
2. **Never commit directly to main**: All changes must go through a feature branch first
3. **Create PRs for main merges**: Use `gh pr create --base main --head feature/your-branch` when ready to merge
   - Ensure multiline bodies are passed with real newlines (not escaped `\n`) so PR descriptions render correctly.
4. **Wait for human approval**: After creating a PR to main, stop and ask the human to review and approve
5. **Run full CI checks locally before pushing**: Always run the following commands locally before pushing to a PR to catch issues early:
   - `npx tsc --noEmit` - TypeScript type checking (catches type errors that `npm test` may miss)
   - `npm run lint` - ESLint checks
   - `npm test` - Unit tests
   - `npm run test:e2e` - E2E tests (when UI changes are involved)
   
   **Note**: `npm test` uses Vitest which has its own TypeScript handling and may not catch all type errors. Always run `tsc --noEmit` separately to ensure strict type compliance.

#### Feature Branch Guidelines

1. **One branch per major feature**: Create a feature branch with a unique, descriptive name (e.g., `feature/csv-export`, `feature/idle-detection`)
2. **Continue on the same branch**: If the user requests additional changes related to the feature, continue working on the same branch without renaming it
3. **Update PR descriptions**: When adding new functionality to an existing feature branch, update the PR description to reflect all changes included
4. **Keep documentation current**: Always update `AGENTS.md` and `README.md` when adding or modifying features
5. **Version bump on feature branches**: Update the app version on the feature branch before opening a PR. Use a **minor** bump for larger changes (new features, significant UX changes, or breaking behavior) and a **patch** bump for small fixes or low-impact tweaks.
6. **Create GitHub releases**: After merging a tagged patch release, create the corresponding GitHub release (e.g., `v0.7.2`) with a short changelog

#### Code Quality Standards

1. **Simplify and refactor**: Continuously look for opportunities to reduce code complexity and improve readability
2. **Delete unused code**: Remove dead code, unused imports, and deprecated functionality
3. **DRY principle**: Avoid duplication; extract common patterns into reusable functions or components
4. **Test coverage**: All new features must have corresponding tests. If existing features lack tests, add them

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

App runs on `http://localhost:4849`

#### GHCR Publishing

- `main` pushes publish `ghcr.io/<owner>/<repo>:main` and `:sha-<short>` (GHCR lowercases the repo name, e.g. `ghcr.io/owner/timetracker`).
- Version tags (including patch tags like `v1.0.1`) publish semver tags plus `:latest` for production.

#### Data Persistence

Docker uses **named volumes** (not bind mounts) for data persistence:
- `chronoflow-data` - SQLite database (`/app/data/timetracker.db` in container)
- `chronoflow-logs` - Winston log files (`/app/logs` in container)

These are stored in Docker's internal storage (typically `/var/lib/docker/volumes/`). To find the exact path:
```bash
docker volume inspect chronoflow-data
```

Note: The local `./data` and `./logs` directories are for development only and are not used by Docker.

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
| `PORT` | 4847 (dev) / 4849 (prod) | Server port |
| `DB_PATH` | ./data/timetracker.db | Database file path |
| `JWT_SECRET` | (dev default) | JWT signing secret |
| `NODE_ENV` | development | Environment |
| `CORS_ORIGIN` | * | Allowed CORS origins |

### Port Configuration

- **Development**: Server runs on port 4847, Vite dev server on port 4848 (proxies API to 4847)
- **Production**: Server runs on port 4849 (Docker exposes 4849)

## Scalability Features

The application includes several features to support growth:

### Database
- **Batched writes**: Database saves are batched every 5 seconds to reduce I/O
- **Optimized indexes**: Composite indexes on frequently queried columns
- **Graceful shutdown**: Pending writes are saved on process termination

### API
- **Rate limiting**: 100 requests per minute per IP address
- **Pagination**: Time entries support `limit` and `offset` query parameters
- **Date filtering**: Time entries can be filtered by `startDate` and `endDate`
- **Request size limits**: JSON body limited to 1MB

### Security
- **Security headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
- **HSTS**: Strict-Transport-Security in production
- **CORS configuration**: Configurable allowed origins

### Future Scalability Path
When the application needs to scale beyond a single server:
1. Replace sql.js with PostgreSQL for multi-instance support
2. Add Redis for session storage and caching
3. Use a load balancer for horizontal scaling
4. Consider read replicas for analytics queries

## Database Schema Changes

When making changes to the database schema, follow these guidelines:

### Migration Best Practices
1. **Always use migrations**: Add new migrations to `server/migrations/index.ts` - never modify existing migrations
2. **Test migrations**: Ensure migrations work on both fresh databases and existing databases with data
3. **SQLite limitations**: SQLite doesn't support `DROP COLUMN` directly - use the table recreation pattern (create new table, copy data, drop old, rename)
4. **Backward compatibility**: Consider how changes affect existing deployments during the migration window
5. **Avoid redundant columns**: Don't store values that can be computed from other columns (e.g., `duration_minutes` is computed from `start_time` and `end_time`)

### Schema Design Principles
- **Normalize where practical**: Avoid data duplication
- **Index strategically**: Add indexes for frequently queried columns, especially in WHERE and JOIN clauses
- **Use foreign keys**: Maintain referential integrity with CASCADE deletes where appropriate

## Documentation Maintenance

**Important**: As the project evolves, keep documentation in sync:

- Update this `AGENTS.md` file when adding new features, changing architecture, or modifying development workflows
- Update `README.md` when user-facing features, installation, or configuration changes (this is for end users)
- Update `DEVELOPMENT.md` when development workflows, testing, or contribution guidelines change (this is for contributors)
- Review all docs periodically to ensure accuracy

## Release Process

When bumping a minor or major version:

1. **Create tags with the new version** (e.g., `vX.Y.Z`) after the release commit is ready.
2. **Correct release notes once merged** (ensure the release is tied to the final merged commit).
3. **List changes using short PR references** (e.g., `#47`) instead of full URLs in the release notes.
