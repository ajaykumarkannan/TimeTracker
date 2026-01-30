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

## Docker Deployment

### Local Development with Docker

Build and run locally:

```bash
# Build and start
docker-compose up --build -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

The app runs on port 3001 with persistent volumes for data and logs.

### Production Deployment

For production, use `docker-compose.prod.yml` which includes:
- Pre-built images from GitHub Container Registry
- Cloudflare Tunnel for secure access (no exposed ports)
- Watchtower for automatic updates
- Required environment variables

```bash
# Create .env file
cat > .env << 'EOF'
GITHUB_REPO=your-username/chronoflow
JWT_SECRET=$(openssl rand -base64 32)
CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token
CORS_ORIGIN=https://chronoflow.yourdomain.com
EOF

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

### Building the Docker Image

```bash
# Build for local architecture
docker build -t chronoflow .

# Run standalone
docker run -d \
  -p 3001:3001 \
  -v chronoflow-data:/app/data \
  -e JWT_SECRET=your-secret-here \
  chronoflow
```

### Health Checks

```bash
curl http://localhost:3001/api/health   # Basic health
curl http://localhost:3001/api/version  # App version
```

### Resource Limits

Default limits (suitable for Raspberry Pi):
- Memory: 256MB limit, 128MB reserved
- Logs: 10MB max, 3 files retained

Adjust in `docker-compose.yml` under `deploy.resources`.

For detailed production setup (Raspberry Pi, VPS, auto-updates, backups), see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

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
work/             # Local dev artifacts (gitignored)
```

The `work/` directory is for local development artifacts like test databases, Docker volumes, or temporary files. It's gitignored to keep the repo clean.

## License

MIT
