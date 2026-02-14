# SQLite-4.0

**Secure Embedded Database for Modern Applications**

A secure embedded SQL database with enterprise features: AES-256-GCM encryption, Auth0 OAuth, 2FA, replication, and zero dependencies.

## Features

- Encryption - AES-256-GCM encryption at rest
- Auth0 Integration - Discord, Google, GitHub, Twitter, Microsoft OAuth
- Two-Factor Authentication - TOTP with backup codes
- Query Builder - Chainable TypeScript-ready API
- Schema Builder - Programmatic table creation
- Replication - Master-slave with real-time sync
- Full-Text Search - Built-in FTS with stemming
- Connection Pooling - Efficient resource management
- Metrics - Prometheus-compatible monitoring
- Zero Dependencies - Pure JavaScript implementation

## Installation

```bash
npm install sqlite4
```

## Quick Start

```javascript
const SQLite4 = require('sqlite4');

// Create encrypted database
const db = new SQLite4({
    dbPath: './data/app.db',
    key: process.env.DB_KEY
});

// Execute queries
await db.execute(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`);
await db.execute(`INSERT INTO users (name) VALUES ('Alice')`);
const result = await db.execute(`SELECT * FROM users`);
console.log(result.rows);
```

## Query Builder

```javascript
const users = await db
    .select('name', 'email')
    .from('users')
    .where('status', 'active')
    .orderBy('created_at', 'DESC')
    .limit(10)
    .all();
```

## Schema Builder

```javascript
db.schema.create('posts', (table) => {
    table.increments('id');
    table.string('title', 255);
    table.text('content');
    table.timestamp('created_at');
});
```

## Auth0 Integration

```javascript
const db = new SQLite4({
    auth0: {
        domain: 'your.auth0.com',
        clientId: 'your-client-id',
        providers: ['discord', 'google', 'github']
    }
});

// Get OAuth URL
const auth = db.auth;
const { url } = auth.getAuthorizationUrl('discord', {
    scope: 'identify email'
});
```

## Two-Factor Authentication

```javascript
// Enable 2FA
const result = await db.security.enable2FA('user@email.com', {
    issuer: 'SQLite-4.0',
    digits: 8
});

console.log('Secret:', result.secret);
console.log('QR URI:', result.uri);
console.log('Backup Codes:', result.backupCodes);

// Verify 2FA code
const verified = await db.security.verify2FA('user@email.com', '12345678');
```

## Remote Hosting

```bash
# Start server
npm run server -- --port 4444

# Expose with ngrok
ngrok tcp 4444
```

## CLI Tools

```bash
npm run server   # Start server
npm run cli     # Interactive CLI
npm run admin   # Web admin panel
npm run backup  # Create backup
```

## Documentation

- [Getting Started](wiki/getting-started/introduction.md)
- [Core Concepts](wiki/core-concepts/architecture.md)
- [API Reference](api.html)
- [Examples](examples/)
- [FAQ](FAQ.md)

## License

MIT License
