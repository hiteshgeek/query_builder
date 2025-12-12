/**
 * Query Builder - Main Application
 */

import hljs from 'highlight.js/lib/core';
import sql from 'highlight.js/lib/languages/sql';
import ThemeManager from './ThemeManager.js';
import InsertBuilder from './InsertBuilder.js';
import UpdateBuilder from './UpdateBuilder.js';
import DeleteBuilder from './DeleteBuilder.js';
import AlterBuilder from './AlterBuilder.js';
import UserManager from './UserManager.js';
import PermissionManager from './PermissionManager.js';
import QueryHistory from './QueryHistory.js';
import QueryExport from './QueryExport.js';
import typeToConfirm from './TypeToConfirm.js';
import toast from './Toast.js';
import resizeManager from './ResizeManager.js';
import savedQueries from './SavedQueries.js';

hljs.registerLanguage('sql', sql);

// Initialize theme manager globally
const themeManager = new ThemeManager();

class QueryBuilder {
    constructor() {
        this.schema = null;
        this.selectedTables = []; // Array of { name, alias, colorIndex }
        this.selectedColumns = {}; // { tableKey: [columns] } - tableKey is alias or name
        this.joins = [];
        this.conditions = [];
        this.orderBy = [];
        this.groupBy = [];
        this.limit = null;
        this.offset = null;

        // Table colors for visual identification
        this.tableColors = [
            { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#2563eb' },   // Blue
            { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#059669' },   // Green
            { bg: 'rgba(249, 115, 22, 0.15)', border: '#f97316', text: '#ea580c' },   // Orange
            { bg: 'rgba(139, 92, 246, 0.15)', border: '#8b5cf6', text: '#7c3aed' },   // Purple
            { bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899', text: '#db2777' },   // Pink
            { bg: 'rgba(20, 184, 166, 0.15)', border: '#14b8a6', text: '#0d9488' },   // Teal
            { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#d97706' },   // Amber
            { bg: 'rgba(99, 102, 241, 0.15)', border: '#6366f1', text: '#4f46e5' },   // Indigo
        ];
        this.nextColorIndex = 0;

        // Query type state
        this.currentQueryType = 'select';

        // Sub-builders
        this.insertBuilder = null;
        this.updateBuilder = null;
        this.deleteBuilder = null;
        this.alterBuilder = null;
        this.userManager = null;
        this.permissionManager = null;

        // Query history and export
        this.queryHistory = new QueryHistory();
        this.queryExport = new QueryExport();
        this.lastResults = null;

        // Type-to-confirm instance
        this.typeToConfirm = typeToConfirm;

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadSchema();
        this.initSubBuilders();
    }

    initSubBuilders() {
        // Initialize INSERT builder
        this.insertBuilder = new InsertBuilder(this.schema, (sql) => {
            this.updateInsertSQLPreview(sql);
        });
        if (this.schema) {
            this.insertBuilder.updateSchema(this.schema);
        }

        // Initialize UPDATE builder
        this.updateBuilder = new UpdateBuilder(this.schema, (sql) => {
            this.updateUpdateSQLPreview(sql);
        });
        if (this.schema) {
            this.updateBuilder.updateSchema(this.schema);
        }

        // Initialize DELETE builder
        this.deleteBuilder = new DeleteBuilder(this.schema, (sql) => {
            this.updateDeleteSQLPreview(sql);
        });
        if (this.schema) {
            this.deleteBuilder.updateSchema(this.schema);
        }

        // Initialize ALTER builder
        this.alterBuilder = new AlterBuilder(this.schema, (sql) => {
            this.updateAlterSQLPreview(sql);
        }, this.typeToConfirm);
        if (this.schema) {
            this.alterBuilder.updateSchema(this.schema);
        }

        // Initialize Permission Manager (needs to be before UserManager)
        this.permissionManager = new PermissionManager(this.typeToConfirm);

        // Initialize User Manager with callback to update permissions
        this.userManager = new UserManager(this.typeToConfirm, (username, host) => {
            // When user is selected, also set in permission manager
            this.permissionManager.setUser(username, host);
        });

        // Bind user sub-tab switching
        document.querySelectorAll('.user-sub-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchUserSubTab(tabName);
            });
        });

        // Bind preview buttons
        document.getElementById('btn-preview-update')?.addEventListener('click', () => this.previewUpdate());
        document.getElementById('btn-preview-delete')?.addEventListener('click', () => this.previewDelete());
    }

    updateInsertSQLPreview(sql) {
        this.updateBottomPanelSQL(sql);
    }

    updateUpdateSQLPreview(sql) {
        this.updateBottomPanelSQL(sql);
    }

    updateDeleteSQLPreview(sql) {
        this.updateBottomPanelSQL(sql);
    }

    updateAlterSQLPreview(sql) {
        this.updateBottomPanelSQL(sql);
    }

    updateBottomPanelSQL(sql) {
        const bottomPreviewEl = document.querySelector('#sql-preview-bottom code');
        if (bottomPreviewEl) {
            bottomPreviewEl.textContent = sql;
            hljs.highlightElement(bottomPreviewEl);
        }
    }

    bindEvents() {
        // Query type tab switching
        document.querySelectorAll('.query-type-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchQueryType(e.target.closest('.query-type-tab').dataset.type));
        });

        // Tab switching (Visual/SQL)
        document.querySelectorAll('.panel-tabs .tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e));
        });

        // Refresh schema
        document.getElementById('btn-refresh-schema')?.addEventListener('click', () => this.loadSchema());

        // Table search
        document.getElementById('table-search')?.addEventListener('input', (e) => this.filterTables(e.target.value));

        // Run query
        document.getElementById('btn-run')?.addEventListener('click', () => this.runQuery());

        // Clear All (toolbar button)
        document.getElementById('btn-clear-all')?.addEventListener('click', () => this.clearAll());

        // Panel-specific clear buttons
        document.getElementById('btn-clear-select')?.addEventListener('click', () => this.clearSelect());
        document.getElementById('btn-clear-insert')?.addEventListener('click', () => this.clearInsert());
        document.getElementById('btn-clear-update')?.addEventListener('click', () => this.clearUpdate());
        document.getElementById('btn-clear-delete')?.addEventListener('click', () => this.clearDelete());
        document.getElementById('btn-clear-alter')?.addEventListener('click', () => this.clearAlter());

        // Add controls
        document.getElementById('btn-add-join')?.addEventListener('click', () => this.addJoinRow());
        document.getElementById('btn-add-condition')?.addEventListener('click', () => this.addConditionRow());

        // Limit/Offset
        document.getElementById('limit-input')?.addEventListener('input', (e) => {
            this.limit = e.target.value ? parseInt(e.target.value) : null;
            this.updateSQLPreview();
        });
        document.getElementById('offset-input')?.addEventListener('input', (e) => {
            this.offset = e.target.value ? parseInt(e.target.value) : null;
            this.updateSQLPreview();
        });

        // Select All/None buttons
        document.getElementById('btn-select-all')?.addEventListener('click', () => this.selectAllColumns());
        document.getElementById('btn-select-none')?.addEventListener('click', () => this.selectNoColumns());

        // Export buttons
        document.getElementById('btn-export-sql')?.addEventListener('click', () => this.exportSQL());
        document.getElementById('btn-export-csv')?.addEventListener('click', () => this.exportCSV());
        document.getElementById('btn-export-json')?.addEventListener('click', () => this.exportJSON());

        // History toggle
        document.getElementById('btn-toggle-history')?.addEventListener('click', () => this.toggleHistory());

        // History sidebar events
        document.getElementById('btn-close-history')?.addEventListener('click', () => {
            document.getElementById('history-sidebar')?.classList.remove('open');
        });

        document.getElementById('btn-clear-history')?.addEventListener('click', () => {
            if (confirm('Clear all query history?')) {
                this.queryHistory.clearHistory();
                this.renderHistory();
            }
        });

        document.getElementById('history-search')?.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (query) {
                this.searchHistory(query);
            } else {
                this.renderHistory();
            }
        });

        // Drag and drop for tables
        const selectedTablesEl = document.getElementById('selected-tables');
        if (selectedTablesEl) {
            selectedTablesEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                selectedTablesEl.classList.add('drag-over');
            });
            selectedTablesEl.addEventListener('dragleave', () => {
                selectedTablesEl.classList.remove('drag-over');
            });
            selectedTablesEl.addEventListener('drop', (e) => {
                e.preventDefault();
                selectedTablesEl.classList.remove('drag-over');
                const tableName = e.dataTransfer.getData('text/plain');
                if (tableName) this.addTable(tableName);
            });
        }

        // Drag and drop for INSERT/UPDATE/DELETE/ALTER table drop zones
        this.setupTableDropZone('insert-table-drop', (tableName) => {
            if (this.insertBuilder) {
                this.insertBuilder.selectTable(tableName);
            }
        });

        this.setupTableDropZone('update-table-drop', (tableName) => {
            if (this.updateBuilder) {
                this.updateBuilder.selectTable(tableName);
            }
        });

        this.setupTableDropZone('delete-table-drop', (tableName) => {
            if (this.deleteBuilder) {
                this.deleteBuilder.selectTable(tableName);
            }
        });

        this.setupTableDropZone('alter-table-drop', (tableName) => {
            if (this.alterBuilder) {
                this.alterBuilder.selectTable(tableName);
            }
        });

        // Bottom panel tab switching
        document.querySelectorAll('.bottom-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchBottomTab(e.target.closest('.bottom-tab').dataset.tab));
        });

        // Copy SQL button
        document.getElementById('btn-copy-sql')?.addEventListener('click', () => this.copySQL());

        // Saved Queries
        this.initSavedQueries();
    }

    initSavedQueries() {
        // Initialize saved queries panel
        const savedQueriesPanel = document.getElementById('saved-queries-panel');
        if (savedQueriesPanel) {
            savedQueries.renderPanel(savedQueriesPanel);

            // Set callback for loading queries
            savedQueries.onLoadQuery = (query) => this.loadSavedQuery(query);
        }

        // Toggle saved queries sidebar
        document.getElementById('btn-toggle-saved')?.addEventListener('click', () => this.toggleSavedQueries());
        document.getElementById('btn-close-saved')?.addEventListener('click', () => this.toggleSavedQueries(false));

        // Save query button
        document.getElementById('btn-save-query')?.addEventListener('click', () => this.showSaveQueryModal());

        // Save query modal events
        document.getElementById('btn-cancel-save-query')?.addEventListener('click', () => this.hideSaveQueryModal());
        document.getElementById('btn-cancel-save-query-footer')?.addEventListener('click', () => this.hideSaveQueryModal());
        document.getElementById('btn-do-save-query')?.addEventListener('click', () => this.doSaveQuery());

        // Close modal on backdrop click
        const saveModal = document.getElementById('save-query-modal');
        saveModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.hideSaveQueryModal());
    }

    toggleSavedQueries(show = null) {
        const sidebar = document.getElementById('saved-queries-sidebar');
        if (!sidebar) return;

        if (show === null) {
            sidebar.classList.toggle('active');
        } else {
            sidebar.classList.toggle('active', show);
        }

        // Refresh when opening
        if (sidebar.classList.contains('active')) {
            savedQueries.refreshPanel();
        }
    }

    showSaveQueryModal() {
        const sql = this.buildSQL();
        if (!sql || sql === 'SELECT * FROM table_name;') {
            toast.warning('Build a query first before saving');
            return;
        }

        // Show SQL preview in modal
        const previewEl = document.querySelector('#save-query-sql-preview code');
        if (previewEl) {
            previewEl.textContent = sql;
            hljs.highlightElement(previewEl);
        }

        // Clear form
        document.getElementById('save-query-title').value = '';
        document.getElementById('save-query-description').value = '';
        document.getElementById('save-query-group').value = '';
        document.getElementById('save-query-tags').value = '';
        document.getElementById('save-query-favorite').checked = false;

        // Populate groups datalist
        savedQueries.populateGroupsDatalist();

        // Show modal
        const modal = document.getElementById('save-query-modal');
        if (modal) {
            modal.dataset.queryId = '';
            modal.classList.add('active');
            document.getElementById('save-query-title')?.focus();
        }
    }

    hideSaveQueryModal() {
        const modal = document.getElementById('save-query-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    async doSaveQuery() {
        const sql = this.buildSQL();
        const queryState = this.getQueryState();
        const success = await savedQueries.handleSaveSubmit(sql, this.currentQueryType, queryState);
        if (success) {
            this.hideSaveQueryModal();
        }
    }

    /**
     * Get current query builder state for saving
     */
    getQueryState() {
        return {
            queryType: this.currentQueryType,
            selectedTables: this.selectedTables,
            selectedColumns: this.selectedColumns,
            joins: this.joins,
            conditions: this.conditions,
            orderBy: this.orderBy,
            groupBy: this.groupBy,
            limit: this.limit,
            offset: this.offset
        };
    }

    /**
     * Load a saved query into the builder
     */
    loadSavedQuery(query) {
        // If query has saved state, restore it
        if (query.query_state) {
            this.restoreQueryState(query.query_state);
        } else {
            // Parse SQL and populate query builder
            this.loadFromSQL(query.sql_query, query.query_type);
        }

        // Close the saved queries sidebar
        this.toggleSavedQueries(false);

        toast.success(`Loaded: ${query.title}`);
    }

    /**
     * Restore query builder state from saved state
     */
    restoreQueryState(state) {
        // Switch to the correct query type
        if (state.queryType) {
            this.switchQueryType(state.queryType);
        }

        // Only restore SELECT query state for now
        if (state.queryType === 'select') {
            // Clear current state
            this.selectedTables = [];
            this.selectedColumns = {};
            this.joins = [];
            this.conditions = [];
            this.orderBy = [];
            this.groupBy = [];
            this.limit = null;
            this.offset = null;

            // Restore tables
            if (state.selectedTables && Array.isArray(state.selectedTables)) {
                state.selectedTables.forEach(tableEntry => {
                    this.selectedTables.push({
                        name: tableEntry.name,
                        alias: tableEntry.alias || '',
                        colorIndex: tableEntry.colorIndex || this.nextColorIndex++
                    });
                });
            }

            // Restore selected columns
            if (state.selectedColumns) {
                this.selectedColumns = { ...state.selectedColumns };
            }

            // Restore joins
            if (state.joins && Array.isArray(state.joins)) {
                this.joins = [...state.joins];
            }

            // Restore conditions
            if (state.conditions && Array.isArray(state.conditions)) {
                this.conditions = [...state.conditions];
            }

            // Restore order by
            if (state.orderBy && Array.isArray(state.orderBy)) {
                this.orderBy = [...state.orderBy];
            }

            // Restore group by
            if (state.groupBy && Array.isArray(state.groupBy)) {
                this.groupBy = [...state.groupBy];
            }

            // Restore limit/offset
            this.limit = state.limit || null;
            this.offset = state.offset || null;

            // Update UI
            this.renderSelectedTables();
            this.renderColumns();
            this.renderJoins();
            this.renderConditions();
            this.renderOrderBy();
            this.renderGroupBy();
            this.updateLimitOffsetInputs();
            this.updateSQLPreview();
        }
    }

    /**
     * Update limit/offset input values
     */
    updateLimitOffsetInputs() {
        const limitInput = document.getElementById('limit-input');
        const offsetInput = document.getElementById('offset-input');

        if (limitInput) {
            limitInput.value = this.limit || '';
        }
        if (offsetInput) {
            offsetInput.value = this.offset || '';
        }
    }

    setupTableDropZone(elementId, callback) {
        const dropZone = document.getElementById(elementId);
        if (!dropZone) return;

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const tableName = e.dataTransfer.getData('text/plain');
            if (tableName) {
                callback(tableName);
                this.renderDropZoneTable(dropZone, tableName);
            }
        });
    }

    handleTableDoubleClick(tableName) {
        // Handle based on current query type
        switch (this.currentQueryType) {
            case 'select':
                this.addTable(tableName);
                break;
            case 'insert':
                if (this.insertBuilder) {
                    this.insertBuilder.selectTable(tableName);
                    this.renderDropZoneTable(document.getElementById('insert-table-drop'), tableName);
                }
                break;
            case 'update':
                if (this.updateBuilder) {
                    this.updateBuilder.selectTable(tableName);
                    this.renderDropZoneTable(document.getElementById('update-table-drop'), tableName);
                }
                break;
            case 'delete':
                if (this.deleteBuilder) {
                    this.deleteBuilder.selectTable(tableName);
                    this.renderDropZoneTable(document.getElementById('delete-table-drop'), tableName);
                }
                break;
            case 'alter':
                if (this.alterBuilder) {
                    this.alterBuilder.selectTable(tableName);
                    this.renderDropZoneTable(document.getElementById('alter-table-drop'), tableName);
                }
                break;
            default:
                this.addTable(tableName);
        }
    }

    renderDropZoneTable(dropZone, tableName) {
        dropZone.innerHTML = `
            <div class="drop-zone-table">
                <span class="table-name">${tableName}</span>
                <button class="remove-btn">&times;</button>
            </div>
        `;
        dropZone.classList.add('has-table');

        dropZone.querySelector('.remove-btn').addEventListener('click', () => {
            dropZone.innerHTML = '<div class="placeholder">Drag a table here or double-click from sidebar</div>';
            dropZone.classList.remove('has-table');

            // Clear the builder's table
            const builderId = dropZone.id.replace('-table-drop', '');
            if (builderId === 'insert' && this.insertBuilder) {
                this.insertBuilder.clear();
            } else if (builderId === 'update' && this.updateBuilder) {
                this.updateBuilder.clear();
            } else if (builderId === 'delete' && this.deleteBuilder) {
                this.deleteBuilder.clear();
            } else if (builderId === 'alter' && this.alterBuilder) {
                this.alterBuilder.clear();
            }
        });
    }

    switchQueryType(type) {
        if (this.currentQueryType === type) return;

        this.currentQueryType = type;

        // Update tabs
        document.querySelectorAll('.query-type-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.type === type);
        });

        // Update panels
        document.querySelectorAll('.query-panel').forEach(panel => {
            panel.classList.toggle('active', panel.dataset.panel === type);
        });

        // Update run button text based on query type
        const runBtn = document.getElementById('btn-run');
        if (runBtn) {
            const labels = {
                'select': 'Run Query',
                'insert': 'Insert Data',
                'update': 'Update Data',
                'delete': 'Delete Data',
                'alter': 'Execute ALTER',
                'users': 'Refresh Users'
            };
            runBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                ${labels[type] || 'Run Query'}
            `;
        }
    }

    switchTab(e) {
        const tab = e.target;
        const tabGroup = tab.closest('.panel-tabs');
        const panel = tab.closest('.builder-panel, .results-panel');
        const tabId = tab.dataset.tab;

        // Update tab buttons
        tabGroup.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Update content
        panel.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
            if (content.id === `tab-${tabId}`) {
                content.classList.add('active');
            }
        });
    }

    switchBottomTab(tabId) {
        // Update tab buttons
        document.querySelectorAll('.bottom-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });

        // Update content panels
        document.querySelectorAll('.bottom-panel-content').forEach(content => {
            content.classList.remove('active');
        });

        const targetContent = document.getElementById(`bottom-${tabId}`);
        if (targetContent) {
            targetContent.classList.add('active');
        }
    }

    copySQL() {
        const sql = this.buildSQL();
        if (!sql || sql === 'SELECT * FROM table_name;') {
            toast.warning('No query to copy');
            return;
        }

        navigator.clipboard.writeText(sql).then(() => {
            toast.success('SQL copied to clipboard');
        }).catch(() => {
            toast.error('Failed to copy SQL');
        });
    }

    async loadSchema() {
        const tablesList = document.getElementById('tables-list');
        tablesList.innerHTML = '<div class="loading">Loading schema...</div>';

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/schema.php`);
            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            this.schema = result.data;
            this.renderTablesList();

            // Update sub-builders with new schema
            if (this.insertBuilder) {
                this.insertBuilder.updateSchema(this.schema);
            }
            if (this.updateBuilder) {
                this.updateBuilder.updateSchema(this.schema);
            }
            if (this.deleteBuilder) {
                this.deleteBuilder.updateSchema(this.schema);
            }
            if (this.alterBuilder) {
                this.alterBuilder.updateSchema(this.schema);
            }
        } catch (error) {
            tablesList.innerHTML = `<div class="loading">Error: ${error.message}</div>`;
            console.error('Failed to load schema:', error);
        }
    }

    renderTablesList() {
        const tablesList = document.getElementById('tables-list');

        if (!this.schema || !this.schema.tables.length) {
            tablesList.innerHTML = '<div class="loading">No tables found</div>';
            return;
        }

        tablesList.innerHTML = this.schema.tables.map(table => `
            <div class="table-item" data-table="${table.name}">
                <div class="table-header" draggable="true">
                    <div class="table-name">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <line x1="3" y1="9" x2="21" y2="9"/>
                            <line x1="9" y1="21" x2="9" y2="9"/>
                        </svg>
                        ${table.name}
                    </div>
                    <button class="table-toggle">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                    </button>
                </div>
                <div class="table-columns">
                    ${table.columns.map(col => `
                        <div class="column-item ${col.key_type === 'PRI' ? 'primary-key' : ''} ${col.foreign_key ? 'foreign-key' : ''}"
                             data-table="${table.name}" data-column="${col.name}">
                            <span class="column-name">${col.name}</span>
                            <span class="column-type">${col.data_type}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        // Bind events to new elements
        tablesList.querySelectorAll('.table-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.table-toggle')) {
                    const item = header.closest('.table-item');
                    item.classList.toggle('expanded');
                }
            });

            header.addEventListener('dragstart', (e) => {
                const tableName = header.closest('.table-item').dataset.table;
                e.dataTransfer.setData('text/plain', tableName);
            });

            header.addEventListener('dblclick', () => {
                const tableName = header.closest('.table-item').dataset.table;
                this.handleTableDoubleClick(tableName);
            });
        });

        tablesList.querySelectorAll('.column-item').forEach(col => {
            col.addEventListener('click', () => {
                const tableName = col.dataset.table;
                const columnName = col.dataset.column;
                this.toggleColumn(tableName, columnName);
            });
        });
    }

    filterTables(query) {
        const items = document.querySelectorAll('.table-item');
        const lowerQuery = query.toLowerCase();

        items.forEach(item => {
            const tableName = item.dataset.table.toLowerCase();
            const matches = tableName.includes(lowerQuery);
            item.style.display = matches ? '' : 'none';
        });
    }

    addTable(tableName, forceAdd = false) {
        // Check if table already exists (unless forcing for self-join)
        const existingCount = this.selectedTables.filter(t => t.name === tableName).length;
        if (existingCount > 0 && !forceAdd) {
            // Ask if they want to add again for self-join
            if (!confirm(`"${tableName}" is already added. Add again for a self-join?`)) {
                return;
            }
        }

        // Generate alias for duplicate tables
        let alias = null;
        if (existingCount > 0) {
            alias = `${tableName}_${existingCount + 1}`;
        }

        const colorIndex = this.nextColorIndex;
        this.nextColorIndex = (this.nextColorIndex + 1) % this.tableColors.length;

        const tableEntry = {
            name: tableName,
            alias: alias,
            colorIndex: colorIndex
        };

        this.selectedTables.push(tableEntry);

        // Initialize with all columns selected using the key (alias or name)
        const tableKey = alias || tableName;
        const table = this.schema.tables.find(t => t.name === tableName);
        if (table) {
            this.selectedColumns[tableKey] = table.columns.map(c => c.name);
        }

        this.renderSelectedTables();
        this.renderColumns();
        this.renderGroupBy();
        this.updateJoinSuggestions();
        this.updateSQLPreview();
    }

    getTableKey(tableEntry) {
        return tableEntry.alias || tableEntry.name;
    }

    setTableAlias(index, newAlias) {
        const tableEntry = this.selectedTables[index];
        if (!tableEntry) return;

        const oldKey = this.getTableKey(tableEntry);
        tableEntry.alias = newAlias || null;
        const newKey = this.getTableKey(tableEntry);

        // Update selectedColumns key
        if (oldKey !== newKey && this.selectedColumns[oldKey]) {
            this.selectedColumns[newKey] = this.selectedColumns[oldKey];
            delete this.selectedColumns[oldKey];
        }

        // Update joins referencing this table
        this.joins.forEach(join => {
            if (join.leftTable === oldKey) join.leftTable = newKey;
            if (join.rightTable === oldKey) join.rightTable = newKey;
        });

        // Update conditions referencing this table
        this.conditions.forEach(cond => {
            if (cond.column.startsWith(oldKey + '.')) {
                cond.column = newKey + '.' + cond.column.split('.')[1];
            }
        });

        this.renderSelectedTables();
        this.renderColumns();
        this.renderJoins();
        this.renderConditions();
        this.renderGroupBy();
        this.updateSQLPreview();
    }

    removeTable(index) {
        const tableEntry = this.selectedTables[index];
        if (!tableEntry) return;

        const tableKey = this.getTableKey(tableEntry);

        this.selectedTables.splice(index, 1);
        delete this.selectedColumns[tableKey];

        // Remove joins referencing this table
        this.joins = this.joins.filter(j => j.leftTable !== tableKey && j.rightTable !== tableKey);

        // Remove conditions referencing this table
        this.conditions = this.conditions.filter(c => !c.column.startsWith(tableKey + '.'));

        // Remove from groupBy
        this.groupBy = this.groupBy.filter(g => !g.startsWith(tableKey + '.'));

        // Remove from orderBy
        this.orderBy = this.orderBy.filter(o => !o.column.startsWith(tableKey + '.'));

        this.renderSelectedTables();
        this.renderColumns();
        this.renderJoins();
        this.renderConditions();
        this.renderGroupBy();
        this.updateJoinSuggestions();
        this.updateSQLPreview();
    }

    toggleColumn(tableName, columnName) {
        // Find the table entry by name
        const tableEntry = this.selectedTables.find(t => t.name === tableName);
        if (!tableEntry) {
            this.addTable(tableName);
            return; // addTable already adds all columns
        }

        const tableKey = this.getTableKey(tableEntry);
        if (!this.selectedColumns[tableKey]) {
            this.selectedColumns[tableKey] = [];
        }

        const index = this.selectedColumns[tableKey].indexOf(columnName);
        if (index === -1) {
            this.selectedColumns[tableKey].push(columnName);
        } else {
            this.selectedColumns[tableKey].splice(index, 1);
        }

        this.renderColumns();
        this.renderGroupBy();
        this.updateSQLPreview();
    }

    renderSelectedTables() {
        const container = document.getElementById('selected-tables');

        if (!this.selectedTables.length) {
            container.innerHTML = '<div class="placeholder">Drag tables here or double-click from sidebar</div>';
            return;
        }

        container.innerHTML = this.selectedTables.map((tableEntry, index) => {
            const color = this.tableColors[tableEntry.colorIndex];
            const displayName = tableEntry.alias
                ? `${tableEntry.name} AS ${tableEntry.alias}`
                : tableEntry.name;

            return `
                <div class="selected-table" data-index="${index}"
                     style="background: ${color.bg}; border-color: ${color.border}; color: ${color.text}">
                    <span class="table-display-name">${displayName}</span>
                    <input type="text" class="alias-input" placeholder="alias"
                           value="${tableEntry.alias || ''}"
                           style="display: none; color: ${color.text}; border-color: ${color.border}">
                    <button class="edit-alias-btn" title="Set alias">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="remove-btn" data-index="${index}">&times;</button>
                </div>
            `;
        }).join('');

        // Bind events
        container.querySelectorAll('.selected-table').forEach((el, index) => {
            const aliasInput = el.querySelector('.alias-input');
            const displayName = el.querySelector('.table-display-name');
            const editBtn = el.querySelector('.edit-alias-btn');

            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                displayName.style.display = 'none';
                aliasInput.style.display = 'inline-block';
                aliasInput.focus();
                aliasInput.select();
            });

            aliasInput.addEventListener('blur', () => {
                const newAlias = aliasInput.value.trim();
                this.setTableAlias(index, newAlias);
            });

            aliasInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    aliasInput.blur();
                } else if (e.key === 'Escape') {
                    aliasInput.value = this.selectedTables[index].alias || '';
                    aliasInput.blur();
                }
            });
        });

        container.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeTable(parseInt(btn.dataset.index));
            });
        });
    }

    updateJoinSuggestions() {
        const container = document.getElementById('join-suggestions');
        if (!container) return;

        if (this.selectedTables.length < 2) {
            container.innerHTML = '';
            return;
        }

        const suggestions = this.findJoinSuggestions();

        if (!suggestions.length) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            <div class="suggestions-header">Suggested joins based on foreign keys:</div>
            ${suggestions.map((s, i) => `
                <div class="join-suggestion" data-index="${i}">
                    <span class="suggestion-text">
                        ${s.leftTable}.${s.leftColumn} = ${s.rightTable}.${s.rightColumn}
                    </span>
                    <button class="btn-use-suggestion" data-index="${i}">+ Add</button>
                </div>
            `).join('')}
        `;

        container.querySelectorAll('.btn-use-suggestion').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                const suggestion = suggestions[idx];
                this.joins.push({
                    type: 'INNER',
                    leftTable: suggestion.leftTable,
                    leftColumn: suggestion.leftColumn,
                    rightTable: suggestion.rightTable,
                    rightColumn: suggestion.rightColumn
                });
                this.renderJoins();
                this.updateSQLPreview();
                // Remove used suggestion
                btn.closest('.join-suggestion').remove();
            });
        });
    }

    findJoinSuggestions() {
        const suggestions = [];

        // Check each pair of selected tables for FK relationships
        for (let i = 0; i < this.selectedTables.length; i++) {
            for (let j = i + 1; j < this.selectedTables.length; j++) {
                const table1 = this.selectedTables[i];
                const table2 = this.selectedTables[j];

                const table1Key = this.getTableKey(table1);
                const table2Key = this.getTableKey(table2);

                const table1Schema = this.schema.tables.find(t => t.name === table1.name);
                const table2Schema = this.schema.tables.find(t => t.name === table2.name);

                if (!table1Schema || !table2Schema) continue;

                // Check table1's FKs pointing to table2
                table1Schema.columns.forEach(col => {
                    if (col.foreign_key && col.foreign_key.table === table2.name) {
                        // Check if this join already exists
                        const exists = this.joins.some(j =>
                            (j.leftTable === table1Key && j.leftColumn === col.name &&
                             j.rightTable === table2Key && j.rightColumn === col.foreign_key.column) ||
                            (j.leftTable === table2Key && j.leftColumn === col.foreign_key.column &&
                             j.rightTable === table1Key && j.rightColumn === col.name)
                        );

                        if (!exists) {
                            suggestions.push({
                                leftTable: table1Key,
                                leftColumn: col.name,
                                rightTable: table2Key,
                                rightColumn: col.foreign_key.column
                            });
                        }
                    }
                });

                // Check table2's FKs pointing to table1
                table2Schema.columns.forEach(col => {
                    if (col.foreign_key && col.foreign_key.table === table1.name) {
                        const exists = this.joins.some(j =>
                            (j.leftTable === table2Key && j.leftColumn === col.name &&
                             j.rightTable === table1Key && j.rightColumn === col.foreign_key.column) ||
                            (j.leftTable === table1Key && j.leftColumn === col.foreign_key.column &&
                             j.rightTable === table2Key && j.rightColumn === col.name)
                        );

                        if (!exists) {
                            suggestions.push({
                                leftTable: table2Key,
                                leftColumn: col.name,
                                rightTable: table1Key,
                                rightColumn: col.foreign_key.column
                            });
                        }
                    }
                });

                // Also check for matching column names (common pattern: id matches table_id)
                const pkCol1 = table1Schema.columns.find(c => c.key_type === 'PRI');
                const pkCol2 = table2Schema.columns.find(c => c.key_type === 'PRI');

                if (pkCol1) {
                    // Look for table1_id in table2
                    const fkPattern = `${table1.name}_${pkCol1.name}`;
                    const matchingCol = table2Schema.columns.find(c =>
                        c.name.toLowerCase() === fkPattern.toLowerCase()
                    );
                    if (matchingCol) {
                        const exists = this.joins.some(j =>
                            (j.leftTable === table1Key && j.leftColumn === pkCol1.name &&
                             j.rightTable === table2Key && j.rightColumn === matchingCol.name)
                        );
                        if (!exists && !suggestions.some(s =>
                            s.leftTable === table1Key && s.leftColumn === pkCol1.name &&
                            s.rightTable === table2Key && s.rightColumn === matchingCol.name
                        )) {
                            suggestions.push({
                                leftTable: table1Key,
                                leftColumn: pkCol1.name,
                                rightTable: table2Key,
                                rightColumn: matchingCol.name
                            });
                        }
                    }
                }

                if (pkCol2) {
                    const fkPattern = `${table2.name}_${pkCol2.name}`;
                    const matchingCol = table1Schema.columns.find(c =>
                        c.name.toLowerCase() === fkPattern.toLowerCase()
                    );
                    if (matchingCol) {
                        const exists = this.joins.some(j =>
                            (j.leftTable === table2Key && j.leftColumn === pkCol2.name &&
                             j.rightTable === table1Key && j.rightColumn === matchingCol.name)
                        );
                        if (!exists && !suggestions.some(s =>
                            s.leftTable === table2Key && s.leftColumn === pkCol2.name &&
                            s.rightTable === table1Key && s.rightColumn === matchingCol.name
                        )) {
                            suggestions.push({
                                leftTable: table2Key,
                                leftColumn: pkCol2.name,
                                rightTable: table1Key,
                                rightColumn: matchingCol.name
                            });
                        }
                    }
                }
            }
        }

        return suggestions;
    }

    addJoinRow() {
        if (this.selectedTables.length < 2) {
            toast.warning('Add at least 2 tables to create a join');
            return;
        }

        const leftTableKey = this.getTableKey(this.selectedTables[0]);
        const rightTableKey = this.getTableKey(this.selectedTables[1]);

        this.joins.push({
            type: 'INNER',
            leftTable: leftTableKey,
            leftColumn: '',
            rightTable: rightTableKey,
            rightColumn: ''
        });

        this.renderJoins();
        this.updateJoinSuggestions();
    }

    getTableKeys() {
        return this.selectedTables.map(t => this.getTableKey(t));
    }

    renderJoins() {
        const container = document.getElementById('joins-container');
        const tableKeys = this.getTableKeys();

        container.innerHTML = this.joins.map((join, index) => `
            <div class="join-row" data-index="${index}">
                <select class="join-type">
                    <option value="INNER" ${join.type === 'INNER' ? 'selected' : ''}>INNER JOIN</option>
                    <option value="LEFT" ${join.type === 'LEFT' ? 'selected' : ''}>LEFT JOIN</option>
                    <option value="RIGHT" ${join.type === 'RIGHT' ? 'selected' : ''}>RIGHT JOIN</option>
                </select>
                <select class="left-table">
                    ${tableKeys.map(t => `<option value="${t}" ${join.leftTable === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
                <select class="left-column">
                    ${this.getColumnsForTableKey(join.leftTable).map(c => `<option value="${c}" ${join.leftColumn === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
                <span>=</span>
                <select class="right-table">
                    ${tableKeys.map(t => `<option value="${t}" ${join.rightTable === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
                <select class="right-column">
                    ${this.getColumnsForTableKey(join.rightTable).map(c => `<option value="${c}" ${join.rightColumn === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
                <button class="remove-btn">&times;</button>
            </div>
        `).join('');

        container.querySelectorAll('.join-row').forEach((row, index) => {
            row.querySelector('.join-type').addEventListener('change', (e) => {
                this.joins[index].type = e.target.value;
                this.updateSQLPreview();
            });
            row.querySelector('.left-table').addEventListener('change', (e) => {
                this.joins[index].leftTable = e.target.value;
                this.renderJoins();
                this.updateSQLPreview();
            });
            row.querySelector('.left-column').addEventListener('change', (e) => {
                this.joins[index].leftColumn = e.target.value;
                this.updateSQLPreview();
            });
            row.querySelector('.right-table').addEventListener('change', (e) => {
                this.joins[index].rightTable = e.target.value;
                this.renderJoins();
                this.updateSQLPreview();
            });
            row.querySelector('.right-column').addEventListener('change', (e) => {
                this.joins[index].rightColumn = e.target.value;
                this.updateSQLPreview();
            });
            row.querySelector('.remove-btn').addEventListener('click', () => {
                this.joins.splice(index, 1);
                this.renderJoins();
                this.updateSQLPreview();
            });
        });
    }

    addConditionRow() {
        if (!this.selectedTables.length) {
            toast.warning('Add at least one table first');
            return;
        }

        this.conditions.push({
            column: '',
            operator: '=',
            value: '',
            connector: 'AND'
        });

        this.renderConditions();
    }

    renderConditions() {
        const container = document.getElementById('conditions-container');
        const allColumns = this.getAllColumns();

        container.innerHTML = this.conditions.map((cond, index) => `
            <div class="condition-row" data-index="${index}">
                ${index > 0 ? `
                    <select class="connector">
                        <option value="AND" ${cond.connector === 'AND' ? 'selected' : ''}>AND</option>
                        <option value="OR" ${cond.connector === 'OR' ? 'selected' : ''}>OR</option>
                    </select>
                ` : ''}
                <select class="column">
                    <option value="">Select column</option>
                    ${allColumns.map(c => `<option value="${c}" ${cond.column === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
                <select class="operator">
                    <option value="=" ${cond.operator === '=' ? 'selected' : ''}>=</option>
                    <option value="!=" ${cond.operator === '!=' ? 'selected' : ''}>!=</option>
                    <option value=">" ${cond.operator === '>' ? 'selected' : ''}>&gt;</option>
                    <option value="<" ${cond.operator === '<' ? 'selected' : ''}>&lt;</option>
                    <option value=">=" ${cond.operator === '>=' ? 'selected' : ''}>&gt;=</option>
                    <option value="<=" ${cond.operator === '<=' ? 'selected' : ''}>&lt;=</option>
                    <option value="LIKE" ${cond.operator === 'LIKE' ? 'selected' : ''}>LIKE</option>
                    <option value="NOT LIKE" ${cond.operator === 'NOT LIKE' ? 'selected' : ''}>NOT LIKE</option>
                    <option value="IN" ${cond.operator === 'IN' ? 'selected' : ''}>IN</option>
                    <option value="NOT IN" ${cond.operator === 'NOT IN' ? 'selected' : ''}>NOT IN</option>
                    <option value="BETWEEN" ${cond.operator === 'BETWEEN' ? 'selected' : ''}>BETWEEN</option>
                    <option value="NOT BETWEEN" ${cond.operator === 'NOT BETWEEN' ? 'selected' : ''}>NOT BETWEEN</option>
                    <option value="IS NULL" ${cond.operator === 'IS NULL' ? 'selected' : ''}>IS NULL</option>
                    <option value="IS NOT NULL" ${cond.operator === 'IS NOT NULL' ? 'selected' : ''}>IS NOT NULL</option>
                </select>
                <input type="text" class="value" placeholder="${['BETWEEN', 'NOT BETWEEN'].includes(cond.operator) ? 'min AND max' : 'Value'}" value="${cond.value || ''}"
                       ${['IS NULL', 'IS NOT NULL'].includes(cond.operator) ? 'disabled' : ''}>
                <button class="remove-btn">&times;</button>
            </div>
        `).join('');

        container.querySelectorAll('.condition-row').forEach((row, index) => {
            row.querySelector('.connector')?.addEventListener('change', (e) => {
                this.conditions[index].connector = e.target.value;
                this.updateSQLPreview();
            });
            row.querySelector('.column').addEventListener('change', (e) => {
                this.conditions[index].column = e.target.value;
                this.updateSQLPreview();
            });
            row.querySelector('.operator').addEventListener('change', (e) => {
                this.conditions[index].operator = e.target.value;
                const valueInput = row.querySelector('.value');
                valueInput.disabled = ['IS NULL', 'IS NOT NULL'].includes(e.target.value);
                this.updateSQLPreview();
            });
            row.querySelector('.value').addEventListener('input', (e) => {
                this.conditions[index].value = e.target.value;
                this.updateSQLPreview();
            });
            row.querySelector('.remove-btn').addEventListener('click', () => {
                this.conditions.splice(index, 1);
                this.renderConditions();
                this.updateSQLPreview();
            });
        });
    }

    addToOrderBy(column) {
        if (!this.orderBy.find(o => o.column === column)) {
            this.orderBy.push({
                column: column,
                direction: 'ASC'
            });
            this.renderOrderBy();
            this.updateSQLPreview();
        }
    }

    removeFromOrderBy(column) {
        this.orderBy = this.orderBy.filter(o => o.column !== column);
        this.renderOrderBy();
        this.updateSQLPreview();
    }

    toggleOrderByDirection(column) {
        const order = this.orderBy.find(o => o.column === column);
        if (order) {
            order.direction = order.direction === 'ASC' ? 'DESC' : 'ASC';
            this.renderOrderBy();
            this.updateSQLPreview();
        }
    }

    renderOrderBy() {
        const selectedContainer = document.getElementById('orderby-selected');
        const availableContainer = document.getElementById('orderby-available');

        if (!selectedContainer || !availableContainer) return;

        const allColumnsWithColors = this.getAllColumnsWithColors();

        // Helper to get color for a column
        const getColorForColumn = (colValue) => {
            const found = allColumnsWithColors.find(c => c.value === colValue);
            return found ? found.color : null;
        };

        // Render selected ORDER BY columns as tags with direction toggle
        if (this.orderBy.length === 0) {
            selectedContainer.innerHTML = '<span class="placeholder">Click columns to add</span>';
        } else {
            selectedContainer.innerHTML = this.orderBy.map(order => {
                const color = getColorForColumn(order.column);
                const style = color
                    ? `background: ${color.bg}; border: 1px solid ${color.border}; color: ${color.text}`
                    : '';
                const dirClass = order.direction.toLowerCase();
                const arrowIcon = order.direction === 'ASC'
                    ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
                    : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>';
                return `
                    <span class="orderby-tag" data-column="${order.column}" style="${style}">
                        ${order.column}
                        <button class="direction-toggle ${dirClass}" data-column="${order.column}" title="Toggle direction (${order.direction})">${arrowIcon} ${order.direction}</button>
                        <button class="tag-remove" data-column="${order.column}">&times;</button>
                    </span>
                `;
            }).join('');

            // Bind direction toggle events
            selectedContainer.querySelectorAll('.direction-toggle').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleOrderByDirection(btn.dataset.column);
                });
            });

            // Bind remove events
            selectedContainer.querySelectorAll('.tag-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeFromOrderBy(btn.dataset.column);
                });
            });
        }

        // Render available columns (excluding already selected)
        const selectedColumns = this.orderBy.map(o => o.column);
        const availableColumns = allColumnsWithColors.filter(c => !selectedColumns.includes(c.value));

        if (availableColumns.length === 0 && allColumnsWithColors.length > 0) {
            availableContainer.innerHTML = '<span class="placeholder-sm">All columns added</span>';
        } else if (allColumnsWithColors.length === 0) {
            availableContainer.innerHTML = '';
        } else {
            availableContainer.innerHTML = availableColumns.map(col => {
                const style = `background: ${col.color.bg}; border: 1px solid ${col.color.border}; color: ${col.color.text}`;
                return `<span class="orderby-option" data-column="${col.value}" style="${style}">${col.value}</span>`;
            }).join('');

            // Bind click events to add
            availableContainer.querySelectorAll('.orderby-option').forEach(option => {
                option.addEventListener('click', () => {
                    this.addToOrderBy(option.dataset.column);
                });
            });
        }
    }

    selectAllColumns() {
        this.selectedTables.forEach(tableEntry => {
            const tableKey = this.getTableKey(tableEntry);
            const allCols = this.getColumnsForTable(tableEntry.name);
            this.selectedColumns[tableKey] = [...allCols];
        });
        this.renderColumns();
        this.updateSQLPreview();
    }

    selectNoColumns() {
        this.selectedTables.forEach(tableEntry => {
            const tableKey = this.getTableKey(tableEntry);
            this.selectedColumns[tableKey] = [];
        });
        this.renderColumns();
        this.updateSQLPreview();
    }

    addColumn(tableKey, columnName) {
        if (!this.selectedColumns[tableKey]) {
            this.selectedColumns[tableKey] = [];
        }
        if (!this.selectedColumns[tableKey].includes(columnName)) {
            this.selectedColumns[tableKey].push(columnName);
            this.renderColumns();
            this.renderGroupBy();
            this.updateSQLPreview();
        }
    }

    removeColumn(tableKey, columnName) {
        if (this.selectedColumns[tableKey]) {
            this.selectedColumns[tableKey] = this.selectedColumns[tableKey].filter(c => c !== columnName);
            this.renderColumns();
            this.renderGroupBy();
            this.updateSQLPreview();
        }
    }

    renderColumns() {
        const selectedContainer = document.getElementById('columns-selected');
        const availableContainer = document.getElementById('columns-available');

        if (!selectedContainer || !availableContainer) return;

        // Get all columns with color info
        const allColumnsWithColors = [];
        this.selectedTables.forEach(tableEntry => {
            const tableKey = this.getTableKey(tableEntry);
            const color = this.tableColors[tableEntry.colorIndex];
            const tableCols = this.getColumnsForTable(tableEntry.name);
            tableCols.forEach(col => {
                const isSelected = this.selectedColumns[tableKey]?.includes(col);
                allColumnsWithColors.push({
                    tableKey,
                    column: col,
                    fullName: `${tableKey}.${col}`,
                    color,
                    isSelected
                });
            });
        });

        const selectedCols = allColumnsWithColors.filter(c => c.isSelected);
        const availableCols = allColumnsWithColors.filter(c => !c.isSelected);

        // Render selected columns
        if (selectedCols.length === 0) {
            if (this.selectedTables.length === 0) {
                selectedContainer.innerHTML = '<span class="placeholder">Add tables to select columns</span>';
            } else {
                selectedContainer.innerHTML = '<span class="placeholder">Click columns below to add (or use "All")</span>';
            }
        } else {
            selectedContainer.innerHTML = selectedCols.map(col => {
                const style = `background: ${col.color.bg}; border: 1px solid ${col.color.border}; color: ${col.color.text}`;
                return `
                    <span class="column-tag" data-table="${col.tableKey}" data-column="${col.column}" style="${style}">
                        ${col.fullName}
                        <button class="tag-remove" data-table="${col.tableKey}" data-column="${col.column}">&times;</button>
                    </span>
                `;
            }).join('');

            // Bind remove events
            selectedContainer.querySelectorAll('.tag-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeColumn(btn.dataset.table, btn.dataset.column);
                });
            });
        }

        // Render available columns
        if (availableCols.length === 0 && allColumnsWithColors.length > 0) {
            availableContainer.innerHTML = '<span class="placeholder-sm">All columns selected</span>';
        } else if (allColumnsWithColors.length === 0) {
            availableContainer.innerHTML = '';
        } else {
            availableContainer.innerHTML = availableCols.map(col => {
                const style = `background: ${col.color.bg}; border: 1px solid ${col.color.border}; color: ${col.color.text}`;
                return `<span class="column-option" data-table="${col.tableKey}" data-column="${col.column}" style="${style}">${col.fullName}</span>`;
            }).join('');

            // Bind click events to add
            availableContainer.querySelectorAll('.column-option').forEach(option => {
                option.addEventListener('click', () => {
                    this.addColumn(option.dataset.table, option.dataset.column);
                });
            });
        }
    }

    addToGroupBy(column) {
        if (!this.groupBy.includes(column)) {
            this.groupBy.push(column);
            this.renderGroupBy();
            this.updateSQLPreview();
        }
    }

    removeFromGroupBy(column) {
        this.groupBy = this.groupBy.filter(c => c !== column);
        this.renderGroupBy();
        this.updateSQLPreview();
    }

    renderGroupBy() {
        const selectedContainer = document.getElementById('groupby-selected');
        const availableContainer = document.getElementById('groupby-available');
        const allColumnsWithColors = this.getAllColumnsWithColors();

        // Helper to get color for a column
        const getColorForColumn = (colValue) => {
            const found = allColumnsWithColors.find(c => c.value === colValue);
            return found ? found.color : null;
        };

        // Render selected columns as tags with colors
        if (this.groupBy.length === 0) {
            selectedContainer.innerHTML = '<span class="placeholder">Click columns to add</span>';
        } else {
            selectedContainer.innerHTML = this.groupBy.map(col => {
                const color = getColorForColumn(col);
                const style = color
                    ? `background: ${color.bg}; border: 1px solid ${color.border}; color: ${color.text}`
                    : '';
                return `
                    <span class="groupby-tag" data-column="${col}" style="${style}">
                        ${col}
                        <button class="tag-remove" data-column="${col}">&times;</button>
                    </span>
                `;
            }).join('');

            // Bind remove events
            selectedContainer.querySelectorAll('.tag-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeFromGroupBy(btn.dataset.column);
                });
            });
        }

        // Render available columns (excluding already selected) with colors
        const availableColumns = allColumnsWithColors.filter(c => !this.groupBy.includes(c.value));

        if (availableColumns.length === 0 && allColumnsWithColors.length > 0) {
            availableContainer.innerHTML = '<span class="placeholder-sm">All columns added</span>';
        } else if (allColumnsWithColors.length === 0) {
            availableContainer.innerHTML = '';
        } else {
            availableContainer.innerHTML = availableColumns.map(col => {
                const style = `background: ${col.color.bg}; border: 1px solid ${col.color.border}; color: ${col.color.text}`;
                return `<span class="groupby-option" data-column="${col.value}" style="${style}">${col.value}</span>`;
            }).join('');

            // Bind click events to add
            availableContainer.querySelectorAll('.groupby-option').forEach(option => {
                option.addEventListener('click', () => {
                    this.addToGroupBy(option.dataset.column);
                });
            });
        }
    }

    getColumnsForTable(tableName) {
        const table = this.schema?.tables.find(t => t.name === tableName);
        return table ? table.columns.map(c => c.name) : [];
    }

    // Get columns for a table key (which may be an alias)
    getColumnsForTableKey(tableKey) {
        // Find the table entry by key (alias or name)
        const tableEntry = this.selectedTables.find(t => this.getTableKey(t) === tableKey);
        if (!tableEntry) return [];
        return this.getColumnsForTable(tableEntry.name);
    }

    getAllColumns() {
        const columns = [];
        this.selectedTables.forEach(tableEntry => {
            const tableKey = this.getTableKey(tableEntry);
            const tableCols = this.selectedColumns[tableKey] || this.getColumnsForTable(tableEntry.name);
            tableCols.forEach(col => {
                columns.push(`${tableKey}.${col}`);
            });
        });
        return columns;
    }

    // Get columns with color info for display
    getAllColumnsWithColors() {
        const columns = [];
        this.selectedTables.forEach(tableEntry => {
            const tableKey = this.getTableKey(tableEntry);
            const color = this.tableColors[tableEntry.colorIndex];
            const tableCols = this.selectedColumns[tableKey] || this.getColumnsForTable(tableEntry.name);
            tableCols.forEach(col => {
                columns.push({
                    value: `${tableKey}.${col}`,
                    table: tableKey,
                    column: col,
                    color: color
                });
            });
        });
        return columns;
    }

    buildSQL() {
        if (!this.selectedTables.length) {
            return 'SELECT * FROM table_name;';
        }

        let sql = 'SELECT ';

        // Columns
        const columns = [];
        this.selectedTables.forEach(tableEntry => {
            const tableKey = this.getTableKey(tableEntry);
            const tableCols = this.selectedColumns[tableKey] || [];
            if (tableCols.length === 0) {
                columns.push(`${tableKey}.*`);
            } else {
                tableCols.forEach(col => columns.push(`${tableKey}.${col}`));
            }
        });
        sql += columns.join(', ') || '*';

        // FROM with alias support
        const firstTable = this.selectedTables[0];
        const firstTableKey = this.getTableKey(firstTable);
        sql += `\nFROM ${firstTable.name}`;
        if (firstTable.alias) {
            sql += ` AS ${firstTable.alias}`;
        }

        // JOINs with alias support
        const joinedTables = new Set([firstTableKey]);
        this.joins.forEach(join => {
            if (join.leftColumn && join.rightColumn) {
                // Find which table is new (not in joinedTables)
                const rightTableEntry = this.selectedTables.find(t => this.getTableKey(t) === join.rightTable);
                if (rightTableEntry && !joinedTables.has(join.rightTable)) {
                    sql += `\n${join.type} JOIN ${rightTableEntry.name}`;
                    if (rightTableEntry.alias) {
                        sql += ` AS ${rightTableEntry.alias}`;
                    }
                    sql += ` ON ${join.leftTable}.${join.leftColumn} = ${join.rightTable}.${join.rightColumn}`;
                    joinedTables.add(join.rightTable);
                } else if (!joinedTables.has(join.leftTable)) {
                    const leftTableEntry = this.selectedTables.find(t => this.getTableKey(t) === join.leftTable);
                    if (leftTableEntry) {
                        sql += `\n${join.type} JOIN ${leftTableEntry.name}`;
                        if (leftTableEntry.alias) {
                            sql += ` AS ${leftTableEntry.alias}`;
                        }
                        sql += ` ON ${join.leftTable}.${join.leftColumn} = ${join.rightTable}.${join.rightColumn}`;
                        joinedTables.add(join.leftTable);
                    }
                } else {
                    // Both tables already joined, just add the ON condition
                    sql += `\n${join.type} JOIN ${join.rightTable} ON ${join.leftTable}.${join.leftColumn} = ${join.rightTable}.${join.rightColumn}`;
                }
            }
        });

        // WHERE
        const validConditions = this.conditions.filter(c => c.column);
        if (validConditions.length) {
            sql += '\nWHERE ';
            validConditions.forEach((cond, i) => {
                if (i > 0) sql += ` ${cond.connector} `;

                if (['IS NULL', 'IS NOT NULL'].includes(cond.operator)) {
                    sql += `${cond.column} ${cond.operator}`;
                } else if (['IN', 'NOT IN'].includes(cond.operator)) {
                    sql += `${cond.column} ${cond.operator} (${cond.value})`;
                } else if (['BETWEEN', 'NOT BETWEEN'].includes(cond.operator)) {
                    // Expect value in format "min AND max" or "min, max"
                    let betweenValue = cond.value;
                    if (cond.value.includes(',')) {
                        const parts = cond.value.split(',').map(v => v.trim());
                        if (parts.length === 2) {
                            const min = isNaN(parts[0]) ? `'${parts[0]}'` : parts[0];
                            const max = isNaN(parts[1]) ? `'${parts[1]}'` : parts[1];
                            betweenValue = `${min} AND ${max}`;
                        }
                    }
                    sql += `${cond.column} ${cond.operator} ${betweenValue}`;
                } else {
                    const value = isNaN(cond.value) ? `'${cond.value}'` : cond.value;
                    sql += `${cond.column} ${cond.operator} ${value}`;
                }
            });
        }

        // GROUP BY
        if (this.groupBy.length) {
            sql += `\nGROUP BY ${this.groupBy.join(', ')}`;
        }

        // ORDER BY
        const validOrderBy = this.orderBy.filter(o => o.column);
        if (validOrderBy.length) {
            sql += `\nORDER BY ${validOrderBy.map(o => `${o.column} ${o.direction}`).join(', ')}`;
        }

        // LIMIT & OFFSET
        if (this.limit) {
            sql += `\nLIMIT ${this.limit}`;
            if (this.offset) {
                sql += ` OFFSET ${this.offset}`;
            }
        }

        return sql + ';';
    }

    updateSQLPreview() {
        const sql = this.buildSQL();

        // Update inline SQL preview (in visual builder)
        const previewEl = document.querySelector('#sql-preview code');
        if (previewEl) {
            previewEl.textContent = sql;
            hljs.highlightElement(previewEl);
        }

        // Update bottom panel SQL preview
        const bottomPreviewEl = document.querySelector('#sql-preview-bottom code');
        if (bottomPreviewEl) {
            bottomPreviewEl.textContent = sql;
            hljs.highlightElement(bottomPreviewEl);
        }
    }

    async runQuery() {
        // Delegate based on current query type
        switch (this.currentQueryType) {
            case 'insert':
                return this.runInsert();
            case 'update':
                return this.runUpdate();
            case 'delete':
                return this.runDelete();
            case 'alter':
                return this.runAlter();
            case 'users':
                return this.refreshUsers();
            default:
                return this.runSelect();
        }
    }

    async refreshUsers() {
        if (this.userManager) {
            await this.userManager.loadUsers();
        }
    }

    switchUserSubTab(tabName) {
        // Update tabs
        document.querySelectorAll('.user-sub-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update panels
        document.querySelectorAll('.user-sub-panel').forEach(panel => {
            panel.classList.toggle('active', panel.dataset.panel === tabName);
        });

        // If switching to permissions and user is selected, load permissions
        if (tabName === 'permissions' && this.userManager?.selectedUser) {
            this.permissionManager.setUser(
                this.userManager.selectedUser.username,
                this.userManager.selectedUser.host
            );
        }
    }

    async runSelect() {
        const sql = this.buildSQL();

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/query.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql })
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            this.displayResults(result.data, sql);

            // Also run EXPLAIN
            this.runExplain(sql);

        } catch (error) {
            toast.error('Query error: ' + error.message);
            console.error(error);
        }
    }

    async runInsert() {
        if (!this.insertBuilder) return;

        const data = this.insertBuilder.getData();

        if (!data.table) {
            toast.warning('Please select a table');
            return;
        }

        if (!data.rows.length) {
            toast.warning('Please add at least one row of data');
            return;
        }

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/insert.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            // Show success message
            this.displayInsertResult(result.data);

        } catch (error) {
            toast.error('Insert error: ' + error.message);
            console.error(error);
        }
    }

    displayInsertResult(data) {
        const countEl = document.getElementById('results-count');
        const timeEl = document.getElementById('results-time');
        const noResults = document.getElementById('no-results');
        const table = document.getElementById('results-table');

        countEl.textContent = `${data.affected_rows} row(s) inserted`;
        timeEl.textContent = `${data.execution_time_ms}ms`;

        table.style.display = 'none';
        noResults.style.display = 'flex';
        noResults.innerHTML = `
            <div style="text-align: center;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--color-success); margin-bottom: 8px;">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <div style="font-weight: 600; color: var(--color-success);">Insert Successful</div>
                <div style="margin-top: 4px;">${data.affected_rows} row(s) inserted</div>
                ${data.last_insert_id ? `<div style="color: var(--text-muted); font-size: 11px;">Last Insert ID: ${data.last_insert_id}</div>` : ''}
            </div>
        `;
    }

    async previewUpdate() {
        if (!this.updateBuilder) return;

        const data = this.updateBuilder.getData();

        if (!data.table) {
            toast.warning('Please select a table');
            return;
        }

        if (Object.keys(data.set).length === 0) {
            toast.warning('Please select at least one column to update');
            return;
        }

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/update.php?preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            // Show preview result
            this.displayUpdatePreview(result.data);

        } catch (error) {
            toast.error('Preview error: ' + error.message);
            console.error(error);
        }
    }

    async runUpdate() {
        if (!this.updateBuilder) return;

        const data = this.updateBuilder.getData();

        if (!data.table) {
            toast.warning('Please select a table');
            return;
        }

        if (Object.keys(data.set).length === 0) {
            toast.warning('Please select at least one column to update');
            return;
        }

        // Warn if no WHERE clause
        if (this.updateBuilder.hasNoWhereClause()) {
            const confirmed = confirm(
                '⚠️ WARNING: No WHERE clause specified!\n\n' +
                'This will update ALL rows in the table.\n\n' +
                'Are you sure you want to proceed?'
            );
            if (!confirmed) return;
        }

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/update.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            // Show success message
            this.displayUpdateResult(result.data);

        } catch (error) {
            toast.error('Update error: ' + error.message);
            console.error(error);
        }
    }

    displayUpdatePreview(data) {
        const countEl = document.getElementById('results-count');
        const timeEl = document.getElementById('results-time');
        const noResults = document.getElementById('no-results');
        const table = document.getElementById('results-table');

        countEl.textContent = `${data.affected_count} row(s) will be affected`;
        timeEl.textContent = 'Preview';

        table.style.display = 'none';
        noResults.style.display = 'flex';

        const warningClass = !data.has_where_clause ? 'color: var(--color-warning);' : '';

        noResults.innerHTML = `
            <div style="text-align: center;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--color-info); margin-bottom: 8px;">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                </svg>
                <div style="font-weight: 600; color: var(--color-info);">Update Preview</div>
                <div style="margin-top: 4px; ${warningClass}">${data.affected_count} row(s) will be affected</div>
                ${!data.has_where_clause ? `<div style="color: var(--color-warning); font-size: 11px; margin-top: 4px;">⚠️ No WHERE clause - ALL rows will be updated!</div>` : ''}
            </div>
        `;
    }

    displayUpdateResult(data) {
        const countEl = document.getElementById('results-count');
        const timeEl = document.getElementById('results-time');
        const noResults = document.getElementById('no-results');
        const table = document.getElementById('results-table');

        countEl.textContent = `${data.affected_rows} row(s) updated`;
        timeEl.textContent = `${data.execution_time_ms}ms`;

        table.style.display = 'none';
        noResults.style.display = 'flex';
        noResults.innerHTML = `
            <div style="text-align: center;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--color-success); margin-bottom: 8px;">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <div style="font-weight: 600; color: var(--color-success);">Update Successful</div>
                <div style="margin-top: 4px;">${data.affected_rows} row(s) updated</div>
            </div>
        `;
    }

    async previewDelete() {
        if (!this.deleteBuilder) return;

        const data = this.deleteBuilder.getData();

        if (!data.table) {
            toast.warning('Please select a table');
            return;
        }

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/delete.php?preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            // Show preview result
            this.displayDeletePreview(result.data);

        } catch (error) {
            toast.error('Preview error: ' + error.message);
            console.error(error);
        }
    }

    async runDelete() {
        if (!this.deleteBuilder) return;

        const data = this.deleteBuilder.getData();

        if (!data.table) {
            toast.warning('Please select a table');
            return;
        }

        // If no WHERE clause, require type-to-confirm
        if (this.deleteBuilder.hasNoWhereClause()) {
            const tableName = this.deleteBuilder.getTableName();
            const confirmed = await this.typeToConfirm.show({
                title: 'Confirm Delete All Rows',
                message: `This will delete ALL rows from "${tableName}"`,
                details: 'This action cannot be undone.',
                confirmWord: tableName,
                confirmButtonText: 'Delete All'
            });

            if (!confirmed) return;
        }

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/delete.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            // Show success message
            this.displayDeleteResult(result.data);

        } catch (error) {
            toast.error('Delete error: ' + error.message);
            console.error(error);
        }
    }

    displayDeletePreview(data) {
        const countEl = document.getElementById('results-count');
        const timeEl = document.getElementById('results-time');
        const noResults = document.getElementById('no-results');
        const table = document.getElementById('results-table');

        countEl.textContent = `${data.affected_count} row(s) will be deleted`;
        timeEl.textContent = 'Preview';

        // If there are sample rows, show them in the table
        if (data.sample_rows && data.sample_rows.length > 0) {
            table.style.display = '';
            noResults.style.display = 'none';

            const columns = Object.keys(data.sample_rows[0]);

            table.querySelector('thead').innerHTML = `
                <tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr>
            `;

            table.querySelector('tbody').innerHTML = data.sample_rows.map(row => `
                <tr style="background: rgba(var(--color-danger-rgb, 239, 68, 68), 0.1);">
                    ${columns.map(c => `<td>${row[c] ?? 'NULL'}</td>`).join('')}
                </tr>
            `).join('');

            // Add warning message above table
            if (data.affected_count > 10) {
                noResults.style.display = 'flex';
                noResults.innerHTML = `<div style="color: var(--text-muted); font-size: 11px;">Showing first 10 of ${data.affected_count} rows to be deleted</div>`;
            }
        } else {
            table.style.display = 'none';
            noResults.style.display = 'flex';

            const dangerStyle = !data.has_where_clause ? 'color: var(--color-danger);' : 'color: var(--color-warning);';

            noResults.innerHTML = `
                <div style="text-align: center;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="${dangerStyle} margin-bottom: 8px;">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        <line x1="10" y1="11" x2="10" y2="17"/>
                        <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                    <div style="font-weight: 600; ${dangerStyle}">Delete Preview</div>
                    <div style="margin-top: 4px; ${dangerStyle}">${data.affected_count} row(s) will be deleted</div>
                    ${!data.has_where_clause ? `<div style="color: var(--color-danger); font-size: 11px; margin-top: 4px;">⚠️ No WHERE clause - ALL rows will be deleted!</div>` : ''}
                </div>
            `;
        }
    }

    displayDeleteResult(data) {
        const countEl = document.getElementById('results-count');
        const timeEl = document.getElementById('results-time');
        const noResults = document.getElementById('no-results');
        const table = document.getElementById('results-table');

        countEl.textContent = `${data.affected_rows} row(s) deleted`;
        timeEl.textContent = `${data.execution_time_ms}ms`;

        table.style.display = 'none';
        noResults.style.display = 'flex';
        noResults.innerHTML = `
            <div style="text-align: center;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--color-success); margin-bottom: 8px;">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <div style="font-weight: 600; color: var(--color-success);">Delete Successful</div>
                <div style="margin-top: 4px;">${data.affected_rows} row(s) deleted</div>
            </div>
        `;
    }

    async runAlter() {
        if (!this.alterBuilder) return;

        const data = this.alterBuilder.getData();

        if (!data.table) {
            toast.warning('Please select a table');
            return;
        }

        if (!data.operations.length) {
            toast.warning('Please add at least one operation');
            return;
        }

        // Confirm if there are dangerous operations
        if (this.alterBuilder.hasDangerousOperations()) {
            const confirmed = await this.typeToConfirm.show({
                title: 'Confirm ALTER Operations',
                message: 'This ALTER contains DROP operations',
                details: 'Some operations cannot be undone. Please review carefully.',
                confirmWord: 'ALTER',
                confirmButtonText: 'Execute ALTER'
            });

            if (!confirmed) return;
        }

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/alter.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            // Show success message
            this.displayAlterResult(result.data);

            // Refresh schema to reflect changes
            await this.loadSchema();

            // Clear the operations queue
            this.alterBuilder.clear();

        } catch (error) {
            toast.error('ALTER error: ' + error.message);
            console.error(error);
        }
    }

    displayAlterResult(data) {
        const countEl = document.getElementById('results-count');
        const timeEl = document.getElementById('results-time');
        const noResults = document.getElementById('no-results');
        const table = document.getElementById('results-table');

        countEl.textContent = `${data.operations_count} operation(s) executed`;
        timeEl.textContent = `${data.execution_time_ms}ms`;

        table.style.display = 'none';
        noResults.style.display = 'flex';
        noResults.innerHTML = `
            <div style="text-align: center;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--color-success); margin-bottom: 8px;">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <div style="font-weight: 600; color: var(--color-success);">ALTER Successful</div>
                <div style="margin-top: 4px;">${data.operations_count} operation(s) completed</div>
                <div style="color: var(--text-muted); font-size: 11px; margin-top: 4px;">Schema has been refreshed</div>
            </div>
        `;
    }

    async runExplain(sql) {
        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/query.php?explain`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql })
            });

            const result = await response.json();

            if (!result.error) {
                this.displayExplain(result.data.rows);
            }
        } catch (error) {
            console.error('Explain error:', error);
        }
    }

    displayResults(data, sql = null) {
        const table = document.getElementById('results-table');
        const noResults = document.getElementById('no-results');
        const countEl = document.getElementById('results-count');
        const timeEl = document.getElementById('results-time');
        const badge = document.getElementById('results-badge');

        countEl.textContent = `${data.row_count} rows`;
        timeEl.textContent = `${data.execution_time_ms}ms`;

        // Update results badge
        if (badge) {
            badge.textContent = data.row_count > 0 ? data.row_count : '';
        }

        // Store results for export
        this.lastResults = data;

        // Add to history
        if (sql) {
            this.queryHistory.addQuery(sql, 'SELECT', data.row_count, data.execution_time_ms);
        }

        // Switch to results tab in bottom panel
        this.switchBottomTab('results');

        if (!data.rows.length) {
            table.style.display = 'none';
            noResults.style.display = 'flex';
            noResults.textContent = 'Query returned no results';
            return;
        }

        table.style.display = '';
        noResults.style.display = 'none';

        const columns = Object.keys(data.rows[0]);

        table.querySelector('thead').innerHTML = `
            <tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr>
        `;

        table.querySelector('tbody').innerHTML = data.rows.map(row => `
            <tr>${columns.map(c => `<td>${row[c] ?? 'NULL'}</td>`).join('')}</tr>
        `).join('');
    }

    displayExplain(rows) {
        const container = document.getElementById('explain-container');

        if (!rows.length) {
            container.innerHTML = '<div class="no-results">No explain data available</div>';
            return;
        }

        const columns = Object.keys(rows[0]);

        container.innerHTML = `
            <table class="results-table">
                <thead>
                    <tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>${columns.map(c => `<td>${row[c] ?? 'NULL'}</td>`).join('')}</tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    // Export methods
    exportSQL() {
        const sql = this.buildSQL();
        if (!sql || sql === 'SELECT * FROM table_name;') {
            toast.warning('No query to export');
            return;
        }
        this.queryExport.exportSQL(sql, 'query');
    }

    exportCSV() {
        if (!this.lastResults || !this.lastResults.rows || !this.lastResults.rows.length) {
            toast.warning('No results to export. Run a query first.');
            return;
        }
        this.queryExport.exportCSV(this.lastResults.rows, 'results');
    }

    exportJSON() {
        if (!this.lastResults || !this.lastResults.rows || !this.lastResults.rows.length) {
            toast.warning('No results to export. Run a query first.');
            return;
        }
        this.queryExport.exportJSON(this.lastResults.rows, 'results');
    }

    // History methods
    toggleHistory() {
        const sidebar = document.getElementById('history-sidebar');
        if (sidebar) {
            sidebar.classList.toggle('open');
            if (sidebar.classList.contains('open')) {
                this.renderHistory();
            }
        }
    }

    renderHistory() {
        const container = document.getElementById('history-list');
        if (!container) return;

        const history = this.queryHistory.getHistory();

        if (!history.length) {
            container.innerHTML = '<div class="placeholder">No queries in history</div>';
            return;
        }

        container.innerHTML = history.map(entry => `
            <div class="saved-query-item" data-id="${entry.id}">
                <div class="query-item-header">
                    <span class="query-type-icon">${this.queryHistory.getTypeIcon(entry.type)}</span>
                    <span class="query-title">${entry.type}</span>
                    <span class="history-time">${this.queryHistory.formatTimestamp(entry.timestamp)}</span>
                </div>
                <div class="query-description" style="font-family: var(--font-mono); font-size: 11px;">${this.escapeHtml(this.truncateSQL(entry.sql, 100))}</div>
                <div class="query-item-footer">
                    <span class="query-meta">
                        ${entry.rowCount !== null ? `<span>${entry.rowCount} rows</span>` : ''}
                        ${entry.executionTime !== null ? `<span>${entry.executionTime}ms</span>` : ''}
                    </span>
                    <div class="query-actions">
                        <button class="btn-sm btn-load" data-id="${entry.id}" title="Load Query">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                            Load
                        </button>
                        <button class="btn-icon btn-delete" data-id="${entry.id}" title="Remove from history">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        // Bind events
        container.querySelectorAll('.btn-load').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.useHistoryQuery(id);
            });
        });

        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.queryHistory.removeEntry(id);
                this.renderHistory();
            });
        });

        // Click on item to use
        container.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    const id = parseInt(item.dataset.id);
                    this.useHistoryQuery(id);
                }
            });
        });
    }

    useHistoryQuery(id) {
        const history = this.queryHistory.getHistory();
        const entry = history.find(h => h.id === id);
        if (!entry) return;

        // Parse SQL and populate query builder
        this.loadFromSQL(entry.sql, entry.type.toLowerCase());

        // Close history sidebar
        document.getElementById('history-sidebar')?.classList.remove('open');

        toast.success('Query loaded');
    }

    /**
     * Parse SQL and populate the query builder
     */
    loadFromSQL(sql, queryType = 'select') {
        // Detect query type from SQL if not provided
        const sqlUpper = sql.trim().toUpperCase();
        if (sqlUpper.startsWith('SELECT')) queryType = 'select';
        else if (sqlUpper.startsWith('INSERT')) queryType = 'insert';
        else if (sqlUpper.startsWith('UPDATE')) queryType = 'update';
        else if (sqlUpper.startsWith('DELETE')) queryType = 'delete';
        else if (sqlUpper.startsWith('ALTER')) queryType = 'alter';

        // Switch to correct query type
        this.switchQueryType(queryType);

        // Update SQL preview
        const bottomPreviewEl = document.querySelector('#sql-preview-bottom code');
        if (bottomPreviewEl) {
            bottomPreviewEl.textContent = sql;
            hljs.highlightElement(bottomPreviewEl);
        }

        // Parse and populate based on query type
        if (queryType === 'select') {
            this.parseAndLoadSelectQuery(sql);
        } else {
            // For other types, just show the SQL in their respective editors
            const editorEl = document.getElementById('sql-editor');
            if (editorEl) {
                editorEl.value = sql;
            }
        }
    }

    /**
     * Parse SELECT query and populate the builder
     */
    parseAndLoadSelectQuery(sql) {
        // Clear current state
        this.selectedTables = [];
        this.selectedColumns = {};
        this.joins = [];
        this.conditions = [];
        this.orderBy = [];
        this.groupBy = [];
        this.limit = null;
        this.offset = null;

        // Helper to find schema table (case-insensitive)
        const findSchemaTable = (name) => {
            if (!this.schema) return null;
            return Object.keys(this.schema).find(t => t.toLowerCase() === name.toLowerCase());
        };

        try {
            // Extract table from FROM clause (handles: FROM table, FROM table alias, FROM table AS alias)
            const fromMatch = sql.match(/FROM\s+`?(\w+)`?(?:\s+(?:AS\s+)?`?(\w+)`?)?/i);
            if (fromMatch) {
                const tableName = fromMatch[1];
                // Check if second match is actually a keyword (JOIN, WHERE, etc.)
                const keywords = ['join', 'left', 'right', 'inner', 'outer', 'cross', 'where', 'group', 'order', 'limit', 'having'];
                let alias = fromMatch[2] || '';
                if (keywords.includes(alias.toLowerCase())) {
                    alias = '';
                }

                const schemaTable = findSchemaTable(tableName);
                const actualTableName = schemaTable || tableName;

                this.selectedTables.push({
                    name: actualTableName,
                    alias: alias,
                    colorIndex: this.nextColorIndex++
                });

                if (!schemaTable) {
                    console.warn(`Table "${tableName}" not found in schema, using as-is`);
                }
            }

            // Extract JOINs first (to know all tables before parsing columns)
            const joinRegex = /(LEFT|RIGHT|INNER|OUTER|CROSS)?\s*JOIN\s+`?(\w+)`?(?:\s+(?:AS\s+)?`?(\w+)`?)?\s+ON\s+(.+?)(?=(?:LEFT|RIGHT|INNER|OUTER|CROSS)?\s*JOIN|WHERE|GROUP|ORDER|LIMIT|$)/gi;
            let joinMatch;
            while ((joinMatch = joinRegex.exec(sql)) !== null) {
                const joinType = (joinMatch[1] || 'INNER').toUpperCase();
                const joinTable = joinMatch[2];
                const joinAlias = joinMatch[3] || '';
                const onClause = joinMatch[4].trim();

                const schemaTable = findSchemaTable(joinTable);
                const actualJoinTable = schemaTable || joinTable;

                this.selectedTables.push({
                    name: actualJoinTable,
                    alias: joinAlias,
                    colorIndex: this.nextColorIndex++
                });

                // Parse ON clause
                const onMatch = onClause.match(/`?(\w+)`?\.`?(\w+)`?\s*=\s*`?(\w+)`?\.`?(\w+)`?/);
                if (onMatch) {
                    this.joins.push({
                        leftTable: onMatch[1],
                        leftColumn: onMatch[2],
                        rightTable: onMatch[3],
                        rightColumn: onMatch[4],
                        type: joinType
                    });
                }
            }

            // Now parse columns from SELECT clause
            // Build a map of alias/name -> actual table name
            const tableMap = {};
            this.selectedTables.forEach(t => {
                const key = t.alias || t.name;
                tableMap[key.toLowerCase()] = t.name;
                tableMap[t.name.toLowerCase()] = t.name;
            });

            const selectMatch = sql.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
            if (selectMatch) {
                const columnsStr = selectMatch[1].trim();

                // Handle SELECT * or SELECT DISTINCT * - select all columns from all tables
                const isSelectAll = /^(DISTINCT\s+)?\*$/i.test(columnsStr);
                if (isSelectAll) {
                    this.selectedTables.forEach(tableEntry => {
                        const tableKey = tableEntry.alias || tableEntry.name;
                        const schemaTable = findSchemaTable(tableEntry.name);
                        if (schemaTable && this.schema[schemaTable]) {
                            this.selectedColumns[tableKey] = this.schema[schemaTable].columns.map(c => c.name);
                        }
                    });
                } else {
                    // Parse individual columns
                    // Split by comma, but be careful with functions like COUNT(*)
                    const columnParts = [];
                    let depth = 0;
                    let current = '';
                    for (const char of columnsStr) {
                        if (char === '(') depth++;
                        else if (char === ')') depth--;
                        else if (char === ',' && depth === 0) {
                            columnParts.push(current.trim());
                            current = '';
                            continue;
                        }
                        current += char;
                    }
                    if (current.trim()) columnParts.push(current.trim());

                    columnParts.forEach(colExpr => {
                        // Remove backticks and handle aliases (AS keyword or space)
                        let col = colExpr.replace(/`/g, '').trim();

                        // Remove column alias (e.g., "col AS alias" or "col alias")
                        const asMatch = col.match(/^(.+?)\s+(?:AS\s+)?(\w+)$/i);
                        if (asMatch && !col.includes('(')) {
                            col = asMatch[1].trim();
                        }

                        // Handle table.* (select all from specific table)
                        const tableStarMatch = col.match(/^(\w+)\.\*$/);
                        if (tableStarMatch) {
                            const tableRef = tableStarMatch[1];
                            const actualTable = tableMap[tableRef.toLowerCase()];
                            if (actualTable) {
                                const tableEntry = this.selectedTables.find(t =>
                                    t.name.toLowerCase() === actualTable.toLowerCase() ||
                                    (t.alias && t.alias.toLowerCase() === tableRef.toLowerCase())
                                );
                                const tableKey = tableEntry ? (tableEntry.alias || tableEntry.name) : tableRef;
                                const schemaTable = findSchemaTable(actualTable);
                                if (schemaTable && this.schema[schemaTable]) {
                                    this.selectedColumns[tableKey] = this.schema[schemaTable].columns.map(c => c.name);
                                }
                            }
                            return;
                        }

                        // Handle table.column format
                        const tableColMatch = col.match(/^(\w+)\.(\w+)$/);
                        if (tableColMatch) {
                            const tableRef = tableColMatch[1];
                            const colName = tableColMatch[2];
                            const actualTable = tableMap[tableRef.toLowerCase()];

                            if (actualTable) {
                                const tableEntry = this.selectedTables.find(t =>
                                    t.name.toLowerCase() === actualTable.toLowerCase() ||
                                    (t.alias && t.alias.toLowerCase() === tableRef.toLowerCase())
                                );
                                const tableKey = tableEntry ? (tableEntry.alias || tableEntry.name) : tableRef;

                                if (!this.selectedColumns[tableKey]) {
                                    this.selectedColumns[tableKey] = [];
                                }

                                // Find actual column name from schema (case-insensitive)
                                const schemaTable = findSchemaTable(actualTable);
                                if (schemaTable && this.schema[schemaTable]) {
                                    const schemaCol = this.schema[schemaTable].columns.find(
                                        c => c.name.toLowerCase() === colName.toLowerCase()
                                    );
                                    if (schemaCol && !this.selectedColumns[tableKey].includes(schemaCol.name)) {
                                        this.selectedColumns[tableKey].push(schemaCol.name);
                                    }
                                } else if (!this.selectedColumns[tableKey].includes(colName)) {
                                    this.selectedColumns[tableKey].push(colName);
                                }
                            }
                        } else if (!col.includes('(')) {
                            // Simple column name without table prefix - assign to first table
                            const firstTable = this.selectedTables[0];
                            if (firstTable) {
                                const tableKey = firstTable.alias || firstTable.name;
                                if (!this.selectedColumns[tableKey]) {
                                    this.selectedColumns[tableKey] = [];
                                }

                                const schemaTable = findSchemaTable(firstTable.name);
                                if (schemaTable && this.schema[schemaTable]) {
                                    const schemaCol = this.schema[schemaTable].columns.find(
                                        c => c.name.toLowerCase() === col.toLowerCase()
                                    );
                                    if (schemaCol && !this.selectedColumns[tableKey].includes(schemaCol.name)) {
                                        this.selectedColumns[tableKey].push(schemaCol.name);
                                    }
                                } else if (!this.selectedColumns[tableKey].includes(col)) {
                                    this.selectedColumns[tableKey].push(col);
                                }
                            }
                        }
                    });
                }
            }

            // If no columns were selected for any table, select all columns
            this.selectedTables.forEach(tableEntry => {
                const tableKey = tableEntry.alias || tableEntry.name;
                if (!this.selectedColumns[tableKey] || this.selectedColumns[tableKey].length === 0) {
                    const schemaTable = findSchemaTable(tableEntry.name);
                    if (schemaTable && this.schema[schemaTable]) {
                        this.selectedColumns[tableKey] = this.schema[schemaTable].columns.map(c => c.name);
                    }
                }
            });

            // Extract WHERE conditions
            const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?=GROUP|ORDER|LIMIT|$)/i);
            if (whereMatch) {
                const whereClause = whereMatch[1].trim();
                // Simple condition parsing - split by AND
                const conditions = whereClause.split(/\s+AND\s+/i);
                conditions.forEach(cond => {
                    const condMatch = cond.match(/`?(\w+)`?(?:\.`?(\w+)`?)?\s*(=|!=|<>|>|<|>=|<=|LIKE|NOT LIKE|IN|NOT IN|IS NULL|IS NOT NULL)\s*(.+)?/i);
                    if (condMatch) {
                        const column = condMatch[2] || condMatch[1];
                        const operator = condMatch[3].toUpperCase();
                        let value = condMatch[4] || '';
                        value = value.replace(/^['"]|['"]$/g, '').trim();

                        this.conditions.push({
                            column: column,
                            operator: operator,
                            value: value,
                            connector: 'AND'
                        });
                    }
                });
            }

            // Extract ORDER BY
            const orderMatch = sql.match(/ORDER\s+BY\s+([\s\S]+?)(?=LIMIT|$)/i);
            if (orderMatch) {
                const orderClause = orderMatch[1].trim();
                const orders = orderClause.split(',');
                orders.forEach(order => {
                    const orderParts = order.trim().split(/\s+/);
                    const column = orderParts[0].replace(/`/g, '').split('.').pop();
                    const direction = (orderParts[1] || 'ASC').toUpperCase();
                    this.orderBy.push({ column, direction });
                });
            }

            // Extract GROUP BY
            const groupMatch = sql.match(/GROUP\s+BY\s+([\s\S]+?)(?=HAVING|ORDER|LIMIT|$)/i);
            if (groupMatch) {
                const groupClause = groupMatch[1].trim();
                const groups = groupClause.split(',');
                groups.forEach(group => {
                    const column = group.trim().replace(/`/g, '').split('.').pop();
                    this.groupBy.push(column);
                });
            }

            // Extract LIMIT and OFFSET
            const limitMatch = sql.match(/LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i);
            if (limitMatch) {
                this.limit = parseInt(limitMatch[1]);
                if (limitMatch[2]) {
                    this.offset = parseInt(limitMatch[2]);
                }
            }

        } catch (e) {
            console.warn('Failed to parse SQL:', e);
        }

        // Update UI
        this.renderSelectedTables();
        this.renderColumns();
        this.renderJoins();
        this.renderConditions();
        this.renderOrderBy();
        this.renderGroupBy();
        this.updateLimitOffsetInputs();
        this.updateSQLPreview();
    }

    searchHistory(query) {
        const results = this.queryHistory.search(query);
        const container = document.getElementById('history-list');
        if (!container) return;

        if (!results.length) {
            container.innerHTML = `<div class="placeholder">No matches found for "${this.escapeHtml(query)}"</div>`;
            return;
        }

        // Reuse same design as renderHistory
        container.innerHTML = results.map(entry => `
            <div class="saved-query-item" data-id="${entry.id}">
                <div class="query-item-header">
                    <span class="query-type-icon">${this.queryHistory.getTypeIcon(entry.type)}</span>
                    <span class="query-title">${entry.type}</span>
                    <span class="history-time">${this.queryHistory.formatTimestamp(entry.timestamp)}</span>
                </div>
                <div class="query-description" style="font-family: var(--font-mono); font-size: 11px;">${this.escapeHtml(this.truncateSQL(entry.sql, 100))}</div>
                <div class="query-item-footer">
                    <span class="query-meta">
                        ${entry.rowCount !== null ? `<span>${entry.rowCount} rows</span>` : ''}
                        ${entry.executionTime !== null ? `<span>${entry.executionTime}ms</span>` : ''}
                    </span>
                    <div class="query-actions">
                        <button class="btn-sm btn-load" data-id="${entry.id}" title="Load Query">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                            Load
                        </button>
                        <button class="btn-icon btn-delete" data-id="${entry.id}" title="Remove from history">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        // Bind events
        container.querySelectorAll('.btn-load').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.useHistoryQuery(id);
            });
        });

        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.queryHistory.removeEntry(id);
                this.searchHistory(query);
            });
        });
    }

    truncateSQL(sql, maxLength) {
        if (sql.length <= maxLength) return sql;
        return sql.substring(0, maxLength) + '...';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    clearDropZone(dropZoneId) {
        const dropZone = document.getElementById(dropZoneId);
        if (dropZone) {
            dropZone.innerHTML = '<div class="placeholder">Drag a table here or double-click from sidebar</div>';
            dropZone.classList.remove('has-table');
        }
    }

    clearSelect() {
        this.selectedTables = [];
        this.selectedColumns = {};
        this.joins = [];
        this.conditions = [];
        this.orderBy = [];
        this.groupBy = [];
        this.limit = null;
        this.offset = null;

        document.getElementById('limit-input').value = '';
        document.getElementById('offset-input').value = '';

        this.renderSelectedTables();
        this.renderColumns();
        this.renderJoins();
        this.renderConditions();
        this.renderOrderBy();
        this.renderGroupBy();
        this.updateSQLPreview();
    }

    clearInsert() {
        if (this.insertBuilder) {
            this.insertBuilder.clear();
            this.clearDropZone('insert-table-drop');
        }
    }

    clearUpdate() {
        if (this.updateBuilder) {
            this.updateBuilder.clear();
            this.clearDropZone('update-table-drop');
        }
    }

    clearDelete() {
        if (this.deleteBuilder) {
            this.deleteBuilder.clear();
            this.clearDropZone('delete-table-drop');
        }
    }

    clearAlter() {
        if (this.alterBuilder) {
            this.alterBuilder.clear();
            this.clearDropZone('alter-table-drop');
        }
    }

    clearAll() {
        // Clear all query builders
        this.clearSelect();
        this.clearInsert();
        this.clearUpdate();
        this.clearDelete();
        this.clearAlter();

        if (this.userManager) {
            this.userManager.clear();
        }

        // Clear results
        document.getElementById('results-table').querySelector('thead').innerHTML = '';
        document.getElementById('results-table').querySelector('tbody').innerHTML = '';
        document.getElementById('no-results').style.display = 'flex';
        document.getElementById('no-results').textContent = 'Run a query to see results';
        document.getElementById('results-count').textContent = '';
        document.getElementById('results-time').textContent = '';
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.queryBuilder = new QueryBuilder();

    // Bind theme toggle buttons
    themeManager.bindToggleButtons();
});

export default QueryBuilder;
