#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="https://github.com/Ayoubvvch/quick-jellyfin.git"
INSTALL_DIR="${QUICK_JELLYFIN_DIR:-$HOME/quick-jellyfin}"
JELLYFIN_PORT="${JELLYFIN_PORT:-8096}"
DOWNLOADER_PORT="${DOWNLOADER_PORT:-5000}"

log() { printf '\n\033[1;36m[QUICK-JELLYFIN]\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m[QUICK-JELLYFIN WARNING]\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31m[QUICK-JELLYFIN ERROR]\033[0m %s\n' "$*" >&2; exit 1; }
run_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

log "⚡ Starting Quick-Jellyfin 1-Click Deployment..."

command -v curl >/dev/null 2>&1 || fail 'curl is required. Install curl and re-run.'
command -v git >/dev/null 2>&1 || {
    log "Installing git..."
    if command -v apt-get >/dev/null 2>&1; then
        run_root apt-get update -y && run_root apt-get install -y git
    fi
}

# 1. Install Docker & Docker Compose if missing
if ! command -v docker >/dev/null 2>&1; then
    log "Docker is not installed. Installing Docker via official installer..."
    curl -fsSL https://get.docker.com | run_root sh
    if [ "$(id -u)" -ne 0 ]; then
        run_root usermod -aG docker "$USER" || true
    fi
fi

DOCKER_COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    log "Installing Docker Compose plugin..."
    if command -v apt-get >/dev/null 2>&1; then
        run_root apt-get update -y && run_root apt-get install -y docker-compose-plugin || true
    fi
    if docker compose version >/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD="docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD="docker-compose"
    else
        fail "Could not find or install docker compose. Please install Docker Compose and re-run."
    fi
fi

# 2. Clone or update repository
if [ -d "$INSTALL_DIR/.git" ]; then
    log "Updating existing Quick-Jellyfin installation at $INSTALL_DIR..."
    git -C "$INSTALL_DIR" fetch origin main
    git -C "$INSTALL_DIR" checkout main
    git -C "$INSTALL_DIR" pull origin main
else
    log "Cloning Quick-Jellyfin into $INSTALL_DIR..."
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone --branch main --single-branch "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# 3. Create required media & config directories
log "Preparing media libraries and configuration directories..."
mkdir -p "$INSTALL_DIR/media/movies"
mkdir -p "$INSTALL_DIR/media/shows"
mkdir -p "$INSTALL_DIR/media/anime"
mkdir -p "$INSTALL_DIR/config/jellyfin"
mkdir -p "$INSTALL_DIR/config/downloader"

# Ensure proper permissions
chmod -R 775 "$INSTALL_DIR/media" || true

# 4. Environment configuration
if [ ! -f "$INSTALL_DIR/.env" ]; then
    log "Generating default .env configuration..."
    cat << EOF > "$INSTALL_DIR/.env"
JELLYFIN_PORT=${JELLYFIN_PORT}
DOWNLOADER_PORT=${DOWNLOADER_PORT}
PUID=$(id -u)
PGID=$(id -g)
TZ=$(timedatectl show --property=Timezone --value 2>/dev/null || echo "UTC")
EOF
fi

# 5. Build and launch containers
log "Building and starting containers via $DOCKER_COMPOSE_CMD..."
$DOCKER_COMPOSE_CMD up -d --build

# 6. Retrieve server IP
SERVER_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")"

printf '\n\033[1;32m==================================================================\033[0m\n'
printf '\033[1;32m🎉 Quick-Jellyfin deployed successfully!\033[0m\n'
printf '\033[1;32m==================================================================\033[0m\n\n'

printf '🍿 \033[1;37mJellyfin Media Server:\033[0m      http://%s:%s\n' "$SERVER_IP" "$JELLYFIN_PORT"
printf '📥 \033[1;37mSmart Download Manager:\033[0m     http://%s:%s\n' "$SERVER_IP" "$DOWNLOADER_PORT"
printf '📁 \033[1;37mMedia Storage Directory:\033[0m   %s/media\n\n' "$INSTALL_DIR"

printf '\033[1;33m⚠️  Firewall Notice:\033[0m\n'
printf 'Make sure ports \033[1m%s\033[0m and \033[1m%s\033[0m (TCP) are allowed in your firewall.\n' "$JELLYFIN_PORT" "$DOWNLOADER_PORT"
if command -v ufw >/dev/null 2>&1; then
    printf 'Run: sudo ufw allow %s/tcp && sudo ufw allow %s/tcp\n\n' "$JELLYFIN_PORT" "$DOWNLOADER_PORT"
fi

printf '\033[1;36mUseful Management Commands:\033[0m\n'
printf '  View live logs:     cd %s && %s logs -f\n' "$INSTALL_DIR" "$DOCKER_COMPOSE_CMD"
printf '  Restart stack:      cd %s && %s restart\n' "$INSTALL_DIR" "$DOCKER_COMPOSE_CMD"
printf '  Stop stack:         cd %s && %s down\n\n' "$INSTALL_DIR" "$DOCKER_COMPOSE_CMD"
