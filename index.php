<?php
require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/includes/functions.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
$dotenv->load();

$basePath = get_base_path();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Query Builder</title>
    <link rel="stylesheet" href="<?= asset('query-builder.css') ?>">
    <link rel="stylesheet" href="<?= asset('main.css') ?>">
    <!-- Prevent FOUC by setting theme before CSS loads -->
    <script>
        (function() {
            const saved = localStorage.getItem('qb-theme');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            let theme = saved || 'system';
            if (theme === 'system') theme = prefersDark ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', theme);
        })();
    </script>
</head>
<body>
    <div class="app">
        <!-- Header -->
        <header class="app-header">
            <div class="app-logo">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 6h16M4 12h16M4 18h10"/>
                </svg>
                <span>Query Builder</span>
            </div>
            <div class="app-actions">
                <!-- Saved Queries Toggle -->
                <button class="btn-icon" id="btn-toggle-saved" title="Saved Queries">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                    </svg>
                </button>
                <!-- History Toggle -->
                <button class="btn-icon" id="btn-toggle-history" title="Query History">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                </button>
                <!-- Theme Toggle -->
                <div class="theme-toggle">
                    <button class="theme-btn" data-theme="light" title="Light Mode">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="5"/>
                            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                        </svg>
                    </button>
                    <button class="theme-btn" data-theme="dark" title="Dark Mode">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
                        </svg>
                    </button>
                    <button class="theme-btn" data-theme="system" title="System Theme">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                            <line x1="8" y1="21" x2="16" y2="21"/>
                            <line x1="12" y1="17" x2="12" y2="21"/>
                        </svg>
                    </button>
                </div>
                <button class="btn btn-secondary" id="btn-clear">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                    Clear
                </button>
                <button class="btn btn-secondary" id="btn-save-query">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    Save
                </button>
                <button class="btn btn-primary" id="btn-run">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Run Query
                </button>
            </div>
        </header>

        <div class="app-body">
            <!-- History Sidebar -->
            <aside class="history-sidebar" id="history-sidebar">
                <div class="history-header">
                    <h3>Query History</h3>
                    <div class="history-actions">
                        <button class="btn-icon btn-sm" id="btn-clear-history" title="Clear History">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                            </svg>
                        </button>
                        <button class="btn-icon btn-sm" id="btn-close-history" title="Close">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="history-search">
                    <input type="text" id="history-search" placeholder="Search history...">
                </div>
                <div class="history-list" id="history-list">
                    <div class="placeholder">No queries in history</div>
                </div>
            </aside>

            <!-- Saved Queries Sidebar -->
            <aside class="saved-queries-sidebar" id="saved-queries-sidebar">
                <div class="saved-queries-sidebar-header">
                    <h3>Saved Queries</h3>
                    <button class="btn-icon btn-sm" id="btn-close-saved" title="Close">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <div class="saved-queries-panel" id="saved-queries-panel">
                    <!-- Populated by SavedQueries.js -->
                </div>
            </aside>

            <!-- Sidebar - Tables & Columns -->
            <aside class="sidebar" id="sidebar">
                <div class="sidebar-header">
                    <h3>Tables</h3>
                    <button class="btn-icon" id="btn-refresh-schema" title="Refresh Schema">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M23 4v6h-6M1 20v-6h6"/>
                            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                        </svg>
                    </button>
                </div>
                <div class="sidebar-search">
                    <input type="text" id="table-search" placeholder="Search tables...">
                </div>
                <div class="sidebar-content" id="tables-list">
                    <div class="loading">Loading schema...</div>
                </div>
            </aside>

            <!-- Sidebar Resizer -->
            <div class="resizer resizer-horizontal" id="sidebar-resizer"></div>

            <!-- Main Content -->
            <main class="main-content">
                <!-- Query Type Tabs -->
                <div class="query-type-tabs">
                    <button class="query-type-tab active" data-type="select">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="21 8 21 21 3 21 3 8"/>
                            <rect x="1" y="3" width="22" height="5"/>
                        </svg>
                        SELECT
                    </button>
                    <button class="query-type-tab" data-type="insert">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        INSERT
                    </button>
                    <button class="query-type-tab" data-type="update">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        UPDATE
                    </button>
                    <button class="query-type-tab" data-type="delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                        DELETE
                    </button>
                    <button class="query-type-tab" data-type="alter">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 3h7a2 2 0 012 2v14a2 2 0 01-2 2h-7m0-18H5a2 2 0 00-2 2v14a2 2 0 002 2h7m0-18v18"/>
                            <path d="M9 12h6M12 9v6"/>
                        </svg>
                        ALTER
                    </button>
                    <span class="query-type-divider"></span>
                    <button class="query-type-tab" data-type="users">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                            <circle cx="9" cy="7" r="4"/>
                            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                            <path d="M16 3.13a4 4 0 010 7.75"/>
                        </svg>
                        USERS
                    </button>
                </div>

                <!-- SELECT Builder Panel -->
                <div class="builder-panel query-panel active" data-panel="select">
                    <div class="panel-header">
                        <h3>SELECT Query</h3>
                    </div>

                    <!-- Visual Builder -->
                    <div class="panel-content" id="tab-visual">
                        <!-- Selected Tables -->
                        <div class="builder-section">
                            <div class="section-header">
                                <span>FROM</span>
                            </div>
                            <div class="selected-tables" id="selected-tables">
                                <div class="placeholder">Drag tables here or double-click from sidebar</div>
                            </div>
                            <div class="table-alias-hint">Tip: Click a table to set alias (for self-joins, add same table twice)</div>
                        </div>

                        <!-- Columns -->
                        <div class="builder-section">
                            <div class="section-header">
                                <span>COLUMNS</span>
                                <div class="select-actions">
                                    <button class="btn-sm" id="btn-select-all">All</button>
                                    <button class="btn-sm" id="btn-select-none">None</button>
                                </div>
                            </div>
                            <div class="columns-wrapper">
                                <div class="columns-selected" id="columns-selected">
                                    <span class="placeholder">Add tables to select columns</span>
                                </div>
                                <div class="columns-available" id="columns-available"></div>
                            </div>
                        </div>

                        <!-- Joins -->
                        <div class="builder-section">
                            <div class="section-header">
                                <span>JOIN</span>
                                <button class="btn-sm" id="btn-add-join">+ Add Join</button>
                            </div>
                            <div class="join-suggestions" id="join-suggestions"></div>
                            <div class="joins-container" id="joins-container"></div>
                        </div>

                        <!-- Where Conditions -->
                        <div class="builder-section">
                            <div class="section-header">
                                <span>WHERE</span>
                                <button class="btn-sm" id="btn-add-condition">+ Add Condition</button>
                            </div>
                            <div class="conditions-container" id="conditions-container"></div>
                        </div>

                        <!-- Group By -->
                        <div class="builder-section">
                            <div class="section-header">
                                <span>GROUP BY</span>
                            </div>
                            <div class="groupby-wrapper">
                                <div class="groupby-selected" id="groupby-selected">
                                    <span class="placeholder">Click columns to add</span>
                                </div>
                                <div class="groupby-available" id="groupby-available"></div>
                            </div>
                        </div>

                        <!-- Order By -->
                        <div class="builder-section">
                            <div class="section-header">
                                <span>ORDER BY</span>
                            </div>
                            <div class="orderby-wrapper">
                                <div class="orderby-selected" id="orderby-selected">
                                    <span class="placeholder">Click columns to add</span>
                                </div>
                                <div class="orderby-available" id="orderby-available"></div>
                            </div>
                        </div>

                        <!-- Limit -->
                        <div class="builder-section">
                            <div class="limit-offset-row">
                                <label class="limit-label">LIMIT</label>
                                <input type="number" id="limit-input" placeholder="No limit" min="0">
                                <label class="limit-label">OFFSET</label>
                                <input type="number" id="offset-input" placeholder="0" min="0">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- INSERT Builder Panel -->
                <div class="builder-panel query-panel" data-panel="insert">
                    <div class="panel-header">
                        <h3>INSERT Query</h3>
                        <div class="panel-actions">
                            <button class="btn-sm" id="btn-import-csv">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                                    <polyline points="17 8 12 3 7 8"/>
                                    <line x1="12" y1="3" x2="12" y2="15"/>
                                </svg>
                                Import CSV
                            </button>
                            <button class="btn-sm" id="btn-import-json">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                                    <polyline points="17 8 12 3 7 8"/>
                                    <line x1="12" y1="3" x2="12" y2="15"/>
                                </svg>
                                Import JSON
                            </button>
                        </div>
                    </div>
                    <div class="panel-content">
                        <!-- Table Selection (Drag & Drop) -->
                        <div class="builder-section">
                            <div class="section-header">
                                <span>INTO TABLE</span>
                            </div>
                            <div class="table-drop-zone" id="insert-table-drop">
                                <div class="placeholder">Drag a table here or double-click from sidebar</div>
                            </div>
                        </div>

                        <!-- Data Entry Form -->
                        <div class="builder-section insert-data-section">
                            <div class="section-header">
                                <span>DATA</span>
                                <button class="btn-sm" id="btn-add-insert-row">+ Add Row</button>
                            </div>
                            <div id="insert-form-container">
                                <div class="placeholder">Select a table to insert data</div>
                            </div>
                        </div>

                    </div>
                </div>

                <!-- UPDATE Builder Panel -->
                <div class="builder-panel query-panel" data-panel="update">
                    <div class="panel-header">
                        <h3>UPDATE Query</h3>
                        <button class="btn-sm" id="btn-preview-update">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                <circle cx="12" cy="12" r="3"/>
                            </svg>
                            Preview
                        </button>
                    </div>
                    <div class="panel-content">
                        <!-- Table Selection (Drag & Drop) -->
                        <div class="builder-section">
                            <div class="section-header">
                                <span>UPDATE TABLE</span>
                            </div>
                            <div class="table-drop-zone" id="update-table-drop">
                                <div class="placeholder">Drag a table here or double-click from sidebar</div>
                            </div>
                        </div>

                        <!-- SET Clause -->
                        <div class="builder-section">
                            <div class="section-header">
                                <span>SET</span>
                            </div>
                            <div id="update-set-container">
                                <div class="placeholder">Select a table to update</div>
                            </div>
                        </div>

                        <!-- WHERE Clause -->
                        <div class="builder-section">
                            <div class="section-header">
                                <span>WHERE</span>
                                <button class="btn-sm" id="btn-add-update-condition">+ Add Condition</button>
                            </div>
                            <div id="update-conditions-container"></div>
                        </div>

                    </div>
                </div>

                <!-- DELETE Builder Panel -->
                <div class="builder-panel query-panel" data-panel="delete">
                    <div class="panel-header">
                        <h3>DELETE Query</h3>
                        <button class="btn-sm" id="btn-preview-delete">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                <circle cx="12" cy="12" r="3"/>
                            </svg>
                            Preview
                        </button>
                    </div>
                    <div class="panel-content">
                        <!-- Table Selection (Drag & Drop) -->
                        <div class="builder-section">
                            <div class="section-header">
                                <span>FROM TABLE</span>
                            </div>
                            <div class="table-drop-zone" id="delete-table-drop">
                                <div class="placeholder">Drag a table here or double-click from sidebar</div>
                            </div>
                        </div>

                        <!-- WHERE Clause -->
                        <div class="builder-section">
                            <div class="section-header">
                                <span>WHERE</span>
                                <button class="btn-sm" id="btn-add-delete-condition">+ Add Condition</button>
                            </div>
                            <div id="delete-conditions-container"></div>
                        </div>

                    </div>
                </div>

                <!-- ALTER Builder Panel -->
                <div class="builder-panel query-panel" data-panel="alter">
                    <div class="panel-header">
                        <h3>ALTER Table</h3>
                    </div>
                    <div class="panel-content alter-panel-content">
                        <!-- Table Selection (Drag & Drop) -->
                        <div class="builder-section alter-table-section">
                            <div class="section-header">
                                <span>ALTER TABLE</span>
                            </div>
                            <div class="table-drop-zone" id="alter-table-drop">
                                <div class="placeholder">Drag a table here or double-click from sidebar</div>
                            </div>
                        </div>

                        <!-- Section Tabs -->
                        <div class="alter-section-tabs">
                            <button class="alter-section-tab active" data-section="columns">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="4" y1="9" x2="20" y2="9"/>
                                    <line x1="4" y1="15" x2="20" y2="15"/>
                                    <line x1="10" y1="3" x2="8" y2="21"/>
                                    <line x1="16" y1="3" x2="14" y2="21"/>
                                </svg>
                                Columns
                            </button>
                            <button class="alter-section-tab" data-section="indexes">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                                    <polyline points="22 4 12 14.01 9 11.01"/>
                                </svg>
                                Indexes
                            </button>
                            <button class="alter-section-tab" data-section="foreign-keys">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                                </svg>
                                Foreign Keys
                            </button>
                            <button class="alter-section-tab" data-section="properties">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="3"/>
                                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                                </svg>
                                Properties
                            </button>
                        </div>

                        <!-- Columns Section -->
                        <div class="alter-section-panel active" data-section="columns">
                            <div class="section-header">
                                <span>COLUMNS</span>
                                <button class="btn-sm" id="btn-add-column">+ Add Column</button>
                            </div>
                            <div id="alter-columns-container">
                                <div class="placeholder">Select a table to modify columns</div>
                            </div>
                        </div>

                        <!-- Indexes Section -->
                        <div class="alter-section-panel" data-section="indexes">
                            <div class="section-header">
                                <span>INDEXES</span>
                                <button class="btn-sm" id="btn-add-index">+ Add Index</button>
                            </div>
                            <div id="alter-indexes-container">
                                <div class="placeholder">Select a table to manage indexes</div>
                            </div>
                        </div>

                        <!-- Foreign Keys Section -->
                        <div class="alter-section-panel" data-section="foreign-keys">
                            <div class="section-header">
                                <span>FOREIGN KEYS</span>
                                <button class="btn-sm" id="btn-add-fk">+ Add Foreign Key</button>
                            </div>
                            <div id="alter-fk-container">
                                <div class="placeholder">Select a table to manage foreign keys</div>
                            </div>
                        </div>

                        <!-- Properties Section -->
                        <div class="alter-section-panel" data-section="properties">
                            <div class="section-header">
                                <span>TABLE PROPERTIES</span>
                            </div>
                            <div id="alter-properties-container">
                                <div class="placeholder">Select a table to modify properties</div>
                            </div>
                        </div>

                        <!-- Operations Queue -->
                        <div class="builder-section operations-queue-section">
                            <div class="section-header">
                                <span>QUEUED OPERATIONS</span>
                            </div>
                            <div id="alter-operations-queue">
                                <div class="placeholder-sm">No operations queued</div>
                            </div>
                        </div>

                    </div>
                </div>

                <!-- USERS Management Panel -->
                <div class="builder-panel query-panel users-panel" data-panel="users">
                    <div class="panel-header">
                        <h3>MySQL User Management</h3>
                        <div class="panel-actions">
                            <button class="btn-sm" id="btn-refresh-users">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M23 4v6h-6M1 20v-6h6"/>
                                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                                </svg>
                                Refresh
                            </button>
                            <button class="btn-sm btn-primary-sm" id="btn-create-user">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                                    <circle cx="8.5" cy="7" r="4"/>
                                    <line x1="20" y1="8" x2="20" y2="14"/>
                                    <line x1="23" y1="11" x2="17" y2="11"/>
                                </svg>
                                Create User
                            </button>
                        </div>
                    </div>
                    <div class="panel-content users-panel-content">
                        <div class="users-layout">
                            <!-- Users List -->
                            <div class="users-list-section">
                                <div class="section-header">
                                    <span>USERS</span>
                                </div>
                                <div id="users-list-container">
                                    <div class="placeholder">Click "Refresh" to load users</div>
                                </div>
                            </div>

                            <!-- User Details & Permissions -->
                            <div class="user-details-section">
                                <!-- Sub-tabs for Details/Permissions -->
                                <div class="user-sub-tabs">
                                    <button class="user-sub-tab active" data-tab="details">Details</button>
                                    <button class="user-sub-tab" data-tab="permissions">Permissions</button>
                                </div>

                                <!-- Details Tab -->
                                <div class="user-sub-panel active" data-panel="details">
                                    <div id="user-details-container">
                                        <div class="placeholder">Select a user to view details</div>
                                    </div>
                                </div>

                                <!-- Permissions Tab -->
                                <div class="user-sub-panel" data-panel="permissions">
                                    <div class="permissions-actions">
                                        <button class="btn-sm" id="btn-apply-preset">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                            </svg>
                                            Presets
                                        </button>
                                        <button class="btn-sm" id="btn-custom-grant">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <line x1="12" y1="5" x2="12" y2="19"/>
                                                <line x1="5" y1="12" x2="19" y2="12"/>
                                            </svg>
                                            Grant
                                        </button>
                                        <button class="btn-sm btn-danger-sm" id="btn-revoke-all">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <line x1="18" y1="6" x2="6" y2="18"/>
                                                <line x1="6" y1="6" x2="18" y2="18"/>
                                            </svg>
                                            Revoke All
                                        </button>
                                    </div>
                                    <div id="permissions-container">
                                        <div class="placeholder">Select a user to manage permissions</div>
                                    </div>
                                    <div id="permission-form-container"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Form Container -->
                        <div id="user-form-container"></div>
                    </div>
                </div>

            </main>
        </div>

        <!-- Bottom Panel Resizer -->
        <div class="resizer resizer-vertical" id="bottom-resizer"></div>

        <!-- Bottom Panel (SQL Query + Results) -->
        <div class="bottom-panel" id="bottom-panel">
            <div class="bottom-panel-tabs">
                <button class="bottom-tab active" data-tab="sql-preview">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="16 18 22 12 16 6"/>
                        <polyline points="8 6 2 12 8 18"/>
                    </svg>
                    SQL Query
                </button>
                <button class="bottom-tab" data-tab="results">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <line x1="3" y1="9" x2="21" y2="9"/>
                        <line x1="9" y1="21" x2="9" y2="9"/>
                    </svg>
                    Results
                    <span class="results-badge" id="results-badge"></span>
                </button>
                <button class="bottom-tab" data-tab="explain">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    Explain
                </button>
                <div class="bottom-panel-actions">
                    <span class="results-meta">
                        <span id="results-count"></span>
                        <span id="results-time"></span>
                    </span>
                    <button class="btn-sm" id="btn-export-sql" title="Export SQL">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        SQL
                    </button>
                    <button class="btn-sm" id="btn-export-csv" title="Export CSV">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        CSV
                    </button>
                    <button class="btn-sm" id="btn-export-json" title="Export JSON">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        JSON
                    </button>
                    <button class="btn-sm" id="btn-copy-sql" title="Copy SQL">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                        </svg>
                        Copy
                    </button>
                </div>
            </div>

            <!-- SQL Preview Tab -->
            <div class="bottom-panel-content active" id="bottom-sql-preview">
                <div class="bottom-sql-content">
                    <div class="sql-preview-wrapper">
                        <pre id="sql-preview-bottom"><code class="language-sql">SELECT * FROM table_name;</code></pre>
                    </div>
                </div>
            </div>

            <!-- Results Tab -->
            <div class="bottom-panel-content" id="bottom-results">
                <div class="bottom-results-content">
                    <div class="results-table-wrapper">
                        <table class="results-table" id="results-table">
                            <thead></thead>
                            <tbody></tbody>
                        </table>
                        <div class="no-results" id="no-results">
                            Run a query to see results
                        </div>
                    </div>
                </div>
            </div>

            <!-- Explain Tab -->
            <div class="bottom-panel-content" id="bottom-explain">
                <div class="explain-container" id="explain-container">
                    <div class="no-results">Run a query with EXPLAIN to see analysis</div>
                </div>
            </div>
        </div>
    </div>

    <!-- Import Modal -->
    <div class="modal" id="import-modal">
        <div class="modal-backdrop"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="import-modal-title">Import Data</h3>
                <button class="btn-icon modal-close" id="btn-cancel-import">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                <div id="import-hint" class="import-hint"></div>
                <textarea id="import-data" class="import-textarea" placeholder="Paste your data here..."></textarea>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="btn-cancel-import-footer">Cancel</button>
                <button class="btn btn-primary" id="btn-do-import">Import</button>
            </div>
        </div>
    </div>

    <!-- Save Query Modal -->
    <div class="modal" id="save-query-modal">
        <div class="modal-backdrop"></div>
        <div class="modal-content modal-save-query">
            <div class="modal-header">
                <h3 class="modal-title">Save Query</h3>
                <button class="btn-icon modal-close" id="btn-cancel-save-query">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="save-query-title">Title <span class="required">*</span></label>
                    <input type="text" id="save-query-title" placeholder="e.g., Active users report" required>
                </div>
                <div class="form-group">
                    <label for="save-query-description">Description</label>
                    <textarea id="save-query-description" placeholder="Brief description of what this query does..." rows="2"></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="save-query-group">Group</label>
                        <input type="text" id="save-query-group" list="groups-datalist" placeholder="e.g., Reports">
                        <datalist id="groups-datalist"></datalist>
                    </div>
                    <div class="form-group form-group-favorite">
                        <label class="checkbox-label">
                            <input type="checkbox" id="save-query-favorite">
                            <span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                </svg>
                                Favorite
                            </span>
                        </label>
                    </div>
                </div>
                <div class="form-group">
                    <label for="save-query-tags">Tags</label>
                    <input type="text" id="save-query-tags" placeholder="e.g., users, analytics, daily (comma separated)">
                    <span class="form-hint" id="tags-hint">Separate multiple tags with commas</span>
                </div>
                <div class="form-group">
                    <label>SQL Preview</label>
                    <pre class="sql-preview-mini" id="save-query-sql-preview"><code class="language-sql"></code></pre>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="btn-cancel-save-query-footer">Cancel</button>
                <button class="btn btn-primary" id="btn-do-save-query">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    Save Query
                </button>
            </div>
        </div>
    </div>

    <script>
        window.APP_CONFIG = {
            basePath: '<?= $basePath ?>',
            apiBase: '<?= $basePath ?>/api'
        };
    </script>
    <script type="module" src="<?= asset('query-builder.js') ?>"></script>
    <script nomodule src="<?= asset('query-builder.js', 'nomodule') ?>"></script>
</body>
</html>
