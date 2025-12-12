/**
 * DataGrid - Reusable data grid component for displaying tabular data
 */

class DataGrid {
    constructor(container, callbacks = {}) {
        this.container = container;
        this.callbacks = callbacks;

        // Data
        this.rows = [];
        this.columns = [];
        this.primaryKey = [];
        this.selectedRows = new Set();
        this.sortColumn = null;
        this.sortOrder = 'ASC';
    }

    /**
     * Render the grid with data
     */
    render(options) {
        this.rows = options.rows || [];
        this.columns = options.columns || [];
        this.primaryKey = options.primaryKey || [];
        this.selectedRows = options.selectedRows || new Set();
        this.sortColumn = options.sortColumn || null;
        this.sortOrder = options.sortOrder || 'ASC';

        if (!this.container) return;

        if (this.rows.length === 0) {
            this.container.innerHTML = this.renderEmptyGrid();
            return;
        }

        this.container.innerHTML = `
            <div class="data-grid-wrapper">
                <table class="data-grid">
                    <thead>
                        ${this.renderHeader()}
                    </thead>
                    <tbody>
                        ${this.renderRows()}
                    </tbody>
                </table>
            </div>
        `;

        this.bindEvents();
    }

    /**
     * Render table header
     */
    renderHeader() {
        const allSelected = this.rows.length > 0 &&
            this.rows.every(row => this.selectedRows.has(this.getRowId(row)));

        let html = '<tr>';

        // Checkbox column
        html += `
            <th class="grid-col-checkbox">
                <input type="checkbox"
                       class="grid-select-all"
                       ${allSelected ? 'checked' : ''}
                       title="Select all rows">
            </th>
        `;

        // Data columns
        this.columns.forEach(col => {
            const isPrimary = this.primaryKey.includes(col.name);
            const isSorted = this.sortColumn === col.name;
            const sortIcon = this.getSortIcon(col.name);

            html += `
                <th class="grid-col-header ${isSorted ? 'sorted' : ''}"
                    data-column="${col.name}"
                    title="${this.getColumnTooltip(col)}">
                    <div class="grid-header-content">
                        ${isPrimary ? '<span class="pk-icon" title="Primary Key">🔑</span>' : ''}
                        <span class="col-name">${col.name}</span>
                        <span class="sort-icon">${sortIcon}</span>
                    </div>
                </th>
            `;
        });

        // Sticky actions column header
        html += '<th class="grid-col-actions"></th>';

        html += '</tr>';
        return html;
    }

    /**
     * Render table rows
     */
    renderRows() {
        return this.rows.map(row => this.renderRow(row)).join('');
    }

    /**
     * Render a single row
     */
    renderRow(row) {
        const rowId = this.getRowId(row);
        const isSelected = this.selectedRows.has(rowId);
        const rowIdAttr = rowId !== null ? `data-row-id="${this.escapeHtml(String(rowId))}"` : '';

        let html = `<tr class="${isSelected ? 'selected' : ''}" ${rowIdAttr}>`;

        // Checkbox cell
        html += `
            <td class="grid-cell-checkbox">
                <input type="checkbox"
                       class="grid-row-select"
                       ${isSelected ? 'checked' : ''}
                       ${rowId === null ? 'disabled title="No primary key"' : ''}>
            </td>
        `;

        // Data cells
        this.columns.forEach(col => {
            const value = row[col.name];
            const cellContent = this.formatCellValue(value, col);
            const isPrimary = this.primaryKey.includes(col.name);

            html += `
                <td class="grid-cell ${isPrimary ? 'pk-cell' : ''} ${value === null ? 'null-value' : ''}"
                    data-column="${col.name}">
                    ${cellContent}
                </td>
            `;
        });

        // Actions cell - always visible
        html += `
            <td class="grid-cell-actions">
                <div class="row-actions">
                    <button class="row-action-btn" data-action="view" title="View details">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                    <button class="row-action-btn" data-action="edit" title="Edit row" ${rowId === null ? 'disabled' : ''}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="row-action-btn" data-action="duplicate" title="Duplicate row">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                    </button>
                    <button class="row-action-btn danger" data-action="delete" title="Delete row" ${rowId === null ? 'disabled' : ''}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3,6 5,6 21,6"/>
                            <path d="M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"/>
                        </svg>
                    </button>
                </div>
            </td>
        `;

        html += '</tr>';
        return html;
    }

    /**
     * Format cell value for display
     */
    formatCellValue(value, column) {
        if (value === null) {
            return '<span class="null-badge">NULL</span>';
        }

        if (value === '') {
            return '<span class="empty-badge">empty</span>';
        }

        // Format based on data type
        const dataType = column.data_type?.toLowerCase() || '';

        // Boolean/tinyint(1)
        if (dataType === 'tinyint' && column.numeric_precision === 1) {
            return value === 1 || value === '1' ?
                '<span class="bool-badge true">true</span>' :
                '<span class="bool-badge false">false</span>';
        }

        // JSON
        if (dataType === 'json' || dataType === 'jsonb') {
            try {
                const formatted = typeof value === 'string' ? value : JSON.stringify(value);
                return `<span class="json-value" title="${this.escapeHtml(formatted)}">${this.truncate(formatted, 50)}</span>`;
            } catch {
                return this.escapeHtml(String(value));
            }
        }

        // Date/DateTime
        if (['date', 'datetime', 'timestamp'].includes(dataType)) {
            return `<span class="date-value">${this.escapeHtml(String(value))}</span>`;
        }

        // Long text
        const stringValue = String(value);
        if (stringValue.length > 100) {
            return `<span class="truncated-text" title="${this.escapeHtml(stringValue)}">${this.escapeHtml(this.truncate(stringValue, 100))}</span>`;
        }

        return this.escapeHtml(stringValue);
    }

    /**
     * Get sort icon for column
     */
    getSortIcon(columnName) {
        if (this.sortColumn !== columnName) {
            return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sort-inactive">
                <path d="M7 15l5 5 5-5"/>
                <path d="M7 9l5-5 5 5"/>
            </svg>`;
        }

        if (this.sortOrder === 'ASC') {
            return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sort-active">
                <path d="M7 9l5-5 5 5"/>
            </svg>`;
        }

        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sort-active">
            <path d="M7 15l5 5 5-5"/>
        </svg>`;
    }

    /**
     * Get tooltip for column header
     */
    getColumnTooltip(column) {
        let tooltip = `${column.name} (${column.column_type || column.data_type})`;
        if (column.is_nullable === 'NO') tooltip += ' NOT NULL';
        if (column.column_default !== null) tooltip += ` DEFAULT: ${column.column_default}`;
        return tooltip;
    }

    /**
     * Render empty grid state
     */
    renderEmptyGrid() {
        return `
            <div class="data-grid-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="9" y1="21" x2="9" y2="9"/>
                </svg>
                <p>No data found</p>
                <span class="text-muted">Try adjusting your search or filters</span>
            </div>
        `;
    }

    /**
     * Bind event handlers
     */
    bindEvents() {
        // Select all checkbox
        const selectAll = this.container.querySelector('.grid-select-all');
        selectAll?.addEventListener('change', (e) => {
            if (this.callbacks.onSelectAll) {
                this.callbacks.onSelectAll(e.target.checked);
            }
        });

        // Row checkboxes
        this.container.querySelectorAll('.grid-row-select').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const row = e.target.closest('tr');
                const rowId = row?.dataset.rowId;
                if (rowId !== undefined && this.callbacks.onRowSelect) {
                    this.callbacks.onRowSelect(this.parseRowId(rowId), e.target.checked);
                }
            });
        });

        // Column header sort
        this.container.querySelectorAll('.grid-col-header').forEach(header => {
            header.addEventListener('click', () => {
                const column = header.dataset.column;
                if (column && this.callbacks.onSort) {
                    this.callbacks.onSort(column);
                }
            });
        });

        // Row action buttons
        this.container.querySelectorAll('.row-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const row = btn.closest('tr');
                const rowId = row?.dataset.rowId;
                const rowData = this.getRowDataById(rowId);

                if (action && this.callbacks.onAction) {
                    this.callbacks.onAction(action, this.parseRowId(rowId), rowData);
                }
            });
        });
    }

    /**
     * Update selection state without full re-render
     */
    updateSelection(selectedRows) {
        this.selectedRows = selectedRows;

        // Update checkboxes
        this.container.querySelectorAll('tbody tr').forEach(tr => {
            const rowId = tr.dataset.rowId;
            const isSelected = rowId !== undefined && this.selectedRows.has(this.parseRowId(rowId));
            const checkbox = tr.querySelector('.grid-row-select');

            tr.classList.toggle('selected', isSelected);
            if (checkbox) checkbox.checked = isSelected;
        });

        // Update select all checkbox
        const selectAll = this.container.querySelector('.grid-select-all');
        if (selectAll) {
            const allSelected = this.rows.length > 0 &&
                this.rows.every(row => this.selectedRows.has(this.getRowId(row)));
            selectAll.checked = allSelected;
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
     * Parse row ID from string (handles composite keys)
     */
    parseRowId(rowIdStr) {
        if (rowIdStr === undefined || rowIdStr === null) return null;

        // If composite key, it's stored as string
        if (this.primaryKey.length > 1) {
            return rowIdStr;
        }

        // Try to parse as number if it looks like one
        const parsed = Number(rowIdStr);
        return isNaN(parsed) ? rowIdStr : parsed;
    }

    /**
     * Get row data by row ID
     */
    getRowDataById(rowIdStr) {
        if (rowIdStr === undefined) return null;

        return this.rows.find(row => {
            const id = this.getRowId(row);
            return String(id) === String(rowIdStr);
        }) || null;
    }

    /**
     * Truncate text with ellipsis
     */
    truncate(str, maxLength) {
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength - 3) + '...';
    }

    /**
     * Escape HTML special characters
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

export default DataGrid;
