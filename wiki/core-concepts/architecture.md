# Core Concepts

## Architecture

SQLite-4.0 is built with a modular architecture that separates concerns and provides flexibility.

```
SQLite-4.0
├── Core Engine (src/sqlite4.js)
│   ├── Query Parser
│   ├── Encryption Layer
│   ├── Transaction Manager
│   └── Storage Engine
├── Enterprise Features
│   ├── Auth0 Integration
│   ├── Two-Factor Authentication
│   ├── Connection Pooling
│   └── Metrics Collection
└── Developer Tools
    ├── Query Builder
    ├── Schema Builder
    ├── Migration System
    └── Admin Panel
```

## Data Storage

SQLite-4.0 uses an encrypted file-based storage system:

- **In-Memory Mode**: For testing and temporary data
- **File Mode**: Persistent encrypted storage
- **Memory-Mapped**: Optional memory-mapped I/O for performance

## Security Architecture

### Encryption

All data is encrypted using AES-256-GCM:

```
Data -> AES-256-GCM -> Encrypted Data
     +IV +Auth Tag -> Storage
```

### Authentication Flow

```
User Login -> Auth Provider -> Token Exchange -> Session
            (Auth0/OAuth)    (JWT)          (Cookie)
```

## Concurrency Model

SQLite-4.0 uses optimistic concurrency with:

- Row-level locking
- Automatic deadlock detection
- Transaction isolation levels

## Performance

Key performance characteristics:

- **Query Optimization**: Cost-based query planner
- **Caching**: LRU cache with TTL
- **Indexing**: B-tree indexes for fast lookups
- **Batch Operations**: Bulk insert support
