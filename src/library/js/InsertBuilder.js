/**
 * InsertBuilder - Handles INSERT query building
 */

import toast from './Toast.js';

class InsertBuilder {
    constructor(schema, onSQLChange) {
        this.schema = schema;
        this.onSQLChange = onSQLChange;
        this.selectedTable = null;
        this.rows = []; // Array of { columnName: value } objects
        this.columns = []; // Available columns for selected table

        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        // Table selector
        const tableSelect = document.getElementById('insert-table-select');
        if (tableSelect) {
            tableSelect.addEventListener('change', (e) => this.selectTable(e.target.value));
        }

        // Add row button
        document.getElementById('btn-add-insert-row')?.addEventListener('click', () => this.addRow());

        // Import CSV button
        document.getElementById('btn-import-csv')?.addEventListener('click', () => this.showImportDialog('csv'));

        // Import JSON button
        document.getElementById('btn-import-json')?.addEventListener('click', () => this.showImportDialog('json'));
    }

    updateSchema(schema) {
        this.schema = schema;
        this.renderTableSelector();
    }

    renderTableSelector() {
        const tableSelect = document.getElementById('insert-table-select');
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
        this.rows = [];

        if (tableName) {
            const table = this.schema?.tables.find(t => t.name === tableName);
            this.columns = table ? table.columns : [];
            this.addRow(); // Add first empty row
        } else {
            this.columns = [];
        }

        this.renderForm();
        this.updateSQL();
    }

    addRow() {
        if (!this.selectedTable) {
            toast.warning('Please select a table first');
            return;
        }

        // Create empty row with all columns
        const row = {};
        this.columns.forEach(col => {
            // Skip auto-increment columns by default
            if (col.extra?.toLowerCase().includes('auto_increment')) {
                row[col.name] = null; // null means "use default"
            } else {
                row[col.name] = '';
            }
        });

        this.rows.push(row);
        this.renderForm();
        this.updateSQL();
    }

    removeRow(index) {
        this.rows.splice(index, 1);
        this.renderForm();
        this.updateSQL();
    }

    updateValue(rowIndex, columnName, value) {
        if (this.rows[rowIndex]) {
            this.rows[rowIndex][columnName] = value;
            this.updateSQL();
        }
    }

    renderForm() {
        const container = document.getElementById('insert-form-container');
        if (!container) return;

        if (!this.selectedTable) {
            container.innerHTML = '<div class="placeholder">Select a table to insert data</div>';
            return;
        }

        if (this.rows.length === 0) {
            container.innerHTML = '<div class="placeholder">Click "Add Row" to add data</div>';
            return;
        }

        // Get non-auto-increment columns for display
        const editableColumns = this.columns.filter(col =>
            !col.extra?.toLowerCase().includes('auto_increment')
        );

        container.innerHTML = `
            <div class="insert-table-wrapper">
                <table class="insert-table">
                    <thead>
                        <tr>
                            <th class="row-num">#</th>
                            ${editableColumns.map(col => `
                                <th data-tooltip="${col.data_type}${col.nullable === 'YES' ? ' (nullable)' : ' (required)'}">
                                    ${col.name}
                                    ${col.nullable !== 'YES' ? '<span class="required">*</span>' : ''}
                                </th>
                            `).join('')}
                            <th class="actions"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.rows.map((row, rowIndex) => `
                            <tr data-row="${rowIndex}">
                                <td class="row-num">${rowIndex + 1}</td>
                                ${editableColumns.map(col => `
                                    <td>
                                        ${this.renderInput(col, row[col.name], rowIndex)}
                                    </td>
                                `).join('')}
                                <td class="actions">
                                    <button class="btn-icon remove-row-btn" data-row="${rowIndex}" data-tooltip="Remove row">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <line x1="18" y1="6" x2="6" y2="18"/>
                                            <line x1="6" y1="6" x2="18" y2="18"/>
                                        </svg>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Bind input events
        container.querySelectorAll('.insert-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const rowIndex = parseInt(e.target.dataset.row);
                const colName = e.target.dataset.column;
                this.updateValue(rowIndex, colName, e.target.value);
            });

            // Handle NULL checkbox
            input.addEventListener('change', (e) => {
                if (e.target.type === 'checkbox' && e.target.classList.contains('null-checkbox')) {
                    const rowIndex = parseInt(e.target.dataset.row);
                    const colName = e.target.dataset.column;
                    const valueInput = container.querySelector(
                        `.insert-input[data-row="${rowIndex}"][data-column="${colName}"]:not(.null-checkbox)`
                    );
                    if (valueInput) {
                        valueInput.disabled = e.target.checked;
                        this.updateValue(rowIndex, colName, e.target.checked ? null : valueInput.value);
                    }
                }
            });
        });

        // Bind remove buttons
        container.querySelectorAll('.remove-row-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.removeRow(parseInt(btn.dataset.row));
            });
        });
    }

    renderInput(column, value, rowIndex) {
        const type = column.data_type.toLowerCase();
        const isNullable = column.nullable === 'YES';
        const isNull = value === null;

        // Determine input type based on column type
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
        } else if (type.includes('time') && !type.includes('timestamp')) {
            inputType = 'time';
        } else if (type.includes('text') || type.includes('blob')) {
            return `
                <div class="input-with-null">
                    <textarea class="insert-input" data-row="${rowIndex}" data-column="${column.name}"
                              placeholder="${column.data_type}" ${isNull ? 'disabled' : ''}>${isNull ? '' : (value || '')}</textarea>
                    ${isNullable ? `
                        <label class="null-label">
                            <input type="checkbox" class="insert-input null-checkbox"
                                   data-row="${rowIndex}" data-column="${column.name}" ${isNull ? 'checked' : ''}>
                            NULL
                        </label>
                    ` : ''}
                </div>
            `;
        } else if (type.includes('enum')) {
            // Parse enum values from type like enum('a','b','c')
            const enumMatch = column.column_type?.match(/enum\((.+)\)/i);
            const options = enumMatch ? enumMatch[1].split(',').map(v => v.trim().replace(/'/g, '')) : [];
            return `
                <div class="input-with-null">
                    <select class="insert-input" data-row="${rowIndex}" data-column="${column.name}" ${isNull ? 'disabled' : ''}>
                        <option value="">-- Select --</option>
                        ${options.map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                    </select>
                    ${isNullable ? `
                        <label class="null-label">
                            <input type="checkbox" class="insert-input null-checkbox"
                                   data-row="${rowIndex}" data-column="${column.name}" ${isNull ? 'checked' : ''}>
                            NULL
                        </label>
                    ` : ''}
                </div>
            `;
        } else if (type === 'tinyint(1)' || type === 'boolean' || type === 'bool') {
            return `
                <div class="input-with-null">
                    <select class="insert-input" data-row="${rowIndex}" data-column="${column.name}" ${isNull ? 'disabled' : ''}>
                        <option value="">-- Select --</option>
                        <option value="1" ${value === '1' || value === 1 ? 'selected' : ''}>True (1)</option>
                        <option value="0" ${value === '0' || value === 0 ? 'selected' : ''}>False (0)</option>
                    </select>
                    ${isNullable ? `
                        <label class="null-label">
                            <input type="checkbox" class="insert-input null-checkbox"
                                   data-row="${rowIndex}" data-column="${column.name}" ${isNull ? 'checked' : ''}>
                            NULL
                        </label>
                    ` : ''}
                </div>
            `;
        }

        return `
            <div class="input-with-null">
                <input type="${inputType}" class="insert-input" data-row="${rowIndex}" data-column="${column.name}"
                       value="${isNull ? '' : (value || '')}" placeholder="${column.data_type}" ${inputExtra} ${isNull ? 'disabled' : ''}>
                ${isNullable ? `
                    <label class="null-label">
                        <input type="checkbox" class="insert-input null-checkbox"
                               data-row="${rowIndex}" data-column="${column.name}" ${isNull ? 'checked' : ''}>
                        NULL
                    </label>
                ` : ''}
            </div>
        `;
    }

    buildSQL() {
        if (!this.selectedTable || this.rows.length === 0) {
            return '-- Select a table and add rows to generate INSERT statement';
        }

        // Get columns that have at least one non-null value across all rows
        const editableColumns = this.columns.filter(col =>
            !col.extra?.toLowerCase().includes('auto_increment')
        );

        const columnNames = editableColumns.map(c => c.name);

        // Build values
        const valueRows = this.rows.map(row => {
            const values = columnNames.map(colName => {
                const value = row[colName];
                if (value === null || value === undefined) {
                    return 'NULL';
                }
                if (value === '') {
                    // Check if column has a default
                    const col = this.columns.find(c => c.name === colName);
                    if (col?.default !== null) {
                        return 'DEFAULT';
                    }
                    return "''";
                }
                // Check if numeric
                const col = this.columns.find(c => c.name === colName);
                const type = col?.data_type?.toLowerCase() || '';
                if (type.includes('int') || type.includes('decimal') || type.includes('float') || type.includes('double')) {
                    return value;
                }
                // Escape single quotes
                return `'${String(value).replace(/'/g, "''")}'`;
            });
            return `(${values.join(', ')})`;
        });

        return `INSERT INTO ${this.selectedTable} (${columnNames.join(', ')})\nVALUES\n    ${valueRows.join(',\n    ')};`;
    }

    updateSQL() {
        if (this.onSQLChange) {
            this.onSQLChange(this.buildSQL());
        }
    }

    showImportDialog(format) {
        if (!this.selectedTable) {
            toast.warning('Please select a table first');
            return;
        }

        const modal = document.getElementById('import-modal');
        if (!modal) return;

        modal.classList.add('active');
        modal.dataset.format = format;

        const title = document.getElementById('import-modal-title');
        const textarea = document.getElementById('import-data');
        const hint = document.getElementById('import-hint');

        if (format === 'csv') {
            title.textContent = 'Import CSV Data';
            hint.innerHTML = `
                <p>Paste CSV data with headers matching column names:</p>
                <code>name,email,age<br>John,john@example.com,25<br>Jane,jane@example.com,30</code>
            `;
        } else {
            title.textContent = 'Import JSON Data';
            hint.innerHTML = `
                <p>Paste JSON array of objects:</p>
                <code>[{"name": "John", "email": "john@example.com"},<br>{"name": "Jane", "email": "jane@example.com"}]</code>
            `;
        }

        textarea.value = '';
        textarea.focus();

        // Bind import button
        const importBtn = document.getElementById('btn-do-import');
        const cancelBtn = document.getElementById('btn-cancel-import');

        const doImport = () => {
            this.importData(textarea.value, format);
            modal.classList.remove('active');
            importBtn.removeEventListener('click', doImport);
        };

        const cancel = () => {
            modal.classList.remove('active');
            cancelBtn.removeEventListener('click', cancel);
        };

        importBtn.addEventListener('click', doImport);
        cancelBtn.addEventListener('click', cancel);
    }

    importData(data, format) {
        try {
            let rows;
            if (format === 'csv') {
                rows = this.parseCSV(data);
            } else {
                rows = JSON.parse(data);
            }

            if (!Array.isArray(rows) || rows.length === 0) {
                throw new Error('No valid data found');
            }

            // Map imported data to our row format
            const editableColumns = this.columns.filter(col =>
                !col.extra?.toLowerCase().includes('auto_increment')
            );

            rows.forEach(importedRow => {
                const row = {};
                editableColumns.forEach(col => {
                    if (importedRow.hasOwnProperty(col.name)) {
                        row[col.name] = importedRow[col.name];
                    } else {
                        row[col.name] = col.nullable === 'YES' ? null : '';
                    }
                });
                this.rows.push(row);
            });

            this.renderForm();
            this.updateSQL();

        } catch (error) {
            toast.error('Import error: ' + error.message);
        }
    }

    parseCSV(csv) {
        const lines = csv.trim().split('\n');
        if (lines.length < 2) {
            throw new Error('CSV must have at least a header row and one data row');
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
        const rows = [];

        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] !== undefined ? values[index] : '';
            });
            rows.push(row);
        }

        return rows;
    }

    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' && !inQuotes) {
                inQuotes = true;
            } else if (char === '"' && inQuotes) {
                if (line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());

        return values;
    }

    clear() {
        this.selectedTable = null;
        this.rows = [];
        this.columns = [];
        this.renderTableSelector();
        this.renderForm();
        this.updateSQL();
    }

    getSQL() {
        return this.buildSQL();
    }

    getData() {
        return {
            table: this.selectedTable,
            rows: this.rows
        };
    }
}

export default InsertBuilder;
