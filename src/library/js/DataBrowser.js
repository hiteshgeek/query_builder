/**
 * DataBrowser - PHPMyAdmin-like data browsing interface
 */

import toast from './Toast.js';
import DataGrid from './DataGrid.js';
import rowViewer from './RowViewer.js';
import rowEditor from './RowEditor.js';
import confirmModal from './ConfirmModal.js';
import schemaEditor from './SchemaEditor.js';

class DataBrowser {
    constructor(schema, onSQLChange, getDatabaseFn) {
        this.schema = schema;
        this.onSQLChange = onSQLChange;
        this.getDatabase = getDatabaseFn || (() => null);

        // State
        this.selectedTable = localStorage.getItem('qb-browse-table') || null;
        this.page = 1;
        this.limit = parseInt(localStorage.getItem('qb-browse-limit')) || 25;
        this.sortColumn = null;
        this.sortOrder = 'ASC';
        this.searchTerm = '';
        this.columnFilters = {};
        this.selectedRows = new Set();

        // Data
        this.rows = [];
        this.columns = [];
        this.totalRows = 0;
        this.totalPages = 0;
        this.primaryKey = [];

        // Schema data
        this.schemaData = null;

        // Schema selection state
        this.selectedSchemaColumn = null;
        this.selectedSchemaIndex = null;
        this.selectedSchemaForeignKey = null;

        // Active tab
        this.activeTab = 'data';

        // Loading state
        this.isLoading = false;

        // Last generated SQL for export
        this.lastSQL = '';

        // Components
        this.dataGrid = null;

        // Debounce timer for search
        this.searchDebounceTimer = null;

        this.init();
    }

    init() {
        this.bindEvents();
        this.dataGrid = new DataGrid(
            document.getElementById('data-grid-container'),
            {
                onSort: (column) => this.handleSort(column),
                onRowSelect: (rowId, selected) => this.handleRowSelect(rowId, selected),
                onSelectAll: (selected) => this.handleSelectAll(selected),
                onAction: (action, rowId, rowData) => this.handleRowAction(action, rowId, rowData)
            }
        );
    }

    bindEvents() {
        // Refresh button
        document.getElementById('btn-refresh-browse')?.addEventListener('click', () => this.refreshData());

        // Add row button
        document.getElementById('btn-add-row')?.addEventListener('click', () => this.addRow());

        // Quick search
        const searchInput = document.getElementById('browse-quick-search');
        searchInput?.addEventListener('input', (e) => {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = setTimeout(() => {
                this.setSearch(e.target.value);
            }, 300);
        });

        // Pagination limit
        document.getElementById('pagination-limit')?.addEventListener('change', (e) => {
            this.setLimit(parseInt(e.target.value));
        });

        // Pagination buttons
        document.getElementById('btn-first-page')?.addEventListener('click', () => this.goToPage(1));
        document.getElementById('btn-prev-page')?.addEventListener('click', () => this.goToPage(this.page - 1));
        document.getElementById('btn-next-page')?.addEventListener('click', () => this.goToPage(this.page + 1));
        document.getElementById('btn-last-page')?.addEventListener('click', () => this.goToPage(this.totalPages));

        // Bulk delete
        document.getElementById('btn-bulk-delete')?.addEventListener('click', () => this.bulkDelete());

        // Tab switching
        document.querySelectorAll('.browse-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.browseTab;
                this.switchTab(tabName);
            });
        });

        // Schema toolbar buttons
        this.bindSchemaToolbarEvents();
    }

    /**
     * Bind schema toolbar button events
     */
    bindSchemaToolbarEvents() {
        // Column operations
        document.getElementById('btn-add-column')?.addEventListener('click', () => {
            this.initSchemaEditor();
            schemaEditor.showAddColumn();
        });

        document.getElementById('btn-modify-column')?.addEventListener('click', () => {
            if (!this.selectedSchemaColumn) {
                toast.warning('Select a column first');
                return;
            }
            this.initSchemaEditor();
            schemaEditor.showModifyColumn(this.selectedSchemaColumn);
        });

        document.getElementById('btn-drop-column')?.addEventListener('click', () => {
            if (!this.selectedSchemaColumn) {
                toast.warning('Select a column first');
                return;
            }
            this.initSchemaEditor();
            schemaEditor.dropColumn(this.selectedSchemaColumn.name);
        });

        // Key operations
        document.getElementById('btn-add-primary-key')?.addEventListener('click', () => {
            this.initSchemaEditor();
            schemaEditor.showPrimaryKey();
        });

        document.getElementById('btn-add-foreign-key')?.addEventListener('click', () => {
            this.initSchemaEditor();
            schemaEditor.showAddForeignKey();
        });

        document.getElementById('btn-drop-foreign-key')?.addEventListener('click', () => {
            if (!this.selectedSchemaForeignKey) {
                toast.warning('Select a foreign key first');
                return;
            }
            this.initSchemaEditor();
            schemaEditor.dropForeignKey(this.selectedSchemaForeignKey);
        });

        // Index operations
        document.getElementById('btn-add-index')?.addEventListener('click', () => {
            this.initSchemaEditor();
            schemaEditor.showAddIndex(false);
        });

        document.getElementById('btn-add-unique')?.addEventListener('click', () => {
            this.initSchemaEditor();
            schemaEditor.showAddIndex(true);
        });

        document.getElementById('btn-drop-index')?.addEventListener('click', () => {
            if (!this.selectedSchemaIndex) {
                toast.warning('Select an index first');
                return;
            }
            this.initSchemaEditor();
            schemaEditor.dropIndex(this.selectedSchemaIndex);
        });
    }

    /**
     * Initialize schema editor with current context
     */
    initSchemaEditor() {
        schemaEditor.setContext(
            this.selectedTable,
            this.getDatabase(),
            this.schemaData,
            this.schema?.tables || [],
            () => this.loadSchema() // Refresh on success
        );
    }

    /**
     * Switch between Data and Schema tabs
     */
    switchTab(tabName) {
        if (this.activeTab === tabName) return;

        this.activeTab = tabName;

        // Update tab buttons
        document.querySelectorAll('.browse-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.browseTab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.browse-tab-content').forEach(pane => {
            pane.classList.toggle('active', pane.dataset.browsePane === tabName);
        });

        // Show/hide search based on tab
        const searchWrapper = document.getElementById('browse-search-wrapper');
        if (searchWrapper) {
            searchWrapper.style.display = tabName === 'data' ? 'flex' : 'none';
        }

        // Load schema if switching to schema tab
        if (tabName === 'schema' && this.selectedTable) {
            this.loadSchema();
        }
    }

    updateSchema(schema) {
        this.schema = schema;
    }

    /**
     * Called when a table is selected (from sidebar or dropdown)
     */
    async selectTable(tableName) {
        if (this.selectedTable === tableName && this.rows.length > 0) {
            // Same table, just refresh
            return;
        }

        this.selectedTable = tableName;
        localStorage.setItem('qb-browse-table', tableName);

        // Reset state for new table
        this.page = 1;
        this.sortColumn = null;
        this.sortOrder = 'ASC';
        this.searchTerm = '';
        this.columnFilters = {};
        this.selectedRows.clear();

        // Clear search input
        const searchInput = document.getElementById('browse-quick-search');
        if (searchInput) {
            searchInput.value = '';
            searchInput.disabled = false;
        }

        // Update table info display
        this.updateTableInfo();

        // Reset schema data for new table
        this.schemaData = null;

        // Fetch data
        await this.fetchData();

        // If schema tab is active, load schema
        if (this.activeTab === 'schema') {
            this.loadSchema();
        }
    }

    /**
     * Fetch data from the API
     */
    async fetchData() {
        if (!this.selectedTable) return;

        this.setLoading(true);

        try {
            const params = new URLSearchParams({
                table: this.selectedTable,
                page: this.page,
                limit: this.limit
            });

            // Add database parameter
            const database = this.getDatabase();
            if (database) {
                params.append('database', database);
            }

            if (this.sortColumn) {
                params.append('sort', this.sortColumn);
                params.append('order', this.sortOrder);
            }

            if (this.searchTerm) {
                params.append('search', this.searchTerm);
            }

            if (Object.keys(this.columnFilters).length > 0) {
                params.append('filters', JSON.stringify(this.columnFilters));
            }

            const response = await fetch(`${window.APP_CONFIG.apiBase}/browse.php?${params}`);
            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            // Update state with response data
            this.rows = result.data.rows;
            this.columns = result.data.columns;
            this.primaryKey = result.data.primary_key;
            this.totalRows = result.data.total_rows;
            this.totalPages = result.data.total_pages;
            this.page = result.data.page;

            // Render the grid
            this.renderGrid();

            // Update pagination
            this.updatePagination();

            // Update SQL preview
            this.updateSQL();

            // Show grid, hide empty state
            this.showGrid();

        } catch (error) {
            console.error('Failed to fetch data:', error);
            toast.error('Failed to load data: ' + error.message);
            this.showEmptyState();
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Refresh current data
     */
    async refreshData() {
        if (!this.selectedTable) {
            toast.warning('Select a table first');
            return;
        }
        await this.fetchData();
        toast.success('Data refreshed');
    }

    /**
     * Render the data grid
     */
    renderGrid() {
        if (!this.dataGrid) return;

        this.dataGrid.render({
            rows: this.rows,
            columns: this.columns,
            primaryKey: this.primaryKey,
            selectedRows: this.selectedRows,
            sortColumn: this.sortColumn,
            sortOrder: this.sortOrder
        });
    }

    /**
     * Handle column sort
     */
    handleSort(column) {
        if (this.sortColumn === column) {
            // Toggle order
            this.sortOrder = this.sortOrder === 'ASC' ? 'DESC' : 'ASC';
        } else {
            this.sortColumn = column;
            this.sortOrder = 'ASC';
        }

        this.page = 1; // Reset to first page
        this.fetchData();
    }

    /**
     * Handle row selection
     */
    handleRowSelect(rowId, selected) {
        if (selected) {
            this.selectedRows.add(rowId);
        } else {
            this.selectedRows.delete(rowId);
        }
        this.updateBulkActions();
    }

    /**
     * Handle select all
     */
    handleSelectAll(selected) {
        if (selected) {
            this.rows.forEach(row => {
                const rowId = this.getRowId(row);
                if (rowId) this.selectedRows.add(rowId);
            });
        } else {
            this.selectedRows.clear();
        }
        this.updateBulkActions();
        this.dataGrid.updateSelection(this.selectedRows);
    }

    /**
     * Handle row action (view, edit, duplicate, delete)
     */
    handleRowAction(action, rowId, rowData) {
        switch (action) {
            case 'view':
                this.viewRow(rowData);
                break;
            case 'edit':
                this.editRow(rowId, rowData);
                break;
            case 'duplicate':
                this.duplicateRow(rowData);
                break;
            case 'delete':
                this.deleteRow(rowId, rowData);
                break;
        }
    }

    /**
     * Get row ID from row data (using primary key)
     */
    getRowId(row) {
        if (this.primaryKey.length === 0) return null;

        if (this.primaryKey.length === 1) {
            return row[this.primaryKey[0]];
        }

        // Composite key - create compound ID
        return this.primaryKey.map(col => row[col]).join('_');
    }

    /**
     * View row details (read-only)
     */
    viewRow(rowData) {
        rowViewer.show(rowData, this.columns);
    }

    /**
     * Edit row
     */
    editRow(rowId, rowData) {
        if (this.primaryKey.length === 0) {
            toast.warning('Cannot edit: table has no primary key');
            return;
        }

        rowEditor.showEdit(
            this.selectedTable,
            rowId,
            rowData,
            this.columns,
            this.primaryKey,
            () => this.fetchData() // Refresh after save
        );
    }

    /**
     * Duplicate row
     */
    duplicateRow(rowData) {
        rowEditor.showDuplicate(
            this.selectedTable,
            rowData,
            this.columns,
            this.primaryKey,
            () => this.fetchData() // Refresh after save
        );
    }

    /**
     * Delete single row
     */
    async deleteRow(rowId, rowData) {
        if (this.primaryKey.length === 0) {
            toast.warning('Cannot delete: table has no primary key');
            return;
        }

        // Get preview of the row for confirmation
        const preview = this.primaryKey.map(pk => `${pk}: ${rowData[pk]}`).join(', ');

        const confirmed = await confirmModal.show({
            title: 'Delete Row',
            message: `Are you sure you want to delete this row?\n\n${preview}`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            type: 'danger'
        });

        if (!confirmed) return;

        try {
            const params = new URLSearchParams({
                table: this.selectedTable,
                id: rowId
            });

            const response = await fetch(`${window.APP_CONFIG.apiBase}/row.php?${params}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            toast.success('Row deleted successfully');
            this.selectedRows.delete(rowId);
            await this.fetchData();

        } catch (error) {
            console.error('Delete error:', error);
            toast.error('Failed to delete: ' + error.message);
        }
    }

    /**
     * Add new row
     */
    addRow() {
        if (!this.selectedTable) {
            toast.warning('Select a table first');
            return;
        }

        rowEditor.showAdd(
            this.selectedTable,
            this.columns,
            this.primaryKey,
            () => this.fetchData() // Refresh after save
        );
    }

    /**
     * Bulk delete selected rows
     */
    async bulkDelete() {
        if (this.selectedRows.size === 0) {
            toast.warning('No rows selected');
            return;
        }

        if (this.primaryKey.length === 0) {
            toast.warning('Cannot delete: table has no primary key');
            return;
        }

        const count = this.selectedRows.size;
        const confirmed = await confirmModal.show({
            title: 'Delete Selected Rows',
            message: `Are you sure you want to delete ${count} selected row${count > 1 ? 's' : ''}?\n\nThis action cannot be undone.`,
            confirmText: `Delete ${count} Row${count > 1 ? 's' : ''}`,
            cancelText: 'Cancel',
            type: 'danger'
        });

        if (!confirmed) return;

        // Delete rows one by one
        let deleted = 0;
        let failed = 0;

        for (const rowId of this.selectedRows) {
            try {
                const params = new URLSearchParams({
                    table: this.selectedTable,
                    id: rowId
                });

                const response = await fetch(`${window.APP_CONFIG.apiBase}/row.php?${params}`, {
                    method: 'DELETE'
                });

                const result = await response.json();

                if (result.error) {
                    failed++;
                } else {
                    deleted++;
                }
            } catch {
                failed++;
            }
        }

        this.selectedRows.clear();
        this.updateBulkActions();

        if (failed === 0) {
            toast.success(`${deleted} row${deleted > 1 ? 's' : ''} deleted successfully`);
        } else {
            toast.warning(`Deleted ${deleted} row${deleted > 1 ? 's' : ''}, ${failed} failed`);
        }

        await this.fetchData();
    }

    /**
     * Set search term
     */
    setSearch(term) {
        this.searchTerm = term;
        this.page = 1;
        this.fetchData();
    }

    /**
     * Set page limit
     */
    setLimit(limit) {
        this.limit = limit;
        localStorage.setItem('qb-browse-limit', limit);
        this.page = 1;
        this.fetchData();
    }

    /**
     * Go to specific page
     */
    goToPage(page) {
        if (page < 1 || page > this.totalPages || page === this.page) return;
        this.page = page;
        this.fetchData();
    }

    /**
     * Update pagination UI
     */
    updatePagination() {
        const paginationEl = document.getElementById('browse-pagination');
        if (!paginationEl) return;

        // Show pagination
        paginationEl.style.display = 'flex';

        // Update info
        const start = this.totalRows === 0 ? 0 : (this.page - 1) * this.limit + 1;
        const end = Math.min(this.page * this.limit, this.totalRows);

        document.getElementById('pagination-start').textContent = start;
        document.getElementById('pagination-end').textContent = end;
        document.getElementById('pagination-total').textContent = this.totalRows.toLocaleString();

        // Update limit select
        const limitSelect = document.getElementById('pagination-limit');
        if (limitSelect) limitSelect.value = this.limit;

        // Update navigation buttons
        document.getElementById('btn-first-page').disabled = this.page <= 1;
        document.getElementById('btn-prev-page').disabled = this.page <= 1;
        document.getElementById('btn-next-page').disabled = this.page >= this.totalPages;
        document.getElementById('btn-last-page').disabled = this.page >= this.totalPages;

        // Render page numbers
        this.renderPageNumbers();
    }

    /**
     * Render page number buttons
     */
    renderPageNumbers() {
        const container = document.getElementById('pagination-pages');
        if (!container) return;

        const maxVisible = 5;
        let startPage = Math.max(1, this.page - Math.floor(maxVisible / 2));
        let endPage = Math.min(this.totalPages, startPage + maxVisible - 1);

        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        let html = '';

        // First page + ellipsis
        if (startPage > 1) {
            html += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) {
                html += `<span class="page-ellipsis">...</span>`;
            }
        }

        // Page numbers
        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="page-btn ${i === this.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }

        // Last page + ellipsis
        if (endPage < this.totalPages) {
            if (endPage < this.totalPages - 1) {
                html += `<span class="page-ellipsis">...</span>`;
            }
            html += `<button class="page-btn" data-page="${this.totalPages}">${this.totalPages}</button>`;
        }

        container.innerHTML = html;

        // Bind click events
        container.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.goToPage(parseInt(btn.dataset.page));
            });
        });
    }

    /**
     * Update bulk actions visibility
     */
    updateBulkActions() {
        const bulkActions = document.getElementById('browse-bulk-actions');
        const countEl = document.getElementById('browse-selected-count');

        if (bulkActions && countEl) {
            if (this.selectedRows.size > 0) {
                bulkActions.style.display = 'flex';
                countEl.textContent = `${this.selectedRows.size} selected`;
            } else {
                bulkActions.style.display = 'none';
            }
        }
    }

    /**
     * Update table info display
     */
    updateTableInfo() {
        const infoEl = document.getElementById('browse-table-info');
        if (infoEl && this.selectedTable) {
            infoEl.innerHTML = `
                <span class="browse-table-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <line x1="3" y1="9" x2="21" y2="9"/>
                        <line x1="9" y1="21" x2="9" y2="9"/>
                    </svg>
                </span>
                <span class="browse-table-name">${this.selectedTable}</span>
            `;
        }
    }

    /**
     * Update SQL preview in bottom panel
     */
    updateSQL() {
        if (!this.selectedTable) {
            this.lastSQL = '';
            if (this.onSQLChange) {
                this.onSQLChange('-- Select a table from the sidebar to browse data');
            }
            return;
        }

        let sql = `SELECT * FROM \`${this.selectedTable}\``;

        // Add WHERE clause preview
        const conditions = [];
        if (this.searchTerm) {
            conditions.push(`/* Quick search: "${this.searchTerm}" */`);
        }

        Object.entries(this.columnFilters).forEach(([col, val]) => {
            if (val) conditions.push(`\`${col}\` LIKE '%${val}%'`);
        });

        if (conditions.length > 0) {
            sql += `\nWHERE ${conditions.join('\n  AND ')}`;
        }

        // Add ORDER BY
        if (this.sortColumn) {
            sql += `\nORDER BY \`${this.sortColumn}\` ${this.sortOrder}`;
        }

        // Add LIMIT
        sql += `\nLIMIT ${this.limit} OFFSET ${(this.page - 1) * this.limit}`;

        sql += ';';

        // Store the actual SQL (without comments) for export
        this.lastSQL = sql;

        // Add comment with row info for display
        sql += `\n\n-- Total rows: ${this.totalRows.toLocaleString()}`;
        sql += `\n-- Page ${this.page} of ${this.totalPages}`;

        if (this.onSQLChange) {
            this.onSQLChange(sql);
        }
    }

    /**
     * Get the last generated SQL query
     */
    getLastSQL() {
        return this.lastSQL;
    }

    /**
     * Show/hide loading state
     */
    setLoading(loading) {
        this.isLoading = loading;
        const gridContainer = document.getElementById('data-grid-container');
        if (gridContainer) {
            gridContainer.classList.toggle('loading', loading);
        }
    }

    /**
     * Show grid, hide empty state
     */
    showGrid() {
        document.getElementById('browse-empty-state').style.display = 'none';
        document.getElementById('data-grid-container').style.display = 'block';
    }

    /**
     * Show empty state, hide grid
     */
    showEmptyState() {
        document.getElementById('browse-empty-state').style.display = 'flex';
        document.getElementById('data-grid-container').style.display = 'none';
        document.getElementById('browse-pagination').style.display = 'none';
    }

    /**
     * Clear state and UI
     */
    clear() {
        this.selectedTable = null;
        localStorage.removeItem('qb-browse-table');
        this.rows = [];
        this.columns = [];
        this.primaryKey = [];
        this.totalRows = 0;
        this.page = 1;
        this.sortColumn = null;
        this.sortOrder = 'ASC';
        this.searchTerm = '';
        this.columnFilters = {};
        this.selectedRows.clear();

        // Reset UI
        const searchInput = document.getElementById('browse-quick-search');
        if (searchInput) {
            searchInput.value = '';
            searchInput.disabled = true;
        }

        const infoEl = document.getElementById('browse-table-info');
        if (infoEl) {
            infoEl.innerHTML = '<span class="browse-table-name">Select a table from the sidebar</span>';
        }

        this.showEmptyState();
        this.updateBulkActions();

        // Clear schema
        this.schemaData = null;
        this.showSchemaEmptyState();
    }

    /**
     * Load schema information for the current table
     */
    async loadSchema() {
        if (!this.selectedTable) return;

        try {
            const params = new URLSearchParams({
                table: this.selectedTable
            });

            const database = this.getDatabase();
            if (database) {
                params.append('database', database);
            }

            const response = await fetch(`${window.APP_CONFIG.apiBase}/schema.php?${params}`);
            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            this.schemaData = result.data;
            this.renderSchema();

        } catch (error) {
            console.error('Failed to load schema:', error);
            toast.error('Failed to load schema: ' + error.message);
        }
    }

    /**
     * Render the schema view (phpMyAdmin-style with inline editing)
     */
    renderSchema() {
        const container = document.getElementById('schema-table-container');
        const emptyState = document.getElementById('schema-empty-state');
        const toolbar = document.getElementById('schema-toolbar');

        if (!this.schemaData || !container) return;

        // Hide empty state, show container (hide old toolbar)
        if (emptyState) emptyState.style.display = 'none';
        if (toolbar) toolbar.style.display = 'none'; // Hide old toolbar
        container.style.display = 'block';

        const { columns, indexes, foreign_keys } = this.schemaData;

        // Helper to escape HTML
        const escapeHtml = (str) => {
            if (str === null || str === undefined) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        };

        let html = `
            <div class="schema-section">
                <div class="schema-section-header">
                    <h4>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <line x1="3" y1="9" x2="21" y2="9"/>
                            <line x1="9" y1="21" x2="9" y2="9"/>
                        </svg>
                        Columns
                    </h4>
                    <button class="btn-sm btn-primary-sm" id="btn-add-column">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Add Column
                    </button>
                </div>
                <table class="schema-table" id="schema-columns-table">
                    <thead>
                        <tr>
                            <th>Column</th>
                            <th>Type</th>
                            <th class="schema-col-clickable">Null</th>
                            <th class="schema-col-clickable">Default</th>
                            <th class="schema-col-clickable">Comment</th>
                            <th>Extra</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        columns.forEach((col, index) => {
            const isPK = this.schemaData.primary_key?.includes(col.name);
            const isFK = foreign_keys?.some(fk => fk.column === col.name);
            const hasComment = col.comment && col.comment.trim();
            const defaultDisplay = col.default !== null ? escapeHtml(col.default) : '<span class="null-value">NULL</span>';
            const commentDisplay = hasComment ? escapeHtml(col.comment) : '<span class="empty-value">-</span>';

            html += `
                <tr data-column-index="${index}" data-column-name="${col.name}">
                    <td>
                        <span class="schema-col-name">
                            ${isPK ? '<span class="pk-icon" title="Primary Key">🔑</span>' : ''}
                            ${isFK ? '<span class="fk-icon" title="Foreign Key">🔗</span>' : ''}
                            ${escapeHtml(col.name)}
                        </span>
                    </td>
                    <td><span class="schema-col-type">${escapeHtml(col.type)}</span></td>
                    <td class="schema-cell-editable" data-action="toggle-null" data-column="${col.name}" data-nullable="${col.nullable}" title="Click to toggle NULL">
                        <span class="schema-col-nullable ${col.nullable ? 'yes' : 'no'}">${col.nullable ? 'YES' : 'NO'}</span>
                    </td>
                    <td class="schema-cell-editable" data-action="set-default" data-column="${col.name}" title="Click to edit default">
                        <span class="schema-col-default">${defaultDisplay}</span>
                    </td>
                    <td class="schema-cell-editable" data-action="set-comment" data-column="${col.name}" title="Click to edit comment">
                        <span class="schema-col-comment">${commentDisplay}</span>
                    </td>
                    <td><span class="schema-col-extra">${escapeHtml(col.extra) || ''}</span></td>
                    <td class="schema-col-actions">
                        <div class="schema-row-actions">
                            <button class="schema-action-btn" data-action="modify" data-column="${col.name}" title="Modify Column">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            <button class="schema-action-btn danger" data-action="drop" data-column="${col.name}" title="Drop Column">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                                </svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';

        // Indexes section
        html += `
            <div class="schema-section">
                <div class="schema-section-header">
                    <h4>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
                            <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
                            <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
                        </svg>
                        Indexes
                    </h4>
                    <div class="schema-section-actions">
                        <button class="btn-sm" id="btn-add-primary-key" title="Add/Modify Primary Key">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                            </svg>
                            Primary Key
                        </button>
                        <button class="btn-sm" id="btn-add-index">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            Add Index
                        </button>
                        <button class="btn-sm" id="btn-add-unique">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                            </svg>
                            Unique
                        </button>
                    </div>
                </div>
        `;

        if (indexes && indexes.length > 0) {
            html += `
                <table class="schema-table" id="schema-indexes-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Columns</th>
                            <th>Type</th>
                            <th>Unique</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            indexes.forEach(idx => {
                const isPrimary = idx.name === 'PRIMARY';
                html += `
                    <tr data-index-name="${idx.name}">
                        <td><span class="schema-col-name">${escapeHtml(idx.name)}</span></td>
                        <td>${escapeHtml(idx.columns.join(', '))}</td>
                        <td>${escapeHtml(idx.type) || 'BTREE'}</td>
                        <td><span class="schema-col-nullable ${idx.unique ? 'yes' : 'no'}">${idx.unique ? 'YES' : 'NO'}</span></td>
                        <td class="schema-col-actions">
                            <div class="schema-row-actions">
                                ${!isPrimary ? `
                                    <button class="schema-action-btn danger" data-action="drop-index" data-index="${idx.name}" title="Drop Index">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                                        </svg>
                                    </button>
                                ` : '<span class="text-muted">-</span>'}
                            </div>
                        </td>
                    </tr>
                `;
            });

            html += '</tbody></table>';
        } else {
            html += '<p class="schema-no-data">No indexes defined</p>';
        }
        html += '</div>';

        // Foreign Keys section
        html += `
            <div class="schema-section">
                <div class="schema-section-header">
                    <h4>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                        </svg>
                        Foreign Keys
                    </h4>
                    <button class="btn-sm" id="btn-add-foreign-key">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Add Foreign Key
                    </button>
                </div>
        `;

        if (foreign_keys && foreign_keys.length > 0) {
            html += `
                <table class="schema-table" id="schema-fk-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Column</th>
                            <th>References</th>
                            <th>On Delete</th>
                            <th>On Update</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            foreign_keys.forEach(fk => {
                html += `
                    <tr data-fk-name="${fk.name}">
                        <td><span class="schema-col-name">${escapeHtml(fk.name)}</span></td>
                        <td>${escapeHtml(fk.column)}</td>
                        <td><span class="schema-fk-ref">${escapeHtml(fk.referenced_table)}.${escapeHtml(fk.referenced_column)}</span></td>
                        <td>${escapeHtml(fk.on_delete) || 'RESTRICT'}</td>
                        <td>${escapeHtml(fk.on_update) || 'RESTRICT'}</td>
                        <td class="schema-col-actions">
                            <div class="schema-row-actions">
                                <button class="schema-action-btn danger" data-action="drop-fk" data-fk="${fk.name}" title="Drop Foreign Key">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                                    </svg>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            html += '</tbody></table>';
        } else {
            html += '<p class="schema-no-data">No foreign keys defined</p>';
        }
        html += '</div>';

        container.innerHTML = html;

        // Bind row click events for selection
        this.bindSchemaRowEvents();
    }

    /**
     * Bind schema row click events and inline editing
     */
    bindSchemaRowEvents() {
        const container = document.getElementById('schema-table-container');
        if (!container) return;

        // Bind section header buttons (Add Column, Add Index, etc.)
        this.bindSchemaSectionButtons(container);

        // Bind inline editable cells (Null, Default, Comment)
        container.querySelectorAll('.schema-cell-editable').forEach(cell => {
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = cell.dataset.action;
                const colName = cell.dataset.column;
                const col = this.schemaData?.columns?.find(c => c.name === colName);

                if (!col) return;
                this.initSchemaEditor();

                switch (action) {
                    case 'toggle-null': {
                        const nullable = cell.dataset.nullable === 'true';
                        schemaEditor.toggleNullable(colName, nullable);
                        break;
                    }
                    case 'set-default':
                        schemaEditor.showSetDefault(col);
                        break;
                    case 'set-comment':
                        schemaEditor.showSetComment(col);
                        break;
                }
            });
        });

        // Action button clicks (Modify, Drop)
        container.querySelectorAll('.schema-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                this.initSchemaEditor();

                switch (action) {
                    case 'modify': {
                        const colName = btn.dataset.column;
                        const col = this.schemaData?.columns?.find(c => c.name === colName);
                        if (col) schemaEditor.showModifyColumn(col);
                        break;
                    }
                    case 'drop': {
                        const colName = btn.dataset.column;
                        schemaEditor.dropColumn(colName);
                        break;
                    }
                    case 'drop-index': {
                        const indexName = btn.dataset.index;
                        schemaEditor.dropIndex(indexName);
                        break;
                    }
                    case 'drop-fk': {
                        const fkName = btn.dataset.fk;
                        schemaEditor.dropForeignKey(fkName);
                        break;
                    }
                }
            });
        });
    }

    /**
     * Bind schema section header buttons
     */
    bindSchemaSectionButtons(container) {
        // Add Column button
        container.querySelector('#btn-add-column')?.addEventListener('click', () => {
            this.initSchemaEditor();
            schemaEditor.showAddColumn();
        });

        // Primary Key button
        container.querySelector('#btn-add-primary-key')?.addEventListener('click', () => {
            this.initSchemaEditor();
            schemaEditor.showPrimaryKey();
        });

        // Add Index button
        container.querySelector('#btn-add-index')?.addEventListener('click', () => {
            this.initSchemaEditor();
            schemaEditor.showAddIndex(false);
        });

        // Add Unique button
        container.querySelector('#btn-add-unique')?.addEventListener('click', () => {
            this.initSchemaEditor();
            schemaEditor.showAddIndex(true);
        });

        // Add Foreign Key button
        container.querySelector('#btn-add-foreign-key')?.addEventListener('click', () => {
            this.initSchemaEditor();
            schemaEditor.showAddForeignKey();
        });
    }

    /**
     * Show schema empty state
     */
    showSchemaEmptyState() {
        const container = document.getElementById('schema-table-container');
        const emptyState = document.getElementById('schema-empty-state');
        const toolbar = document.getElementById('schema-toolbar');

        if (container) container.style.display = 'none';
        if (emptyState) emptyState.style.display = 'flex';
        if (toolbar) toolbar.style.display = 'none';
    }
}

export default DataBrowser;
