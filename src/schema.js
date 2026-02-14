#!/usr/bin/env node

/**
 * SQLite-4.0 Schema Builder
 * Programmatic table and schema creation
 */

class SchemaBuilder {
    constructor(db) {
        this.db = db;
        this.blueprint = {
            table: null,
            columns: [],
            indexes: [],
            foreignKeys: [],
            ifNotExists: false,
            temporary: false
        };
    }
    
    // Create a new table
    create(table, callback) {
        this.blueprint = {
            table,
            columns: [],
            indexes: [],
            foreignKeys: [],
            ifNotExists: false,
            temporary: false
        };
        
        if (callback) {
            callback(this);
        }
        
        return this;
    }
    
    // Create if not exists
    ifNotExists() {
        this.blueprint.ifNotExists = true;
        return this;
    }
    
    // Temporary table
    temporary() {
        this.blueprint.temporary = true;
        return this;
    }
    
    // Add column
    column(name, type = 'TEXT') {
        const column = {
            name,
            type: type.toUpperCase(),
            primaryKey: false,
            autoIncrement: false,
            notNull: false,
            unique: false,
            default: null,
            references: null
        };
        
        this.blueprint.columns.push(column);
        return this;
    }
    
    // Column modifiers
    primaryKey() {
        const col = this.blueprint.columns[this.blueprint.columns.length - 1];
        col.primaryKey = true;
        return this;
    }
    
    autoIncrement() {
        const col = this.blueprint.columns[this.blueprint.columns.length - 1];
        col.autoIncrement = true;
        return this;
    }
    
    notNull() {
        const col = this.blueprint.columns[this.blueprint.columns.length - 1];
        col.notNull = true;
        return this;
    }
    
    unique() {
        const col = this.blueprint.columns[this.blueprint.columns.length - 1];
        col.unique = true;
        return this;
    }
    
    default(value) {
        const col = this.blueprint.columns[this.blueprint.columns.length - 1];
        col.default = value;
        return this;
    }
    
    references(table, column = 'id') {
        const col = this.blueprint.columns[this.blueprint.columns.length - 1];
        col.references = { table, column };
        return this;
    }
    
    // Convenience methods for common types
    increments(name = 'id') {
        return this.column(name, 'INTEGER').primaryKey().autoIncrement();
    }
    
    string(name, length = 255) {
        return this.column(name, `VARCHAR(${length})`);
    }
    
    text(name) {
        return this.column(name, 'TEXT');
    }
    
    integer(name) {
        return this.column(name, 'INTEGER');
    }
    
    bigInteger(name) {
        return this.column(name, 'BIGINT');
    }
    
    float(name) {
        return this.column(name, 'REAL');
    }
    
    double(name) {
        return this.column(name, 'DOUBLE');
    }
    
    boolean(name) {
        return this.column(name, 'INTEGER'); // SQLite uses 0/1
    }
    
    date(name) {
        return this.column(name, 'DATE');
    }
    
    datetime(name) {
        return this.column(name, 'DATETIME');
    }
    
    timestamp(name) {
        return this.column(name, 'TIMESTAMP');
    }
    
    json(name) {
        return this.column(name, 'TEXT'); // SQLite stores JSON as text
    }
    
    blob(name) {
        return this.column(name, 'BLOB');
    }
    
    // Add index
    index(columns, name = null) {
        if (typeof columns === 'string') {
            columns = [columns];
        }
        
        this.blueprint.indexes.push({
            columns,
            name: name || `${this.blueprint.table}_${columns.join('_')}_idx`,
            unique: false
        });
        
        return this;
    }
    
    uniqueIndex(columns, name = null) {
        const idx = this.index(columns, name);
        idx.blueprint.indexes[idx.blueprint.indexes.length - 1].unique = true;
        return this;
    }
    
    // Add foreign key
    foreignKey(column, references, onDelete = 'NO ACTION', onUpdate = 'NO ACTION') {
        this.blueprint.foreignKeys.push({
            column,
            references,
            onDelete,
            onUpdate
        });
        
        return this;
    }
    
    // Build the SQL
    toSQL() {
        const bp = this.blueprint;
        
        if (!bp.table) {
            throw new Error('No table specified');
        }
        
        let sql = 'CREATE ';
        
        // TEMPORARY
        if (bp.temporary) {
            sql += 'TEMPORARY ';
        }
        
        // TABLE
        sql += 'TABLE ';
        
        // IF NOT EXISTS
        if (bp.ifNotExists) {
            sql += 'IF NOT EXISTS ';
        }
        
        // Table name
        sql += bp.table;
        
        // Columns
        const columnDefs = bp.columns.map(col => {
            let def = `${col.name} ${col.type}`;
            
            if (col.primaryKey) def += ' PRIMARY KEY';
            if (col.autoIncrement) def += ' AUTOINCREMENT';
            if (col.notNull) def += ' NOT NULL';
            if (col.unique) def += ' UNIQUE';
            if (col.default !== null) {
                def += ` DEFAULT ${typeof col.default === 'string' ? `'${col.default}'` : col.default}`;
            }
            
            return def;
        });
        
        // Foreign keys
        const foreignKeyDefs = bp.foreignKeys.map(fk => {
            return `FOREIGN KEY (${fk.column}) REFERENCES ${fk.references.table}(${fk.references.column}) ON DELETE ${fk.onDelete} ON UPDATE ${fk.onUpdate}`;
        });
        
        sql += ` (${[...columnDefs, ...foreignKeyDefs].join(', ')})`;
        
        return sql;
    }
    
    // Execute the SQL
    execute() {
        const sql = this.toSQL();
        return this.db.execute(sql);
    }
    
    // Drop table
    drop(table) {
        return this.db.execute(`DROP TABLE IF EXISTS ${table}`);
    }
    
    // Rename table
    rename(from, to) {
        return this.db.execute(`ALTER TABLE ${from} RENAME TO ${to}`);
    }
    
    // Add column
    addColumn(table, name, type) {
        return this.db.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    }
    
    // Drop column
    dropColumn(table, column) {
        // SQLite doesn't support DROP COLUMN directly, need to recreate
        return this.db.execute(`
            ALTER TABLE ${table} DROP COLUMN ${column}
        `);
    }
    
    // Add index
    addIndex(table, columns, unique = false) {
        const name = `${table}_${columns.join('_')}_idx`;
        return this.db.execute(
            `CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${name} ON ${table} (${columns.join(', ')})`
        );
    }
    
    // Drop index
    dropIndex(name) {
        return this.db.execute(`DROP INDEX IF EXISTS ${name}`);
    }
}

// Export
module.exports = SchemaBuilder;
