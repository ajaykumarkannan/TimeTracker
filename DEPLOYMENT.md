# ChronoFlow Deployment Guide

## Quick Start (Raspberry Pi + Cloudflare Tunnel)

### Prerequisites
- Raspberry Pi with Docker installed
- Cloudflare account with a domain
- Cloudflare Tunnel configured
- GitHub account (for container registry)

### 1. Configure Environment

```bash
# Create a directory for ChronoFlow
mkdir ~/chronoflow && cd ~/chronoflow

# Download docker-compose file
curl -O https://raw.githubusercontent.com/YOUR-USERNAME/chronoflow/main/docker-compose.prod.yml

# Create environment file
cat > .env << 'EOF'
GITHUB_REPO=your-username/chronoflow
JWT_SECRET=$(openssl rand -base64 32)
CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token
CORS_ORIGIN=https://chronoflow.yourdomain.com
EOF
```

### 2. Configure Cloudflare Tunnel

In Cloudflare Zero Trust dashboard:
1. Create a tunnel
2. Add a public hostname pointing to `http://chronoflow:3001`
3. Copy the tunnel token to your `.env`

### 3. Deploy

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 4. Verify

```bash
# Check health
curl http://localhost:3001/api/health

# Check version
curl http://localhost:3001/api/version
```

---

## Auto-Deployment (Recommended)

ChronoFlow uses **Watchtower** to automatically deploy new versions when you push a tagged release.

### How It Works

1. You push a version tag to GitHub: `git tag v1.2.0 && git push --tags`
2. GitHub Actions builds a multi-arch Docker image
3. Image is pushed to GitHub Container Registry (ghcr.io)
4. Watchtower on your Pi detects the new image (checks hourly)
5. Watchtower pulls and restarts the container automatically

### Release a New Version

```bash
# Bump version in package.json
npm version patch  # or minor, major

# Push with tags
git push && git push --tags
```

That's it! Your Raspberry Pi will update within an hour.

### Force Immediate Update

```bash
# Trigger Watchtower to check now
docker exec watchtower /watchtower --run-once
```

### Check Update Status

```bash
# View Watchtower logs
docker logs watchtower

# Check current version
curl http://localhost:3001/api/version
```

---

## Manual Upgrade (Alternative)

If you prefer manual control:

```bash
# Pull latest image
docker-compose -f docker-compose.prod.yml pull

# Restart with new image
docker-compose -f docker-compose.prod.yml up -d
```

---

## Rollback to Previous Version

If a new version has issues:

```bash
# Stop current version
docker-compose -f docker-compose.prod.yml down

# Pull specific version (e.g., v1.1.0)
docker pull ghcr.io/your-username/chronoflow:1.1.0

# Update docker-compose.prod.yml to use specific tag
# Change: image: ghcr.io/${GITHUB_REPO}:latest
# To:     image: ghcr.io/${GITHUB_REPO}:1.1.0

# Or set via environment variable
export CHRONOFLOW_VERSION=1.1.0
docker-compose -f docker-compose.prod.yml up -d
```

**Note**: Database migrations are forward-only. If you need to rollback a migration, restore from backup first.

---

## Backup & Restore

### Backup Database

```bash
# Stop the container (ensures clean backup)
docker-compose -f docker-compose.prod.yml stop chronoflow

# Copy database
cp ./data/timetracker.db ./backups/timetracker-$(date +%Y%m%d).db

# Restart
docker-compose -f docker-compose.prod.yml start chronoflow
```

### Automated Backups (cron)

Add to crontab (`crontab -e`):
```bash
# Daily backup at 2 AM
0 2 * * * cd /path/to/chronoflow && cp ./data/timetracker.db ./backups/timetracker-$(date +\%Y\%m\%d).db
```

### Restore from Backup

```bash
docker-compose -f docker-compose.prod.yml stop chronoflow
cp ./backups/timetracker-YYYYMMDD.db ./data/timetracker.db
docker-compose -f docker-compose.prod.yml start chronoflow
```

---

## Security Checklist

- [ ] Set strong `JWT_SECRET` (min 32 characters)
- [ ] Configure `CORS_ORIGIN` to your domain only
- [ ] Use Cloudflare Tunnel (no exposed ports)
- [ ] Enable Cloudflare WAF rules
- [ ] Set up Cloudflare Access for admin protection (optional)
- [ ] Regular backups enabled
- [ ] Monitor logs for suspicious activity

---

## Monitoring

### View Logs

```bash
# All logs
docker-compose -f docker-compose.prod.yml logs -f

# Just ChronoFlow
docker-compose -f docker-compose.prod.yml logs -f chronoflow
```

### Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/health` | Basic health check |
| `/api/ready` | Readiness (migrations complete) |
| `/api/version` | App and database version |

### Resource Usage

```bash
docker stats chronoflow
```

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs chronoflow

# Common issues:
# - Missing JWT_SECRET: Set in .env
# - Port conflict: Change PORT in .env
# - Permission denied: Check data directory ownership
```

### Database locked

```bash
# Restart container
docker-compose -f docker-compose.prod.yml restart chronoflow
```

### High memory usage

Adjust limits in `docker-compose.prod.yml`:
```yaml
deploy:
  resources:
    limits:
      memory: 128M  # Reduce for Pi Zero
```

### Cloudflare Tunnel not connecting

```bash
# Check tunnel logs
docker-compose -f docker-compose.prod.yml logs cloudflared

# Verify token is correct in .env
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes (prod) | dev-default | Token signing secret |
| `CLOUDFLARE_TUNNEL_TOKEN` | Yes (tunnel) | - | Cloudflare tunnel token |
| `PORT` | No | 3001 | Server port |
| `DB_PATH` | No | /app/data/timetracker.db | Database location |
| `CORS_ORIGIN` | No | * | Allowed origins |
| `RATE_LIMIT_MAX` | No | 100 | Requests per minute |
| `TRUST_PROXY` | No | true | Trust X-Forwarded headers |
