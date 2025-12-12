/**
 * UpdateBuilder - Handles UPDATE query building
 */

import toast from './Toast.js';

class UpdateBuilder {
    constructor(schema, onSQLChange) {
        this.schema = schema;
        this.onSQLChange = onSQLChange;
        this.selectedTable = null;
        this.setValues = {}; // { columnName: value }
        this.conditions = [];
        this.columns = [];

        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        // Table selector
        const tableSelect = document.getElementById('update-table-select');
        if (tableSelect) {
            tableSelect.addEventListener('change', (e) => this.selectTable(e.target.value));
        }

        // Add condition button
        document.getElementById('btn-add-update-condition')?.addEventListener('click', () => this.addCondition());
    }

    updateSchema(schema) {
        this.schema = schema;
        this.renderTableSelector();
    }

    renderTableSelector() {
        const tableSelect = document.getElementById('update-table-select');
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
        this.setValues = {};
        this.conditions = [];

        if (tableName) {
            const table = this.schema?.tables.find(t => t.name === tableName);
            this.columns = table ? table.columns : [];
        } else {
            this.columns = [];
        }

        this.renderSetForm();
        this.renderConditions();
        this.updateSQL();
    }

    updateSetValue(columnName, value, isNull = false) {
        if (isNull) {
            this.setValues[columnName] = { value: null, isNull: true };
        } else if (value === '' || value === undefined) {
            delete this.setValues[columnName];
        } else {
            this.setValues[columnName] = { value, isNull: false };
        }
        this.updateSQL();
    }

    renderSetForm() {
        const container = document.getElementById('update-set-container');
        if (!container) return;

        if (!this.selectedTable) {
            container.innerHTML = '<div class="placeholder">Select a table to update</div>';
            return;
        }

        // Filter out auto-increment columns - they usually shouldn't be updated
        const editableColumns = this.columns.filter(col =>
            !col.extra?.toLowerCase().includes('auto_increment')
        );

        container.innerHTML = `
            <div class="set-columns-list">
                ${editableColumns.map(col => {
                    const setVal = this.setValues[col.name];
                    const isChecked = setVal !== undefined;
                    const value = setVal?.value ?? '';
                    const isNull = setVal?.isNull ?? false;

                    return `
                        <div class="set-column-row" data-column="${col.name}">
                            <label class="set-checkbox-label">
                                <input type="checkbox" class="set-checkbox" data-column="${col.name}" ${isChecked ? 'checked' : ''}>
                                <span class="column-name-label">${col.name}</span>
                                <span class="column-type-label">${col.data_type}</span>
                            </label>
                            <div class="set-value-wrapper ${isChecked ? 'active' : ''}">
                                ${this.renderSetInput(col, value, isNull)}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        // Bind checkbox events
        container.querySelectorAll('.set-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const colName = e.target.dataset.column;
                const wrapper = e.target.closest('.set-column-row').querySelector('.set-value-wrapper');
                wrapper.classList.toggle('active', e.target.checked);

                if (e.target.checked) {
                    const input = wrapper.querySelector('.set-input');
                    if (input) {
                        this.updateSetValue(colName, input.value);
                    }
                } else {
                    delete this.setValues[colName];
                    this.updateSQL();
                }
            });
        });

        // Bind input events
        container.querySelectorAll('.set-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const colName = e.target.dataset.column;
                const checkbox = container.querySelector(`.set-checkbox[data-column="${colName}"]`);
                if (checkbox?.checked) {
                    this.updateSetValue(colName, e.target.value);
                }
            });
        });

        // Bind NULL checkbox events
        container.querySelectorAll('.null-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const colName = e.target.dataset.column;
                const setCheckbox = container.querySelector(`.set-checkbox[data-column="${colName}"]`);
                const valueInput = container.querySelector(`.set-input[data-column="${colName}"]`);

                if (setCheckbox?.checked) {
                    valueInput.disabled = e.target.checked;
                    this.updateSetValue(colName, e.target.checked ? null : valueInput.value, e.target.checked);
                }
            });
        });
    }

    renderSetInput(column, value, isNull) {
        const type = column.data_type.toLowerCase();
        const isNullable = column.nullable === 'YES';

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
        }

        return `
            <div class="input-with-null">
                <input type="${inputType}" class="set-input" data-column="${column.name}"
                       value="${isNull ? '' : (value || '')}" placeholder="New value" ${inputExtra} ${isNull ? 'disabled' : ''}>
                ${isNullable ? `
                    <label class="null-label">
                        <input type="checkbox" class="null-checkbox" data-column="${column.name}" ${isNull ? 'checked' : ''}>
                        NULL
                    </label>
                ` : ''}
            </div>
        `;
    }

    addCondition() {
        if (!this.selectedTable) {
            toast.warning('Please select a table first');
            return;
        }

        this.conditions.push({
            column: '',
            operator: '=',
            value: '',
            connector: 'AND'
        });

        this.renderConditions();
    }

    removeCondition(index) {
        this.conditions.splice(index, 1);
        this.renderConditions();
        this.updateSQL();
    }

    updateCondition(index, field, value) {
        if (this.conditions[index]) {
            this.conditions[index][field] = value;
            this.updateSQL();
        }
    }

    renderConditions() {
        const container = document.getElementById('update-conditions-container');
        if (!container) return;

        if (!this.selectedTable) {
            container.innerHTML = '';
            return;
        }

        if (this.conditions.length === 0) {
            container.innerHTML = `
                <div class="warning-box">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <span>No WHERE clause - this will update ALL rows!</span>
                </div>
            `;
            return;
        }

        const columnOptions = this.columns.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

        container.innerHTML = this.conditions.map((cond, index) => `
            <div class="condition-row" data-index="${index}">
                ${index > 0 ? `
                    <select class="connector" data-index="${index}">
                        <option value="AND" ${cond.connector === 'AND' ? 'selected' : ''}>AND</option>
                        <option value="OR" ${cond.connector === 'OR' ? 'selected' : ''}>OR</option>
                    </select>
                ` : ''}
                <select class="column" data-index="${index}">
                    <option value="">Select column</option>
                    ${this.columns.map(c => `<option value="${c.name}" ${cond.column === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select>
                <select class="operator" data-index="${index}">
                    <option value="=" ${cond.operator === '=' ? 'selected' : ''}>=</option>
                    <option value="!=" ${cond.operator === '!=' ? 'selected' : ''}>!=</option>
                    <option value=">" ${cond.operator === '>' ? 'selected' : ''}>&gt;</option>
                    <option value="<" ${cond.operator === '<' ? 'selected' : ''}>&lt;</option>
                    <option value=">=" ${cond.operator === '>=' ? 'selected' : ''}>&gt;=</option>
                    <option value="<=" ${cond.operator === '<=' ? 'selected' : ''}>&lt;=</option>
                    <option value="LIKE" ${cond.operator === 'LIKE' ? 'selected' : ''}>LIKE</option>
                    <option value="IN" ${cond.operator === 'IN' ? 'selected' : ''}>IN</option>
                    <option value="IS NULL" ${cond.operator === 'IS NULL' ? 'selected' : ''}>IS NULL</option>
                    <option value="IS NOT NULL" ${cond.operator === 'IS NOT NULL' ? 'selected' : ''}>IS NOT NULL</option>
                </select>
                <input type="text" class="value" data-index="${index}" placeholder="Value" value="${cond.value || ''}"
                       ${['IS NULL', 'IS NOT NULL'].includes(cond.operator) ? 'disabled' : ''}>
                <button class="remove-btn" data-index="${index}">&times;</button>
            </div>
        `).join('');

        // Bind events
        container.querySelectorAll('.connector').forEach(select => {
            select.addEventListener('change', (e) => {
                this.updateCondition(parseInt(e.target.dataset.index), 'connector', e.target.value);
            });
        });

        container.querySelectorAll('.column').forEach(select => {
            select.addEventListener('change', (e) => {
                this.updateCondition(parseInt(e.target.dataset.index), 'column', e.target.value);
            });
        });

        container.querySelectorAll('.operator').forEach(select => {
            select.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                const valueInput = container.querySelector(`.value[data-index="${index}"]`);
                valueInput.disabled = ['IS NULL', 'IS NOT NULL'].includes(e.target.value);
                this.updateCondition(index, 'operator', e.target.value);
            });
        });

        container.querySelectorAll('.value').forEach(input => {
            input.addEventListener('input', (e) => {
                this.updateCondition(parseInt(e.target.dataset.index), 'value', e.target.value);
            });
        });

        container.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.removeCondition(parseInt(btn.dataset.index));
            });
        });
    }

    buildSQL() {
        if (!this.selectedTable) {
            return '-- Select a table to generate UPDATE statement';
        }

        const setClauses = Object.entries(this.setValues).map(([col, val]) => {
            if (val.isNull) {
                return `${col} = NULL`;
            }
            const colDef = this.columns.find(c => c.name === col);
            const type = colDef?.data_type?.toLowerCase() || '';

            if (type.includes('int') || type.includes('decimal') || type.includes('float') || type.includes('double')) {
                return `${col} = ${val.value}`;
            }
            return `${col} = '${String(val.value).replace(/'/g, "''")}'`;
        });

        if (setClauses.length === 0) {
            return '-- Select columns to update';
        }

        let sql = `UPDATE ${this.selectedTable}\nSET ${setClauses.join(',\n    ')}`;

        // WHERE clause
        const validConditions = this.conditions.filter(c => c.column);
        if (validConditions.length) {
            sql += '\nWHERE ';
            validConditions.forEach((cond, i) => {
                if (i > 0) sql += ` ${cond.connector} `;

                if (['IS NULL', 'IS NOT NULL'].includes(cond.operator)) {
                    sql += `${cond.column} ${cond.operator}`;
                } else if (cond.operator === 'IN') {
                    sql += `${cond.column} IN (${cond.value})`;
                } else {
                    const colDef = this.columns.find(c => c.name === cond.column);
                    const type = colDef?.data_type?.toLowerCase() || '';
                    const isNumeric = type.includes('int') || type.includes('decimal') || type.includes('float') || type.includes('double');
                    const value = isNumeric ? cond.value : `'${cond.value}'`;
                    sql += `${cond.column} ${cond.operator} ${value}`;
                }
            });
        }

        return sql + ';';
    }

    updateSQL() {
        if (this.onSQLChange) {
            this.onSQLChange(this.buildSQL());
        }
    }

    clear() {
        this.selectedTable = null;
        this.setValues = {};
        this.conditions = [];
        this.columns = [];
        this.renderTableSelector();
        this.renderSetForm();
        this.renderConditions();
        this.updateSQL();
    }

    getSQL() {
        return this.buildSQL();
    }

    getData() {
        return {
            table: this.selectedTable,
            set: this.setValues,
            conditions: this.conditions
        };
    }

    hasNoWhereClause() {
        return this.conditions.filter(c => c.column).length === 0;
    }
}

export default UpdateBuilder;
