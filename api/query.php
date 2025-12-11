<?php

/**
 * Query Execution API Endpoint
 *
 * POST /api/query.php
 * Body: { "sql": "SELECT ...", "params": [] }
 *
 * POST /api/query.php?explain
 * Body: { "sql": "SELECT ..." }
 */

require_once __DIR__ . '/bootstrap.php';

use QueryBuilder\Database;

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed. Use POST.', 405);
}

// Get JSON body
$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !isset($input['sql'])) {
    json_error('SQL query is required', 400);
}

$sql = trim($input['sql']);
$params = $input['params'] ?? [];

// Basic SQL injection prevention - only allow SELECT statements
$sqlUpper = strtoupper(ltrim($sql));
if (!str_starts_with($sqlUpper, 'SELECT') && !str_starts_with($sqlUpper, 'EXPLAIN')) {
    json_error('Only SELECT queries are allowed', 403);
}

// Block dangerous patterns
$dangerous = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE'];
foreach ($dangerous as $keyword) {
    if (preg_match('/\b' . $keyword . '\b/i', $sql)) {
        json_error("Query contains forbidden keyword: $keyword", 403);
    }
}

try {
    $db = Database::getInstance();

    // Check if EXPLAIN mode
    $isExplain = isset($_GET['explain']);

    if ($isExplain && !str_starts_with($sqlUpper, 'EXPLAIN')) {
        $sql = 'EXPLAIN ' . $sql;
    }

    $startTime = microtime(true);
    $results = $db->query($sql, $params);
    $executionTime = round((microtime(true) - $startTime) * 1000, 2);

    json_success([
        'rows' => $results,
        'row_count' => count($results),
        'execution_time_ms' => $executionTime,
        'is_explain' => $isExplain
    ], 'Query executed successfully');

} catch (PDOException $e) {
    json_error('Query error: ' . $e->getMessage(), 400);
} catch (Exception $e) {
    json_error('Server error: ' . $e->getMessage(), 500);
}
