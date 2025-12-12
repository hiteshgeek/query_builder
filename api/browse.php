<?php

/**
 * Browse API Endpoint - Paginated data browsing
 *
 * GET /api/browse.php?table=users&page=1&limit=25&sort=id&order=DESC&search=john&filters={"status":"active"}
 */

require_once __DIR__ . '/bootstrap.php';

use QueryBuilder\Database;
use QueryBuilder\Schema;

// Only allow GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed', 405);
}

try {
    $db = Database::getInstance();

    // Get database parameter
    $database = get_database_param();
    if ($database) {
        $db->switchDatabase($database);
    }

    $schema = new Schema($db, $database);

    // Get table name (required)
    $table = $_GET['table'] ?? null;
    if (empty($table)) {
        json_error('Table name is required', 400);
    }

    // Validate table exists
    $tables = $schema->getTables();
    $tableNames = array_column($tables, 'name');
    if (!in_array($table, $tableNames)) {
        json_error('Table not found: ' . $table, 404);
    }

    // Get pagination parameters
    $page = max(1, intval($_GET['page'] ?? 1));
    $limit = intval($_GET['limit'] ?? 25);

    // Validate limit
    $allowedLimits = [10, 25, 50, 100];
    if (!in_array($limit, $allowedLimits)) {
        $limit = 25;
    }

    // Get sorting parameters
    $sortColumn = $_GET['sort'] ?? null;
    $sortOrder = strtoupper($_GET['order'] ?? 'ASC');
    if (!in_array($sortOrder, ['ASC', 'DESC'])) {
        $sortOrder = 'ASC';
    }

    // Get column metadata
    $columns = $schema->getColumns($table);
    $columnNames = array_column($columns, 'name');

    // Validate sort column
    if ($sortColumn && !in_array($sortColumn, $columnNames)) {
        $sortColumn = null;
    }

    // Get primary key
    $primaryKeys = $schema->getPrimaryKeys();
    $primaryKey = $primaryKeys[$table] ?? [];

    // Build WHERE clause for search and filters
    $whereConditions = [];
    $params = [];

    // Quick search - search across text columns
    $search = $_GET['search'] ?? '';
    if (!empty($search)) {
        $textColumns = array_filter($columns, function($col) {
            $textTypes = ['char', 'varchar', 'text', 'tinytext', 'mediumtext', 'longtext', 'enum', 'set'];
            return in_array($col['data_type'], $textTypes);
        });

        if (!empty($textColumns)) {
            $searchConditions = [];
            foreach ($textColumns as $col) {
                $searchConditions[] = "`{$col['name']}` LIKE :search";
            }
            $whereConditions[] = '(' . implode(' OR ', $searchConditions) . ')';
            $params['search'] = '%' . $search . '%';
        }
    }

    // Column filters
    $filters = $_GET['filters'] ?? '';
    if (!empty($filters)) {
        $filterData = json_decode($filters, true);
        if (is_array($filterData)) {
            $filterIndex = 0;
            foreach ($filterData as $column => $value) {
                if (in_array($column, $columnNames) && $value !== '') {
                    $paramName = 'filter_' . $filterIndex;
                    $whereConditions[] = "`{$column}` LIKE :{$paramName}";
                    $params[$paramName] = '%' . $value . '%';
                    $filterIndex++;
                }
            }
        }
    }

    // Build the WHERE clause
    $whereClause = '';
    if (!empty($whereConditions)) {
        $whereClause = 'WHERE ' . implode(' AND ', $whereConditions);
    }

    // Get total count
    $countSql = "SELECT COUNT(*) as total FROM `{$table}` {$whereClause}";
    $countResult = $db->query($countSql, $params);
    $totalRows = intval($countResult[0]['total'] ?? 0);
    $totalPages = max(1, ceil($totalRows / $limit));

    // Adjust page if out of bounds
    if ($page > $totalPages) {
        $page = $totalPages;
    }

    // Calculate offset
    $offset = ($page - 1) * $limit;

    // Build ORDER BY clause
    $orderClause = '';
    if ($sortColumn) {
        $orderClause = "ORDER BY `{$sortColumn}` {$sortOrder}";
    } elseif (!empty($primaryKey)) {
        // Default sort by primary key
        $pkColumns = array_map(fn($col) => "`{$col}`", $primaryKey);
        $orderClause = "ORDER BY " . implode(', ', $pkColumns);
    }

    // Fetch rows
    $dataSql = "SELECT * FROM `{$table}` {$whereClause} {$orderClause} LIMIT {$limit} OFFSET {$offset}";
    $rows = $db->query($dataSql, $params);

    // Return response
    json_success([
        'table' => $table,
        'rows' => $rows,
        'columns' => $columns,
        'primary_key' => $primaryKey,
        'total_rows' => $totalRows,
        'page' => $page,
        'limit' => $limit,
        'total_pages' => $totalPages,
        'sort' => $sortColumn,
        'order' => $sortOrder,
        'search' => $search
    ], 'Data retrieved successfully');

} catch (PDOException $e) {
    json_error('Database error: ' . $e->getMessage(), 500);
} catch (Exception $e) {
    json_error('Server error: ' . $e->getMessage(), 500);
}
