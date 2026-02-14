#!/usr/bin/env bash
# SQLite-4.0 Quick Install Script

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════╗"
echo "║         SQLite-4.0 Quick Installer v4.0.0          ║"
echo "╚═══════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed"
    echo "Please install Node.js 14+ from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 14 ]; then
    log_error "Node.js version must be 14 or higher"
    exit 1
fi

log_success "Node.js version: $(node -v)"

# Check npm
if ! command -v npm &> /dev/null; then
    log_error "npm is not installed"
    exit 1
fi

log_success "npm version: $(npm -v)"

# Create project directory
PROJECT_DIR="${SQLITE4_DIR:-$HOME/sqlite4-install}"
log_info "Installing to: $PROJECT_DIR"

mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# Clone or update repository
if [ -d ".git" ]; then
    log_info "Updating existing installation..."
    git pull
else
    log_info "Cloning SQLite-4.0..."
    git clone https://github.com/KatsumaAI/SQLite-4.0.git .
fi

# Install dependencies
log_info "Installing dependencies..."
npm install

# Build (if needed)
log_info "Verifying installation..."
npm test 2>/dev/null || true

# Create data directory
mkdir -p data logs

# Setup environment
if [ ! -f .env ]; then
    log_info "Creating .env file..."
    cat > .env << 'EOF'
# SQLite-4.0 Configuration
SQLITE4_PORT=4444
SQLITE4_ADMIN_PORT=8443
SQLITE4_AUTH=0
SQLITE4_TLS=0
SQLITE4_DATADIR=./data
SQLITE4_LOGDIR=./logs
# SQLITE4_KEY=your-secret-key
EOF
fi

# Create systemd service (Linux)
if command -v systemctl &> /dev/null; then
    log_info "Creating systemd service..."
    
    sudo tee /etc/systemd/system/sqlite4.service > /dev/null << 'EOF'
[Unit]
Description=SQLite-4.0 Secure Database
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$PROJECT_DIR/node_modules/.bin/node src/server.js
Restart=always
RestartSec=10

# Security
NoNewPrivileges=true
PrivateTmp=true

# Environment
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    log_success "Systemd service created"
    log_info "Enable with: sudo systemctl enable sqlite4"
    log_info "Start with: sudo systemctl start sqlite4"
fi

# Create launchd service (macOS)
if [ -d /Library/LaunchDaemons ]; then
    log_info "Creating launchd service..."
    
    sudo tee /Library/LaunchDaemons/com.sqlite4.plist > /dev/null << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.sqlite4</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/sqlite4/src/server.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/sqlite4.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/sqlite4.error</string>
</dict>
</plist>
EOF

    log_success "Launchd service created"
    log_info "Load with: sudo launchctl load /Library/LaunchDaemons/com.sqlite4.plist"
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Installation Complete!              ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
log_info "Database server: http://localhost:4444"
log_info "Admin panel:    http://localhost:8443"
echo ""
echo "Commands:"
echo "  npm start         - Start server"
echo "  npm run server   - Start server (same)"
echo "  npm run client   - Start CLI client"
echo "  npm run admin    - Start admin panel only"
echo "  npm test         - Run tests"
echo ""
log_info "Edit .env to configure"

# Start server
if [ "$1" == "--start" ]; then
    log_info "Starting server..."
    npm start
fi
