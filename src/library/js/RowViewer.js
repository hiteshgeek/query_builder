/**
 * RowViewer - Read-only modal for viewing row details
 */

import toast from './Toast.js';

class RowViewer {
    constructor() {
        this.modal = null;
        this.currentRow = null;
        this.columns = [];
        this.createModal();
    }

    createModal() {
        // Create modal container
        this.modal = document.createElement('div');
        this.modal.className = 'modal-overlay row-viewer-modal';
        this.modal.innerHTML = `
            <div class="modal row-viewer-content">
                <div class="modal-header">
                    <h3 class="modal-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                        <span>Row Details</span>
                    </h3>
                    <button class="modal-close" title="Close">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body row-viewer-body">
                    <!-- Content will be rendered here -->
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" data-action="copy-json">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Copy as JSON
                    </button>
                    <button class="btn btn-primary" data-action="close">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modal);
        this.bindEvents();
    }

    bindEvents() {
        // Close button
        this.modal.querySelector('.modal-close').addEventListener('click', () => this.hide());

        // Close on overlay click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.hide();
        });

        // Footer buttons
        this.modal.querySelector('[data-action="close"]').addEventListener('click', () => this.hide());
        this.modal.querySelector('[data-action="copy-json"]').addEventListener('click', () => this.copyAsJson());

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('show')) {
                this.hide();
            }
        });
    }

    /**
     * Show the modal with row data
     */
    show(rowData, columns) {
        this.currentRow = rowData;
        this.columns = columns;
        this.render();
        this.modal.classList.add('show');
    }

    /**
     * Hide the modal
     */
    hide() {
        this.modal.classList.remove('show');
        this.currentRow = null;
    }

    /**
     * Render the row data
     */
    render() {
        const body = this.modal.querySelector('.row-viewer-body');

        if (!this.currentRow || !this.columns.length) {
            body.innerHTML = '<div class="row-viewer-empty">No data to display</div>';
            return;
        }

        body.innerHTML = `
            <div class="row-viewer-grid">
                ${this.columns.map(col => this.renderField(col)).join('')}
            </div>
        `;

        // Bind copy buttons
        body.querySelectorAll('.field-copy-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const value = btn.dataset.value;
                navigator.clipboard.writeText(value).then(() => {
                    toast.success('Copied to clipboard');
                });
            });
        });
    }

    /**
     * Render a single field
     */
    renderField(column) {
        const value = this.currentRow[column.name];
        const formattedValue = this.formatValue(value, column);
        const rawValue = value === null ? '' : String(value);

        return `
            <div class="row-viewer-field">
                <div class="field-header">
                    <span class="field-name">${column.name}</span>
                    <span class="field-type">${column.column_type || column.data_type}</span>
                    ${value !== null ? `
                        <button class="field-copy-btn" data-value="${this.escapeHtml(rawValue)}" title="Copy value">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                        </button>
                    ` : ''}
                </div>
                <div class="field-value ${value === null ? 'is-null' : ''}">${formattedValue}</div>
            </div>
        `;
    }

    /**
     * Format value for display
     */
    formatValue(value, column) {
        if (value === null) {
            return '<span class="null-badge">NULL</span>';
        }

        if (value === '') {
            return '<span class="empty-badge">empty string</span>';
        }

        const dataType = column.data_type?.toLowerCase() || '';

        // Boolean
        if (dataType === 'tinyint' && column.numeric_precision === 1) {
            return value === 1 || value === '1' ?
                '<span class="bool-badge true">true</span>' :
                '<span class="bool-badge false">false</span>';
        }

        // JSON - pretty print
        if (dataType === 'json' || dataType === 'jsonb') {
            try {
                const parsed = typeof value === 'string' ? JSON.parse(value) : value;
                return `<pre class="json-pretty">${this.escapeHtml(JSON.stringify(parsed, null, 2))}</pre>`;
            } catch {
                return `<pre class="text-value">${this.escapeHtml(String(value))}</pre>`;
            }
        }

        // Long text - show in pre
        const stringValue = String(value);
        if (stringValue.length > 100 || stringValue.includes('\n')) {
            return `<pre class="text-value">${this.escapeHtml(stringValue)}</pre>`;
        }

        // Date/time
        if (['date', 'datetime', 'timestamp'].includes(dataType)) {
            return `<span class="date-value">${this.escapeHtml(stringValue)}</span>`;
        }

        // Default
        return this.escapeHtml(stringValue);
    }

    /**
     * Copy row data as JSON
     */
    copyAsJson() {
        if (!this.currentRow) return;

        try {
            const json = JSON.stringify(this.currentRow, null, 2);
            navigator.clipboard.writeText(json).then(() => {
                toast.success('Row copied as JSON');
            });
        } catch (error) {
            toast.error('Failed to copy');
        }
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

// Export singleton instance
export default new RowViewer();
