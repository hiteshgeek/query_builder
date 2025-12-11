/**
 * QueryHistory - Track and manage query history
 *
 * Features:
 * - Store queries in localStorage
 * - Quick access to recent queries
 * - Re-run historical queries
 * - Clear history
 */

class QueryHistory {
    constructor(maxEntries = 50) {
        this.storageKey = 'qb-query-history';
        this.maxEntries = maxEntries;
        this.history = [];

        this.loadHistory();
    }

    /**
     * Load history from localStorage
     */
    loadHistory() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            this.history = stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('Failed to load query history:', e);
            this.history = [];
        }
    }

    /**
     * Save history to localStorage
     */
    saveHistory() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.history));
        } catch (e) {
            console.error('Failed to save query history:', e);
        }
    }

    /**
     * Add a query to history
     */
    addQuery(sql, queryType = 'SELECT', rowCount = null, executionTime = null) {
        // Don't add empty or comment-only queries
        if (!sql || sql.trim().startsWith('--')) {
            return;
        }

        const entry = {
            id: Date.now(),
            sql: sql.trim(),
            type: queryType.toUpperCase(),
            timestamp: new Date().toISOString(),
            rowCount: rowCount,
            executionTime: executionTime
        };

        // Check if same query exists (don't duplicate)
        const existingIndex = this.history.findIndex(h => h.sql === entry.sql);
        if (existingIndex !== -1) {
            // Move to top and update
            this.history.splice(existingIndex, 1);
        }

        // Add to beginning
        this.history.unshift(entry);

        // Limit entries
        if (this.history.length > this.maxEntries) {
            this.history = this.history.slice(0, this.maxEntries);
        }

        this.saveHistory();
    }

    /**
     * Get all history entries
     */
    getHistory() {
        return this.history;
    }

    /**
     * Get recent queries (default: last 10)
     */
    getRecent(count = 10) {
        return this.history.slice(0, count);
    }

    /**
     * Clear all history
     */
    clearHistory() {
        this.history = [];
        this.saveHistory();
    }

    /**
     * Remove a specific entry
     */
    removeEntry(id) {
        this.history = this.history.filter(h => h.id !== id);
        this.saveHistory();
    }

    /**
     * Search history by query text
     */
    search(query) {
        const lowerQuery = query.toLowerCase();
        return this.history.filter(h =>
            h.sql.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Format timestamp for display
     */
    formatTimestamp(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;

        // Less than a minute
        if (diff < 60000) {
            return 'Just now';
        }

        // Less than an hour
        if (diff < 3600000) {
            const mins = Math.floor(diff / 60000);
            return `${mins}m ago`;
        }

        // Less than a day
        if (diff < 86400000) {
            const hours = Math.floor(diff / 3600000);
            return `${hours}h ago`;
        }

        // Less than a week
        if (diff < 604800000) {
            const days = Math.floor(diff / 86400000);
            return `${days}d ago`;
        }

        // Otherwise, show date
        return date.toLocaleDateString();
    }

    /**
     * Get query type icon
     */
    getTypeIcon(type) {
        const icons = {
            'SELECT': `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 11 12 14 22 4"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>`,
            'INSERT': `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>`,
            'UPDATE': `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>`,
            'DELETE': `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>`,
            'ALTER': `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="12" x2="15" y2="12"/>
                <line x1="12" y1="9" x2="12" y2="15"/>
            </svg>`
        };

        return icons[type] || icons['SELECT'];
    }
}

export default QueryHistory;
