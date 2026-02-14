#!/usr/bin/env node

/**
 * SQLite-4.0 Example: Basic Database Operations
 * 
 * This example demonstrates:
 * - Creating a database
 * - Creating tables
 * - Inserting, querying, updating, and deleting data
 * - Using transactions
 */

const SQLite4 = require('../src/sqlite4.js');

// Example database path (in-memory for this example)
const DB_PATH = ':memory:';

async function main() {
    console.log('SQLite-4.0 Basic Example\n');
    console.log('=' .repeat(50));
    
    // Create database
    const db = new SQLite4({
        dbPath: DB_PATH,
        key: 'your-secret-key-32-chars!'
    });
    
    console.log('\n1. Created database:', DB_PATH);
    
    // Create table using schema builder
    console.log('\n2. Creating tables...');
    db.schema.create('users', (table) => {
        table.increments('id');
        table.string('name', 255);
        table.string('email').unique();
        table.integer('age');
        table.string('status').default('active');
        table.timestamp('created_at');
    });
    
    db.schema.create('posts', (table) => {
        table.increments('id');
        table.integer('user_id');
        table.string('title', 255);
        table.text('content');
        table.timestamp('created_at');
    });
    
    console.log('   - Created users table');
    console.log('   - Created posts table');
    
    // Insert data using raw SQL
    console.log('\n3. Inserting data...');
    
    // Insert users
    const users = [
        ['Alice', 'alice@example.com', 28],
        ['Bob', 'bob@example.com', 32],
        ['Charlie', 'charlie@example.com', 25],
        ['Diana', 'diana@example.com', 30],
        ['Eve', 'eve@example.com', 27]
    ];
    
    for (const user of users) {
        db.execute(
            `INSERT INTO users (name, email, age) VALUES (?, ?, ?)`,
            user
        );
    }
    console.log(`   - Inserted ${users.length} users`);
    
    // Insert posts
    db.execute(
        `INSERT INTO posts (user_id, title, content) VALUES 
         (1, 'First Post', 'Hello, this is my first post!'),
         (1, 'Second Post', 'Another post from Alice'),
         (2, 'Bob Introduction', 'Hi, I am Bob and this is my introduction')`
    );
    console.log('   - Inserted 3 posts');
    
    // Query data
    console.log('\n4. Querying data...');
    
    // Get all users
    const allUsers = db.all('SELECT * FROM users');
    console.log(`\n   All users:`);
    console.table(allUsers);
    
    // Get user by ID
    const user1 = db.get('SELECT * FROM users WHERE id = ?', [1]);
    console.log('\n   User with ID 1:');
    console.log(user1);
    
    // Get users older than 27
    const olderUsers = db.execute(
        `SELECT * FROM users WHERE age > ? ORDER BY age DESC`,
        [27]
    );
    console.log('\n   Users older than 27 (sorted by age):');
    console.table(olderUsers.rows);
    
    // Update data
    console.log('\n5. Updating data...');
    
    db.execute(
        `UPDATE users SET status = ? WHERE age < ?`,
        ['inactive', 30]
    );
    
    const inactiveUsers = db.all(
        `SELECT name, status FROM users WHERE status = ?`,
        ['inactive']
    );
    console.log(`   - Set ${inactiveUsers.length} users to inactive (age < 30)`);
    
    // Count users by status
    const counts = db.execute(
        `SELECT status, COUNT(*) as count FROM users GROUP BY status`
    );
    console.log('\n   User counts by status:');
    console.table(counts.rows);
    
    // Delete data
    console.log('\n6. Deleting data...');
    
    // Delete a specific user
    db.execute(`DELETE FROM users WHERE name = ?`, ['Eve']);
    console.log('   - Deleted user Eve');
    
    // Delete posts without valid users
    db.execute(`DELETE FROM posts WHERE user_id NOT IN (SELECT id FROM users)`);
    console.log('   - Cleaned up orphaned posts');
    
    // Transactions
    console.log('\n7. Using transactions...');
    
    db.begin();
    try {
        // Create a new user
        db.execute(
            `INSERT INTO users (name, email, age) VALUES (?, ?, ?)`,
            ['Frank', 'frank@example.com', 35]
        );
        const newUserId = db.execute('SELECT last_insert_rowid() as id').rows[0].id;
        
        // Create a post for the new user
        db.execute(
            `INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)`,
            [newUserId, 'Frank First Post', 'Hello from Frank!']
        );
        
        db.commit();
        console.log('   - Transaction committed successfully');
        
        const frank = db.get('SELECT * FROM users WHERE name = ?', ['Frank']);
        console.log('   - Frank created with post:', frank);
        
    } catch (e) {
        db.rollback();
        console.log('   - Transaction rolled back:', e.message);
    }
    
    // Join query
    console.log('\n8. Join query...');
    
    const postsWithAuthors = db.execute(`
        SELECT 
            u.name as author,
            p.title,
            p.content,
            p.created_at
        FROM posts p
        JOIN users u ON p.user_id = u.id
        ORDER BY p.created_at
    `);
    
    console.log('\n   Posts with authors:');
    console.table(postsWithAuthors.rows);
    
    // Get final state
    console.log('\n' + '='.repeat(50));
    console.log('Final database state:');
    
    const finalUsers = db.all('SELECT * FROM users');
    const finalPosts = db.all('SELECT * FROM posts');
    
    console.log(`   Users: ${finalUsers.length}`);
    console.log(`   Posts: ${finalPosts.length}`);
    
    // Close database
    db.close();
    console.log('\nExample completed successfully!');
}

main().catch(console.error);
