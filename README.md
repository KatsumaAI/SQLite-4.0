# SQLite-4.0

**Secure Embedded Database for Modern Applications**

<p align="center">
  <img src="logo.png" alt="SQLite-4.0 Logo" width="128" height="128">
</p>

A secure embedded SQL database with enterprise features: AES-256-GCM encryption, Auth0 OAuth, 2FA, replication, and zero dependencies.

## Features

- **Encryption** - AES-256-GCM encryption at rest
- **Auth0 Integration** - Discord, Google, GitHub, Twitter, Microsoft OAuth
- **Two-Factor Authentication** - TOTP with backup codes
- **Query Builder** - Chainable TypeScript-ready API
- **Schema Builder** - Programmatic table creation
- **Replication** - Master-slave with real-time sync
- **Full-Text Search** - Built-in FTS with stemming
- **Connection Pooling** - Efficient resource management
- **Metrics** - Prometheus-compatible monitoring
- **Zero Dependencies** - Pure JavaScript implementation

## Quick Start

```bash
npm install sqlite4
```

```javascript
const SQLite4 = require('sqlite4');

// Create encrypted database
const db = new SQLite4({
    dbPath: './data/app.db',
    key: process.env.DB_KEY,
    auth0: {
        domain: 'your.auth0.com',
        providers: ['discord', 'google', 'github']
    }
});

// Query builder
const users = await db
    .select('name', 'email')
    .from('users')
    .where('status', 'active')
    .orderBy('created_at', 'DESC')
    .limit(10)
    .all();

// Schema builder
db.schema.create('posts', (table) => {
    table.increments('id');
    table.string('title', 255);
    table.text('content');
    table.timestamp('created_at');
});
```

## Documentation

- [Getting Started](wiki/getting-started/introduction.md)
- [Core Concepts](wiki/core-concepts/architecture.md)
- [API Reference](api.html)
- [Examples](examples/)

## Examples

- [Basic Operations](examples/basic/basic-operations.js) - CRUD operations
- [Auth0 OAuth](examples/auth/auth0-oauth.js) - OAuth authentication
- [Two-Factor Auth](examples/auth/two-factor-auth.js) - 2FA setup
- [Replication](examples/replication/replication.js) - Master-slave setup
- [Remote Hosting](examples/admin/remote-hosting.js) - ngrok and custom URLs

## Remote Hosting

Expose your database with ngrok:

```bash
# Start server
npm run server -- --port 4444

# Expose publicly
ngrok tcp 4444
```

Connect from anywhere:

```javascript
const db = new SQLite4({
    host: '0.tcp.ngrok.io:12345',
    port: 12345,
    username: 'user',
    password: 'password'
});
```

## CLI Tools

```bash
npm run server   # Start database server
npm run cli     # Interactive CLI
npm run admin   # Web admin panel (port 8443)
npm run backup  # Create backup
```

## Docker

```bash
# Basic
docker compose up -d

# With TLS
docker compose -f docker-compose.tls.yml up -d

# High availability
docker compose -f docker-compose.ha.yml up -d
```

## License

MIT License - See [LICENSE](LICENSE) for details.

---

Built by Katsuma
