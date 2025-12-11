/**
 * AlterBuilder - Handles ALTER TABLE query building
 *
 * Supports:
 * - Column operations: ADD, MODIFY, DROP, RENAME
 * - Index operations: ADD/DROP (PRIMARY, UNIQUE, INDEX, FULLTEXT)
 * - Foreign key operations: ADD/DROP
 * - Table properties: RENAME, ENGINE, CHARSET
 */

class AlterBuilder {
    constructor(schema, onSQLChange, typeToConfirm) {
        this.schema = schema;
        this.onSQLChange = onSQLChange;
        this.typeToConfirm = typeToConfirm;
        this.selectedTable = null;
        this.columns = [];
        this.indexes = [];
        this.foreignKeys = [];

        // Operations queue
        this.operations = [];

        // Current active section
        this.activeSection = 'columns';

        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        // Table selector
        const tableSelect = document.getElementById('alter-table-select');
        if (tableSelect) {
            tableSelect.addEventListener('change', (e) => this.selectTable(e.target.value));
        }

        // Section tabs
        document.querySelectorAll('.alter-section-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const section = e.target.closest('.alter-section-tab').dataset.section;
                this.switchSection(section);
            });
        });

        // Add operation buttons
        document.getElementById('btn-add-column')?.addEventListener('click', () => this.showAddColumnForm());
        document.getElementById('btn-add-index')?.addEventListener('click', () => this.showAddIndexForm());
        document.getElementById('btn-add-fk')?.addEventListener('click', () => this.showAddForeignKeyForm());
        document.getElementById('btn-rename-table')?.addEventListener('click', () => this.showRenameTableForm());
        document.getElementById('btn-change-engine')?.addEventListener('click', () => this.showChangeEngineForm());
    }

    updateSchema(schema) {
        this.schema = schema;
        this.renderTableSelector();
    }

    renderTableSelector() {
        const tableSelect = document.getElementById('alter-table-select');
        if (!tableSelect || !this.schema) return;

        tableSelect.innerHTML = `
            <option value="">Select a table...</option>
            ${this.schema.tables.map(t => `
                <option value="${t.name}" ${this.selectedTable === t.name ? 'selected' : ''}>${t.name}</option>
            `).join('')}
        `;
    }

    selectTable(tableName) {
        this.selectedTable = tableName;
        this.operations = [];

        if (tableName) {
            const table = this.schema?.tables.find(t => t.name === tableName);
            if (table) {
                this.columns = table.columns || [];
                this.indexes = table.indexes || [];
                this.foreignKeys = table.foreign_keys || [];
            }
        } else {
            this.columns = [];
            this.indexes = [];
            this.foreignKeys = [];
        }

        this.renderCurrentSection();
        this.renderOperationsQueue();
        this.updateSQL();
    }

    switchSection(section) {
        this.activeSection = section;

        // Update tabs
        document.querySelectorAll('.alter-section-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.section === section);
        });

        // Update panels
        document.querySelectorAll('.alter-section-panel').forEach(panel => {
            panel.classList.toggle('active', panel.dataset.section === section);
        });

        this.renderCurrentSection();
    }

    renderCurrentSection() {
        switch (this.activeSection) {
            case 'columns':
                this.renderColumnsSection();
                break;
            case 'indexes':
                this.renderIndexesSection();
                break;
            case 'foreign-keys':
                this.renderForeignKeysSection();
                break;
            case 'properties':
                this.renderPropertiesSection();
                break;
        }
    }

    // ============ COLUMNS SECTION ============

    renderColumnsSection() {
        const container = document.getElementById('alter-columns-container');
        if (!container) return;

        if (!this.selectedTable) {
            container.innerHTML = '<div class="placeholder">Select a table to modify columns</div>';
            return;
        }

        container.innerHTML = `
            <div class="existing-columns">
                <h4 class="subsection-title">Existing Columns</h4>
                <div class="columns-list">
                    ${this.columns.map(col => this.renderColumnRow(col)).join('')}
                </div>
            </div>
            <div id="add-column-form" class="operation-form" style="display: none;"></div>
        `;

        // Bind column action buttons
        container.querySelectorAll('.column-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.dataset.action;
                const colName = btn.closest('.column-row').dataset.column;

                switch (action) {
                    case 'modify':
                        this.showModifyColumnForm(colName);
                        break;
                    case 'rename':
                        this.showRenameColumnForm(colName);
                        break;
                    case 'drop':
                        this.queueDropColumn(colName);
                        break;
                }
            });
        });
    }

    renderColumnRow(col) {
        const isPrimary = col.key_type === 'PRI';
        const isAutoIncrement = col.extra?.toLowerCase().includes('auto_increment');

        return `
            <div class="column-row" data-column="${col.name}">
                <div class="column-info">
                    <span class="col-name ${isPrimary ? 'primary' : ''}">${col.name}</span>
                    <span class="col-type">${col.column_type || col.data_type}</span>
                    ${col.is_nullable === 'NO' ? '<span class="col-badge">NOT NULL</span>' : ''}
                    ${isPrimary ? '<span class="col-badge primary">PK</span>' : ''}
                    ${isAutoIncrement ? '<span class="col-badge">AI</span>' : ''}
                    ${col.column_default !== null ? `<span class="col-default">= ${col.column_default}</span>` : ''}
                </div>
                <div class="column-actions">
                    <button class="column-action-btn" data-action="modify" title="Modify">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="column-action-btn" data-action="rename" title="Rename">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                        </svg>
                    </button>
                    <button class="column-action-btn danger" data-action="drop" title="Drop" ${isPrimary ? 'disabled' : ''}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }

    showAddColumnForm() {
        if (!this.selectedTable) {
            alert('Please select a table first');
            return;
        }

        const form = document.getElementById('add-column-form');
        if (!form) return;

        form.style.display = 'block';
        form.innerHTML = `
            <h4 class="form-title">Add New Column</h4>
            <div class="form-grid">
                <div class="form-group">
                    <label>Column Name</label>
                    <input type="text" id="new-col-name" class="form-input" placeholder="column_name">
                </div>
                <div class="form-group">
                    <label>Data Type</label>
                    <select id="new-col-type" class="form-input">
                        <optgroup label="Numeric">
                            <option value="INT">INT</option>
                            <option value="BIGINT">BIGINT</option>
                            <option value="SMALLINT">SMALLINT</option>
                            <option value="TINYINT">TINYINT</option>
                            <option value="DECIMAL">DECIMAL</option>
                            <option value="FLOAT">FLOAT</option>
                            <option value="DOUBLE">DOUBLE</option>
                        </optgroup>
                        <optgroup label="String">
                            <option value="VARCHAR(255)">VARCHAR(255)</option>
                            <option value="VARCHAR(100)">VARCHAR(100)</option>
                            <option value="VARCHAR(50)">VARCHAR(50)</option>
                            <option value="CHAR(1)">CHAR(1)</option>
                            <option value="TEXT">TEXT</option>
                            <option value="MEDIUMTEXT">MEDIUMTEXT</option>
                            <option value="LONGTEXT">LONGTEXT</option>
                        </optgroup>
                        <optgroup label="Date/Time">
                            <option value="DATE">DATE</option>
                            <option value="DATETIME">DATETIME</option>
                            <option value="TIMESTAMP">TIMESTAMP</option>
                            <option value="TIME">TIME</option>
                            <option value="YEAR">YEAR</option>
                        </optgroup>
                        <optgroup label="Other">
                            <option value="BOOLEAN">BOOLEAN</option>
                            <option value="ENUM">ENUM</option>
                            <option value="JSON">JSON</option>
                            <option value="BLOB">BLOB</option>
                        </optgroup>
                    </select>
                </div>
                <div class="form-group">
                    <label>Length/Values</label>
                    <input type="text" id="new-col-length" class="form-input" placeholder="e.g., 255 or 'a','b','c'">
                </div>
                <div class="form-group">
                    <label>Default Value</label>
                    <input type="text" id="new-col-default" class="form-input" placeholder="NULL or value">
                </div>
                <div class="form-group checkbox-group">
                    <label><input type="checkbox" id="new-col-nullable" checked> Allow NULL</label>
                    <label><input type="checkbox" id="new-col-unsigned"> UNSIGNED</label>
                    <label><input type="checkbox" id="new-col-ai"> AUTO_INCREMENT</label>
                </div>
                <div class="form-group">
                    <label>Position</label>
                    <select id="new-col-position" class="form-input">
                        <option value="">At the end</option>
                        <option value="FIRST">FIRST (at beginning)</option>
                        ${this.columns.map(c => `<option value="AFTER ${c.name}">AFTER ${c.name}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" id="btn-cancel-add-column">Cancel</button>
                <button class="btn btn-primary" id="btn-confirm-add-column">Add to Queue</button>
            </div>
        `;

        // Bind events
        document.getElementById('btn-cancel-add-column').addEventListener('click', () => {
            form.style.display = 'none';
        });

        document.getElementById('btn-confirm-add-column').addEventListener('click', () => {
            this.queueAddColumn();
        });
    }

    queueAddColumn() {
        const name = document.getElementById('new-col-name').value.trim();
        const type = document.getElementById('new-col-type').value;
        const length = document.getElementById('new-col-length').value.trim();
        const defaultVal = document.getElementById('new-col-default').value.trim();
        const nullable = document.getElementById('new-col-nullable').checked;
        const unsigned = document.getElementById('new-col-unsigned').checked;
        const autoIncrement = document.getElementById('new-col-ai').checked;
        const position = document.getElementById('new-col-position').value;

        if (!name) {
            alert('Column name is required');
            return;
        }

        if (!name.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
            alert('Invalid column name. Use only letters, numbers, and underscores.');
            return;
        }

        // Build column definition
        let colDef = type;
        if (length && !type.includes('(')) {
            if (type === 'ENUM') {
                colDef = `ENUM(${length})`;
            } else {
                colDef = `${type}(${length})`;
            }
        }

        if (unsigned && ['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'FLOAT', 'DOUBLE'].some(t => type.includes(t))) {
            colDef += ' UNSIGNED';
        }

        if (!nullable) {
            colDef += ' NOT NULL';
        }

        if (autoIncrement) {
            colDef += ' AUTO_INCREMENT';
        }

        if (defaultVal) {
            if (defaultVal.toUpperCase() === 'NULL') {
                colDef += ' DEFAULT NULL';
            } else if (defaultVal.toUpperCase() === 'CURRENT_TIMESTAMP') {
                colDef += ' DEFAULT CURRENT_TIMESTAMP';
            } else {
                colDef += ` DEFAULT '${defaultVal}'`;
            }
        }

        this.operations.push({
            type: 'ADD_COLUMN',
            column: name,
            definition: colDef,
            position: position,
            sql: `ADD COLUMN \`${name}\` ${colDef}${position ? ' ' + position : ''}`
        });

        document.getElementById('add-column-form').style.display = 'none';
        this.renderOperationsQueue();
        this.updateSQL();
    }

    showModifyColumnForm(colName) {
        const col = this.columns.find(c => c.name === colName);
        if (!col) return;

        const form = document.getElementById('add-column-form');
        if (!form) return;

        const currentType = col.column_type || col.data_type;
        const isNullable = col.is_nullable === 'YES';
        const isUnsigned = currentType.toLowerCase().includes('unsigned');
        const isAutoIncrement = col.extra?.toLowerCase().includes('auto_increment');

        form.style.display = 'block';
        form.innerHTML = `
            <h4 class="form-title">Modify Column: ${colName}</h4>
            <div class="form-grid">
                <div class="form-group">
                    <label>Data Type</label>
                    <select id="modify-col-type" class="form-input">
                        <optgroup label="Numeric">
                            <option value="INT">INT</option>
                            <option value="BIGINT">BIGINT</option>
                            <option value="SMALLINT">SMALLINT</option>
                            <option value="TINYINT">TINYINT</option>
                            <option value="DECIMAL">DECIMAL</option>
                            <option value="FLOAT">FLOAT</option>
                            <option value="DOUBLE">DOUBLE</option>
                        </optgroup>
                        <optgroup label="String">
                            <option value="VARCHAR(255)">VARCHAR(255)</option>
                            <option value="VARCHAR(100)">VARCHAR(100)</option>
                            <option value="VARCHAR(50)">VARCHAR(50)</option>
                            <option value="CHAR(1)">CHAR(1)</option>
                            <option value="TEXT">TEXT</option>
                            <option value="MEDIUMTEXT">MEDIUMTEXT</option>
                            <option value="LONGTEXT">LONGTEXT</option>
                        </optgroup>
                        <optgroup label="Date/Time">
                            <option value="DATE">DATE</option>
                            <option value="DATETIME">DATETIME</option>
                            <option value="TIMESTAMP">TIMESTAMP</option>
                            <option value="TIME">TIME</option>
                            <option value="YEAR">YEAR</option>
                        </optgroup>
                        <optgroup label="Other">
                            <option value="BOOLEAN">BOOLEAN</option>
                            <option value="ENUM">ENUM</option>
                            <option value="JSON">JSON</option>
                            <option value="BLOB">BLOB</option>
                        </optgroup>
                    </select>
                </div>
                <div class="form-group">
                    <label>Length/Values</label>
                    <input type="text" id="modify-col-length" class="form-input" placeholder="e.g., 255">
                </div>
                <div class="form-group">
                    <label>Default Value</label>
                    <input type="text" id="modify-col-default" class="form-input" placeholder="NULL or value" value="${col.column_default || ''}">
                </div>
                <div class="form-group checkbox-group">
                    <label><input type="checkbox" id="modify-col-nullable" ${isNullable ? 'checked' : ''}> Allow NULL</label>
                    <label><input type="checkbox" id="modify-col-unsigned" ${isUnsigned ? 'checked' : ''}> UNSIGNED</label>
                    <label><input type="checkbox" id="modify-col-ai" ${isAutoIncrement ? 'checked' : ''}> AUTO_INCREMENT</label>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" id="btn-cancel-modify">Cancel</button>
                <button class="btn btn-primary" id="btn-confirm-modify">Add to Queue</button>
            </div>
        `;

        document.getElementById('btn-cancel-modify').addEventListener('click', () => {
            form.style.display = 'none';
        });

        document.getElementById('btn-confirm-modify').addEventListener('click', () => {
            this.queueModifyColumn(colName);
        });
    }

    queueModifyColumn(colName) {
        const type = document.getElementById('modify-col-type').value;
        const length = document.getElementById('modify-col-length').value.trim();
        const defaultVal = document.getElementById('modify-col-default').value.trim();
        const nullable = document.getElementById('modify-col-nullable').checked;
        const unsigned = document.getElementById('modify-col-unsigned').checked;
        const autoIncrement = document.getElementById('modify-col-ai').checked;

        let colDef = type;
        if (length && !type.includes('(')) {
            colDef = `${type}(${length})`;
        }

        if (unsigned && ['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'FLOAT', 'DOUBLE'].some(t => type.includes(t))) {
            colDef += ' UNSIGNED';
        }

        if (!nullable) {
            colDef += ' NOT NULL';
        }

        if (autoIncrement) {
            colDef += ' AUTO_INCREMENT';
        }

        if (defaultVal) {
            if (defaultVal.toUpperCase() === 'NULL') {
                colDef += ' DEFAULT NULL';
            } else if (defaultVal.toUpperCase() === 'CURRENT_TIMESTAMP') {
                colDef += ' DEFAULT CURRENT_TIMESTAMP';
            } else {
                colDef += ` DEFAULT '${defaultVal}'`;
            }
        }

        this.operations.push({
            type: 'MODIFY_COLUMN',
            column: colName,
            definition: colDef,
            sql: `MODIFY COLUMN \`${colName}\` ${colDef}`
        });

        document.getElementById('add-column-form').style.display = 'none';
        this.renderOperationsQueue();
        this.updateSQL();
    }

    showRenameColumnForm(colName) {
        const col = this.columns.find(c => c.name === colName);
        if (!col) return;

        const form = document.getElementById('add-column-form');
        if (!form) return;

        form.style.display = 'block';
        form.innerHTML = `
            <h4 class="form-title">Rename Column: ${colName}</h4>
            <div class="form-grid">
                <div class="form-group">
                    <label>Current Name</label>
                    <input type="text" class="form-input" value="${colName}" disabled>
                </div>
                <div class="form-group">
                    <label>New Name</label>
                    <input type="text" id="rename-col-newname" class="form-input" placeholder="new_column_name">
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" id="btn-cancel-rename">Cancel</button>
                <button class="btn btn-primary" id="btn-confirm-rename">Add to Queue</button>
            </div>
        `;

        document.getElementById('btn-cancel-rename').addEventListener('click', () => {
            form.style.display = 'none';
        });

        document.getElementById('btn-confirm-rename').addEventListener('click', () => {
            const newName = document.getElementById('rename-col-newname').value.trim();
            if (!newName) {
                alert('New column name is required');
                return;
            }
            if (!newName.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
                alert('Invalid column name');
                return;
            }

            const colType = col.column_type || col.data_type;
            this.operations.push({
                type: 'RENAME_COLUMN',
                column: colName,
                newName: newName,
                sql: `CHANGE COLUMN \`${colName}\` \`${newName}\` ${colType}`
            });

            form.style.display = 'none';
            this.renderOperationsQueue();
            this.updateSQL();
        });
    }

    async queueDropColumn(colName) {
        // Type-to-confirm for drop operations
        if (this.typeToConfirm) {
            const confirmed = await this.typeToConfirm.show({
                title: 'Drop Column',
                message: `This will permanently delete the column "${colName}"`,
                details: 'All data in this column will be lost. This action cannot be undone.',
                confirmWord: colName,
                confirmButtonText: 'Drop Column'
            });

            if (!confirmed) return;
        }

        this.operations.push({
            type: 'DROP_COLUMN',
            column: colName,
            sql: `DROP COLUMN \`${colName}\``
        });

        this.renderOperationsQueue();
        this.updateSQL();
    }

    // ============ INDEXES SECTION ============

    renderIndexesSection() {
        const container = document.getElementById('alter-indexes-container');
        if (!container) return;

        if (!this.selectedTable) {
            container.innerHTML = '<div class="placeholder">Select a table to manage indexes</div>';
            return;
        }

        container.innerHTML = `
            <div class="existing-indexes">
                <h4 class="subsection-title">Existing Indexes</h4>
                <div class="indexes-list">
                    ${this.indexes.length ? this.indexes.map(idx => this.renderIndexRow(idx)).join('') : '<div class="placeholder-sm">No indexes found</div>'}
                </div>
            </div>
            <div id="add-index-form" class="operation-form" style="display: none;"></div>
        `;

        container.querySelectorAll('.index-drop-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const indexName = btn.dataset.index;
                this.queueDropIndex(indexName);
            });
        });
    }

    renderIndexRow(idx) {
        const isPrimary = idx.index_name === 'PRIMARY';

        return `
            <div class="index-row">
                <div class="index-info">
                    <span class="index-name ${isPrimary ? 'primary' : ''}">${idx.index_name}</span>
                    <span class="index-type">${isPrimary ? 'PRIMARY KEY' : (idx.non_unique === '0' ? 'UNIQUE' : 'INDEX')}</span>
                    <span class="index-columns">(${idx.columns || idx.column_name})</span>
                </div>
                <button class="column-action-btn danger index-drop-btn" data-index="${idx.index_name}" ${isPrimary ? 'disabled' : ''} title="Drop Index">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
            </div>
        `;
    }

    showAddIndexForm() {
        if (!this.selectedTable) {
            alert('Please select a table first');
            return;
        }

        const form = document.getElementById('add-index-form');
        if (!form) return;

        form.style.display = 'block';
        form.innerHTML = `
            <h4 class="form-title">Add New Index</h4>
            <div class="form-grid">
                <div class="form-group">
                    <label>Index Name</label>
                    <input type="text" id="new-idx-name" class="form-input" placeholder="idx_column_name">
                </div>
                <div class="form-group">
                    <label>Index Type</label>
                    <select id="new-idx-type" class="form-input">
                        <option value="INDEX">INDEX</option>
                        <option value="UNIQUE">UNIQUE</option>
                        <option value="FULLTEXT">FULLTEXT</option>
                    </select>
                </div>
                <div class="form-group full-width">
                    <label>Columns (select one or more)</label>
                    <div class="checkbox-list">
                        ${this.columns.map(col => `
                            <label class="checkbox-item">
                                <input type="checkbox" name="idx-columns" value="${col.name}">
                                ${col.name}
                            </label>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" id="btn-cancel-add-index">Cancel</button>
                <button class="btn btn-primary" id="btn-confirm-add-index">Add to Queue</button>
            </div>
        `;

        document.getElementById('btn-cancel-add-index').addEventListener('click', () => {
            form.style.display = 'none';
        });

        document.getElementById('btn-confirm-add-index').addEventListener('click', () => {
            this.queueAddIndex();
        });
    }

    queueAddIndex() {
        const name = document.getElementById('new-idx-name').value.trim();
        const type = document.getElementById('new-idx-type').value;
        const selectedCols = Array.from(document.querySelectorAll('input[name="idx-columns"]:checked')).map(cb => cb.value);

        if (!name) {
            alert('Index name is required');
            return;
        }

        if (selectedCols.length === 0) {
            alert('Select at least one column');
            return;
        }

        const colList = selectedCols.map(c => `\`${c}\``).join(', ');

        this.operations.push({
            type: 'ADD_INDEX',
            indexName: name,
            indexType: type,
            columns: selectedCols,
            sql: `ADD ${type} \`${name}\` (${colList})`
        });

        document.getElementById('add-index-form').style.display = 'none';
        this.renderOperationsQueue();
        this.updateSQL();
    }

    async queueDropIndex(indexName) {
        if (this.typeToConfirm) {
            const confirmed = await this.typeToConfirm.show({
                title: 'Drop Index',
                message: `This will drop the index "${indexName}"`,
                details: 'This may affect query performance.',
                confirmWord: indexName,
                confirmButtonText: 'Drop Index'
            });

            if (!confirmed) return;
        }

        this.operations.push({
            type: 'DROP_INDEX',
            indexName: indexName,
            sql: `DROP INDEX \`${indexName}\``
        });

        this.renderOperationsQueue();
        this.updateSQL();
    }

    // ============ FOREIGN KEYS SECTION ============

    renderForeignKeysSection() {
        const container = document.getElementById('alter-fk-container');
        if (!container) return;

        if (!this.selectedTable) {
            container.innerHTML = '<div class="placeholder">Select a table to manage foreign keys</div>';
            return;
        }

        container.innerHTML = `
            <div class="existing-fks">
                <h4 class="subsection-title">Existing Foreign Keys</h4>
                <div class="fk-list">
                    ${this.foreignKeys.length ? this.foreignKeys.map(fk => this.renderForeignKeyRow(fk)).join('') : '<div class="placeholder-sm">No foreign keys found</div>'}
                </div>
            </div>
            <div id="add-fk-form" class="operation-form" style="display: none;"></div>
        `;

        container.querySelectorAll('.fk-drop-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const fkName = btn.dataset.fk;
                this.queueDropForeignKey(fkName);
            });
        });
    }

    renderForeignKeyRow(fk) {
        return `
            <div class="fk-row">
                <div class="fk-info">
                    <span class="fk-name">${fk.constraint_name}</span>
                    <span class="fk-definition">${fk.column_name} &rarr; ${fk.referenced_table}.${fk.referenced_column}</span>
                </div>
                <button class="column-action-btn danger fk-drop-btn" data-fk="${fk.constraint_name}" title="Drop Foreign Key">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
            </div>
        `;
    }

    showAddForeignKeyForm() {
        if (!this.selectedTable) {
            alert('Please select a table first');
            return;
        }

        const form = document.getElementById('add-fk-form');
        if (!form) return;

        const otherTables = this.schema?.tables.filter(t => t.name !== this.selectedTable) || [];

        form.style.display = 'block';
        form.innerHTML = `
            <h4 class="form-title">Add Foreign Key</h4>
            <div class="form-grid">
                <div class="form-group">
                    <label>Constraint Name</label>
                    <input type="text" id="new-fk-name" class="form-input" placeholder="fk_table_column">
                </div>
                <div class="form-group">
                    <label>Column</label>
                    <select id="new-fk-column" class="form-input">
                        <option value="">Select column...</option>
                        ${this.columns.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Reference Table</label>
                    <select id="new-fk-ref-table" class="form-input">
                        <option value="">Select table...</option>
                        ${otherTables.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Reference Column</label>
                    <select id="new-fk-ref-column" class="form-input">
                        <option value="">Select reference table first...</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>ON DELETE</label>
                    <select id="new-fk-on-delete" class="form-input">
                        <option value="RESTRICT">RESTRICT</option>
                        <option value="CASCADE">CASCADE</option>
                        <option value="SET NULL">SET NULL</option>
                        <option value="NO ACTION">NO ACTION</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>ON UPDATE</label>
                    <select id="new-fk-on-update" class="form-input">
                        <option value="RESTRICT">RESTRICT</option>
                        <option value="CASCADE">CASCADE</option>
                        <option value="SET NULL">SET NULL</option>
                        <option value="NO ACTION">NO ACTION</option>
                    </select>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" id="btn-cancel-add-fk">Cancel</button>
                <button class="btn btn-primary" id="btn-confirm-add-fk">Add to Queue</button>
            </div>
        `;

        // Update reference columns when table changes
        document.getElementById('new-fk-ref-table').addEventListener('change', (e) => {
            const refTable = this.schema?.tables.find(t => t.name === e.target.value);
            const refColSelect = document.getElementById('new-fk-ref-column');

            if (refTable) {
                refColSelect.innerHTML = `
                    <option value="">Select column...</option>
                    ${refTable.columns.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                `;
            } else {
                refColSelect.innerHTML = '<option value="">Select reference table first...</option>';
            }
        });

        document.getElementById('btn-cancel-add-fk').addEventListener('click', () => {
            form.style.display = 'none';
        });

        document.getElementById('btn-confirm-add-fk').addEventListener('click', () => {
            this.queueAddForeignKey();
        });
    }

    queueAddForeignKey() {
        const name = document.getElementById('new-fk-name').value.trim();
        const column = document.getElementById('new-fk-column').value;
        const refTable = document.getElementById('new-fk-ref-table').value;
        const refColumn = document.getElementById('new-fk-ref-column').value;
        const onDelete = document.getElementById('new-fk-on-delete').value;
        const onUpdate = document.getElementById('new-fk-on-update').value;

        if (!name || !column || !refTable || !refColumn) {
            alert('All fields are required');
            return;
        }

        this.operations.push({
            type: 'ADD_FOREIGN_KEY',
            constraintName: name,
            column: column,
            refTable: refTable,
            refColumn: refColumn,
            onDelete: onDelete,
            onUpdate: onUpdate,
            sql: `ADD CONSTRAINT \`${name}\` FOREIGN KEY (\`${column}\`) REFERENCES \`${refTable}\`(\`${refColumn}\`) ON DELETE ${onDelete} ON UPDATE ${onUpdate}`
        });

        document.getElementById('add-fk-form').style.display = 'none';
        this.renderOperationsQueue();
        this.updateSQL();
    }

    async queueDropForeignKey(fkName) {
        if (this.typeToConfirm) {
            const confirmed = await this.typeToConfirm.show({
                title: 'Drop Foreign Key',
                message: `This will drop the foreign key "${fkName}"`,
                details: 'This will remove the referential integrity constraint.',
                confirmWord: fkName,
                confirmButtonText: 'Drop FK'
            });

            if (!confirmed) return;
        }

        this.operations.push({
            type: 'DROP_FOREIGN_KEY',
            constraintName: fkName,
            sql: `DROP FOREIGN KEY \`${fkName}\``
        });

        this.renderOperationsQueue();
        this.updateSQL();
    }

    // ============ PROPERTIES SECTION ============

    renderPropertiesSection() {
        const container = document.getElementById('alter-properties-container');
        if (!container) return;

        if (!this.selectedTable) {
            container.innerHTML = '<div class="placeholder">Select a table to modify properties</div>';
            return;
        }

        container.innerHTML = `
            <div class="properties-grid">
                <div class="property-card">
                    <h4>Rename Table</h4>
                    <p>Change the table name</p>
                    <button class="btn btn-secondary" id="btn-show-rename-table">Rename</button>
                </div>
                <div class="property-card">
                    <h4>Change Engine</h4>
                    <p>Change storage engine (InnoDB, MyISAM)</p>
                    <button class="btn btn-secondary" id="btn-show-change-engine">Change Engine</button>
                </div>
                <div class="property-card">
                    <h4>Change Charset</h4>
                    <p>Change character set and collation</p>
                    <button class="btn btn-secondary" id="btn-show-change-charset">Change Charset</button>
                </div>
            </div>
            <div id="properties-form" class="operation-form" style="display: none;"></div>
        `;

        document.getElementById('btn-show-rename-table')?.addEventListener('click', () => this.showRenameTableForm());
        document.getElementById('btn-show-change-engine')?.addEventListener('click', () => this.showChangeEngineForm());
        document.getElementById('btn-show-change-charset')?.addEventListener('click', () => this.showChangeCharsetForm());
    }

    showRenameTableForm() {
        const form = document.getElementById('properties-form');
        if (!form) return;

        form.style.display = 'block';
        form.innerHTML = `
            <h4 class="form-title">Rename Table</h4>
            <div class="form-grid">
                <div class="form-group">
                    <label>Current Name</label>
                    <input type="text" class="form-input" value="${this.selectedTable}" disabled>
                </div>
                <div class="form-group">
                    <label>New Name</label>
                    <input type="text" id="rename-table-name" class="form-input" placeholder="new_table_name">
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" id="btn-cancel-rename-table">Cancel</button>
                <button class="btn btn-primary" id="btn-confirm-rename-table">Add to Queue</button>
            </div>
        `;

        document.getElementById('btn-cancel-rename-table').addEventListener('click', () => {
            form.style.display = 'none';
        });

        document.getElementById('btn-confirm-rename-table').addEventListener('click', () => {
            const newName = document.getElementById('rename-table-name').value.trim();
            if (!newName) {
                alert('New table name is required');
                return;
            }
            if (!newName.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
                alert('Invalid table name');
                return;
            }

            this.operations.push({
                type: 'RENAME_TABLE',
                newName: newName,
                sql: `RENAME TO \`${newName}\``
            });

            form.style.display = 'none';
            this.renderOperationsQueue();
            this.updateSQL();
        });
    }

    showChangeEngineForm() {
        const form = document.getElementById('properties-form');
        if (!form) return;

        form.style.display = 'block';
        form.innerHTML = `
            <h4 class="form-title">Change Storage Engine</h4>
            <div class="form-grid">
                <div class="form-group">
                    <label>New Engine</label>
                    <select id="new-engine" class="form-input">
                        <option value="InnoDB">InnoDB (recommended)</option>
                        <option value="MyISAM">MyISAM</option>
                        <option value="MEMORY">MEMORY</option>
                        <option value="CSV">CSV</option>
                        <option value="ARCHIVE">ARCHIVE</option>
                    </select>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" id="btn-cancel-engine">Cancel</button>
                <button class="btn btn-primary" id="btn-confirm-engine">Add to Queue</button>
            </div>
        `;

        document.getElementById('btn-cancel-engine').addEventListener('click', () => {
            form.style.display = 'none';
        });

        document.getElementById('btn-confirm-engine').addEventListener('click', () => {
            const engine = document.getElementById('new-engine').value;

            this.operations.push({
                type: 'CHANGE_ENGINE',
                engine: engine,
                sql: `ENGINE = ${engine}`
            });

            form.style.display = 'none';
            this.renderOperationsQueue();
            this.updateSQL();
        });
    }

    showChangeCharsetForm() {
        const form = document.getElementById('properties-form');
        if (!form) return;

        form.style.display = 'block';
        form.innerHTML = `
            <h4 class="form-title">Change Character Set</h4>
            <div class="form-grid">
                <div class="form-group">
                    <label>Character Set</label>
                    <select id="new-charset" class="form-input">
                        <option value="utf8mb4">utf8mb4 (recommended)</option>
                        <option value="utf8">utf8</option>
                        <option value="latin1">latin1</option>
                        <option value="ascii">ascii</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Collation</label>
                    <select id="new-collation" class="form-input">
                        <option value="utf8mb4_unicode_ci">utf8mb4_unicode_ci</option>
                        <option value="utf8mb4_general_ci">utf8mb4_general_ci</option>
                        <option value="utf8_general_ci">utf8_general_ci</option>
                        <option value="latin1_swedish_ci">latin1_swedish_ci</option>
                    </select>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" id="btn-cancel-charset">Cancel</button>
                <button class="btn btn-primary" id="btn-confirm-charset">Add to Queue</button>
            </div>
        `;

        document.getElementById('btn-cancel-charset').addEventListener('click', () => {
            form.style.display = 'none';
        });

        document.getElementById('btn-confirm-charset').addEventListener('click', () => {
            const charset = document.getElementById('new-charset').value;
            const collation = document.getElementById('new-collation').value;

            this.operations.push({
                type: 'CHANGE_CHARSET',
                charset: charset,
                collation: collation,
                sql: `CHARACTER SET ${charset} COLLATE ${collation}`
            });

            form.style.display = 'none';
            this.renderOperationsQueue();
            this.updateSQL();
        });
    }

    // ============ OPERATIONS QUEUE ============

    renderOperationsQueue() {
        const container = document.getElementById('alter-operations-queue');
        if (!container) return;

        if (this.operations.length === 0) {
            container.innerHTML = '<div class="placeholder-sm">No operations queued</div>';
            return;
        }

        container.innerHTML = `
            <div class="operations-list">
                ${this.operations.map((op, index) => `
                    <div class="operation-item ${this.getOperationClass(op.type)}">
                        <span class="operation-type">${this.getOperationLabel(op.type)}</span>
                        <span class="operation-detail">${this.getOperationDetail(op)}</span>
                        <button class="operation-remove" data-index="${index}">&times;</button>
                    </div>
                `).join('')}
            </div>
            <div class="operations-actions">
                <button class="btn btn-secondary" id="btn-clear-operations">Clear All</button>
            </div>
        `;

        container.querySelectorAll('.operation-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                this.operations.splice(parseInt(btn.dataset.index), 1);
                this.renderOperationsQueue();
                this.updateSQL();
            });
        });

        document.getElementById('btn-clear-operations')?.addEventListener('click', () => {
            this.operations = [];
            this.renderOperationsQueue();
            this.updateSQL();
        });
    }

    getOperationClass(type) {
        if (type.startsWith('DROP')) return 'danger';
        if (type.startsWith('ADD')) return 'success';
        return 'warning';
    }

    getOperationLabel(type) {
        const labels = {
            'ADD_COLUMN': 'ADD COL',
            'MODIFY_COLUMN': 'MODIFY',
            'RENAME_COLUMN': 'RENAME COL',
            'DROP_COLUMN': 'DROP COL',
            'ADD_INDEX': 'ADD IDX',
            'DROP_INDEX': 'DROP IDX',
            'ADD_FOREIGN_KEY': 'ADD FK',
            'DROP_FOREIGN_KEY': 'DROP FK',
            'RENAME_TABLE': 'RENAME',
            'CHANGE_ENGINE': 'ENGINE',
            'CHANGE_CHARSET': 'CHARSET'
        };
        return labels[type] || type;
    }

    getOperationDetail(op) {
        switch (op.type) {
            case 'ADD_COLUMN':
            case 'MODIFY_COLUMN':
                return op.column;
            case 'RENAME_COLUMN':
                return `${op.column} → ${op.newName}`;
            case 'DROP_COLUMN':
                return op.column;
            case 'ADD_INDEX':
            case 'DROP_INDEX':
                return op.indexName;
            case 'ADD_FOREIGN_KEY':
            case 'DROP_FOREIGN_KEY':
                return op.constraintName;
            case 'RENAME_TABLE':
                return `→ ${op.newName}`;
            case 'CHANGE_ENGINE':
                return op.engine;
            case 'CHANGE_CHARSET':
                return `${op.charset}`;
            default:
                return '';
        }
    }

    // ============ SQL BUILDING ============

    buildSQL() {
        if (!this.selectedTable) {
            return '-- Select a table to generate ALTER statement';
        }

        if (this.operations.length === 0) {
            return '-- Add operations to generate ALTER statement';
        }

        const parts = this.operations.map(op => op.sql);
        return `ALTER TABLE \`${this.selectedTable}\`\n    ${parts.join(',\n    ')};`;
    }

    updateSQL() {
        if (this.onSQLChange) {
            this.onSQLChange(this.buildSQL());
        }
    }

    clear() {
        this.selectedTable = null;
        this.operations = [];
        this.columns = [];
        this.indexes = [];
        this.foreignKeys = [];
        this.renderTableSelector();
        this.renderCurrentSection();
        this.renderOperationsQueue();
        this.updateSQL();
    }

    getSQL() {
        return this.buildSQL();
    }

    getData() {
        return {
            table: this.selectedTable,
            operations: this.operations
        };
    }

    hasOperations() {
        return this.operations.length > 0;
    }

    hasDangerousOperations() {
        return this.operations.some(op => op.type.startsWith('DROP'));
    }
}

export default AlterBuilder;
