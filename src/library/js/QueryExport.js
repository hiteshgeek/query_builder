/**
 * QueryExport - Export queries and results to various formats
 *
 * Features:
 * - Export SQL to .sql file
 * - Export results to CSV
 * - Export results to JSON
 */

import toast from './Toast.js';

class QueryExport {
    constructor() {}

    /**
     * Export SQL query to .sql file
     */
    exportSQL(sql, filename = 'query') {
        const blob = new Blob([sql], { type: 'text/sql' });
        this.downloadBlob(blob, `${filename}.sql`);
    }

    /**
     * Export results to CSV
     */
    exportCSV(data, filename = 'results') {
        if (!data || !data.rows || data.rows.length === 0) {
            toast.warning('No data to export');
            return;
        }

        const rows = data.rows;
        const columns = Object.keys(rows[0]);

        // Build CSV content
        let csv = columns.map(c => this.escapeCSVValue(c)).join(',') + '\n';

        for (const row of rows) {
            csv += columns.map(c => this.escapeCSVValue(row[c])).join(',') + '\n';
        }

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        this.downloadBlob(blob, `${filename}.csv`);
    }

    /**
     * Export results to JSON
     */
    exportJSON(data, filename = 'results') {
        if (!data || !data.rows || data.rows.length === 0) {
            toast.warning('No data to export');
            return;
        }

        const json = JSON.stringify(data.rows, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        this.downloadBlob(blob, `${filename}.json`);
    }

    /**
     * Escape CSV value
     */
    escapeCSVValue(value) {
        if (value === null || value === undefined) {
            return '';
        }

        const str = String(value);

        // If contains comma, quote, or newline, wrap in quotes
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }

        return str;
    }

    /**
     * Trigger file download
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

export default QueryExport;
