/**
 * Query Builder - Main Application
 */

import hljs from 'highlight.js/lib/core';
import sql from 'highlight.js/lib/languages/sql';

hljs.registerLanguage('sql', sql);

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

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadSchema();
    }

    bindEvents() {
        // Tab switching
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
        this.updateGroupByOptions();
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
        this.updateGroupByOptions();
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
                    <option value="IN" ${cond.operator === 'IN' ? 'selected' : ''}>IN</option>
                    <option value="IS NULL" ${cond.operator === 'IS NULL' ? 'selected' : ''}>IS NULL</option>
                    <option value="IS NOT NULL" ${cond.operator === 'IS NOT NULL' ? 'selected' : ''}>IS NOT NULL</option>
                </select>
                <input type="text" class="value" placeholder="Value" value="${cond.value || ''}"
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

    updateGroupByOptions() {
        const select = document.getElementById('groupby-select');
        const allColumns = this.getAllColumns();

        select.innerHTML = allColumns.map(c =>
            `<option value="${c}" ${this.groupBy.includes(c) ? 'selected' : ''}>${c}</option>`
        ).join('');

        select.addEventListener('change', () => {
            this.groupBy = Array.from(select.selectedOptions).map(o => o.value);
            this.updateSQLPreview();
        });
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
                } else if (cond.operator === 'IN') {
                    sql += `${cond.column} IN (${cond.value})`;
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

            this.displayResults(result.data);

            // Also run EXPLAIN
            this.runExplain(sql);

        } catch (error) {
            alert('Query error: ' + error.message);
            console.error(error);
        }
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

    displayResults(data) {
        const table = document.getElementById('results-table');
        const noResults = document.getElementById('no-results');
        const countEl = document.getElementById('results-count');
        const timeEl = document.getElementById('results-time');

        countEl.textContent = `${data.row_count} rows`;
        timeEl.textContent = `${data.execution_time_ms}ms`;

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

    clearAll() {
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
        this.updateGroupByOptions();
        this.updateSQLPreview();

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
});

export default QueryBuilder;
