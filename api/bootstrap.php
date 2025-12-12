<?php

/**
 * API Bootstrap - Initialize application for API requests
 */

// Enable error reporting for development
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);

// Custom error handler to return JSON errors
set_exception_handler(function($e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => true,
        'message' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ]);
    exit;
});

set_error_handler(function($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

// Set JSON headers
header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');

// CORS headers (adjust for production)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Load Composer autoloader
require_once __DIR__ . '/../vendor/autoload.php';

// Load environment variables
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

// JSON response helper
function json_response(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// Error response helper
function json_error(string $message, int $status = 400): void
{
    json_response(['error' => true, 'message' => $message], $status);
}

// Success response helper
function json_success(mixed $data, string $message = 'Success'): void
{
    json_response(['error' => false, 'message' => $message, 'data' => $data]);
}

// Get database parameter from request (query string or JSON body)
function get_database_param(): ?string
{
    // First check query string
    if (!empty($_GET['database'])) {
        return $_GET['database'];
    }

    // Then check JSON body (for POST requests)
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!empty($input['database'])) {
            return $input['database'];
        }
    }

    return null;
}
