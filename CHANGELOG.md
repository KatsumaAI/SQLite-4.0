# Changelog

All notable changes to SQLite-4.0 are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0] - 2025-02-14

### Added
- Initial release of SQLite-4.0
- Core database engine with AES-256-GCM encryption
- Network server with TCP/TLS support
- Interactive CLI tool
- Web admin panel (port 8443)
- Encrypted backup/restore utilities
- Master-slave replication
- SQL parser and validator
- Connection pooling
- Chainable query builder
- Database migration system
- Event hooks system
- Programmatic schema builder
- Docker support (Dockerfile + docker-compose)
- Quick installer script
- TypeScript definitions
- Comprehensive README documentation

### Features
- User authentication with roles (admin, operator, readonly, viewer)
- IP allowlisting for network access
- Rate limiting to prevent DoS
- Encrypted backups with compression
- Auto-reconnecting replication
- Query optimization (auto LIMIT)
- Express middleware for events
- File-based audit logging

### CLI Commands
- `.help` - Show help
- `.tables` - List tables
- `.schema [table]` - Show table schema
- `.indexes` - List indexes
- `.load <file>` - Load SQL file
- `.save <file>` - Save query results
- `.import <file>` - Import CSV
- `.export <file>` - Export to CSV
- `.dump` - Full database dump
- `.mode [table|list|csv|json]` - Set output mode

### Docker Compose Examples
- Basic setup
- TLS + authentication
- High availability (replication)
- With Nginx reverse proxy
- With Fail2Ban

## [4.0.1] - 2025-02-XX

### To be added
- Performance benchmarks
- Additional SQL functions
- Window functions support
- Full-text search
- JSON query support
- Change data capture (CDC)
- More connection pool options
- Prometheus metrics endpoint
