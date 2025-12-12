/**
 * Saved Queries Manager
 * Handles saving, loading, organizing, and managing saved SQL queries
 */
import toast from './Toast.js';

class SavedQueries {
    constructor() {
        this.queries = [];
        this.groups = [];
        this.tags = [];
        this.currentFilter = {
            group: null,
            tag: null,
            type: null,
            favorites: false,
            search: ''
        };
        this.onLoadQuery = null; // Callback when user loads a query
    }

    /**
     * Fetch all saved queries with optional filters
     */
    async fetchQueries(filters = {}) {
        const params = new URLSearchParams();

        if (filters.group) params.append('group', filters.group);
        if (filters.tag) params.append('tag', filters.tag);
        if (filters.type) params.append('type', filters.type);
        if (filters.favorites) params.append('favorites', '1');
        if (filters.search) params.append('search', filters.search);
        if (filters.sort) params.append('sort', filters.sort);
        if (filters.order) params.append('order', filters.order);

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/saved-queries.php?${params}`);
            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            this.queries = result.data.queries;
            return this.queries;
        } catch (error) {
            console.error('Failed to fetch saved queries:', error);
            toast.error('Failed to load saved queries');
            return [];
        }
    }

    /**
     * Fetch all groups
     */
    async fetchGroups() {
        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/saved-queries.php?groups`);
            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            this.groups = [
                ...result.data.groups,
                ...result.data.orphan_groups.map(g => ({ ...g, is_orphan: true }))
            ];
            return this.groups;
        } catch (error) {
            console.error('Failed to fetch groups:', error);
            return [];
        }
    }

    /**
     * Fetch all unique tags
     */
    async fetchTags() {
        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/saved-queries.php?tags`);
            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            this.tags = result.data.tags;
            return this.tags;
        } catch (error) {
            console.error('Failed to fetch tags:', error);
            return [];
        }
    }

    /**
     * Get a single query by ID
     */
    async getQuery(id) {
        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/saved-queries.php?id=${id}`);
            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            return result.data;
        } catch (error) {
            console.error('Failed to fetch query:', error);
            toast.error('Failed to load query');
            return null;
        }
    }

    /**
     * Save a new query
     */
    async saveQuery(data) {
        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/saved-queries.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            toast.success('Query saved successfully');
            return result.data.id;
        } catch (error) {
            console.error('Failed to save query:', error);
            toast.error('Failed to save query: ' + error.message);
            return null;
        }
    }

    /**
     * Update an existing query
     */
    async updateQuery(id, data) {
        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/saved-queries.php?id=${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            toast.success('Query updated successfully');
            return true;
        } catch (error) {
            console.error('Failed to update query:', error);
            toast.error('Failed to update query: ' + error.message);
            return false;
        }
    }

    /**
     * Delete a query
     */
    async deleteQuery(id) {
        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/saved-queries.php?id=${id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            toast.success('Query deleted');
            return true;
        } catch (error) {
            console.error('Failed to delete query:', error);
            toast.error('Failed to delete query');
            return false;
        }
    }

    /**
     * Toggle favorite status
     */
    async toggleFavorite(id, currentStatus) {
        return this.updateQuery(id, { is_favorite: !currentStatus });
    }

    /**
     * Record that a query was run
     */
    async recordRun(id) {
        try {
            await fetch(`${window.APP_CONFIG.apiBase}/saved-queries.php?id=${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ increment_run_count: true })
            });
        } catch (error) {
            console.error('Failed to record run:', error);
        }
    }

    /**
     * Render the saved queries panel
     */
    renderPanel(container) {
        if (!container) return;

        container.innerHTML = `
            <div class="saved-queries-header">
                <div class="saved-queries-search">
                    <input type="text" id="saved-queries-search" placeholder="Search queries...">
                </div>
                <div class="saved-queries-filters">
                    <select id="saved-queries-group-filter">
                        <option value="">All Groups</option>
                    </select>
                    <select id="saved-queries-type-filter">
                        <option value="">All Types</option>
                        <option value="select">SELECT</option>
                        <option value="insert">INSERT</option>
                        <option value="update">UPDATE</option>
                        <option value="delete">DELETE</option>
                        <option value="alter">ALTER</option>
                        <option value="custom">Custom</option>
                    </select>
                    <button class="btn-icon btn-favorites ${this.currentFilter.favorites ? 'active' : ''}"
                            id="btn-filter-favorites" title="Show Favorites">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="${this.currentFilter.favorites ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="saved-queries-list" id="saved-queries-list">
                <div class="loading">Loading saved queries...</div>
            </div>
        `;

        this.bindPanelEvents(container);
        this.refreshPanel();
    }

    /**
     * Bind panel events
     */
    bindPanelEvents(container) {
        // Search
        container.querySelector('#saved-queries-search')?.addEventListener('input', (e) => {
            this.currentFilter.search = e.target.value;
            this.refreshPanel();
        });

        // Group filter
        container.querySelector('#saved-queries-group-filter')?.addEventListener('change', (e) => {
            this.currentFilter.group = e.target.value || null;
            this.refreshPanel();
        });

        // Type filter
        container.querySelector('#saved-queries-type-filter')?.addEventListener('change', (e) => {
            this.currentFilter.type = e.target.value || null;
            this.refreshPanel();
        });

        // Favorites filter
        container.querySelector('#btn-filter-favorites')?.addEventListener('click', (e) => {
            this.currentFilter.favorites = !this.currentFilter.favorites;
            e.currentTarget.classList.toggle('active', this.currentFilter.favorites);
            const svg = e.currentTarget.querySelector('svg');
            if (svg) {
                svg.setAttribute('fill', this.currentFilter.favorites ? 'currentColor' : 'none');
            }
            this.refreshPanel();
        });
    }

    /**
     * Refresh the queries list
     */
    async refreshPanel() {
        const listContainer = document.getElementById('saved-queries-list');
        if (!listContainer) return;

        // Fetch queries with current filters
        const queries = await this.fetchQueries(this.currentFilter);

        // Update groups dropdown
        await this.fetchGroups();
        const groupSelect = document.getElementById('saved-queries-group-filter');
        if (groupSelect) {
            const currentValue = groupSelect.value;
            groupSelect.innerHTML = '<option value="">All Groups</option>' +
                this.groups.map(g => `<option value="${this.escapeHtml(g.name)}">${this.escapeHtml(g.name)} (${g.query_count})</option>`).join('');
            groupSelect.value = currentValue;
        }

        if (queries.length === 0) {
            listContainer.innerHTML = `
                <div class="no-saved-queries">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    <p>No saved queries</p>
                    <span class="hint">Save your first query using the save button</span>
                </div>
            `;
            return;
        }

        // Group queries by group_name
        const grouped = {};
        const ungrouped = [];

        queries.forEach(query => {
            if (query.group_name) {
                if (!grouped[query.group_name]) {
                    grouped[query.group_name] = [];
                }
                grouped[query.group_name].push(query);
            } else {
                ungrouped.push(query);
            }
        });

        let html = '';

        // Render grouped queries
        Object.keys(grouped).sort().forEach(groupName => {
            html += this.renderQueryGroup(groupName, grouped[groupName]);
        });

        // Render ungrouped queries
        if (ungrouped.length > 0) {
            if (Object.keys(grouped).length > 0) {
                html += '<div class="saved-queries-group-divider">Ungrouped</div>';
            }
            html += ungrouped.map(q => this.renderQueryItem(q)).join('');
        }

        listContainer.innerHTML = html;
        this.bindQueryItemEvents(listContainer);
    }

    /**
     * Render a query group
     */
    renderQueryGroup(groupName, queries) {
        return `
            <div class="saved-queries-group">
                <div class="saved-queries-group-header">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                    </svg>
                    <span>${this.escapeHtml(groupName)}</span>
                    <span class="group-count">${queries.length}</span>
                </div>
                <div class="saved-queries-group-items">
                    ${queries.map(q => this.renderQueryItem(q)).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render a single query item
     */
    renderQueryItem(query) {
        const typeIcon = this.getQueryTypeIcon(query.query_type);
        const tagsHtml = query.tags?.length
            ? `<div class="query-tags">${query.tags.map(t => `<span class="query-tag">${this.escapeHtml(t)}</span>`).join('')}</div>`
            : '';

        return `
            <div class="saved-query-item" data-id="${query.id}">
                <div class="query-item-header">
                    <span class="query-type-icon" title="${query.query_type.toUpperCase()}">${typeIcon}</span>
                    <span class="query-title">${this.escapeHtml(query.title)}</span>
                    <button class="btn-icon btn-favorite ${query.is_favorite ? 'active' : ''}"
                            data-id="${query.id}" data-favorite="${query.is_favorite}" title="Toggle Favorite">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="${query.is_favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                    </button>
                </div>
                ${query.description ? `<div class="query-description">${this.escapeHtml(query.description)}</div>` : ''}
                ${tagsHtml}
                <div class="query-item-footer">
                    <span class="query-meta">
                        ${query.run_count > 0 ? `<span title="Run ${query.run_count} times">Runs: ${query.run_count}</span>` : ''}
                    </span>
                    <div class="query-actions">
                        <button class="btn-sm btn-load" data-id="${query.id}" title="Load Query">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                            Load
                        </button>
                        <button class="btn-icon btn-edit" data-id="${query.id}" title="Edit">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="btn-icon btn-delete" data-id="${query.id}" title="Delete">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Bind events for query items
     */
    bindQueryItemEvents(container) {
        // Load query
        container.querySelectorAll('.btn-load').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                const query = await this.getQuery(id);
                if (query && this.onLoadQuery) {
                    this.onLoadQuery(query);
                    await this.recordRun(id);
                }
            });
        });

        // Toggle favorite
        container.querySelectorAll('.btn-favorite').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                const currentStatus = btn.dataset.favorite === '1' || btn.dataset.favorite === 'true';
                if (await this.toggleFavorite(id, currentStatus)) {
                    this.refreshPanel();
                }
            });
        });

        // Edit query
        container.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                const query = await this.getQuery(id);
                if (query) {
                    this.showSaveModal(query);
                }
            });
        });

        // Delete query
        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                if (confirm('Are you sure you want to delete this saved query?')) {
                    if (await this.deleteQuery(id)) {
                        this.refreshPanel();
                    }
                }
            });
        });

        // Click on query item to expand/preview
        container.querySelectorAll('.saved-query-item').forEach(item => {
            item.addEventListener('click', () => {
                item.classList.toggle('expanded');
            });
        });
    }

    /**
     * Get icon for query type
     */
    getQueryTypeIcon(type) {
        const icons = {
            select: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/></svg>',
            insert: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
            update: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
            delete: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
            alter: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3h7a2 2 0 012 2v14a2 2 0 01-2 2h-7m0-18H5a2 2 0 00-2 2v14a2 2 0 002 2h7m0-18v18"/></svg>',
            custom: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>'
        };
        return icons[type] || icons.custom;
    }

    /**
     * Show save/edit modal
     */
    showSaveModal(existingQuery = null) {
        const isEdit = existingQuery !== null;
        const modal = document.getElementById('save-query-modal');
        if (!modal) return;

        // Populate form
        document.getElementById('save-query-title').value = existingQuery?.title || '';
        document.getElementById('save-query-description').value = existingQuery?.description || '';
        document.getElementById('save-query-favorite').checked = existingQuery?.is_favorite || false;

        // Set selected group and tags for chips
        this.selectedGroup = existingQuery?.group_name || '';
        this.selectedTags = existingQuery?.tags || [];

        // Update hidden fields
        document.getElementById('save-query-group').value = this.selectedGroup;
        document.getElementById('save-query-tags').value = this.selectedTags.join(',');

        // Set query ID for editing
        modal.dataset.queryId = existingQuery?.id || '';

        // Update modal title
        modal.querySelector('.modal-title').textContent = isEdit ? 'Edit Saved Query' : 'Save Query';

        // Populate chips
        this.populateChips();

        // Show modal
        modal.classList.add('active');
    }

    /**
     * Hide save modal
     */
    hideSaveModal() {
        const modal = document.getElementById('save-query-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.dataset.queryId = '';
        }
        // Reset selections
        this.selectedGroup = '';
        this.selectedTags = [];
    }

    /**
     * Populate groups and tags chips
     */
    async populateChips() {
        await Promise.all([this.fetchGroups(), this.fetchTags()]);
        this.renderGroupChips();
        this.renderTagChips();
        this.bindChipsEvents();
    }

    /**
     * Render group chips
     */
    renderGroupChips() {
        const container = document.getElementById('groups-chips-container');
        if (!container) return;

        const groupNames = this.groups.map(g => g.name);

        container.innerHTML = groupNames.map(name => `
            <span class="chip ${this.selectedGroup === name ? 'selected' : ''}" data-value="${this.escapeHtml(name)}">
                ${this.escapeHtml(name)}
            </span>
        `).join('');
    }

    /**
     * Render tag chips
     */
    renderTagChips() {
        const container = document.getElementById('tags-chips-container');
        if (!container) return;

        // Combine existing tags with selected tags (for new tags not in the list yet)
        const allTags = [...new Set([...this.tags, ...this.selectedTags])];

        container.innerHTML = allTags.map(tag => `
            <span class="chip ${this.selectedTags.includes(tag) ? 'selected' : ''}" data-value="${this.escapeHtml(tag)}">
                ${this.escapeHtml(tag)}
            </span>
        `).join('');
    }

    /**
     * Bind chips events
     */
    bindChipsEvents() {
        // Group chips - single select
        const groupsContainer = document.getElementById('groups-chips-container');
        groupsContainer?.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const value = chip.dataset.value;
                if (this.selectedGroup === value) {
                    this.selectedGroup = '';
                } else {
                    this.selectedGroup = value;
                }
                document.getElementById('save-query-group').value = this.selectedGroup;
                this.renderGroupChips();
                this.bindChipsEvents();
            });
        });

        // Add new group
        const addGroupBtn = document.getElementById('btn-add-group');
        const groupInput = document.getElementById('save-query-group-input');

        const addGroup = () => {
            const value = groupInput?.value.trim();
            if (value && !this.groups.find(g => g.name === value)) {
                this.groups.push({ name: value, query_count: 0 });
            }
            if (value) {
                this.selectedGroup = value;
                document.getElementById('save-query-group').value = this.selectedGroup;
                groupInput.value = '';
                this.renderGroupChips();
                this.bindChipsEvents();
            }
        };

        addGroupBtn?.removeEventListener('click', addGroup);
        addGroupBtn?.addEventListener('click', addGroup);

        groupInput?.removeEventListener('keydown', this._groupKeyHandler);
        this._groupKeyHandler = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addGroup();
            }
        };
        groupInput?.addEventListener('keydown', this._groupKeyHandler);

        // Tag chips - multi select
        const tagsContainer = document.getElementById('tags-chips-container');
        tagsContainer?.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const value = chip.dataset.value;
                const idx = this.selectedTags.indexOf(value);
                if (idx > -1) {
                    this.selectedTags.splice(idx, 1);
                } else {
                    this.selectedTags.push(value);
                }
                document.getElementById('save-query-tags').value = this.selectedTags.join(',');
                this.renderTagChips();
                this.bindChipsEvents();
            });
        });

        // Add new tag
        const addTagBtn = document.getElementById('btn-add-tag');
        const tagInput = document.getElementById('save-query-tags-input');

        const addTag = () => {
            const value = tagInput?.value.trim();
            if (value && !this.tags.includes(value)) {
                this.tags.push(value);
            }
            if (value && !this.selectedTags.includes(value)) {
                this.selectedTags.push(value);
                document.getElementById('save-query-tags').value = this.selectedTags.join(',');
                tagInput.value = '';
                this.renderTagChips();
                this.bindChipsEvents();
            } else if (value) {
                tagInput.value = '';
            }
        };

        addTagBtn?.removeEventListener('click', addTag);
        addTagBtn?.addEventListener('click', addTag);

        tagInput?.removeEventListener('keydown', this._tagKeyHandler);
        this._tagKeyHandler = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
            }
        };
        tagInput?.addEventListener('keydown', this._tagKeyHandler);
    }

    /**
     * Populate groups datalist for autocomplete (legacy - kept for compatibility)
     */
    async populateGroupsDatalist() {
        await this.populateChips();
    }

    /**
     * Handle save form submission
     */
    async handleSaveSubmit(sql, queryType = 'select', queryState = null) {
        const modal = document.getElementById('save-query-modal');
        if (!modal) return false;

        const title = document.getElementById('save-query-title').value.trim();
        const description = document.getElementById('save-query-description').value.trim();
        const groupName = document.getElementById('save-query-group').value.trim();
        const tagsInput = document.getElementById('save-query-tags').value.trim();
        const isFavorite = document.getElementById('save-query-favorite').checked;

        if (!title) {
            toast.warning('Please enter a title');
            return false;
        }

        // Parse tags (comma-separated)
        const tags = tagsInput
            ? tagsInput.split(',').map(t => t.trim()).filter(t => t)
            : [];

        const data = {
            title,
            description,
            sql_query: sql,
            query_state: queryState,
            query_type: queryType,
            group_name: groupName || null,
            tags,
            is_favorite: isFavorite
        };

        const queryId = modal.dataset.queryId;

        let success;
        if (queryId) {
            success = await this.updateQuery(parseInt(queryId), data);
        } else {
            success = await this.saveQuery(data);
        }

        if (success) {
            this.hideSaveModal();
            this.refreshPanel();
        }

        return success;
    }

    /**
     * Escape HTML for safe rendering
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export singleton
const savedQueries = new SavedQueries();
export default savedQueries;
