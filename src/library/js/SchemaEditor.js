/**
 * SchemaEditor - Modal-based schema editing operations
 * Handles ADD COLUMN, MODIFY COLUMN, DROP COLUMN, indexes, foreign keys, etc.
 */

import toast from './Toast.js';
import confirmModal from './ConfirmModal.js';

class SchemaEditor {
    constructor() {
        this.modal = null;
        this.currentTable = null;
        this.currentDatabase = null;
        this.schemaData = null;
        this.allTables = [];
        this.onSuccess = null;
        this.selectedColumn = null;
        this.selectedIndex = null;
        this.selectedForeignKey = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.createModal();
        this.bindEvents();
        this.initialized = true;
    }

    createModal() {
        const existingModal = document.getElementById('schema-editor-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'schema-editor-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-container schema-editor-modal">
                <div class="modal-header">
                    <h3 id="schema-editor-title">Schema Editor</h3>
                    <button class="modal-close" id="schema-editor-close">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body" id="schema-editor-body">
                    <!-- Dynamic content -->
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="schema-editor-cancel">Cancel</button>
                    <button class="btn btn-primary" id="schema-editor-save">Save Changes</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.modal = modal;
    }

    bindEvents() {
        document.getElementById('schema-editor-close')?.addEventListener('click', () => this.close());
        document.getElementById('schema-editor-cancel')?.addEventListener('click', () => this.close());
        document.getElementById('schema-editor-save')?.addEventListener('click', () => this.save());

        // Close on overlay click
        this.modal?.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        // Close on ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal?.classList.contains('show')) {
                this.close();
            }
        });
    }

    setContext(table, database, schemaData, allTables, onSuccess) {
        // Lazy init - ensures modal is created after DOM is ready
        this.init();

        this.currentTable = table;
        this.currentDatabase = database;
        this.schemaData = schemaData;
        this.allTables = allTables;
        this.onSuccess = onSuccess;
    }

    // ==========================================
    // ADD COLUMN
    // ==========================================
    showAddColumn() {
        document.getElementById('schema-editor-title').textContent = 'Add Column';
        document.getElementById('schema-editor-body').innerHTML = this.getColumnForm();
        this.currentOperation = 'add-column';
        this.show();
        this.bindColumnFormEvents();
    }

    // ==========================================
    // MODIFY COLUMN
    // ==========================================
    showModifyColumn(columnData) {
        this.selectedColumn = columnData;
        document.getElementById('schema-editor-title').textContent = `Modify Column: ${columnData.name}`;
        document.getElementById('schema-editor-body').innerHTML = this.getColumnForm(columnData);
        this.currentOperation = 'modify-column';
        this.show();
        this.bindColumnFormEvents();
    }

    // ==========================================
    // DROP COLUMN
    // ==========================================
    async dropColumn(columnName) {
        const confirmed = await confirmModal.show({
            title: 'Drop Column',
            message: `Are you sure you want to drop the column "${columnName}"?\n\nThis will permanently delete all data in this column.`,
            confirmText: 'Drop Column',
            cancelText: 'Cancel',
            type: 'danger'
        });

        if (!confirmed) return;

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/alter.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: this.currentTable,
                    database: this.currentDatabase,
                    operations: [{
                        type: 'DROP_COLUMN',
                        column: columnName
                    }]
                })
            });

            const result = await response.json();
            if (result.error) throw new Error(result.message);

            toast.success(`Column "${columnName}" dropped successfully`);
            if (this.onSuccess) this.onSuccess();
        } catch (error) {
            toast.error('Failed to drop column: ' + error.message);
        }
    }

    // ==========================================
    // SET/REMOVE NULL
    // ==========================================
    async toggleNullable(columnName, currentNullable) {
        const newNullable = !currentNullable;
        const action = newNullable ? 'allow' : 'disallow';

        try {
            // Get column info to preserve type
            const col = this.schemaData?.columns?.find(c => c.name === columnName);
            if (!col) throw new Error('Column not found');

            // Build definition carefully, preserving all column properties
            const definition = {
                type: col.type,
                nullable: newNullable
            };

            // Check if column has auto_increment
            const hasAutoIncrement = col.extra && col.extra.toLowerCase().includes('auto_increment');
            if (hasAutoIncrement) {
                definition.auto_increment = true;
                // Auto-increment columns cannot have a default value
            } else if (col.default !== null && col.default !== undefined) {
                // Only include default if it's not an auto_increment column
                definition.default = col.default;
            }

            // Preserve comment if exists
            if (col.comment) {
                definition.comment = col.comment;
            }

            const response = await fetch(`${window.APP_CONFIG.apiBase}/alter.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: this.currentTable,
                    database: this.currentDatabase,
                    operations: [{
                        type: 'MODIFY_COLUMN',
                        column: columnName,
                        definition
                    }]
                })
            });

            const result = await response.json();
            if (result.error) throw new Error(result.message);

            toast.success(`Column "${columnName}" now ${newNullable ? 'allows' : 'disallows'} NULL`);
            if (this.onSuccess) this.onSuccess();
        } catch (error) {
            // Clean up error message for display
            let errorMsg = error.message;
            // Remove "Database error:" prefix if present
            errorMsg = errorMsg.replace(/^Database error:\s*/i, '');
            toast.error(errorMsg);
        }
    }

    // ==========================================
    // SET/REMOVE DEFAULT
    // ==========================================
    showSetDefault(columnData) {
        this.selectedColumn = columnData;
        document.getElementById('schema-editor-title').textContent = `Set Default: ${columnData.name}`;
        document.getElementById('schema-editor-body').innerHTML = `
            <div class="form-group">
                <label>Column</label>
                <input type="text" class="form-input" value="${columnData.name}" disabled>
            </div>
            <div class="form-group">
                <label>Current Type</label>
                <input type="text" class="form-input" value="${columnData.type}" disabled>
            </div>
            <div class="form-group">
                <label>Default Value</label>
                <input type="text" class="form-input" id="schema-default-value"
                    value="${columnData.default !== null ? columnData.default : ''}"
                    placeholder="Enter default value (leave empty for NULL)">
                <small class="form-help">Use CURRENT_TIMESTAMP for timestamp columns</small>
            </div>
            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="schema-default-null" ${columnData.default === null ? 'checked' : ''}>
                    Set to NULL (no default)
                </label>
            </div>
        `;
        this.currentOperation = 'set-default';
        this.show();

        // Bind checkbox to disable input
        document.getElementById('schema-default-null')?.addEventListener('change', (e) => {
            document.getElementById('schema-default-value').disabled = e.target.checked;
        });
    }

    async removeDefault(columnName) {
        try {
            const col = this.schemaData?.columns?.find(c => c.name === columnName);
            if (!col) throw new Error('Column not found');

            const definition = {
                type: col.type,
                nullable: col.nullable
                // No default = remove default
            };

            // Preserve auto_increment if exists
            const hasAutoIncrement = col.extra && col.extra.toLowerCase().includes('auto_increment');
            if (hasAutoIncrement) {
                definition.auto_increment = true;
            }

            // Preserve comment if exists
            if (col.comment) {
                definition.comment = col.comment;
            }

            const response = await fetch(`${window.APP_CONFIG.apiBase}/alter.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: this.currentTable,
                    database: this.currentDatabase,
                    operations: [{
                        type: 'MODIFY_COLUMN',
                        column: columnName,
                        definition
                    }]
                })
            });

            const result = await response.json();
            if (result.error) throw new Error(result.message);

            toast.success(`Default value removed from "${columnName}"`);
            if (this.onSuccess) this.onSuccess();
        } catch (error) {
            toast.error('Failed to remove default: ' + error.message);
        }
    }

    // ==========================================
    // COLUMN COMMENT
    // ==========================================
    showSetComment(columnData) {
        this.selectedColumn = columnData;
        document.getElementById('schema-editor-title').textContent = `Edit Comment: ${columnData.name}`;
        document.getElementById('schema-editor-body').innerHTML = `
            <div class="form-group">
                <label>Column</label>
                <input type="text" class="form-input" value="${columnData.name}" disabled>
            </div>
            <div class="form-group">
                <label>Column Type</label>
                <input type="text" class="form-input" value="${columnData.type}" disabled>
            </div>
            <div class="form-group">
                <label>Comment</label>
                <textarea class="form-input" id="schema-comment-value" rows="3"
                    placeholder="Enter column comment (description)">${columnData.comment || ''}</textarea>
                <small class="form-help">Describe what this column is used for</small>
            </div>
        `;
        this.currentOperation = 'set-comment';
        this.show();
    }

    async updateComment(columnName, comment) {
        try {
            const col = this.schemaData?.columns?.find(c => c.name === columnName);
            if (!col) throw new Error('Column not found');

            const definition = {
                type: col.type,
                nullable: col.nullable,
                comment: comment || null
            };

            // Preserve auto_increment if exists
            const hasAutoIncrement = col.extra && col.extra.toLowerCase().includes('auto_increment');
            if (hasAutoIncrement) {
                definition.auto_increment = true;
            } else if (col.default !== null && col.default !== undefined) {
                // Only include default if it's not an auto_increment column
                definition.default = col.default;
            }

            const response = await fetch(`${window.APP_CONFIG.apiBase}/alter.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: this.currentTable,
                    database: this.currentDatabase,
                    operations: [{
                        type: 'MODIFY_COLUMN',
                        column: columnName,
                        definition
                    }]
                })
            });

            const result = await response.json();
            if (result.error) throw new Error(result.message);

            toast.success(`Comment ${comment ? 'updated' : 'removed'} for "${columnName}"`);
            if (this.onSuccess) this.onSuccess();
        } catch (error) {
            toast.error('Failed to update comment: ' + error.message);
        }
    }

    // ==========================================
    // PRIMARY KEY
    // ==========================================
    showPrimaryKey() {
        const columns = this.schemaData?.columns || [];
        const currentPK = this.schemaData?.primary_key || [];

        document.getElementById('schema-editor-title').textContent = 'Manage Primary Key';
        document.getElementById('schema-editor-body').innerHTML = `
            <div class="form-group">
                <label>Select columns for primary key (composite key supported)</label>
                <div class="schema-column-select">
                    ${columns.map(col => `
                        <label class="checkbox-label schema-pk-column">
                            <input type="checkbox" name="pk_columns" value="${col.name}"
                                ${currentPK.includes(col.name) ? 'checked' : ''}>
                            <span class="column-name">${col.name}</span>
                            <span class="column-type">${col.type}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
            ${currentPK.length > 0 ? `
                <div class="form-group">
                    <p class="form-help warning">
                        <strong>Warning:</strong> Changing the primary key will drop the existing one first.
                    </p>
                </div>
            ` : ''}
        `;
        this.currentOperation = 'primary-key';
        this.show();
    }

    // ==========================================
    // FOREIGN KEY
    // ==========================================
    showAddForeignKey() {
        const columns = this.schemaData?.columns || [];

        document.getElementById('schema-editor-title').textContent = 'Add Foreign Key';
        document.getElementById('schema-editor-body').innerHTML = `
            <div class="form-group">
                <label>Constraint Name (optional)</label>
                <input type="text" class="form-input" id="fk-name" placeholder="Auto-generated if empty">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Local Column</label>
                    <select class="form-input" id="fk-column">
                        <option value="">Select column...</option>
                        ${columns.map(col => `<option value="${col.name}">${col.name} (${col.type})</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Referenced Table</label>
                    <select class="form-input" id="fk-ref-table">
                        <option value="">Select table...</option>
                        ${this.allTables.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Referenced Column</label>
                <select class="form-input" id="fk-ref-column" disabled>
                    <option value="">Select referenced table first...</option>
                </select>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>On Delete</label>
                    <select class="form-input" id="fk-on-delete">
                        <option value="RESTRICT">RESTRICT</option>
                        <option value="CASCADE">CASCADE</option>
                        <option value="SET NULL">SET NULL</option>
                        <option value="NO ACTION">NO ACTION</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>On Update</label>
                    <select class="form-input" id="fk-on-update">
                        <option value="RESTRICT">RESTRICT</option>
                        <option value="CASCADE">CASCADE</option>
                        <option value="SET NULL">SET NULL</option>
                        <option value="NO ACTION">NO ACTION</option>
                    </select>
                </div>
            </div>
        `;
        this.currentOperation = 'add-foreign-key';
        this.show();

        // Bind referenced table change to load columns
        document.getElementById('fk-ref-table')?.addEventListener('change', async (e) => {
            const refTable = e.target.value;
            const refColSelect = document.getElementById('fk-ref-column');

            if (!refTable) {
                refColSelect.disabled = true;
                refColSelect.innerHTML = '<option value="">Select referenced table first...</option>';
                return;
            }

            try {
                const params = new URLSearchParams({ table: refTable });
                if (this.currentDatabase) params.append('database', this.currentDatabase);

                const response = await fetch(`${window.APP_CONFIG.apiBase}/schema.php?${params}`);
                const result = await response.json();

                if (result.error) throw new Error(result.message);

                refColSelect.disabled = false;
                refColSelect.innerHTML = result.data.columns.map(col =>
                    `<option value="${col.name}">${col.name} (${col.type})</option>`
                ).join('');
            } catch (error) {
                toast.error('Failed to load columns: ' + error.message);
            }
        });
    }

    async dropForeignKey(fkName) {
        const confirmed = await confirmModal.show({
            title: 'Drop Foreign Key',
            message: `Are you sure you want to drop the foreign key "${fkName}"?`,
            confirmText: 'Drop',
            cancelText: 'Cancel',
            type: 'danger'
        });

        if (!confirmed) return;

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/alter.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: this.currentTable,
                    database: this.currentDatabase,
                    operations: [{
                        type: 'DROP_FOREIGN_KEY',
                        name: fkName
                    }]
                })
            });

            const result = await response.json();
            if (result.error) throw new Error(result.message);

            toast.success(`Foreign key "${fkName}" dropped successfully`);
            if (this.onSuccess) this.onSuccess();
        } catch (error) {
            toast.error('Failed to drop foreign key: ' + error.message);
        }
    }

    // ==========================================
    // INDEX
    // ==========================================
    showAddIndex(isUnique = false) {
        const columns = this.schemaData?.columns || [];

        document.getElementById('schema-editor-title').textContent = isUnique ? 'Add Unique Constraint' : 'Add Index';
        document.getElementById('schema-editor-body').innerHTML = `
            <div class="form-group">
                <label>Index Name (optional)</label>
                <input type="text" class="form-input" id="idx-name" placeholder="Auto-generated if empty">
            </div>
            <div class="form-group">
                <label>Select columns for ${isUnique ? 'unique constraint' : 'index'} (order matters)</label>
                <div class="schema-column-select">
                    ${columns.map(col => `
                        <label class="checkbox-label schema-idx-column">
                            <input type="checkbox" name="idx_columns" value="${col.name}">
                            <span class="column-name">${col.name}</span>
                            <span class="column-type">${col.type}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
            ${!isUnique ? `
                <div class="form-group">
                    <label>Index Type</label>
                    <select class="form-input" id="idx-type">
                        <option value="BTREE">BTREE (default)</option>
                        <option value="HASH">HASH</option>
                        <option value="FULLTEXT">FULLTEXT</option>
                    </select>
                </div>
            ` : ''}
            <input type="hidden" id="idx-unique" value="${isUnique ? '1' : '0'}">
        `;
        this.currentOperation = 'add-index';
        this.show();
    }

    async dropIndex(indexName) {
        const confirmed = await confirmModal.show({
            title: 'Drop Index',
            message: `Are you sure you want to drop the index "${indexName}"?`,
            confirmText: 'Drop',
            cancelText: 'Cancel',
            type: 'danger'
        });

        if (!confirmed) return;

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/alter.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: this.currentTable,
                    database: this.currentDatabase,
                    operations: [{
                        type: 'DROP_INDEX',
                        name: indexName
                    }]
                })
            });

            const result = await response.json();
            if (result.error) throw new Error(result.message);

            toast.success(`Index "${indexName}" dropped successfully`);
            if (this.onSuccess) this.onSuccess();
        } catch (error) {
            toast.error('Failed to drop index: ' + error.message);
        }
    }

    // ==========================================
    // COLUMN FORM HELPER
    // ==========================================
    getColumnForm(existingData = null) {
        const dataTypes = [
            { group: 'Numeric', types: ['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'FLOAT', 'DOUBLE'] },
            { group: 'String', types: ['VARCHAR', 'CHAR', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT'] },
            { group: 'Date/Time', types: ['DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR'] },
            { group: 'Binary', types: ['BLOB', 'MEDIUMBLOB', 'LONGBLOB'] },
            { group: 'Other', types: ['ENUM', 'SET', 'JSON', 'BOOLEAN'] }
        ];

        const currentType = existingData?.type?.toUpperCase().split('(')[0] || '';
        const currentLength = existingData?.type?.match(/\((\d+)\)/)?.[1] || '';

        return `
            <div class="form-row">
                <div class="form-group flex-2">
                    <label>Column Name</label>
                    <input type="text" class="form-input" id="col-name"
                        value="${existingData?.name || ''}"
                        ${existingData ? 'disabled' : ''}
                        placeholder="column_name">
                </div>
                <div class="form-group flex-2">
                    <label>Data Type</label>
                    <select class="form-input" id="col-type">
                        ${dataTypes.map(group => `
                            <optgroup label="${group.group}">
                                ${group.types.map(t => `
                                    <option value="${t}" ${currentType === t ? 'selected' : ''}>${t}</option>
                                `).join('')}
                            </optgroup>
                        `).join('')}
                    </select>
                </div>
                <div class="form-group flex-1">
                    <label>Length</label>
                    <input type="text" class="form-input" id="col-length"
                        value="${currentLength}"
                        placeholder="255">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group flex-1">
                    <label class="checkbox-label">
                        <input type="checkbox" id="col-nullable" ${existingData?.nullable !== false ? 'checked' : ''}>
                        Allow NULL
                    </label>
                </div>
                <div class="form-group flex-1">
                    <label class="checkbox-label">
                        <input type="checkbox" id="col-unsigned" ${existingData?.type?.includes('unsigned') ? 'checked' : ''}>
                        Unsigned (numeric)
                    </label>
                </div>
                <div class="form-group flex-1">
                    <label class="checkbox-label">
                        <input type="checkbox" id="col-auto-increment" ${existingData?.extra?.includes('auto_increment') ? 'checked' : ''}>
                        Auto Increment
                    </label>
                </div>
            </div>
            <div class="form-group">
                <label>Default Value</label>
                <input type="text" class="form-input" id="col-default"
                    value="${existingData?.default || ''}"
                    placeholder="Leave empty for no default">
                <small class="form-help">Use CURRENT_TIMESTAMP for timestamp, NULL for null default</small>
            </div>
            <div class="form-group">
                <label>Comment (optional)</label>
                <input type="text" class="form-input" id="col-comment"
                    value="${existingData?.comment || ''}"
                    placeholder="Column description">
            </div>
            ${!existingData ? `
                <div class="form-group">
                    <label>Position</label>
                    <select class="form-input" id="col-position">
                        <option value="">At the end</option>
                        <option value="FIRST">At the beginning (FIRST)</option>
                        ${(this.schemaData?.columns || []).map(c =>
                            `<option value="AFTER ${c.name}">After ${c.name}</option>`
                        ).join('')}
                    </select>
                </div>
            ` : ''}
        `;
    }

    bindColumnFormEvents() {
        // Auto-set length for VARCHAR
        document.getElementById('col-type')?.addEventListener('change', (e) => {
            const lengthInput = document.getElementById('col-length');
            if (e.target.value === 'VARCHAR' && !lengthInput.value) {
                lengthInput.value = '255';
            }
        });
    }

    // ==========================================
    // SAVE OPERATIONS
    // ==========================================
    async save() {
        try {
            let operations = [];

            switch (this.currentOperation) {
                case 'add-column':
                    operations = this.buildAddColumnOperation();
                    break;
                case 'modify-column':
                    operations = this.buildModifyColumnOperation();
                    break;
                case 'set-default':
                    operations = this.buildSetDefaultOperation();
                    break;
                case 'primary-key':
                    operations = this.buildPrimaryKeyOperation();
                    break;
                case 'add-foreign-key':
                    operations = this.buildAddForeignKeyOperation();
                    break;
                case 'add-index':
                    operations = this.buildAddIndexOperation();
                    break;
                case 'set-comment':
                    operations = this.buildSetCommentOperation();
                    break;
                default:
                    throw new Error('Unknown operation');
            }

            if (operations.length === 0) {
                toast.warning('No changes to save');
                return;
            }

            const response = await fetch(`${window.APP_CONFIG.apiBase}/alter.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: this.currentTable,
                    database: this.currentDatabase,
                    operations
                })
            });

            const result = await response.json();
            if (result.error) throw new Error(result.message);

            toast.success('Schema updated successfully');
            this.close();
            if (this.onSuccess) this.onSuccess();

        } catch (error) {
            toast.error('Failed to update schema: ' + error.message);
        }
    }

    buildAddColumnOperation() {
        const name = document.getElementById('col-name')?.value?.trim();
        if (!name) throw new Error('Column name is required');

        const type = document.getElementById('col-type')?.value;
        const length = document.getElementById('col-length')?.value;
        const nullable = document.getElementById('col-nullable')?.checked;
        const unsigned = document.getElementById('col-unsigned')?.checked;
        const autoIncrement = document.getElementById('col-auto-increment')?.checked;
        const defaultVal = document.getElementById('col-default')?.value;
        const comment = document.getElementById('col-comment')?.value;
        const position = document.getElementById('col-position')?.value;

        let fullType = type;
        if (length) fullType += `(${length})`;
        if (unsigned) fullType += ' UNSIGNED';

        return [{
            type: 'ADD_COLUMN',
            column: name,
            definition: {
                type: fullType,
                nullable,
                auto_increment: autoIncrement,
                default: defaultVal || null,
                comment: comment || null
            },
            position: position || null
        }];
    }

    buildModifyColumnOperation() {
        const name = this.selectedColumn?.name;
        if (!name) throw new Error('No column selected');

        const type = document.getElementById('col-type')?.value;
        const length = document.getElementById('col-length')?.value;
        const nullable = document.getElementById('col-nullable')?.checked;
        const unsigned = document.getElementById('col-unsigned')?.checked;
        const autoIncrement = document.getElementById('col-auto-increment')?.checked;
        const defaultVal = document.getElementById('col-default')?.value;
        const comment = document.getElementById('col-comment')?.value;

        let fullType = type;
        if (length) fullType += `(${length})`;
        if (unsigned) fullType += ' UNSIGNED';

        return [{
            type: 'MODIFY_COLUMN',
            column: name,
            definition: {
                type: fullType,
                nullable,
                auto_increment: autoIncrement,
                default: defaultVal || null,
                comment: comment || null
            }
        }];
    }

    buildSetDefaultOperation() {
        const name = this.selectedColumn?.name;
        if (!name) throw new Error('No column selected');

        const isNull = document.getElementById('schema-default-null')?.checked;
        const value = isNull ? null : document.getElementById('schema-default-value')?.value;

        const definition = {
            type: this.selectedColumn.type,
            nullable: this.selectedColumn.nullable,
            default: value
        };

        // Preserve auto_increment if exists
        const hasAutoIncrement = this.selectedColumn.extra &&
            this.selectedColumn.extra.toLowerCase().includes('auto_increment');
        if (hasAutoIncrement) {
            definition.auto_increment = true;
        }

        // Preserve comment if exists
        if (this.selectedColumn.comment) {
            definition.comment = this.selectedColumn.comment;
        }

        return [{
            type: 'MODIFY_COLUMN',
            column: name,
            definition
        }];
    }

    buildPrimaryKeyOperation() {
        const checkboxes = document.querySelectorAll('input[name="pk_columns"]:checked');
        const columns = Array.from(checkboxes).map(cb => cb.value);

        if (columns.length === 0) {
            throw new Error('Select at least one column for the primary key');
        }

        const operations = [];

        // Drop existing PK if exists
        if (this.schemaData?.primary_key?.length > 0) {
            operations.push({ type: 'DROP_PRIMARY_KEY' });
        }

        // Add new PK
        operations.push({
            type: 'ADD_PRIMARY_KEY',
            columns
        });

        return operations;
    }

    buildAddForeignKeyOperation() {
        const name = document.getElementById('fk-name')?.value?.trim();
        const column = document.getElementById('fk-column')?.value;
        const refTable = document.getElementById('fk-ref-table')?.value;
        const refColumn = document.getElementById('fk-ref-column')?.value;
        const onDelete = document.getElementById('fk-on-delete')?.value;
        const onUpdate = document.getElementById('fk-on-update')?.value;

        if (!column) throw new Error('Local column is required');
        if (!refTable) throw new Error('Referenced table is required');
        if (!refColumn) throw new Error('Referenced column is required');

        return [{
            type: 'ADD_FOREIGN_KEY',
            name: name || null,
            column,
            references: {
                table: refTable,
                column: refColumn
            },
            on_delete: onDelete,
            on_update: onUpdate
        }];
    }

    buildAddIndexOperation() {
        const name = document.getElementById('idx-name')?.value?.trim();
        const checkboxes = document.querySelectorAll('input[name="idx_columns"]:checked');
        const columns = Array.from(checkboxes).map(cb => cb.value);
        const isUnique = document.getElementById('idx-unique')?.value === '1';
        const indexType = document.getElementById('idx-type')?.value || 'BTREE';

        if (columns.length === 0) {
            throw new Error('Select at least one column for the index');
        }

        return [{
            type: isUnique ? 'ADD_UNIQUE' : 'ADD_INDEX',
            name: name || null,
            columns,
            index_type: indexType
        }];
    }

    buildSetCommentOperation() {
        const name = this.selectedColumn?.name;
        if (!name) throw new Error('No column selected');

        const comment = document.getElementById('schema-comment-value')?.value?.trim() || null;

        const definition = {
            type: this.selectedColumn.type,
            nullable: this.selectedColumn.nullable,
            comment: comment
        };

        // Preserve auto_increment if exists
        const hasAutoIncrement = this.selectedColumn.extra &&
            this.selectedColumn.extra.toLowerCase().includes('auto_increment');
        if (hasAutoIncrement) {
            definition.auto_increment = true;
        } else if (this.selectedColumn.default !== null && this.selectedColumn.default !== undefined) {
            // Only include default if it's not an auto_increment column
            definition.default = this.selectedColumn.default;
        }

        return [{
            type: 'MODIFY_COLUMN',
            column: name,
            definition
        }];
    }

    // ==========================================
    // MODAL CONTROLS
    // ==========================================
    show() {
        this.modal?.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    close() {
        this.modal?.classList.remove('show');
        document.body.style.overflow = '';
        this.selectedColumn = null;
        this.selectedIndex = null;
        this.selectedForeignKey = null;
    }
}

// Export singleton
const schemaEditor = new SchemaEditor();
export default schemaEditor;
