<?php
/**
 * MySQL Permission Management API
 *
 * Endpoints:
 * GET /api/permissions.php?user=xxx&host=xxx - Get user permission summary
 * GET /api/permissions.php?user=xxx&host=xxx&database=xxx - Get permissions for specific database
 * POST /api/permissions.php - Grant permissions
 * DELETE /api/permissions.php - Revoke permissions
 */

require_once __DIR__ . '/bootstrap.php';

use QueryBuilder\Database;
use QueryBuilder\PermissionManager;

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();
    $permManager = new PermissionManager($pdo);

    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            handleGet($permManager);
            break;

        case 'POST':
            handlePost($permManager);
            break;

        case 'DELETE':
            handleDelete($permManager);
            break;

        default:
            json_error('Method not allowed', 405);
    }

} catch (Exception $e) {
    json_error($e->getMessage(), 400);
}

/**
 * GET - Get permissions
 */
function handleGet(PermissionManager $permManager): void
{
    if (!isset($_GET['user']) || !isset($_GET['host'])) {
        json_error('User and host are required', 400);
    }

    $username = $_GET['user'];
    $host = $_GET['host'];

    if (isset($_GET['available'])) {
        // Get available privileges
        $level = $_GET['level'] ?? 'database';
        $privileges = $permManager->getAvailablePrivileges($level);
        json_success(['privileges' => $privileges]);
    } elseif (isset($_GET['database'])) {
        // Get permissions for specific database
        $database = $_GET['database'];
        $permissions = $permManager->getUserDatabasePermissions($username, $host, $database);
        json_success(['permissions' => $permissions]);
    } else {
        // Get permission summary
        $summary = $permManager->getUserPermissionSummary($username, $host);
        $grants = $permManager->getUserGrants($username, $host);
        json_success([
            'summary' => $summary,
            'grants' => $grants
        ]);
    }
}

/**
 * POST - Grant permissions
 */
function handlePost(PermissionManager $permManager): void
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        json_error('Invalid JSON input', 400);
    }

    if (empty($input['username']) || empty($input['host'])) {
        json_error('Username and host are required', 400);
    }

    $username = $input['username'];
    $host = $input['host'];

    // Check if applying a preset
    if (!empty($input['preset'])) {
        if (empty($input['database'])) {
            json_error('Database is required for presets', 400);
        }

        $permManager->applyPreset($username, $host, $input['preset'], $input['database']);

        json_success([
            'message' => "Preset '{$input['preset']}' applied to '{$input['database']}' for $username@$host"
        ]);
    }

    // Regular grant
    if (empty($input['privileges']) || !is_array($input['privileges'])) {
        json_error('Privileges array is required', 400);
    }

    $database = $input['database'] ?? '*';
    $table = $input['table'] ?? '*';
    $withGrant = $input['with_grant_option'] ?? false;

    $permManager->grant($username, $host, $input['privileges'], $database, $table, $withGrant);

    $scope = $database === '*' ? 'global' : "`$database`." . ($table === '*' ? '*' : "`$table`");

    json_success([
        'message' => "Privileges granted on $scope to $username@$host"
    ]);
}

/**
 * DELETE - Revoke permissions
 */
function handleDelete(PermissionManager $permManager): void
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        json_error('Invalid JSON input', 400);
    }

    if (empty($input['username']) || empty($input['host'])) {
        json_error('Username and host are required', 400);
    }

    $username = $input['username'];
    $host = $input['host'];

    // Check if revoking all
    if (!empty($input['revoke_all'])) {
        $permManager->revokeAll($username, $host);

        json_success([
            'message' => "All privileges revoked from $username@$host"
        ]);
    }

    // Regular revoke
    if (empty($input['privileges']) || !is_array($input['privileges'])) {
        json_error('Privileges array is required', 400);
    }

    $database = $input['database'] ?? '*';
    $table = $input['table'] ?? '*';

    $permManager->revoke($username, $host, $input['privileges'], $database, $table);

    $scope = $database === '*' ? 'global' : "`$database`." . ($table === '*' ? '*' : "`$table`");

    json_success([
        'message' => "Privileges revoked on $scope from $username@$host"
    ]);
}
