<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQLite-4.0 Admin Panel</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #0f766e;
            --primary-light: #14b8a6;
            --accent: #2dd4bf;
            --bg: #0a0f1a;
            --bg-card: #111827;
            --bg-sidebar: #0d1117;
            --text: #f1f5f9;
            --text-secondary: #94a3b8;
            --text-muted: #64748b;
            --border: #1e293b;
            --success: #10b981;
            --warning: #f59e0b;
            --error: #ef4444;
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Inter', sans-serif;
            background: var(--bg);
            color: var(--text);
            display: flex;
            min-height: 100vh;
        }
        
        .sidebar {
            width: 260px;
            background: var(--bg-sidebar);
            border-right: 1px solid var(--border);
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            display: flex;
            flex-direction: column;
        }
        
        .sidebar-header {
            padding: 1.5rem;
            border-bottom: 1px solid var(--border);
        }
        
        .sidebar-logo {
            font-size: 1.25rem;
            font-weight: 700;
            background: linear-gradient(135deg, var(--accent), var(--primary-light));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .sidebar-subtitle {
            font-size: 0.75rem;
            color: var(--text-muted);
        }
        
        .sidebar-nav {
            flex: 1;
            padding: 1rem;
            overflow-y: auto;
        }
        
        .nav-section {
            margin-bottom: 1.5rem;
        }
        
        .nav-section-title {
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--text-muted);
            padding: 0.5rem;
            letter-spacing: 0.05em;
        }
        
        .nav-item {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.625rem 0.75rem;
            border-radius: 8px;
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.2s;
            margin-bottom: 0.25rem;
        }
        
        .nav-item:hover {
            background: var(--bg-card);
            color: var(--text);
        }
        
        .nav-item.active {
            background: var(--primary);
            color: white;
        }
        
        .nav-item svg {
            width: 20px;
            height: 20px;
        }
        
        .main {
            flex: 1;
            margin-left: 260px;
        }
        
        .header {
            background: rgba(10, 15, 26, 0.9);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid var(--border);
            padding: 1rem 2rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: sticky;
            top: 0;
        }
        
        .header-title {
            font-size: 1.25rem;
            font-weight: 600;
        }
        
        .header-actions {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        
        .content {
            padding: 2rem;
        }
        
        .page {
            display: none;
        }
        
        .page.active {
            display: block;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        
        .stat-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 1.5rem;
        }
        
        .stat-value {
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 0.25rem;
        }
        
        .stat-label {
            font-size: 0.875rem;
            color: var(--text-muted);
        }
        
        .card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
        }
        
        .card-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 1rem;
        }
        
        .card-title {
            font-size: 1.125rem;
            font-weight: 600;
        }
        
        .grid-2 {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1.5rem;
        }
        
        .query-editor {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            overflow: hidden;
        }
        
        .query-toolbar {
            display: flex;
            gap: 0.5rem;
            padding: 0.75rem 1rem;
            background: var(--bg-sidebar);
            border-bottom: 1px solid var(--border);
        }
        
        .query-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
        }
        
        .query-btn.secondary {
            background: var(--bg-card);
            color: var(--text);
            border: 1px solid var(--border);
        }
        
        .query-textarea {
            width: 100%;
            min-height: 200px;
            padding: 1rem;
            background: none;
            border: none;
            color: var(--text);
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.9rem;
            line-height: 1.6;
            resize: vertical;
        }
        
        .data-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .data-table th,
        .data-table td {
            padding: 1rem;
            text-align: left;
            border-bottom: 1px solid var(--border);
        }
        
        .data-table th {
            font-weight: 600;
            color: var(--text-muted);
            font-size: 0.8rem;
            text-transform: uppercase;
        }
        
        .data-table tr:hover td {
            background: var(--bg-sidebar);
        }
        
        .badge {
            display: inline-flex;
            padding: 0.25rem 0.75rem;
            border-radius: 100px;
            font-size: 0.75rem;
            font-weight: 500;
        }
        
        .badge-success {
            background: rgba(16, 185, 129, 0.2);
            color: var(--success);
        }
        
        .badge-warning {
            background: rgba(245, 158, 11, 0.2);
            color: var(--warning);
        }
        
        .badge-error {
            background: rgba(239, 68, 68, 0.2);
            color: var(--error);
        }
        
        .chart-container {
            height: 200px;
            background: var(--bg-sidebar);
            border-radius: 12px;
            display: flex;
            align-items: flex-end;
            padding: 1rem;
            gap: 0.5rem;
        }
        
        .chart-bar {
            flex: 1;
            background: linear-gradient(to top, var(--primary), var(--accent));
            border-radius: 4px 4px 0 0;
        }
        
        .log-viewer {
            background: var(--bg-sidebar);
            border-radius: 8px;
            padding: 1rem;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.8rem;
            max-height: 300px;
            overflow: auto;
        }
        
        .log-entry {
            padding: 0.25rem 0;
            border-bottom: 1px solid var(--border);
        }
        
        .log-time {
            color: var(--text-muted);
        }
        
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            border: none;
        }
        
        .btn-primary {
            background: var(--primary);
            color: white;
        }
        
        .btn-secondary {
            background: var(--bg-card);
            color: var(--text);
            border: 1px solid var(--border);
        }
        
        .form-group {
            margin-bottom: 1.25rem;
        }
        
        .form-label {
            display: block;
            font-size: 0.875rem;
            font-weight: 500;
            margin-bottom: 0.5rem;
        }
        
        .form-input {
            width: 100%;
            padding: 0.75rem 1rem;
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            color: var(--text);
        }
        
        .toggle {
            position: relative;
            width: 48px;
            height: 26px;
            background: var(--bg-sidebar);
            border-radius: 13px;
            cursor: pointer;
        }
        
        .toggle.active {
            background: var(--primary);
        }
        
        .toggle::after {
            content: '';
            position: absolute;
            top: 3px;
            left: 3px;
            width: 20px;
            height: 20px;
            background: white;
            border-radius: 50%;
        }
        
        .toggle.active::after {
            transform: translateX(22px);
        }
        
        @media (max-width: 1024px) {
            .sidebar { width: 80px; }
            .sidebar-logo { display: none; }
            .nav-section-title { display: none; }
            .nav-item span { display: none; }
            .nav-item { justify-content: center; }
            .main { margin-left: 80px; }
            .grid-2 { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <aside class="sidebar">
        <div class="sidebar-header">
            <div class="sidebar-logo">SQLite-4.0</div>
            <div class="sidebar-subtitle">Admin Panel</div>
        </div>
        <nav class="sidebar-nav">
            <div class="nav-section">
                <div class="nav-section-title">Overview</div>
                <div class="nav-item active" data-page="dashboard">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/>
                        <rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>
                    </svg>
                    <span>Dashboard</span>
                </div>
                <div class="nav-item" data-page="query">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                    </svg>
                    <span>Query Editor</span>
                </div>
            </div>
            <div class="nav-section">
                <div class="nav-section-title">Management</div>
                <div class="nav-item" data-page="tables">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <path d="M3 9h18"/><path d="M9 21V9"/>
                    </svg>
                    <span>Tables</span>
                </div>
                <div class="nav-item" data-page="users">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                    </svg>
                    <span>Users</span>
                </div>
                <div class="nav-item" data-page="security">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="11" rx="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <span>Security</span>
                </div>
            </div>
            <div class="nav-section">
                <div class="nav-section-title">System</div>
                <div class="nav-item" data-page="backup">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8"/>
                    </svg>
                    <span>Backups</span>
                </div>
                <div class="nav-item" data-page="replication">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                        <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                    </svg>
                    <span>Replication</span>
                </div>
                <div class="nav-item" data-page="logs">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span>Logs</span>
                </div>
            </div>
        </nav>
    </aside>
    
    <main class="main">
        <header class="header">
            <h1 class="header-title" id="pageTitle">Dashboard</h1>
            <div class="header-actions">
                <span style="color: var(--text-muted);">Admin</span>
            </div>
        </header>
        <div class="content">
            <div class="page active" id="dashboard">
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">12</div>
                        <div class="stat-label">Total Tables</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">847</div>
                        <div class="stat-label">Total Users</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">99.9%</div>
                        <div class="stat-label">Uptime</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">2.4 GB</div>
                        <div class="stat-label">Database Size</div>
                    </div>
                </div>
                <div class="grid-2">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Query Performance (24h)</h3>
                        </div>
                        <div class="chart-container">
                            <div class="chart-bar" style="height: 40%"></div>
                            <div class="chart-bar" style="height: 65%"></div>
                            <div class="chart-bar" style="height: 55%"></div>
                            <div class="chart-bar" style="height: 80%"></div>
                            <div class="chart-bar" style="height: 70%"></div>
                            <div class="chart-bar" style="height: 90%"></div>
                            <div class="chart-bar" style="height: 75%"></div>
                            <div class="chart-bar" style="height: 85%"></div>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Recent Activity</h3>
                        </div>
                        <div class="log-viewer">
                            <div class="log-entry">
                                <span class="log-time">10:45:23</span>
                                User admin@sqlite4.com logged in
                            </div>
                            <div class="log-entry">
                                <span class="log-time">10:42:15</span>
                                Backup completed successfully
                            </div>
                            <div class="log-entry">
                                <span class="log-time">10:38:02</span>
                                2FA enabled for admin
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="page" id="query">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">SQL Query Editor</h3>
                    </div>
                    <div class="query-editor">
                        <div class="query-toolbar">
                            <button class="query-btn">Run Query</button>
                            <button class="query-btn secondary">Explain</button>
                            <button class="query-btn secondary">Clear</button>
                        </div>
                        <textarea class="query-textarea" id="queryInput" placeholder="Enter SQL query...">SELECT * FROM users WHERE status = 'active' LIMIT 100;</textarea>
                    </div>
                </div>
            </div>
            
            <div class="page" id="tables">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Database Tables</h3>
                        <button class="btn btn-primary">+ New Table</button>
                    </div>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Rows</th>
                                <th>Size</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>users</td>
                                <td>847</td>
                                <td>256 KB</td>
                                <td><span class="badge badge-success">Active</span></td>
                            </tr>
                            <tr>
                                <td>products</td>
                                <td>1,234</td>
                                <td>512 KB</td>
                                <td><span class="badge badge-success">Active</span></td>
                            </tr>
                            <tr>
                                <td>orders</td>
                                <td>5,678</td>
                                <td>1.2 MB</td>
                                <td><span class="badge badge-success">Active</span></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="page" id="users">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">User Management</h3>
                        <button class="btn btn-primary">+ Add User</button>
                    </div>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Role</th>
                                <th>2FA</th>
                                <th>Last Login</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>admin@sqlite4.com</td>
                                <td>Admin</td>
                                <td><span class="badge badge-success">Enabled</span></td>
                                <td>Just now</td>
                                <td><span class="badge badge-success">Active</span></td>
                            </tr>
                            <tr>
                                <td>user@sqlite4.com</td>
                                <td>Operator</td>
                                <td><span class="badge badge-warning">Pending</span></td>
                                <td>2 hours ago</td>
                                <td><span class="badge badge-success">Active</span></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="page" id="security">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Security Settings</h3>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Auth0 Domain</label>
                        <input type="text" class="form-input" placeholder="your-tenant.auth0.com">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Discord OAuth</label>
                        <input type="text" class="form-input" placeholder="Discord Client ID">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Two-Factor Authentication</label>
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <span>Enable TOTP 2FA for all users</span>
                            <div class="toggle active"></div>
                        </div>
                    </div>
                    <button class="btn btn-primary">Save Settings</button>
                </div>
            </div>
        </div>
    </main>
    
    <script>
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                const page = item.dataset.page;
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                document.getElementById(page).classList.add('active');
                document.getElementById('pageTitle').textContent = 
                    item.querySelector('span').textContent;
            });
        });
    </script>
</body>
</html>