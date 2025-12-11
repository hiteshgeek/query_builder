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

hljs.registerLanguage('sql', sql);

// Initialize theme manager globally
const themeManager = new ThemeManager();

class QueryBuilder {
    constructor() {
        this.schema = null;
        this.selectedTables = [];
        this.selectedColumns = {}; // { tableName: [columns] }
        this.joins = [];
        this.conditions = [];
        this.orderBy = [];
        this.groupBy = [];
        this.limit = null;
        this.offset = null;

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

        // DISTINCT option
        this.distinct = false;

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
        const previewEl = document.querySelector('#insert-sql-preview code');
        if (previewEl) {
            previewEl.textContent = sql;
            hljs.highlightElement(previewEl);
        }
    }

    updateUpdateSQLPreview(sql) {
        const previewEl = document.querySelector('#update-sql-preview code');
        if (previewEl) {
            previewEl.textContent = sql;
            hljs.highlightElement(previewEl);
        }
    }

    updateDeleteSQLPreview(sql) {
        const previewEl = document.querySelector('#delete-sql-preview code');
        if (previewEl) {
            previewEl.textContent = sql;
            hljs.highlightElement(previewEl);
        }
    }

    updateAlterSQLPreview(sql) {
        const previewEl = document.querySelector('#alter-sql-preview code');
        if (previewEl) {
            previewEl.textContent = sql;
            hljs.highlightElement(previewEl);
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

        // Clear
        document.getElementById('btn-clear')?.addEventListener('click', () => this.clearAll());

        // Add controls
        document.getElementById('btn-add-join')?.addEventListener('click', () => this.addJoinRow());
        document.getElementById('btn-add-condition')?.addEventListener('click', () => this.addConditionRow());
        document.getElementById('btn-add-orderby')?.addEventListener('click', () => this.addOrderByRow());

        // Limit/Offset
        document.getElementById('limit-input')?.addEventListener('input', (e) => {
            this.limit = e.target.value ? parseInt(e.target.value) : null;
            this.updateSQLPreview();
        });
        document.getElementById('offset-input')?.addEventListener('input', (e) => {
            this.offset = e.target.value ? parseInt(e.target.value) : null;
            this.updateSQLPreview();
        });

        // DISTINCT checkbox
        document.getElementById('distinct-checkbox')?.addEventListener('change', (e) => {
            this.distinct = e.target.checked;
            this.updateSQLPreview();
        });

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
                this.addTable(tableName);
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

    addTable(tableName) {
        if (this.selectedTables.includes(tableName)) return;

        this.selectedTables.push(tableName);

        // Initialize with all columns selected
        const table = this.schema.tables.find(t => t.name === tableName);
        if (table) {
            this.selectedColumns[tableName] = table.columns.map(c => c.name);
        }

        this.renderSelectedTables();
        this.renderGroupBy();
        this.updateSQLPreview();
    }

    removeTable(tableName) {
        this.selectedTables = this.selectedTables.filter(t => t !== tableName);
        delete this.selectedColumns[tableName];

        // Remove joins referencing this table
        this.joins = this.joins.filter(j => j.leftTable !== tableName && j.rightTable !== tableName);

        // Remove conditions referencing this table
        this.conditions = this.conditions.filter(c => !c.column.startsWith(tableName + '.'));

        this.renderSelectedTables();
        this.renderJoins();
        this.renderConditions();
        this.renderGroupBy();
        this.updateSQLPreview();
    }

    toggleColumn(tableName, columnName) {
        if (!this.selectedTables.includes(tableName)) {
            this.addTable(tableName);
        }

        if (!this.selectedColumns[tableName]) {
            this.selectedColumns[tableName] = [];
        }

        const index = this.selectedColumns[tableName].indexOf(columnName);
        if (index === -1) {
            this.selectedColumns[tableName].push(columnName);
        } else {
            this.selectedColumns[tableName].splice(index, 1);
        }

        this.updateSQLPreview();
    }

    renderSelectedTables() {
        const container = document.getElementById('selected-tables');

        if (!this.selectedTables.length) {
            container.innerHTML = '<div class="placeholder">Drag tables here or click to add</div>';
            return;
        }

        container.innerHTML = this.selectedTables.map(tableName => `
            <div class="selected-table" data-table="${tableName}">
                ${tableName}
                <button class="remove-btn" data-table="${tableName}">&times;</button>
            </div>
        `).join('');

        container.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeTable(btn.dataset.table);
            });
        });
    }

    addJoinRow() {
        if (this.selectedTables.length < 2) {
            alert('Add at least 2 tables to create a join');
            return;
        }

        this.joins.push({
            type: 'INNER',
            leftTable: this.selectedTables[0],
            leftColumn: '',
            rightTable: this.selectedTables[1],
            rightColumn: ''
        });

        this.renderJoins();
    }

    renderJoins() {
        const container = document.getElementById('joins-container');

        container.innerHTML = this.joins.map((join, index) => `
            <div class="join-row" data-index="${index}">
                <select class="join-type">
                    <option value="INNER" ${join.type === 'INNER' ? 'selected' : ''}>INNER JOIN</option>
                    <option value="LEFT" ${join.type === 'LEFT' ? 'selected' : ''}>LEFT JOIN</option>
                    <option value="RIGHT" ${join.type === 'RIGHT' ? 'selected' : ''}>RIGHT JOIN</option>
                </select>
                <select class="left-table">
                    ${this.selectedTables.map(t => `<option value="${t}" ${join.leftTable === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
                <select class="left-column">
                    ${this.getColumnsForTable(join.leftTable).map(c => `<option value="${c}" ${join.leftColumn === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
                <span>=</span>
                <select class="right-table">
                    ${this.selectedTables.map(t => `<option value="${t}" ${join.rightTable === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
                <select class="right-column">
                    ${this.getColumnsForTable(join.rightTable).map(c => `<option value="${c}" ${join.rightColumn === c ? 'selected' : ''}>${c}</option>`).join('')}
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
            alert('Add at least one table first');
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

    addOrderByRow() {
        if (!this.selectedTables.length) {
            alert('Add at least one table first');
            return;
        }

        this.orderBy.push({
            column: '',
            direction: 'ASC'
        });

        this.renderOrderBy();
    }

    renderOrderBy() {
        const container = document.getElementById('orderby-container');
        const allColumns = this.getAllColumns();

        container.innerHTML = this.orderBy.map((order, index) => `
            <div class="orderby-row" data-index="${index}">
                <select class="column">
                    <option value="">Select column</option>
                    ${allColumns.map(c => `<option value="${c}" ${order.column === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
                <select class="direction">
                    <option value="ASC" ${order.direction === 'ASC' ? 'selected' : ''}>ASC</option>
                    <option value="DESC" ${order.direction === 'DESC' ? 'selected' : ''}>DESC</option>
                </select>
                <button class="remove-btn">&times;</button>
            </div>
        `).join('');

        container.querySelectorAll('.orderby-row').forEach((row, index) => {
            row.querySelector('.column').addEventListener('change', (e) => {
                this.orderBy[index].column = e.target.value;
                this.updateSQLPreview();
            });
            row.querySelector('.direction').addEventListener('change', (e) => {
                this.orderBy[index].direction = e.target.value;
                this.updateSQLPreview();
            });
            row.querySelector('.remove-btn').addEventListener('click', () => {
                this.orderBy.splice(index, 1);
                this.renderOrderBy();
                this.updateSQLPreview();
            });
        });
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
        const allColumns = this.getAllColumns();

        // Render selected columns as tags
        if (this.groupBy.length === 0) {
            selectedContainer.innerHTML = '<span class="placeholder">Click columns to add</span>';
        } else {
            selectedContainer.innerHTML = this.groupBy.map(col => `
                <span class="groupby-tag" data-column="${col}">
                    ${col}
                    <button class="tag-remove" data-column="${col}">&times;</button>
                </span>
            `).join('');

            // Bind remove events
            selectedContainer.querySelectorAll('.tag-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeFromGroupBy(btn.dataset.column);
                });
            });
        }

        // Render available columns (excluding already selected)
        const availableColumns = allColumns.filter(c => !this.groupBy.includes(c));

        if (availableColumns.length === 0 && allColumns.length > 0) {
            availableContainer.innerHTML = '<span class="placeholder-sm">All columns added</span>';
        } else if (allColumns.length === 0) {
            availableContainer.innerHTML = '';
        } else {
            availableContainer.innerHTML = availableColumns.map(col => `
                <span class="groupby-option" data-column="${col}">${col}</span>
            `).join('');

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

    getAllColumns() {
        const columns = [];
        this.selectedTables.forEach(tableName => {
            const tableCols = this.selectedColumns[tableName] || this.getColumnsForTable(tableName);
            tableCols.forEach(col => {
                columns.push(`${tableName}.${col}`);
            });
        });
        return columns;
    }

    buildSQL() {
        if (!this.selectedTables.length) {
            return 'SELECT * FROM table_name;';
        }

        let sql = 'SELECT ';

        // DISTINCT
        if (this.distinct) {
            sql += 'DISTINCT ';
        }

        // Columns
        const columns = [];
        this.selectedTables.forEach(tableName => {
            const tableCols = this.selectedColumns[tableName] || [];
            if (tableCols.length === 0) {
                columns.push(`${tableName}.*`);
            } else {
                tableCols.forEach(col => columns.push(`${tableName}.${col}`));
            }
        });
        sql += columns.join(', ') || '*';

        // FROM
        sql += `\nFROM ${this.selectedTables[0]}`;

        // JOINs
        this.joins.forEach(join => {
            if (join.leftColumn && join.rightColumn) {
                sql += `\n${join.type} JOIN ${join.rightTable} ON ${join.leftTable}.${join.leftColumn} = ${join.rightTable}.${join.rightColumn}`;
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
        const previewEl = document.querySelector('#sql-preview code');
        previewEl.textContent = sql;
        hljs.highlightElement(previewEl);
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
            alert('Query error: ' + error.message);
            console.error(error);
        }
    }

    async runInsert() {
        if (!this.insertBuilder) return;

        const data = this.insertBuilder.getData();

        if (!data.table) {
            alert('Please select a table');
            return;
        }

        if (!data.rows.length) {
            alert('Please add at least one row of data');
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
            alert('Insert error: ' + error.message);
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
            alert('Please select a table');
            return;
        }

        if (Object.keys(data.set).length === 0) {
            alert('Please select at least one column to update');
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
            alert('Preview error: ' + error.message);
            console.error(error);
        }
    }

    async runUpdate() {
        if (!this.updateBuilder) return;

        const data = this.updateBuilder.getData();

        if (!data.table) {
            alert('Please select a table');
            return;
        }

        if (Object.keys(data.set).length === 0) {
            alert('Please select at least one column to update');
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
            alert('Update error: ' + error.message);
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
            alert('Please select a table');
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
            alert('Preview error: ' + error.message);
            console.error(error);
        }
    }

    async runDelete() {
        if (!this.deleteBuilder) return;

        const data = this.deleteBuilder.getData();

        if (!data.table) {
            alert('Please select a table');
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
            alert('Delete error: ' + error.message);
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
            alert('Please select a table');
            return;
        }

        if (!data.operations.length) {
            alert('Please add at least one operation');
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
            alert('ALTER error: ' + error.message);
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

        countEl.textContent = `${data.row_count} rows`;
        timeEl.textContent = `${data.execution_time_ms}ms`;

        // Store results for export
        this.lastResults = data;

        // Add to history
        if (sql) {
            this.queryHistory.addQuery(sql, 'SELECT', data.row_count, data.execution_time_ms);
        }

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
            alert('No query to export');
            return;
        }
        this.queryExport.exportSQL(sql, 'query');
    }

    exportCSV() {
        if (!this.lastResults || !this.lastResults.rows || !this.lastResults.rows.length) {
            alert('No results to export. Run a query first.');
            return;
        }
        this.queryExport.exportCSV(this.lastResults.rows, 'results');
    }

    exportJSON() {
        if (!this.lastResults || !this.lastResults.rows || !this.lastResults.rows.length) {
            alert('No results to export. Run a query first.');
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
            <div class="history-item" data-id="${entry.id}">
                <div class="history-item-header">
                    <span class="history-type ${entry.type.toLowerCase()}">${entry.type}</span>
                    <span class="history-time">${this.queryHistory.formatTimestamp(entry.timestamp)}</span>
                </div>
                <div class="history-sql">${this.escapeHtml(this.truncateSQL(entry.sql, 100))}</div>
                <div class="history-meta">
                    ${entry.rowCount !== null ? `<span>${entry.rowCount} rows</span>` : ''}
                    ${entry.executionTime !== null ? `<span>${entry.executionTime}ms</span>` : ''}
                </div>
                <div class="history-actions">
                    <button class="btn-use" data-id="${entry.id}" title="Use this query">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                    </button>
                    <button class="btn-delete" data-id="${entry.id}" title="Remove from history">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');

        // Bind events
        container.querySelectorAll('.btn-use').forEach(btn => {
            btn.addEventListener('click', () => {
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

        // Switch to SELECT tab and SQL mode
        this.switchQueryType('select');

        // Set the SQL in the editor
        const editorEl = document.getElementById('sql-editor');
        const previewEl = document.querySelector('#sql-preview code');

        if (editorEl) {
            editorEl.value = entry.sql;
        }
        if (previewEl) {
            previewEl.textContent = entry.sql;
            hljs.highlightElement(previewEl);
        }

        // Switch to SQL tab
        const sqlTab = document.querySelector('.panel-tabs .tab[data-tab="sql"]');
        if (sqlTab) {
            sqlTab.click();
        }

        // Close history sidebar
        document.getElementById('history-sidebar')?.classList.remove('open');
    }

    searchHistory(query) {
        const results = this.queryHistory.search(query);
        const container = document.getElementById('history-list');
        if (!container) return;

        if (!results.length) {
            container.innerHTML = `<div class="placeholder">No matches found for "${this.escapeHtml(query)}"</div>`;
            return;
        }

        // Reuse renderHistory logic with filtered results
        container.innerHTML = results.map(entry => `
            <div class="history-item" data-id="${entry.id}">
                <div class="history-item-header">
                    <span class="history-type ${entry.type.toLowerCase()}">${entry.type}</span>
                    <span class="history-time">${this.queryHistory.formatTimestamp(entry.timestamp)}</span>
                </div>
                <div class="history-sql">${this.escapeHtml(this.truncateSQL(entry.sql, 100))}</div>
            </div>
        `).join('');

        // Bind click events
        container.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = parseInt(item.dataset.id);
                this.useHistoryQuery(id);
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

    clearAll() {
        // Clear based on current query type
        if (this.currentQueryType === 'insert') {
            if (this.insertBuilder) {
                this.insertBuilder.clear();
            }
        } else if (this.currentQueryType === 'update') {
            if (this.updateBuilder) {
                this.updateBuilder.clear();
            }
        } else if (this.currentQueryType === 'delete') {
            if (this.deleteBuilder) {
                this.deleteBuilder.clear();
            }
        } else if (this.currentQueryType === 'alter') {
            if (this.alterBuilder) {
                this.alterBuilder.clear();
            }
        } else if (this.currentQueryType === 'users') {
            if (this.userManager) {
                this.userManager.clear();
            }
        } else {
            // Clear SELECT builder state
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
            this.renderJoins();
            this.renderConditions();
            this.renderOrderBy();
            this.renderGroupBy();
            this.updateSQLPreview();
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
