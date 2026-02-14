#!/usr/bin/env node

/**
 * SQLite-4.0 Replication
 * Master-slave replication support
 */

const net = require('net');
const events = require('events');
const crypto = require('crypto');

class SQLite4Replication extends events.EventEmitter {
    constructor(options = {}) {
        super();
        
        this.mode = options.mode || 'slave'; // 'master' or 'slave'
        this.role = options.role || 'slave';
        
        // Master options
        this.masterHost = options.masterHost || '127.0.0.1';
        this.masterPort = options.masterPort || 4445;
        
        // Slave options  
        this.slavePort = options.slavePort || 4446;
        this.slaveId = options.slaveId || crypto.randomUUID().slice(0, 8);
        
        // Replication settings
        this.replicationKey = options.replicationKey || null;
        this.filterTables = options.filterTables || null; // Tables to replicate
        this.filterPattern = options.filterPattern || null; // Regex for data filtering
        
        // State
        this.connected = false;
        this.replicating = false;
        this.lastSync = null;
        this.sequence = 0;
        
        this.server = null;
        this.client = null;
        
        // WAL tracking
        this.walEntries = [];
    }
    
    // Start as master
    startMaster() {
        this.mode = 'master';
        
        this.server = net.createServer((socket) => {
            console.log(`[${new Date().toISOString()}] Slave connected: ${socket.remoteAddress}`);
            
            socket.on('data', (data) => {
                this.handleSlaveRequest(socket, data);
            });
            
            socket.on('close', () => {
                console.log(`[${new Date().toISOString()}] Slave disconnected`);
            });
            
            socket.on('error', (err) => {
                console.error(`[${new Date().toISOString()}] Socket error: ${err.message}`);
            });
        });
        
        this.server.listen(this.masterPort, () => {
            console.log(`[${new Date().toISOString()}] SQLite-4.0 Master replication on port ${this.masterPort}`);
        });
    }
    
    // Handle slave requests
    handleSlaveRequest(socket, data) {
        try {
            const req = JSON.parse(data.toString());
            
            switch (req.type) {
                case 'handshake':
                    // Send master info
                    socket.write(JSON.stringify({
                        type: 'handshake',
                        version: '4.0.0',
                        slaveId: req.slaveId,
                        tables: this.getReplicatedTables()
                    }));
                    break;
                    
                case 'get_changes':
                    // Send changes since sequence
                    const changes = this.getChangesSince(req.sequence);
                    socket.write(JSON.stringify({
                        type: 'changes',
                        sequence: this.sequence,
                        changes: changes
                    }));
                    break;
                    
                case 'get_snapshot':
                    // Send full database snapshot
                    const snapshot = this.getSnapshot();
                    socket.write(JSON.stringify({
                        type: 'snapshot',
                        sequence: this.sequence,
                        data: snapshot
                    }));
                    break;
                    
                default:
                    socket.write(JSON.stringify({ error: 'Unknown request type' }));
            }
        } catch (e) {
            socket.write(JSON.stringify({ error: e.message }));
        }
    }
    
    // Get list of tables to replicate
    getReplicatedTables() {
        // Return filtered tables if filter is set
        if (this.filterTables) {
            return this.filterTables;
        }
        return ['*']; // Replicate all
    }
    
    // Get changes since sequence
    getChangesSince(sequence) {
        // In real implementation, this would track WAL or transaction log
        return this.walEntries.filter(e => e.sequence > sequence);
    }
    
    // Get full database snapshot
    getSnapshot() {
        // In real implementation, this would serialize the database
        return {
            tables: {},
            version: '4.0.0'
        };
    }
    
    // Connect as slave
    connect() {
        return new Promise((resolve, reject) => {
            this.client = new net.Socket();
            
            this.client.connect(this.masterPort, this.masterHost, () => {
                console.log(`[${new Date().toISOString()}] Connected to master at ${this.masterHost}:${this.masterPort}`);
                
                // Send handshake
                this.client.write(JSON.stringify({
                    type: 'handshake',
                    slaveId: this.slaveId
                }));
                
                this.connected = true;
                resolve();
            });
            
            this.client.on('data', (data) => {
                this.handleMasterResponse(data);
            });
            
            this.client.on('close', () => {
                console.log(`[${new Date().toISOString()}] Disconnected from master`);
                this.connected = false;
                this.replicating = false;
                
                // Try to reconnect
                setTimeout(() => {
                    if (!this.connected) {
                        this.connect().catch(console.error);
                    }
                }, 5000);
            });
            
            this.client.on('error', (err) => {
                console.error(`[${new Date().toISOString()}] Connection error: ${err.message}`);
                reject(err);
            });
        });
    }
    
    // Handle master response
    handleMasterResponse(data) {
        try {
            const resp = JSON.parse(data.toString());
            
            switch (resp.type) {
                case 'handshake':
                    console.log(`[${new Date().toISOString()}] Master version: ${resp.version}, Tables: ${resp.tables.join(', ')}`);
                    this.startReplication();
                    break;
                    
                case 'changes':
                    this.applyChanges(resp.changes);
                    this.sequence = resp.sequence;
                    this.lastSync = new Date();
                    break;
                    
                case 'snapshot':
                    this.applySnapshot(resp.data);
                    this.sequence = resp.sequence;
                    this.lastSync = new Date();
                    console.log(`[${new Date().toISOString()}] Snapshot applied at sequence ${this.sequence}`);
                    break;
                    
                case 'error':
                    console.error(`[${new Date().toISOString()}] Master error: ${resp.error}`);
                    break;
            }
        } catch (e) {
            console.error(`[${new Date().toISOString()}] Parse error: ${e.message}`);
        }
    }
    
    // Start replication loop
    startReplication() {
        if (this.replicating) return;
        
        this.replicating = true;
        
        const replicate = () => {
            if (!this.connected || !this.replicating) return;
            
            this.client.write(JSON.stringify({
                type: 'get_changes',
                sequence: this.sequence
            }));
            
            // Request full sync periodically
            if (this.sequence === 0 || Date.now() - this.lastSync > 3600000) {
                this.client.write(JSON.stringify({
                    type: 'get_snapshot'
                }));
            }
        };
        
        // Replicate every second
        this.replicationInterval = setInterval(replicate, 1000);
        
        console.log(`[${new Date().toISOString()}] Replication started`);
    }
    
    // Apply changes from master
    applyChanges(changes) {
        for (const change of changes) {
            try {
                switch (change.operation) {
                    case 'INSERT':
                        this.applyInsert(change.table, change.data);
                        break;
                    case 'UPDATE':
                        this.applyUpdate(change.table, change.where, change.data);
                        break;
                    case 'DELETE':
                        this.applyDelete(change.table, change.where);
                        break;
                }
            } catch (e) {
                console.error(`[${new Date().toISOString()}] Apply error: ${e.message}`);
            }
        }
    }
    
    applyInsert(table, data) {
        // In real implementation, apply to local database
        this.emit('insert', { table, data });
    }
    
    applyUpdate(table, where, data) {
        this.emit('update', { table, where, data });
    }
    
    applyDelete(table, where) {
        this.emit('delete', { table, where });
    }
    
    applySnapshot(data) {
        // In real implementation, restore full database
        this.emit('snapshot', data);
    }
    
    // Stop replication
    stop() {
        this.replicating = false;
        
        if (this.replicationInterval) {
            clearInterval(this.replicationInterval);
        }
        
        if (this.client) {
            this.client.destroy();
        }
        
        if (this.server) {
            this.server.close();
        }
        
        console.log(`[${new Date().toISOString()}] Replication stopped`);
    }
    
    // Get status
    getStatus() {
        return {
            mode: this.mode,
            connected: this.connected,
            replicating: this.replicating,
            lastSync: this.lastSync,
            sequence: this.sequence,
            slaveId: this.slaveId
        };
    }
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (command === 'master') {
        const repl = new SQLite4Replication({ mode: 'master' });
        repl.startMaster();
    } else if (command === 'slave') {
        const repl = new SQLite4Replication({
            mode: 'slave',
            masterHost: args[1] || '127.0.0.1',
            masterPort: parseInt(args[2]) || 4445
        });
        repl.connect();
    } else {
        console.log('SQLite-4.0 Replication');
        console.log('Usage:');
        console.log('  replication.js master          - Start as master');
        console.log('  replication.js slave <host> <port> - Connect as slave');
    }
}

module.exports = SQLite4Replication;
