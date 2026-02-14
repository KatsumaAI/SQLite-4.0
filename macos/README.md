# SQLite-4.0 macOS Integration

SQLite-4.0 provides seamless integration with macOS, including menu bar access, System Preferences, and native app support.

## Installation

### Option 1: Menu Bar Manager (No Xcode Required)

```bash
# Make executable
chmod +x macos/sqlite4-mgr

# Install to PATH
sudo cp macos/sqlite4-mgr /usr/local/bin/

# Or use from project directory
./macos/sqlite4-mgr status
```

### Option 2: Full Menu Bar App (Requires Xcode)

```bash
# Build and install
cd macos
./install-mac-app.sh

# This builds a native macOS menu bar app
# Installed to /Applications/SQLite4StatusBar.app
# Optionally adds to login items
```

## Menu Bar Manager Commands

```bash
sqlite4-mgr start       # Start database server
sqlite4-mgr stop        # Stop database server
sqlite4-mgr restart     # Restart server
sqlite4-mgr status      # Show status
sqlite4-mgr admin       # Open admin panel
sqlite4-mgr backup      # Create backup
sqlite4-mgr logs         # Follow logs
sqlite4-mgr menu-bar    # Install menu bar helper
```

## Menu Bar App Features

The native macOS menu bar app provides:

- **Status Icon** - Shows database status in menu bar
- **Quick Actions** - Start/stop server from menu
- **Statistics** - Connection count, database size
- **Admin Panel** - One-click access to web admin
- **Backup** - Create encrypted backups
- **Auto-Launch** - Starts at login option

## System Preferences Integration

### Installing to System Preferences

1. **Option A: Alfred Workflow**
```bash
# Create Alfred workflow that launches admin panel
open "http://localhost:8443"
```

2. **Option B: Spotlight Favorite**
```bash
# Pin admin panel URL to Spotlight
# Open System Preferences > Keyboard > Shortcuts > Spotlight
```

3. **Option C: Dock Quick Launch**
```bash
# Create dock tile
osascript -e 'tell application "Safari" to make new document with properties {URL:"http://localhost:8443"}'
```

## Launch at Login

### Using Terminal
```bash
# Add to login items
sqlite4-mgr menu-bar

# Or manually
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/ai.sqlite4.launcher.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.sqlite4.launcher</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/sqlite4-mgr</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/ai.sqlite4.launcher.plist
```

### Using System Preferences
1. System Preferences → Users & Groups → Login Items
2. Click "+" and select `sqlite4-mgr`
3. Check "Hide" to run silently

## Automator Quick Action

Create a Quick Action to open admin panel:

1. Open **Automator**
2. New Document → Quick Action
3. Add "Run Shell Script" action:
```bash
open "http://localhost:8443"
```
4. Save as "Open SQLite-4.0 Admin"
5. Assign keyboard shortcut in System Preferences

## Spotlight Integration

Search for "SQLite-4.0" in Spotlight:

1. System Preferences → Siri & Spotlight → Spotlight Privacy
2. Add your home folder
3. SQLite-4.0 files will be indexed

## Notification Center Widget

Create a Today widget for status:

1. Automator → New Document → Today View
2. Add "Run Shell Script":
```bash
pgrep -f "sqlite4-server" > /dev/null && echo "Running" || echo "Stopped"
```
3. Save as "SQLite-4.0 Status"

## AppleScript Examples

### Quick Status Check
```applescript
tell application "Terminal"
    do script "sqlite4-mgr status"
end tell
```

### Server Control
```applescript
set action to choose from list {"Start", "Stop", "Restart", "Status"} with prompt "SQLite-4.0 Action"
if action is "Start" then
    do shell script "/usr/local/bin/sqlite4-mgr start"
else if action is "Stop" then
    do shell script "/usr/local/bin/sqlite4-mgr stop"
-- etc...
end if
```

### Hotkey with Alfred
```bash
# In Alfred, create workflow with Hotkey trigger
# Action: Run Script
sqlite4-mgr status
```

## File Locations

| Item | Location |
|------|----------|
| Database | `~/Library/Application Support/SQLite4/` |
| Logs | `~/Library/Logs/SQLite4.log` |
| Config | `~/.sqlite4rc` |
| Backup | `~/Library/Application Support/SQLite4/*.sqlite4bak` |

## Troubleshooting

### Server won't start
```bash
# Check if port in use
lsof -i :4444

# Check logs
sqlite4-mgr logs

# Kill any existing processes
pkill -f sqlite4-server
sqlite4-mgr start
```

### Can't access admin panel
```bash
# Verify server running
sqlite4-mgr status

# Open in browser
open "http://localhost:8443"
```

### Menu bar icon not showing
```bash
# Check if menu bar app is running
ps aux | grep -i sqlite4

# Restart
pkill -f SQLite4StatusBar
open "/Applications/SQLite4StatusBar.app"
```

## Security Notes

- Database files are stored in `~/Library/Application Support/`
- Logs are in `~/Library/Logs/`
- Use encryption key for production
- Consider file permissions:
```bash
chmod 600 ~/Library/Application\ Support/SQLite4/*.db
```
