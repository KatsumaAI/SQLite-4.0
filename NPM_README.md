# SQLite-4.0

**Secure embedded SQL database with encryption, access control, and enterprise features.**

[![npm version](https://img.shields.io/npm/v/sqlite4.svg)](https://npmjs.com/package/sqlite4)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 14+](https://img.shields.io/badge/Node.js-14+-green.svg)](https://nodejs.org)

A lightweight, encrypted SQL database for modern Node.js applications. Zero dependencies, full encryption, and powerful APIs.

## Features

- **Encryption at Rest** - AES-256-GCM encryption protects all data
- **TLS Network Security** - Secure TCP/TLS connections for distributed deployments
- **Role-Based Access** - User authentication with admin, operator, readonly, and viewer roles
- **Query Builder** - Chainable API for building queries with full TypeScript support
- **Replication** - Master-slave replication with real-time sync
- **Encrypted Backups** - Compress and encrypt backups with scheduled support
- **Connection Pooling** - Efficient connection management with auto-reaping
- **Migrations** - Version-controlled schema changes with rollback support
- **Events System** - Hook into queries, transactions, and auth events
- **Zero Dependencies** - Pure JavaScript implementation

## Quick Start

```bash
# Install
npm install sqlite4

# or from GitHub
git clone https://github.com/KatsumaAI/SQLite-4.0.git
cd SQLite-4.0 && npm install
```

### Basic Usage

```javascript
const SQLite4 = require('sqlite4');

// Create database with encryption
const db = new SQLite4({
    dbPath: './data/app.db',
    key: 'your-secret-key'
});

// Execute queries
db.execute(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`);
db.execute(`INSERT INTO users (name) VALUES ('Alice')`);
const result = db.execute(`SELECT * FROM users`);

console.log(result.rows);
// [{ id: 1, name: 'Alice' }]

db.close();
```

### Query Builder

```javascript
const users = await db
    .select('name', 'email')
    .from('users')
    .where('status', 'active')
    .orderBy('created_at', 'DESC')
    .limit(10)
    .all();
```

### Schema Builder

```javascript
db.schema.create('posts', (table) => {
    table.increments('id');
    table.string('title', 255);
    table.text('content');
    table.integer('user_id').references('users', 'id');
    table.timestamp('created_at');
});
```

## Documentation

- [Getting Started](https://github.com/KatsumaAI/SQLite-4.0/wiki/Getting-Started)
- [API Reference](https://github.com/KatsumaAI/SQLite-4.0/wiki/API-Reference)
- [Query Builder](https://github.com/KatsumaAI/SQLite-4.0/wiki/Query-Builder)
- [Schema Builder](https://github.com/KatsumaAI/SQLite-4.0/wiki/Schema-Builder)
- [Migrations](https://github.com/KatsumaAI/SQLite-4.0/wiki/Migrations)
- [Replication](https://github.com/KatsumaAI/SQLite-4.0/wiki/Replication)
- [Security](https://github.com/KatsumaAI/SQLite-4.0/wiki/Security)

## CLI Tools

```bash
# Start server
npm start

# Interactive CLI
npm run cli

# Web admin panel (port 8443)
npm run admin

# Backup database
npm run backup

# Run tests
npm test
```

## Docker

```bash
# Basic container
docker compose up -d

# With TLS and authentication
docker compose -f docker-compose.tls.yml up -d

# High availability with replication
docker compose -f docker-compose.ha.yml up -d
```

## API

### SQLite4(options)

Create a new database instance.

```javascript
const db = new SQLite4({
    dbPath: './data/app.db',  // or ':memory:' for in-memory
    key: 'your-secret-key',   // encryption key (optional)
    readonly: false,          // open in read-only mode
    timeout: 5000            // lock timeout in ms
});
```

### Methods

- `execute(sql, params)` - Execute SQL and return result
- `query(sql, params)` - Execute query and return rows
- `all(sql, params)` - Get all rows
- `get(sql, params)` - Get single row
- `run(sql, params)` - Run INSERT/UPDATE/DELETE
- `prepare(sql)` - Create prepared statement
- `begin()` / `commit()` / `rollback()` - Transaction control
- `backup(destination, options)` - Create backup
- `close()` - Close database

### Properties

- `path` - Database file path
- `inMemory` - Whether database is in-memory
- `closed` - Whether database is closed
- `inTransaction` - Whether in active transaction

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

Built with ❤️ by [Katsuma](https://github.com/KatsumaAI)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.
