#!/usr/bin/env node

/**
 * SQLite-4.0 Client
 * Command-line client for SQLite-4.0 server
 */

const net = require('net');
const tls = require('tls');
const readline = require('readline');
const fs = require('fs');

class SQLite4Client {
    constructor(options = {}) {
        this.host = options.host || '127.0.0.1';
        this.port = options.port || 4444;
        this.tls = options.tls || false;
        this.database = options.database || null;
        this.username = options.username || null;
        this.password = options.password || null;
        this.key = options.key || null;
        
        this.socket = null;
        this.connected = false;
        this.pending = [];
        this.prompt = 'sqlite4> ';
    }
    
    connect() {
        return new Promise((resolve, reject) => {
            const connectFn = this.tls ? 
                tls.connect(this.port, this.host) :
                net.createConnection(this.port, this.host);
            
            this.socket = connectFn;
            
            let buffer = '';
            
            this.socket.on('connect', () => {
                this.connected = true;
                console.log(`Connected to ${this.host}:${this.port}`);
                
                // Auto-auth if credentials provided
                if (this.database) {
                    this.auth(this.database, this.username, this.password, this.key)
                        .then(resolve)
                        .catch(reject);
                } else {
                    resolve();
                }
            });
            
            this.socket.on('data', (data) => {
                buffer += data.toString();
                
                const lines = buffer.split('\n');
                buffer = lines.pop();
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const response = JSON.parse(line);
                            this.handleResponse(response);
                        } catch (e) {
                            console.log(line);
                        }
                    }
                }
            });
            
            this.socket.on('close', () => {
                this.connected = false;
                console.log('Connection closed');
                process.exit(0);
            });
            
            this.socket.on('error', (err) => {
                reject(err);
            });
        });
    }
    
    send(cmd) {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                reject(new Error('Not connected'));
                return;
            }
            
            const cmdId = Date.now().toString();
            
            this.pending.push({ cmdId, resolve, reject });
            
            this.socket.write(JSON.stringify({ ...cmd, cmdId }) + '\n');
            
            // Timeout
            setTimeout(() => {
                const idx = this.pending.findIndex(p => p.cmdId === cmdId);
                if (idx !== -1) {
                    this.pending.splice(idx, 1);
                    reject(new Error('Request timeout'));
                }
            }, 30000);
        });
    }
    
    handleResponse(response) {
        if (response.cmdId) {
            const pending = this.pending.find(p => p.cmdId === response.cmdId);
            if (pending) {
                const idx = this.pending.indexOf(pending);
                this.pending.splice(idx, 1);
                
                if (response.error) {
                    pending.reject(new Error(response.error));
                } else {
                    pending.resolve(response);
                }
            }
        }
    }
    
    // Commands
    auth(database, username = null, password = null, key = null) {
        return this.send({
            type: 'auth',
            database,
            username,
            password,
            key
        });
    }
    
    query(sql, params = []) {
        return this.send({
            type: 'query',
            sql,
            params
        });
    }
    
    execute(sql, params = []) {
        return this.query(sql, params);
    }
    
    tables() {
        return this.send({ type: 'tables' });
    }
    
    schema(table) {
        return this.send({ type: 'schema', table });
    }
    
    ping() {
        return this.send({ type: 'ping' });
    }
    
    // Interactive mode
    async interactive() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: this.prompt
        });
        
        rl.prompt();
        
        rl.on('line', async (line) => {
            const sql = line.trim();
            
            if (!sql) {
                rl.prompt();
                return;
            }
            
            if (sql === '.quit' || sql === '.exit') {
                process.exit(0);
            }
            
            if (sql === '.tables') {
                try {
                    const res = await this.tables();
                    console.log(res.tables.join('  '));
                } catch (e) {
                    console.error('Error:', e.message);
                }
                rl.prompt();
                return;
            }
            
            if (sql.startsWith('.schema ')) {
                const table = sql.split(' ')[1];
                try {
                    const res = await this.schema(table);
                    console.log(JSON.stringify(res.schema, null, 2));
                } catch (e) {
                    console.error('Error:', e.message);
                }
                rl.prompt();
                return;
            }
            
            if (sql.startsWith('.') && sql !== '.tables') {
                console.log('Available commands: .tables, .schema <table>, .quit');
                rl.prompt();
                return;
            }
            
            try {
                const res = await this.query(sql);
                if (res.rows) {
                    console.log(JSON.stringify(res, null, 2));
                } else if (res.success) {
                    console.log('OK');
                } else if (res.error) {
                    console.error('Error:', res.error);
                }
            } catch (e) {
                console.error('Error:', e.message);
            }
            
            rl.prompt();
        });
    }
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {
        host: '127.0.0.1',
        port: 4444,
        tls: false,
        database: null,
        username: null,
        password: null,
        key: null
    };
    
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--host':
            case '-h':
                options.host = args[++i];
                break;
            case '--port':
            case '-p':
                options.port = parseInt(args[++i]);
                break;
            case '--tls':
                options.tls = true;
                break;
            case '--database':
            case '-d':
                options.database = args[++i];
                break;
            case '--user':
            case '-u':
                options.username = args[++i];
                break;
            case '--password':
            case '--pass':
                options.password = args[++i];
                break;
            case '--key':
                options.key = args[++i];
                break;
        }
    }
    
    const client = new SQLite4Client(options);
    
    client.connect()
        .then(() => client.interactive())
        .catch(err => {
            console.error('Connection failed:', err.message);
            process.exit(1);
        });
}

module.exports = SQLite4Client;
