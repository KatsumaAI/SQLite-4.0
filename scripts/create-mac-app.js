#!/usr/bin/env node

/**
 * SQLite-4.0 macOS Menu Bar App Launcher
 * 
 * Creates a macOS menu bar application that integrates with SQLite-4.0
 * and appears in System Preferences.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_DIR = __dirname;
const MACOS_DIR = path.join(PROJECT_DIR, 'macos');

// Swift menu bar app source code
const MENU_BAR_APP = `//
//  SQLite4MenuBarApp.swift
//  SQLite4StatusBar
//
//  Menu bar app for SQLite-4.0 database management
//

import SwiftUI
import SystemExtensions
import Foundation

class SQLite4Server: ObservableObject {
    @Published var isRunning = false
    @Published var status = "Stopped"
    @Published var port = 4444
    @Published var connections = 0
    @Published var databaseSize = "0 KB"
    @Published var lastBackup: String?
    
    private var process: Process?
    private var timer: Timer?
    
    init() {
        checkStatus()
    }
    
    func checkStatus() {
        // Check if server process is running
        let task = Process()
        task.launchPath = "/usr/bin/pgrep"
        task.arguments = ["-f", "sqlite4-server"]
        
        let pipe = Pipe()
        task.standardOutput = pipe
        task.launch()
        task.waitUntilExit()
        
        isRunning = task.terminationStatus == 0
        
        if isRunning {
            status = "Running"
            port = 4444
            updateStats()
            startTimer()
        } else {
            status = "Stopped"
        }
    }
    
    func updateStats() {
        // Get connection count
        let task = Process()
        task.launchPath = "/bin/bash"
        task.arguments = ["-c", "lsof -i :4444 2>/dev/null | wc -l"]
        
        let pipe = Pipe()
        task.standardOutput = pipe
        task.launch()
        task.waitUntilExit()
        
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        if let count = Int(String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines()) ?? "0") {
            connections = count - 1 // Subtract header
        }
        
        // Get database size
        let sizeTask = Process()
        sizeTask.launchPath = "/bin/bash"
        sizeTask.arguments = ["-c", "du -sh ~/Library/Application\\ Support/SQLite4/*.db 2>/dev/null | cut -f1 || echo '0 KB'"]
        
        let sizePipe = Pipe()
        sizeTask.standardOutput = sizePipe
        sizeTask.launch()
        sizeTask.waitUntilExit()
        
        let sizeData = sizePipe.fileHandleForReading.readDataToEndOfFile()
        databaseSize = String(data: sizeData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines()) ?? "0 KB"
    }
    
    func startServer() {
        guard !isRunning else { return }
        
        // Start SQLite-4.0 server
        let task = Process()
        task.launchPath = "/bin/bash"
        task.arguments = [
            "-c",
            "cd ~ && mkdir -p Library/Application\\ Support/SQLite4 && nohup sqlite4-server --port 4444 > ~/Library/Logs/SQLite4.log 2>&1 &"
        ]
        
        task.launch()
        task.waitUntilExit()
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            self.checkStatus()
        }
    }
    
    func stopServer() {
        guard isRunning else { return }
        
        let task = Process()
        task.launchPath = "/bin/bash"
        task.arguments = ["-c", "pkill -f sqlite4-server"]
        
        task.launch()
        task.waitUntilExit()
        
        DispatchQueue.main.async {
            self.isRunning = false
            self.status = "Stopped"
            self.stopTimer()
        }
    }
    
    func restartServer() {
        stopServer()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            self.startServer()
        }
    }
    
    func openAdmin() {
        let task = Process()
        task.launchPath = "/usr/bin/open"
        task.arguments = ["http://localhost:8443"]
        task.launch()
    }
    
    func backupDatabase() {
        let task = Process()
        task.launchPath = "/bin/bash"
        task.arguments = [
            "-c",
            "sqlite4-backup --encrypt --compress ~/Library/Application\\ Support/SQLite4/backup_$(date +%Y%m%d_%H%M%S).sqlite4"
        ]
        
        task.launch()
        
        let pipe = Pipe()
        task.standardOutput = pipe
        task.waitUntilExit()
        
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        lastBackup = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines())
    }
    
    private func startTimer() {
        stopTimer()
        timer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            self?.updateStats()
        }
    }
    
    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }
}

// Menu Bar App
class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var popover: NSPopover!
    private var server: SQLite4Server!
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        server = SQLite4Server()
        
        // Create status bar item
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "cylinder.split.3d.vertical.fill", accessibilityDescription: "SQLite-4.0")
            button.action = #selector(togglePopover(_:))
        }
        
        // Create popover content
        let contentView = ContentView(server: server)
        let hostingController = NSHostingController(rootView: contentView)
        
        popover = NSPopover()
        popover.contentViewController = hostingController
        popover.behavior = .transient
    }
    
    @objc func togglePopover(_ sender: AnyObject?) {
        if let button = statusItem.button {
            if popover.isShown {
                popover.perform(#selector(NSPopover.performClose(_:)), with: sender)
            } else {
                popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            }
        }
    }
}

struct ContentView: View {
    @ObservedObject var server: SQLite4Server
    
    var body: some View {
        VStack(spacing: 16) {
            // Header
            HStack {
                Image(systemName: "cylinder.split.3d.vertical.fill")
                    .font(.system(size: 32))
                    .foregroundColor(.accentColor)
                
                VStack(alignment: .leading) {
                    Text("SQLite-4.0")
                        .font(.headline)
                    Text(server.status)
                        .font(.caption)
                        .foregroundColor(server.isRunning ? .green : .secondary)
                }
                
                Spacer()
            }
            
            Divider()
            
            // Status Grid
            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible())
            ], spacing: 12) {
                StatusItem(title: "Port", value: "\\(server.port)")
                StatusItem(title: "Connections", value: "\\(server.connections)")
                StatusItem(title: "Database", value: server.databaseSize)
                StatusItem(title: "Last Backup", value: server.lastBackup ?? "Never")
            }
            
            Divider()
            
            // Actions
            VStack(spacing: 8) {
                if server.isRunning {
                    Button(action: { server.stopServer() }) {
                        Label("Stop Server", systemImage: "stop.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    
                    Button(action: { server.restartServer() }) {
                        Label("Restart Server", systemImage: "arrow.clockwise")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                } else {
                    Button(action: { server.startServer() }) {
                        Label("Start Server", systemImage: "play.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                }
                
                Button(action: { server.openAdmin() }) {
                    Label("Open Admin Panel", systemImage: "safari")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                
                Button(action: { server.backupDatabase() }) {
                    Label("Create Backup", systemImage: "externaldrive")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            
            Spacer().frame(height: 8)
        }
        .padding()
        .frame(width: 280)
    }
}

struct StatusItem: View {
    let title: String
    let value: String
    
    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.headline)
                .foregroundColor(.primary)
            Text(title)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding(8)
        .background(Color.secondary.opacity(0.1))
        .cornerRadius(8)
    }
}

@main
struct SQLite4StatusBarApp: App {
    var body: some Scene {
        WindowGroup {
            EmptyView()
        }
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("About SQLite-4.0") {
                    NSApplication.shared.orderFrontStandardAboutPanel()
                }
            }
        }
    }
}
`;

// Property List for Info.plist
const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIconFile</key>
    <string></string>
    <key>CFBundleIdentifier</key>
    <string>ai.sqlite4.statusbar</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>SQLite-4.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSBackgroundOnly</key>
    <true/>
    <key>LSMenuBarExtra</key>
    <string>$(PRODUCT_NAME).app</string>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
</dict>
</plist>
`;

// Package.swift for building
const PACKAGE_SWIFT = `
// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "SQLite4StatusBar",
    platforms: [
        .macOS(.v11)
    ],
    products: [
        .executable(
            name: "SQLite4StatusBar",
            targets: ["SQLite4StatusBar"]
        )
    ],
    targets: [
        .executableTarget(
            name: "SQLite4StatusBar",
            dependencies: []
        )
    ]
)
`;

// Install script
const INSTALL_SCRIPT = `#!/bin/bash

# SQLite-4.0 Menu Bar App Installer
# This script builds and installs the SQLite-4.0 menu bar app

set -e

echo "SQLite-4.0 Menu Bar App Installer"
echo "================================"

# Check for Xcode
if ! command -v xcodebuild &> /dev/null; then
    echo "Error: Xcode is required to build this app"
    echo "Install from: https://developer.apple.com/xcode/"
    exit 1
fi

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_DIR="$SCRIPT_DIR/SQLite4StatusBar.app"

echo ""
echo "Building SQLite-4.0 Status Bar App..."

# Build the app
xcodebuild -project "$SCRIPT_DIR/Package.swift" \
    -scheme SQLite4StatusBar \
    -configuration Release \
    -destination "platform=macOS" \
    build

echo ""
echo "Built successfully!"
echo ""

# Install to Applications
echo "Installing to /Applications..."
if [ -d "/Applications/SQLite4StatusBar.app" ]; then
    rm -rf "/Applications/SQLite4StatusBar.app"
fi
cp -R "$APP_DIR" "/Applications/"

echo ""
echo "Installed to /Applications/SQLite4StatusBar.app"
echo ""
echo "Open SQLite-4.0 from your menu bar!"
echo ""

# Launch at login (optional)
read -p "Launch at login? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    mkdir -p ~/Library/LaunchAgents
    cat > ~/Library/LaunchAgents/ai.sqlite4.statusbar.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.sqlite4.statusbar</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Applications/SQLite4StatusBar.app/Contents/MacOS/SQLite4StatusBar</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
EOF
    launchctl load ~/Library/LaunchAgents/ai.sqlite4.statusbar.plist
    echo "Added to login items"
fi
`;

async function main() {
    console.log('Creating SQLite-4.0 macOS Menu Bar App...\n');
    
    // Create directory structure
    fs.mkdirSync(MACOS_DIR, { recursive: true });
    
    // Write Swift source
    fs.writeFileSync(
        path.join(MACOS_DIR, 'SQLite4StatusBar.swift'),
        MENU_BAR_APP
    );
    
    // Write Package.swift
    fs.writeFileSync(
        path.join(MACOS_DIR, 'Package.swift'),
        PACKAGE_SWIFT
    );
    
    // Write Info.plist
    fs.writeFileSync(
        path.join(MACOS_DIR, 'Info.plist'),
        INFO_PLIST
    );
    
    // Write install script
    fs.writeFileSync(
        path.join(MACOS_DIR, 'install-mac-app.sh'),
        INSTALL_SCRIPT
    );
    
    // Make install script executable
    fs.chmodSync(path.join(MACOS_DIR, 'install-mac-app.sh'), 0o755);
    
    console.log('Created macOS app files:');
    console.log('');
    console.log('  macos/SQLite4StatusBar.swift  - Main Swift app');
    console.log('  macos/Package.swift         - Swift package config');
    console.log('  macos/Info.plist           - App metadata');
    console.log('  macos/install-mac-app.sh    - Installation script');
    console.log('');
    console.log('To install:');
    console.log('  cd macos');
    console.log('  ./install-mac-app.sh');
    console.log('');
    console.log('Or build manually:');
    console.log('  xcodebuild -project Package.swift -scheme SQLite4StatusBar build');
    console.log('');
    console.log('The app provides:');
    console.log('  - Menu bar status icon');
    console.log('  - Start/stop database server');
    console.log('  - Connection count');
    console.log('  - Database size');
    console.log('  - Backup creation');
    console.log('  - Admin panel launch');
    console.log('  - Auto-launch at login option');
}

main().catch(console.error);
