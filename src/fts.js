#!/usr/bin/env node

/**
 * SQLite-4.0 Full-Text Search (FTS5)
 * Simple FTS implementation for text search
 */

class FullTextSearch {
    constructor(db, options = {}) {
        this.db = db;
        this.tablePrefix = options.tablePrefix || 'fts_';
        this.stemmer = options.stemmer || new SimpleStemmer();
        this.stopWords = new Set([
            'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
            'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
            'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
            'can', 'need', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
            'from', 'as', 'into', 'through', 'during', 'before', 'after',
            'above', 'below', 'between', 'under', 'again', 'further', 'then',
            'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
            'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
            'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
            'also', 'now', 'this', 'that', 'these', 'those', 'what', 'which',
            'who', 'whom', 'whose', 'if', 'because', 'until', 'while', 'about'
        ]);
    }
    
    // Create FTS virtual table
    create(tableName, columns = ['title', 'content', 'tags']) {
        const ftsTable = `${this.tablePrefix}${tableName}`;
        const colDefs = columns.map(c => `"${c}" TEXT`).join(', ');
        
        this.db.execute(`
            CREATE VIRTUAL TABLE IF NOT EXISTS ${ftsTable} 
            USING fts5(${colDefs}, tokenize='porter')
        `);
        
        return ftsTable;
    }
    
    // Create content table with FTS
    createWithContent(contentTable, ftsTable, columns) {
        // Create content table
        const colDefs = columns.map(c => {
            let def = `"${c.name}" ${c.type || 'TEXT'}`;
            if (c.primaryKey) def += ' PRIMARY KEY';
            if (c.notNull) def += ' NOT NULL';
            return def;
        }).join(', ');
        
        this.db.execute(`CREATE TABLE IF NOT EXISTS ${contentTable} (${colDefs})`);
        
        // Create FTS table
        const ftsCols = columns.filter(c => c.type !== 'INTEGER' || c.name === 'id').map(c => `"${c.name}"`);
        this.create(ftsTable.replace(this.tablePrefix, ''), columns.map(c => c.name));
        
        // Create triggers for sync
        const colNames = columns.map(c => c.name).join(', ');
        const qCols = columns.map(c => c.name).join(', ');
        
        // Insert trigger
        this.db.execute(`
            CREATE TRIGGER IF NOT EXISTS ${contentTable}_ai AFTER INSERT ON ${contentTable}
            BEGIN
                INSERT INTO ${ftsTable} (rowid, ${qCols})
                VALUES (new.rowid, ${qCols.split(',').map(() => 'new.').join('')});
            END
        `);
        
        // Update trigger
        this.db.execute(`
            CREATE TRIGGER IF NOT EXISTS ${contentTable}_au AFTER UPDATE ON ${contentTable}
            BEGIN
                INSERT INTO ${ftsTable} (${ftsTable}, ${qCols})
                VALUES (new.rowid, ${qCols.split(',').map(() => 'new.').join('')});
            END
        `);
        
        // Delete trigger
        this.db.execute(`
            CREATE TRIGGER IF NOT EXISTS ${contentTable}_ad AFTER DELETE ON ${contentTable}
            BEGIN
                INSERT INTO ${ftsTable} (${ftsTable}, ${qCols})
                VALUES (old.rowid, ${qCols.split(',').map(() => 'old.').join('')});
            END
        `);
    }
    
    // Index a document
    index(ftsTable, columns) {
        const colNames = columns.map(c => c.name).join(', ');
        const values = columns.map((c, i) => `$${i}`).join(', ');
        
        this.db.execute(
            `INSERT INTO ${ftsTable} (${colNames}) VALUES (${values})`,
            columns.map(c => c.value)
        );
        
        return this.db.execute('SELECT last_insert_rowid() as id').rows[0]?.id;
    }
    
    // Search with ranking
    search(ftsTable, query, options = {}) {
        const { 
            limit = 10, 
            offset = 0,
            columns = ['*'],
            orderBy = 'rank'
        } = options;
        
        // Tokenize and prepare query
        const tokens = this._tokenize(query);
        const matchQuery = tokens.join(' OR ');
        
        let sql = `
            SELECT ${columns.join(', ')}, 
                   bm25(${ftsTable}) as rank,
                   highlight(${ftsTable}, 0, '<mark>', '</mark>') as title_highlight,
                   highlight(${ftsTable}, 1, '<mark>', '</mark>') as content_highlight
            FROM ${ftsTable}
            WHERE ${ftsTable} MATCH '${matchQuery.replace(/'/g, "''")}'
        `;
        
        if (orderBy === 'rank') {
            sql += ` ORDER BY rank ASC`;
        }
        
        sql += ` LIMIT ${limit} OFFSET ${offset}`;
        
        return this.db.execute(sql);
    }
    
    // Search with custom ranking
    searchWithWeights(ftsTable, query, weights = {}) {
        const tokens = this._tokenize(query);
        const matchQuery = tokens.join(' OR ');
        
        // Build weighted query
        const weightedQuery = tokens.map(token => {
            const parts = [];
            for (const [column, weight] of Object.entries(weights)) {
                parts.push(`${column}:${token}^${weight}`);
            }
            return parts.join(' OR ');
        }).join(' AND ');
        
        return this.db.execute(`
            SELECT *, bm25(${ftsTable}) as rank
            FROM ${ftsTable}
            WHERE ${ftsTable} MATCH '${weightedQuery.replace(/'/g, "''")}'
            ORDER BY rank ASC
        `);
    }
    
    // Highlight search terms
    highlight(ftsTable, query, column, openTag = '<mark>', closeTag = '</mark>') {
        const tokens = this._tokenize(query);
        
        return this.db.execute(`
            SELECT highlight(${ftsTable}, ${column}, '${openTag}', '${closeTag}') as highlighted
            FROM ${ftsTable}
            WHERE ${ftsTable} MATCH '${tokens.join(' OR ').replace(/'/g, "''")}'
            LIMIT 1
        `).rows[0]?.highlighted || '';
    }
    
    // Suggest search terms
    suggest(partial, limit = 5) {
        const tokens = this._tokenize(partial);
        const lastToken = tokens[tokens.length - 1];
        
        if (!lastToken || lastToken.length < 2) return [];
        
        return this.db.execute(`
            SELECT DISTINCT term
            FROM ${this.tablePrefix}terms
            WHERE term LIKE '${lastToken}%'
            ORDER BY frequency DESC
            LIMIT ${limit}
        `).rows.map(r => r.term);
    }
    
    // Tokenize query
    _tokenize(query) {
        if (!query) return [];
        
        // Clean and split
        const words = query.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 1);
        
        // Remove stop words and stem
        return words
            .filter(w => !this.stopWords.has(w))
            .map(w => this.stemmer.stem(w));
    }
    
    // Delete document
    delete(ftsTable, rowid) {
        return this.db.execute(
            `DELETE FROM ${ftsTable} WHERE rowid = ?`,
            [rowid]
        );
    }
    
    // Optimize FTS index
    optimize(ftsTable) {
        return this.db.execute(`INSERT INTO ${ftsTable}(${ftsTable}) VALUES('optimize')`);
    }
    
    // Get FTS info
    info(ftsTable) {
        return this.db.execute(`
            SELECT * FROM ${ftsTable} WHERE ${ftsTable} = 'info'
        `);
    }
    
    // Get term counts
    getTermCounts(ftsTable) {
        return this.db.execute(`
            SELECT term, count(*) as frequency
            FROM ${ftsTable}_term
            GROUP BY term
            ORDER BY frequency DESC
            LIMIT 100
        `);
    }
}

// Simple Porter stemmer implementation
class SimpleStemmer {
    stem(word) {
        if (word.length < 3) return word;
        
        // Very basic stemming
        const suffixes = ['ing', 'ed', 's', 'es', 'ly', 'er', 'est'];
        
        for (const suffix of suffixes) {
            if (word.endsWith(suffix) && word.length > suffix.length + 2) {
                return word.slice(0, -suffix.length);
            }
        }
        
        return word;
    }
}

// Export
module.exports = FullTextSearch;
