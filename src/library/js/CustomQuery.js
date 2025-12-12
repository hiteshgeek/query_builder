/**
 * CustomQuery - Custom SQL query editor and executor
 */

import toast from './Toast.js';

class CustomQuery {
    constructor(onSQLChange, onResultsChange) {
        this.onSQLChange = onSQLChange;
        this.onResultsChange = onResultsChange;

        // State
        this.currentQuery = '';
        this.recentQueries = JSON.parse(localStorage.getItem('qb-recent-custom-queries') || '[]');
        this.isExecuting = false;

        // DOM Elements
        this.editor = null;
        this.lineNumbers = null;

        // Templates
        this.templates = {
            'select-all': 'SELECT *\nFROM table_name\nLIMIT 100;',
            'select-where': 'SELECT *\nFROM table_name\nWHERE column_name = \'value\'\nLIMIT 100;',
            'select-join': 'SELECT t1.*, t2.*\nFROM table1 t1\nINNER JOIN table2 t2 ON t1.id = t2.table1_id\nLIMIT 100;',
            'insert': 'INSERT INTO table_name (column1, column2, column3)\nVALUES (\'value1\', \'value2\', \'value3\');',
            'update': 'UPDATE table_name\nSET column1 = \'new_value\'\nWHERE id = 1;',
            'delete': 'DELETE FROM table_name\nWHERE id = 1;',
            'create-table': 'CREATE TABLE table_name (\n    id INT AUTO_INCREMENT PRIMARY KEY,\n    name VARCHAR(255) NOT NULL,\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
            'show-tables': 'SHOW TABLES;',
            'describe': 'DESCRIBE table_name;',
            'show-create': 'SHOW CREATE TABLE table_name;'
        };

        this.init();
    }

    init() {
        this.editor = document.getElementById('custom-sql-editor');
        this.lineNumbers = document.getElementById('editor-line-numbers');

        if (!this.editor) return;

        this.bindEvents();
        this.updateLineNumbers();
        this.renderRecentQueries();
    }

    bindEvents() {
        // Editor input - update line numbers and SQL preview
        this.editor.addEventListener('input', () => {
            this.currentQuery = this.editor.value;
            this.updateLineNumbers();
            this.updateSQL();
        });

        // Editor scroll - sync line numbers
        this.editor.addEventListener('scroll', () => {
            if (this.lineNumbers) {
                this.lineNumbers.scrollTop = this.editor.scrollTop;
            }
        });

        // Keyboard shortcuts
        this.editor.addEventListener('keydown', (e) => {
            // Ctrl+Enter to execute
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.execute();
            }

            // Tab for indentation
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.editor.selectionStart;
                const end = this.editor.selectionEnd;
                const value = this.editor.value;

                if (e.shiftKey) {
                    // Remove tab at line start
                    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                    if (value.substring(lineStart, lineStart + 4) === '    ') {
                        this.editor.value = value.substring(0, lineStart) + value.substring(lineStart + 4);
                        this.editor.selectionStart = this.editor.selectionEnd = start - 4;
                    } else if (value.substring(lineStart, lineStart + 1) === '\t') {
                        this.editor.value = value.substring(0, lineStart) + value.substring(lineStart + 1);
                        this.editor.selectionStart = this.editor.selectionEnd = start - 1;
                    }
                } else {
                    // Insert 4 spaces
                    this.editor.value = value.substring(0, start) + '    ' + value.substring(end);
                    this.editor.selectionStart = this.editor.selectionEnd = start + 4;
                }

                this.currentQuery = this.editor.value;
                this.updateLineNumbers();
                this.updateSQL();
            }
        });

        // Execute button
        document.getElementById('btn-execute-custom')?.addEventListener('click', () => this.execute());

        // Clear button
        document.getElementById('btn-clear-custom')?.addEventListener('click', () => this.clear());

        // Format button
        document.getElementById('btn-format-sql')?.addEventListener('click', () => this.formatSQL());

        // Clear recent queries button
        document.getElementById('btn-clear-recent')?.addEventListener('click', () => this.clearRecentQueries());

        // Template buttons
        document.querySelectorAll('#query-templates .template-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const template = btn.dataset.template;
                if (this.templates[template]) {
                    this.insertTemplate(this.templates[template]);
                }
            });
        });

        // Recent queries click
        document.getElementById('recent-custom-queries')?.addEventListener('click', (e) => {
            const queryItem = e.target.closest('.recent-query-item');
            if (queryItem) {
                const index = parseInt(queryItem.dataset.index);
                if (!isNaN(index) && this.recentQueries[index]) {
                    this.editor.value = this.recentQueries[index].sql;
                    this.currentQuery = this.editor.value;
                    this.updateLineNumbers();
                    this.updateSQL();
                    toast.success('Query loaded');
                }
            }
        });
    }

    /**
     * Update line numbers
     */
    updateLineNumbers() {
        if (!this.lineNumbers || !this.editor) return;

        const lines = this.editor.value.split('\n');
        const lineCount = lines.length;

        let html = '';
        for (let i = 1; i <= lineCount; i++) {
            html += `<div class="line-number">${i}</div>`;
        }

        this.lineNumbers.innerHTML = html;
    }

    /**
     * Update SQL preview in bottom panel
     */
    updateSQL() {
        if (this.onSQLChange) {
            this.onSQLChange(this.currentQuery || '-- Write your SQL query above');
        }
    }

    /**
     * Get current SQL
     */
    getSQL() {
        return this.currentQuery;
    }

    /**
     * Set SQL in editor
     */
    setSQL(sql) {
        if (this.editor) {
            this.editor.value = sql;
            this.currentQuery = sql;
            this.updateLineNumbers();
            this.updateSQL();
        }
    }

    /**
     * Insert template at cursor or replace selection
     */
    insertTemplate(template) {
        if (!this.editor) return;

        const start = this.editor.selectionStart;
        const end = this.editor.selectionEnd;
        const value = this.editor.value;

        // If there's existing content, add newlines
        if (value.trim()) {
            this.editor.value = value.substring(0, start) + '\n\n' + template + value.substring(end);
            this.editor.selectionStart = start + 2;
            this.editor.selectionEnd = start + 2 + template.length;
        } else {
            this.editor.value = template;
            this.editor.selectionStart = 0;
            this.editor.selectionEnd = template.length;
        }

        this.currentQuery = this.editor.value;
        this.updateLineNumbers();
        this.updateSQL();
        this.editor.focus();
    }

    /**
     * Execute the query
     */
    async execute() {
        const sql = this.currentQuery.trim();

        if (!sql) {
            toast.warning('Please enter a SQL query');
            return;
        }

        if (this.isExecuting) {
            toast.warning('Query is already executing');
            return;
        }

        this.isExecuting = true;
        const executeBtn = document.getElementById('btn-execute-custom');
        if (executeBtn) {
            executeBtn.disabled = true;
            executeBtn.innerHTML = `
                <svg class="spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="60">
                        <animate attributeName="stroke-dashoffset" values="60;0" dur="0.8s" repeatCount="indefinite"/>
                    </circle>
                </svg>
                Executing...
            `;
        }

        const startTime = performance.now();

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/custom-query.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql })
            });

            const result = await response.json();
            const endTime = performance.now();
            const executionTime = ((endTime - startTime) / 1000).toFixed(3);

            if (result.error) {
                throw new Error(result.message);
            }

            // Add to recent queries
            this.addToRecentQueries(sql, result.data?.rows?.length || result.data?.affected_rows || 0);

            // Show results
            if (this.onResultsChange) {
                this.onResultsChange({
                    rows: result.data.rows || [],
                    columns: result.data.columns || [],
                    affectedRows: result.data.affected_rows,
                    insertId: result.data.insert_id,
                    queryType: result.data.query_type,
                    executionTime,
                    rowCount: result.data.rows?.length || 0
                });
            }

            // Show success message
            if (result.data.query_type === 'SELECT') {
                toast.success(`Query returned ${result.data.rows.length} rows in ${executionTime}s`);
            } else {
                const affected = result.data.affected_rows || 0;
                toast.success(`Query executed: ${affected} row${affected !== 1 ? 's' : ''} affected`);
            }

        } catch (error) {
            console.error('Query execution error:', error);
            toast.error('Query failed: ' + error.message);

            // Add failed query to recent
            this.addToRecentQueries(sql, 0, true);
        } finally {
            this.isExecuting = false;
            if (executeBtn) {
                executeBtn.disabled = false;
                executeBtn.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Execute
                `;
            }
        }
    }

    /**
     * Add query to recent queries list
     */
    addToRecentQueries(sql, rowCount, failed = false) {
        // Remove duplicate if exists
        this.recentQueries = this.recentQueries.filter(q => q.sql !== sql);

        // Add to beginning
        this.recentQueries.unshift({
            sql,
            rowCount,
            failed,
            timestamp: new Date().toISOString()
        });

        // Keep only last 20
        this.recentQueries = this.recentQueries.slice(0, 20);

        // Save to localStorage
        localStorage.setItem('qb-recent-custom-queries', JSON.stringify(this.recentQueries));

        // Re-render
        this.renderRecentQueries();
    }

    /**
     * Render recent queries list
     */
    renderRecentQueries() {
        const container = document.getElementById('recent-custom-queries');
        if (!container) return;

        if (this.recentQueries.length === 0) {
            container.innerHTML = '<div class="placeholder">No recent queries</div>';
            return;
        }

        container.innerHTML = this.recentQueries.map((query, index) => {
            const date = new Date(query.timestamp);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const truncatedSQL = this.truncateSQL(query.sql, 80);

            return `
                <div class="recent-query-item ${query.failed ? 'failed' : ''}" data-index="${index}">
                    <div class="recent-query-sql">${this.escapeHtml(truncatedSQL)}</div>
                    <div class="recent-query-meta">
                        <span class="recent-query-time">${timeStr}</span>
                        <span class="recent-query-rows">${query.failed ? 'Failed' : `${query.rowCount} rows`}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Clear recent queries
     */
    clearRecentQueries() {
        this.recentQueries = [];
        localStorage.removeItem('qb-recent-custom-queries');
        this.renderRecentQueries();
        toast.success('Recent queries cleared');
    }

    /**
     * Clear the editor
     */
    clear() {
        if (this.editor) {
            this.editor.value = '';
            this.currentQuery = '';
            this.updateLineNumbers();
            this.updateSQL();
            this.editor.focus();
        }
    }

    /**
     * Basic SQL formatting
     */
    formatSQL() {
        if (!this.editor || !this.currentQuery.trim()) return;

        let sql = this.currentQuery;

        // Keywords to put on new lines
        const newlineKeywords = [
            'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'ORDER BY', 'GROUP BY',
            'HAVING', 'LIMIT', 'OFFSET', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN',
            'OUTER JOIN', 'JOIN', 'ON', 'SET', 'VALUES', 'INTO', 'INSERT',
            'UPDATE', 'DELETE', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE'
        ];

        // Uppercase keywords
        const keywords = [
            'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
            'IS', 'NULL', 'AS', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
            'ASC', 'DESC', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'JOIN', 'ON', 'SET',
            'VALUES', 'INTO', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'TABLE',
            'ALTER', 'DROP', 'INDEX', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
            'CONSTRAINT', 'DEFAULT', 'AUTO_INCREMENT', 'UNIQUE', 'ENGINE', 'CHARSET',
            'COLLATE', 'IF', 'EXISTS', 'NOT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
            'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CONCAT', 'NOW', 'TRUE', 'FALSE'
        ];

        // Uppercase keywords (case-insensitive replace)
        keywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            sql = sql.replace(regex, keyword);
        });

        // Add newlines before keywords
        newlineKeywords.forEach(keyword => {
            const regex = new RegExp(`\\s+${keyword}\\b`, 'gi');
            sql = sql.replace(regex, `\n${keyword}`);
        });

        // Clean up multiple spaces
        sql = sql.replace(/  +/g, ' ');

        // Clean up multiple newlines
        sql = sql.replace(/\n\n+/g, '\n\n');

        // Indent after SELECT, SET, VALUES
        sql = sql.replace(/\n(SELECT|SET|VALUES)\s+/gi, '\n$1\n    ');

        // Trim
        sql = sql.trim();

        this.editor.value = sql;
        this.currentQuery = sql;
        this.updateLineNumbers();
        this.updateSQL();

        toast.success('SQL formatted');
    }

    /**
     * Truncate SQL for display
     */
    truncateSQL(sql, maxLength) {
        // Remove extra whitespace
        const cleaned = sql.replace(/\s+/g, ' ').trim();
        if (cleaned.length <= maxLength) return cleaned;
        return cleaned.substring(0, maxLength) + '...';
    }

    /**
     * Escape HTML
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

export default CustomQuery;
