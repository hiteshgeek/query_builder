<?php

/**
 * Schema API Endpoint
 *
 * GET /api/schema.php              - Get full schema
 * GET /api/schema.php?tables       - Get tables list only
 * GET /api/schema.php?table=name   - Get columns for specific table
 * GET /api/schema.php?relationships - Get all relationships
 *
 * All endpoints accept ?database=name to specify which database to query
 */

require_once __DIR__ . '/bootstrap.php';

use QueryBuilder\Database;
use QueryBuilder\Schema;

try {
    $db = Database::getInstance();

    // Get optional database parameter
    $database = get_database_param();

    // If a database is specified, switch to it first
    if ($database) {
        $db->switchDatabase($database);
    }

    $schema = new Schema($db, $database);

    // Route based on query parameters
    if (isset($_GET['tables'])) {
        // Get tables list only
        $tables = $schema->getTables();
        json_success($tables, 'Tables retrieved successfully');
    }
    elseif (isset($_GET['table'])) {
        // Get columns for specific table
        $tableName = $_GET['table'];
        if (empty($tableName)) {
            json_error('Table name is required', 400);
        }
        $columns = $schema->getColumns($tableName);
        $indexes = $schema->getIndexes($tableName);
        json_success([
            'table' => $tableName,
            'columns' => $columns,
            'indexes' => $indexes
        ], 'Table details retrieved successfully');
    }
    elseif (isset($_GET['relationships'])) {
        // Get all relationships
        $relationships = $schema->getRelationships();
        json_success($relationships, 'Relationships retrieved successfully');
    }
    else {
        // Get full schema
        $fullSchema = $schema->getFullSchema();
        json_success($fullSchema, 'Full schema retrieved successfully');
    }

} catch (PDOException $e) {
    json_error('Database error: ' . $e->getMessage(), 500);
} catch (Exception $e) {
    json_error('Server error: ' . $e->getMessage(), 500);
}
