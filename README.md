# ChronoFlow ⏱️

[![CI](https://github.com/ajaykumarkannan/TimeTracker/actions/workflows/main.yml/badge.svg)](https://github.com/ajaykumarkannan/TimeTracker/actions/workflows/main.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/ajaykumarkannan/9a5e749ae6f866ffafa27c92fb237cf7/raw/chronoflow-coverage-badge.json)](https://gist.github.com/ajaykumarkannan/9a5e749ae6f866ffafa27c92fb237cf7)

A simple, beautiful time tracking app to understand where your hours go.

## Features

### Time Tracking
- 🚀 **One-Click Tracking** - Start timers instantly with quick-start buttons for recent tasks
- ⏱️ **Smart Task Suggestions** - Fuzzy search autocomplete based on your history, prioritizing tasks you do on the same day of the week
- ⏰ **Scheduled Auto-Stop** - Set a timer to stop after a duration or at a specific time
- 🔄 **Quick Task Switching** - Switch between tasks without stopping the timer
- � **Idle Detection** - Automatically detects when you're away and offers to adjust time
- 📝 **Manual Entry** - Add entries for time you forgot to track
- ⏸️ **Break Indicators** - See gaps between entries and click to fill them in

### Organization
- 🎨 **Color-Coded Categories** - 5 defaults included (Meetings, Deep Work, Email & Communication, Planning, Break)
- 🏷️ **Task Names** - Add context to every entry with searchable task descriptions
- ✏️ **Inline Editing** - Click any entry to edit category, task, or times directly
- � **Merge Suggestions** - Automatically suggests merging short consecutive entries

### Analytics
- 📊 **Visual Dashboard** - Charts showing time distribution by category
- 📈 **Trend Analysis** - Compare time usage across days, weeks, and months
- 🎯 **Daily/Weekly/Monthly Views** - Flexible date range selection
- ⏱️ **Live Tracking Display** - See your currently active task in the analytics view

### Data & Privacy
- 👤 **Guest Mode** - No signup required, start tracking immediately
- 🔐 **Account Mode** - Optional registration for cross-device sync
- 📤 **Export** - Download your data as CSV or JSON
- 📥 **Import** - Restore from previous exports
- 🗄️ **Self-Hosted** - Your data stays on your server

### Interface
- 🌙 **Dark/Light/System Theme** - Automatic theme switching
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile
- 🔌 **Browser Extension** - Quick access from any tab (Chrome/Firefox)

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
  ghcr.io/ajaykumarkannan/timetracker:latest

# Visit http://localhost:4849
```

Or use docker-compose for a more complete setup:

```bash
# Clone the repo (or just download docker-compose.yml)
curl -O https://raw.githubusercontent.com/ajaykumarkannan/TimeTracker/main/docker-compose.yml

# Start
docker-compose up -d

# Visit http://localhost:4849
```

### Production Deployment

For production with Cloudflare Tunnel and auto-updates:

```bash
# Download production compose file
curl -O https://raw.githubusercontent.com/ajaykumarkannan/TimeTracker/main/docker-compose.prod.yml

# Create environment file
cat > .env << 'EOF'
GITHUB_REPO=ajaykumarkannan/timetracker
JWT_SECRET=$(openssl rand -base64 32)
CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token
CORS_ORIGIN=https://chronoflow.yourdomain.com
EOF

# Deploy with Docker named volumes (default, recommended)
docker-compose -f docker-compose.prod.yml up -d

# Or deploy with local bind mounts (easier backup access)
docker-compose -f docker-compose.prod.yml --profile local up -d
```

#### Volume Profiles

| Profile | Command | Description |
|---------|---------|-------------|
| (default) | (none) | Docker named volumes (recommended, managed by Docker) |
| `local` | `--profile local` | Local bind mounts (`./data`, `./logs` - easier direct access) |
| `tunnel` | `--profile tunnel` | Adds Cloudflare Tunnel (combine with default or local) |

Combine profiles as needed:
```bash
# Docker volumes + Cloudflare Tunnel
docker-compose -f docker-compose.prod.yml --profile tunnel up -d

# Local bind mounts + Cloudflare Tunnel
docker-compose -f docker-compose.prod.yml --profile local --profile tunnel up -d
```

For local profile, customize paths in `.env`:
```bash
DATA_PATH=/mnt/storage/chronoflow/data
LOGS_PATH=/mnt/storage/chronoflow/logs
```

The production setup includes:
- **Watchtower** for automatic updates when new versions are released
- **Cloudflare Tunnel** for secure access without exposed ports
- Resource limits suitable for Raspberry Pi

### GitHub Container Registry (GHCR)

Images are published to GHCR at `ghcr.io/ajaykumarkannan/timetracker` (repo name is lowercased by GHCR). Version bumps (including patch versions like `v1.0.1`) publish semver tags plus `:latest`. If you fork the repo, set `GITHUB_REPO` to your owner/repo in lowercase (e.g. `youruser/timetracker`). The first publish may create the package as private; if so, open the package on GitHub → Package settings → Change visibility to **Public** so `docker pull` works without login.

### Manual Minor/Major Releases

Use the `manual-version-bump` GitHub Actions workflow and select `minor` or `major`:
- Minor bumps reset patch to `0` (e.g., `1.4.2` → `1.5.0`).
- Major bumps reset minor and patch to `0` (e.g., `1.4.2` → `2.0.0`).

For private images, authenticate first:
```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

### npm (Without Docker)

```bash
# Clone and install
git clone https://github.com/YOUR-USERNAME/TimeTracker.git
cd TimeTracker
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
