# SQLite-4.0 Examples

This folder contains example scripts demonstrating various SQLite-4.0 features.

## Folder Structure

```
examples/
├── basic/
│   └── basic-operations.js    - CRUD operations
├── auth/
│   ├── auth0-oauth.js       - Auth0 integration
│   └── two-factor-auth.js    - 2FA setup
├── replication/
│   └── replication.js       - Master-slave replication
└── admin/
    └── remote-hosting.js     - ngrok and remote access
```

## Running Examples

```bash
# Install dependencies
npm install

# Run basic operations example
node examples/basic/basic-operations.js

# Run auth example
node examples/auth/auth0-oauth.js

# Run 2FA example
node examples/auth/two-factor-auth.js

# Run replication example
node examples/replication/replication.js

# Run remote hosting example
node examples/admin/remote-hosting.js
```

## Examples

### Basic Operations

Demonstrates:
- Creating databases
- Creating tables
- Inserting, querying, updating, deleting data
- Using transactions
- Join queries

### Auth0 OAuth

Demonstrates:
- Configuring Auth0
- OAuth provider setup
- Authorization URLs
- Token exchange
- Session management

### Two-Factor Authentication

Demonstrates:
- Enabling 2FA
- QR code generation
- Backup codes
- Recovery tokens

### Replication

Demonstrates:
- Master-slave setup
- Synchronization
- Conflict resolution
- Status monitoring

### Remote Hosting

Demonstrates:
- Server setup
- ngrok integration
- TLS configuration
- Client connections

## More Examples

See [API Reference](api.html) for additional examples.
