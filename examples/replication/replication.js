#!/usr/bin/env node

/**
 * SQLite-4.0 Example: Master-Slave Replication
 * 
 * This example demonstrates:
 * - Setting up replication
 * - Starting replication
 * - Checking replication status
 * - Handling conflicts
 */

const SQLite4 = require('../../src/sqlite4.js');

async function main() {
    console.log('SQLite-4.0 Replication Example\n');
    console.log('='.repeat(50));
    
    // Create master database
    console.log('\n1. Creating Master Database...');
    const master = new SQLite4({
        dbPath: './data/master.db'
    });
    
    master.execute(`
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            name TEXT,
            email TEXT UNIQUE,
            status TEXT DEFAULT 'active',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    master.execute(`
        CREATE TABLE orders (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            product TEXT,
            quantity INTEGER,
            total DECIMAL(10,2),
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    console.log('   Master database created with users and orders tables');
    
    // Create slave databases
    console.log('\n2. Creating Slave Databases...');
    
    const slave1 = new SQLite4({
        dbPath: './data/slave1.db'
    });
    
    const slave2 = new SQLite4({
        dbPath: './data/slave2.db'
    });
    
    console.log('   Created 2 slave databases');
    
    // Set up replication
    console.log('\n3. Configuring Replication...');
    
    const replication = new SQLite4.Replication({
        master: master,
        slaves: [slave1, slave2],
        syncInterval: 5000,  // Sync every 5 seconds
        autoReconnect: true,
        conflictResolution: 'last-write-wins'  // or 'master-wins', 'slave-wins'
    });
    
    console.log('   Replication configured:');
    console.log('   - Master: ./data/master.db');
    console.log('   - Slaves: 2 slaves');
    console.log('   - Sync interval: 5 seconds');
    console.log('   - Conflict resolution: last-write-wins');
    
    // Start replication
    console.log('\n4. Starting Replication...');
    
    replication.start();
    console.log('   Replication started');
    
    // Add data to master
    console.log('\n5. Adding Data to Master...');
    
    const users = [
        ['Alice', 'alice@example.com'],
        ['Bob', 'bob@example.com'],
        ['Charlie', 'charlie@example.com']
    ];
    
    for (const user of users) {
        master.execute(
            `INSERT INTO users (name, email) VALUES (?, ?)`,
            user
        );
    }
    console.log(`   Added ${users.length} users to master`);
    
    // Wait for replication
    console.log('\n6. Waiting for Replication...');
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    // Check data on slaves
    console.log('\n7. Verifying Replication...');
    
    const masterUsers = master.all('SELECT * FROM users');
    const slave1Users = slave1.all('SELECT * FROM users');
    const slave2Users = slave2.all('SELECT * FROM users');
    
    console.log(`   Master: ${masterUsers.length} users`);
    console.log(`   Slave 1: ${slave1Users.length} users`);
    console.log(`   Slave 2: ${slave2Users.length} users`);
    
    // Update data on master
    console.log('\n8. Updating Data on Master...');
    
    master.execute(
        `UPDATE users SET status = 'active' WHERE name = ?`,
        ['Alice']
    );
    
    master.execute(
        `INSERT INTO orders (user_id, product, quantity, total) VALUES (?, ?, ?, ?)`,
        [1, 'Widget', 2, 99.98]
    );
    
    console.log('   Updated Alice status and added order');
    
    // Wait for replication
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    // Verify updates replicated
    console.log('\n9. Verifying Updates...');
    
    const aliceOnSlave1 = slave1.get(
        `SELECT * FROM users WHERE name = ?`,
        ['Alice']
    );
    const ordersOnSlave2 = slave2.all('SELECT * FROM orders');
    
    console.log(`   Alice's status on Slave 1: ${aliceOnSlave1.status}`);
    console.log(`   Orders on Slave 2: ${ordersOnSlave2.length}`);
    
    // Get replication status
    console.log('\n10. Replication Status...');
    
    const status = replication.getStatus();
    console.log('   Status:', status.running ? 'Running' : 'Stopped');
    console.log('   Connected slaves:', status.connectedSlaves);
    console.log('   Last sync:', status.lastSync);
    console.log('   Pending changes:', status.pendingChanges);
    
    // Pause replication
    console.log('\n11. Pausing Replication...');
    
    replication.pause();
    console.log('   Replication paused');
    
    // Resume replication
    console.log('\n12. Resuming Replication...');
    
    replication.resume();
    console.log('   Replication resumed');
    
    // Stop replication
    console.log('\n13. Stopping Replication...');
    
    replication.stop();
    console.log('   Replication stopped');
    
    // Cleanup
    console.log('\n14. Cleanup...');
    
    master.close();
    slave1.close();
    slave2.close();
    
    console.log('   Databases closed');
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('\nReplication Features:');
    console.log('- Master-slave architecture');
    console.log('- Real-time synchronization');
    console.log('- Auto-reconnection');
    console.log('- Configurable sync intervals');
    console.log('- Conflict resolution strategies');
    console.log('- Status monitoring');
    
    console.log('\nExample completed!');
}

main().catch(console.error);
