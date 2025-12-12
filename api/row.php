<?php

/**
 * Row API Endpoint - Single row CRUD operations
 *
 * GET    /api/row.php?table=users&id=5         - Fetch single row
 * POST   /api/row.php                          - Insert new row
 * PUT    /api/row.php                          - Update row
 * DELETE /api/row.php?table=users&id=5         - Delete row
 */

require_once __DIR__ . '/bootstrap.php';

use QueryBuilder\Database;
use QueryBuilder\Schema;

try {
    $db = Database::getInstance();

    // Get database parameter
    $database = get_database_param();
    if ($database) {
        $db->switchDatabase($database);
    }

    $schema = new Schema($db, $database);
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            handleGet($db, $schema);
            break;
        case 'POST':
            handlePost($db, $schema);
            break;
        case 'PUT':
            handlePut($db, $schema);
            break;
        case 'DELETE':
            handleDelete($db, $schema);
            break;
        default:
            json_error('Method not allowed', 405);
    }

} catch (PDOException $e) {
    json_error('Database error: ' . $e->getMessage(), 500);
} catch (Exception $e) {
    json_error('Server error: ' . $e->getMessage(), 500);
}

/**
 * GET - Fetch a single row by primary key
 */
function handleGet($db, $schema) {
    $table = $_GET['table'] ?? null;
    $id = $_GET['id'] ?? null;

    if (empty($table)) {
        json_error('Table name is required', 400);
    }

    // Validate table exists
    $tables = $schema->getTables();
    $tableNames = array_column($tables, 'name');
    if (!in_array($table, $tableNames)) {
        json_error('Table not found: ' . $table, 404);
    }

    // Get primary key
    $primaryKeys = $schema->getPrimaryKeys();
    $primaryKey = $primaryKeys[$table] ?? [];

    if (empty($primaryKey)) {
        json_error('Table has no primary key', 400);
    }

    if (empty($id)) {
        json_error('Row ID is required', 400);
    }

    // Build WHERE clause for primary key
    $whereConditions = [];
    $params = [];

    if (count($primaryKey) === 1) {
        // Simple primary key
        $whereConditions[] = "`{$primaryKey[0]}` = :pk0";
        $params['pk0'] = $id;
    } else {
        // Composite primary key - ID is underscore-separated
        $idParts = explode('_', $id);
        if (count($idParts) !== count($primaryKey)) {
            json_error('Invalid composite primary key format', 400);
        }
        foreach ($primaryKey as $i => $col) {
            $whereConditions[] = "`{$col}` = :pk{$i}";
            $params["pk{$i}"] = $idParts[$i];
        }
    }

    $whereClause = 'WHERE ' . implode(' AND ', $whereConditions);
    $sql = "SELECT * FROM `{$table}` {$whereClause} LIMIT 1";
    $rows = $db->query($sql, $params);

    if (empty($rows)) {
        json_error('Row not found', 404);
    }

    // Get column metadata
    $columns = $schema->getColumns($table);

    json_success([
        'row' => $rows[0],
        'columns' => $columns,
        'primary_key' => $primaryKey
    ], 'Row retrieved successfully');
}

/**
 * POST - Insert a new row
 */
function handlePost($db, $schema) {
    $input = json_decode(file_get_contents('php://input'), true);

    $table = $input['table'] ?? null;
    $data = $input['data'] ?? [];

    if (empty($table)) {
        json_error('Table name is required', 400);
    }

    if (empty($data)) {
        json_error('Row data is required', 400);
    }

    // Validate table exists
    $tables = $schema->getTables();
    $tableNames = array_column($tables, 'name');
    if (!in_array($table, $tableNames)) {
        json_error('Table not found: ' . $table, 404);
    }

    // Get column metadata to validate columns
    $columns = $schema->getColumns($table);
    $columnNames = array_column($columns, 'name');

    // Filter to only valid columns
    $validData = [];
    foreach ($data as $col => $value) {
        if (in_array($col, $columnNames)) {
            $validData[$col] = $value;
        }
    }

    if (empty($validData)) {
        json_error('No valid columns provided', 400);
    }

    // Build INSERT query
    $columnsList = array_keys($validData);
    $placeholders = array_map(fn($col) => ":{$col}", $columnsList);

    $sql = "INSERT INTO `{$table}` (`" . implode('`, `', $columnsList) . "`) VALUES (" . implode(', ', $placeholders) . ")";

    // Prepare params - handle NULL values
    $params = [];
    foreach ($validData as $col => $value) {
        $params[$col] = ($value === '' || $value === null) ? null : $value;
    }

    $db->execute($sql, $params);
    $insertId = $db->lastInsertId();

    json_success([
        'insert_id' => $insertId
    ], 'Row inserted successfully');
}

/**
 * PUT - Update an existing row
 */
function handlePut($db, $schema) {
    $input = json_decode(file_get_contents('php://input'), true);

    $table = $input['table'] ?? null;
    $id = $input['id'] ?? null;
    $data = $input['data'] ?? [];

    if (empty($table)) {
        json_error('Table name is required', 400);
    }

    if (empty($id)) {
        json_error('Row ID is required', 400);
    }

    if (empty($data)) {
        json_error('Row data is required', 400);
    }

    // Validate table exists
    $tables = $schema->getTables();
    $tableNames = array_column($tables, 'name');
    if (!in_array($table, $tableNames)) {
        json_error('Table not found: ' . $table, 404);
    }

    // Get primary key
    $primaryKeys = $schema->getPrimaryKeys();
    $primaryKey = $primaryKeys[$table] ?? [];

    if (empty($primaryKey)) {
        json_error('Table has no primary key', 400);
    }

    // Get column metadata to validate columns
    $columns = $schema->getColumns($table);
    $columnNames = array_column($columns, 'name');

    // Filter to only valid columns (exclude primary key columns)
    $validData = [];
    foreach ($data as $col => $value) {
        if (in_array($col, $columnNames) && !in_array($col, $primaryKey)) {
            $validData[$col] = $value;
        }
    }

    if (empty($validData)) {
        json_error('No valid columns to update', 400);
    }

    // Build SET clause
    $setClauses = [];
    $params = [];
    foreach ($validData as $col => $value) {
        $setClauses[] = "`{$col}` = :set_{$col}";
        $params["set_{$col}"] = ($value === '' || $value === null) ? null : $value;
    }

    // Build WHERE clause for primary key
    $whereConditions = [];
    if (count($primaryKey) === 1) {
        $whereConditions[] = "`{$primaryKey[0]}` = :pk0";
        $params['pk0'] = $id;
    } else {
        // Composite primary key
        $idParts = explode('_', $id);
        if (count($idParts) !== count($primaryKey)) {
            json_error('Invalid composite primary key format', 400);
        }
        foreach ($primaryKey as $i => $col) {
            $whereConditions[] = "`{$col}` = :pk{$i}";
            $params["pk{$i}"] = $idParts[$i];
        }
    }

    $sql = "UPDATE `{$table}` SET " . implode(', ', $setClauses) . " WHERE " . implode(' AND ', $whereConditions);
    $affectedRows = $db->execute($sql, $params);

    json_success([
        'affected_rows' => $affectedRows
    ], 'Row updated successfully');
}

/**
 * DELETE - Delete a row
 */
function handleDelete($db, $schema) {
    $table = $_GET['table'] ?? null;
    $id = $_GET['id'] ?? null;

    if (empty($table)) {
        json_error('Table name is required', 400);
    }

    if (empty($id)) {
        json_error('Row ID is required', 400);
    }

    // Validate table exists
    $tables = $schema->getTables();
    $tableNames = array_column($tables, 'name');
    if (!in_array($table, $tableNames)) {
        json_error('Table not found: ' . $table, 404);
    }

    // Get primary key
    $primaryKeys = $schema->getPrimaryKeys();
    $primaryKey = $primaryKeys[$table] ?? [];

    if (empty($primaryKey)) {
        json_error('Table has no primary key', 400);
    }

    // Build WHERE clause for primary key
    $whereConditions = [];
    $params = [];

    if (count($primaryKey) === 1) {
        $whereConditions[] = "`{$primaryKey[0]}` = :pk0";
        $params['pk0'] = $id;
    } else {
        // Composite primary key
        $idParts = explode('_', $id);
        if (count($idParts) !== count($primaryKey)) {
            json_error('Invalid composite primary key format', 400);
        }
        foreach ($primaryKey as $i => $col) {
            $whereConditions[] = "`{$col}` = :pk{$i}";
            $params["pk{$i}"] = $idParts[$i];
        }
    }

    $sql = "DELETE FROM `{$table}` WHERE " . implode(' AND ', $whereConditions);
    $affectedRows = $db->execute($sql, $params);

    if ($affectedRows === 0) {
        json_error('Row not found or already deleted', 404);
    }

    json_success([
        'affected_rows' => $affectedRows
    ], 'Row deleted successfully');
}
