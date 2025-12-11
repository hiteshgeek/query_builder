<?php
/**
 * MySQL User Management API
 *
 * Endpoints:
 * GET /api/users.php - List all users
 * GET /api/users.php?user=xxx&host=xxx - Get user details
 * POST /api/users.php - Create new user
 * PUT /api/users.php - Update user (change password, lock/unlock)
 * DELETE /api/users.php - Delete user
 */

require_once __DIR__ . '/bootstrap.php';

use QueryBuilder\Database;
use QueryBuilder\UserManager;

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();
    $userManager = new UserManager($pdo);

    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            handleGet($userManager);
            break;

        case 'POST':
            handlePost($userManager);
            break;

        case 'PUT':
            handlePut($userManager);
            break;

        case 'DELETE':
            handleDelete($userManager);
            break;

        default:
            json_error('Method not allowed', 405);
    }

} catch (Exception $e) {
    json_error($e->getMessage(), 400);
}

/**
 * GET - List users or get user details
 */
function handleGet(UserManager $userManager): void
{
    if (isset($_GET['user']) && isset($_GET['host'])) {
        // Get specific user details
        $details = $userManager->getUserDetails($_GET['user'], $_GET['host']);
        json_success($details);
    } elseif (isset($_GET['databases'])) {
        // Get available databases
        $databases = $userManager->getDatabases();
        json_success(['databases' => $databases]);
    } else {
        // List all users
        $users = $userManager->listUsers();
        json_success(['users' => $users]);
    }
}

/**
 * POST - Create new user
 */
function handlePost(UserManager $userManager): void
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        json_error('Invalid JSON input', 400);
    }

    if (empty($input['username'])) {
        json_error('Username is required', 400);
    }

    $username = $input['username'];
    $host = $input['host'] ?? '%';
    $password = $input['password'] ?? '';
    $options = $input['options'] ?? [];

    $userManager->createUser($username, $host, $password, $options);

    json_success([
        'message' => "User '$username'@'$host' created successfully"
    ]);
}

/**
 * PUT - Update user (change password, lock/unlock, rename)
 */
function handlePut(UserManager $userManager): void
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
    $action = $input['action'] ?? '';

    switch ($action) {
        case 'change_password':
            if (empty($input['new_password'])) {
                json_error('New password is required', 400);
            }
            $userManager->changePassword($username, $host, $input['new_password']);
            json_success(['message' => 'Password changed successfully']);
            break;

        case 'lock':
            $userManager->lockUser($username, $host);
            json_success(['message' => "User '$username'@'$host' locked"]);
            break;

        case 'unlock':
            $userManager->unlockUser($username, $host);
            json_success(['message' => "User '$username'@'$host' unlocked"]);
            break;

        case 'rename':
            if (empty($input['new_username']) || empty($input['new_host'])) {
                json_error('New username and host are required', 400);
            }
            $userManager->renameUser($username, $host, $input['new_username'], $input['new_host']);
            json_success(['message' => 'User renamed successfully']);
            break;

        default:
            json_error('Invalid action. Use: change_password, lock, unlock, rename', 400);
    }
}

/**
 * DELETE - Delete user
 */
function handleDelete(UserManager $userManager): void
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

    $userManager->deleteUser($username, $host);

    json_success([
        'message' => "User '$username'@'$host' deleted successfully"
    ]);
}
