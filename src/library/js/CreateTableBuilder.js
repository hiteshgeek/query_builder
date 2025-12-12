/**
 * CreateTableBuilder - Visual table creation with no-code approach
 */

import toast from './Toast.js';

class CreateTableBuilder {
    constructor(schema, onSQLChange) {
        this.schema = schema;
        this.onSQLChange = onSQLChange;

        // Table properties
        this.tableName = '';
        this.engine = 'InnoDB';
        this.charset = 'utf8mb4';
        this.collation = 'utf8mb4_unicode_ci';

        // Columns (ordered array)
        this.columns = []; // { name, type, length, nullable, defaultValue, autoIncrement, unsigned, primaryKey, unique, comment }

        // Indexes
        this.indexes = []; // { name, type, columns[] }

        // Foreign Keys
        this.foreignKeys = []; // { name, column, refTable, refColumn, onDelete, onUpdate }

        // Column templates
        this.columnTemplates = {
            id: {
                name: 'ID (Primary Key)',
                columns: [{
                    name: 'id',
                    type: 'INT',
                    length: '11',
                    nullable: false,
                    unsigned: true,
                    autoIncrement: true,
                    primaryKey: true
                }]
            },
            uuid: {
                name: 'UUID (Primary Key)',
                columns: [{
                    name: 'id',
                    type: 'CHAR',
                    length: '36',
                    nullable: false,
                    primaryKey: true
                }]
            },
            timestamps: {
                name: 'Timestamps (created_at, updated_at)',
                columns: [
                    {
                        name: 'created_at',
                        type: 'TIMESTAMP',
                        nullable: false,
                        defaultValue: 'CURRENT_TIMESTAMP'
                    },
                    {
                        name: 'updated_at',
                        type: 'TIMESTAMP',
                        nullable: false,
                        defaultValue: 'CURRENT_TIMESTAMP',
                        extra: 'ON UPDATE CURRENT_TIMESTAMP'
                    }
                ]
            },
            softDelete: {
                name: 'Soft Delete (deleted_at)',
                columns: [{
                    name: 'deleted_at',
                    type: 'TIMESTAMP',
                    nullable: true,
                    defaultValue: 'NULL'
                }]
            },
            status: {
                name: 'Status Field',
                columns: [{
                    name: 'status',
                    type: 'ENUM',
                    enumValues: "'active','inactive','pending'",
                    nullable: false,
                    defaultValue: "'active'"
                }]
            }
        };

        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        // Table properties
        document.getElementById('create-table-name')?.addEventListener('input', (e) => {
            this.tableName = e.target.value;
            this.updateSQL();
        });

        document.getElementById('create-table-engine')?.addEventListener('change', (e) => {
            this.engine = e.target.value;
            this.updateSQL();
        });

        document.getElementById('create-table-charset')?.addEventListener('change', (e) => {
            this.charset = e.target.value;
            this.updateSQL();
        });

        document.getElementById('create-table-collation')?.addEventListener('change', (e) => {
            this.collation = e.target.value;
            this.updateSQL();
        });

        // Add column button
        document.getElementById('btn-add-create-column')?.addEventListener('click', () => this.showAddColumnForm());

        // Add index button
        document.getElementById('btn-add-create-index')?.addEventListener('click', () => this.showAddIndexForm());

        // Add foreign key button
        document.getElementById('btn-add-create-fk')?.addEventListener('click', () => this.showAddForeignKeyForm());

        // Templates button
        document.getElementById('btn-add-column-template')?.addEventListener('click', () => this.showTemplatesMenu());

        // Clone structure
        document.getElementById('btn-clone-structure')?.addEventListener('click', () => this.cloneTableStructure());

        // Collapsible sections
        document.querySelectorAll('.create-panel .collapsible-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't collapse when clicking buttons
                if (e.target.closest('button')) return;
                const section = header.closest('.collapsible');
                section.classList.toggle('collapsed');
            });
        });
    }

    updateSchema(schema) {
        this.schema = schema;
        this.populateCloneTableSelect();
    }

    populateCloneTableSelect() {
        const select = document.getElementById('create-clone-table');
        if (!select || !this.schema) return;

        select.innerHTML = `
            <option value="">Select a table to copy structure...</option>
            ${this.schema.tables.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
        `;
    }

    showAddColumnForm(editIndex = null) {
        const isEdit = editIndex !== null;
        const column = isEdit ? this.columns[editIndex] : null;

        const formHTML = `
            <div class="column-form-overlay" id="column-form-overlay">
                <div class="column-form">
                    <div class="column-form-header">
                        <h4>${isEdit ? 'Edit Column' : 'Add Column'}</h4>
                        <button class="btn-icon" id="btn-close-column-form">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                    <div class="column-form-body">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Column Name <span class="required">*</span></label>
                                <input type="text" id="col-name" value="${column?.name || ''}" placeholder="e.g., user_id, email, status">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Data Type</label>
                                <select id="col-type">
                                    <optgroup label="Numeric">
                                        <option value="INT" ${column?.type === 'INT' ? 'selected' : ''}>INT</option>
                                        <option value="BIGINT" ${column?.type === 'BIGINT' ? 'selected' : ''}>BIGINT</option>
                                        <option value="SMALLINT" ${column?.type === 'SMALLINT' ? 'selected' : ''}>SMALLINT</option>
                                        <option value="TINYINT" ${column?.type === 'TINYINT' ? 'selected' : ''}>TINYINT</option>
                                        <option value="DECIMAL" ${column?.type === 'DECIMAL' ? 'selected' : ''}>DECIMAL</option>
                                        <option value="FLOAT" ${column?.type === 'FLOAT' ? 'selected' : ''}>FLOAT</option>
                                        <option value="DOUBLE" ${column?.type === 'DOUBLE' ? 'selected' : ''}>DOUBLE</option>
                                    </optgroup>
                                    <optgroup label="String">
                                        <option value="VARCHAR" ${column?.type === 'VARCHAR' ? 'selected' : ''}>VARCHAR</option>
                                        <option value="CHAR" ${column?.type === 'CHAR' ? 'selected' : ''}>CHAR</option>
                                        <option value="TEXT" ${column?.type === 'TEXT' ? 'selected' : ''}>TEXT</option>
                                        <option value="MEDIUMTEXT" ${column?.type === 'MEDIUMTEXT' ? 'selected' : ''}>MEDIUMTEXT</option>
                                        <option value="LONGTEXT" ${column?.type === 'LONGTEXT' ? 'selected' : ''}>LONGTEXT</option>
                                        <option value="ENUM" ${column?.type === 'ENUM' ? 'selected' : ''}>ENUM</option>
                                        <option value="SET" ${column?.type === 'SET' ? 'selected' : ''}>SET</option>
                                    </optgroup>
                                    <optgroup label="Date/Time">
                                        <option value="DATE" ${column?.type === 'DATE' ? 'selected' : ''}>DATE</option>
                                        <option value="DATETIME" ${column?.type === 'DATETIME' ? 'selected' : ''}>DATETIME</option>
                                        <option value="TIMESTAMP" ${column?.type === 'TIMESTAMP' ? 'selected' : ''}>TIMESTAMP</option>
                                        <option value="TIME" ${column?.type === 'TIME' ? 'selected' : ''}>TIME</option>
                                        <option value="YEAR" ${column?.type === 'YEAR' ? 'selected' : ''}>YEAR</option>
                                    </optgroup>
                                    <optgroup label="Binary">
                                        <option value="BLOB" ${column?.type === 'BLOB' ? 'selected' : ''}>BLOB</option>
                                        <option value="BINARY" ${column?.type === 'BINARY' ? 'selected' : ''}>BINARY</option>
                                        <option value="VARBINARY" ${column?.type === 'VARBINARY' ? 'selected' : ''}>VARBINARY</option>
                                    </optgroup>
                                    <optgroup label="Other">
                                        <option value="JSON" ${column?.type === 'JSON' ? 'selected' : ''}>JSON</option>
                                        <option value="BOOLEAN" ${column?.type === 'BOOLEAN' ? 'selected' : ''}>BOOLEAN</option>
                                    </optgroup>
                                </select>
                            </div>
                            <div class="form-group" id="col-length-group">
                                <label>Length/Values</label>
                                <input type="text" id="col-length" value="${column?.length || column?.enumValues || ''}" placeholder="e.g., 255 or 10,2">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Default Value</label>
                                <input type="text" id="col-default" value="${column?.defaultValue || ''}" placeholder="e.g., NULL, 0, CURRENT_TIMESTAMP">
                            </div>
                        </div>
                        <div class="form-row form-row-checkboxes">
                            <label class="checkbox-label">
                                <input type="checkbox" id="col-nullable" ${column?.nullable !== false ? 'checked' : ''}>
                                <span>NULL</span>
                            </label>
                            <label class="checkbox-label" id="col-unsigned-group">
                                <input type="checkbox" id="col-unsigned" ${column?.unsigned ? 'checked' : ''}>
                                <span>UNSIGNED</span>
                            </label>
                            <label class="checkbox-label" id="col-ai-group">
                                <input type="checkbox" id="col-auto-increment" ${column?.autoIncrement ? 'checked' : ''}>
                                <span>AUTO_INCREMENT</span>
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="col-primary-key" ${column?.primaryKey ? 'checked' : ''}>
                                <span>PRIMARY KEY</span>
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="col-unique" ${column?.unique ? 'checked' : ''}>
                                <span>UNIQUE</span>
                            </label>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Comment</label>
                                <input type="text" id="col-comment" value="${column?.comment || ''}" placeholder="Optional column description">
                            </div>
                        </div>
                    </div>
                    <div class="column-form-footer">
                        <button class="btn btn-secondary" id="btn-cancel-column">Cancel</button>
                        <button class="btn btn-primary" id="btn-save-column" data-index="${editIndex ?? ''}">
                            ${isEdit ? 'Update Column' : 'Add Column'}
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Remove existing form if any
        document.getElementById('column-form-overlay')?.remove();

        // Add form to container
        const container = document.getElementById('create-columns-container');
        container.insertAdjacentHTML('beforeend', formHTML);

        // Bind form events
        document.getElementById('btn-close-column-form')?.addEventListener('click', () => this.closeColumnForm());
        document.getElementById('btn-cancel-column')?.addEventListener('click', () => this.closeColumnForm());
        document.getElementById('btn-save-column')?.addEventListener('click', () => this.saveColumn(editIndex));
        document.getElementById('col-type')?.addEventListener('change', (e) => this.updateColumnFormForType(e.target.value));

        // Initialize form state based on type
        this.updateColumnFormForType(document.getElementById('col-type')?.value || 'INT');

        // Focus name input
        document.getElementById('col-name')?.focus();
    }

    updateColumnFormForType(type) {
        const lengthGroup = document.getElementById('col-length-group');
        const lengthInput = document.getElementById('col-length');
        const unsignedGroup = document.getElementById('col-unsigned-group');
        const aiGroup = document.getElementById('col-ai-group');

        const numericTypes = ['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'FLOAT', 'DOUBLE'];
        const stringTypes = ['VARCHAR', 'CHAR'];
        const enumTypes = ['ENUM', 'SET'];
        const noLengthTypes = ['TEXT', 'MEDIUMTEXT', 'LONGTEXT', 'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR', 'JSON', 'BOOLEAN', 'BLOB'];

        // Show/hide unsigned and auto_increment for numeric types
        if (unsignedGroup) {
            unsignedGroup.style.display = numericTypes.includes(type) ? '' : 'none';
        }
        if (aiGroup) {
            const intTypes = ['INT', 'BIGINT', 'SMALLINT', 'TINYINT'];
            aiGroup.style.display = intTypes.includes(type) ? '' : 'none';
        }

        // Configure length field
        if (lengthGroup && lengthInput) {
            if (noLengthTypes.includes(type)) {
                lengthGroup.style.display = 'none';
            } else {
                lengthGroup.style.display = '';
                if (enumTypes.includes(type)) {
                    lengthInput.placeholder = "'val1','val2','val3'";
                } else if (type === 'DECIMAL') {
                    lengthInput.placeholder = "10,2";
                } else if (stringTypes.includes(type)) {
                    lengthInput.placeholder = "255";
                } else {
                    lengthInput.placeholder = "11";
                }
            }
        }
    }

    closeColumnForm() {
        document.getElementById('column-form-overlay')?.remove();
    }

    saveColumn(editIndex) {
        const name = document.getElementById('col-name')?.value?.trim();
        const type = document.getElementById('col-type')?.value;
        const length = document.getElementById('col-length')?.value?.trim();
        const defaultValue = document.getElementById('col-default')?.value?.trim();
        const nullable = document.getElementById('col-nullable')?.checked;
        const unsigned = document.getElementById('col-unsigned')?.checked;
        const autoIncrement = document.getElementById('col-auto-increment')?.checked;
        const primaryKey = document.getElementById('col-primary-key')?.checked;
        const unique = document.getElementById('col-unique')?.checked;
        const comment = document.getElementById('col-comment')?.value?.trim();

        if (!name) {
            toast.warning('Column name is required');
            return;
        }

        // Check for duplicate names
        const existingIndex = this.columns.findIndex((c, i) => c.name.toLowerCase() === name.toLowerCase() && i !== editIndex);
        if (existingIndex !== -1) {
            toast.error('A column with this name already exists');
            return;
        }

        const column = {
            name,
            type,
            length: ['ENUM', 'SET'].includes(type) ? '' : length,
            enumValues: ['ENUM', 'SET'].includes(type) ? length : '',
            defaultValue,
            nullable,
            unsigned,
            autoIncrement,
            primaryKey,
            unique,
            comment
        };

        if (editIndex !== null && editIndex !== '') {
            this.columns[parseInt(editIndex)] = column;
        } else {
            this.columns.push(column);
        }

        this.closeColumnForm();
        this.renderColumns();
        this.updateSQL();
    }

    renderColumns() {
        const container = document.getElementById('create-columns-container');
        if (!container) return;

        if (this.columns.length === 0) {
            container.innerHTML = '<div class="placeholder">No columns defined. Click "Add Column" or use a template to get started.</div>';
            return;
        }

        container.innerHTML = `
            <div class="columns-list">
                ${this.columns.map((col, index) => `
                    <div class="column-row" data-index="${index}">
                        <div class="drag-handle" data-tooltip="Drag to reorder">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>
                                <circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>
                            </svg>
                        </div>
                        <div class="column-info">
                            <span class="column-name">${col.name}</span>
                            <span class="column-type">${this.formatColumnType(col)}</span>
                            <span class="column-constraints">${this.formatConstraints(col)}</span>
                        </div>
                        <div class="column-actions">
                            <button class="btn-icon-sm" data-action="edit" data-index="${index}" data-tooltip="Edit">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            <button class="btn-icon-sm btn-danger-icon" data-action="delete" data-index="${index}" data-tooltip="Delete">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        // Bind events
        container.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', () => this.showAddColumnForm(parseInt(btn.dataset.index)));
        });

        container.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', () => this.removeColumn(parseInt(btn.dataset.index)));
        });
    }

    formatColumnType(col) {
        let type = col.type;
        if (col.length) {
            type += `(${col.length})`;
        } else if (col.enumValues) {
            type += `(${col.enumValues})`;
        }
        if (col.unsigned) {
            type += ' UNSIGNED';
        }
        return type;
    }

    formatConstraints(col) {
        const constraints = [];
        if (col.primaryKey) constraints.push('PK');
        if (col.autoIncrement) constraints.push('AI');
        if (col.unique) constraints.push('UQ');
        if (!col.nullable) constraints.push('NN');
        return constraints.join(', ');
    }

    removeColumn(index) {
        this.columns.splice(index, 1);
        this.renderColumns();
        this.updateSQL();
    }

    showTemplatesMenu() {
        const btn = document.getElementById('btn-add-column-template');
        if (!btn) return;

        // Remove existing menu
        document.getElementById('templates-menu')?.remove();

        const menuHTML = `
            <div class="dropdown-menu" id="templates-menu">
                ${Object.entries(this.columnTemplates).map(([key, template]) => `
                    <button class="dropdown-item" data-template="${key}">
                        ${template.name}
                    </button>
                `).join('')}
            </div>
        `;

        btn.insertAdjacentHTML('afterend', menuHTML);

        const menu = document.getElementById('templates-menu');
        menu.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                this.applyTemplate(item.dataset.template);
                menu.remove();
            });
        });

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!e.target.closest('#templates-menu') && !e.target.closest('#btn-add-column-template')) {
                    menu?.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 0);
    }

    applyTemplate(templateKey) {
        const template = this.columnTemplates[templateKey];
        if (!template) return;

        template.columns.forEach(col => {
            // Check if column already exists
            if (!this.columns.some(c => c.name === col.name)) {
                this.columns.push({ ...col });
            }
        });

        this.renderColumns();
        this.updateSQL();
        toast.success(`Added ${template.name}`);
    }

    showAddIndexForm(editIndex = null) {
        // Implementation for adding indexes
        toast.info('Index form coming soon');
    }

    showAddForeignKeyForm(editIndex = null) {
        // Implementation for adding foreign keys
        toast.info('Foreign key form coming soon');
    }

    async cloneTableStructure() {
        const select = document.getElementById('create-clone-table');
        const tableName = select?.value;

        if (!tableName) {
            toast.warning('Please select a table to copy from');
            return;
        }

        const table = this.schema?.tables.find(t => t.name === tableName);
        if (!table) {
            toast.error('Table not found');
            return;
        }

        // Copy columns
        this.columns = table.columns.map(col => ({
            name: col.name,
            type: col.data_type.toUpperCase(),
            length: this.extractLength(col.column_type),
            nullable: col.nullable === 'YES',
            defaultValue: col.default_value || '',
            autoIncrement: col.extra?.includes('auto_increment'),
            unsigned: col.column_type?.includes('unsigned'),
            primaryKey: col.key_type === 'PRI',
            unique: col.key_type === 'UNI',
            comment: col.comment || ''
        }));

        this.renderColumns();
        this.updateSQL();
        toast.success(`Copied structure from ${tableName}`);
    }

    extractLength(columnType) {
        const match = columnType?.match(/\(([^)]+)\)/);
        return match ? match[1] : '';
    }

    buildSQL() {
        if (!this.tableName) {
            return '-- Enter a table name to generate CREATE TABLE statement';
        }

        if (this.columns.length === 0) {
            return '-- Add at least one column to generate CREATE TABLE statement';
        }

        let sql = `CREATE TABLE \`${this.tableName}\` (\n`;

        // Columns
        const columnDefs = this.columns.map(col => {
            let def = `  \`${col.name}\` ${col.type}`;

            if (col.length) {
                def += `(${col.length})`;
            } else if (col.enumValues) {
                def += `(${col.enumValues})`;
            }

            if (col.unsigned) {
                def += ' UNSIGNED';
            }

            if (!col.nullable) {
                def += ' NOT NULL';
            }

            if (col.autoIncrement) {
                def += ' AUTO_INCREMENT';
            }

            if (col.defaultValue) {
                def += ` DEFAULT ${col.defaultValue}`;
            }

            if (col.extra) {
                def += ` ${col.extra}`;
            }

            if (col.comment) {
                def += ` COMMENT '${col.comment.replace(/'/g, "\\'")}'`;
            }

            return def;
        });

        sql += columnDefs.join(',\n');

        // Primary key
        const pkColumns = this.columns.filter(c => c.primaryKey);
        if (pkColumns.length > 0) {
            sql += `,\n  PRIMARY KEY (\`${pkColumns.map(c => c.name).join('`, `')}\`)`;
        }

        // Unique indexes
        const uniqueColumns = this.columns.filter(c => c.unique && !c.primaryKey);
        uniqueColumns.forEach(col => {
            sql += `,\n  UNIQUE KEY \`${col.name}_unique\` (\`${col.name}\`)`;
        });

        // Additional indexes
        this.indexes.forEach(idx => {
            const indexType = idx.type === 'UNIQUE' ? 'UNIQUE KEY' : (idx.type === 'FULLTEXT' ? 'FULLTEXT KEY' : 'KEY');
            sql += `,\n  ${indexType} \`${idx.name}\` (\`${idx.columns.join('`, `')}\`)`;
        });

        // Foreign keys
        this.foreignKeys.forEach(fk => {
            sql += `,\n  CONSTRAINT \`${fk.name}\` FOREIGN KEY (\`${fk.column}\`) REFERENCES \`${fk.refTable}\`(\`${fk.refColumn}\`)`;
            if (fk.onDelete) sql += ` ON DELETE ${fk.onDelete}`;
            if (fk.onUpdate) sql += ` ON UPDATE ${fk.onUpdate}`;
        });

        sql += '\n)';
        sql += ` ENGINE=${this.engine}`;
        sql += ` DEFAULT CHARSET=${this.charset}`;
        sql += ` COLLATE=${this.collation}`;
        sql += ';';

        return sql;
    }

    updateSQL() {
        if (this.onSQLChange) {
            this.onSQLChange(this.buildSQL());
        }
    }

    clear() {
        this.tableName = '';
        this.engine = 'InnoDB';
        this.charset = 'utf8mb4';
        this.collation = 'utf8mb4_unicode_ci';
        this.columns = [];
        this.indexes = [];
        this.foreignKeys = [];

        // Reset form fields
        document.getElementById('create-table-name').value = '';
        document.getElementById('create-table-engine').value = 'InnoDB';
        document.getElementById('create-table-charset').value = 'utf8mb4';
        document.getElementById('create-table-collation').value = 'utf8mb4_unicode_ci';

        this.renderColumns();
        this.updateSQL();
    }

    getSQL() {
        return this.buildSQL();
    }

    getData() {
        return {
            tableName: this.tableName,
            engine: this.engine,
            charset: this.charset,
            collation: this.collation,
            columns: this.columns,
            indexes: this.indexes,
            foreignKeys: this.foreignKeys
        };
    }
}

export default CreateTableBuilder;
