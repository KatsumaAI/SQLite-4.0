#!/bin/bash
# SQLite-4.0 Security Configuration Script
# Run as root to configure security features

set -e

echo "=========================================="
echo "  SQLite-4.0 Security Configuration"
echo "=========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root"
    exit 1
fi

SQLITE4_DIR="/etc/sqlite4"
LOG_DIR="/var/log/sqlite4"
DATA_DIR="/var/lib/sqlite4"

log_info "Starting SQLite-4.0 security configuration..."

# ============================================
# 1. CREATE DIRECTORIES
# ============================================
log_info "Creating directories..."

mkdir -p "$SQLITE4_DIR"
mkdir -p "$LOG_DIR"
mkdir -p "$DATA_DIR"
mkdir -p "$SQLITE4_DIR/keys"

chmod 700 "$SQLITE4_DIR"
chmod 700 "$SQLITE4_DIR/keys"
chmod 755 "$LOG_DIR"
chmod 700 "$DATA_DIR"

# ============================================
# 2. GENERATE ENCRYPTION KEYS
# ============================================
log_info "Generating encryption keys..."

if [ ! -f "$SQLITE4_DIR/keys/master.key" ]; then
    openssl rand -base64 32 > "$SQLITE4_DIR/keys/master.key"
    chmod 600 "$SQLITE4_DIR/keys/master.key"
    log_info "Master key generated"
else
    log_info "Master key already exists"
fi

# Generate TLS certificates
if [ ! -f "$SQLITE4_DIR/server.key" ]; then
    openssl req -x509 -newkey rsa:4096 -keyout "$SQLITE4_DIR/server.key" \
        -out "$SQLITE4_DIR/server.crt" -days 365 -nodes \
        -subj "/C=US/ST=Local/L=Local/O=SQLite4/CN=localhost"
    chmod 600 "$SQLITE4_DIR/server.key"
    chmod 644 "$SQLITE4_DIR/server.crt"
    log_info "TLS certificates generated"
fi

# ============================================
# 3. CREATE CONFIGURATION
# ============================================
log_info "Creating configuration..."

cat > "$SQLITE4_DIR/config.json" << 'EOF'
{
  "server": {
    "port": 4444,
    "bind": "127.0.0.1",
    "tls": true,
    "cert": "/etc/sqlite4/server.crt",
    "key": "/etc/sqlite4/server.key",
    "max_connections": 100,
    "timeout": 30
  },
  "security": {
    "encryption": "aes-256-gcm",
    "auth_required": true,
    "ip_allowlist": ["127.0.0.1"],
    "query_allowlist_enabled": false,
    "rate_limit": 100,
    "max_query_size": 1048576,
    "enable_audit": true
  },
  "logging": {
    "query_log": "/var/log/sqlite4/queries.log",
    "access_log": "/var/log/sqlite4/access.log",
    "audit_log": "/var/log/sqlite4/audit.log",
    "log_level": "INFO"
  },
  "fail2ban": {
    "enabled": true,
    "max_retries": 3,
    "ban_time": 3600
  }
}
EOF

chmod 600 "$SQLITE4_DIR/config.json"

# ============================================
# 4. CREATE FIREWALL RULES
# ============================================
log_info "Configuring firewall..."

# Create firewall script
cat > /usr/local/bin/sqlite4-firewall.sh << 'EOF'
#!/bin/bash

# Allow localhost
iptables -A INPUT -i lo -j ACCEPT

# Allow established connections
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow SSH
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Allow SQLite4 (rate limited)
iptables -A INPUT -p tcp --dport 4444 -m conntrack --ctstate NEW \
    -m recent --set --name SQLITE4
iptables -A INPUT -p tcp --dport 4444 -m conntrack --ctstate NEW \
    -m recent --update --seconds 60 --hitcount 10 --name SQLITE4 -j DROP
iptables -A INPUT -p tcp --dport 4444 -j ACCEPT

# Allow admin panel
iptables -A INPUT -p tcp --dport 8443 -s 127.0.0.1 -j ACCEPT
iptables -A INPUT -p tcp --dport 8443 -s 192.168.0.0/16 -j ACCEPT

# Log dropped packets
iptables -A INPUT -m limit --limit 5/min -j LOG --log-prefix "SQLITE4-DROP: "

echo "Firewall configured"
EOF

chmod +x /usr/local/bin/sqlite4-firewall.sh

# ============================================
# 5. CONFIGURE FAIL2BAN
# ============================================
log_info "Configuring Fail2Ban..."

cat > /etc/fail2ban/jail.local.d/sqlite4.conf << 'EOF'
[sqlite4]
enabled = true
port = 4444
filter = sqlite4
maxretry = 3
bantime = 3600
findtime = 600
logpath = /var/log/sqlite4/access.log
EOF

# Create fail2ban filter
cat > /etc/fail2ban/filter.d/sqlite4.conf << 'EOF'
[Definition]
failregex = AUTH_FAILURE .* <HOST>
            RATE_LIMITED .* <HOST>
            INVALID_PASSWORD
ignoreregex =
EOF

systemctl enable fail2ban 2>/dev/null || true

# ============================================
# 6. SETUP LOGGING
# ============================================
log_info "Configuring logging..."

# Create logrotate config
cat > /etc/logrotate.d/sqlite4 << 'EOF'
/var/log/sqlite4/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
    sharedscripts
    postrotate
        systemctl reload sqlite4 2>/dev/null || true
    endscript
}
EOF

# Create rsyslog config
cat > /etc/rsyslog.d/30-sqlite4.conf << 'EOF'
# SQLite4 logging
if $programname startswith 'sqlite4' then /var/log/sqlite4/sqlite4.log
& stop
EOF

systemctl restart rsyslog 2>/dev/null || true

# ============================================
# 7. CREATE INIT SCRIPT
# ============================================
log_info "Creating service..."

cat > /etc/systemd/system/sqlite4.service << 'EOF'
[Unit]
Description=SQLite-4.0 Secure Database
After=network.target

[Service]
Type=simple
User=sqlite4
Group=sqlite4
ExecStart=/usr/local/bin/sqlite4-server --config /etc/sqlite4/config.json
Restart=always
RestartSec=10

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/sqlite4 /var/log/sqlite4

[Install]
WantedBy=multi-user.target
EOF

# Create sqlite4 user
if ! id sqlite4 &>/dev/null; then
    useradd -r -s /sbin/nologin -M -d /nonexistent sqlite4 2>/dev/null || true
fi

chown -R sqlite4:sqlite4 "$DATA_DIR" "$LOG_DIR"
systemctl daemon-reload

# ============================================
# 8. ENCRYPTION UTILITIES
# ============================================
log_info "Creating encryption utilities..."

# Key rotation script
cat > /usr/local/bin/sqlite4-keygen.sh << 'EOF'
#!/bin/bash
# Generate new encryption key

KEY_FILE="${1:-/etc/sqlite4/keys/master.key}"
openssl rand -base64 32 > "$KEY_FILE"
chmod 600 "$KEY_FILE"
echo "New key generated: $KEY_FILE"
EOF
chmod +x /usr/local/bin/sqlite4-keygen.sh

# Re-encryption script
cat > /usr/local/bin/sqlite4-reencrypt.sh << 'EOF'
#!/bin/bash
# Re-encrypt database with new key

DB_FILE="$1"
OLD_KEY="$2"
NEW_KEY="$3"

if [ -z "$DB_FILE" ] || [ -z "$OLD_KEY" ] || [ -z "$NEW_KEY" ]; then
    echo "Usage: $0 <dbfile> <old_key> <new_key>"
    exit 1
fi

echo "Re-encrypting $DB_FILE..."
sqlite4 "$DB_FILE" ".rekey $NEW_KEY"
echo "Done"
EOF
chmod +x /usr/local/bin/sqlite4-reencrypt.sh

# ============================================
# 9. BACKUP SCRIPT
# ============================================
log_info "Creating backup script..."

cat > /usr/local/bin/sqlite4-backup.sh << 'EOF'
#!/bin/bash
# Encrypted backup script

BACKUP_DIR="/var/backups/sqlite4"
DATE=$(date +%Y%m%d_%H%M%S)
KEY_FILE="/etc/sqlite4/keys/master.key"

mkdir -p "$BACKUP_DIR"

for db in /var/lib/sqlite4/*.db; do
    [ -f "$db" ] || continue
    basename=$(basename "$db")
    echo "Backing up $basename..."
    
    # Encrypted backup
    tar -czf - -C "$(dirname "$db")" "$basename" | \
        openssl enc -aes-256-cbc -salt -pbkdf2 -pass file:"$KEY_FILE" \
        > "$BACKUP_DIR/${basename%.db}_$DATE.tar.gz.enc"
done

# Keep only last 7 backups
find "$BACKUP_DIR" -name "*.tar.gz.enc" -mtime +7 -delete

echo "Backup complete"
EOF
chmod +x /usr/local/bin/sqlite4-backup.sh

# ============================================
# 10. MONITORING
# ============================================
log_info "Setting up monitoring..."

cat > /usr/local/bin/sqlite4-monitor.sh << 'EOF'
#!/bin/bash
# Security monitoring

LOGFILE="/var/log/sqlite4/monitor.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# Check failed logins
FAILED=$(grep -c "AUTH_FAILURE" /var/log/sqlite4/access.log 2>/dev/null || echo 0)

# Check rate limits
RATE_LIMITED=$(grep -c "RATE_LIMITED" /var/log/sqlite4/access.log 2>/dev/null || echo 0)

# Check connections
CONNECTIONS=$(ss -tn | grep ":4444" | wc -l)

# Log status
echo "[$DATE] Failed: $FAILED | RateLimited: $RATE_LIMITED | Conn: $CONNECTIONS" >> $LOGFILE
EOF
chmod +x /usr/local/bin/sqlite4-monitor.sh

# Schedule monitoring every 5 minutes
echo "*/5 * * * * /usr/local/bin/sqlite4-monitor.sh" > /etc/cron.d/sqlite4-monitor

# ============================================
# COMPLETION
# ============================================
log_info "Security configuration complete!"
echo ""
echo "=========================================="
echo "  SQLite-4.0 Security Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Add users: sqlite4-useradd"
echo "  2. Configure IP allowlist in $SQLITE4_DIR/config.json"
echo "  3. Enable firewall: /usr/local/bin/sqlite4-firewall.sh"
echo "  4. Start service: systemctl start sqlite4"
echo "  5. Access admin panel: https://localhost:8443"
echo ""
