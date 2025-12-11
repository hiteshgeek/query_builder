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

// Validate table name (prevent SQL injection)
if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $table)) {
    json_error('Invalid table name', 400);
}

try {
    $db = Database::getInstance();
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
            return buildAddIndex($op);

        case 'DROP_INDEX':
            return buildDropIndex($op);

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

    $sql = "ADD COLUMN `$col` $def";

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

    return "MODIFY COLUMN `$col` $def";
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

function buildAddIndex(array $op): string {
    if (empty($op['indexName'])) {
        json_error('Index name is required for ADD_INDEX', 400);
    }
    if (empty($op['columns']) || !is_array($op['columns'])) {
        json_error('Columns are required for ADD_INDEX', 400);
    }

    $name = validateIdentifier($op['indexName']);
    $type = in_array($op['indexType'] ?? 'INDEX', ['INDEX', 'UNIQUE', 'FULLTEXT'])
        ? $op['indexType']
        : 'INDEX';

    $cols = array_map(function($c) {
        return '`' . validateIdentifier($c) . '`';
    }, $op['columns']);

    return "ADD $type `$name` (" . implode(', ', $cols) . ")";
}

function buildDropIndex(array $op): string {
    if (empty($op['indexName'])) {
        json_error('Index name is required for DROP_INDEX', 400);
    }

    $name = validateIdentifier($op['indexName']);
    return "DROP INDEX `$name`";
}

function buildAddForeignKey(array $op): string {
    if (empty($op['constraintName'])) {
        json_error('Constraint name is required for ADD_FOREIGN_KEY', 400);
    }
    if (empty($op['column'])) {
        json_error('Column is required for ADD_FOREIGN_KEY', 400);
    }
    if (empty($op['refTable'])) {
        json_error('Reference table is required for ADD_FOREIGN_KEY', 400);
    }
    if (empty($op['refColumn'])) {
        json_error('Reference column is required for ADD_FOREIGN_KEY', 400);
    }

    $name = validateIdentifier($op['constraintName']);
    $col = validateIdentifier($op['column']);
    $refTable = validateIdentifier($op['refTable']);
    $refCol = validateIdentifier($op['refColumn']);

    $onDelete = in_array($op['onDelete'] ?? 'RESTRICT', ['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'])
        ? $op['onDelete']
        : 'RESTRICT';

    $onUpdate = in_array($op['onUpdate'] ?? 'RESTRICT', ['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'])
        ? $op['onUpdate']
        : 'RESTRICT';

    return "ADD CONSTRAINT `$name` FOREIGN KEY (`$col`) REFERENCES `$refTable`(`$refCol`) ON DELETE $onDelete ON UPDATE $onUpdate";
}

function buildDropForeignKey(array $op): string {
    if (empty($op['constraintName'])) {
        json_error('Constraint name is required for DROP_FOREIGN_KEY', 400);
    }

    $name = validateIdentifier($op['constraintName']);
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
 * Validate an identifier (column name, table name, etc.)
 */
function validateIdentifier(string $name): string {
    $name = trim($name);

    if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $name)) {
        json_error("Invalid identifier: $name", 400);
    }

    return $name;
}
