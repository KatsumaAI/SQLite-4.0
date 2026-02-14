/// <reference types="node" />

declare module 'sqlite4' {
    import { EventEmitter } from 'events';
    
    // Options
    interface SQLite4Options {
        dbPath?: string;
        key?: string;
        memory?: boolean;
        readonly?: boolean;
        timeout?: number;
    }
    
    interface ExecuteResult {
        success: boolean;
        rows?: any[];
        rowCount?: number;
        columns?: string[];
        error?: string;
        lastInsertId?: number;
        changes?: number;
    }
    
    interface QueryResult {
        success: boolean;
        rows: any[];
        rowCount: number;
        columns: string[];
    }
    
    interface ConnectionOptions {
        host?: string;
        port?: number;
        username?: string;
        password?: string;
        tls?: boolean;
        timeout?: number;
    }
    
    // Main class
    class SQLite4 {
        constructor(options?: SQLite4Options);
        
        execute(sql: string, params?: any[]): ExecuteResult;
        executeAsync(sql: string, params?: any[]): Promise<ExecuteResult>;
        query(sql: string, params?: any[]): QueryResult;
        all(sql: string, params?: any[]): any[];
        get(sql: string, params?: any[]): any;
        run(sql: string, params?: any[]): { lastInsertId: number; changes: number };
        prepare(sql: string): Statement;
        
        // Transaction support
        begin(): boolean;
        commit(): boolean;
        rollback(): boolean;
        inTransaction: boolean;
        
        // Schema
        createTable(name: string, columns: string): ExecuteResult;
        dropTable(name: string): ExecuteResult;
        tableExists(name: string): boolean;
        
        // Utility
        backup(destination: string, options?: BackupOptions): Promise<ExecuteResult>;
        close(): void;
        
        // Properties
        readonly path: string;
        readonly inMemory: boolean;
        readonly closed: boolean;
    }
    
    // Prepared statement
    class Statement {
        bind(...params: any[]): this;
        run(...params: any[]): { lastInsertId: number; changes: number };
        get(...params: any[]): any;
        all(...params: any[]): any[];
        iterate(...params: any[]): Iterable<any>;
        reset(): this;
        finalize(): void;
    }
    
    // Query Builder
    class QueryBuilder {
        constructor(db: SQLite4);
        
        select(...columns: string[]): QueryBuilder;
        distinct(): QueryBuilder;
        from(table: string): QueryBuilder;
        join(table: string, condition: string, type?: string): QueryBuilder;
        leftJoin(table: string, condition: string): QueryBuilder;
        rightJoin(table: string, condition: string): QueryBuilder;
        where(column: string, operator: string | any, value?: any): QueryBuilder;
        orWhere(column: string, operator: string | any, value?: any): QueryBuilder;
        whereIn(column: string, values: any[]): QueryBuilder;
        whereNull(column: string): QueryBuilder;
        whereNotNull(column: string): QueryBuilder;
        whereBetween(column: string, start: any, end: any): QueryBuilder;
        groupBy(...columns: string[]): QueryBuilder;
        having(column: string, operator: string, value: any): QueryBuilder;
        orderBy(column: string, direction?: 'ASC' | 'DESC'): QueryBuilder;
        limit(value: number): QueryBuilder;
        offset(value: number): QueryBuilder;
        set(data: object): QueryBuilder;
        values(data: object | object[]): QueryBuilder;
        returning(...columns: string[]): QueryBuilder;
        
        toSQL(): { sql: string; params: any[] };
        execute(): Promise<QueryResult>;
        first(): Promise<any>;
        all(): Promise<any[]>;
        count(): Promise<number>;
        
        clone(): QueryBuilder;
        reset(): QueryBuilder;
    }
    
    // Schema Builder
    class SchemaBuilder {
        constructor(db: SQLite4);
        
        create(table: string, callback?: (table: TableBuilder) => void): this;
        ifNotExists(): this;
        temporary(): this;
        
        column(name: string, type?: string): TableBuilder;
        increments(name?: string): TableBuilder;
        string(name: string, length?: number): TableBuilder;
        text(name: string): TableBuilder;
        integer(name: string): TableBuilder;
        bigInteger(name: string): TableBuilder;
        float(name: string): TableBuilder;
        double(name: string): TableBuilder;
        boolean(name: string): TableBuilder;
        date(name: string): TableBuilder;
        datetime(name: string): TableBuilder;
        timestamp(name: string): TableBuilder;
        json(name: string): TableBuilder;
        blob(name: string): TableBuilder;
        
        index(columns: string[], name?: string): this;
        uniqueIndex(columns: string[], name?: string): this;
        foreignKey(column: string, references: { table: string; column: string }, onDelete?: string, onUpdate?: string): this;
        
        toSQL(): string;
        execute(): ExecuteResult;
        
        drop(table: string): ExecuteResult;
        rename(from: string, to: string): ExecuteResult;
        addColumn(table: string, name: string, type: string): ExecuteResult;
        dropColumn(table: string, column: string): ExecuteResult;
        addIndex(table: string, columns: string[], unique?: boolean): ExecuteResult;
        dropIndex(name: string): ExecuteResult;
    }
    
    // Table Builder
    interface TableBuilder {
        primaryKey(): this;
        autoIncrement(): this;
        notNull(): this;
        unique(): this;
        default(value: any): this;
        references(table: string, column?: string): this;
    }
    
    // Migration System
    class Migration {
        constructor(db: SQLite4, options?: MigrationOptions);
        
        create(name: string, upSQL: string, downSQL: string): { filename: string; filepath: string };
        getPending(): string[];
        getExecuted(): Array<{ id: number; name: string; batch: number; executed_at: string }>;
        migrate(options?: MigrateOptions): Promise<Array<{ file: string; success: boolean; error?: string }>>;
        rollback(): Promise<Array<{ file: string; success: boolean; error?: string }>>;
        fresh(): Promise<Array<{ file: string; success: boolean; error?: string }>>;
        getStatus(): { executed: number; pending: number; currentBatch: number | null; lastExecuted: string | null };
    }
    
    interface MigrationOptions {
        table?: string;
        dir?: string;
    }
    
    interface MigrateOptions {
        direction?: 'up' | 'down';
        batch?: number;
    }
    
    // Connection Pool
    class ConnectionPool extends EventEmitter {
        constructor(options?: PoolOptions);
        initialize(): Promise<void>;
        acquire(): Promise<any>;
        release(connection: any): void;
        drain(): Promise<void>;
        getStatus(): { available: number; allocated: number; pending: number; min: number; max: number; total: number };
    }
    
    interface PoolOptions {
        min?: number;
        max?: number;
        acquireTimeout?: number;
        idleTimeout?: number;
        reapInterval?: number;
        creator?: () => Promise<any>;
        validator?: (connection: any) => Promise<boolean>;
        destructor?: (connection: any) => Promise<void>;
    }
    
    // Events
    class DatabaseEvents extends EventEmitter {
        constructor(db: SQLite4);
        
        emitQuery(sql: string, params: any[], result: ExecuteResult, duration: number): void;
        emitConnect(connection: any): void;
        emitDisconnect(connection: any): void;
        emitTransactionBegin(id: string): void;
        emitTransactionCommit(id: string, duration: number): void;
        emitTransactionRollback(id: string, duration: number): void;
        emitTableCreate(table: string): void;
        emitTableDrop(table: string): void;
        emitRowInsert(table: string, row: any): void;
        emitRowUpdate(table: string, row: any, changes: any): void;
        emitRowDelete(table: string, row: any): void;
        emitAuthSuccess(user: string): void;
        emitAuthFailure(user: string, reason: string): void;
        emitRateLimit(ip: string, endpoint: string): void;
        
        middleware(): (req: any, res: any, next: any) => void;
        setupFileLogging(filepath: string): any;
        getStats(): any;
    }
    
    // SQL Parser
    class SQLParser {
        constructor(options?: ParserOptions);
        parse(sql: string): ParseResult;
        validate(parsed: any): { valid: boolean; warnings: string[]; errors: string[] };
        optimize(sql: string): { original: string; optimized: string; reason: string; parsed: any };
    }
    
    interface ParserOptions {
        strict?: boolean;
        trace?: boolean;
    }
    
    interface ParseResult {
        type: string;
        valid: boolean;
        statement: string;
        components: any;
        warnings?: string[];
        errors?: string[];
    }
    
    // Backup Options
    interface BackupOptions {
        compress?: boolean;
        encrypt?: boolean;
        password?: string;
    }
    
    // Default export
    export default SQLite4;
    
    // Named exports
    export { SQLite4, Statement, QueryBuilder, SchemaBuilder, TableBuilder, Migration, ConnectionPool, DatabaseEvents, SQLParser };
}
