#!/usr/bin/env node

/**
 * SQLite-4.0 CLI Tool
 * Command-line interface with advanced features
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const SQLite4 = require('./sqlite4');

class SQLite4CLI {
    constructor() {
        this.db = null;
        this.dbPath = ':memory:';
        this.key = null;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'sqlite4> '
        });
        
        this.commands = {
            '.exit': () => process.exit(0),
            '.quit': () => process.exit(0),
            '.help': () => this.showHelp(),
            '.tables': () => this.showTables(),
            '.schema': (args) => this.showSchema(args),
            '.indexes': () => this.showIndexes(),
            '.users': () => this.showUsers(),
            '.load': (args) => this.loadFile(args),
            '.save': (args) => this.saveFile(args),
            '.import': (args) => this.importCSV(args),
            '.export': (args) => this.exportCSV(args),
            '.dump': (args) => this.dump(args),
            '.timing': () => this.toggleTiming(),
            '.mode': (args) => this.setMode(args),
            '.width': (args) => this.setWidth(args),
            '.nullvalue': (args) => this.setNullValue(args),
            '.headers': () => this.toggleHeaders(),
            '.key': (args) => this.setKey(args),
            '.open': (args) => this.openDatabase(args),
            '.new': (args) => this.newDatabase(args),
            '.info': () => this.showInfo(),
        };
        
        this.options = {
            timing: false,
            mode: 'table', // table, list, csv, json
            width: [],
            nullvalue: '',
            headers: true
        };
        
        this.prompt = 'sqlite4> ';
    }
    
    showHelp() {
        console.log(`
SQLite-4.0 Commands:
  .exit, .quit           Exit CLI
  .help                  Show this help
  .tables                List all tables
  .schema [table]        Show table schema
  .indexes               List all indexes
  .users                 List all users
  .load <file>           Load SQL from file
  .save <file>           Save SQL to file
  .import <file> <table>  Import CSV into table
  .export <file> <table>  Export table to CSV
  .dump [table]         Dump database/table as SQL
  .timing                Toggle query timing
  .mode [table|list|csv|json]  Set output mode
  .width <n>             Set column widths
  .nullvalue <string>    Set null display string
  .headers               Toggle column headers
  .key <password>       Set encryption key
  .open <file>           Open database file
  .new <file>            Create new database
  .info                  Show database info

SQL Commands:
  SELECT, INSERT, UPDATE, DELETE
  CREATE TABLE, CREATE INDEX
  GRANT, REVOKE
  BEGIN, COMMIT, ROLLBACK
`);
    }
    
    showTables() {
        if (!this.db) {
            console.log('No database open');
            return;
        }
        
        const tables = this.db.getTables();
        if (tables.length === 0) {
            console.log('No tables found');
        } else {
            console.log(tables.join('\n'));
        }
    }
    
    showSchema(args) {
        if (!this.db) {
            console.log('No database open');
            return;
        }
        
        if (args.length === 0) {
            // Show all tables
            const tables = this.db.getTables();
            for (const table of tables) {
                const schema = this.db.getSchema(table);
                console.log(`\nTable: ${table}`);
                console.log('Schema:', JSON.stringify(schema, null, 2));
            }
        } else {
            const schema = this.db.getSchema(args[0]);
            if (schema) {
                console.log(JSON.stringify(schema, null, 2));
            } else {
                console.log(`Table '${args[0]}' not found`);
            }
        }
    }
    
    showIndexes() {
        if (!this.db) {
            console.log('No database open');
            return;
        }
        
        const indexes = this.db.indexes || [];
        if (indexes.length === 0) {
            console.log('No indexes found');
        } else {
            console.log(indexes.join('\n'));
        }
    }
    
    showUsers() {
        if (!this.db) {
            console.log('No database open');
            return;
        }
        
        console.log('Users:');
        // List users would go here
    }
    
    loadFile(args) {
        if (args.length === 0) {
            console.log('Usage: .load <file>');
            return;
        }
        
        try {
            const sql = fs.readFileSync(args[0], 'utf8');
            console.log(`Loading ${args[0]}...`);
            this.db.execute(sql);
            console.log('Done');
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    }
    
    saveFile(args) {
        if (args.length === 0) {
            console.log('Usage: .save <file>');
            return;
        }
        
        if (!this.db) {
            console.log('No database open');
            return;
        }
        
        const tables = this.db.getTables();
        let sql = '-- SQLite-4.0 dump\n\n';
        
        for (const table of tables) {
            sql += `CREATE TABLE ${table} (...);\n\n`;
        }
        
        fs.writeFileSync(args[0], sql);
        console.log(`Saved to ${args[0]}`);
    }
    
    importCSV(args) {
        if (args.length < 2) {
            console.log('Usage: .import <file> <table>');
            return;
        }
        
        const [file, table] = args;
        
        try {
            const data = fs.readFileSync(file, 'utf8');
            const lines = data.trim().split('\n');
            const headers = lines[0].split(',').map(h => h.trim());
            
            console.log(`Importing ${lines.length - 1} rows into ${table}...`);
            
            // Create table
            const createSQL = `CREATE TABLE ${table} (${headers.map(h => `${h} TEXT`).join(', ')})`;
            this.db.execute(createSQL);
            
            // Insert data
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim().replace(/'/g, "''"));
                const insertSQL = `INSERT INTO ${table} (${headers.join(', ')}) VALUES ('${values.join("', '")}')`;
                this.db.execute(insertSQL);
            }
            
            console.log('Import complete');
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    }
    
    exportCSV(args) {
        if (args.length < 2) {
            console.log('Usage: .export <file> <table>');
            return;
        }
        
        const [file, table] = args;
        
        if (!this.db) {
            console.log('No database open');
            return;
        }
        
        try {
            const result = this.db.execute(`SELECT * FROM ${table}`);
            
            if (!result.success || !result.rows || result.rows.length === 0) {
                console.log('No data to export');
                return;
            }
            
            const headers = result.columns.join(',');
            const rows = result.rows.map(row => 
                Object.values(row).join(',')
            ).join('\n');
            
            fs.writeFileSync(file, `${headers}\n${rows}`);
            console.log(`Exported ${result.rows.length} rows to ${file}`);
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    }
    
    dump(args) {
        if (!this.db) {
            console.log('No database open');
            return;
        }
        
        console.log('-- SQLite-4.0 Dump');
        
        const tables = this.db.getTables();
        for (const table of tables) {
            console.log(`\n-- Table: ${table}`);
            console.log(`CREATE TABLE ${table} (...);`);
        }
    }
    
    toggleTiming() {
        this.options.timing = !this.options.timing;
        console.log(`Timing is now ${this.options.timing ? 'on' : 'off'}`);
    }
    
    setMode(args) {
        if (args.length === 0) {
            console.log(`Current mode: ${this.options.mode}`);
            return;
        }
        
        this.options.mode = args[0];
        console.log(`Mode set to ${args[0]}`);
    }
    
    setWidth(args) {
        this.options.width = args.map(Number);
        console.log(`Column widths set`);
    }
    
    setNullValue(args) {
        this.options.nullvalue = args.join(' ');
        console.log(`Null value string set to: ${this.options.nullvalue}`);
    }
    
    toggleHeaders() {
        this.options.headers = !this.options.headers;
        console.log(`Headers are now ${this.options.headers ? 'on' : 'off'}`);
    }
    
    setKey(args) {
        if (args.length === 0) {
            console.log('Usage: .key <password>');
            return;
        }
        
        this.key = args[0];
        console.log('Encryption key set');
    }
    
    openDatabase(args) {
        if (args.length === 0) {
            console.log('Usage: .open <file>');
            return;
        }
        
        this.dbPath = args[0];
        this.db = new SQLite4({
            dbPath: this.dbPath,
            key: this.key
        });
        
        this.prompt = `sqlite4:${path.basename(this.dbPath)}> `;
        console.log(`Opened: ${this.dbPath}`);
    }
    
    newDatabase(args) {
        if (args.length === 0) {
            console.log('Usage: .new <file>');
            return;
        }
        
        this.dbPath = args[0];
        this.db = new SQLite4({
            dbPath: this.dbPath,
            key: this.key
        });
        
        this.prompt = `sqlite4:${path.basename(this.dbPath)}> `;
        console.log(`Created new database: ${this.dbPath}`);
    }
    
    showInfo() {
        if (!this.db) {
            console.log('No database open');
            return;
        }
        
        console.log(`
Database: ${this.dbPath}
Tables: ${this.db.getTables().length}
Encryption: ${this.key ? 'Enabled' : 'Disabled'}
`);
    }
    
    async run() {
        console.log(`
╔════════════════════════════════════════╗
║         SQLite-4.0 CLI v4.0.0         ║
║     Secure Embedded Database CLI        ║
╚════════════════════════════════════════╝

Type .help for commands
`);
        
        this.rl.prompt();
        
        this.rl.on('line', async (line) => {
            const input = line.trim();
            
            if (!input) {
                this.rl.prompt();
                return;
            }
            
            const startTime = Date.now();
            
            // Check for dot commands
            if (input.startsWith('.')) {
                const [cmd, ...args] = input.split(/\s+/);
                if (this.commands[cmd]) {
                    this.commands[cmd](args);
                } else {
                    console.log(`Unknown command: ${cmd}`);
                }
            } else if (this.db) {
                // Execute SQL
                try {
                    const result = this.db.execute(input);
                    
                    if (this.options.timing) {
                        const time = Date.now() - startTime;
                        console.log(`Execution time: ${time}ms`);
                    }
                    
                    if (result.success) {
                        if (result.rows && result.rows.length > 0) {
                            this.formatOutput(result);
                        } else if (result.changes !== undefined) {
                            console.log(`OK - ${result.changes} row(s) affected`);
                        } else if (result.lastInsertRowid) {
                            console.log(`OK - row ${result.lastInsertRowid} inserted`);
                        } else {
                            console.log('OK');
                        }
                    } else {
                        console.log(`Error: ${result.error}`);
                    }
                } catch (e) {
                    console.log(`Error: ${e.message}`);
                }
            } else {
                console.log('No database open. Use .new <file> or .open <file>');
            }
            
            this.rl.prompt();
        });
        
        this.rl.on('close', () => {
            console.log('\nGoodbye!');
            process.exit(0);
        });
    }
    
    formatOutput(result) {
        const { columns, rows } = result;
        
        if (this.options.mode === 'json') {
            console.log(JSON.stringify(rows, null, 2));
            return;
        }
        
        if (this.options.mode === 'csv') {
            console.log(columns.join(','));
            for (const row of rows) {
                console.log(Object.values(row).join(','));
            }
            return;
        }
        
        if (this.options.mode === 'list') {
            const separator = ' | ';
            console.log(columns.join(separator));
            console.log('-'.repeat(80));
            for (const row of rows) {
                console.log(Object.values(row).join(separator));
            }
            return;
        }
        
        // Table mode
        if (this.options.headers) {
            console.log(columns.join(' | '));
            console.log('-'.repeat(columns.length * 20));
        }
        
        for (const row of rows) {
            const values = columns.map(col => {
                const val = row[col];
                return val === null ? this.options.nullvalue : String(val);
            });
            console.log(values.join(' | '));
        }
        
        console.log(`\n(${rows.length} rows)`);
    }
}

// CLI
const cli = new SQLite4CLI();
cli.run();
