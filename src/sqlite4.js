#!/usr/bin/env node

/**
 * SQLite-4.0 Core Database Engine
 * Secure embedded database with encryption and access control
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const tls = require('tls');
const http = require('http');
const https = require('https');

class SQLite4 {
    constructor(options = {}) {
        this.dbPath = options.dbPath || ':memory:';
        this.key = options.key || null;
        this.encryption = options.encryption || 'aes-256-gcm';
        this.readOnly = options.readOnly || false;
        this.inMemory = this.dbPath === ':memory:';
        
        // In-memory storage (will integrate with better-sqlite3 later)
        this.tables = new Map();
        this.indexes = new Map();
        this.users = new Map();
        this.roles = new Map();
        
        // Logging
        this.queryLog = [];
        this.accessLog = [];
        
        // Initialize default roles
        this._initRoles();
        
        // Initialize storage
        if (!this.inMemory && fs.existsSync(this.dbPath)) {
            this._load();
        }
    }
    
    _initRoles() {
        this.roles.set('admin', {
            name: 'admin',
            permissions: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'GRANT', 'REVOKE']
        });
        this.roles.set('operator', {
            name: 'operator',
            permissions: ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
        });
        this.roles.set('readonly', {
            name: 'readonly',
            permissions: ['SELECT']
        });
        this.roles.set('viewer', {
            name: 'viewer',
            permissions: ['SELECT']
        });
    }
    
    // Encryption methods
    encrypt(data, key = this.key) {
        if (!key) return data;
        
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key.slice(0, 32), 'utf8'), iv);
        
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        
        return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    }
    
    decrypt(data, key = this.key) {
        if (!key || typeof data !== 'string' || data.includes(':') === false) return data;
        
        try {
            const parts = data.split(':');
            if (parts.length !== 3) return data;
            
            const iv = Buffer.from(parts[0], 'hex');
            const authTag = Buffer.from(parts[1], 'hex');
            const encrypted = parts[2];
            
            const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key.slice(0, 32), 'utf8'), iv);
            decipher.setAuthTag(authTag);
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (e) {
            console.error('Decryption failed:', e.message);
            return data;
        }
    }
    
    // Core SQL methods
    execute(sql, params = [], user = null) {
        const startTime = Date.now();
        
        // Log query
        this.queryLog.push({
            sql: sql,
            params: params,
            user: user,
            timestamp: new Date().toISOString()
        });
        
        // Keep only last 1000 queries
        if (this.queryLog.length > 1000) {
            this.queryLog = this.queryLog.slice(-1000);
        }
        
        const normalized = sql.trim().toUpperCase();
        
        try {
            let result;
            
            if (normalized.startsWith('SELECT')) {
                result = this._select(sql, params, user);
            } else if (normalized.startsWith('INSERT')) {
                result = this._insert(sql, params, user);
            } else if (normalized.startsWith('UPDATE')) {
                result = this._update(sql, params, user);
            } else if (normalized.startsWith('DELETE')) {
                result = this._delete(sql, params, user);
            } else if (normalized.startsWith('CREATE TABLE')) {
                result = this._createTable(sql, params, user);
            } else if (normalized.startsWith('DROP TABLE')) {
                result = this._dropTable(sql, params, user);
            } else if (normalized.startsWith('GRANT')) {
                result = this._grant(sql, params, user);
            } else if (normalized.startsWith('REVOKE')) {
                result = this._revoke(sql, params, user);
            } else {
                throw new Error('Unsupported SQL command');
            }
            
            result.executionTime = Date.now() - startTime;
            return result;
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
                executionTime: Date.now() - startTime
            };
        }
    }
    
    _checkPermission(user, permission) {
        if (!user) return true; // No user = full access
        if (user.role === 'admin') return true;
        
        const role = this.roles.get(user.role);
        return role && role.permissions.includes(permission);
    }
    
    _select(sql, params, user) {
        // Simple SELECT parser
        const match = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i);
        
        if (!match) {
            throw new Error('Invalid SELECT syntax');
        }
        
        const [, columns, tableName, whereClause, orderBy, limit] = match;
        
        if (!this.tables.has(tableName)) {
            throw new Error(`Table '${tableName}' does not exist`);
        }
        
        if (!this._checkPermission(user, 'SELECT')) {
            throw new Error('Permission denied: SELECT');
        }
        
        let data = [...this.tables.get(tableName)];
        
        // Apply WHERE clause
        if (whereClause) {
            data = this._applyWhere(data, whereClause, params);
        }
        
        // Apply ORDER BY
        if (orderBy) {
            const [col, dir] = orderBy.split(/\s+/);
            data.sort((a, b) => {
                const va = a[col];
                const vb = b[col];
                if (dir === 'DESC') return va > vb ? -1 : 1;
                return va > vb ? 1 : -1;
            });
        }
        
        // Apply LIMIT
        if (limit) {
            data = data.slice(0, parseInt(limit));
        }
        
        return {
            success: true,
            type: 'select',
            columns: columns === '*' ? Object.keys(data[0] || {}) : columns.split(',').map(c => c.trim()),
            rows: data,
            rowCount: data.length
        };
    }
    
    _applyWhere(data, whereClause, params) {
        // Simple WHERE parser - handles =, !=, >, <, >=, <=, LIKE, IN
        const condition = whereClause.replace(/AND/gi, '&&').replace(/OR/gi, '||');
        
        return data.filter((row, idx) => {
            try {
                let evalStr = condition;
                
                // Replace field names with row values
                for (const [key, value] of Object.entries(row)) {
                    evalStr = evalStr.replace(new RegExp(`\\b${key}\\b`, 'g'), typeof value === 'string' ? `'${value}'` : value);
                }
                
                // Handle LIKE
                evalStr = evalStr.replace(/(\w+)\s+LIKE\s+'([^']+)'/gi, (match, field, pattern) => {
                    const val = row[field];
                    const regex = new RegExp(pattern.replace(/%/g, '.*'), 'i');
                    return regex.test(val);
                });
                
                // Handle IN
                evalStr = evalStr.replace(/(\w+)\s+IN\s+\(([^)]+)\)/gi, (match, field, values) => {
                    const val = row[field];
                    const arr = values.split(',').map(v => v.trim().replace(/'/g, ''));
                    return arr.includes(String(val));
                });
                
                // Replace operators
                evalStr = evalStr.replace(/!=/g, '!==').replace(/<>/g, '!=');
                
                return eval(evalStr);
            } catch (e) {
                return false;
            }
        });
    }
    
    _insert(sql, params, user) {
        const match = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
        
        if (!match) {
            throw new Error('Invalid INSERT syntax');
        }
        
        const [, tableName, columns, values] = match;
        
        if (!this.tables.has(tableName)) {
            throw new Error(`Table '${tableName}' does not exist`);
        }
        
        if (!this._checkPermission(user, 'INSERT')) {
            throw new Error('Permission denied: INSERT');
        }
        
        const colNames = columns.split(',').map(c => c.trim());
        const valList = values.split(',').map(v => v.trim());
        
        // Handle parameter placeholders
        const row = {};
        colNames.forEach((col, idx) => {
            let val = valList[idx];
            if (val === '?') {
                val = params[idx];
            } else {
                val = val.replace(/^'/, '').replace(/'$/, '');
            }
            row[col] = val;
        });
        
        // Add auto-increment ID
        const table = this.tables.get(tableName);
        row.id = table.length + 1;
        
        table.push(row);
        
        return {
            success: true,
            type: 'insert',
            lastInsertRowid: row.id,
            changes: 1
        };
    }
    
    _update(sql, params, user) {
        const match = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i);
        
        if (!match) {
            throw new Error('Invalid UPDATE syntax');
        }
        
        const [, tableName, setClause, whereClause] = match;
        
        if (!this.tables.has(tableName)) {
            throw new Error(`Table '${tableName}' does not exist`);
        }
        
        if (!this._checkPermission(user, 'UPDATE')) {
            throw new Error('Permission denied: UPDATE');
        }
        
        const table = this.tables.get(tableName);
        
        // Parse SET clause
        const setPairs = setClause.split(',').map(s => s.trim().split(/\s*=\s*/));
        
        let data = [...table];
        
        // Apply WHERE
        if (whereClause) {
            data = this._applyWhere(data, whereClause, params);
        }
        
        // Apply updates
        let changes = 0;
        data.forEach(row => {
            setPairs.forEach(([col, val]) => {
                let value = val.trim();
                if (value === '?') {
                    value = params[changes] || params[0];
                } else {
                    value = value.replace(/^'/, '').replace(/'$/, '');
                }
                row[col] = value;
                changes++;
            });
        });
        
        return {
            success: true,
            type: 'update',
            changes: changes
        };
    }
    
    _delete(sql, params, user) {
        const match = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
        
        if (!match) {
            throw new Error('Invalid DELETE syntax');
        }
        
        const [, tableName, whereClause] = match;
        
        if (!this.tables.has(tableName)) {
            throw new Error(`Table '${tableName}' does not exist`);
        }
        
        if (!this._checkPermission(user, 'DELETE')) {
            throw new Error('Permission denied: DELETE');
        }
        
        const table = this.tables.get(tableName);
        const originalLength = table.length;
        
        if (whereClause) {
            const toKeep = table.filter((row, idx) => {
                try {
                    let evalStr = whereClause;
                    for (const [key, value] of Object.entries(row)) {
                        evalStr = evalStr.replace(new RegExp(`\\b${key}\\b`, 'g'), typeof value === 'string' ? `'${value}'` : value);
                    }
                    return !eval(evalStr);
                } catch (e) {
                    return true;
                }
            });
            table.length = 0;
            table.push(...toKeep);
        } else {
            table.length = 0;
        }
        
        return {
            success: true,
            type: 'delete',
            changes: originalLength - table.length
        };
    }
    
    _createTable(sql, params, user) {
        const match = sql.match(/CREATE\s+TABLE\s+(\w+)\s*\((.+)\)/i);
        
        if (!match) {
            throw new Error('Invalid CREATE TABLE syntax');
        }
        
        const [, tableName, columns] = match;
        
        if (!this._checkPermission(user, 'CREATE')) {
            throw new Error('Permission denied: CREATE');
        }
        
        if (this.tables.has(tableName)) {
            throw new Error(`Table '${tableName}' already exists`);
        }
        
        // Parse column definitions
        const cols = columns.split(',').map(c => c.trim());
        const schema = {};
        
        cols.forEach(col => {
            const parts = col.split(/\s+/);
            const colName = parts[0];
            let colType = 'TEXT';
            
            if (parts[1]) {
                const upperType = parts[1].toUpperCase();
                if (['INTEGER', 'REAL', 'TEXT', 'BLOB'].includes(upperType)) {
                    colType = upperType;
                }
            }
            
            schema[colName] = {
                type: colType,
                primary: col.toUpperCase().includes('PRIMARY KEY'),
                autoIncrement: col.toUpperCase().includes('AUTOINCREMENT')
            };
        });
        
        this.tables.set(tableName, []);
        this.tables.set('_schema_' + tableName, schema);
        
        return {
            success: true,
            type: 'create_table',
            table: tableName
        };
    }
    
    _dropTable(sql, params, user) {
        const match = sql.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
        
        if (!match) {
            throw new Error('Invalid DROP TABLE syntax');
        }
        
        const [, tableName] = match;
        
        if (!this._checkPermission(user, 'DROP')) {
            throw new Error('Permission denied: DROP');
        }
        
        if (!this.tables.has(tableName)) {
            throw new Error(`Table '${tableName}' does not exist`);
        }
        
        this.tables.delete(tableName);
        this.tables.delete('_schema_' + tableName);
        
        return {
            success: true,
            type: 'drop_table',
            table: tableName
        };
    }
    
    _grant(sql, params, user) {
        const match = sql.match(/GRANT\s+(\w+)\s+ON\s+(\w+)\.\w+\s+TO\s+'(\w+)'/i);
        
        if (!match || !user || user.role !== 'admin') {
            throw new Error('Permission denied: GRANT');
        }
        
        const [, permission, , username] = match;
        
        if (!this.users.has(username)) {
            this.users.set(username, { username, role: 'readonly', created: new Date() });
        }
        
        return { success: true, type: 'grant' };
    }
    
    _revoke(sql, params, user) {
        if (!user || user.role !== 'admin') {
            throw new Error('Permission denied: REVOKE');
        }
        
        return { success: true, type: 'revoke' };
    }
    
    // Persistence
    _save() {
        if (this.inMemory) return;
        
        const data = {
            tables: Object.fromEntries(this.tables),
            roles: Object.fromEntries(this.roles),
            users: Object.fromEntries(this.users)
        };
        
        const encrypted = this.encrypt(JSON.stringify(data), this.key);
        fs.writeFileSync(this.dbPath, encrypted);
    }
    
    _load() {
        if (this.inMemory) return;
        
        try {
            const data = fs.readFileSync(this.dbPath, 'utf8');
            const decrypted = this.decrypt(data, this.key);
            const parsed = JSON.parse(decrypted);
            
            this.tables = new Map(parsed.tables);
            this.roles = new Map(parsed.roles);
            this.users = new Map(parsed.users);
        } catch (e) {
            console.error('Failed to load database:', e.message);
        }
    }
    
    // User management
    addUser(username, password, role = 'readonly') {
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        this.users.set(username, {
            username,
            passwordHash: hash,
            role,
            created: new Date().toISOString()
        });
    }
    
    authenticate(username, password) {
        const user = this.users.get(username);
        if (!user) return null;
        
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        if (hash !== user.passwordHash) return null;
        
        return { username: user.username, role: user.role };
    }
    
    // Logging
    log(query, user, duration) {
        this.accessLog.push({ query, user, duration, timestamp: new Date() });
        if (this.accessLog.length > 10000) {
            this.accessLog = this.accessLog.slice(-5000);
        }
    }
    
    getQueries() { return this.queryLog; }
    getAccessLog() { return this.accessLog; }
    
    // Get table info
    getTables() {
        return Array.from(this.tables.keys()).filter(k => !k.startsWith('_schema_'));
    }
    
    getSchema(tableName) {
        return this.tables.get('_schema_' + tableName) || null;
    }
}

module.exports = SQLite4;
