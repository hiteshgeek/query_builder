<?php
/**
 * ALTER Table Execution API
 *
 * Executes ALTER TABLE queries with proper validation
 * Supports multiple operations in a single request
 */

require_once __DIR__ . '/bootstrap.php';

use QueryBuilder\Database;

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

// Get request body
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    json_error('Invalid JSON input', 400);
}

// Validate required fields
if (empty($input['table'])) {
    json_error('Table name is required', 400);
}

if (empty($input['operations']) || !is_array($input['operations'])) {
    json_error('At least one operation is required', 400);
}

$table = $input['table'];
$operations = $input['operations'];
$database = $input['database'] ?? null;

// Validate table name (prevent SQL injection)
if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $table)) {
    json_error('Invalid table name', 400);
}

try {
    $db = Database::getInstance();

    // Switch to specified database if provided
    if ($database) {
        $db->switchDatabase($database);
    }

    $pdo = $db->getConnection();

    // Verify table exists
    $stmt = $pdo->prepare("
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    ");
    $stmt->execute([$table]);

    if (!$stmt->fetch()) {
        json_error("Table '$table' not found", 404);
    }

    // Build ALTER TABLE statement
    $alterParts = [];

    foreach ($operations as $index => $op) {
        if (empty($op['type'])) {
            json_error("Operation $index is missing type", 400);
        }

        $sql = validateAndBuildOperation($op, $table, $pdo);
        if ($sql) {
            $alterParts[] = $sql;
        }
    }

    if (empty($alterParts)) {
        json_error('No valid operations to execute', 400);
    }

    // Build full ALTER TABLE statement
    $sql = "ALTER TABLE `$table` " . implode(', ', $alterParts);

    // Execute the ALTER
    $startTime = microtime(true);

    $pdo->exec($sql);

    $executionTime = round((microtime(true) - $startTime) * 1000, 2);

    json_success([
        'message' => 'Table altered successfully',
        'operations_count' => count($alterParts),
        'execution_time_ms' => $executionTime,
        'sql' => $sql
    ]);

} catch (PDOException $e) {
    $errorMessage = $e->getMessage();

    // Provide more helpful error messages
    if (strpos($errorMessage, 'Duplicate column name') !== false) {
        json_error('A column with that name already exists', 400);
    } elseif (strpos($errorMessage, 'Unknown column') !== false) {
        json_error('The specified column does not exist', 400);
    } elseif (strpos($errorMessage, 'Duplicate key name') !== false) {
        json_error('An index with that name already exists', 400);
    } elseif (strpos($errorMessage, 'Cannot drop index') !== false) {
        json_error('Cannot drop the specified index', 400);
    } elseif (strpos($errorMessage, 'foreign key constraint') !== false) {
        json_error('Operation failed due to foreign key constraint', 400);
    } elseif (strpos($errorMessage, "Can't DROP") !== false) {
        json_error('Cannot drop: the item does not exist or is in use', 400);
    } elseif (strpos($errorMessage, 'Data truncated') !== false) {
        json_error('Data would be truncated. Ensure existing data fits the new column definition', 400);
    } elseif (strpos($errorMessage, 'Invalid use of NULL') !== false) {
        json_error('Cannot set NOT NULL: column contains NULL values. Update or delete rows with NULL first.', 400);
    } elseif (strpos($errorMessage, 'Invalid default value') !== false) {
        json_error('Invalid default value for this column type', 400);
    } elseif (strpos($errorMessage, 'Incorrect') !== false && strpos($errorMessage, 'value') !== false) {
        json_error('Invalid value for this column type. Check your data.', 400);
    } else {
        json_error('Database error: ' . $errorMessage, 500);
    }
}

/**
 * Validate and build SQL for a single operation
 */
function validateAndBuildOperation(array $op, string $table, PDO $pdo): ?string {
    $type = $op['type'];

    switch ($type) {
        case 'ADD_COLUMN':
            return buildAddColumn($op);

        case 'MODIFY_COLUMN':
            return buildModifyColumn($op);

        case 'RENAME_COLUMN':
            return buildRenameColumn($op, $table, $pdo);

        case 'DROP_COLUMN':
            return buildDropColumn($op);

        case 'ADD_INDEX':
        case 'ADD_UNIQUE':
            return buildAddIndex($op, $type === 'ADD_UNIQUE');

        case 'DROP_INDEX':
            return buildDropIndex($op);

        case 'ADD_PRIMARY_KEY':
            return buildAddPrimaryKey($op);

        case 'DROP_PRIMARY_KEY':
            return buildDropPrimaryKey();

        case 'ADD_FOREIGN_KEY':
            return buildAddForeignKey($op);

        case 'DROP_FOREIGN_KEY':
            return buildDropForeignKey($op);

        case 'RENAME_TABLE':
            return buildRenameTable($op);

        case 'CHANGE_ENGINE':
            return buildChangeEngine($op);

        case 'CHANGE_CHARSET':
            return buildChangeCharset($op);

        default:
            json_error("Unknown operation type: $type", 400);
    }

    return null;
}

function buildAddColumn(array $op): string {
    if (empty($op['column'])) {
        json_error('Column name is required for ADD_COLUMN', 400);
    }
    if (empty($op['definition'])) {
        json_error('Column definition is required for ADD_COLUMN', 400);
    }

    $col = validateIdentifier($op['column']);
    $def = $op['definition'];
    $position = $op['position'] ?? '';

    // Handle definition as either string or array
    if (is_array($def)) {
        $defString = buildColumnDefinition($def);
    } else {
        $defString = $def;
    }

    $sql = "ADD COLUMN `$col` $defString";

    if ($position) {
        // Validate position
        if (preg_match('/^(FIRST|AFTER\s+`?[a-zA-Z_][a-zA-Z0-9_]*`?)$/i', $position)) {
            $sql .= " $position";
        }
    }

    return $sql;
}

function buildModifyColumn(array $op): string {
    if (empty($op['column'])) {
        json_error('Column name is required for MODIFY_COLUMN', 400);
    }
    if (empty($op['definition'])) {
        json_error('Column definition is required for MODIFY_COLUMN', 400);
    }

    $col = validateIdentifier($op['column']);
    $def = $op['definition'];

    // Handle definition as either string or array
    if (is_array($def)) {
        $defString = buildColumnDefinition($def);
    } else {
        $defString = $def;
    }

    return "MODIFY COLUMN `$col` $defString";
}

function buildRenameColumn(array $op, string $table, PDO $pdo): string {
    if (empty($op['column'])) {
        json_error('Column name is required for RENAME_COLUMN', 400);
    }
    if (empty($op['newName'])) {
        json_error('New column name is required for RENAME_COLUMN', 400);
    }

    $oldCol = validateIdentifier($op['column']);
    $newCol = validateIdentifier($op['newName']);

    // Get current column definition
    $stmt = $pdo->prepare("
        SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
    ");
    $stmt->execute([$table, $oldCol]);
    $colInfo = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$colInfo) {
        json_error("Column '$oldCol' not found in table", 400);
    }

    $def = $colInfo['COLUMN_TYPE'];
    if ($colInfo['IS_NULLABLE'] === 'NO') {
        $def .= ' NOT NULL';
    }
    if ($colInfo['COLUMN_DEFAULT'] !== null) {
        $def .= " DEFAULT '" . $colInfo['COLUMN_DEFAULT'] . "'";
    }
    if ($colInfo['EXTRA']) {
        $def .= ' ' . $colInfo['EXTRA'];
    }

    return "CHANGE COLUMN `$oldCol` `$newCol` $def";
}

function buildDropColumn(array $op): string {
    if (empty($op['column'])) {
        json_error('Column name is required for DROP_COLUMN', 400);
    }

    $col = validateIdentifier($op['column']);
    return "DROP COLUMN `$col`";
}

function buildAddIndex(array $op, bool $forceUnique = false): string {
    // Support both 'indexName' and 'name' parameter
    $indexName = $op['indexName'] ?? $op['name'] ?? null;

    if (empty($op['columns']) || !is_array($op['columns'])) {
        json_error('Columns are required for ADD_INDEX', 400);
    }

    // Support both 'indexType' and 'index_type' parameter
    $indexType = $op['indexType'] ?? $op['index_type'] ?? 'INDEX';

    // Override with UNIQUE if forceUnique is true
    if ($forceUnique) {
        $indexType = 'UNIQUE';
    }

    $type = in_array($indexType, ['INDEX', 'BTREE', 'UNIQUE', 'FULLTEXT'])
        ? ($indexType === 'BTREE' ? 'INDEX' : $indexType)
        : 'INDEX';

    $cols = array_map(function($c) {
        return '`' . validateIdentifier($c) . '`';
    }, $op['columns']);

    // Generate index name if not provided
    if (empty($indexName)) {
        $prefix = $type === 'UNIQUE' ? 'uniq' : 'idx';
        $indexName = $prefix . '_' . implode('_', $op['columns']);
    }
    $name = validateIdentifier($indexName);

    return "ADD $type `$name` (" . implode(', ', $cols) . ")";
}

function buildAddPrimaryKey(array $op): string {
    if (empty($op['columns']) || !is_array($op['columns'])) {
        json_error('Columns are required for ADD_PRIMARY_KEY', 400);
    }

    $cols = array_map(function($c) {
        return '`' . validateIdentifier($c) . '`';
    }, $op['columns']);

    return "ADD PRIMARY KEY (" . implode(', ', $cols) . ")";
}

function buildDropPrimaryKey(): string {
    return "DROP PRIMARY KEY";
}

function buildDropIndex(array $op): string {
    // Support both 'indexName' and 'name' parameter
    $indexName = $op['indexName'] ?? $op['name'] ?? null;
    if (empty($indexName)) {
        json_error('Index name is required for DROP_INDEX', 400);
    }

    $name = validateIdentifier($indexName);
    return "DROP INDEX `$name`";
}

function buildAddForeignKey(array $op): string {
    // Support both 'constraintName' and 'name' parameter
    $constraintName = $op['constraintName'] ?? $op['name'] ?? null;

    if (empty($op['column'])) {
        json_error('Column is required for ADD_FOREIGN_KEY', 400);
    }

    // Support both direct params and 'references' object
    $refTable = $op['refTable'] ?? $op['references']['table'] ?? null;
    $refCol = $op['refColumn'] ?? $op['references']['column'] ?? null;

    if (empty($refTable)) {
        json_error('Reference table is required for ADD_FOREIGN_KEY', 400);
    }
    if (empty($refCol)) {
        json_error('Reference column is required for ADD_FOREIGN_KEY', 400);
    }

    $col = validateIdentifier($op['column']);
    $refTable = validateIdentifier($refTable);
    $refCol = validateIdentifier($refCol);

    // Support both camelCase and snake_case
    $onDeleteParam = $op['onDelete'] ?? $op['on_delete'] ?? 'RESTRICT';
    $onUpdateParam = $op['onUpdate'] ?? $op['on_update'] ?? 'RESTRICT';

    $onDelete = in_array($onDeleteParam, ['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'])
        ? $onDeleteParam
        : 'RESTRICT';

    $onUpdate = in_array($onUpdateParam, ['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'])
        ? $onUpdateParam
        : 'RESTRICT';

    // Generate constraint name if not provided
    if (empty($constraintName)) {
        $constraintName = "fk_{$col}_{$refTable}";
    }
    $name = validateIdentifier($constraintName);

    return "ADD CONSTRAINT `$name` FOREIGN KEY (`$col`) REFERENCES `$refTable`(`$refCol`) ON DELETE $onDelete ON UPDATE $onUpdate";
}

function buildDropForeignKey(array $op): string {
    // Support both 'constraintName' and 'name' parameter
    $constraintName = $op['constraintName'] ?? $op['name'] ?? null;
    if (empty($constraintName)) {
        json_error('Constraint name is required for DROP_FOREIGN_KEY', 400);
    }

    $name = validateIdentifier($constraintName);
    return "DROP FOREIGN KEY `$name`";
}

function buildRenameTable(array $op): string {
    if (empty($op['newName'])) {
        json_error('New table name is required for RENAME_TABLE', 400);
    }

    $newName = validateIdentifier($op['newName']);
    return "RENAME TO `$newName`";
}

function buildChangeEngine(array $op): string {
    if (empty($op['engine'])) {
        json_error('Engine is required for CHANGE_ENGINE', 400);
    }

    $validEngines = ['InnoDB', 'MyISAM', 'MEMORY', 'CSV', 'ARCHIVE'];
    if (!in_array($op['engine'], $validEngines)) {
        json_error('Invalid storage engine', 400);
    }

    return "ENGINE = " . $op['engine'];
}

function buildChangeCharset(array $op): string {
    if (empty($op['charset'])) {
        json_error('Charset is required for CHANGE_CHARSET', 400);
    }

    $validCharsets = ['utf8mb4', 'utf8', 'latin1', 'ascii'];
    $validCollations = ['utf8mb4_unicode_ci', 'utf8mb4_general_ci', 'utf8_general_ci', 'latin1_swedish_ci'];

    $charset = in_array($op['charset'], $validCharsets) ? $op['charset'] : 'utf8mb4';
    $collation = in_array($op['collation'] ?? '', $validCollations) ? $op['collation'] : 'utf8mb4_unicode_ci';

    return "CHARACTER SET $charset COLLATE $collation";
}

/**
 * Build a column definition string from an array of options
 */
function buildColumnDefinition(array $def): string {
    if (empty($def['type'])) {
        json_error('Column type is required in definition', 400);
    }

    $parts = [];

    // Type (e.g., VARCHAR(255), INT, etc.)
    $parts[] = $def['type'];

    // NULL/NOT NULL
    if (isset($def['nullable'])) {
        $parts[] = $def['nullable'] ? 'NULL' : 'NOT NULL';
    }

    // Default value
    if (array_key_exists('default', $def)) {
        $default = $def['default'];
        if ($default === null) {
            $parts[] = 'DEFAULT NULL';
        } elseif (strtoupper($default) === 'CURRENT_TIMESTAMP') {
            $parts[] = 'DEFAULT CURRENT_TIMESTAMP';
        } elseif (strtoupper($default) === 'NULL') {
            $parts[] = 'DEFAULT NULL';
        } elseif (is_numeric($default)) {
            $parts[] = "DEFAULT $default";
        } else {
            // Escape string default values
            $escapedDefault = addslashes($default);
            $parts[] = "DEFAULT '$escapedDefault'";
        }
    }

    // Auto increment
    if (!empty($def['auto_increment'])) {
        $parts[] = 'AUTO_INCREMENT';
    }

    // Comment
    if (!empty($def['comment'])) {
        $escapedComment = addslashes($def['comment']);
        $parts[] = "COMMENT '$escapedComment'";
    }

    return implode(' ', $parts);
}

/**
 * Validate an identifier (column name, table name, etc.)
 */
function validateIdentifier(string $name): string {
    $name = trim($name);

    if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $name)) {
        json_error("Invalid identifier: $name", 400);
    }

    return $name;
}
