#!/usr/bin/env node

/**
 * SQLite-4.0 SQL Parser
 * Advanced SQL parsing with validation and optimization
 */

class SQLParser {
    constructor(options = {}) {
        this.strict = options.strict || false;
        this.trace = options.trace || false;
        
        // SQL keywords
        this.keywords = {
            DML: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'UPSERT'],
            DDL: ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'],
            DCL: ['GRANT', 'REVOKE'],
            TCL: ['BEGIN', 'START', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE'],
            SPECIAL: ['WITH', 'EXPLAIN', 'VACUUM', 'ANALYZE', 'PRAGMA']
        };
        
        // Supported functions
        this.functions = [
            'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ABS', 'ROUND', 'UPPER', 'LOWER',
            'LENGTH', 'SUBSTR', 'TRIM', 'LTRIM', 'RTRIM', 'REPLACE', 'INSTR',
            'COALESCE', 'NULLIF', 'IFNULL', 'IIF', 'CAST', 'TYPEOF',
            'DATE', 'TIME', 'DATETIME', 'STRFTIME', 'JULIANDAY',
            'RANDOM', 'HEX', 'UNHEX', 'ZEROBLOB', 'QUOTE'
        ];
        
        // Operators
        this.operators = ['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE', 'GLOB', 'MATCH', 'REGEXP', 'IS', 'IS NOT', 'IN', 'BETWEEN', 'AND', 'OR', 'NOT', '||', '*', '/', '%', '+', '-', '&', '|', '<<', '>>'];
    }
    
    // Parse SQL statement
    parse(sql) {
        const trimmed = sql.trim();
        
        if (this.trace) console.log('Parsing:', trimmed.substring(0, 100));
        
        const type = this.detectType(trimmed);
        
        if (!type) {
            return { valid: false, error: 'Unknown SQL statement type' };
        }
        
        const result = {
            type,
            valid: true,
            statement: trimmed,
            components: {}
        };
        
        try {
            switch (type) {
                case 'SELECT':
                    result.components = this.parseSelect(trimmed);
                    break;
                case 'INSERT':
                    result.components = this.parseInsert(trimmed);
                    break;
                case 'UPDATE':
                    result.components = this.parseUpdate(trimmed);
                    break;
                case 'DELETE':
                    result.components = this.parseDelete(trimmed);
                    break;
                case 'CREATE':
                    result.components = this.parseCreate(trimmed);
                    break;
                case 'DROP':
                    result.components = this.parseDrop(trimmed);
                    break;
                case 'BEGIN':
                case 'START':
                    result.components = this.parseTransaction(trimmed);
                    break;
                case 'COMMIT':
                case 'ROLLBACK':
                    result.components = this.parseCommit(trimmed);
                    break;
                default:
                    result.components = { raw: trimmed };
            }
            
            // Validate
            const validation = this.validate(result);
            result.valid = validation.valid;
            result.warnings = validation.warnings;
            result.errors = validation.errors;
            
        } catch (e) {
            result.valid = false;
            result.error = e.message;
        }
        
        return result;
    }
    
    detectType(sql) {
        const upper = sql.toUpperCase();
        
        for (const type of this.keywords.DML) {
            if (upper.startsWith(type)) return type;
        }
        for (const type of this.keywords.DDL) {
            if (upper.startsWith(type)) return type;
        }
        for (const type of this.keywords.TCL) {
            if (upper.startsWith(type)) return type;
        }
        
        return null;
    }
    
    parseSelect(sql) {
        const result = {
            distinct: false,
            columns: [],
            from: null,
            joins: [],
            where: null,
            groupBy: [],
            having: null,
            orderBy: [],
            limit: null,
            offset: null,
            union: null
        };
        
        // DISTINCT
        if (/\bDISTINCT\b/i.test(sql)) {
            result.distinct = true;
        }
        
        // SELECT columns
        const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM/i);
        if (selectMatch) {
            result.columns = this.parseColumnList(selectMatch[1]);
        }
        
        // FROM
        const fromMatch = sql.match(/FROM\s+(\w+)(?:\s+(\w+))?/i);
        if (fromMatch) {
            result.from = {
                table: fromMatch[1],
                alias: fromMatch[2] || null
            };
        }
        
        // JOINs
        const joinMatches = sql.matchAll(/(INNER|LEFT|RIGHT|OUTER)?\s*JOIN\s+(\w+)(?:\s+(\w+))?\s+ON\s+(.+?)(?=\s+(?:INNER|LEFT|RIGHT|OUTER|WHERE|GROUP|ORDER|LIMIT|$)/gi);
        for (const match of joinMatches) {
            result.joins.push({
                type: match[1] || 'INNER',
                table: match[2],
                alias: match[3] || null,
                on: match[4].trim()
            });
        }
        
        // WHERE
        const whereMatch = sql.match(/WHERE\s+(.+?)(?=\s+(?:GROUP|ORDER|LIMIT|$)/i);
        if (whereMatch) {
            result.where = whereMatch[1].trim();
        }
        
        // GROUP BY
        const groupMatch = sql.match(/GROUP\s+BY\s+(.+?)(?=\s+(?:HAVING|ORDER|LIMIT|$)/i);
        if (groupMatch) {
            result.groupBy = this.parseColumnList(groupMatch[1]);
        }
        
        // HAVING
        const havingMatch = sql.match(/HAVING\s+(.+?)(?=\s+(?:ORDER|LIMIT|$)/i);
        if (havingMatch) {
            result.having = havingMatch[1].trim();
        }
        
        // ORDER BY
        const orderMatch = sql.match(/ORDER\s+BY\s+(.+?)(?=\s+LIMIT|$)/i);
        if (orderMatch) {
            result.orderBy = this.parseOrderBy(orderMatch[1]);
        }
        
        // LIMIT
        const limitMatch = sql.match(/LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i);
        if (limitMatch) {
            result.limit = parseInt(limitMatch[1]);
            result.offset = limitMatch[2] ? parseInt(limitMatch[2]) : null;
        }
        
        return result;
    }
    
    parseInsert(sql) {
        const result = {
            or: null,
            into: null,
            columns: [],
            values: [],
            select: null
        };
        
        // OR clause (INSERT OR REPLACE, etc)
        const orMatch = sql.match(/INSERT\s+OR\s+(\w+)/i);
        if (orMatch) {
            result.or = orMatch[1].toUpperCase();
        }
        
        // INTO
        const intoMatch = sql.match(/INSERT\s+(?:INTO\s+)?(\w+)/i);
        if (intoMatch) {
            result.into = intoMatch[1];
        }
        
        // Columns
        const colMatch = sql.match(/\(([^)]+)\)\s+VALUES/i);
        if (colMatch) {
            result.columns = colMatch[1].split(',').map(c => c.trim());
        }
        
        // VALUES
        const valuesMatch = sql.match(/VALUES\s*(.+)$/i);
        if (valuesMatch) {
            const valueLists = valuesMatch[1].match(/\([^)]+\)/g) || [];
            result.values = valueLists.map(v => 
                v.replace(/[()]/g, '').split(',').map(val => val.trim())
            );
        }
        
        // SELECT instead of VALUES
        const selectMatch = sql.match(/SELECT\s+.+$/i);
        if (selectMatch) {
            result.select = this.parseSelect(selectMatch[0]);
        }
        
        return result;
    }
    
    parseUpdate(sql) {
        const result = {
            or: null,
            table: null,
            set: {},
            from: null,
            where: null
        };
        
        // OR clause
        const orMatch = sql.match(/UPDATE\s+OR\s+(\w+)/i);
        if (orMatch) {
            result.or = orMatch[1].toUpperCase();
        }
        
        // Table
        const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
        if (tableMatch) {
            result.table = tableMatch[1];
        }
        
        // SET
        const setMatch = sql.match(/SET\s+(.+?)(?:\s+WHERE|$)/i);
        if (setMatch) {
            const assignments = setMatch[1].split(',');
            for (const assignment of assignments) {
                const [col, val] = assignment.split('=').map(s => s.trim());
                if (col) result.set[col] = val;
            }
        }
        
        // WHERE
        const whereMatch = sql.match(/WHERE\s+(.+)$/i);
        if (whereMatch) {
            result.where = whereMatch[1].trim();
        }
        
        return result;
    }
    
    parseDelete(sql) {
        const result = {
            from: null,
            where: null
        };
        
        // FROM
        const fromMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
        if (fromMatch) {
            result.from = fromMatch[1];
        }
        
        // WHERE
        const whereMatch = sql.match(/WHERE\s+(.+)$/i);
        if (whereMatch) {
            result.where = whereMatch[1].trim();
        }
        
        return result;
    }
    
    parseCreate(sql) {
        const result = {
            type: null, // TABLE, INDEX, VIEW, TRIGGER, etc
            name: null,
            columns: [],
            constraints: [],
            ifNotExists: false,
            temporary: false,
            options: {}
        };
        
        // IF NOT EXISTS
        result.ifNotExists = /\bIF\s+NOT\s+EXISTS\b/i.test(sql);
        
        // TEMPORARY
        result.temporary = /\bTEMPORARY\b/i.test(sql);
        
        // Type
        const typeMatch = sql.match(/CREATE\s+(?:TEMPORARY\s+)?(\w+)/i);
        if (typeMatch) {
            result.type = typeMatch[1].toUpperCase();
        }
        
        // Name
        const nameMatch = sql.match(/CREATE\s+\w+\s+(\w+)/i);
        if (nameMatch) {
            result.name = nameMatch[1];
        }
        
        // TABLE columns
        if (result.type === 'TABLE') {
            const colMatch = sql.match(/\(([^)]+)\)/);
            if (colMatch) {
                result.columns = this.parseColumnDefs(colMatch[1]);
            }
        }
        
        return result;
    }
    
    parseDrop(sql) {
        return {
            type: null,
            name: null,
            ifExists: false
        };
    }
    
    parseTransaction(sql) {
        return {
            type: sql.toUpperCase().split(' ')[0],
            savepoint: null
        };
    }
    
    parseCommit(sql) {
        return {
            type: sql.toUpperCase().split(' ')[0]
        };
    }
    
    parseColumnList(list) {
        return list.split(',').map(col => {
            col = col.trim();
            // Handle aliases
            const asMatch = col.match(/(\w+)(?:\s+AS\s+(\w+))?/i);
            if (asMatch) {
                return {
                    column: asMatch[1],
                    alias: asMatch[2] || null,
                    aggregate: /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/.test(col)
                };
            }
            return { column: col, alias: null, aggregate: false };
        });
    }
    
    parseColumnDefs(defs) {
        const columns = [];
        const defList = defs.split(',');
        
        for (const def of defList) {
            const parts = def.trim().split(/\s+/);
            if (parts.length === 0) continue;
            
            const col = {
                name: parts[0],
                type: parts[1] || 'TEXT',
                primaryKey: false,
                notNull: false,
                default: null,
                references: null
            };
            
            // Constraints
            if (def.toUpperCase().includes('PRIMARY KEY')) col.primaryKey = true;
            if (def.toUpperCase().includes('NOT NULL')) col.notNull = true;
            
            // Default
            const defaultMatch = def.match(/DEFAULT\s+('[^']*'|\d+)/i);
            if (defaultMatch) col.default = defaultMatch[1];
            
            // Foreign key
            const refMatch = def.match(/REFERENCES\s+(\w+)(?:\((\w+)\))?/i);
            if (refMatch) {
                col.references = {
                    table: refMatch[1],
                    column: refMatch[3] || null
                };
            }
            
            columns.push(col);
        }
        
        return columns;
    }
    
    parseOrderBy(order) {
        return order.split(',').map(o => {
            const parts = o.trim().split(/\s+/);
            return {
                column: parts[0],
                direction: (parts[1] || 'ASC').toUpperCase()
            };
        });
    }
    
    // Validate parsed statement
    validate(parsed) {
        const warnings = [];
        const errors = [];
        
        if (!parsed.valid) return { valid: false, warnings: [], errors: [parsed.error] };
        
        // SELECT validation
        if (parsed.type === 'SELECT') {
            const c = parsed.components;
            
            // Check for SELECT *
            if (c.columns.some(col => col.column === '*')) {
                warnings.push('Using SELECT * is not recommended');
            }
            
            // Check for no WHERE clause on large tables
            if (!c.where && c.from) {
                warnings.push('Query without WHERE may be slow on large tables');
            }
            
            // Check for missing index hints
            if (c.where && !c.from?.table) {
                errors.push('Invalid table reference');
            }
        }
        
        // INSERT validation
        if (parsed.type === 'INSERT') {
            const c = parsed.components;
            if (!c.into) errors.push('Missing table name');
            if (c.columns.length > 0 && c.values.length > 0 && c.columns.length !== c.values[0].length) {
                errors.push('Column count mismatch');
            }
        }
        
        // UPDATE validation
        if (parsed.type === 'UPDATE') {
            const c = parsed.components;
            if (!c.table) errors.push('Missing table name');
            if (Object.keys(c.set).length === 0) errors.push('No columns to update');
            if (!c.where) warnings.push('UPDATE without WHERE will modify all rows');
        }
        
        // DELETE validation
        if (parsed.type === 'DELETE') {
            const c = parsed.components;
            if (!c.from) errors.push('Missing table name');
            if (!c.where) warnings.push('DELETE without WHERE will delete all rows');
        }
        
        // CREATE TABLE validation
        if (parsed.type === 'CREATE' && parsed.components.type === 'TABLE') {
            const c = parsed.components;
            if (!c.name) errors.push('Missing table name');
            if (c.columns.length === 0) errors.push('Table must have at least one column');
            
            // Check for primary key
            const hasPK = c.columns.some(col => col.primaryKey);
            if (!hasPK) warnings.push('Table has no primary key');
        }
        
        return { valid: errors.length === 0, warnings, errors };
    }
    
    // Optimize query
    optimize(sql) {
        const parsed = this.parse(sql);
        
        if (!parsed.valid) return { original: sql, optimized: sql, reason: 'Parse error' };
        
        let optimized = sql;
        let reason = 'No optimization needed';
        
        // SELECT optimizations
        if (parsed.type === 'SELECT') {
            const c = parsed.components;
            
            // Add LIMIT if missing
            if (!c.limit) {
                optimized = sql.trim() + ' LIMIT 1000';
                reason = 'Added LIMIT 1000 to prevent large result sets';
            }
            
            // Add ORDER BY index hint
            if (c.where && !c.orderBy.length) {
                // Could suggest index here
            }
        }
        
        return {
            original: sql,
            optimized,
            reason,
            parsed
        };
    }
}

// Export
module.exports = SQLParser;
