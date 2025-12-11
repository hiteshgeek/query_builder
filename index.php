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
                <button class="btn btn-secondary" id="btn-clear">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                    Clear
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
            <!-- Sidebar - Tables & Columns -->
            <aside class="sidebar">
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

            <!-- Main Content -->
            <main class="main-content">
                <!-- Query Builder Canvas -->
                <div class="builder-panel">
                    <div class="panel-header">
                        <h3>Query Builder</h3>
                        <div class="panel-tabs">
                            <button class="tab active" data-tab="visual">Visual</button>
                            <button class="tab" data-tab="sql">SQL</button>
                        </div>
                    </div>

                    <!-- Visual Builder -->
                    <div class="panel-content tab-content active" id="tab-visual">
                        <!-- Selected Tables -->
                        <div class="builder-section">
                            <div class="section-header">
                                <span>SELECT</span>
                            </div>
                            <div class="selected-tables" id="selected-tables">
                                <div class="placeholder">Drag tables here or click to add</div>
                            </div>
                        </div>

                        <!-- Joins -->
                        <div class="builder-section">
                            <div class="section-header">
                                <span>JOIN</span>
                                <button class="btn-sm" id="btn-add-join">+ Add Join</button>
                            </div>
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
                            <div class="groupby-container" id="groupby-container">
                                <select id="groupby-select" multiple></select>
                            </div>
                        </div>

                        <!-- Order By -->
                        <div class="builder-section">
                            <div class="section-header">
                                <span>ORDER BY</span>
                                <button class="btn-sm" id="btn-add-orderby">+ Add</button>
                            </div>
                            <div class="orderby-container" id="orderby-container"></div>
                        </div>

                        <!-- Limit -->
                        <div class="builder-section inline">
                            <div class="section-header">
                                <span>LIMIT</span>
                            </div>
                            <input type="number" id="limit-input" placeholder="No limit" min="0">
                            <span class="section-header">OFFSET</span>
                            <input type="number" id="offset-input" placeholder="0" min="0">
                        </div>
                    </div>

                    <!-- SQL Editor -->
                    <div class="panel-content tab-content" id="tab-sql">
                        <div class="sql-editor-container">
                            <pre id="sql-preview"><code class="language-sql">SELECT * FROM table_name;</code></pre>
                            <textarea id="sql-editor" placeholder="Write your SQL query here..."></textarea>
                        </div>
                    </div>
                </div>

                <!-- Results Panel -->
                <div class="results-panel">
                    <div class="panel-header">
                        <h3>Results</h3>
                        <div class="results-meta">
                            <span id="results-count"></span>
                            <span id="results-time"></span>
                        </div>
                        <div class="panel-tabs">
                            <button class="tab active" data-tab="results">Data</button>
                            <button class="tab" data-tab="explain">Explain</button>
                        </div>
                    </div>
                    <div class="panel-content tab-content active" id="tab-results">
                        <div class="results-table-container">
                            <table class="results-table" id="results-table">
                                <thead></thead>
                                <tbody></tbody>
                            </table>
                            <div class="no-results" id="no-results">
                                Run a query to see results
                            </div>
                        </div>
                    </div>
                    <div class="panel-content tab-content" id="tab-explain">
                        <div class="explain-container" id="explain-container">
                            <div class="no-results">Run a query with EXPLAIN to see analysis</div>
                        </div>
                    </div>
                </div>
            </main>
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
