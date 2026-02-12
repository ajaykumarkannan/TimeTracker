# ChronoFlow Development Guide

This guide is for contributors who want to develop and improve ChronoFlow.

## Quick Start

```bash
git clone https://github.com/YOUR-USERNAME/TimeTracker.git
cd TimeTracker
npm install
npm run dev
```

This starts both the Vite dev server (frontend) and Express server (backend) with hot reload.

- Frontend: http://localhost:4848 (proxies API to backend)
- Backend: http://localhost:4847

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite |
| Backend | Express.js, TypeScript |
| Database | SQLite (sql.js - WebAssembly) |
| Auth | JWT + refresh tokens |
| Styling | CSS variables (no framework) |
| Testing | Vitest, React Testing Library, Playwright |

## Project Structure

```
├── server/              # Express backend
│   ├── routes/          # API route handlers
│   ├── middleware/      # Auth (flexAuthMiddleware), security
│   ├── migrations/      # Database migrations
│   ├── __tests__/       # Server unit tests
│   ├── database.ts      # SQLite setup
│   └── logger.ts        # Winston logger
├── src/                 # React frontend
│   ├── components/      # UI components with co-located CSS
│   │   └── __tests__/   # Component tests
│   ├── contexts/        # Auth & Theme providers
│   ├── hooks/           # Custom hooks
│   ├── api.ts           # API client
│   └── types.ts         # Shared TypeScript types
├── e2e/                 # Playwright E2E tests
├── extension/           # Browser extension
└── data/                # SQLite database (gitignored)
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev servers (client + server) |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run lint` | Run ESLint |
| `npm run test:all` | Run lint, unit, and E2E tests | 
| `npm run build` | Production build |
| `npm start` | Run production build |

## Git Workflow

We use a `develop` branch for integration:

```
main (production-ready)
  └── develop (integration branch)
        ├── feature/feature-name
        └── fix/bug-name
```

1. **Branch from develop**: `git checkout -b feature/my-feature develop`
2. **Commit frequently** with meaningful messages
3. **Merge back to develop** when complete
4. **Create PR to main** for releases (requires review)

## Testing

### Unit Tests

```bash
npm test              # Run once
npm run test:watch    # Watch mode
```

Tests live in `__tests__` folders adjacent to source files.

### E2E Tests

```bash
npm run test:e2e
```

E2E tests are in `e2e/` and cover critical user flows.

### Before Committing

Always run:
```bash
npm run lint && npm test && npm run test:e2e
```

## API Design

All routes prefixed with `/api/`:

| Endpoint | Description |
|----------|-------------|
| `POST /auth/register` | Create account |
| `POST /auth/login` | Login |
| `POST /auth/refresh` | Refresh JWT |
| `GET /time-entries` | List entries (supports pagination) |
| `POST /time-entries/start` | Start timer |
| `POST /time-entries/:id/stop` | Stop timer |
| `GET /categories` | List categories |
| `GET /analytics?start=&end=` | Get analytics |
| `GET /export` | Export JSON |
| `GET /export/csv` | Export CSV |
| `POST /export/csv` | Import CSV |

### Authentication

- **JWT Auth**: `Authorization: Bearer <token>` header
- **Guest Auth**: `X-Session-ID: <uuid>` header
- Routes use `flexAuthMiddleware` which accepts either method

## Docker Development

### Build and Test Locally

```bash
# Build image
docker build -t chronoflow:dev .

# Run container
docker run -d -p 4849:4849 -e JWT_SECRET=dev-secret chronoflow:dev

# Test health
curl http://localhost:4849/api/health
```

### Multi-arch Build (for releases)

The CI builds for `linux/amd64`, `linux/arm64`, and `linux/arm/v7` (Raspberry Pi).

## CI/CD Workflow

ChronoFlow uses a single unified GitHub Actions workflow (`main.yml`) that handles all CI/CD needs:

### Triggers
- **Pull Requests** to main - Runs all validation checks
- **Pushes to main** - Runs validation + auto patch bump + Docker publish
- **Version tags** (e.g., `v1.0.0`) - Runs validation + Docker publish + GitHub release
- **Manual dispatch** - Can be triggered manually when needed

### Jobs
All events run the core CI jobs:
- **Lint & Type Check** - ESLint + TypeScript validation (client + server)
- **Security Audit** - npm audit for vulnerabilities
- **Unit Tests** - Comprehensive test suite with coverage reporting
- **Build** - Production build validation
- **E2E Tests** - Playwright end-to-end testing
- **Docker Test** - Container build and health check

Additional jobs based on event type:
- **Patch Bump** (main only) - Auto-increments patch version
- **Docker Publish** (main + tags) - Multi-arch build to GHCR
- **Create Release** (tags only) - GitHub release with auto-generated notes

### Workflow Behavior

| Event | CI Jobs | Additional Actions |
|-------|---------|-------------------|
| PR to main | ✅ All validation | Coverage reporting |
| Push to main | ✅ All validation | → Patch bump → Docker publish |
| Version tag | ✅ All validation | → Docker publish → GitHub release |

This unified approach eliminates code duplication while ensuring comprehensive testing for all code changes.

## Releasing

### Automatic Patch Releases (Default)
Every merge to `main` automatically:
1. Runs all CI checks
2. Bumps the patch version (e.g., `0.10.4` → `0.10.5`)
3. Creates a git tag
4. Builds and publishes a multi-arch Docker image to GHCR

No manual intervention needed! Users with Watchtower auto-update within an hour.

### Manual Minor/Major Releases
For feature releases or breaking changes:

1. Run the `manual-version-bump` workflow in GitHub Actions and select `minor` or `major`.
   - Minor bumps reset patch to `0` (e.g., `1.4.2` → `1.5.0`).
   - Major bumps reset minor and patch to `0` (e.g., `1.4.2` → `2.0.0`).

2. GitHub Actions will:
    - Run all CI checks
    - Build multi-arch Docker image
    - Push to GitHub Container Registry (ghcr.io)
    - Create GitHub Release with auto-generated notes

3. Manually create a GitHub Release for the new tag with a changelog

## GHCR Publishing

- **Main pushes** publish `ghcr.io/<owner>/<repo>:main` for continuous deployment
- **Version tags** (e.g., `v1.0.0`) publish semver tags (`1.0.0`, `1.0`, `1`) plus `:latest`
- GHCR lowercases repo names (e.g., `ghcr.io/ajaykumarkannan/timetracker`)

**Package visibility:** New GHCR packages start as private. The workflows try to set visibility to public via the API so anyone can `docker pull` without logging in. If that step fails (e.g. token lacks permission), make the package public once manually: open the package page (e.g. **Your profile → Packages →** the container image), then **Package settings → Danger zone → Change visibility → Public**. This is irreversible.

## Environment Variables

### Development

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4847 | Server port |
| `DB_PATH` | ./data/timetracker.db | Database path |
| `JWT_SECRET` | dev-default | Token secret |

### Production

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4849 | Server port |
| `JWT_SECRET` | - | **Required** |
| `CORS_ORIGIN` | * | Allowed origins |
| `TRUST_PROXY` | true | Behind reverse proxy |
| `RATE_LIMIT_MAX` | 100 | Requests/minute |

## Logging

Winston logger outputs to:
- `logs/combined.log` - All levels
- `logs/error.log` - Errors only
- Console in development

Log levels: error, warn, info, http, debug

## Database

SQLite via sql.js (WebAssembly). Features:
- Batched writes (every 5 seconds)
- Optimized indexes
- Graceful shutdown saves pending writes

### Migrations

Add migrations in `server/migrations/index.ts`. They run automatically on startup.

## Scalability Notes

Current architecture is single-server. For scaling:
1. Replace sql.js with PostgreSQL
2. Add Redis for sessions/caching
3. Use load balancer for horizontal scaling
4. Consider read replicas for analytics

## Code Style

- TypeScript strict mode
- ESLint for linting
- Co-locate CSS with components (`ComponentName.css`)
- Use CSS variables for theming (defined in `src/index.css`)
