# ChronoFlow ⏱️

[![CI](https://github.com/ajaykumarkannan/TimeTracker/actions/workflows/ci.yml/badge.svg)](https://github.com/ajaykumarkannan/TimeTracker/actions/workflows/ci.yml)
![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/ajaykumarkannan/9a5e749ae6f866ffafa27c92fb237cf7/raw/chronoflow-coverage-badge.json)

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

## Installation

### Docker (Recommended)

The easiest way to run ChronoFlow is with Docker:

```bash
# Quick start (development/testing)
docker run -d \
  -p 4849:4849 \
  -v chronoflow-data:/app/data \
  -e JWT_SECRET=$(openssl rand -base64 32) \
  --name chronoflow \
  ghcr.io/YOUR-USERNAME/chronoflow:latest

# Visit http://localhost:4849
```

Or use docker-compose for a more complete setup:

```bash
# Clone the repo (or just download docker-compose.yml)
curl -O https://raw.githubusercontent.com/YOUR-USERNAME/chronoflow/main/docker-compose.yml

# Start
docker-compose up -d

# Visit http://localhost:4849
```

### Production Deployment

For production with Cloudflare Tunnel and auto-updates:

```bash
# Download production compose file
curl -O https://raw.githubusercontent.com/YOUR-USERNAME/chronoflow/main/docker-compose.prod.yml

# Create environment file
cat > .env << 'EOF'
GITHUB_REPO=your-username/chronoflow
JWT_SECRET=$(openssl rand -base64 32)
CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token
CORS_ORIGIN=https://chronoflow.yourdomain.com
EOF

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

The production setup includes:
- **Watchtower** for automatic updates when new versions are released
- **Cloudflare Tunnel** for secure access without exposed ports
- Resource limits suitable for Raspberry Pi

### npm (Without Docker)

```bash
# Clone and install
git clone https://github.com/YOUR-USERNAME/chronoflow.git
cd chronoflow
npm install

# Build for production
npm run build

# Set environment and start
export JWT_SECRET=$(openssl rand -base64 32)
npm start

# Visit http://localhost:4849
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4849 | Server port |
| `JWT_SECRET` | - | **Required in production** - Token signing secret |
| `DB_PATH` | ./data/timetracker.db | Database file location |
| `CORS_ORIGIN` | * | Allowed origins (set to your domain in production) |
| `TRUST_PROXY` | false | Set to `true` behind a reverse proxy |

## Usage

### Guest Mode vs Account Mode

| Mode | Description |
|------|-------------|
| **Guest** | Start immediately without signup. Data stored server-side with a session ID. Convert to a full account anytime. |
| **Account** | Email/password login. Sync across devices. |

### Health Checks

```bash
curl http://localhost:4849/api/health   # Basic health
curl http://localhost:4849/api/version  # App version
```

## Updating

### With Watchtower (Automatic)

If you're using `docker-compose.prod.yml`, Watchtower checks for updates hourly and automatically restarts with new versions.

Force an immediate update:
```bash
docker exec watchtower /watchtower --run-once
```

### Manual Update

```bash
docker-compose pull
docker-compose up -d
```

## Backup & Restore

### Backup

```bash
# Stop container for clean backup
docker-compose stop chronoflow
cp ./data/timetracker.db ./backups/timetracker-$(date +%Y%m%d).db
docker-compose start chronoflow
```

### Restore

```bash
docker-compose stop chronoflow
cp ./backups/timetracker-YYYYMMDD.db ./data/timetracker.db
docker-compose start chronoflow
```

## Troubleshooting

### Container won't start

```bash
docker-compose logs chronoflow
```

Common issues:
- Missing `JWT_SECRET` - Set it in your `.env` file
- Port conflict - Change `PORT` in `.env`
- Permission denied - Check data directory ownership

### High memory usage

Adjust limits in `docker-compose.yml`:
```yaml
deploy:
  resources:
    limits:
      memory: 128M  # Reduce for constrained environments
```

## License

MIT
