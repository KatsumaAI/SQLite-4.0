#!/usr/bin/env node

/**
 * SQLite-4.0 Server
 * Network database server with TLS encryption and access control
 */

const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SQLite4 = require('./sqlite4');

class SQLite4Server {
    constructor(options = {}) {
        this.port = options.port || 4444;
        this.host = options.host || '127.0.0.1';
        this.tls = options.tls || false;
        this.cert = options.cert || null;
        this.key = options.key || null;
        this.encryption = options.encryption || 'aes-256-gcm';
        this.keyFile = options.keyFile || null;
        this.authRequired = options.authRequired || false;
        this.ipAllowlist = options.ipAllowlist || [];
        this.rateLimit = options.rateLimit || 100;
        this.datadir = options.datadir || './data';
        
        this.databases = new Map();
        this.connections = new Map();
        this.rateLimits = new Map();
        
        // Ensure data directory exists
        if (!fs.existsSync(this.datadir)) {
            fs.mkdirSync(this.datadir, { recursive: true });
        }
    }
    
    // Rate limiting
    checkRateLimit(ip) {
        const now = Date.now();
        const windowMs = 60000; // 1 minute
        const limit = this.rateLimit;
        
        if (!this.rateLimits.has(ip)) {
            this.rateLimits.set(ip, { count: 1, reset: now + windowMs });
            return true;
        }
        
        const record = this.rateLimits.get(ip);
        
        if (now > record.reset) {
            record.count = 1;
            record.reset = now + windowMs;
            return true;
        }
        
        if (record.count >= limit) {
            return false;
        }
        
        record.count++;
        return true;
    }
    
    // IP allowlist check
    checkAllowlist(ip) {
        if (this.ipAllowlist.length === 0) return true;
        return this.ipAllowlist.some(allowed => {
            if (allowed.includes('/')) {
                // CIDR notation - simple check
                return ip.startsWith(allowed.split('/')[0].split('.').slice(0, 2).join('.'));
            }
            return ip === allowed;
        });
    }
    
    // Get or create database
    getDatabase(name, key = null) {
        if (!this.databases.has(name)) {
            const dbPath = path.join(this.datadir, `${name}.db`);
            const db = new SQLite4({
                dbPath,
                key: key || this.keyFile ? this._loadKey(name) : null,
                encryption: this.encryption
            });
            this.databases.set(name, db);
        }
        return this.databases.get(name);
    }
    
    _loadKey(dbName) {
        if (!this.keyFile) return null;
        
        try {
            const keys = JSON.parse(fs.readFileSync(this.keyFile, 'utf8'));
            return keys[dbName] || keys._default || null;
        } catch (e) {
            return null;
        }
    }
    
    // Handle client connection
    handleConnection(socket) {
        const ip = socket.remoteAddress.replace('::ffff:', '');
        const connId = crypto.randomUUID();
        
        console.log(`[${new Date().toISOString()}] New connection from ${ip} (${connId})`);
        
        // Rate limit check
        if (!this.checkRateLimit(ip)) {
            console.log(`[RATE LIMIT] ${ip} blocked`);
            socket.write(JSON.stringify({ error: 'Rate limit exceeded' }) + '\n');
            socket.destroy();
            return;
        }
        
        // IP allowlist check
        if (!this.checkAllowlist(ip)) {
            console.log(`[ALLOWLIST] ${ip} blocked`);
            socket.write(JSON.stringify({ error: 'IP not allowed' }) + '\n');
            socket.destroy();
            return;
        }
        
        this.connections.set(connId, {
            socket,
            ip,
            authenticated: false,
            user: null,
            database: null,
            connectedAt: new Date()
        });
        
        let buffer = '';
        
        socket.on('data', (data) => {
            buffer += data.toString();
            
            // Handle multiple commands separated by newlines
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer
            
            for (const line of lines) {
                if (line.trim()) {
                    this.handleCommand(connId, line.trim());
                }
            }
        });
        
        socket.on('close', () => {
            console.log(`[${new Date().toISOString()}] Connection closed (${connId})`);
            this.connections.delete(connId);
        });
        
        socket.on('error', (err) => {
            console.error(`[ERROR] ${ip}: ${err.message}`);
            this.connections.delete(connId);
        });
    }
    
    handleCommand(connId, line) {
        const conn = this.connections.get(connId);
        if (!conn) return;
        
        try {
            const cmd = JSON.parse(line);
            const startTime = Date.now();
            
            let result;
            
            switch (cmd.type) {
                case 'auth':
                    result = this.handleAuth(connId, cmd);
                    break;
                    
                case 'query':
                    result = this.handleQuery(connId, cmd);
                    break;
                    
                case 'execute':
                    result = this.handleExecute(connId, cmd);
                    break;
                    
                case 'tables':
                    result = this.handleTables(connId);
                    break;
                    
                case 'schema':
                    result = this.handleSchema(connId, cmd);
                    break;
                    
                case 'create_db':
                    result = this.handleCreateDB(connId, cmd);
                    break;
                    
                case 'user_add':
                    result = this.handleUserAdd(connId, cmd);
                    break;
                    
                case 'ping':
                    result = { success: true, pong: true };
                    break;
                    
                default:
                    result = { error: 'Unknown command type' };
            }
            
            result.executionTime = Date.now() - startTime;
            
            conn.socket.write(JSON.stringify(result) + '\n');
            
            // Log access
            if (cmd.type !== 'ping') {
                console.log(`[${conn.ip}] ${cmd.type} - ${result.error || 'OK'} (${result.executionTime}ms)`);
            }
            
        } catch (e) {
            conn.socket.write(JSON.stringify({ 
                error: 'Invalid command format',
                details: e.message 
            }) + '\n');
        }
    }
    
    handleAuth(connId, cmd) {
        const conn = this.connections.get(connId);
        
        if (!cmd.database) {
            return { error: 'Database name required' };
        }
        
        const db = this.getDatabase(cmd.database, cmd.key);
        
        if (this.authRequired) {
            if (!cmd.username || !cmd.password) {
                return { error: 'Authentication required' };
            }
            
            const user = db.authenticate(cmd.username, cmd.password);
            if (!user) {
                return { error: 'Invalid credentials' };
            }
            
            conn.authenticated = true;
            conn.user = user;
            conn.database = cmd.database;
            
            return { 
                success: true, 
                user: user.username,
                role: user.role
            };
        }
        
        conn.authenticated = true;
        conn.database = cmd.database;
        
        return { success: true, authenticated: false };
    }
    
    handleQuery(connId, cmd) {
        const conn = this.connections.get(connId);
        
        if (!conn.database) {
            return { error: 'No database selected' };
        }
        
        const db = this.getDatabase(conn.database);
        
        try {
            const result = db.execute(cmd.sql, cmd.params || [], conn.user);
            return result;
        } catch (e) {
            return { error: e.message };
        }
    }
    
    handleExecute(connId, cmd) {
        return this.handleQuery(connId, cmd);
    }
    
    handleTables(connId) {
        const conn = this.connections.get(connId);
        
        if (!conn.database) {
            return { error: 'No database selected' };
        }
        
        const db = this.getDatabase(conn.database);
        return { tables: db.getTables() };
    }
    
    handleSchema(connId, cmd) {
        const conn = this.connections.get(connId);
        
        if (!conn.database) {
            return { error: 'No database selected' };
        }
        
        const db = this.getDatabase(conn.database);
        const schema = db.getSchema(cmd.table);
        
        if (!schema) {
            return { error: 'Table not found' };
        }
        
        return { schema };
    }
    
    handleCreateDB(connId, cmd) {
        const conn = this.connections.get(connId);
        
        if (!conn.user || conn.user.role !== 'admin') {
            return { error: 'Admin access required' };
        }
        
        const db = this.getDatabase(cmd.name, cmd.key);
        return { success: true, database: cmd.name };
    }
    
    handleUserAdd(connId, cmd) {
        const conn = this.connections.get(connId);
        
        if (!conn.database) {
            return { error: 'No database selected' };
        }
        
        if (!conn.user || conn.user.role !== 'admin') {
            return { error: 'Admin access required' };
        }
        
        const db = this.getDatabase(conn.database);
        db.addUser(cmd.username, cmd.password, cmd.role || 'readonly');
        
        return { success: true, user: cmd.username };
    }
    
    start() {
        const server = this.tls ? 
            tls.createServer({ cert: this.cert, key: this.key }) :
            net.createServer();
        
        server.on('connection', (socket) => this.handleConnection(socket));
        
        server.listen(this.port, this.host, () => {
            const protocol = this.tls ? 'TLS' : 'TCP';
            console.log(`[${new Date().toISOString()}] SQLite-4.0 Server started on ${this.host}:${this.port} (${protocol})`);
            console.log(`[${new Date().toISOString()}] Auth required: ${this.authRequired}`);
            console.log(`[${new Date().toISOString()}] Encryption: ${this.encryption}`);
            if (this.ipAllowlist.length > 0) {
                console.log(`[${new Date().toISOString()}] IP Allowlist: ${this.ipAllowlist.join(', ')}`);
            }
        });
        
        return server;
    }
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {
        port: 4444,
        host: '127.0.0.1',
        tls: false,
        authRequired: false,
        ipAllowlist: [],
        rateLimit: 100,
        datadir: './data'
    };
    
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--port':
            case '-p':
                options.port = parseInt(args[++i]);
                break;
            case '--host':
            case '-h':
                options.host = args[++i];
                break;
            case '--tls':
                options.tls = true;
                break;
            case '--cert':
                options.cert = fs.readFileSync(args[++i]);
                break;
            case '--key':
                options.key = fs.readFileSync(args[++i]);
                break;
            case '--auth':
                options.authRequired = true;
                break;
            case '--allowlist':
                options.ipAllowlist = args[++i].split(',');
                break;
            case '--ratelimit':
                options.rateLimit = parseInt(args[++i]);
                break;
            case '--datadir':
                options.datadir = args[++i];
                break;
        }
    }
    
    const server = new SQLite4Server(options);
    server.start();
}

module.exports = SQLite4Server;
