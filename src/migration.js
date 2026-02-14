#!/usr/bin/env node

/**
 * SQLite-4.0 Migration System
 * Database versioning and schema management
 */

const fs = require('fs');
const path = require('path');

class Migration {
    constructor(db, options = {}) {
        this.db = db;
        this.table = options.table || '_migrations';
        this.dir = options.dir || './migrations';
        
        this._ensureTable();
    }
    
    _ensureTable() {
        this.db.execute(`
            CREATE TABLE IF NOT EXISTS ${this.table} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                batch INTEGER,
                executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }
    
    // Create migration file
    create(name, upSQL, downSQL) {
        const timestamp = Date.now();
        const filename = `${timestamp}_${name}.sql`;
        const filepath = path.join(this.dir, filename);
        
        const content = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}

-- UP
${upSQL}

-- DOWN
${downSQL}
`;
        
        // Ensure directory exists
        if (!fs.existsSync(this.dir)) {
            fs.mkdirSync(this.dir, { recursive: true });
        }
        
        fs.writeFileSync(filepath, content);
        
        return { filename, filepath };
    }
    
    // Get pending migrations
    getPending() {
        const result = this.db.execute(`SELECT name FROM ${this.table}`);
        const executed = new Set(result.rows.map(r => r.name));
        
        const files = fs.readdirSync(this.dir)
            .filter(f => f.endsWith('.sql'))
            .sort();
        
        return files.filter(f => !executed.has(f));
    }
    
    // Get executed migrations
    getExecuted() {
        const result = this.db.execute(
            `SELECT * FROM ${this.table} ORDER BY executed_at DESC`
        );
        return result.rows;
    }
    
    // Run pending migrations
    async migrate(options = {}) {
        const { direction = 'up', batch = Date.now() } = options;
        
        if (direction === 'up') {
            return this._migrateUp(batch);
        } else {
            return this._migrateDown(batch);
        }
    }
    
    async _migrateUp(batch) {
        const pending = this.getPending();
        const results = [];
        
        for (const file of pending) {
            const filepath = path.join(this.dir, file);
            const sql = fs.readFileSync(filepath, 'utf8');
            
            // Extract UP migration
            const upMatch = sql.match(/--\s*UP\s*\n([\s\S]*?)(?:--\s*DOWN|$)/i);
            if (!upMatch) {
                results.push({ file, success: false, error: 'No UP migration found' });
                continue;
            }
            
            try {
                // Execute each statement
                const statements = upMatch[1].split(';').filter(s => s.trim());
                for (const stmt of statements) {
                    if (stmt.trim()) {
                        this.db.execute(stmt);
                    }
                }
                
                // Record migration
                this.db.execute(
                    `INSERT INTO ${this.table} (name, batch) VALUES (?, ?)`,
                    [file, batch]
                );
                
                results.push({ file, success: true });
            } catch (e) {
                results.push({ file, success: false, error: e.message });
                break;
            }
        }
        
        return results;
    }
    
    async _migrateDown(batch) {
        // Get migrations in this batch
        const result = this.db.execute(
            `SELECT * FROM ${this.table} WHERE batch = ? ORDER BY id DESC`,
            [batch]
        );
        
        const results = [];
        
        for (const migration of result.rows) {
            const filepath = path.join(this.dir, migration.name);
            
            if (!fs.existsSync(filepath)) {
                results.push({ file: migration.name, success: false, error: 'File not found' });
                continue;
            }
            
            try {
                const sql = fs.readFileSync(filepath, 'utf8');
                
                // Extract DOWN migration
                const downMatch = sql.match(/--\s*DOWN\s*\n([\s\S]*)/i);
                if (!downMatch) {
                    results.push({ file: migration.name, success: false, error: 'No DOWN migration' });
                    continue;
                }
                
                // Execute each statement
                const statements = downMatch[1].split(';').filter(s => s.trim());
                for (const stmt of statements) {
                    if (stmt.trim()) {
                        this.db.execute(stmt);
                    }
                }
                
                // Remove migration record
                this.db.execute(
                    `DELETE FROM ${this.table} WHERE id = ?`,
                    [migration.id]
                );
                
                results.push({ file: migration.name, success: true });
            } catch (e) {
                results.push({ file: migration.name, success: false, error: e.message });
                break;
            }
        }
        
        return results;
    }
    
    // Rollback last batch
    async rollback() {
        const result = this.db.execute(
            `SELECT MAX(batch) as last_batch FROM ${this.table}`
        );
        const lastBatch = result.rows[0]?.last_batch;
        
        if (!lastBatch) {
            return { success: false, error: 'No migrations to rollback' };
        }
        
        return this._migrateDown(lastBatch);
    }
    
    // Fresh - drop all and re-run migrations
    async fresh() {
        // Drop migrations table
        this.db.execute(`DROP TABLE IF EXISTS ${this.table}`);
        
        // Recreate
        this._ensureTable();
        
        // Run all migrations
        return this.migrate();
    }
    
    // Get status
    getStatus() {
        const pending = this.getPending();
        const executed = this.getExecuted();
        
        return {
            executed: executed.length,
            pending: pending.length,
            currentBatch: executed[0]?.batch || null,
            lastExecuted: executed[0]?.executed_at || null
        };
    }
}

module.exports = Migration;
