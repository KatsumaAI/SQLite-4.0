#!/usr/bin/env osascript

-- SQLite-4.0 Status Bar Menu (AppleScript Alternative)
-- Works without Xcode - uses native macOS features

property serverRunning : false
property serverPort : 4444

on run
    -- Create menu bar item using terminal-notifier style
    display notification "SQLite-4.0 Status Bar is running" with title "SQLite-4.0"
end run

-- Handler to check server status
on checkServerStatus()
    try
        do shell script "pgrep -f 'sqlite4-server' > /dev/null 2>&1"
        set serverRunning to true
    on error
        set serverRunning to false
    end try
end checkServerStatus

-- Start server
on startServer()
    checkServerStatus()
    if serverRunning then
        display notification "Server is already running" with title "SQLite-4.0"
        return
    end if
    
    try
        -- Create data directory
        do shell script "mkdir -p ~/Library/Application\\ Support/SQLite4"
        
        -- Start server in background
        do shell script "cd ~/Library/Application\\ Support/SQLite4 && nohup sqlite4-server --port 4444 > ~/Library/Logs/SQLite4.log 2>&1 &"
        
        -- Wait a moment
        delay 2
        
        -- Check if started
        checkServerStatus()
        if serverRunning then
            display notification "SQLite-4.0 server started on port 4444" with title "SQLite-4.0"
        else
            display notification "Failed to start server" with title "SQLite-4.0" sound name "Basso"
        end if
    on error errMsg
        display notification "Error: " & errMsg with title "SQLite-4.0" sound name "Basso"
    end try
end startServer

-- Stop server
on stopServer()
    checkServerStatus()
    if not serverRunning then
        display notification "Server is not running" with title "SQLite-4.0"
        return
    end if
    
    try
        do shell script "pkill -f sqlite4-server"
        
        delay 1
        checkServerStatus()
        
        if not serverRunning then
            display notification "SQLite-4.0 server stopped" with title "SQLite-4.0"
        else
            display notification "Failed to stop server" with title "SQLite-4.0" sound name "Basso"
        end if
    on error errMsg
        display notification "Error: " & errMsg with title "SQLite-4.0" sound name "Basso"
    end try
end stopServer

-- Restart server
on restartServer()
    stopServer()
    delay 1
    startServer()
end restartServer

-- Open admin panel
on openAdmin()
    try
        open location "http://localhost:8443"
    on error errMsg
        display notification "Error: " & errMsg with title "SQLite-4.0 Admin" sound name "Basso"
    end try
end openAdmin

-- Create backup
on createBackup()
    try
        set backupPath to "~/Library/Application Support/SQLite4/backup_" & (do shell script "date +%Y%m%d_%H%M%S") & ".sqlite4bak"
        
        do shell script "sqlite4-backup --encrypt --compress " & backupPath
        
        display notification "Backup created at " & backupPath with title "SQLite-4.0"
    on error errMsg
        display notification "Backup failed: " & errMsg with title "SQLite-4.0" sound name "Basso"
    end try
end createBackup

-- Show status
on showStatus()
    checkServerStatus()
    
    if serverRunning then
        set statusText to "Running on port " & serverPort
    else
        set statusText to "Stopped"
    end if
    
    set connCount to do shell script "lsof -i :" & serverPort & " 2>/dev/null | wc -l"
    set dbSize to do shell script "du -sh ~/Library/Application\\ Support/SQLite4/*.db 2>/dev/null | cut -f1 || echo '0 KB'"
    
    display dialog "SQLite-4.0 Status" & return & return & _
        "Server: " & statusText & return & _
        "Connections: " & connCount & return & _
        "Database Size: " & dbSize buttons {"OK"} default button "OK"
end showStatus
