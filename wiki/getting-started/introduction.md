# Getting Started with SQLite-4.0

## Introduction

SQLite-4.0 is a next-generation secure embedded database with enterprise features, AI integration, and unique capabilities that set it apart from traditional SQLite implementations.

## Installation

```bash
# Via npm
npm install sqlite4

# From GitHub
git clone https://github.com/KatsumaAI/SQLite-4.0.git
cd SQLite-4.0 && npm install
```

## Quick Start

```javascript
const SQLite4 = require('sqlite4');

// Create encrypted database
const db = new SQLite4({
    dbPath: './data/app.db',
    key: process.env.DB_KEY,
    auth0: {
        domain: 'your-tenant.auth0.com',
        clientId: 'your-client-id',
        clientSecret: 'your-secret'
    }
});

// Execute queries
await db.execute(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`);
await db.execute(`INSERT INTO users (name) VALUES ('Alice')`);
const users = await db.execute(`SELECT * FROM users`);

console.log(users.rows);
```

## Two-Factor Authentication

Enable 2FA for enhanced security:

```javascript
// Enable TOTP 2FA
await db.security.enable2FA('admin@email.com', {
    issuer: 'SQLite-4.0',
    algorithm: 'SHA256',
    digits: 8,
    period: 30
});

// Verify 2FA code
const verified = await db.security.verify2FA('admin@email.com', '12345678');
```

## Auth0 Integration

Configure Auth0 for authentication:

```javascript
const db = new SQLite4({
    auth0: {
        domain: 'your-tenant.auth0.com',
        clientId: 'your-client-id',
        clientSecret: 'your-secret',
        audience: 'https://api.sqlite4.example.com',
        redirectUri: 'https://admin.sqlite4.example.com/callback',
        providers: ['discord', 'google', 'github', 'custom']
    }
});

// Login with Discord
const user = await db.auth.loginWithProvider('discord', {
    accessToken: 'discord-access-token',
    scope: ['identify', 'email']
});
```

## Next Steps

- [Core Concepts](core-concepts/introduction.md) - Understand the architecture
- [Features](features/encryption.md) - Explore enterprise features
- [API Reference](../api.md) - Complete API documentation
- [Examples](examples/basic-queries.md) - Code examples
