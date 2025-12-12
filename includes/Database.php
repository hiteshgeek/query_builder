<?php

namespace QueryBuilder;

use PDO;
use PDOException;

class Database
{
    private static ?Database $instance = null;
    private ?PDO $connection = null;
    private string $host;
    private string $name;
    private string $user;
    private string $pass;
    private ?string $currentDatabase = null;

    private function __construct()
    {
        $this->host = $_ENV['MS_DB_HOST'] ?? 'localhost';
        $this->name = $_ENV['MS_DB_NAME'] ?? '';
        $this->user = $_ENV['MS_DB_USER'] ?? '';
        $this->pass = $_ENV['MS_DB_PASS'] ?? '';
        $this->currentDatabase = $this->name;
    }

    public static function getInstance(): Database
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function getConnection(): PDO
    {
        if ($this->connection === null) {
            try {
                $dsn = "mysql:host={$this->host};dbname={$this->name};charset=utf8mb4";
                $this->connection = new PDO($dsn, $this->user, $this->pass, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]);
            } catch (PDOException $e) {
                throw new PDOException("Connection failed: " . $e->getMessage());
            }
        }
        return $this->connection;
    }

    public function query(string $sql, array $params = []): array
    {
        $stmt = $this->getConnection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function execute(string $sql, array $params = []): int
    {
        $stmt = $this->getConnection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount();
    }

    public function getDatabaseName(): string
    {
        return $this->name;
    }

    /**
     * Get the current active database
     */
    public function getCurrentDatabase(): string
    {
        return $this->currentDatabase ?? $this->name;
    }

    /**
     * List all databases the user has access to
     */
    public function listDatabases(): array
    {
        $sql = "SHOW DATABASES";
        $rows = $this->query($sql);

        // Filter out system databases that users typically shouldn't access
        $systemDbs = ['information_schema', 'performance_schema', 'mysql', 'sys'];

        $databases = [];
        foreach ($rows as $row) {
            $dbName = $row['Database'];
            if (!in_array($dbName, $systemDbs)) {
                $databases[] = [
                    'name' => $dbName,
                    'is_current' => $dbName === $this->currentDatabase
                ];
            }
        }

        return $databases;
    }

    /**
     * Switch to a different database
     */
    public function switchDatabase(string $name): void
    {
        // Validate the database exists and user has access
        $databases = $this->listDatabases();
        $found = false;
        foreach ($databases as $db) {
            if ($db['name'] === $name) {
                $found = true;
                break;
            }
        }

        if (!$found) {
            throw new PDOException("Database '$name' not found or access denied");
        }

        // Switch database
        $this->getConnection()->exec("USE " . $this->quoteIdentifier($name));
        $this->currentDatabase = $name;
    }

    /**
     * Create a new database
     */
    public function createDatabase(string $name, string $charset = 'utf8mb4', string $collation = 'utf8mb4_unicode_ci'): void
    {
        $sql = "CREATE DATABASE " . $this->quoteIdentifier($name) .
               " CHARACTER SET " . $this->quoteIdentifier($charset) .
               " COLLATE " . $this->quoteIdentifier($collation);
        $this->getConnection()->exec($sql);
    }

    /**
     * Drop a database
     */
    public function dropDatabase(string $name): void
    {
        $sql = "DROP DATABASE " . $this->quoteIdentifier($name);
        $this->getConnection()->exec($sql);
    }

    /**
     * Get available character sets
     */
    public function getCharsets(): array
    {
        $sql = "SHOW CHARACTER SET";
        return $this->query($sql);
    }

    /**
     * Get collations for a character set
     */
    public function getCollations(string $charset = null): array
    {
        $sql = "SHOW COLLATION";
        if ($charset) {
            $sql .= " WHERE Charset = :charset";
            return $this->query($sql, ['charset' => $charset]);
        }
        return $this->query($sql);
    }

    /**
     * Quote an identifier (table name, column name, database name)
     */
    public function quoteIdentifier(string $identifier): string
    {
        return '`' . str_replace('`', '``', $identifier) . '`';
    }
}
