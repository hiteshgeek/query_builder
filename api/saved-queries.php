<?php

/**
 * Saved Queries API Endpoint
 *
 * GET /api/saved-queries.php - List all saved queries
 * GET /api/saved-queries.php?id=1 - Get single query
 * GET /api/saved-queries.php?groups - List all groups
 * GET /api/saved-queries.php?tags - List all tags
 * POST /api/saved-queries.php - Create new saved query
 * PUT /api/saved-queries.php?id=1 - Update saved query
 * DELETE /api/saved-queries.php?id=1 - Delete saved query
 */

require_once __DIR__ . '/bootstrap.php';

use QueryBuilder\Database;

// Allow PUT and DELETE methods
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');

try {
    $db = Database::getInstance();

    // Ensure saved_queries table exists
    ensureTableExists($db);

    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            handleGet($db);
            break;
        case 'POST':
            handlePost($db);
            break;
        case 'PUT':
            handlePut($db);
            break;
        case 'DELETE':
            handleDelete($db);
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
 * Ensure the saved_queries table exists
 */
function ensureTableExists(Database $db): void
{
    $pdo = $db->getConnection();

    // Create saved_queries table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `qb_saved_queries` (
            `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            `title` VARCHAR(255) NOT NULL,
            `description` TEXT,
            `sql_query` TEXT NOT NULL,
            `query_state` JSON,
            `query_type` ENUM('select', 'insert', 'update', 'delete', 'alter', 'custom') DEFAULT 'select',
            `group_name` VARCHAR(100),
            `tags` JSON,
            `is_favorite` TINYINT(1) DEFAULT 0,
            `run_count` INT UNSIGNED DEFAULT 0,
            `last_run_at` TIMESTAMP NULL,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX `idx_group` (`group_name`),
            INDEX `idx_favorite` (`is_favorite`),
            INDEX `idx_query_type` (`query_type`),
            FULLTEXT `idx_search` (`title`, `description`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // Add query_state column if it doesn't exist (for existing installations)
    try {
        $pdo->exec("ALTER TABLE `qb_saved_queries` ADD COLUMN `query_state` JSON AFTER `sql_query`");
    } catch (PDOException $e) {
        // Column likely already exists, ignore
    }

    // Create query_groups table for custom group metadata
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `qb_query_groups` (
            `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            `name` VARCHAR(100) NOT NULL UNIQUE,
            `description` TEXT,
            `color` VARCHAR(7),
            `icon` VARCHAR(50),
            `sort_order` INT DEFAULT 0,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
}

/**
 * Handle GET requests
 */
function handleGet(Database $db): void
{
    // Get all groups
    if (isset($_GET['groups'])) {
        $groups = $db->query("
            SELECT g.*, COUNT(q.id) as query_count
            FROM qb_query_groups g
            LEFT JOIN qb_saved_queries q ON q.group_name = g.name
            GROUP BY g.id
            ORDER BY g.sort_order, g.name
        ");

        // Also get groups that have queries but no metadata
        $orphanGroups = $db->query("
            SELECT DISTINCT group_name as name, COUNT(*) as query_count
            FROM qb_saved_queries
            WHERE group_name IS NOT NULL
            AND group_name NOT IN (SELECT name FROM qb_query_groups)
            GROUP BY group_name
        ");

        json_success([
            'groups' => $groups,
            'orphan_groups' => $orphanGroups
        ]);
    }

    // Get all unique tags
    if (isset($_GET['tags'])) {
        $queries = $db->query("SELECT tags FROM qb_saved_queries WHERE tags IS NOT NULL");
        $allTags = [];
        foreach ($queries as $row) {
            $tags = json_decode($row['tags'], true);
            if (is_array($tags)) {
                $allTags = array_merge($allTags, $tags);
            }
        }
        $uniqueTags = array_values(array_unique($allTags));
        sort($uniqueTags);
        json_success(['tags' => $uniqueTags]);
    }

    // Get single query by ID
    if (isset($_GET['id'])) {
        $id = (int) $_GET['id'];
        $queries = $db->query("SELECT * FROM qb_saved_queries WHERE id = ?", [$id]);

        if (empty($queries)) {
            json_error('Query not found', 404);
        }

        $query = $queries[0];
        $query['tags'] = $query['tags'] ? json_decode($query['tags'], true) : [];
        $query['query_state'] = $query['query_state'] ? json_decode($query['query_state'], true) : null;
        json_success($query);
    }

    // List all queries with optional filters
    $where = ['1=1'];
    $params = [];

    // Filter by group
    if (!empty($_GET['group'])) {
        $where[] = 'group_name = ?';
        $params[] = $_GET['group'];
    }

    // Filter by tag
    if (!empty($_GET['tag'])) {
        $where[] = 'JSON_CONTAINS(tags, ?)';
        $params[] = json_encode($_GET['tag']);
    }

    // Filter by query type
    if (!empty($_GET['type'])) {
        $where[] = 'query_type = ?';
        $params[] = $_GET['type'];
    }

    // Filter favorites only
    if (isset($_GET['favorites'])) {
        $where[] = 'is_favorite = 1';
    }

    // Search
    if (!empty($_GET['search'])) {
        $where[] = 'MATCH(title, description) AGAINST(? IN NATURAL LANGUAGE MODE)';
        $params[] = $_GET['search'];
    }

    $whereClause = implode(' AND ', $where);
    $orderBy = $_GET['sort'] ?? 'updated_at';
    $orderDir = ($_GET['order'] ?? 'desc') === 'asc' ? 'ASC' : 'DESC';

    // Validate order column
    $validColumns = ['title', 'created_at', 'updated_at', 'run_count', 'group_name'];
    if (!in_array($orderBy, $validColumns)) {
        $orderBy = 'updated_at';
    }

    $queries = $db->query("
        SELECT * FROM qb_saved_queries
        WHERE $whereClause
        ORDER BY is_favorite DESC, $orderBy $orderDir
    ", $params);

    // Decode tags JSON for each query
    foreach ($queries as &$query) {
        $query['tags'] = $query['tags'] ? json_decode($query['tags'], true) : [];
    }

    json_success(['queries' => $queries]);
}

/**
 * Handle POST requests - Create new query
 */
function handlePost(Database $db): void
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        json_error('Invalid JSON input', 400);
    }

    // Validate required fields
    if (empty($input['title'])) {
        json_error('Title is required', 400);
    }

    if (empty($input['sql_query'])) {
        json_error('SQL query is required', 400);
    }

    $title = trim($input['title']);
    $description = trim($input['description'] ?? '');
    $sqlQuery = trim($input['sql_query']);
    $queryState = $input['query_state'] ?? null;
    $queryType = $input['query_type'] ?? 'select';
    $groupName = !empty($input['group_name']) ? trim($input['group_name']) : null;
    $tags = $input['tags'] ?? [];
    $isFavorite = !empty($input['is_favorite']) ? 1 : 0;

    // Validate query type
    $validTypes = ['select', 'insert', 'update', 'delete', 'alter', 'custom'];
    if (!in_array($queryType, $validTypes)) {
        $queryType = 'custom';
    }

    // Ensure tags is an array
    if (!is_array($tags)) {
        $tags = [];
    }
    $tags = array_values(array_filter(array_map('trim', $tags)));

    $pdo = $db->getConnection();
    $stmt = $pdo->prepare("
        INSERT INTO qb_saved_queries (title, description, sql_query, query_state, query_type, group_name, tags, is_favorite)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ");

    $stmt->execute([
        $title,
        $description,
        $sqlQuery,
        $queryState ? json_encode($queryState) : null,
        $queryType,
        $groupName,
        json_encode($tags),
        $isFavorite
    ]);

    $id = $pdo->lastInsertId();

    // If group doesn't exist in groups table, create it
    if ($groupName) {
        $existing = $db->query("SELECT id FROM qb_query_groups WHERE name = ?", [$groupName]);
        if (empty($existing)) {
            $db->execute("INSERT INTO qb_query_groups (name) VALUES (?)", [$groupName]);
        }
    }

    json_success(['id' => $id], 'Query saved successfully');
}

/**
 * Handle PUT requests - Update existing query
 */
function handlePut(Database $db): void
{
    if (!isset($_GET['id'])) {
        json_error('Query ID is required', 400);
    }

    $id = (int) $_GET['id'];

    // Check if query exists
    $existing = $db->query("SELECT id FROM qb_saved_queries WHERE id = ?", [$id]);
    if (empty($existing)) {
        json_error('Query not found', 404);
    }

    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        json_error('Invalid JSON input', 400);
    }

    // Build update query dynamically
    $updates = [];
    $params = [];

    if (isset($input['title'])) {
        $updates[] = 'title = ?';
        $params[] = trim($input['title']);
    }

    if (isset($input['description'])) {
        $updates[] = 'description = ?';
        $params[] = trim($input['description']);
    }

    if (isset($input['sql_query'])) {
        $updates[] = 'sql_query = ?';
        $params[] = trim($input['sql_query']);
    }

    if (array_key_exists('query_state', $input)) {
        $updates[] = 'query_state = ?';
        $params[] = $input['query_state'] ? json_encode($input['query_state']) : null;
    }

    if (isset($input['query_type'])) {
        $validTypes = ['select', 'insert', 'update', 'delete', 'alter', 'custom'];
        $queryType = in_array($input['query_type'], $validTypes) ? $input['query_type'] : 'custom';
        $updates[] = 'query_type = ?';
        $params[] = $queryType;
    }

    if (array_key_exists('group_name', $input)) {
        $updates[] = 'group_name = ?';
        $groupName = !empty($input['group_name']) ? trim($input['group_name']) : null;
        $params[] = $groupName;

        // Create group if needed
        if ($groupName) {
            $existing = $db->query("SELECT id FROM qb_query_groups WHERE name = ?", [$groupName]);
            if (empty($existing)) {
                $db->execute("INSERT INTO qb_query_groups (name) VALUES (?)", [$groupName]);
            }
        }
    }

    if (isset($input['tags'])) {
        $tags = is_array($input['tags']) ? $input['tags'] : [];
        $tags = array_values(array_filter(array_map('trim', $tags)));
        $updates[] = 'tags = ?';
        $params[] = json_encode($tags);
    }

    if (isset($input['is_favorite'])) {
        $updates[] = 'is_favorite = ?';
        $params[] = !empty($input['is_favorite']) ? 1 : 0;
    }

    // Special: increment run count
    if (isset($input['increment_run_count']) && $input['increment_run_count']) {
        $updates[] = 'run_count = run_count + 1';
        $updates[] = 'last_run_at = NOW()';
    }

    if (empty($updates)) {
        json_error('No fields to update', 400);
    }

    $params[] = $id;
    $updateClause = implode(', ', $updates);

    $db->execute("UPDATE qb_saved_queries SET $updateClause WHERE id = ?", $params);

    json_success(['id' => $id], 'Query updated successfully');
}

/**
 * Handle DELETE requests
 */
function handleDelete(Database $db): void
{
    if (!isset($_GET['id'])) {
        json_error('Query ID is required', 400);
    }

    $id = (int) $_GET['id'];

    $affected = $db->execute("DELETE FROM qb_saved_queries WHERE id = ?", [$id]);

    if ($affected === 0) {
        json_error('Query not found', 404);
    }

    json_success(['id' => $id], 'Query deleted successfully');
}
