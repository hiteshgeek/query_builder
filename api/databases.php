<?php

/**
 * Databases API Endpoint
 *
 * GET /api/databases.php              - List all databases user has access to
 * GET /api/databases.php?current      - Get current database name
 * POST /api/databases.php             - Create new database
 * DELETE /api/databases.php?name=xxx  - Drop database (requires type-to-confirm)
 */

require_once __DIR__ . '/bootstrap.php';

use QueryBuilder\Database;

try {
    $db = Database::getInstance();
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            if (isset($_GET['current'])) {
                // Get current database
                $currentDb = $db->getCurrentDatabase();
                json_success([
                    'database' => $currentDb,
                    'configured' => $db->getDatabaseName()
                ], 'Current database retrieved');
            } else {
                // List all databases
                $databases = $db->listDatabases();
                $currentDb = $db->getCurrentDatabase();
                json_success([
                    'databases' => $databases,
                    'current' => $currentDb
                ], 'Databases retrieved successfully');
            }
            break;

        case 'POST':
            // Create new database
            $input = json_decode(file_get_contents('php://input'), true);

            if (empty($input['name'])) {
                json_error('Database name is required', 400);
            }

            $name = $input['name'];
            $charset = $input['charset'] ?? 'utf8mb4';
            $collation = $input['collation'] ?? 'utf8mb4_unicode_ci';

            // Validate database name
            if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $name)) {
                json_error('Invalid database name. Use only letters, numbers, and underscores. Must start with letter or underscore.', 400);
            }

            $db->createDatabase($name, $charset, $collation);
            json_success(['name' => $name], 'Database created successfully');
            break;

        case 'DELETE':
            // Drop database
            if (empty($_GET['name'])) {
                json_error('Database name is required', 400);
            }

            $name = $_GET['name'];
            $confirm = $_GET['confirm'] ?? '';

            // Require type-to-confirm
            if ($confirm !== $name) {
                json_error('Type the database name to confirm deletion', 400);
            }

            // Prevent dropping the configured database
            if ($name === $db->getDatabaseName()) {
                json_error('Cannot drop the currently configured database', 400);
            }

            $db->dropDatabase($name);
            json_success(['name' => $name], 'Database dropped successfully');
            break;

        case 'PUT':
            // Switch database
            $input = json_decode(file_get_contents('php://input'), true);

            if (empty($input['name'])) {
                json_error('Database name is required', 400);
            }

            $name = $input['name'];
            $db->switchDatabase($name);

            json_success(['database' => $name], 'Switched to database: ' . $name);
            break;

        default:
            json_error('Method not allowed', 405);
    }

} catch (PDOException $e) {
    json_error('Database error: ' . $e->getMessage(), 500);
} catch (Exception $e) {
    json_error('Server error: ' . $e->getMessage(), 500);
}
