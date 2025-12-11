<?php
/**
 * INSERT Query Execution API
 *
 * Executes INSERT queries with proper validation and security
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

if (empty($input['rows']) || !is_array($input['rows'])) {
    json_error('At least one row of data is required', 400);
}

$table = $input['table'];
$rows = $input['rows'];

// Validate table name (prevent SQL injection in table name)
if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $table)) {
    json_error('Invalid table name', 400);
}

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    // Get table columns to validate input
    $stmt = $pdo->prepare("
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
    ");
    $stmt->execute([$table]);
    $tableColumns = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($tableColumns)) {
        json_error("Table '$table' not found", 404);
    }

    // Build column map for validation
    $columnMap = [];
    foreach ($tableColumns as $col) {
        $columnMap[$col['COLUMN_NAME']] = $col;
    }

    // Filter out auto-increment columns from rows
    $autoIncrementCols = array_filter($tableColumns, function ($col) {
        return stripos($col['EXTRA'], 'auto_increment') !== false;
    });
    $autoIncrementColNames = array_column($autoIncrementCols, 'COLUMN_NAME');

    // Validate and prepare rows
    $validatedRows = [];
    $columns = null;

    foreach ($rows as $rowIndex => $row) {
        if (!is_array($row)) {
            json_error("Row $rowIndex must be an object", 400);
        }

        // Filter out auto-increment columns
        $filteredRow = array_filter($row, function ($key) use ($autoIncrementColNames) {
            return !in_array($key, $autoIncrementColNames);
        }, ARRAY_FILTER_USE_KEY);

        // Validate column names
        foreach (array_keys($filteredRow) as $colName) {
            if (!isset($columnMap[$colName])) {
                json_error("Unknown column '$colName' in row $rowIndex", 400);
            }
        }

        // Set columns from first row
        if ($columns === null) {
            $columns = array_keys($filteredRow);
        }

        // Ensure all rows have the same columns
        $rowColumns = array_keys($filteredRow);
        if (array_diff($columns, $rowColumns) || array_diff($rowColumns, $columns)) {
            json_error("All rows must have the same columns", 400);
        }

        $validatedRows[] = $filteredRow;
    }

    if (empty($columns)) {
        json_error('No valid columns to insert', 400);
    }

    // Build the INSERT statement with placeholders
    $placeholders = '(' . implode(', ', array_fill(0, count($columns), '?')) . ')';
    $allPlaceholders = implode(', ', array_fill(0, count($validatedRows), $placeholders));
    $columnList = implode(', ', array_map(function ($col) {
        return "`$col`";
    }, $columns));

    $sql = "INSERT INTO `$table` ($columnList) VALUES $allPlaceholders";

    // Flatten values for binding
    $values = [];
    foreach ($validatedRows as $row) {
        foreach ($columns as $col) {
            $value = $row[$col] ?? null;
            // Convert empty strings to null for nullable columns
            if ($value === '' && $columnMap[$col]['IS_NULLABLE'] === 'YES') {
                $value = null;
            }
            $values[] = $value;
        }
    }

    // Execute the INSERT
    $startTime = microtime(true);

    $stmt = $pdo->prepare($sql);
    $stmt->execute($values);

    $executionTime = round((microtime(true) - $startTime) * 1000, 2);
    $affectedRows = $stmt->rowCount();
    $lastInsertId = $pdo->lastInsertId();

    json_success([
        'affected_rows' => $affectedRows,
        'last_insert_id' => $lastInsertId ? (int)$lastInsertId : null,
        'execution_time_ms' => $executionTime,
        'sql' => $sql // Return the generated SQL for reference
    ]);

} catch (PDOException $e) {
    $errorCode = $e->getCode();
    $errorMessage = $e->getMessage();

    // Parse MySQL error for more user-friendly messages
    if (strpos($errorMessage, 'Duplicate entry') !== false) {
        json_error('Duplicate entry: A record with this value already exists', 409);
    } elseif (strpos($errorMessage, 'cannot be null') !== false) {
        json_error('Required field missing: ' . $errorMessage, 400);
    } elseif (strpos($errorMessage, 'foreign key constraint') !== false) {
        json_error('Foreign key constraint violation: Referenced record does not exist', 400);
    } else {
        json_error('Database error: ' . $errorMessage, 500);
    }
}
