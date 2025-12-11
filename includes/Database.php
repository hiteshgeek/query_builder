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

    private function __construct()
    {
        $this->host = $_ENV['MS_DB_HOST'] ?? 'localhost';
        $this->name = $_ENV['MS_DB_NAME'] ?? '';
        $this->user = $_ENV['MS_DB_USER'] ?? '';
        $this->pass = $_ENV['MS_DB_PASS'] ?? '';
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
}
