/**
 * DeleteBuilder - Handles DELETE query building with type-to-confirm safety
 */

import toast from './Toast.js';

class DeleteBuilder {
    constructor(schema, onSQLChange) {
        this.schema = schema;
        this.onSQLChange = onSQLChange;
        this.selectedTable = null;
        this.conditions = [];
        this.columns = [];

        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        // Table selector
        const tableSelect = document.getElementById('delete-table-select');
        if (tableSelect) {
            tableSelect.addEventListener('change', (e) => this.selectTable(e.target.value));
        }

        // Add condition button
        document.getElementById('btn-add-delete-condition')?.addEventListener('click', () => this.addCondition());
    }

    updateSchema(schema) {
        this.schema = schema;
        this.renderTableSelector();
    }

    renderTableSelector() {
        const tableSelect = document.getElementById('delete-table-select');
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
        this.conditions = [];

        if (tableName) {
            const table = this.schema?.tables.find(t => t.name === tableName);
            this.columns = table ? table.columns : [];
        } else {
            this.columns = [];
        }

        this.renderConditions();
        this.updateSQL();
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
        const container = document.getElementById('delete-conditions-container');
        if (!container) return;

        if (!this.selectedTable) {
            container.innerHTML = '';
            return;
        }

        if (this.conditions.length === 0) {
            container.innerHTML = `
                <div class="danger-box">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>No WHERE clause - this will DELETE ALL rows! Type-to-confirm required.</span>
                </div>
            `;
            return;
        }

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
                <button class="remove-btn" data-index="${index}">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
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
            return '-- Select a table to generate DELETE statement';
        }

        let sql = `DELETE FROM ${this.selectedTable}`;

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
        this.conditions = [];
        this.columns = [];
        this.renderTableSelector();
        this.renderConditions();
        this.updateSQL();
    }

    getSQL() {
        return this.buildSQL();
    }

    getData() {
        return {
            table: this.selectedTable,
            conditions: this.conditions
        };
    }

    hasNoWhereClause() {
        return this.conditions.filter(c => c.column).length === 0;
    }

    getTableName() {
        return this.selectedTable;
    }
}

export default DeleteBuilder;
