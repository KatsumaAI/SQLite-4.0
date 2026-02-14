#!/usr/bin/env node

/**
 * SQLite-4.0 Web Admin Panel
 * Secure web-based database management
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

class SQLite4Admin {
    constructor(options = {
        port: 8443,
        host: '127.0.0.1',
        tls: false,
        cert: null,
        key: null,
        username: 'admin',
        password: 'admin'
    }) {
        this.port = options.port || 8443;
        this.host = options.host || '127.0.0.1';
        this.tls = options.tls || false;
        this.cert = options.cert;
        this.key = options.key;
        this.username = options.username;
        this.password = options.password;
        
        this.sessions = new Map();
        this.server = null;
    }
    
    // Simple session auth
    authenticate(req) {
        const cookie = req.headers.cookie || '';
        const sessionMatch = cookie.match(/session=([^;]+)/);
        
        if (!sessionMatch) return false;
        
        const session = this.sessions.get(sessionMatch[1]);
        return session && session.expires > Date.now();
    }
    
    login(res, username, password) {
        if (username === this.username && password === this.password) {
            const sessionId = Math.random().toString(36).slice(2);
            this.sessions.set(sessionId, {
                username,
                expires: Date.now() + 86400000 // 24 hours
            });
            
            res.setHeader('Set-Cookie', `session=${sessionId}; Path=/; HttpOnly; Max-Age=86400`);
            return true;
        }
        return false;
    }
    
    // HTML Templates
    getLoginPage() {
        return `<!DOCTYPE html>
<html>
<head>
    <title>SQLite-4.0 Admin - Login</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .login-container {
            background: #1a1a2e;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            width: 100%;
            max-width: 400px;
            border: 1px solid #2a2a4e;
        }
        .logo {
            text-align: center;
            margin-bottom: 30px;
        }
        .logo h1 {
            color: #00d4ff;
            font-size: 28px;
            font-weight: 700;
        }
        .logo p {
            color: #888;
            font-size: 12px;
            margin-top: 8px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            color: #aaa;
            font-size: 12px;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        input {
            width: 100%;
            padding: 14px 16px;
            background: #0f0f1e;
            border: 1px solid #2a2a4e;
            border-radius: 8px;
            color: #fff;
            font-size: 14px;
            transition: border-color 0.3s;
        }
        input:focus {
            outline: none;
            border-color: #00d4ff;
        }
        button {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
            border: none;
            border-radius: 8px;
            color: #000;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(0,212,255,0.3);
        }
        .error {
            background: rgba(255,68,68,0.2);
            border: 1px solid rgba(255,68,68,0.3);
            color: #ff4444;
            padding: 12px;
            border-radius: 8px;
            font-size: 13px;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">
            <h1>SQLite-4.0</h1>
            <p>Secure Database Administration</p>
        </div>
        <form method="POST" action="/login">
            <div class="form-group">
                <label>Username</label>
                <input type="text" name="username" required autocomplete="username">
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" name="password" required autocomplete="current-password">
            </div>
            <button type="submit">Sign In</button>
        </form>
    </div>
</body>
</html>`;
    }
    
    getDashboardPage(databases = [], stats = {}) {
        return `<!DOCTYPE html>
<html>
<head>
    <title>SQLite-4.0 Admin</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --bg-primary: #0a0a14;
            --bg-secondary: #12121f;
            --bg-tertiary: #1a1a2e;
            --border: #2a2a4e;
            --text: #e0e0e0;
            --text-muted: #888;
            --accent: #00d4ff;
            --accent-hover: #00a8cc;
            --danger: #ff4444;
            --success: #44ff88;
            --warning: #ffaa44;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: var(--bg-primary);
            color: var(--text);
            min-height: 100vh;
        }
        .header {
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            padding: 16px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .logo {
            font-size: 20px;
            font-weight: 700;
            color: var(--accent);
        }
        .nav {
            display: flex;
            gap: 24px;
        }
        .nav a {
            color: var(--text-muted);
            text-decoration: none;
            font-size: 14px;
            transition: color 0.3s;
        }
        .nav a:hover, .nav a.active {
            color: var(--accent);
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 24px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 32px;
        }
        .stat-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px;
        }
        .stat-value {
            font-size: 32px;
            font-weight: 700;
            color: var(--accent);
        }
        .stat-label {
            font-size: 12px;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 4px;
        }
        .card {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
        }
        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        .card-title {
            font-size: 16px;
            font-weight: 600;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid var(--border);
        }
        th {
            font-size: 11px;
            text-transform: uppercase;
            color: var(--text-muted);
            letter-spacing: 1px;
        }
        td {
            font-size: 14px;
        }
        .btn {
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            border: none;
            text-decoration: none;
            display: inline-block;
        }
        .btn-primary {
            background: var(--accent);
            color: #000;
        }
        .btn-danger {
            background: rgba(255,68,68,0.2);
            color: var(--danger);
        }
        .status-badge {
            padding: 4px 10px;
            border-radius: 100px;
            font-size: 11px;
            font-weight: 600;
        }
        .status-active {
            background: rgba(68,255,136,0.2);
            color: var(--success);
        }
        .status-inactive {
            background: rgba(136,136,136,0.2);
            color: var(--text-muted);
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">SQLite-4.0 Admin</div>
        <nav class="nav">
            <a href="/" class="active">Dashboard</a>
            <a href="/databases">Databases</a>
            <a href="/users">Users</a>
            <a href="/security">Security</a>
            <a href="/logs">Logs</a>
            <a href="/logout">Logout</a>
        </nav>
    </div>
    <div class="container">
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${databases.length}</div>
                <div class="stat-label">Databases</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.connections || 0}</div>
                <div class="stat-label">Active Connections</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.queriesToday || 0}</div>
                <div class="stat-label">Queries Today</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.blockedIPs || 0}</div>
                <div class="stat-label">Blocked IPs</div>
            </div>
        </div>
        
        <div class="card">
            <div class="card-header">
                <div class="card-title">Databases</div>
                <button class="btn btn-primary">+ New Database</button>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Size</th>
                        <th>Tables</th>
                        <th>Encrypted</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${databases.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No databases yet</td></tr>' : 
                    databases.map(db => `
                    <tr>
                        <td>${db.name}</td>
                        <td>${db.size || '0 KB'}</td>
                        <td>${db.tables || 0}</td>
                        <td>${db.encrypted ? 'Yes' : 'No'}</td>
                        <td><span class="status-badge ${db.active ? 'status-active' : 'status-inactive'}">${db.active ? 'Active' : 'Inactive'}</span></td>
                        <td>
                            <a href="/database/${db.name}" class="btn btn-primary">Manage</a>
                        </td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="card">
            <div class="card-header">
                <div class="card-title">Recent Queries</div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Database</th>
                        <th>Query</th>
                        <th>Duration</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td colspan="5" style="text-align:center;color:var(--text-muted)">No queries yet</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>`;
    }
    
    // HTTP Handler
    handleRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        
        // Login page
        if (pathname === '/login' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(this.getLoginPage());
            return;
        }
        
        // Login handler
        if (pathname === '/login' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const params = new URLSearchParams(body);
                const username = params.get('username');
                const password = params.get('password');
                
                if (this.login(res, username, password)) {
                    res.writeHead(302, { 'Location': '/' });
                    res.end();
                } else {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(this.getLoginPage().replace('<form method="POST" action="/login">', 
                        '<form method="POST" action="/login"><div class="error">Invalid credentials</div><form method="POST" action="/login">'));
                }
            });
            return;
        }
        
        // Logout
        if (pathname === '/logout') {
            res.writeHead(302, { 
                'Location': '/login',
                'Set-Cookie': 'session=; Path=/; HttpOnly; Max-Age=0'
            });
            res.end();
            return;
        }
        
        // API endpoints (no auth for demo)
        if (pathname === '/api/databases') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([
                { name: 'users', size: '128 KB', tables: 3, encrypted: true, active: true },
                { name: 'logs', size: '256 KB', tables: 1, encrypted: false, active: true },
                { name: 'cache', size: '64 KB', tables: 2, encrypted: true, active: false }
            ]));
            return;
        }
        
        if (pathname === '/api/stats') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                connections: 5,
                queriesToday: 1234,
                blockedIPs: 2
            }));
            return;
        }
        
        // Protected pages
        if (!this.authenticate(req)) {
            res.writeHead(302, { 'Location': '/login' });
            res.end();
            return;
        }
        
        // Dashboard
        if (pathname === '/' || pathname === '/index.html') {
            // Fetch stats from API
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(this.getDashboardPage([
                { name: 'users', size: '128 KB', tables: 3, encrypted: true, active: true },
                { name: 'logs', size: '256 KB', tables: 1, encrypted: false, active: true },
                { name: 'cache', size: '64 KB', tables: 2, encrypted: true, active: false }
            ], {
                connections: 5,
                queriesToday: 1234,
                blockedIPs: 2
            }));
            return;
        }
        
        // 404
        res.writeHead(404);
        res.end('Not Found');
    }
    
    start() {
        const handler = (req, res) => this.handleRequest(req, res);
        
        if (this.tls) {
            this.server = https.createServer({
                cert: this.cert,
                key: this.key
            }, handler);
        } else {
            this.server = http.createServer(handler);
        }
        
        this.server.listen(this.port, this.host, () => {
            const protocol = this.tls ? 'https' : 'http';
            console.log(`[${new Date().toISOString()}] SQLite-4.0 Admin Panel started on ${protocol}://${this.host}:${this.port}`);
        });
    }
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {
        port: 8443,
        host: '127.0.0.1',
        tls: false,
        username: 'admin',
        password: 'admin'
    };
    
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--port': case '-p':
                options.port = parseInt(args[++i]);
                break;
            case '--host': case '-h':
                options.host = args[++i];
                break;
            case '--tls':
                options.tls = true;
                break;
            case '--user':
                options.username = args[++i];
                break;
            case '--pass':
                options.password = args[++i];
                break;
        }
    }
    
    const admin = new SQLite4Admin(options);
    admin.start();
}

module.exports = SQLite4Admin;
