#!/usr/bin/env node

/**
 * SQLite-4.0 Query Builder
 * Chainable query construction
 */

class QueryBuilder {
    constructor(db) {
        this.db = db;
        this._query = {
            type: null,
            table: null,
            columns: ['*'],
            where: [],
            whereParams: [],
            joins: [],
            orderBy: [],
            groupBy: [],
            having: [],
            limit: null,
            offset: null,
            set: {},
            setParams: [],
            values: [],
            valuesParams: [],
            returning: [],
            distinct: false
        };
    }
    
    // SELECT
    select(...columns) {
        this._query.type = 'SELECT';
        this._query.columns = columns.length > 0 ? columns : ['*'];
        return this;
    }
    
    // DISTINCT
    distinct() {
        this._query.distinct = true;
        return this;
    }
    
    // FROM
    from(table) {
        this._query.table = table;
        return this;
    }
    
    // JOIN
    join(table, condition, type = 'INNER') {
        this._query.joins.push({ table, condition, type });
        return this;
    }
    
    leftJoin(table, condition) {
        return this.join(table, condition, 'LEFT');
    }
    
    rightJoin(table, condition) {
        return this.join(table, condition, 'RIGHT');
    }
    
    // WHERE
    where(column, operator, value) {
        if (arguments.length === 2) {
            value = operator;
            operator = '=';
        }
        this._query.where.push({ column, operator, value, conjunction: 'AND' });
        this._query.whereParams.push(value);
        return this;
    }
    
    orWhere(column, operator, value) {
        if (arguments.length === 2) {
            value = operator;
            operator = '=';
        }
        this._query.where.push({ column, operator, value, conjunction: 'OR' });
        this._query.whereParams.push(value);
        return this;
    }
    
    whereIn(column, values) {
        const placeholders = values.map(() => '?').join(', ');
        this._query.where.push({ 
            column, 
            operator: 'IN', 
            value: `(${placeholders})`,
            conjunction: 'AND',
            isIn: true
        });
        this._query.whereParams.push(...values);
        return this;
    }
    
    whereNull(column) {
        this._query.where.push({ column, operator: 'IS', value: 'NULL', conjunction: 'AND' });
        return this;
    }
    
    whereNotNull(column) {
        this._query.where.push({ column, operator: 'IS NOT', value: 'NULL', conjunction: 'AND' });
        return this;
    }
    
    whereBetween(column, start, end) {
        this._query.where.push({ 
            column, 
            operator: 'BETWEEN', 
            value: '? AND ?', 
            conjunction: 'AND',
            isBetween: true
        });
        this._query.whereParams.push(start, end);
        return this;
    }
    
    // GROUP BY
    groupBy(...columns) {
        this._query.groupBy.push(...columns);
        return this;
    }
    
    // HAVING
    having(column, operator, value) {
        if (arguments.length === 2) {
            value = operator;
            operator = '=';
        }
        this._query.having.push({ column, operator, value });
        return this;
    }
    
    // ORDER BY
    orderBy(column, direction = 'ASC') {
        this._query.orderBy.push({ column, direction: direction.toUpperCase() });
        return this;
    }
    
    orderByAsc(column) {
        return this.orderBy(column, 'ASC');
    }
    
    orderByDesc(column) {
        return this.orderBy(column, 'DESC');
    }
    
    // LIMIT / OFFSET
    limit(value) {
        this._query.limit = value;
        return this;
    }
    
    offset(value) {
        this._query.offset = value;
        return this;
    }
    
    // For UPDATE
    set(data) {
        this._query.type = 'UPDATE';
        for (const [key, value] of Object.entries(data)) {
            this._query.set[key] = value;
            this._query.setParams.push(value);
        }
        return this;
    }
    
    // For INSERT
    values(data) {
        this._query.type = 'INSERT';
        
        if (Array.isArray(data)) {
            this._query.values.push(...data);
        } else {
            this._query.values.push(data);
        }
        
        return this;
    }
    
    returning(...columns) {
        this._query.returning = columns;
        return this;
    }
    
    // Build the SQL
    toSQL() {
        const q = this._query;
        let sql = '';
        const params = [];
        
        switch (q.type) {
            case 'SELECT':
                sql = this._buildSelect(params);
                break;
            case 'UPDATE':
                sql = this._buildUpdate(params);
                break;
            case 'INSERT':
                sql = this._buildInsert(params);
                break;
            case 'DELETE':
                sql = this._buildDelete(params);
                break;
            default:
                throw new Error('Unknown query type');
        }
        
        return { sql, params };
    }
    
    _buildSelect(params) {
        const q = this._query;
        let sql = 'SELECT ';
        
        if (q.distinct) sql += 'DISTINCT ';
        sql += q.columns.join(', ');
        
        if (!q.table) throw new Error('No table specified');
        sql += ` FROM ${q.table}`;
        
        // JOINs
        for (const join of q.joins) {
            sql += ` ${join.type} JOIN ${join.table} ON ${join.condition}`;
        }
        
        // WHERE
        if (q.where.length > 0) {
            sql += ' WHERE ';
            const whereClauses = q.where.map((w, i) => {
                if (w.isIn || w.isBetween) {
                    if (w.isIn) return `${w.column} IN ${w.value}`;
                    if (w.isBetween) return `${w.column} BETWEEN ${w.value}`;
                }
                const prefix = i > 0 ? ` ${w.conjunction} ` : '';
                return `${prefix}${w.column} ${w.operator} ?`;
            });
            sql += whereClauses.join('');
            params.push(...q.whereParams);
        }
        
        // GROUP BY
        if (q.groupBy.length > 0) {
            sql += ` GROUP BY ${q.groupBy.join(', ')}`;
        }
        
        // HAVING
        if (q.having.length > 0) {
            sql += ' HAVING ';
            const havingClauses = q.having.map(h => `${h.column} ${h.operator} ?`);
            sql += havingClauses.join(' AND ');
            params.push(...q.having.map(h => h.value));
        }
        
        // ORDER BY
        if (q.orderBy.length > 0) {
            sql += ' ORDER BY ';
            sql += q.orderBy.map(o => `${o.column} ${o.direction}`).join(', ');
        }
        
        // LIMIT
        if (q.limit !== null) {
            sql += ` LIMIT ${q.limit}`;
        }
        
        // OFFSET
        if (q.offset !== null) {
            sql += ` OFFSET ${q.offset}`;
        }
        
        return sql;
    }
    
    _buildUpdate(params) {
        const q = this._query;
        let sql = `UPDATE ${q.table}`;
        
        // SET
        const setClauses = Object.keys(q.set).map(col => `${col} = ?`);
        sql += ' SET ' + setClauses.join(', ');
        params.push(...q.setParams);
        
        // WHERE
        if (q.where.length > 0) {
            sql += ' WHERE ';
            const whereClauses = q.where.map((w, i) => {
                const prefix = i > 0 ? ` ${w.conjunction} ` : '';
                return `${prefix}${w.column} ${w.operator} ?`;
            });
            sql += whereClauses.join('');
            params.push(...q.whereParams);
        }
        
        return sql;
    }
    
    _buildInsert(params) {
        const q = this._query;
        let sql = 'INSERT INTO ';
        
        if (!q.table) throw new Error('No table specified');
        sql += q.table;
        
        // Columns
        if (q.values.length > 0) {
            const first = q.values[0];
            const columns = Object.keys(first);
            sql += ` (${columns.join(', ')})`;
            
            // VALUES
            sql += ' VALUES ';
            const placeholders = columns.map(() => '?').join(', ');
            sql += q.values.map(() => `(${placeholders})`).join(', ');
            
            for (const row of q.values) {
                params.push(...Object.values(row));
            }
        }
        
        // RETURNING
        if (q.returning.length > 0) {
            sql += ` RETURNING ${q.returning.join(', ')}`;
        }
        
        return sql;
    }
    
    _buildDelete(params) {
        const q = this._query;
        let sql = 'DELETE FROM ' + q.table;
        
        // WHERE
        if (q.where.length > 0) {
            sql += ' WHERE ';
            const whereClauses = q.where.map((w, i) => {
                const prefix = i > 0 ? ` ${w.conjunction} ` : '';
                return `${prefix}${w.column} ${w.operator} ?`;
            });
            sql += whereClauses.join('');
            params.push(...q.whereParams);
        }
        
        return sql;
    }
    
    // Execute the query
    async execute() {
        const { sql, params } = this.toSQL();
        return this.db.execute(sql, params);
    }
    
    // Get first result
    async first() {
        const result = await this.limit(1).execute();
        return result.rows && result.rows[0] ? result.rows[0] : null;
    }
    
    // Get all results
    async all() {
        const result = await this.execute();
        return result.rows || [];
    }
    
    // Count
    async count() {
        const originalColumns = this._query.columns;
        this._query.columns = ['COUNT(*) as count'];
        const result = await this.execute();
        this._query.columns = originalColumns;
        return result.rows[0]?.count || 0;
    }
    
    // Clone the builder
    clone() {
        const clone = new QueryBuilder(this.db);
        clone._query = JSON.parse(JSON.stringify(this._query));
        clone._query.whereParams = [...this._query.whereParams];
        clone._query.setParams = [...this._query.setParams];
        clone._query.valuesParams = [...this._query.valuesParams];
        return clone;
    }
    
    // Reset
    reset() {
        this._query = {
            type: null,
            table: null,
            columns: ['*'],
            where: [],
            whereParams: [],
            joins: [],
            orderBy: [],
            groupBy: [],
            having: [],
            limit: null,
            offset: null,
            set: {},
            setParams: [],
            values: [],
            valuesParams: [],
            returning: [],
            distinct: false
        };
        return this;
    }
}

// Export
module.exports = QueryBuilder;
