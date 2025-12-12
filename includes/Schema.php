<?php

namespace QueryBuilder;

class Schema
{
    private Database $db;
    private string $databaseName;

    public function __construct(Database $db, ?string $database = null)
    {
        $this->db = $db;
        $this->databaseName = $database ?? $db->getCurrentDatabase();
    }

    /**
     * Get the database name this schema is for
     */
    public function getDatabaseName(): string
    {
        return $this->databaseName;
    }

    /**
     * Set/change the database name
     */
    public function setDatabaseName(string $database): void
    {
        $this->databaseName = $database;
    }

    /**
     * Get all tables in the database
     */
    public function getTables(): array
    {
        $sql = "SELECT
                    TABLE_NAME as name,
                    TABLE_TYPE as type,
                    ENGINE as engine,
                    TABLE_ROWS as row_count,
                    TABLE_COMMENT as comment
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = :database
                ORDER BY TABLE_NAME";

        return $this->db->query($sql, ['database' => $this->databaseName]);
    }

    /**
     * Get all columns for a specific table
     */
    public function getColumns(string $tableName): array
    {
        $sql = "SELECT
                    COLUMN_NAME as name,
                    DATA_TYPE as data_type,
                    COLUMN_TYPE as column_type,
                    IS_NULLABLE as nullable,
                    COLUMN_KEY as key_type,
                    COLUMN_DEFAULT as default_value,
                    EXTRA as extra,
                    COLUMN_COMMENT as comment,
                    CHARACTER_MAXIMUM_LENGTH as max_length,
                    NUMERIC_PRECISION as numeric_precision,
                    NUMERIC_SCALE as numeric_scale
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = :database AND TABLE_NAME = :table
                ORDER BY ORDINAL_POSITION";

        return $this->db->query($sql, [
            'database' => $this->databaseName,
            'table' => $tableName
        ]);
    }

    /**
     * Get all columns for all tables (optimized single query)
     */
    public function getAllColumns(): array
    {
        $sql = "SELECT
                    TABLE_NAME as table_name,
                    COLUMN_NAME as name,
                    DATA_TYPE as data_type,
                    COLUMN_TYPE as column_type,
                    IS_NULLABLE as nullable,
                    COLUMN_KEY as key_type,
                    COLUMN_DEFAULT as default_value,
                    EXTRA as extra,
                    COLUMN_COMMENT as comment
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = :database
                ORDER BY TABLE_NAME, ORDINAL_POSITION";

        $rows = $this->db->query($sql, ['database' => $this->databaseName]);

        // Group by table
        $result = [];
        foreach ($rows as $row) {
            $tableName = $row['table_name'];
            unset($row['table_name']);
            $result[$tableName][] = $row;
        }

        return $result;
    }

    /**
     * Get primary keys for all tables
     */
    public function getPrimaryKeys(): array
    {
        $sql = "SELECT
                    TABLE_NAME as table_name,
                    COLUMN_NAME as column_name
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = :database
                AND CONSTRAINT_NAME = 'PRIMARY'
                ORDER BY TABLE_NAME, ORDINAL_POSITION";

        $rows = $this->db->query($sql, ['database' => $this->databaseName]);

        $result = [];
        foreach ($rows as $row) {
            $result[$row['table_name']][] = $row['column_name'];
        }

        return $result;
    }

    /**
     * Get all foreign key relationships
     */
    public function getRelationships(): array
    {
        $sql = "SELECT
                    kcu.TABLE_NAME as from_table,
                    kcu.COLUMN_NAME as from_column,
                    kcu.REFERENCED_TABLE_NAME as to_table,
                    kcu.REFERENCED_COLUMN_NAME as to_column,
                    kcu.CONSTRAINT_NAME as constraint_name,
                    rc.UPDATE_RULE as on_update,
                    rc.DELETE_RULE as on_delete
                FROM information_schema.KEY_COLUMN_USAGE kcu
                JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
                    ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
                    AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
                WHERE kcu.TABLE_SCHEMA = :database
                AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
                ORDER BY kcu.TABLE_NAME, kcu.COLUMN_NAME";

        return $this->db->query($sql, ['database' => $this->databaseName]);
    }

    /**
     * Get indexes for a specific table
     */
    public function getIndexes(string $tableName): array
    {
        $sql = "SELECT
                    INDEX_NAME as name,
                    COLUMN_NAME as column_name,
                    NON_UNIQUE as non_unique,
                    SEQ_IN_INDEX as seq,
                    INDEX_TYPE as type
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = :database AND TABLE_NAME = :table
                ORDER BY INDEX_NAME, SEQ_IN_INDEX";

        $rows = $this->db->query($sql, [
            'database' => $this->databaseName,
            'table' => $tableName
        ]);

        // Group by index name
        $result = [];
        foreach ($rows as $row) {
            $indexName = $row['name'];
            if (!isset($result[$indexName])) {
                $result[$indexName] = [
                    'name' => $indexName,
                    'unique' => $row['non_unique'] == 0,
                    'type' => $row['type'],
                    'columns' => []
                ];
            }
            $result[$indexName]['columns'][] = $row['column_name'];
        }

        return array_values($result);
    }

    /**
     * Get complete schema overview (tables with columns and relationships)
     */
    public function getFullSchema(): array
    {
        $tables = $this->getTables();
        $allColumns = $this->getAllColumns();
        $primaryKeys = $this->getPrimaryKeys();
        $relationships = $this->getRelationships();

        // Build relationship lookup
        $relationshipLookup = [];
        foreach ($relationships as $rel) {
            $key = $rel['from_table'] . '.' . $rel['from_column'];
            $relationshipLookup[$key] = $rel;
        }

        // Enrich tables with columns and metadata
        $result = [];
        foreach ($tables as $table) {
            $tableName = $table['name'];
            $table['columns'] = $allColumns[$tableName] ?? [];
            $table['primary_key'] = $primaryKeys[$tableName] ?? [];

            // Mark columns with relationships
            foreach ($table['columns'] as &$column) {
                $key = $tableName . '.' . $column['name'];
                if (isset($relationshipLookup[$key])) {
                    $column['foreign_key'] = $relationshipLookup[$key];
                }
            }

            $result[] = $table;
        }

        return [
            'database' => $this->databaseName,
            'tables' => $result,
            'relationships' => $relationships
        ];
    }

    /**
     * Get data type categories for UI filtering
     */
    public function getDataTypeCategories(): array
    {
        return [
            'numeric' => ['tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'decimal', 'float', 'double'],
            'string' => ['char', 'varchar', 'text', 'tinytext', 'mediumtext', 'longtext'],
            'date' => ['date', 'datetime', 'timestamp', 'time', 'year'],
            'binary' => ['binary', 'varbinary', 'blob', 'tinyblob', 'mediumblob', 'longblob'],
            'other' => ['enum', 'set', 'json', 'geometry']
        ];
    }
}
