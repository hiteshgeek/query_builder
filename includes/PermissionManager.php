<?php
/**
 * MySQL Permission Manager
 *
 * Handles MySQL permission operations:
 * - Get user permissions
 * - Grant permissions
 * - Revoke permissions
 */

namespace QueryBuilder;

class PermissionManager
{
    private \PDO $pdo;

    // Available privilege types
    private array $globalPrivileges = [
        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
        'CREATE', 'DROP', 'RELOAD', 'SHUTDOWN',
        'PROCESS', 'FILE', 'REFERENCES', 'INDEX',
        'ALTER', 'SHOW DATABASES', 'SUPER', 'CREATE TEMPORARY TABLES',
        'LOCK TABLES', 'EXECUTE', 'REPLICATION SLAVE', 'REPLICATION CLIENT',
        'CREATE VIEW', 'SHOW VIEW', 'CREATE ROUTINE', 'ALTER ROUTINE',
        'CREATE USER', 'EVENT', 'TRIGGER', 'CREATE TABLESPACE'
    ];

    private array $databasePrivileges = [
        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
        'CREATE', 'DROP', 'REFERENCES', 'INDEX',
        'ALTER', 'CREATE TEMPORARY TABLES', 'LOCK TABLES',
        'EXECUTE', 'CREATE VIEW', 'SHOW VIEW',
        'CREATE ROUTINE', 'ALTER ROUTINE', 'EVENT', 'TRIGGER'
    ];

    private array $tablePrivileges = [
        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
        'CREATE', 'DROP', 'REFERENCES', 'INDEX',
        'ALTER', 'CREATE VIEW', 'SHOW VIEW', 'TRIGGER'
    ];

    public function __construct(\PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Get available privileges
     */
    public function getAvailablePrivileges(string $level = 'database'): array
    {
        switch ($level) {
            case 'global':
                return $this->globalPrivileges;
            case 'table':
                return $this->tablePrivileges;
            default:
                return $this->databasePrivileges;
        }
    }

    /**
     * Get user permissions for a specific database
     */
    public function getUserDatabasePermissions(string $username, string $host, string $database): array
    {
        $this->validateIdentifier($username);
        $this->validateHost($host);
        $this->validateIdentifier($database);

        // Get database-level permissions
        $stmt = $this->pdo->prepare("
            SELECT *
            FROM mysql.db
            WHERE User = ? AND Host = ? AND Db = ?
        ");
        $stmt->execute([$username, $host, $database]);
        $dbPerms = $stmt->fetch(\PDO::FETCH_ASSOC);

        $permissions = [];

        if ($dbPerms) {
            foreach ($this->databasePrivileges as $priv) {
                $colName = str_replace(' ', '_', $priv) . '_priv';
                if (isset($dbPerms[$colName]) && $dbPerms[$colName] === 'Y') {
                    $permissions[] = $priv;
                }
            }
        }

        return $permissions;
    }

    /**
     * Get all grants for a user
     */
    public function getUserGrants(string $username, string $host): array
    {
        $this->validateIdentifier($username);
        $this->validateHost($host);

        try {
            $stmt = $this->pdo->query(
                "SHOW GRANTS FOR " . $this->pdo->quote($username) . "@" . $this->pdo->quote($host)
            );
            return $stmt->fetchAll(\PDO::FETCH_COLUMN);
        } catch (\PDOException $e) {
            return [];
        }
    }

    /**
     * Grant privileges to a user
     */
    public function grant(
        string $username,
        string $host,
        array $privileges,
        string $database = '*',
        string $table = '*',
        bool $withGrantOption = false
    ): bool {
        $this->validateIdentifier($username);
        $this->validateHost($host);

        if ($database !== '*') {
            $this->validateIdentifier($database);
        }
        if ($table !== '*') {
            $this->validateIdentifier($table);
        }

        // Validate privileges
        $validPrivileges = $this->getAvailablePrivileges($database === '*' ? 'global' : 'database');
        foreach ($privileges as $priv) {
            if ($priv !== 'ALL PRIVILEGES' && !in_array(strtoupper($priv), $validPrivileges)) {
                throw new \Exception("Invalid privilege: $priv");
            }
        }

        // Build GRANT statement
        $privList = in_array('ALL PRIVILEGES', $privileges)
            ? 'ALL PRIVILEGES'
            : implode(', ', array_map('strtoupper', $privileges));

        $onClause = $database === '*' && $table === '*'
            ? '*.*'
            : "`$database`." . ($table === '*' ? '*' : "`$table`");

        $sql = "GRANT $privList ON $onClause TO " .
               $this->pdo->quote($username) . "@" . $this->pdo->quote($host);

        if ($withGrantOption) {
            $sql .= " WITH GRANT OPTION";
        }

        $this->pdo->exec($sql);
        $this->pdo->exec("FLUSH PRIVILEGES");

        return true;
    }

    /**
     * Revoke privileges from a user
     */
    public function revoke(
        string $username,
        string $host,
        array $privileges,
        string $database = '*',
        string $table = '*'
    ): bool {
        $this->validateIdentifier($username);
        $this->validateHost($host);

        if ($database !== '*') {
            $this->validateIdentifier($database);
        }
        if ($table !== '*') {
            $this->validateIdentifier($table);
        }

        // Build REVOKE statement
        $privList = in_array('ALL PRIVILEGES', $privileges)
            ? 'ALL PRIVILEGES'
            : implode(', ', array_map('strtoupper', $privileges));

        $onClause = $database === '*' && $table === '*'
            ? '*.*'
            : "`$database`." . ($table === '*' ? '*' : "`$table`");

        $sql = "REVOKE $privList ON $onClause FROM " .
               $this->pdo->quote($username) . "@" . $this->pdo->quote($host);

        $this->pdo->exec($sql);
        $this->pdo->exec("FLUSH PRIVILEGES");

        return true;
    }

    /**
     * Revoke all privileges from a user
     */
    public function revokeAll(string $username, string $host): bool
    {
        $this->validateIdentifier($username);
        $this->validateHost($host);

        // Prevent revoking from root
        if (strtolower($username) === 'root') {
            throw new \Exception("Cannot revoke all privileges from root user");
        }

        $sql = "REVOKE ALL PRIVILEGES, GRANT OPTION FROM " .
               $this->pdo->quote($username) . "@" . $this->pdo->quote($host);

        $this->pdo->exec($sql);
        $this->pdo->exec("FLUSH PRIVILEGES");

        return true;
    }

    /**
     * Apply a preset permission set
     */
    public function applyPreset(
        string $username,
        string $host,
        string $preset,
        string $database
    ): bool {
        $this->validateIdentifier($username);
        $this->validateHost($host);
        $this->validateIdentifier($database);

        // First, revoke existing permissions on this database
        try {
            $this->revoke($username, $host, ['ALL PRIVILEGES'], $database);
        } catch (\PDOException $e) {
            // Ignore if no existing permissions
        }

        switch ($preset) {
            case 'read_only':
                $privileges = ['SELECT'];
                break;

            case 'read_write':
                $privileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
                break;

            case 'developer':
                $privileges = [
                    'SELECT', 'INSERT', 'UPDATE', 'DELETE',
                    'CREATE', 'DROP', 'ALTER', 'INDEX',
                    'CREATE VIEW', 'SHOW VIEW',
                    'CREATE ROUTINE', 'ALTER ROUTINE', 'EXECUTE',
                    'TRIGGER', 'REFERENCES'
                ];
                break;

            case 'full_access':
                $privileges = ['ALL PRIVILEGES'];
                break;

            default:
                throw new \Exception("Unknown preset: $preset");
        }

        return $this->grant($username, $host, $privileges, $database);
    }

    /**
     * Get permission summary for user on all databases
     */
    public function getUserPermissionSummary(string $username, string $host): array
    {
        $this->validateIdentifier($username);
        $this->validateHost($host);

        $summary = [];

        // Get global permissions
        $stmt = $this->pdo->prepare("
            SELECT *
            FROM mysql.user
            WHERE User = ? AND Host = ?
        ");
        $stmt->execute([$username, $host]);
        $userRow = $stmt->fetch(\PDO::FETCH_ASSOC);

        if ($userRow) {
            $globalPerms = [];
            foreach ($this->globalPrivileges as $priv) {
                $colName = str_replace(' ', '_', $priv) . '_priv';
                if (isset($userRow[$colName]) && $userRow[$colName] === 'Y') {
                    $globalPerms[] = $priv;
                }
            }

            if (!empty($globalPerms)) {
                $summary['*.*'] = $globalPerms;
            }
        }

        // Get database-level permissions
        $stmt = $this->pdo->prepare("
            SELECT Db, Select_priv, Insert_priv, Update_priv, Delete_priv,
                   Create_priv, Drop_priv, Grant_priv, References_priv,
                   Index_priv, Alter_priv, Create_tmp_table_priv, Lock_tables_priv,
                   Create_view_priv, Show_view_priv, Create_routine_priv,
                   Alter_routine_priv, Execute_priv, Event_priv, Trigger_priv
            FROM mysql.db
            WHERE User = ? AND Host = ?
        ");
        $stmt->execute([$username, $host]);

        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $dbPerms = [];
            foreach ($row as $key => $value) {
                if ($key !== 'Db' && $value === 'Y') {
                    $priv = str_replace(['_priv', '_'], ['', ' '], $key);
                    $dbPerms[] = strtoupper($priv);
                }
            }

            if (!empty($dbPerms)) {
                $summary[$row['Db'] . '.*'] = $dbPerms;
            }
        }

        return $summary;
    }

    /**
     * Validate a MySQL identifier
     */
    private function validateIdentifier(string $name): void
    {
        if (empty($name)) {
            throw new \Exception("Identifier cannot be empty");
        }

        if (strlen($name) > 64) {
            throw new \Exception("Identifier cannot exceed 64 characters");
        }

        if (!preg_match('/^[a-zA-Z0-9_][a-zA-Z0-9_@.\-]*$/', $name)) {
            throw new \Exception("Invalid identifier format: $name");
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

        if (!preg_match('/^[a-zA-Z0-9%_.\-]+$/', $host)) {
            throw new \Exception("Invalid host format");
        }
    }
}
