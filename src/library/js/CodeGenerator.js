/**
 * CodeGenerator - Generate PHP Model and Manager classes from database tables
 *
 * Generates:
 * - Model Class: Entity with properties, getters/setters, CRUD operations
 * - Manager Class: Static utility methods for querying (findAll, findWith, search, etc.)
 *
 * Follows the Lead.php pattern:
 * - Private properties without type hints (PHP 5.4 compatible)
 * - Simple getters/setters
 * - Named placeholder SQL syntax (::column_name)
 * - Constructor with optional ID loading
 * - CRUD methods (save, insert, update, load, delete)
 */

import toast from './Toast.js';

class CodeGenerator {
    constructor(queryBuilder) {
        this.queryBuilder = queryBuilder;
        this.selectedTable = null;
        this.columns = [];
        this.selectedColumns = new Set();
        this.primaryKey = null;
        this.primaryKeyColumn = null;
        this.generatedModelCode = '';
        this.generatedManagerCode = '';
        this.activeTab = 'model';

        // CodeMirror editors for preview
        this.modelEditor = null;
        this.managerEditor = null;

        // Configuration - defaults match Lead.php template
        this.config = {
            className: '',
            namespace: '',
            tableConstant: '',
            extends: '',
            implements: 'DatabaseObject',
            template: 'php-database-object', // 'php-database-object' or 'php-basic'
            generateGetters: true,
            generateSetters: true,
            generateCrud: true,
            constructorWithLoad: true,
            generateCode: true,
            generateManager: true,
            generateUsageExamples: false,
            phpVersion: '5.4' // '5.4' or '8.2'
        };

        // Manager methods configuration
        this.managerMethods = {
            findById: true,
            findOne: true,
            findAll: true,
            find: true,
            paginate: true,
            searchPaginate: true,
            search: true,
            searchOne: true,
            count: true,
            searchCount: true,
            exists: true,
            distinct: true,
            pluck: true,
            column: true,
            findByIds: true,
            firstLast: true,
            aggregates: true,
            deleteWhere: true,
            updateWhere: true,
            raw: true
        };

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadInitialConfig();
        this.initCodeEditors();
    }

    /**
     * Initialize CodeMirror editors for code preview
     */
    initCodeEditors() {
        if (typeof CodeMirror === 'undefined') return;

        // Register rainbow brackets overlay mode
        this.registerRainbowBracketsMode();

        // Determine theme based on current setting
        const isDark = document.documentElement.dataset.theme === 'dark';
        const cmTheme = isDark ? 'dracula' : 'default';

        // CodeMirror config for PHP preview with folding
        const cmConfig = {
            mode: 'application/x-httpd-php',
            theme: cmTheme,
            lineNumbers: true,
            readOnly: true,
            cursorBlinkRate: -1,
            matchBrackets: false, // Disable default, we use rainbow brackets
            foldGutter: true,
            gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
            lineWrapping: false
        };

        // Initialize Model editor
        const modelContainer = document.getElementById('codegen-model-preview');
        if (modelContainer) {
            modelContainer.innerHTML = '';
            const modelTextarea = document.createElement('textarea');
            modelTextarea.id = 'codegen-model-textarea';
            modelContainer.appendChild(modelTextarea);
            this.modelEditor = CodeMirror.fromTextArea(modelTextarea, cmConfig);
            this.modelEditor.setValue('<?php\n// Select a table to generate Model class');
            // Add rainbow brackets overlay
            this.modelEditor.addOverlay(this.createRainbowBracketsOverlay());
        }

        // Initialize Manager editor
        const managerContainer = document.getElementById('codegen-manager-preview');
        if (managerContainer) {
            managerContainer.innerHTML = '';
            const managerTextarea = document.createElement('textarea');
            managerTextarea.id = 'codegen-manager-textarea';
            managerContainer.appendChild(managerTextarea);
            this.managerEditor = CodeMirror.fromTextArea(managerTextarea, cmConfig);
            this.managerEditor.setValue('<?php\n// Select a table to generate Manager class');
            // Add rainbow brackets overlay
            this.managerEditor.addOverlay(this.createRainbowBracketsOverlay());
        }

        // Listen for theme changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'data-theme') {
                    const newTheme = document.documentElement.dataset.theme === 'dark' ? 'dracula' : 'default';
                    if (this.modelEditor) this.modelEditor.setOption('theme', newTheme);
                    if (this.managerEditor) this.managerEditor.setOption('theme', newTheme);
                }
            });
        });
        observer.observe(document.documentElement, { attributes: true });
    }

    /**
     * Register rainbow brackets mode for CodeMirror
     */
    registerRainbowBracketsMode() {
        // This is a placeholder - the actual coloring is done via overlay
    }

    /**
     * Create rainbow brackets overlay for CodeMirror
     * Colors matching bracket pairs with the same color
     */
    createRainbowBracketsOverlay() {
        const bracketColors = 3; // Number of colors to cycle through
        let depth = 0;

        return {
            token: function(stream) {
                const ch = stream.peek();

                // Opening brackets
                if (ch === '(' || ch === '{' || ch === '[') {
                    stream.next();
                    const colorClass = 'bracket-' + ((depth % bracketColors) + 1);
                    depth++;
                    return colorClass;
                }

                // Closing brackets
                if (ch === ')' || ch === '}' || ch === ']') {
                    depth = Math.max(0, depth - 1);
                    stream.next();
                    const colorClass = 'bracket-' + ((depth % bracketColors) + 1);
                    return colorClass;
                }

                // Skip strings to avoid coloring brackets inside strings
                if (ch === '"' || ch === "'") {
                    const quote = ch;
                    stream.next();
                    while (!stream.eol()) {
                        const c = stream.next();
                        if (c === quote && stream.peek() !== quote) break;
                        if (c === '\\') stream.next(); // Skip escaped chars
                    }
                    return null;
                }

                stream.next();
                return null;
            }
        };
    }

    /**
     * Load initial config values from HTML form
     */
    loadInitialConfig() {
        const getters = document.getElementById('codegen-getters');
        const setters = document.getElementById('codegen-setters');
        const crud = document.getElementById('codegen-crud');
        const constructor = document.getElementById('codegen-constructor');
        const implementsInput = document.getElementById('codegen-implements');
        const phpVersion = document.getElementById('codegen-php-version');
        const genModel = document.getElementById('codegen-gen-model');
        const genManager = document.getElementById('codegen-gen-manager');

        if (getters) this.config.generateGetters = getters.checked;
        if (setters) this.config.generateSetters = setters.checked;
        if (crud) this.config.generateCrud = crud.checked;
        if (constructor) this.config.constructorWithLoad = constructor.checked;
        if (implementsInput) this.config.implements = implementsInput.value;
        if (phpVersion) this.config.phpVersion = phpVersion.value;
        if (genModel) this.config.generateCode = genModel.checked;
        if (genManager) this.config.generateManager = genManager.checked;

        // Load manager method settings
        this.loadManagerMethodSettings();
    }

    /**
     * Load manager method checkbox settings
     */
    loadManagerMethodSettings() {
        const methodIds = [
            'findById', 'findOne', 'findAll', 'find',
            'paginate', 'searchPaginate',
            'search', 'searchOne',
            'count', 'searchCount',
            'exists', 'distinct', 'pluck', 'column', 'findByIds', 'firstLast',
            'aggregates', 'deleteWhere', 'updateWhere', 'raw'
        ];

        methodIds.forEach(method => {
            const el = document.getElementById(`mgr-${method}`);
            if (el) {
                this.managerMethods[method] = el.checked;
            }
        });

        // Usage examples checkbox
        const usageExamples = document.getElementById('mgr-usage-examples');
        if (usageExamples) {
            this.config.generateUsageExamples = usageExamples.checked;
        }
    }

    bindEvents() {
        // Configuration tab switching
        document.querySelectorAll('.codegen-config-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Don't switch tabs if clicking on checkbox
                if (e.target.type === 'checkbox') return;

                const tabName = tab.dataset.configTab;
                this.switchConfigTab(tabName);
            });
        });

        // Table drop zone
        const dropZone = document.getElementById('codegen-table-drop');
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('drag-over');
            });

            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('drag-over');
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('drag-over');
                const tableName = e.dataTransfer.getData('text/plain');
                if (tableName) {
                    this.selectTable(tableName);
                }
            });
        }

        // Configuration inputs
        document.getElementById('codegen-class-name')?.addEventListener('input', (e) => {
            this.config.className = e.target.value;
            this.generateCode();
        });

        document.getElementById('codegen-namespace')?.addEventListener('input', (e) => {
            this.config.namespace = e.target.value;
            this.generateCode();
        });

        document.getElementById('codegen-table-constant')?.addEventListener('input', (e) => {
            this.config.tableConstant = e.target.value;
            this.generateCode();
        });

        document.getElementById('codegen-extends')?.addEventListener('input', (e) => {
            this.config.extends = e.target.value;
            this.generateCode();
        });

        document.getElementById('codegen-implements')?.addEventListener('input', (e) => {
            this.config.implements = e.target.value;
            this.generateCode();
        });

        document.getElementById('codegen-php-version')?.addEventListener('change', (e) => {
            this.config.phpVersion = e.target.value;
            this.generateCode();
        });

        // Checkboxes
        document.getElementById('codegen-getters')?.addEventListener('change', (e) => {
            this.config.generateGetters = e.target.checked;
            this.generateCode();
        });

        document.getElementById('codegen-setters')?.addEventListener('change', (e) => {
            this.config.generateSetters = e.target.checked;
            this.generateCode();
        });

        document.getElementById('codegen-crud')?.addEventListener('change', (e) => {
            this.config.generateCrud = e.target.checked;
            this.generateCode();
        });

        document.getElementById('codegen-constructor')?.addEventListener('change', (e) => {
            this.config.constructorWithLoad = e.target.checked;
            this.generateCode();
        });

        // Usage examples (in manager methods section)
        document.getElementById('mgr-usage-examples')?.addEventListener('change', (e) => {
            this.config.generateUsageExamples = e.target.checked;
            this.generateCode();
        });

        // Generate checkboxes
        document.getElementById('codegen-gen-model')?.addEventListener('change', (e) => {
            this.config.generateCode = e.target.checked;
            this.generateCode();
        });

        document.getElementById('codegen-gen-manager')?.addEventListener('change', (e) => {
            this.config.generateManager = e.target.checked;
            this.generateCode();
        });

        // Action buttons
        document.getElementById('btn-copy-codegen')?.addEventListener('click', () => this.copyCode());
        document.getElementById('btn-download-codegen')?.addEventListener('click', () => this.downloadCode());

        // Select all/none columns
        document.getElementById('btn-select-all-codegen-cols')?.addEventListener('click', () => {
            this.columns.forEach(col => this.selectedColumns.add(col.Field));
            this.renderColumns();
            this.generateCode();
        });

        document.getElementById('btn-select-none-codegen-cols')?.addEventListener('click', () => {
            this.selectedColumns.clear();
            this.renderColumns();
            this.generateCode();
        });

        // Tab switching
        document.querySelectorAll('.codegen-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.tab);
            });
        });

        // Manager method checkboxes
        const methodIds = [
            'findById', 'findOne', 'findAll', 'find',
            'paginate', 'searchPaginate',
            'search', 'searchOne',
            'count', 'searchCount',
            'exists', 'distinct', 'pluck', 'column', 'findByIds', 'firstLast',
            'aggregates', 'deleteWhere', 'updateWhere', 'raw'
        ];

        methodIds.forEach(method => {
            document.getElementById(`mgr-${method}`)?.addEventListener('change', (e) => {
                this.managerMethods[method] = e.target.checked;
                this.generateCode();
            });
        });

        // Manager methods select all/none
        document.getElementById('btn-select-all-manager-methods')?.addEventListener('click', () => {
            methodIds.forEach(method => {
                const el = document.getElementById(`mgr-${method}`);
                if (el) {
                    el.checked = true;
                    this.managerMethods[method] = true;
                }
            });
            this.generateCode();
        });

        document.getElementById('btn-select-none-manager-methods')?.addEventListener('click', () => {
            methodIds.forEach(method => {
                const el = document.getElementById(`mgr-${method}`);
                if (el) {
                    el.checked = false;
                    this.managerMethods[method] = false;
                }
            });
            this.generateCode();
        });
    }

    /**
     * Switch between Model, Manager, and Database tabs
     */
    switchTab(tabName) {
        this.activeTab = tabName;

        // Update tab buttons
        document.querySelectorAll('.codegen-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.codegen-tab-content').forEach(content => {
            content.classList.toggle('active', content.dataset.tabContent === tabName);
        });

        // Refresh CodeMirror editor when tab becomes visible
        // CodeMirror doesn't render properly when hidden
        setTimeout(() => {
            if (tabName === 'model' && this.modelEditor) {
                this.modelEditor.refresh();
            } else if (tabName === 'manager' && this.managerEditor) {
                this.managerEditor.refresh();
            }
        }, 10);
    }

    /**
     * Switch between Model and Manager configuration tabs
     */
    switchConfigTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.codegen-config-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.configTab === tabName);
        });

        // Update panes
        document.querySelectorAll('.codegen-config-pane').forEach(pane => {
            pane.classList.toggle('active', pane.dataset.configPane === tabName);
        });
    }

    /**
     * Select a table and load its columns
     */
    async selectTable(tableName) {
        this.selectedTable = tableName;

        // Update drop zone UI
        const dropZone = document.getElementById('codegen-table-drop');
        if (dropZone) {
            dropZone.innerHTML = `
                <div class="selected-table-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <line x1="3" y1="9" x2="21" y2="9"/>
                        <line x1="9" y1="21" x2="9" y2="9"/>
                    </svg>
                    <span>${tableName}</span>
                    <button class="btn-remove-table" data-tooltip="Remove">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            `;

            dropZone.querySelector('.btn-remove-table')?.addEventListener('click', () => {
                this.clearTable();
            });
        }

        // Auto-generate class name from table name
        const classNameInput = document.getElementById('codegen-class-name');
        if (classNameInput) {
            classNameInput.value = this.tableToClassName(tableName);
            this.config.className = classNameInput.value;
        }

        // Auto-generate table constant
        const tableConstantInput = document.getElementById('codegen-table-constant');
        if (tableConstantInput) {
            tableConstantInput.value = `DB_TBL_${tableName.toUpperCase()}`;
            this.config.tableConstant = tableConstantInput.value;
        }

        // Load columns from schema
        await this.loadColumns(tableName);

        // Generate code
        this.generateCode();
    }

    /**
     * Clear the selected table
     */
    clearTable() {
        this.selectedTable = null;
        this.columns = [];
        this.selectedColumns.clear();
        this.primaryKey = null;
        this.primaryKeyColumn = null;

        const dropZone = document.getElementById('codegen-table-drop');
        if (dropZone) {
            dropZone.innerHTML = '<div class="placeholder">Drag a table here or double-click from sidebar</div>';
        }

        const columnsContainer = document.getElementById('codegen-columns-container');
        if (columnsContainer) {
            columnsContainer.innerHTML = '<div class="placeholder">Select a table to configure columns</div>';
        }

        // Clear generated code and update CodeMirror editors
        this.generatedModelCode = '';
        this.generatedManagerCode = '';
        this.renderCodePreview();
    }

    /**
     * Load columns for the selected table
     */
    async loadColumns(tableName) {
        let schema = this.queryBuilder.schema;
        let actualTableName = tableName;

        // Handle cross-database mode where tableName might be "database.table"
        if (tableName.includes('.')) {
            const parts = tableName.split('.');
            const dbName = parts[0];
            actualTableName = parts[1];

            // Check if we need to look in allDatabasesSchema
            if (this.queryBuilder.allDatabasesSchema && this.queryBuilder.allDatabasesSchema[dbName]) {
                schema = this.queryBuilder.allDatabasesSchema[dbName];
            }
        }

        if (!schema || !schema.tables) {
            toast.error('Schema not loaded');
            return;
        }

        const tableInfo = schema.tables.find(t => t.name === actualTableName);

        if (!tableInfo) {
            toast.error('Table not found in schema');
            return;
        }

        // Map columns to a consistent format
        this.columns = tableInfo.columns.map(col => ({
            Field: col.name,
            Type: col.column_type || col.data_type,
            Null: col.nullable,
            Key: col.key_type,
            Default: col.default_value,
            Extra: col.extra || ''
        }));

        this.selectedColumns = new Set(this.columns.map(col => col.Field));

        // Find primary key
        const pkColumn = this.columns.find(col => col.Key === 'PRI');
        this.primaryKey = pkColumn ? pkColumn.Field : 'id';
        this.primaryKeyColumn = pkColumn;

        this.renderColumns();
    }

    /**
     * Render the columns list with checkboxes
     */
    renderColumns() {
        const container = document.getElementById('codegen-columns-container');
        if (!container) return;

        if (this.columns.length === 0) {
            container.innerHTML = '<div class="placeholder">Select a table to configure columns</div>';
            return;
        }

        let html = '<div class="codegen-columns-list">';

        this.columns.forEach(col => {
            const isSelected = this.selectedColumns.has(col.Field);
            const isPK = col.Key === 'PRI';
            const isNullable = col.Null === 'YES';
            const phpType = this.mysqlToPhpType(col.Type);

            html += `
                <div class="codegen-column-item ${isSelected ? 'selected' : ''}" data-column="${col.Field}">
                    <label class="checkbox-label">
                        <input type="checkbox" ${isSelected ? 'checked' : ''}>
                        <span class="column-info">
                            <span class="column-name">
                                ${isPK ? '<svg class="pk-icon" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h3v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>' : ''}
                                ${col.Field}
                            </span>
                            <span class="column-type">${phpType}</span>
                            ${isNullable ? '<span class="column-nullable">nullable</span>' : ''}
                        </span>
                    </label>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;

        // Bind checkbox events
        container.querySelectorAll('.codegen-column-item').forEach(item => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            const columnName = item.dataset.column;

            checkbox?.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.selectedColumns.add(columnName);
                    item.classList.add('selected');
                } else {
                    this.selectedColumns.delete(columnName);
                    item.classList.remove('selected');
                }
                this.generateCode();
            });
        });
    }

    /**
     * Generate model and manager code
     */
    generateCode() {
        if (!this.selectedTable || this.selectedColumns.size === 0) {
            this.generatedModelCode = '';
            this.generatedManagerCode = '';
            this.renderCodePreview();
            return;
        }

        const className = this.config.className || this.tableToClassName(this.selectedTable);

        // Generate Model class
        if (this.config.generateCode) {
            switch (this.config.template) {
                case 'php-database-object':
                    this.generatedModelCode = this.generateDatabaseObjectModel(className);
                    break;
                case 'php-basic':
                default:
                    this.generatedModelCode = this.generateBasicModel(className);
                    break;
            }
        } else {
            this.generatedModelCode = '';
        }

        // Generate Manager class
        if (this.config.generateManager) {
            this.generatedManagerCode = this.generateManagerClass(className);
        } else {
            this.generatedManagerCode = '';
        }

        this.renderCodePreview();
    }

    /**
     * Generate comprehensive Manager class with configurable static methods
     * Supports PHP 5.4+ and PHP 8.2+ with type hints
     */
    generateManagerClass(className) {
        const managerName = `${className}Manager`;
        const selectedCols = this.columns.filter(col => this.selectedColumns.has(col.Field));
        const tableConstant = this.config.tableConstant || `DB_TBL_${this.selectedTable.toUpperCase()}`;
        const pk = this.primaryKey;
        const isPhp8 = this.config.phpVersion === '8.2';

        // Get text columns for default search
        const textCols = selectedCols.filter(col => {
            const type = col.Type.toLowerCase();
            return type.includes('char') || type.includes('text') || type.includes('varchar');
        });
        const defaultSearchCols = textCols.map(c => `\n            '${c.Field}'`).join(',');

        let code = '<?php\n\n';

        // Class comment
        code += `/**\n`;
        code += ` * ${managerName} class\n`;
        code += ` * \n`;
        code += ` * Comprehensive static utility methods for querying ${className} records\n`;
        code += ` * with support for pagination, flexible conditions, and search\n`;
        code += ` * \n`;
        code += ` * @author \n`;
        code += ` * @since ${new Date().toDateString()}\n`;
        code += ` * @requires PHP ${isPhp8 ? '8.0' : '5.4'}+\n`;
        code += ` */\n`;

        // Class declaration
        code += `class ${managerName}\n`;
        code += `{\n`;

        // Static properties
        code += `    /**\n`;
        code += `     * Default searchable columns for text search\n`;
        code += `     */\n`;
        if (isPhp8) {
            code += `    private static array $defaultSearchColumns = [${defaultSearchCols}\n    ];\n\n`;
        } else {
            code += `    private static $defaultSearchColumns = [${defaultSearchCols}\n    ];\n\n`;
        }

        code += `    /**\n`;
        code += `     * Default items per page for pagination\n`;
        code += `     */\n`;
        if (isPhp8) {
            code += `    private static int $defaultPerPage = 20;\n\n`;
        } else {
            code += `    private static $defaultPerPage = 20;\n\n`;
        }

        // Static getTable() method
        code += `    /**\n`;
        code += `     * Get the table name\n`;
        code += `     * \n`;
        code += `     * @return string\n`;
        code += `     */\n`;
        code += `    public static function getTable()\n`;
        code += `    {\n`;
        code += `        return SystemTables::${tableConstant};\n`;
        code += `    }\n\n`;

        // =====================================================================
        // CORE FINDER METHODS
        // =====================================================================
        if (this.managerMethods.findById || this.managerMethods.findOne || this.managerMethods.findAll || this.managerMethods.find) {
            code += `    // =========================================================================\n`;
            code += `    // CORE FINDER METHODS\n`;
            code += `    // =========================================================================\n\n`;
        }

        // findById
        if (this.managerMethods.findById) {
            code += `    /**\n`;
            code += `     * Find a single record by ID\n`;
            code += `     * \n`;
            code += `     * @param int $id Record ID\n`;
            code += `     * @return ${className}|null\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function findById(int $id): ?${className}\n`;
            } else {
                code += `    public static function findById($id)\n`;
            }
            code += `    {\n`;
            code += `        return self::findOne(['${pk}' => (int)$id]);\n`;
            code += `    }\n\n`;
        }

        // findOne
        if (this.managerMethods.findOne) {
            code += `    /**\n`;
            code += `     * Find a single record matching conditions\n`;
            code += `     * \n`;
            code += `     * @param array $conditions Conditions array (see buildWhereClause for format)\n`;
            code += `     * @param string $orderBy Order by clause\n`;
            code += `     * @return ${className}|null\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function findOne(array $conditions = [], string $orderBy = '${pk} DESC'): ?${className}\n`;
            } else {
                code += `    public static function findOne($conditions = [], $orderBy = '${pk} DESC')\n`;
            }
            code += `    {\n`;
            code += `        $result = self::find($conditions, $orderBy, 1, 0);\n`;
            code += `        return !empty($result['data']) ? $result['data'][0] : null;\n`;
            code += `    }\n\n`;
        }

        // findAll
        if (this.managerMethods.findAll) {
            code += `    /**\n`;
            code += `     * Find all records (with optional conditions)\n`;
            code += `     * \n`;
            code += `     * @param array $conditions Conditions array (see buildWhereClause for format)\n`;
            code += `     * @param string $orderBy Order by clause\n`;
            code += `     * @return array Array of ${className} objects\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function findAll(array $conditions = [], string $orderBy = '${pk} DESC'): array\n`;
            } else {
                code += `    public static function findAll($conditions = [], $orderBy = '${pk} DESC')\n`;
            }
            code += `    {\n`;
            code += `        $result = self::find($conditions, $orderBy);\n`;
            code += `        return $result['data'];\n`;
            code += `    }\n\n`;
        }

        // find (main finder)
        if (this.managerMethods.find) {
            code += `    /**\n`;
            code += `     * Main finder method with full control\n`;
            code += `     * \n`;
            code += `     * Conditions format:\n`;
            code += `     * - Simple: array('column' => 'value') uses = operator\n`;
            code += `     * - With operator: array('column' => array('operator' => '>', 'value' => 10))\n`;
            code += `     * - Supported operators: =, !=, <>, >, <, >=, <=, LIKE, NOT LIKE, IN, NOT IN, IS NULL, IS NOT NULL\n`;
            code += `     * \n`;
            code += `     * @param array $conditions Conditions array\n`;
            code += `     * @param string $orderBy Order by clause\n`;
            code += `     * @param int|null $limit Limit (null for no limit)\n`;
            code += `     * @param int $offset Offset\n`;
            code += `     * @return array Array with 'data' key containing ${className} objects\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function find(array $conditions = [], string $orderBy = '${pk} DESC', ?int $limit = null, int $offset = 0): array\n`;
            } else {
                code += `    public static function find($conditions = [], $orderBy = '${pk} DESC', $limit = null, $offset = 0)\n`;
            }
            code += `    {\n`;
            code += `        $db = Rapidkart::getInstance()->getDB();\n`;
            code += `        $table = self::getTable();\n\n`;
            code += `        $whereData = self::buildWhereClause($conditions);\n`;
            code += `        $whereSQL = $whereData['sql'];\n`;
            code += `        $args = $whereData['args'];\n\n`;
            code += `        $limitSQL = '';\n`;
            code += `        if ($limit !== null)\n`;
            code += `        {\n`;
            code += `            $limitSQL = sprintf(' LIMIT %d, %d', (int)$offset, (int)$limit);\n`;
            code += `        }\n\n`;
            code += `        $sql = "SELECT * FROM \`{\$table}\` WHERE {\$whereSQL} ORDER BY {\$orderBy}{\$limitSQL}";\n\n`;
            code += `        $res = $db->query($sql, $args);\n`;
            code += `        $items = [];\n`;
            code += `        while ($row = $db->fetchObject($res))\n`;
            code += `        {\n`;
            code += `            $item = new ${className}();\n`;
            code += `            $item->parse($row);\n`;
            code += `            $items[] = $item;\n`;
            code += `        }\n\n`;
            code += `        return ['data' => $items];\n`;
            code += `    }\n\n`;
        }

        // =====================================================================
        // PAGINATION METHODS
        // =====================================================================
        if (this.managerMethods.paginate || this.managerMethods.searchPaginate) {
            code += `    // =========================================================================\n`;
            code += `    // PAGINATION METHODS\n`;
            code += `    // =========================================================================\n\n`;
        }

        // paginate
        if (this.managerMethods.paginate) {
            code += `    /**\n`;
            code += `     * Get paginated results with full pagination metadata\n`;
            code += `     * \n`;
            code += `     * @param int $page Current page number (1-based)\n`;
            code += `     * @param int $perPage Items per page\n`;
            code += `     * @param array $conditions Filter conditions\n`;
            code += `     * @param string $orderBy Order by clause\n`;
            code += `     * @return array Pagination result with data and metadata\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function paginate(int $page = 1, ?int $perPage = null, array $conditions = [], string $orderBy = '${pk} DESC'): array\n`;
            } else {
                code += `    public static function paginate($page = 1, $perPage = null, $conditions = [], $orderBy = '${pk} DESC')\n`;
            }
            code += `    {\n`;
            code += `        $perPage = ($perPage !== null) ? (int)$perPage : self::$defaultPerPage;\n`;
            code += `        $page = max(1, (int)$page);\n`;
            code += `        $offset = ($page - 1) * $perPage;\n\n`;
            code += `        $total = self::count($conditions);\n`;
            code += `        $totalPages = ($perPage > 0) ? (int)ceil($total / $perPage) : 0;\n\n`;
            code += `        $result = self::find($conditions, $orderBy, $perPage, $offset);\n\n`;
            code += `        return [\n`;
            code += `            'data'        => $result['data'],\n`;
            code += `            'pagination'  => [\n`;
            code += `                'current_page'  => $page,\n`;
            code += `                'per_page'      => $perPage,\n`;
            code += `                'total_items'   => $total,\n`;
            code += `                'total_pages'   => $totalPages,\n`;
            code += `                'has_previous'  => ($page > 1),\n`;
            code += `                'has_next'      => ($page < $totalPages),\n`;
            code += `                'previous_page' => ($page > 1) ? $page - 1 : null,\n`;
            code += `                'next_page'     => ($page < $totalPages) ? $page + 1 : null,\n`;
            code += `                'first_item'    => ($total > 0) ? $offset + 1 : 0,\n`;
            code += `                'last_item'     => min($offset + $perPage, $total),\n`;
            code += `                'from'          => ($total > 0) ? $offset + 1 : 0,\n`;
            code += `                'to'            => min($offset + $perPage, $total)\n`;
            code += `            ]\n`;
            code += `        ];\n`;
            code += `    }\n\n`;
        }

        // searchPaginate
        if (this.managerMethods.searchPaginate) {
            code += `    /**\n`;
            code += `     * Search with pagination\n`;
            code += `     * \n`;
            code += `     * @param string $keyword Search keyword\n`;
            code += `     * @param int $page Current page\n`;
            code += `     * @param int $perPage Items per page\n`;
            code += `     * @param array $searchColumns Columns to search in\n`;
            code += `     * @param array $additionalConditions Extra conditions to apply\n`;
            code += `     * @param string $orderBy Order by clause\n`;
            code += `     * @return array Pagination result with data and metadata\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function searchPaginate(\n`;
                code += `        string $keyword,\n`;
                code += `        int $page = 1,\n`;
                code += `        ?int $perPage = null,\n`;
                code += `        array $searchColumns = [],\n`;
                code += `        array $additionalConditions = [],\n`;
                code += `        string $orderBy = '${pk} DESC'\n`;
                code += `    ): array {\n`;
            } else {
                code += `    public static function searchPaginate(\n`;
                code += `        $keyword,\n`;
                code += `        $page = 1,\n`;
                code += `        $perPage = null,\n`;
                code += `        $searchColumns = [],\n`;
                code += `        $additionalConditions = [],\n`;
                code += `        $orderBy = '${pk} DESC'\n`;
                code += `    ) {\n`;
            }
            code += `        $perPage = ($perPage !== null) ? (int)$perPage : self::$defaultPerPage;\n`;
            code += `        $page = max(1, (int)$page);\n`;
            code += `        $offset = ($page - 1) * $perPage;\n\n`;
            code += `        $total = self::searchCount($keyword, $searchColumns, $additionalConditions);\n`;
            code += `        $totalPages = ($perPage > 0) ? (int)ceil($total / $perPage) : 0;\n\n`;
            code += `        $data = self::search($keyword, $searchColumns, $additionalConditions, $orderBy, $perPage, $offset);\n\n`;
            code += `        return [\n`;
            code += `            'data'        => $data,\n`;
            code += `            'keyword'     => $keyword,\n`;
            code += `            'pagination'  => [\n`;
            code += `                'current_page'  => $page,\n`;
            code += `                'per_page'      => $perPage,\n`;
            code += `                'total_items'   => $total,\n`;
            code += `                'total_pages'   => $totalPages,\n`;
            code += `                'has_previous'  => ($page > 1),\n`;
            code += `                'has_next'      => ($page < $totalPages),\n`;
            code += `                'previous_page' => ($page > 1) ? $page - 1 : null,\n`;
            code += `                'next_page'     => ($page < $totalPages) ? $page + 1 : null,\n`;
            code += `                'from'          => ($total > 0) ? $offset + 1 : 0,\n`;
            code += `                'to'            => min($offset + $perPage, $total)\n`;
            code += `            ]\n`;
            code += `        ];\n`;
            code += `    }\n\n`;
        }

        // =====================================================================
        // SEARCH METHODS
        // =====================================================================
        if (this.managerMethods.search || this.managerMethods.searchOne) {
            code += `    // =========================================================================\n`;
            code += `    // SEARCH METHODS\n`;
            code += `    // =========================================================================\n\n`;
        }

        // search
        if (this.managerMethods.search) {
            code += `    /**\n`;
            code += `     * Search records by keyword\n`;
            code += `     * \n`;
            code += `     * @param string $keyword Search keyword\n`;
            code += `     * @param array $searchColumns Columns to search (empty = default columns)\n`;
            code += `     * @param array $additionalConditions Extra conditions\n`;
            code += `     * @param string $orderBy Order by clause\n`;
            code += `     * @param int|null $limit Limit\n`;
            code += `     * @param int $offset Offset\n`;
            code += `     * @return array Array of ${className} objects\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function search(\n`;
                code += `        string $keyword,\n`;
                code += `        array $searchColumns = [],\n`;
                code += `        array $additionalConditions = [],\n`;
                code += `        string $orderBy = '${pk} DESC',\n`;
                code += `        ?int $limit = null,\n`;
                code += `        int $offset = 0\n`;
                code += `    ): array {\n`;
            } else {
                code += `    public static function search(\n`;
                code += `        $keyword,\n`;
                code += `        $searchColumns = [],\n`;
                code += `        $additionalConditions = [],\n`;
                code += `        $orderBy = '${pk} DESC',\n`;
                code += `        $limit = null,\n`;
                code += `        $offset = 0\n`;
                code += `    ) {\n`;
            }
            code += `        $db = Rapidkart::getInstance()->getDB();\n`;
            code += `        $table = self::getTable();\n\n`;
            code += `        if (empty($searchColumns))\n`;
            code += `        {\n`;
            code += `            $searchColumns = self::$defaultSearchColumns;\n`;
            code += `        }\n\n`;
            code += `        $searchClauses = [];\n`;
            code += `        foreach ($searchColumns as $column)\n`;
            code += `        {\n`;
            code += "            $searchClauses[] = \"`{$column}` LIKE '::search_keyword'\";\n";
            code += `        }\n`;
            code += `        $searchSQL = '(' . implode(' OR ', $searchClauses) . ')';\n\n`;
            code += `        $whereData = self::buildWhereClause($additionalConditions);\n`;
            code += `        $additionalSQL = ($whereData['sql'] !== '1=1') ? ' AND ' . $whereData['sql'] : '';\n`;
            code += `        $args = $whereData['args'];\n`;
            code += `        $args['::search_keyword'] = '%' . $keyword . '%';\n\n`;
            code += `        $limitSQL = '';\n`;
            code += `        if ($limit !== null)\n`;
            code += `        {\n`;
            code += `            $limitSQL = sprintf(' LIMIT %d, %d', (int)$offset, (int)$limit);\n`;
            code += `        }\n\n`;
            code += `        $sql = "SELECT * FROM \`{\$table}\` WHERE {\$searchSQL}{\$additionalSQL} ORDER BY {\$orderBy}{\$limitSQL}";\n\n`;
            code += `        $res = $db->query($sql, $args);\n`;
            code += `        $items = [];\n`;
            code += `        while ($row = $db->fetchObject($res))\n`;
            code += `        {\n`;
            code += `            $item = new ${className}();\n`;
            code += `            $item->parse($row);\n`;
            code += `            $items[] = $item;\n`;
            code += `        }\n\n`;
            code += `        return $items;\n`;
            code += `    }\n\n`;
        }

        // searchOne
        if (this.managerMethods.searchOne) {
            code += `    /**\n`;
            code += `     * Search and return first matching record\n`;
            code += `     * \n`;
            code += `     * @param string $keyword Search keyword\n`;
            code += `     * @param array $searchColumns Columns to search\n`;
            code += `     * @param array $additionalConditions Extra conditions\n`;
            code += `     * @return ${className}|null\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function searchOne(string $keyword, array $searchColumns = [], array $additionalConditions = []): ?${className}\n`;
            } else {
                code += `    public static function searchOne($keyword, $searchColumns = [], $additionalConditions = [])\n`;
            }
            code += `    {\n`;
            code += `        $results = self::search($keyword, $searchColumns, $additionalConditions, '${pk} DESC', 1, 0);\n`;
            code += `        return !empty($results) ? $results[0] : null;\n`;
            code += `    }\n\n`;
        }

        // =====================================================================
        // COUNT METHODS
        // =====================================================================
        if (this.managerMethods.count || this.managerMethods.searchCount) {
            code += `    // =========================================================================\n`;
            code += `    // COUNT METHODS\n`;
            code += `    // =========================================================================\n\n`;
        }

        // count
        if (this.managerMethods.count) {
            code += `    /**\n`;
            code += `     * Count records matching conditions\n`;
            code += `     * \n`;
            code += `     * @param array $conditions Filter conditions\n`;
            code += `     * @return int\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function count(array $conditions = []): int\n`;
            } else {
                code += `    public static function count($conditions = [])\n`;
            }
            code += `    {\n`;
            code += `        $db = Rapidkart::getInstance()->getDB();\n`;
            code += `        $table = self::getTable();\n\n`;
            code += `        $whereData = self::buildWhereClause($conditions);\n\n`;
            code += `        $sql = "SELECT COUNT(*) as total FROM \`{\$table}\` WHERE {\$whereData['sql']}";\n\n`;
            code += `        $res = $db->query($sql, $whereData['args']);\n`;
            code += `        if (!$res || $db->resultNumRows($res) < 1)\n`;
            code += `        {\n`;
            code += `            return 0;\n`;
            code += `        }\n`;
            code += `        $row = $db->fetchObject($res);\n`;
            code += `        return (int)$row->total;\n`;
            code += `    }\n\n`;
        }

        // searchCount
        if (this.managerMethods.searchCount) {
            code += `    /**\n`;
            code += `     * Count search results\n`;
            code += `     * \n`;
            code += `     * @param string $keyword Search keyword\n`;
            code += `     * @param array $searchColumns Columns to search\n`;
            code += `     * @param array $additionalConditions Extra conditions\n`;
            code += `     * @return int\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function searchCount(string $keyword, array $searchColumns = [], array $additionalConditions = []): int\n`;
            } else {
                code += `    public static function searchCount($keyword, $searchColumns = [], $additionalConditions = [])\n`;
            }
            code += `    {\n`;
            code += `        $db = Rapidkart::getInstance()->getDB();\n`;
            code += `        $table = self::getTable();\n\n`;
            code += `        if (empty($searchColumns))\n`;
            code += `        {\n`;
            code += `            $searchColumns = self::$defaultSearchColumns;\n`;
            code += `        }\n\n`;
            code += `        $searchClauses = [];\n`;
            code += `        foreach ($searchColumns as $column)\n`;
            code += `        {\n`;
            code += "            $searchClauses[] = \"`{$column}` LIKE '::search_keyword'\";\n";
            code += `        }\n`;
            code += `        $searchSQL = '(' . implode(' OR ', $searchClauses) . ')';\n\n`;
            code += `        $whereData = self::buildWhereClause($additionalConditions);\n`;
            code += `        $additionalSQL = ($whereData['sql'] !== '1=1') ? ' AND ' . $whereData['sql'] : '';\n`;
            code += `        $args = $whereData['args'];\n`;
            code += `        $args['::search_keyword'] = '%' . $keyword . '%';\n\n`;
            code += `        $sql = "SELECT COUNT(*) as total FROM \`{\$table}\` WHERE {\$searchSQL}{\$additionalSQL}";\n\n`;
            code += `        $res = $db->query($sql, $args);\n`;
            code += `        if (!$res || $db->resultNumRows($res) < 1)\n`;
            code += `        {\n`;
            code += `            return 0;\n`;
            code += `        }\n`;
            code += `        $row = $db->fetchObject($res);\n`;
            code += `        return (int)$row->total;\n`;
            code += `    }\n\n`;
        }

        // =====================================================================
        // UTILITY METHODS
        // =====================================================================
        const hasUtility = this.managerMethods.exists || this.managerMethods.distinct ||
                          this.managerMethods.pluck || this.managerMethods.column ||
                          this.managerMethods.findByIds || this.managerMethods.firstLast;
        if (hasUtility) {
            code += `    // =========================================================================\n`;
            code += `    // UTILITY METHODS\n`;
            code += `    // =========================================================================\n\n`;
        }

        // exists/existsById
        if (this.managerMethods.exists) {
            code += `    /**\n`;
            code += `     * Check if a record exists with given conditions\n`;
            code += `     * \n`;
            code += `     * @param array $conditions Conditions array\n`;
            code += `     * @return bool\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function exists(array $conditions): bool\n`;
            } else {
                code += `    public static function exists($conditions)\n`;
            }
            code += `    {\n`;
            code += `        return self::count($conditions) > 0;\n`;
            code += `    }\n\n`;

            code += `    /**\n`;
            code += `     * Check if a record with given ID exists\n`;
            code += `     * \n`;
            code += `     * @param int $id Record ID\n`;
            code += `     * @return bool\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function existsById(int $id): bool\n`;
            } else {
                code += `    public static function existsById($id)\n`;
            }
            code += `    {\n`;
            code += `        return self::exists(['${pk}' => (int)$id]);\n`;
            code += `    }\n\n`;
        }

        // distinct
        if (this.managerMethods.distinct) {
            code += `    /**\n`;
            code += `     * Get distinct values for a column\n`;
            code += `     * \n`;
            code += `     * @param string $column Column name\n`;
            code += `     * @param array $conditions Optional filter conditions\n`;
            code += `     * @param string $orderBy Order by clause\n`;
            code += `     * @return array Array of distinct values\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function distinct(string $column, array $conditions = [], ?string $orderBy = null): array\n`;
            } else {
                code += `    public static function distinct($column, $conditions = [], $orderBy = null)\n`;
            }
            code += `    {\n`;
            code += `        $db = Rapidkart::getInstance()->getDB();\n`;
            code += `        $table = self::getTable();\n\n`;
            code += `        $whereData = self::buildWhereClause($conditions);\n`;
            code += "        $orderSQL = $orderBy ? \"ORDER BY {$orderBy}\" : \"ORDER BY `{$column}` ASC\";\n\n";
            code += "        $sql = \"SELECT DISTINCT `{\\$column}` FROM `{\\$table}` WHERE {\\$whereData['sql']} {\\$orderSQL}\";\n\n";
            code += `        $res = $db->query($sql, $whereData['args']);\n`;
            code += `        $values = [];\n`;
            code += `        while ($row = $db->fetchObject($res))\n`;
            code += `        {\n`;
            code += `            $values[] = $row->$column;\n`;
            code += `        }\n`;
            code += `        return $values;\n`;
            code += `    }\n\n`;
        }

        // pluck
        if (this.managerMethods.pluck) {
            code += `    /**\n`;
            code += `     * Get records as key-value pairs (useful for dropdowns)\n`;
            code += `     * \n`;
            code += `     * @param string $valueColumn Column to use as value\n`;
            code += `     * @param string $keyColumn Column to use as key (default: ${pk})\n`;
            code += `     * @param array $conditions Optional filter conditions\n`;
            code += `     * @param string $orderBy Order by clause\n`;
            code += `     * @return array Associative array\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function pluck(string $valueColumn, string $keyColumn = '${pk}', array $conditions = [], ?string $orderBy = null): array\n`;
            } else {
                code += `    public static function pluck($valueColumn, $keyColumn = '${pk}', $conditions = [], $orderBy = null)\n`;
            }
            code += `    {\n`;
            code += `        $db = Rapidkart::getInstance()->getDB();\n`;
            code += `        $table = self::getTable();\n\n`;
            code += `        $whereData = self::buildWhereClause($conditions);\n`;
            code += "        $orderSQL = $orderBy ? \"ORDER BY {$orderBy}\" : \"ORDER BY `{$valueColumn}` ASC\";\n\n";
            code += "        $sql = \"SELECT `{\\$keyColumn}`, `{\\$valueColumn}` FROM `{\\$table}` WHERE {\\$whereData['sql']} {\\$orderSQL}\";\n\n";
            code += `        $res = $db->query($sql, $whereData['args']);\n`;
            code += `        $pairs = [];\n`;
            code += `        while ($row = $db->fetchObject($res))\n`;
            code += `        {\n`;
            code += `            $pairs[$row->$keyColumn] = $row->$valueColumn;\n`;
            code += `        }\n`;
            code += `        return $pairs;\n`;
            code += `    }\n\n`;
        }

        // column/ids
        if (this.managerMethods.column) {
            code += `    /**\n`;
            code += `     * Get column values as flat array\n`;
            code += `     * \n`;
            code += `     * @param string $column Column name\n`;
            code += `     * @param array $conditions Optional filter conditions\n`;
            code += `     * @param string $orderBy Order by clause\n`;
            code += `     * @return array Array of values\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function column(string $column, array $conditions = [], string $orderBy = '${pk} DESC'): array\n`;
            } else {
                code += `    public static function column($column, $conditions = [], $orderBy = '${pk} DESC')\n`;
            }
            code += `    {\n`;
            code += `        $db = Rapidkart::getInstance()->getDB();\n`;
            code += `        $table = self::getTable();\n\n`;
            code += `        $whereData = self::buildWhereClause($conditions);\n\n`;
            code += "        $sql = \"SELECT `{\\$column}` FROM `{\\$table}` WHERE {\\$whereData['sql']} ORDER BY {\\$orderBy}\";\n\n";
            code += `        $res = $db->query($sql, $whereData['args']);\n`;
            code += `        $values = [];\n`;
            code += `        while ($row = $db->fetchObject($res))\n`;
            code += `        {\n`;
            code += `            $values[] = $row->$column;\n`;
            code += `        }\n`;
            code += `        return $values;\n`;
            code += `    }\n\n`;

            code += `    /**\n`;
            code += `     * Get all record IDs matching conditions\n`;
            code += `     * \n`;
            code += `     * @param array $conditions Filter conditions\n`;
            code += `     * @param string $orderBy Order by clause\n`;
            code += `     * @return array Array of IDs\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function ids(array $conditions = [], string $orderBy = '${pk} DESC'): array\n`;
            } else {
                code += `    public static function ids($conditions = [], $orderBy = '${pk} DESC')\n`;
            }
            code += `    {\n`;
            code += `        return self::column('${pk}', $conditions, $orderBy);\n`;
            code += `    }\n\n`;
        }

        // findByIds
        if (this.managerMethods.findByIds) {
            code += `    /**\n`;
            code += `     * Find records by multiple IDs\n`;
            code += `     * \n`;
            code += `     * @param array $ids Array of IDs\n`;
            code += `     * @param string $orderBy Order by clause\n`;
            code += `     * @return array Array of ${className} objects\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function findByIds(array $ids, string $orderBy = '${pk} DESC'): array\n`;
            } else {
                code += `    public static function findByIds($ids, $orderBy = '${pk} DESC')\n`;
            }
            code += `    {\n`;
            code += `        if (empty($ids))\n`;
            code += `        {\n`;
            code += `            return [];\n`;
            code += `        }\n\n`;
            code += `        $conditions = [\n`;
            code += `            '${pk}' => [\n`;
            code += `                'operator' => 'IN',\n`;
            code += `                'value' => $ids\n`;
            code += `            ]\n`;
            code += `        ];\n\n`;
            code += `        return self::findAll($conditions, $orderBy);\n`;
            code += `    }\n\n`;
        }

        // first/last
        if (this.managerMethods.firstLast) {
            code += `    /**\n`;
            code += `     * Get first record (by order)\n`;
            code += `     * \n`;
            code += `     * @param array $conditions Filter conditions\n`;
            code += `     * @param string $orderBy Order by clause\n`;
            code += `     * @return ${className}|null\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function first(array $conditions = [], string $orderBy = '${pk} ASC'): ?${className}\n`;
            } else {
                code += `    public static function first($conditions = [], $orderBy = '${pk} ASC')\n`;
            }
            code += `    {\n`;
            code += `        return self::findOne($conditions, $orderBy);\n`;
            code += `    }\n\n`;

            code += `    /**\n`;
            code += `     * Get last record (by order)\n`;
            code += `     * \n`;
            code += `     * @param array $conditions Filter conditions\n`;
            code += `     * @param string $orderBy Order by clause\n`;
            code += `     * @return ${className}|null\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function last(array $conditions = [], string $orderBy = '${pk} DESC'): ?${className}\n`;
            } else {
                code += `    public static function last($conditions = [], $orderBy = '${pk} DESC')\n`;
            }
            code += `    {\n`;
            code += `        return self::findOne($conditions, $orderBy);\n`;
            code += `    }\n\n`;
        }

        // =====================================================================
        // AGGREGATE METHODS
        // =====================================================================
        if (this.managerMethods.aggregates) {
            code += `    // =========================================================================\n`;
            code += `    // AGGREGATE METHODS\n`;
            code += `    // =========================================================================\n\n`;

            // sum
            code += `    /**\n`;
            code += `     * Get sum of a column\n`;
            code += `     * \n`;
            code += `     * @param string $column Column name\n`;
            code += `     * @param array $conditions Filter conditions\n`;
            code += `     * @return float\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function sum(string $column, array $conditions = []): float\n`;
            } else {
                code += `    public static function sum($column, $conditions = [])\n`;
            }
            code += `    {\n`;
            code += `        return (float)self::aggregate('SUM', $column, $conditions);\n`;
            code += `    }\n\n`;

            // avg
            code += `    /**\n`;
            code += `     * Get average of a column\n`;
            code += `     * \n`;
            code += `     * @param string $column Column name\n`;
            code += `     * @param array $conditions Filter conditions\n`;
            code += `     * @return float\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function avg(string $column, array $conditions = []): float\n`;
            } else {
                code += `    public static function avg($column, $conditions = [])\n`;
            }
            code += `    {\n`;
            code += `        return (float)self::aggregate('AVG', $column, $conditions);\n`;
            code += `    }\n\n`;

            // min
            code += `    /**\n`;
            code += `     * Get minimum value of a column\n`;
            code += `     * \n`;
            code += `     * @param string $column Column name\n`;
            code += `     * @param array $conditions Filter conditions\n`;
            code += `     * @return mixed\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function min(string $column, array $conditions = []): mixed\n`;
            } else {
                code += `    public static function min($column, $conditions = [])\n`;
            }
            code += `    {\n`;
            code += `        return self::aggregate('MIN', $column, $conditions);\n`;
            code += `    }\n\n`;

            // max
            code += `    /**\n`;
            code += `     * Get maximum value of a column\n`;
            code += `     * \n`;
            code += `     * @param string $column Column name\n`;
            code += `     * @param array $conditions Filter conditions\n`;
            code += `     * @return mixed\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function max(string $column, array $conditions = []): mixed\n`;
            } else {
                code += `    public static function max($column, $conditions = [])\n`;
            }
            code += `    {\n`;
            code += `        return self::aggregate('MAX', $column, $conditions);\n`;
            code += `    }\n\n`;

            // Generic aggregate
            code += `    /**\n`;
            code += `     * Generic aggregate function\n`;
            code += `     * \n`;
            code += `     * @param string $function Aggregate function (SUM, AVG, MIN, MAX, COUNT)\n`;
            code += `     * @param string $column Column name\n`;
            code += `     * @param array $conditions Filter conditions\n`;
            code += `     * @return mixed\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function aggregate(string $function, string $column, array $conditions = []): mixed\n`;
            } else {
                code += `    public static function aggregate($function, $column, $conditions = [])\n`;
            }
            code += `    {\n`;
            code += `        $db = Rapidkart::getInstance()->getDB();\n`;
            code += `        $table = self::getTable();\n\n`;
            code += `        $whereData = self::buildWhereClause($conditions);\n`;
            code += `        $function = strtoupper($function);\n\n`;
            code += "        $sql = \"SELECT {\\$function}(`{\\$column}`) as result FROM `{\\$table}` WHERE {\\$whereData['sql']}\";\n\n";
            code += `        $res = $db->query($sql, $whereData['args']);\n`;
            code += `        if (!$res || $db->resultNumRows($res) < 1)\n`;
            code += `        {\n`;
            code += `            return null;\n`;
            code += `        }\n`;
            code += `        $row = $db->fetchObject($res);\n`;
            code += `        return $row->result;\n`;
            code += `    }\n\n`;
        }

        // =====================================================================
        // BATCH/BULK METHODS
        // =====================================================================
        if (this.managerMethods.deleteWhere || this.managerMethods.updateWhere) {
            code += `    // =========================================================================\n`;
            code += `    // BATCH/BULK METHODS\n`;
            code += `    // =========================================================================\n\n`;
        }

        // deleteWhere
        if (this.managerMethods.deleteWhere) {
            code += `    /**\n`;
            code += `     * Delete records matching conditions\n`;
            code += `     * \n`;
            code += `     * @param array $conditions Conditions (required for safety)\n`;
            code += `     * @return int Number of affected rows\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function deleteWhere(array $conditions): int\n`;
            } else {
                code += `    public static function deleteWhere($conditions)\n`;
            }
            code += `    {\n`;
            code += `        if (empty($conditions))\n`;
            code += `        {\n`;
            code += `            throw new InvalidArgumentException('Conditions required for deleteWhere to prevent accidental mass deletion');\n`;
            code += `        }\n\n`;
            code += `        $db = Rapidkart::getInstance()->getDB();\n`;
            code += `        $table = self::getTable();\n\n`;
            code += `        $whereData = self::buildWhereClause($conditions);\n\n`;
            code += `        $sql = "DELETE FROM \`{\$table}\` WHERE {\$whereData['sql']}";\n\n`;
            code += `        $db->query($sql, $whereData['args']);\n`;
            code += `        return $db->affectedRows();\n`;
            code += `    }\n\n`;
        }

        // updateWhere
        if (this.managerMethods.updateWhere) {
            code += `    /**\n`;
            code += `     * Update records matching conditions\n`;
            code += `     * \n`;
            code += `     * @param array $data Data to update (column => value)\n`;
            code += `     * @param array $conditions Conditions (required for safety)\n`;
            code += `     * @return int Number of affected rows\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function updateWhere(array $data, array $conditions): int\n`;
            } else {
                code += `    public static function updateWhere($data, $conditions)\n`;
            }
            code += `    {\n`;
            code += `        if (empty($conditions))\n`;
            code += `        {\n`;
            code += `            throw new InvalidArgumentException('Conditions required for updateWhere to prevent accidental mass update');\n`;
            code += `        }\n\n`;
            code += `        if (empty($data))\n`;
            code += `        {\n`;
            code += `            return 0;\n`;
            code += `        }\n\n`;
            code += `        $db = Rapidkart::getInstance()->getDB();\n`;
            code += `        $table = self::getTable();\n\n`;
            code += `        $setClauses = [];\n`;
            code += `        $args = [];\n`;
            code += `        foreach ($data as $column => $value)\n`;
            code += `        {\n`;
            code += `            $placeholder = '::set_' . $column;\n`;
            code += "            $setClauses[] = \"`{$column}` = '{$placeholder}'\";\n";
            code += `            $args[$placeholder] = $value;\n`;
            code += `        }\n`;
            code += `        $setSQL = implode(', ', $setClauses);\n\n`;
            code += `        $whereData = self::buildWhereClause($conditions, 'where_');\n`;
            code += `        $args = array_merge($args, $whereData['args']);\n\n`;
            code += `        $sql = "UPDATE \`{\$table}\` SET {\$setSQL} WHERE {\$whereData['sql']}";\n\n`;
            code += `        $db->query($sql, $args);\n`;
            code += `        return $db->affectedRows();\n`;
            code += `    }\n\n`;
        }

        // =====================================================================
        // QUERY BUILDER HELPER (always included)
        // =====================================================================
        code += `    // =========================================================================\n`;
        code += `    // QUERY BUILDER HELPER\n`;
        code += `    // =========================================================================\n\n`;

        code += `    /**\n`;
        code += `     * Build WHERE clause from conditions array\n`;
        code += `     * \n`;
        code += `     * Supports:\n`;
        code += `     * - Simple equality: array('column' => 'value')\n`;
        code += `     * - Operators: array('column' => array('operator' => '>', 'value' => 10))\n`;
        code += `     * - IN/NOT IN: array('column' => array('operator' => 'IN', 'value' => array(1,2,3)))\n`;
        code += `     * - NULL checks: array('column' => array('operator' => 'IS NULL'))\n`;
        code += `     * - LIKE: array('column' => array('operator' => 'LIKE', 'value' => '%test%'))\n`;
        code += `     * \n`;
        code += `     * @param array $conditions Conditions array\n`;
        code += `     * @param string $prefix Prefix for placeholders (for avoiding conflicts)\n`;
        code += `     * @return array Array with 'sql' and 'args' keys\n`;
        code += `     */\n`;
        if (isPhp8) {
            code += `    protected static function buildWhereClause(array $conditions, string $prefix = ''): array\n`;
        } else {
            code += `    protected static function buildWhereClause($conditions, $prefix = '')\n`;
        }
        code += `    {\n`;
        code += `        if (empty($conditions))\n`;
        code += `        {\n`;
        code += `            return [\n`;
        code += `                'sql' => '1=1',\n`;
        code += `                'args' => []\n`;
        code += `            ];\n`;
        code += `        }\n\n`;
        code += `        $whereClauses = [];\n`;
        code += `        $args = [];\n`;
        code += `        $index = 0;\n\n`;
        code += `        foreach ($conditions as $column => $value)\n`;
        code += `        {\n`;
        code += `            $placeholder = '::' . $prefix . 'cond_' . $index;\n\n`;
        code += `            if (is_array($value) && isset($value['operator']))\n`;
        code += `            {\n`;
        code += `                $operator = strtoupper($value['operator']);\n\n`;
        code += `                switch ($operator)\n`;
        code += `                {\n`;
        code += `                    case 'IS NULL':\n`;
        code += "                        $whereClauses[] = \"`{$column}` IS NULL\";\n";
        code += `                        break;\n\n`;
        code += `                    case 'IS NOT NULL':\n`;
        code += "                        $whereClauses[] = \"`{$column}` IS NOT NULL\";\n";
        code += `                        break;\n\n`;
        code += `                    case 'IN':\n`;
        code += `                    case 'NOT IN':\n`;
        code += `                        if (!empty($value['value']) && is_array($value['value']))\n`;
        code += `                        {\n`;
        code += `                            $inValues = [];\n`;
        code += `                            foreach ($value['value'] as $i => $v)\n`;
        code += `                            {\n`;
        code += `                                $inPlaceholder = $placeholder . '_' . $i;\n`;
        code += `                                $inValues[] = "'{$inPlaceholder}'";\n`;
        code += `                                $args[$inPlaceholder] = $v;\n`;
        code += `                            }\n`;
        code += `                            $inSQL = implode(', ', $inValues);\n`;
        code += "                            $whereClauses[] = \"`{$column}` {$operator} ({$inSQL})\";\n";
        code += `                        }\n`;
        code += `                        break;\n\n`;
        code += `                    case 'BETWEEN':\n`;
        code += `                        if (isset($value['value']) && is_array($value['value']) && count($value['value']) >= 2)\n`;
        code += `                        {\n`;
        code += "                            $whereClauses[] = \"`{$column}` BETWEEN '{$placeholder}_min' AND '{$placeholder}_max'\";\n";
        code += `                            $args[$placeholder . '_min'] = $value['value'][0];\n`;
        code += `                            $args[$placeholder . '_max'] = $value['value'][1];\n`;
        code += `                        }\n`;
        code += `                        break;\n\n`;
        code += `                    case 'LIKE':\n`;
        code += `                    case 'NOT LIKE':\n`;
        code += "                        $whereClauses[] = \"`{$column}` {$operator} '{$placeholder}'\";\n";
        code += `                        $args[$placeholder] = $value['value'];\n`;
        code += `                        break;\n\n`;
        code += `                    default:\n`;
        code += `                        // =, !=, <>, >, <, >=, <=\n`;
        code += `                        if (in_array($operator, ['=', '!=', '<>', '>', '<', '>=', '<=']))\n`;
        code += `                        {\n`;
        code += "                            $whereClauses[] = \"`{$column}` {$operator} '{$placeholder}'\";\n";
        code += `                            $args[$placeholder] = $value['value'];\n`;
        code += `                        }\n`;
        code += `                        break;\n`;
        code += `                }\n`;
        code += `            }\n`;
        code += `            else\n`;
        code += `            {\n`;
        code += `                // Simple equality\n`;
        code += "                $whereClauses[] = \"`{$column}` = '{$placeholder}'\";\n";
        code += `                $args[$placeholder] = $value;\n`;
        code += `            }\n\n`;
        code += `            $index++;\n`;
        code += `        }\n\n`;
        code += `        if (empty($whereClauses))\n`;
        code += `        {\n`;
        code += `            return [\n`;
        code += `                'sql' => '1=1',\n`;
        code += `                'args' => []\n`;
        code += `            ];\n`;
        code += `        }\n\n`;
        code += `        return [\n`;
        code += `            'sql' => implode(' AND ', $whereClauses),\n`;
        code += `            'args' => $args\n`;
        code += `        ];\n`;
        code += `    }\n\n`;

        // =====================================================================
        // RAW QUERY SUPPORT
        // =====================================================================
        if (this.managerMethods.raw) {
            code += `    // =========================================================================\n`;
            code += `    // RAW QUERY SUPPORT\n`;
            code += `    // =========================================================================\n\n`;

            code += `    /**\n`;
            code += `     * Execute raw SQL and return ${className} objects\n`;
            code += `     * \n`;
            code += `     * @param string $sql SQL query (should SELECT * or all required fields)\n`;
            code += `     * @param array $args Query arguments\n`;
            code += `     * @return array Array of ${className} objects\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function raw(string $sql, array $args = []): array\n`;
            } else {
                code += `    public static function raw($sql, $args = [])\n`;
            }
            code += `    {\n`;
            code += `        $db = Rapidkart::getInstance()->getDB();\n`;
            code += `        $res = $db->query($sql, $args);\n\n`;
            code += `        $items = [];\n`;
            code += `        while ($row = $db->fetchObject($res))\n`;
            code += `        {\n`;
            code += `            $item = new ${className}();\n`;
            code += `            $item->parse($row);\n`;
            code += `            $items[] = $item;\n`;
            code += `        }\n`;
            code += `        return $items;\n`;
            code += `    }\n\n`;

            code += `    /**\n`;
            code += `     * Execute raw SQL and return single ${className} object\n`;
            code += `     * \n`;
            code += `     * @param string $sql SQL query\n`;
            code += `     * @param array $args Query arguments\n`;
            code += `     * @return ${className}|null\n`;
            code += `     */\n`;
            if (isPhp8) {
                code += `    public static function rawOne(string $sql, array $args = []): ?${className}\n`;
            } else {
                code += `    public static function rawOne($sql, $args = [])\n`;
            }
            code += `    {\n`;
            code += `        $results = self::raw($sql, $args);\n`;
            code += `        return !empty($results) ? $results[0] : null;\n`;
            code += `    }\n`;
        }

        code += `}\n`;

        // Add usage examples if enabled
        if (this.config.generateUsageExamples) {
            code += this.generateUsageExamples(className, `${className}Manager`);
        }

        return code;
    }

    /**
     * Generate usage examples as PHP comments
     */
    generateUsageExamples(className, managerName) {
        let code = '\n\n';
        code += `/**\n`;
        code += ` * ${managerName} Usage Examples\n`;
        code += ` * \n`;
        code += ` * This section demonstrates how to use the ${managerName} class\n`;
        code += ` */\n\n`;

        // Basic Finder Methods
        if (this.managerMethods.findById || this.managerMethods.findOne || this.managerMethods.findAll || this.managerMethods.find) {
            code += `// =============================================================================\n`;
            code += `// BASIC FINDER METHODS\n`;
            code += `// =============================================================================\n\n`;

            if (this.managerMethods.findById) {
                code += `// Find by ID\n`;
                code += `// \$${className.toLowerCase()} = ${managerName}::findById(123);\n\n`;
            }
            if (this.managerMethods.findOne) {
                code += `// Find single record with conditions\n`;
                code += `// \$${className.toLowerCase()} = ${managerName}::findOne(array('status' => 'active'));\n\n`;
            }
            if (this.managerMethods.findAll) {
                code += `// Find all records\n`;
                code += `// \$records = ${managerName}::findAll();\n\n`;
                code += `// Find all with conditions\n`;
                code += `// \$records = ${managerName}::findAll(array('status' => 'active'));\n\n`;
                code += `// Find with custom order\n`;
                code += `// \$records = ${managerName}::findAll(array(), 'created_at DESC');\n\n`;
            }
        }

        // Advanced Conditions
        code += `// =============================================================================\n`;
        code += `// ADVANCED CONDITIONS (Operators)\n`;
        code += `// =============================================================================\n\n`;

        code += `// Greater than\n`;
        code += `// \$records = ${managerName}::findAll(array(\n`;
        code += `//     'id' => array('operator' => '>', 'value' => 100)\n`;
        code += `// ));\n\n`;

        code += `// Less than or equal\n`;
        code += `// \$records = ${managerName}::findAll(array(\n`;
        code += `//     'id' => array('operator' => '<=', 'value' => 50)\n`;
        code += `// ));\n\n`;

        code += `// Not equal\n`;
        code += `// \$records = ${managerName}::findAll(array(\n`;
        code += `//     'status' => array('operator' => '!=', 'value' => 'deleted')\n`;
        code += `// ));\n\n`;

        code += `// LIKE pattern\n`;
        code += `// \$records = ${managerName}::findAll(array(\n`;
        code += `//     'name' => array('operator' => 'LIKE', 'value' => '%keyword%')\n`;
        code += `// ));\n\n`;

        code += `// IN clause (multiple values)\n`;
        code += `// \$records = ${managerName}::findAll(array(\n`;
        code += `//     'status' => array('operator' => 'IN', 'value' => array('active', 'pending', 'review'))\n`;
        code += `// ));\n\n`;

        code += `// NOT IN clause\n`;
        code += `// \$records = ${managerName}::findAll(array(\n`;
        code += `//     'status' => array('operator' => 'NOT IN', 'value' => array('deleted', 'archived'))\n`;
        code += `// ));\n\n`;

        code += `// IS NULL\n`;
        code += `// \$records = ${managerName}::findAll(array(\n`;
        code += `//     'deleted_at' => array('operator' => 'IS NULL')\n`;
        code += `// ));\n\n`;

        code += `// IS NOT NULL\n`;
        code += `// \$records = ${managerName}::findAll(array(\n`;
        code += `//     'email' => array('operator' => 'IS NOT NULL')\n`;
        code += `// ));\n\n`;

        code += `// BETWEEN\n`;
        code += `// \$records = ${managerName}::findAll(array(\n`;
        code += `//     'id' => array('operator' => 'BETWEEN', 'value' => array(100, 200))\n`;
        code += `// ));\n\n`;

        code += `// Multiple conditions combined\n`;
        code += `// \$records = ${managerName}::findAll(array(\n`;
        code += `//     'status' => 'active',\n`;
        code += `//     'type' => 'premium',\n`;
        code += `//     'id' => array('operator' => '>', 'value' => 50)\n`;
        code += `// ));\n\n`;

        // Pagination
        if (this.managerMethods.paginate || this.managerMethods.searchPaginate) {
            code += `// =============================================================================\n`;
            code += `// PAGINATION\n`;
            code += `// =============================================================================\n\n`;

            if (this.managerMethods.paginate) {
                code += `// Basic pagination (page 1, default 20 items per page)\n`;
                code += `// \$result = ${managerName}::paginate(1);\n`;
                code += `// \$records = \$result['data'];\n`;
                code += `// \$pagination = \$result['pagination'];\n\n`;

                code += `// Custom items per page\n`;
                code += `// \$result = ${managerName}::paginate(1, 10);\n\n`;

                code += `// Pagination with conditions\n`;
                code += `// \$result = ${managerName}::paginate(2, 15, array('status' => 'active'));\n\n`;

                code += `// Access pagination metadata\n`;
                code += `// \$result = ${managerName}::paginate(3, 10, array('status' => 'active'));\n`;
                code += `// echo "Page: " . \$result['pagination']['current_page'];       // 3\n`;
                code += `// echo "Total Pages: " . \$result['pagination']['total_pages']; // e.g., 5\n`;
                code += `// echo "Total Items: " . \$result['pagination']['total_items']; // e.g., 48\n`;
                code += `// echo "Has Next: " . (\$result['pagination']['has_next'] ? 'Yes' : 'No');\n`;
                code += `// echo "Has Previous: " . (\$result['pagination']['has_previous'] ? 'Yes' : 'No');\n`;
                code += `// echo "Showing: " . \$result['pagination']['from'] . " to " . \$result['pagination']['to'];\n\n`;
            }
        }

        // Search
        if (this.managerMethods.search || this.managerMethods.searchOne) {
            code += `// =============================================================================\n`;
            code += `// SEARCH\n`;
            code += `// =============================================================================\n\n`;

            if (this.managerMethods.search) {
                code += `// Simple search (searches default columns)\n`;
                code += `// \$records = ${managerName}::search('keyword');\n\n`;

                code += `// Search specific columns\n`;
                code += `// \$records = ${managerName}::search('keyword', array('name', 'email'));\n\n`;

                code += `// Search with additional conditions\n`;
                code += `// \$records = ${managerName}::search('keyword', array(), array('status' => 'active'));\n\n`;
            }
            if (this.managerMethods.searchOne) {
                code += `// Search and get first result\n`;
                code += `// \$${className.toLowerCase()} = ${managerName}::searchOne('keyword');\n\n`;
            }
            if (this.managerMethods.searchPaginate) {
                code += `// Search with pagination\n`;
                code += `// \$result = ${managerName}::searchPaginate('keyword', 1, 10);\n`;
                code += `// \$records = \$result['data'];\n`;
                code += `// \$keyword = \$result['keyword'];\n`;
                code += `// \$pagination = \$result['pagination'];\n\n`;

                code += `// Search with all options\n`;
                code += `// \$result = ${managerName}::searchPaginate(\n`;
                code += `//     'keyword',                              // keyword\n`;
                code += `//     2,                                      // page\n`;
                code += `//     15,                                     // per page\n`;
                code += `//     array('name', 'description'),           // search columns\n`;
                code += `//     array('status' => 'active'),            // additional conditions\n`;
                code += `//     'created_at DESC'                       // order by\n`;
                code += `// );\n\n`;
            }
        }

        // Count Methods
        if (this.managerMethods.count || this.managerMethods.searchCount) {
            code += `// =============================================================================\n`;
            code += `// COUNT METHODS\n`;
            code += `// =============================================================================\n\n`;

            if (this.managerMethods.count) {
                code += `// Total count\n`;
                code += `// \$total = ${managerName}::count();\n\n`;

                code += `// Count with conditions\n`;
                code += `// \$count = ${managerName}::count(array('status' => 'active'));\n\n`;

                code += `// Count with advanced conditions\n`;
                code += `// \$count = ${managerName}::count(array(\n`;
                code += `//     'status' => 'active',\n`;
                code += `//     'id' => array('operator' => '>', 'value' => 100)\n`;
                code += `// ));\n\n`;
            }
            if (this.managerMethods.searchCount) {
                code += `// Search count\n`;
                code += `// \$count = ${managerName}::searchCount('keyword');\n\n`;
            }
        }

        // Utility Methods
        if (this.managerMethods.exists || this.managerMethods.distinct || this.managerMethods.pluck ||
            this.managerMethods.column || this.managerMethods.findByIds || this.managerMethods.firstLast) {
            code += `// =============================================================================\n`;
            code += `// UTILITY METHODS\n`;
            code += `// =============================================================================\n\n`;

            if (this.managerMethods.exists) {
                code += `// Check if record exists\n`;
                code += `// \$exists = ${managerName}::exists(array('email' => 'test@example.com'));\n`;
                code += `// if (\$exists)\n`;
                code += `// {\n`;
                code += `//     echo "Found!";\n`;
                code += `// }\n\n`;

                code += `// Check by ID\n`;
                code += `// \$exists = ${managerName}::existsById(123);\n\n`;
            }
            if (this.managerMethods.distinct) {
                code += `// Get distinct values (great for dropdowns)\n`;
                code += `// \$statuses = ${managerName}::distinct('status');\n`;
                code += `// \$types = ${managerName}::distinct('type', array('status' => 'active'));\n\n`;
            }
            if (this.managerMethods.pluck) {
                code += `// Get key-value pairs (perfect for HTML <select>)\n`;
                code += `// \$options = ${managerName}::pluck('name', 'id');\n`;
                code += `// Returns: array(1 => 'First', 2 => 'Second', 3 => 'Third', ...)\n\n`;
            }
            if (this.managerMethods.column) {
                code += `// Get column values as flat array\n`;
                code += `// \$allEmails = ${managerName}::column('email');\n\n`;

                code += `// Get all IDs matching conditions\n`;
                code += `// \$ids = ${managerName}::ids(array('status' => 'active'));\n\n`;
            }
            if (this.managerMethods.findByIds) {
                code += `// Find multiple by IDs\n`;
                code += `// \$records = ${managerName}::findByIds(array(1, 5, 10, 15));\n\n`;
            }
            if (this.managerMethods.firstLast) {
                code += `// Get first record\n`;
                code += `// \$first = ${managerName}::first();\n\n`;

                code += `// Get last record\n`;
                code += `// \$last = ${managerName}::last();\n\n`;
            }
        }

        // Aggregate Methods
        if (this.managerMethods.aggregates) {
            code += `// =============================================================================\n`;
            code += `// AGGREGATE METHODS\n`;
            code += `// =============================================================================\n\n`;

            code += `// Sum (for numeric columns)\n`;
            code += `// \$total = ${managerName}::sum('amount');\n\n`;

            code += `// Average\n`;
            code += `// \$avg = ${managerName}::avg('rating');\n\n`;

            code += `// Min/Max\n`;
            code += `// \$minId = ${managerName}::min('id');\n`;
            code += `// \$maxId = ${managerName}::max('id');\n\n`;
        }

        // Bulk Operations
        if (this.managerMethods.updateWhere || this.managerMethods.deleteWhere) {
            code += `// =============================================================================\n`;
            code += `// BULK OPERATIONS\n`;
            code += `// =============================================================================\n\n`;

            if (this.managerMethods.updateWhere) {
                code += `// Update multiple records\n`;
                code += `// \$affected = ${managerName}::updateWhere(\n`;
                code += `//     array('status' => 'archived'),              // data to update\n`;
                code += `//     array('status' => 'inactive')               // conditions\n`;
                code += `// );\n`;
                code += `// echo "Updated {\$affected} records";\n\n`;
            }
            if (this.managerMethods.deleteWhere) {
                code += `// Delete multiple records\n`;
                code += `// \$deleted = ${managerName}::deleteWhere(array(\n`;
                code += `//     'status' => 'deleted',\n`;
                code += `//     'id' => array('operator' => '>', 'value' => 1000)\n`;
                code += `// ));\n`;
                code += `// echo "Deleted {\$deleted} records";\n\n`;
            }
        }

        // Raw Queries
        if (this.managerMethods.raw) {
            code += `// =============================================================================\n`;
            code += `// RAW QUERIES (for complex scenarios)\n`;
            code += `// =============================================================================\n\n`;

            code += `// Raw query returning objects\n`;
            code += `// \$records = ${managerName}::raw(\n`;
            code += `//     "SELECT * FROM " . ${this.config.tableConstant || `DB_TBL_${this.selectedTable.toUpperCase()}`} . " WHERE name LIKE '::name' AND status = '::status' ORDER BY id DESC",\n`;
            code += `//     array('::name' => '%keyword%', '::status' => 'active')\n`;
            code += `// );\n\n`;

            code += `// Raw query for single result\n`;
            code += `// \$${className.toLowerCase()} = ${managerName}::rawOne(\n`;
            code += `//     "SELECT * FROM " . ${this.config.tableConstant || `DB_TBL_${this.selectedTable.toUpperCase()}`} . " WHERE id = '::id'",\n`;
            code += `//     array('::id' => 123)\n`;
            code += `// );\n\n`;
        }

        // Real-World Pagination Example
        code += `// =============================================================================\n`;
        code += `// REAL-WORLD PAGINATION EXAMPLE (for use in controllers)\n`;
        code += `// =============================================================================\n\n`;

        code += `// In your controller:\n`;
        code += `// \$page = isset(\$_GET['page']) ? (int)\$_GET['page'] : 1;\n`;
        code += `// \$perPage = isset(\$_GET['per_page']) ? (int)\$_GET['per_page'] : 15;\n`;
        code += `// \$search = isset(\$_GET['search']) ? trim(\$_GET['search']) : '';\n`;
        code += `// \$status = isset(\$_GET['status']) ? \$_GET['status'] : null;\n`;
        code += `// \n`;
        code += `// // Build conditions\n`;
        code += `// \$conditions = [];\n`;
        code += `// if (\$status)\n`;
        code += `// {\n`;
        code += `//     \$conditions['status'] = \$status;\n`;
        code += `// }\n`;
        code += `// \n`;
        code += `// // Get paginated results\n`;
        code += `// if (!empty(\$search))\n`;
        code += `// {\n`;
        code += `//     \$result = ${managerName}::searchPaginate(\$search, \$page, \$perPage, array(), \$conditions);\n`;
        code += `// }\n`;
        code += `// else\n`;
        code += `// {\n`;
        code += `//     \$result = ${managerName}::paginate(\$page, \$perPage, \$conditions);\n`;
        code += `// }\n`;
        code += `// \n`;
        code += `// // Use in view\n`;
        code += `// \$records = \$result['data'];\n`;
        code += `// \$pagination = \$result['pagination'];\n`;

        return code;
    }

    /**
     * Generate basic PHP model (simple class with properties)
     */
    generateBasicModel(className) {
        const selectedCols = this.columns.filter(col => this.selectedColumns.has(col.Field));
        const isPhp8 = this.config.phpVersion === '8.2';
        let code = '<?php\n\n';

        // Namespace
        if (this.config.namespace) {
            code += `namespace ${this.config.namespace};\n\n`;
        }

        // Class declaration
        code += `class ${className}`;
        if (this.config.extends) {
            code += ` extends ${this.config.extends}`;
        }
        if (this.config.implements) {
            code += ` implements ${this.config.implements}`;
        }
        code += '\n{\n\n';

        // Properties (no type hints for PHP 5.4 compatibility)
        selectedCols.forEach(col => {
            const property = this.columnToProperty(col.Field);
            if (isPhp8) {
                const phpType = this.mysqlToPhpType(col.Type);
                const isNullable = col.Null === 'YES';
                code += `    private ${isNullable ? '?' : ''}${phpType} $${property}${isNullable ? ' = null' : ''};\n`;
            } else {
                code += `    private $${property};\n`;
            }
        });

        code += '\n';

        // Constructor
        code += `    function __construct()\n`;
        code += `    {\n`;
        code += `    }\n\n`;

        // Getters and Setters
        if (this.config.generateGetters || this.config.generateSetters) {
            code += this.generateGettersSetters(selectedCols, isPhp8);
        }

        code += '}\n';

        return code;
    }

    /**
     * Generate DatabaseObject pattern model (like Lead.php)
     */
    generateDatabaseObjectModel(className) {
        const selectedCols = this.columns.filter(col => this.selectedColumns.has(col.Field));
        const isPhp8 = this.config.phpVersion === '8.2';
        const pkProp = this.columnToProperty(this.primaryKey);
        const tableConstant = this.config.tableConstant || `DB_TBL_${this.selectedTable.toUpperCase()}`;

        let code = '<?php\n\n';

        // Class comment
        code += `    /**\n`;
        code += `     * ${className} class\n`;
        code += `     * \n`;
        code += `     * @author \n`;
        code += `     * @since ${new Date().toDateString()}\n`;
        code += `     */\n`;

        // Class declaration
        code += `    class ${className}`;
        if (this.config.extends) {
            code += ` extends ${this.config.extends}`;
        }
        if (this.config.implements) {
            code += ` implements ${this.config.implements}`;
        }
        code += '\n    {\n\n';

        // Instance variables comment
        code += `        /**\n`;
        code += `         * Instance variables\n`;
        code += `         */\n`;

        // Properties - no type hints for PHP 5.4
        selectedCols.forEach(col => {
            const property = this.columnToProperty(col.Field);
            if (isPhp8) {
                const phpType = this.mysqlToPhpType(col.Type);
                const isNullable = col.Null === 'YES';
                code += `        private ${isNullable ? '?' : ''}${phpType} $${property}${isNullable ? ' = null' : ''};\n`;
            } else {
                code += `        private $${property};\n`;
            }
        });

        code += '\n';

        // Constructor with optional ID load
        if (this.config.constructorWithLoad) {
            code += `        function __construct($${pkProp} = null)\n`;
            code += `        {\n`;
            code += `            if ($${pkProp})\n`;
            code += `            {\n`;
            code += `                $this->${pkProp} = $${pkProp};\n`;
            code += `                $this->load();\n`;
            code += `            }\n`;
            code += `        }\n\n`;
        } else {
            code += `        function __construct()\n`;
            code += `        {\n`;
            code += `        }\n\n`;
        }

        // Static getTable() method
        code += `        /**\n`;
        code += `         * Get the table name\n`;
        code += `         * \n`;
        code += `         * @return string\n`;
        code += `         */\n`;
        code += `        public static function getTable()\n`;
        code += `        {\n`;
        code += `            return SystemTables::${tableConstant};\n`;
        code += `        }\n\n`;

        // Getters and Setters
        if (this.config.generateGetters || this.config.generateSetters) {
            code += this.generateGettersSettersLead(selectedCols, isPhp8);
        }

        // CRUD Methods
        if (this.config.generateCrud) {
            code += this.generateCrudMethodsLead(className, selectedCols, tableConstant, pkProp);
        }

        code += `    }\n`;

        return code;
    }

    /**
     * Generate getters/setters in Lead.php style
     */
    generateGettersSettersLead(columns, isPhp8) {
        let code = '';

        columns.forEach(col => {
            const property = this.columnToProperty(col.Field);
            const methodName = this.propertyToMethodName(property);

            // Getter
            if (this.config.generateGetters) {
                if (isPhp8) {
                    const phpType = this.mysqlToPhpType(col.Type);
                    const isNullable = col.Null === 'YES';
                    code += `        function get${methodName}(): ${isNullable ? '?' : ''}${phpType}\n`;
                } else {
                    code += `        function get${methodName}()\n`;
                }
                code += `        {\n`;
                code += `            return $this->${property};\n`;
                code += `        }\n\n`;
            }

            // Setter - skip for auto-increment primary key
            const isAutoIncrementPK = col.Key === 'PRI' && col.Extra === 'auto_increment';
            if (this.config.generateSetters && !isAutoIncrementPK) {
                if (isPhp8) {
                    const phpType = this.mysqlToPhpType(col.Type);
                    const isNullable = col.Null === 'YES';
                    code += `        function set${methodName}(${isNullable ? '?' : ''}${phpType} $${property}): void\n`;
                } else {
                    code += `        function set${methodName}($${property})\n`;
                }
                code += `        {\n`;
                code += `            $this->${property} = $${property};\n`;
                code += `        }\n\n`;
            }
        });

        return code;
    }

    /**
     * Generate simple getters/setters
     */
    generateGettersSetters(columns, isPhp8) {
        let code = '';

        columns.forEach(col => {
            const property = this.columnToProperty(col.Field);
            const methodName = this.propertyToMethodName(property);

            // Getter
            if (this.config.generateGetters) {
                if (isPhp8) {
                    const phpType = this.mysqlToPhpType(col.Type);
                    const isNullable = col.Null === 'YES';
                    code += `    public function get${methodName}(): ${isNullable ? '?' : ''}${phpType}\n`;
                } else {
                    code += `    function get${methodName}()\n`;
                }
                code += `    {\n`;
                code += `        return $this->${property};\n`;
                code += `    }\n\n`;
            }

            // Setter - skip for auto-increment primary key
            const isAutoIncrementPK = col.Key === 'PRI' && col.Extra === 'auto_increment';
            if (this.config.generateSetters && !isAutoIncrementPK) {
                if (isPhp8) {
                    const phpType = this.mysqlToPhpType(col.Type);
                    const isNullable = col.Null === 'YES';
                    code += `    public function set${methodName}(${isNullable ? '?' : ''}${phpType} $${property}): self\n`;
                } else {
                    code += `    function set${methodName}($${property})\n`;
                }
                code += `    {\n`;
                code += `        $this->${property} = $${property};\n`;
                if (isPhp8) {
                    code += `        return $this;\n`;
                }
                code += `    }\n\n`;
            }
        });

        return code;
    }

    /**
     * Generate CRUD methods in Lead.php style
     */
    generateCrudMethodsLead(className, columns, tableConstant, pkProp) {
        let code = '';
        const pk = this.primaryKey;

        // save() method
        code += `        /**\n`;
        code += `         * The function to save the data or update if already exists\n`;
        code += `         * \n`;
        code += `         * @return boolean Returns the success status of the operation \n`;
        code += `         */\n`;
        code += `        public function save()\n`;
        code += `        {\n`;
        code += `            if (!empty($this->${pkProp}) && valid($this->${pkProp}))\n`;
        code += `            {\n`;
        code += `                return $this->update();\n`;
        code += `            }\n`;
        code += `            return $this->insert();\n`;
        code += `        }\n\n`;

        // insert() method
        const insertCols = columns.filter(col => col.Key !== 'PRI' || col.Extra !== 'auto_increment');
        // Calculate max column name length for alignment
        const maxInsertColLen = Math.max(...insertCols.map(c => c.Field.length));

        code += `        /**\n`;
        code += `         * The function to insert a record\n`;
        code += `         * \n`;
        code += `         * @return boolean Returns the success status of the operation \n`;
        code += `         */\n`;
        code += `        public function insert()\n`;
        code += `        {\n`;
        code += `            $db = Rapidkart::getInstance()->getDB();\n`;
        code += `            $table = self::getTable();\n\n`;
        code += `            $sql = "INSERT INTO\n`;
        code += `                        \`{\$table}\`\n`;
        code += `                    (\n`;
        insertCols.forEach((col, idx) => {
            const comma = idx < insertCols.length - 1 ? ',' : '';
            code += `                        ${col.Field}${comma}\n`;
        });
        code += `                    )\n`;
        code += `                    VALUES\n`;
        code += `                    (\n`;
        insertCols.forEach((col, idx) => {
            const comma = idx < insertCols.length - 1 ? ',' : '';
            code += `                        '::${col.Field}'${comma}\n`;
        });
        code += `                    )";\n\n`;
        code += `            $args = [\n`;
        insertCols.forEach((col, idx) => {
            const prop = this.columnToProperty(col.Field);
            const comma = idx < insertCols.length - 1 ? ',' : '';
            const padding = ' '.repeat(maxInsertColLen - col.Field.length);
            code += `                '::${col.Field}'${padding} => $this->${prop}${comma}\n`;
        });
        code += `            ];\n\n`;
        code += `            $res = $db->query($sql, $args);\n`;
        code += `            if (!$res)\n`;
        code += `            {\n`;
        code += `                return false;\n`;
        code += `            }\n`;
        code += `            $this->${pkProp} = $db->lastInsertId();\n`;
        code += `            return true;\n`;
        code += `        }\n\n`;

        // update() method
        const updateCols = columns.filter(col => col.Key !== 'PRI');
        // Calculate max column name length for alignment
        const maxUpdateColLen = Math.max(...updateCols.map(c => c.Field.length), pk.length);

        code += `        /**\n`;
        code += `         * The function to update the existing record\n`;
        code += `         * \n`;
        code += `         * @return boolean Returns the success status of the operation \n`;
        code += `         */\n`;
        code += `        public function update()\n`;
        code += `        {\n`;
        code += `            $db = Rapidkart::getInstance()->getDB();\n`;
        code += `            $table = self::getTable();\n\n`;
        code += `            $sql = "UPDATE\n`;
        code += `                        \`{\$table}\`\n`;
        code += `                    SET\n`;
        updateCols.forEach((col, idx) => {
            const comma = idx < updateCols.length - 1 ? ',' : '';
            code += `                        ${col.Field} = '::${col.Field}'${comma}\n`;
        });
        code += `                    WHERE\n`;
        code += `                        ${pk} = '::${pk}'";\n\n`;
        code += `            $args = [\n`;
        updateCols.forEach((col, idx) => {
            const prop = this.columnToProperty(col.Field);
            const comma = idx < updateCols.length - 1 ? ',' : '';
            const padding = ' '.repeat(maxUpdateColLen - col.Field.length);
            code += `                '::${col.Field}'${padding} => $this->${prop}${comma}\n`;
        });
        const pkPadding = ' '.repeat(maxUpdateColLen - pk.length);
        code += `                '::${pk}'${pkPadding} => $this->${pkProp}\n`;
        code += `            ];\n\n`;
        code += `            $res = $db->query($sql, $args);\n`;
        code += `            if (!$res)\n`;
        code += `            {\n`;
        code += `                return false;\n`;
        code += `            }\n`;
        code += `            return true;\n`;
        code += `        }\n\n`;

        // isExistent() static method
        code += `        /**\n`;
        code += `         * Check for existence of the record in the database\n`;
        code += `         * \n`;
        code += `         * @param int $${pkProp}\n`;
        code += `         * @return boolean\n`;
        code += `         */\n`;
        code += `        public static function isExistent($${pkProp})\n`;
        code += `        {\n`;
        code += `            $db = Rapidkart::getInstance()->getDB();\n`;
        code += `            $table = self::getTable();\n\n`;
        code += `            $sql = "SELECT\n`;
        code += `                        *\n`;
        code += `                    FROM\n`;
        code += `                        \`{\$table}\`\n`;
        code += `                    WHERE\n`;
        code += `                        ${pk} = '::${pk}'";\n\n`;
        code += `            $res = $db->query($sql, ['::${pk}' => $${pkProp}]);\n`;
        code += `            if (!$res || $db->resultNumRows($res) < 1)\n`;
        code += `            {\n`;
        code += `                return FALSE;\n`;
        code += `            }\n`;
        code += `            return TRUE;\n`;
        code += `        }\n\n`;

        // load() method
        code += `        /**\n`;
        code += `         * Load the data from the database\n`;
        code += `         * \n`;
        code += `         * @return boolean Status of the operation\n`;
        code += `         */\n`;
        code += `        public function load()\n`;
        code += `        {\n`;
        code += `            $db = Rapidkart::getInstance()->getDB();\n`;
        code += `            $table = self::getTable();\n\n`;
        code += `            $sql = "SELECT\n`;
        code += `                        *\n`;
        code += `                    FROM\n`;
        code += `                        \`{\$table}\`\n`;
        code += `                    WHERE\n`;
        code += `                        ${pk} = '::${pk}'";\n\n`;
        code += `            $res = $db->query($sql, ['::${pk}' => $this->${pkProp}]);\n`;
        code += `            if (!$res || $db->resultNumRows($res) < 1)\n`;
        code += `            {\n`;
        code += `                return FALSE;\n`;
        code += `            }\n\n`;
        code += `            $row = $db->fetchObject($res);\n`;
        code += `            foreach ($row as $key => $value)\n`;
        code += `            {\n`;
        code += `                $this->$key = $value;\n`;
        code += `            }\n`;
        code += `            return TRUE;\n`;
        code += `        }\n\n`;

        // delete() static method
        code += `        /**\n`;
        code += `         * Delete the record permanently\n`;
        code += `         * \n`;
        code += `         * @param int $${pkProp}\n`;
        code += `         * @return boolean\n`;
        code += `         */\n`;
        code += `        public static function delete($${pkProp})\n`;
        code += `        {\n`;
        code += `            $db = Rapidkart::getInstance()->getDB();\n`;
        code += `            $table = self::getTable();\n\n`;
        code += `            $sql = "DELETE\n`;
        code += `                    FROM\n`;
        code += `                        \`{\$table}\`\n`;
        code += `                    WHERE\n`;
        code += `                        ${pk} = '::${pk}'";\n\n`;
        code += `            $res = $db->query($sql, ['::${pk}' => $${pkProp}]);\n`;
        code += `            if (!$res)\n`;
        code += `            {\n`;
        code += `                return false;\n`;
        code += `            }\n`;
        code += `            return true;\n`;
        code += `        }\n\n`;

        // hasMandatoryData() method
        code += `        /**\n`;
        code += `         * Checks for the mandatory data for insert and update operation\n`;
        code += `         * \n`;
        code += `         * @return boolean Returns success status of the operation\n`;
        code += `         */\n`;
        code += `        public function hasMandatoryData()\n`;
        code += `        {\n`;
        code += `            return true;\n`;
        code += `        }\n\n`;

        // parse() method
        code += `        /**\n`;
        code += `         * Parse the data from the mysql result object\n`;
        code += `         * \n`;
        code += `         * @param object $obj\n`;
        code += `         */\n`;
        code += `        public function parse($obj)\n`;
        code += `        {\n`;
        code += `            if (is_object($obj))\n`;
        code += `            {\n`;
        code += `                foreach ($obj as $key => $value)\n`;
        code += `                {\n`;
        code += `                    $this->$key = $value;\n`;
        code += `                }\n`;
        code += `            }\n`;
        code += `        }\n\n`;

        return code;
    }

    /**
     * Render the code preview for all tabs
     */
    renderCodePreview() {
        // Render Model tab using CodeMirror
        if (this.modelEditor) {
            const modelCode = this.generatedModelCode || '<?php\n// Select a table to generate Model class';
            this.modelEditor.setValue(modelCode);
            // Refresh after setting value to ensure proper rendering
            setTimeout(() => this.modelEditor.refresh(), 10);
        }

        // Render Manager tab using CodeMirror
        if (this.managerEditor) {
            const managerCode = this.generatedManagerCode || '<?php\n// Select a table to generate Manager class';
            this.managerEditor.setValue(managerCode);
            // Refresh after setting value to ensure proper rendering
            setTimeout(() => this.managerEditor.refresh(), 10);
        }
    }

    /**
     * Copy code to clipboard based on active tab
     */
    copyCode() {
        let code = '';
        let label = '';

        if (this.activeTab === 'model') {
            code = this.generatedModelCode;
            label = 'Model';
        } else if (this.activeTab === 'manager') {
            code = this.generatedManagerCode;
            label = 'Manager';
        } else if (this.activeTab === 'database') {
            // Database reference is static
            const dbContainer = document.getElementById('codegen-database-preview');
            if (dbContainer) {
                code = dbContainer.textContent || '';
            }
            label = 'Database';
        }

        if (!code) {
            toast.warning(`No ${label.toLowerCase()} code to copy`);
            return;
        }

        navigator.clipboard.writeText(code)
            .then(() => toast.success(`${label} code copied to clipboard`))
            .catch(() => toast.error('Failed to copy to clipboard'));
    }

    /**
     * Download code as PHP file based on active tab
     */
    downloadCode() {
        let code = '';
        let filename = '';

        const className = this.config.className || this.tableToClassName(this.selectedTable);

        if (this.activeTab === 'model') {
            code = this.generatedModelCode;
            filename = `${className}.php`;
        } else if (this.activeTab === 'manager') {
            code = this.generatedManagerCode;
            filename = `${className}Manager.php`;
        } else if (this.activeTab === 'database') {
            const dbContainer = document.getElementById('codegen-database-preview');
            if (dbContainer) {
                code = dbContainer.textContent || '';
            }
            filename = 'SQLiDatabase.php';
        }

        if (!code) {
            toast.warning('No code to download');
            return;
        }

        const blob = new Blob([code], { type: 'text/php' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success(`Downloaded ${filename}`);
    }

    /**
     * Convert table name to class name (snake_case to PascalCase)
     */
    tableToClassName(tableName) {
        let name = tableName.replace(/^(tbl_|t_)/, '').replace(/(_table|_tbl)$/, '');

        // Handle plurals (simple cases)
        if (name.endsWith('ies')) {
            name = name.slice(0, -3) + 'y';
        } else if (name.endsWith('es') && !name.endsWith('ses')) {
            name = name.slice(0, -2);
        } else if (name.endsWith('s') && !name.endsWith('ss')) {
            name = name.slice(0, -1);
        }

        return name
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }

    /**
     * Convert column name to property name (keep as-is for Lead.php style)
     */
    columnToProperty(columnName) {
        // Keep column name as property name (like Lead.php does)
        return columnName;
    }

    /**
     * Convert property name to method name (capitalize first letter of each word)
     */
    propertyToMethodName(property) {
        // Convert snake_case to PascalCase for method names
        return property
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');
    }

    /**
     * Convert MySQL type to PHP type
     */
    mysqlToPhpType(mysqlType) {
        const type = mysqlType.toLowerCase();

        if (type.includes('int') || type.includes('serial')) {
            return 'int';
        }
        if (type.includes('float') || type.includes('double') || type.includes('decimal') || type.includes('numeric')) {
            return 'float';
        }
        if (type.includes('bool') || type === 'tinyint(1)') {
            return 'bool';
        }
        if (type.includes('json')) {
            return 'array';
        }

        return 'string';
    }
}

export default CodeGenerator;
