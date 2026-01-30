# ChronoFlow ⏱️

A simple, beautiful time tracking app to understand where your hours go.

## Features

- 🚀 **One-Click Tracking** - Start timers instantly with quick-start buttons
- 🎨 **Color-Coded Categories** - Organize time visually (5 defaults included)
- 📝 **Notes** - Add context to every entry
- 📊 **Analytics** - Charts and insights on your time usage
- 🌙 **Dark Mode** - Light, dark, or system theme
- 👤 **Guest Mode** - No signup required, convert to account later
- 📤 **Import/Export** - CSV and JSON data portability
- 🔌 **Browser Extension** - Quick access from any tab

## Quick Start

### Docker (Recommended)

```bash
docker-compose up -d
```

Visit http://localhost:3001

### Development

```bash
npm install
npm run dev
```

## Deployment

For production deployment (Raspberry Pi, VPS, etc.), see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

Highlights:
- Auto-updates via Watchtower when you push new tags
- Cloudflare Tunnel support (no exposed ports)
- Database migrations run automatically
- Health checks at `/api/health` and `/api/version`

## Usage Modes

| Mode | Description |
|------|-------------|
| **Guest** | Start immediately, no signup. Data stored server-side with session ID. Convert to account anytime. |
| **Account** | Email/password login. Sync across devices via JWT auth. |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite |
| Backend | Express.js, TypeScript |
| Database | SQLite (sql.js) |
| Auth | JWT + refresh tokens |
| Styling | CSS variables (no framework) |

## API

All routes prefixed with `/api/`:

| Endpoint | Description |
|----------|-------------|
| `POST /auth/register` | Create account |
| `POST /auth/login` | Login |
| `GET /time-entries` | List entries |
| `POST /time-entries/start` | Start timer |
| `POST /time-entries/:id/stop` | Stop timer |
| `GET /categories` | List categories |
| `GET /analytics?start=&end=` | Get analytics |
| `GET /export` | Export JSON |
| `GET /export/csv` | Export CSV |
| `POST /export/csv` | Import CSV |
| `GET /health` | Health check |
| `GET /version` | App version |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `DB_PATH` | ./data/timetracker.db | Database path |
| `JWT_SECRET` | dev-default | **Set in production!** |
| `CORS_ORIGIN` | * | Allowed origins |
| `TRUST_PROXY` | false | Enable behind reverse proxy |

## Development

```bash
npm test          # Unit tests
npm run test:e2e  # E2E tests  
npm run lint      # Lint
npm run build     # Production build
```

## Project Structure

```
server/           # Express backend
  routes/         # API endpoints
  middleware/     # Auth, security
  migrations/     # Database migrations
src/              # React frontend
  components/     # UI components + CSS
  contexts/       # Auth, Theme providers
e2e/              # Playwright tests
extension/        # Browser extension
```

## License

MIT
