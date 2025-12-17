/**
 * DataBrowser - PHPMyAdmin-like data browsing interface
 */

import toast from './Toast.js';
import DataGrid from './DataGrid.js';
import rowViewer from './RowViewer.js';
import rowEditor from './RowEditor.js';
import confirmModal from './ConfirmModal.js';

class DataBrowser {
    constructor(schema, onSQLChange) {
        this.schema = schema;
        this.onSQLChange = onSQLChange;

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

        // Fetch data
        await this.fetchData();
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
    }
}

export default DataBrowser;
