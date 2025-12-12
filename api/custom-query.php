<?php

/**
 * Custom Query API Endpoint - Execute raw SQL queries
 *
 * POST /api/custom-query.php
 * Body: { "sql": "SELECT * FROM users" }
 */

require_once __DIR__ . '/bootstrap.php';

use QueryBuilder\Database;

try {
    $db = Database::getInstance();

    // Get database parameter
    $database = get_database_param();
    if ($database) {
        $db->switchDatabase($database);
    }

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method !== 'POST') {
        json_error('Method not allowed', 405);
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $sql = trim($input['sql'] ?? '');

    if (empty($sql)) {
        json_error('SQL query is required', 400);
    }

    // Remove trailing semicolons and get first statement only (for safety)
    // This prevents multiple statement execution
    $sql = rtrim($sql, ';');

    // Check for multiple statements (basic check)
    // Allow semicolons inside strings
    $cleanSQL = preg_replace("/'[^']*'/", '', $sql); // Remove string literals
    $cleanSQL = preg_replace('/"[^"]*"/', '', $cleanSQL); // Remove double-quoted strings
    if (strpos($cleanSQL, ';') !== false) {
        json_error('Multiple statements are not allowed. Please execute one query at a time.', 400);
    }

    // Determine query type
    $queryType = getQueryType($sql);

    // Execute based on type
    $result = executeQuery($db, $sql, $queryType);

    json_success($result, 'Query executed successfully');

} catch (PDOException $e) {
    json_error('Database error: ' . $e->getMessage(), 500);
} catch (Exception $e) {
    json_error('Error: ' . $e->getMessage(), 500);
}

/**
 * Determine the type of SQL query
 */
function getQueryType(string $sql): string {
    $sql = strtoupper(trim($sql));

    if (strpos($sql, 'SELECT') === 0 || strpos($sql, 'SHOW') === 0 || strpos($sql, 'DESCRIBE') === 0 || strpos($sql, 'EXPLAIN') === 0) {
        return 'SELECT';
    }
    if (strpos($sql, 'INSERT') === 0) {
        return 'INSERT';
    }
    if (strpos($sql, 'UPDATE') === 0) {
        return 'UPDATE';
    }
    if (strpos($sql, 'DELETE') === 0) {
        return 'DELETE';
    }
    if (strpos($sql, 'CREATE') === 0) {
        return 'CREATE';
    }
    if (strpos($sql, 'ALTER') === 0) {
        return 'ALTER';
    }
    if (strpos($sql, 'DROP') === 0) {
        return 'DROP';
    }
    if (strpos($sql, 'TRUNCATE') === 0) {
        return 'TRUNCATE';
    }

    return 'OTHER';
}

/**
 * Execute the query and return appropriate result
 */
function executeQuery(Database $db, string $sql, string $queryType): array {
    $pdo = $db->getConnection();

    switch ($queryType) {
        case 'SELECT':
            // For SELECT queries, return rows
            $stmt = $pdo->prepare($sql);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Get column metadata
            $columns = [];
            if (!empty($rows)) {
                $columnCount = $stmt->columnCount();
                for ($i = 0; $i < $columnCount; $i++) {
                    $meta = $stmt->getColumnMeta($i);
                    $columns[] = [
                        'name' => $meta['name'],
                        'type' => $meta['native_type'] ?? 'unknown',
                        'table' => $meta['table'] ?? ''
                    ];
                }
            }

            return [
                'query_type' => 'SELECT',
                'rows' => $rows,
                'columns' => $columns,
                'row_count' => count($rows)
            ];

        case 'INSERT':
            $stmt = $pdo->prepare($sql);
            $stmt->execute();
            $affectedRows = $stmt->rowCount();
            $insertId = $pdo->lastInsertId();

            return [
                'query_type' => 'INSERT',
                'affected_rows' => $affectedRows,
                'insert_id' => $insertId ? (int) $insertId : null
            ];

        case 'UPDATE':
        case 'DELETE':
            $stmt = $pdo->prepare($sql);
            $stmt->execute();
            $affectedRows = $stmt->rowCount();

            return [
                'query_type' => $queryType,
                'affected_rows' => $affectedRows
            ];

        case 'CREATE':
        case 'ALTER':
        case 'DROP':
        case 'TRUNCATE':
            $stmt = $pdo->prepare($sql);
            $stmt->execute();

            return [
                'query_type' => $queryType,
                'affected_rows' => 0,
                'message' => "$queryType statement executed successfully"
            ];

        default:
            // For other queries, try to execute
            $stmt = $pdo->prepare($sql);
            $stmt->execute();

            // Check if it returns rows
            try {
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                if (!empty($rows)) {
                    $columns = [];
                    $columnCount = $stmt->columnCount();
                    for ($i = 0; $i < $columnCount; $i++) {
                        $meta = $stmt->getColumnMeta($i);
                        $columns[] = [
                            'name' => $meta['name'],
                            'type' => $meta['native_type'] ?? 'unknown',
                            'table' => $meta['table'] ?? ''
                        ];
                    }

                    return [
                        'query_type' => 'SELECT',
                        'rows' => $rows,
                        'columns' => $columns,
                        'row_count' => count($rows)
                    ];
                }
            } catch (Exception $e) {
                // Query doesn't return rows
            }

            return [
                'query_type' => 'OTHER',
                'affected_rows' => $stmt->rowCount()
            ];
    }
}
