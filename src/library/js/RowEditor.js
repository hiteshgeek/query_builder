/**
 * RowEditor - Modal for adding/editing rows
 */

import toast from './Toast.js';

class RowEditor {
    constructor() {
        this.modal = null;
        this.mode = 'add'; // 'add', 'edit', 'duplicate'
        this.tableName = null;
        this.rowId = null;
        this.originalRow = null;
        this.columns = [];
        this.primaryKey = [];
        this.onSave = null;

        this.createModal();
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'modal-overlay row-editor-modal';
        this.modal.innerHTML = `
            <div class="modal row-editor-content">
                <div class="modal-header">
                    <h3 class="modal-title">
                        <svg class="icon-add" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        <svg class="icon-edit" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        <svg class="icon-duplicate" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        <span class="modal-title-text">Add Row</span>
                    </h3>
                    <button class="modal-close" title="Close">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body row-editor-body">
                    <form class="row-editor-form">
                        <!-- Form fields will be rendered here -->
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
                    <button type="button" class="btn btn-primary" data-action="save">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span class="save-btn-text">Save</span>
                    </button>
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
        this.modal.querySelector('[data-action="cancel"]').addEventListener('click', () => this.hide());
        this.modal.querySelector('[data-action="save"]').addEventListener('click', () => this.save());

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('show')) {
                this.hide();
            }
        });
    }

    /**
     * Show modal for adding a new row
     */
    showAdd(tableName, columns, primaryKey, onSave) {
        this.mode = 'add';
        this.tableName = tableName;
        this.columns = columns;
        this.primaryKey = primaryKey;
        this.rowId = null;
        this.originalRow = null;
        this.onSave = onSave;

        this.updateTitle('Add Row', 'add');
        this.render();
        this.modal.classList.add('show');
    }

    /**
     * Show modal for editing an existing row
     */
    showEdit(tableName, rowId, rowData, columns, primaryKey, onSave) {
        this.mode = 'edit';
        this.tableName = tableName;
        this.rowId = rowId;
        this.originalRow = rowData;
        this.columns = columns;
        this.primaryKey = primaryKey;
        this.onSave = onSave;

        this.updateTitle('Edit Row', 'edit');
        this.render();
        this.modal.classList.add('show');
    }

    /**
     * Show modal for duplicating a row
     */
    showDuplicate(tableName, rowData, columns, primaryKey, onSave) {
        this.mode = 'duplicate';
        this.tableName = tableName;
        this.rowId = null;
        this.originalRow = rowData;
        this.columns = columns;
        this.primaryKey = primaryKey;
        this.onSave = onSave;

        this.updateTitle('Duplicate Row', 'duplicate');
        this.render();
        this.modal.classList.add('show');
    }

    /**
     * Update modal title and icon
     */
    updateTitle(title, mode) {
        this.modal.querySelector('.modal-title-text').textContent = title;
        this.modal.querySelector('.modal-title').className = `modal-title mode-${mode}`;

        const saveBtnText = this.modal.querySelector('.save-btn-text');
        if (mode === 'edit') {
            saveBtnText.textContent = 'Update';
        } else {
            saveBtnText.textContent = 'Insert';
        }
    }

    /**
     * Hide the modal
     */
    hide() {
        this.modal.classList.remove('show');
    }

    /**
     * Render the form fields
     */
    render() {
        const form = this.modal.querySelector('.row-editor-form');
        const isEdit = this.mode === 'edit';

        form.innerHTML = this.columns.map(col => {
            const isAutoIncrement = col.extra?.toLowerCase().includes('auto_increment');
            const isPrimaryKey = this.primaryKey.includes(col.name);
            const isReadOnly = isEdit && isPrimaryKey;

            // For add/duplicate mode, skip auto_increment columns
            if (!isEdit && isAutoIncrement) {
                return '';
            }

            // Get value
            let value = this.originalRow ? this.originalRow[col.name] : null;

            // For duplicate, clear auto-increment primary key values
            if (this.mode === 'duplicate' && isPrimaryKey && isAutoIncrement) {
                value = null;
            }

            return `
                <div class="form-field ${isReadOnly ? 'readonly' : ''}">
                    <label class="form-label">
                        <span class="field-name">${col.name}</span>
                        ${isPrimaryKey ? '<span class="field-badge pk">PK</span>' : ''}
                        ${isAutoIncrement ? '<span class="field-badge auto">AUTO</span>' : ''}
                        ${col.is_nullable === 'NO' ? '<span class="field-badge required">*</span>' : ''}
                        <span class="field-type">${col.column_type || col.data_type}</span>
                    </label>
                    ${this.renderInput(col, value, isReadOnly)}
                </div>
            `;
        }).join('');

        this.bindFormEvents();
    }

    /**
     * Render input for a column
     */
    renderInput(column, value, isReadOnly = false) {
        const type = column.data_type.toLowerCase();
        const isNullable = column.is_nullable === 'YES';
        const isNull = value === null;
        const disabled = isReadOnly ? 'disabled' : '';

        let inputHtml = '';

        if (type.includes('text') || type.includes('blob') || type === 'json') {
            inputHtml = `
                <textarea class="form-input" data-column="${column.name}"
                          placeholder="${column.data_type}" ${disabled}
                          ${isNull ? 'disabled' : ''}>${isNull ? '' : this.escapeHtml(value || '')}</textarea>
            `;
        } else if (type.includes('enum')) {
            const enumMatch = column.column_type?.match(/enum\((.+)\)/i);
            const options = enumMatch ? enumMatch[1].split(',').map(v => v.trim().replace(/'/g, '')) : [];
            inputHtml = `
                <select class="form-input" data-column="${column.name}" ${disabled} ${isNull ? 'disabled' : ''}>
                    <option value="">-- Select --</option>
                    ${options.map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                </select>
            `;
        } else if (type === 'tinyint' && column.numeric_precision === 1) {
            inputHtml = `
                <select class="form-input" data-column="${column.name}" ${disabled} ${isNull ? 'disabled' : ''}>
                    <option value="">-- Select --</option>
                    <option value="1" ${value === 1 || value === '1' ? 'selected' : ''}>True (1)</option>
                    <option value="0" ${value === 0 || value === '0' ? 'selected' : ''}>False (0)</option>
                </select>
            `;
        } else {
            let inputType = 'text';
            let inputExtra = '';

            if (type.includes('int') || type.includes('decimal') || type.includes('float') || type.includes('double')) {
                inputType = 'number';
                if (type.includes('decimal') || type.includes('float') || type.includes('double')) {
                    inputExtra = 'step="any"';
                }
            } else if (type.includes('date') && !type.includes('datetime')) {
                inputType = 'date';
            } else if (type.includes('datetime') || type.includes('timestamp')) {
                inputType = 'datetime-local';
                // Format datetime for input
                if (value && !isNull) {
                    value = value.replace(' ', 'T').substring(0, 16);
                }
            } else if (type.includes('time') && !type.includes('timestamp')) {
                inputType = 'time';
            }

            inputHtml = `
                <input type="${inputType}" class="form-input" data-column="${column.name}"
                       value="${isNull ? '' : this.escapeHtml(String(value || ''))}"
                       placeholder="${column.data_type}" ${inputExtra} ${disabled} ${isNull ? 'disabled' : ''}>
            `;
        }

        // Add null checkbox for nullable fields
        if (isNullable && !isReadOnly) {
            return `
                <div class="input-with-null">
                    ${inputHtml}
                    <label class="null-checkbox-label">
                        <input type="checkbox" class="null-checkbox" data-column="${column.name}" ${isNull ? 'checked' : ''}>
                        NULL
                    </label>
                </div>
            `;
        }

        return inputHtml;
    }

    /**
     * Bind form events (NULL checkboxes)
     */
    bindFormEvents() {
        const form = this.modal.querySelector('.row-editor-form');

        form.querySelectorAll('.null-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const column = e.target.dataset.column;
                const input = form.querySelector(`.form-input[data-column="${column}"]`);
                if (input) {
                    input.disabled = e.target.checked;
                    if (e.target.checked) {
                        if (input.tagName === 'TEXTAREA') {
                            input.value = '';
                        } else {
                            input.value = '';
                        }
                    }
                }
            });
        });
    }

    /**
     * Save the row
     */
    async save() {
        const form = this.modal.querySelector('.row-editor-form');
        const saveBtn = this.modal.querySelector('[data-action="save"]');

        // Collect form data
        const data = {};
        let hasError = false;

        this.columns.forEach(col => {
            const isAutoIncrement = col.extra?.toLowerCase().includes('auto_increment');
            const isPrimaryKey = this.primaryKey.includes(col.name);

            // Skip auto-increment for add/duplicate
            if (this.mode !== 'edit' && isAutoIncrement) {
                return;
            }

            // Skip primary key for edit (can't change PK)
            if (this.mode === 'edit' && isPrimaryKey) {
                return;
            }

            const input = form.querySelector(`.form-input[data-column="${col.name}"]`);
            const nullCheckbox = form.querySelector(`.null-checkbox[data-column="${col.name}"]`);

            if (!input) return;

            // Check if NULL
            if (nullCheckbox && nullCheckbox.checked) {
                data[col.name] = null;
            } else {
                let value = input.value;

                // Convert datetime-local format back
                if (input.type === 'datetime-local' && value) {
                    value = value.replace('T', ' ') + ':00';
                }

                // Validate required fields
                if (col.is_nullable === 'NO' && !isAutoIncrement && (value === '' || value === null)) {
                    input.classList.add('error');
                    hasError = true;
                } else {
                    input.classList.remove('error');
                }

                data[col.name] = value;
            }
        });

        if (hasError) {
            toast.error('Please fill in all required fields');
            return;
        }

        // Disable save button
        saveBtn.disabled = true;
        saveBtn.innerHTML = `
            <svg class="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="60">
                    <animate attributeName="stroke-dashoffset" values="60;0" dur="0.8s" repeatCount="indefinite"/>
                </circle>
            </svg>
            Saving...
        `;

        try {
            const url = `${window.APP_CONFIG.apiBase}/row.php`;
            let response;

            if (this.mode === 'edit') {
                // Update existing row
                response = await fetch(url, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: this.tableName,
                        id: this.rowId,
                        data: data
                    })
                });
            } else {
                // Insert new row (add or duplicate)
                response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: this.tableName,
                        data: data
                    })
                });
            }

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            toast.success(this.mode === 'edit' ? 'Row updated successfully' : 'Row inserted successfully');
            this.hide();

            // Callback to refresh data
            if (this.onSave) {
                this.onSave();
            }

        } catch (error) {
            console.error('Save error:', error);
            toast.error('Failed to save: ' + error.message);
        } finally {
            saveBtn.disabled = false;
            const saveBtnText = this.mode === 'edit' ? 'Update' : 'Insert';
            saveBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span class="save-btn-text">${saveBtnText}</span>
            `;
        }
    }

    /**
     * Escape HTML special characters
     */
    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }
}

// Export singleton instance
export default new RowEditor();
