<?php
/**
 * DELETE Query Execution API
 *
 * Executes DELETE queries with proper validation and security
 * Supports preview mode to show affected rows before executing
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

// Check for preview mode
$previewMode = isset($_GET['preview']);

// Validate required fields
if (empty($input['table'])) {
    json_error('Table name is required', 400);
}

$table = $input['table'];
$conditions = $input['conditions'] ?? [];

// Validate table name (prevent SQL injection)
if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $table)) {
    json_error('Invalid table name', 400);
}

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    // Get table columns to validate input
    $stmt = $pdo->prepare("
        SELECT COLUMN_NAME, DATA_TYPE
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

    // Build WHERE clause
    $whereClauses = [];
    $whereParams = [];
    $hasValidConditions = false;

    if (!empty($conditions)) {
        foreach ($conditions as $index => $cond) {
            if (empty($cond['column'])) continue;

            $colName = $cond['column'];
            if (!isset($columnMap[$colName])) {
                json_error("Unknown column '$colName' in condition", 400);
            }

            $hasValidConditions = true;
            $operator = $cond['operator'] ?? '=';
            $value = $cond['value'] ?? '';
            $connector = $index > 0 ? ($cond['connector'] ?? 'AND') : '';

            // Validate operator
            $allowedOperators = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN', 'IS NULL', 'IS NOT NULL'];
            if (!in_array($operator, $allowedOperators)) {
                json_error("Invalid operator '$operator'", 400);
            }

            if ($connector) {
                $whereClauses[] = $connector;
            }

            if ($operator === 'IS NULL' || $operator === 'IS NOT NULL') {
                $whereClauses[] = "`$colName` $operator";
            } elseif ($operator === 'IN') {
                // Parse IN values - expect comma-separated values
                $inValues = array_map('trim', explode(',', $value));
                $inPlaceholders = implode(', ', array_fill(0, count($inValues), '?'));
                $whereClauses[] = "`$colName` IN ($inPlaceholders)";
                $whereParams = array_merge($whereParams, $inValues);
            } else {
                $whereClauses[] = "`$colName` $operator ?";
                $whereParams[] = $value;
            }
        }
    }

    // Build SQL
    $sql = "DELETE FROM `$table`";
    if ($hasValidConditions && !empty($whereClauses)) {
        $sql .= " WHERE " . implode(' ', $whereClauses);
    }

    // Preview mode - count affected rows without executing
    if ($previewMode) {
        $countSql = "SELECT COUNT(*) as affected_count FROM `$table`";
        if ($hasValidConditions && !empty($whereClauses)) {
            $countSql .= " WHERE " . implode(' ', $whereClauses);
        }

        $stmt = $pdo->prepare($countSql);
        $stmt->execute($whereParams);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);

        // Also get a sample of rows to be deleted (max 10)
        $sampleSql = "SELECT * FROM `$table`";
        if ($hasValidConditions && !empty($whereClauses)) {
            $sampleSql .= " WHERE " . implode(' ', $whereClauses);
        }
        $sampleSql .= " LIMIT 10";

        $stmt = $pdo->prepare($sampleSql);
        $stmt->execute($whereParams);
        $sampleRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        json_success([
            'preview' => true,
            'affected_count' => (int)$result['affected_count'],
            'has_where_clause' => $hasValidConditions,
            'sample_rows' => $sampleRows,
            'sql' => $sql
        ]);
    }

    // Execute the DELETE
    $startTime = microtime(true);

    $stmt = $pdo->prepare($sql);
    $stmt->execute($whereParams);

    $executionTime = round((microtime(true) - $startTime) * 1000, 2);
    $affectedRows = $stmt->rowCount();

    json_success([
        'affected_rows' => $affectedRows,
        'execution_time_ms' => $executionTime,
        'has_where_clause' => $hasValidConditions,
        'sql' => $sql
    ]);

} catch (PDOException $e) {
    $errorMessage = $e->getMessage();

    if (strpos($errorMessage, 'foreign key constraint') !== false) {
        json_error('Cannot delete: This record is referenced by other records (foreign key constraint)', 400);
    } else {
        json_error('Database error: ' . $errorMessage, 500);
    }
}
