<?php
/**
 * MySQL User Manager
 *
 * Handles MySQL user operations:
 * - List users
 * - Create user
 * - Delete user
 * - Change password
 */

namespace QueryBuilder;

class UserManager
{
    private \PDO $pdo;

    public function __construct(\PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Get all MySQL users
     */
    public function listUsers(): array
    {
        $stmt = $this->pdo->query("
            SELECT
                User as username,
                Host as host,
                IF(authentication_string = '', 'No', 'Yes') as has_password,
                IF(account_locked = 'Y', 'Yes', 'No') as is_locked,
                password_expired as password_expired
            FROM mysql.user
            ORDER BY User, Host
        ");

        return $stmt->fetchAll(\PDO::FETCH_ASSOC);
    }

    /**
     * Get user details including grants
     */
    public function getUserDetails(string $username, string $host): array
    {
        // Validate inputs
        $this->validateIdentifier($username);
        $this->validateHost($host);

        // Get user info
        $stmt = $this->pdo->prepare("
            SELECT
                User as username,
                Host as host,
                IF(authentication_string = '', 'No', 'Yes') as has_password,
                IF(account_locked = 'Y', 'Yes', 'No') as is_locked,
                password_expired,
                max_connections,
                max_user_connections,
                Create_priv,
                Drop_priv,
                Grant_priv,
                References_priv,
                Event_priv,
                Alter_priv,
                Delete_priv,
                Index_priv,
                Insert_priv,
                Select_priv,
                Update_priv,
                Create_tmp_table_priv,
                Lock_tables_priv,
                Trigger_priv,
                Create_view_priv,
                Show_view_priv,
                Alter_routine_priv,
                Create_routine_priv,
                Execute_priv,
                File_priv,
                Create_user_priv,
                Process_priv,
                Reload_priv,
                Repl_client_priv,
                Repl_slave_priv,
                Show_db_priv,
                Shutdown_priv,
                Super_priv
            FROM mysql.user
            WHERE User = ? AND Host = ?
        ");
        $stmt->execute([$username, $host]);
        $user = $stmt->fetch(\PDO::FETCH_ASSOC);

        if (!$user) {
            throw new \Exception("User '$username'@'$host' not found");
        }

        // Get grants
        try {
            $grantStmt = $this->pdo->query("SHOW GRANTS FOR " . $this->pdo->quote($username) . "@" . $this->pdo->quote($host));
            $grants = $grantStmt->fetchAll(\PDO::FETCH_COLUMN);
        } catch (\PDOException $e) {
            $grants = [];
        }

        $user['grants'] = $grants;

        return $user;
    }

    /**
     * Create a new MySQL user
     */
    public function createUser(string $username, string $host, string $password, array $options = []): bool
    {
        $this->validateIdentifier($username);
        $this->validateHost($host);

        // Check if user already exists
        $stmt = $this->pdo->prepare("SELECT 1 FROM mysql.user WHERE User = ? AND Host = ?");
        $stmt->execute([$username, $host]);
        if ($stmt->fetch()) {
            throw new \Exception("User '$username'@'$host' already exists");
        }

        // Build CREATE USER statement
        $sql = "CREATE USER " . $this->pdo->quote($username) . "@" . $this->pdo->quote($host);

        if ($password) {
            $sql .= " IDENTIFIED BY " . $this->pdo->quote($password);
        }

        // Add options
        if (!empty($options['max_connections'])) {
            $sql .= " WITH MAX_CONNECTIONS_PER_HOUR " . (int)$options['max_connections'];
        }

        if (!empty($options['max_user_connections'])) {
            $sql .= " MAX_USER_CONNECTIONS " . (int)$options['max_user_connections'];
        }

        $this->pdo->exec($sql);

        return true;
    }

    /**
     * Delete a MySQL user
     */
    public function deleteUser(string $username, string $host): bool
    {
        $this->validateIdentifier($username);
        $this->validateHost($host);

        // Prevent deleting root user
        if (strtolower($username) === 'root') {
            throw new \Exception("Cannot delete root user");
        }

        // Check if user exists
        $stmt = $this->pdo->prepare("SELECT 1 FROM mysql.user WHERE User = ? AND Host = ?");
        $stmt->execute([$username, $host]);
        if (!$stmt->fetch()) {
            throw new \Exception("User '$username'@'$host' not found");
        }

        $sql = "DROP USER " . $this->pdo->quote($username) . "@" . $this->pdo->quote($host);
        $this->pdo->exec($sql);

        return true;
    }

    /**
     * Change user password
     */
    public function changePassword(string $username, string $host, string $newPassword): bool
    {
        $this->validateIdentifier($username);
        $this->validateHost($host);

        // Check if user exists
        $stmt = $this->pdo->prepare("SELECT 1 FROM mysql.user WHERE User = ? AND Host = ?");
        $stmt->execute([$username, $host]);
        if (!$stmt->fetch()) {
            throw new \Exception("User '$username'@'$host' not found");
        }

        $sql = "ALTER USER " . $this->pdo->quote($username) . "@" . $this->pdo->quote($host) .
               " IDENTIFIED BY " . $this->pdo->quote($newPassword);
        $this->pdo->exec($sql);

        return true;
    }

    /**
     * Rename a user
     */
    public function renameUser(string $oldUsername, string $oldHost, string $newUsername, string $newHost): bool
    {
        $this->validateIdentifier($oldUsername);
        $this->validateIdentifier($newUsername);
        $this->validateHost($oldHost);
        $this->validateHost($newHost);

        // Prevent renaming root user
        if (strtolower($oldUsername) === 'root') {
            throw new \Exception("Cannot rename root user");
        }

        $sql = "RENAME USER " .
               $this->pdo->quote($oldUsername) . "@" . $this->pdo->quote($oldHost) .
               " TO " .
               $this->pdo->quote($newUsername) . "@" . $this->pdo->quote($newHost);

        $this->pdo->exec($sql);

        return true;
    }

    /**
     * Lock a user account
     */
    public function lockUser(string $username, string $host): bool
    {
        $this->validateIdentifier($username);
        $this->validateHost($host);

        $sql = "ALTER USER " . $this->pdo->quote($username) . "@" . $this->pdo->quote($host) . " ACCOUNT LOCK";
        $this->pdo->exec($sql);

        return true;
    }

    /**
     * Unlock a user account
     */
    public function unlockUser(string $username, string $host): bool
    {
        $this->validateIdentifier($username);
        $this->validateHost($host);

        $sql = "ALTER USER " . $this->pdo->quote($username) . "@" . $this->pdo->quote($host) . " ACCOUNT UNLOCK";
        $this->pdo->exec($sql);

        return true;
    }

    /**
     * Get available databases for permission assignment
     */
    public function getDatabases(): array
    {
        $stmt = $this->pdo->query("SHOW DATABASES");
        $databases = $stmt->fetchAll(\PDO::FETCH_COLUMN);

        // Filter out system databases for non-super users (optional)
        return array_values(array_filter($databases, function($db) {
            return !in_array($db, ['information_schema', 'performance_schema', 'sys']);
        }));
    }

    /**
     * Validate a MySQL identifier (username)
     */
    private function validateIdentifier(string $name): void
    {
        if (empty($name)) {
            throw new \Exception("Username cannot be empty");
        }

        if (strlen($name) > 32) {
            throw new \Exception("Username cannot exceed 32 characters");
        }

        // MySQL usernames can contain most characters, but we'll be restrictive for safety
        if (!preg_match('/^[a-zA-Z0-9_][a-zA-Z0-9_@.\-]*$/', $name)) {
            throw new \Exception("Invalid username format");
        }
    }

    /**
     * Validate a host pattern
     */
    private function validateHost(string $host): void
    {
        if (empty($host)) {
            throw new \Exception("Host cannot be empty");
        }

        if (strlen($host) > 255) {
            throw new \Exception("Host cannot exceed 255 characters");
        }

        // Allow common host patterns: localhost, %, IP addresses, hostnames with wildcards
        if (!preg_match('/^[a-zA-Z0-9%_.\-]+$/', $host)) {
            throw new \Exception("Invalid host format");
        }
    }
}
