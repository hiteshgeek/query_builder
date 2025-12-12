/**
 * PermissionManager - MySQL Permission Management UI
 *
 * Features:
 * - Visual permission matrix
 * - Grant/Revoke permissions
 * - Permission presets
 * - GRANT OPTION support
 */

import toast from './Toast.js';

class PermissionManager {
    constructor(typeToConfirm) {
        this.typeToConfirm = typeToConfirm;
        this.selectedUser = null;
        this.selectedHost = null;
        this.databases = [];
        this.permissions = {};
        this.availablePrivileges = [];

        this.presets = {
            'read_only': {
                name: 'Read Only',
                description: 'SELECT only',
                privileges: ['SELECT']
            },
            'read_write': {
                name: 'Read/Write',
                description: 'SELECT, INSERT, UPDATE, DELETE',
                privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
            },
            'developer': {
                name: 'Developer',
                description: 'Full schema access',
                privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'INDEX', 'CREATE VIEW', 'SHOW VIEW', 'CREATE ROUTINE', 'ALTER ROUTINE', 'EXECUTE', 'TRIGGER', 'REFERENCES']
            },
            'full_access': {
                name: 'Full Access',
                description: 'All privileges',
                privileges: ['ALL PRIVILEGES']
            }
        };

        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        // Apply preset button
        document.getElementById('btn-apply-preset')?.addEventListener('click', () => this.showPresetModal());

        // Custom grant button
        document.getElementById('btn-custom-grant')?.addEventListener('click', () => this.showGrantModal());

        // Revoke all button
        document.getElementById('btn-revoke-all')?.addEventListener('click', () => this.revokeAll());
    }

    setUser(username, host) {
        this.selectedUser = username;
        this.selectedHost = host;
        this.loadPermissions();
        this.loadDatabases();
    }

    async loadDatabases() {
        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/users.php?databases=1`);
            const result = await response.json();

            if (!result.error) {
                this.databases = result.data.databases;
            }
        } catch (error) {
            console.error('Failed to load databases:', error);
        }
    }

    async loadPermissions() {
        if (!this.selectedUser || !this.selectedHost) return;

        const container = document.getElementById('permissions-container');
        if (!container) return;

        container.innerHTML = '<div class="loading">Loading permissions...</div>';

        try {
            const response = await fetch(
                `${window.APP_CONFIG.apiBase}/permissions.php?user=${encodeURIComponent(this.selectedUser)}&host=${encodeURIComponent(this.selectedHost)}`
            );
            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            this.permissions = result.data;
            this.renderPermissions();

        } catch (error) {
            container.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
        }
    }

    renderPermissions() {
        const container = document.getElementById('permissions-container');
        if (!container) return;

        const summary = this.permissions.summary || {};
        const grants = this.permissions.grants || [];

        if (Object.keys(summary).length === 0 && grants.length === 0) {
            container.innerHTML = `
                <div class="no-permissions">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0110 0v4"/>
                    </svg>
                    <p>No permissions granted to this user</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="permissions-summary">
                <h5>Permission Summary</h5>
                ${Object.entries(summary).map(([scope, privs]) => `
                    <div class="permission-scope">
                        <div class="scope-header">
                            <span class="scope-name">${this.escapeHtml(scope)}</span>
                            <button class="btn-revoke-scope" data-scope="${this.escapeHtml(scope)}">Revoke</button>
                        </div>
                        <div class="scope-privileges">
                            ${privs.map(p => `<span class="privilege-badge">${this.escapeHtml(p)}</span>`).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>

            ${grants.length ? `
                <div class="grants-raw">
                    <h5>Raw GRANT Statements</h5>
                    <div class="grants-list">
                        ${grants.map(g => `<code class="grant-item">${this.escapeHtml(g)}</code>`).join('')}
                    </div>
                </div>
            ` : ''}
        `;

        // Bind revoke scope buttons
        container.querySelectorAll('.btn-revoke-scope').forEach(btn => {
            btn.addEventListener('click', () => {
                const scope = btn.dataset.scope;
                this.revokeScope(scope);
            });
        });
    }

    showPresetModal() {
        if (!this.selectedUser) {
            toast.warning('Please select a user first');
            return;
        }

        const container = document.getElementById('permission-form-container');
        if (!container) return;

        container.innerHTML = `
            <div class="permission-form">
                <h4>Apply Permission Preset</h4>
                <p class="form-description">Quick permission setup for ${this.selectedUser}@${this.selectedHost}</p>

                <div class="form-group">
                    <label>Database</label>
                    <select id="preset-database" class="form-input">
                        <option value="">Select database...</option>
                        ${this.databases.map(db => `<option value="${db}">${db}</option>`).join('')}
                    </select>
                </div>

                <div class="preset-cards">
                    ${Object.entries(this.presets).map(([key, preset]) => `
                        <div class="preset-card" data-preset="${key}">
                            <div class="preset-name">${preset.name}</div>
                            <div class="preset-description">${preset.description}</div>
                        </div>
                    `).join('')}
                </div>

                <div class="form-actions">
                    <button class="btn btn-secondary" id="btn-cancel-preset">Cancel</button>
                </div>
            </div>
        `;

        // Bind events
        container.querySelectorAll('.preset-card').forEach(card => {
            card.addEventListener('click', () => {
                const preset = card.dataset.preset;
                this.applyPreset(preset);
            });
        });

        document.getElementById('btn-cancel-preset').addEventListener('click', () => {
            container.innerHTML = '';
        });
    }

    async applyPreset(preset) {
        const database = document.getElementById('preset-database').value;

        if (!database) {
            toast.warning('Please select a database');
            return;
        }

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/permissions.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: this.selectedUser,
                    host: this.selectedHost,
                    preset: preset,
                    database: database
                })
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            document.getElementById('permission-form-container').innerHTML = '';
            await this.loadPermissions();
            toast.success(result.data.message);

        } catch (error) {
            toast.error('Error: ' + error.message);
        }
    }

    showGrantModal() {
        if (!this.selectedUser) {
            toast.warning('Please select a user first');
            return;
        }

        const container = document.getElementById('permission-form-container');
        if (!container) return;

        const privileges = [
            'SELECT', 'INSERT', 'UPDATE', 'DELETE',
            'CREATE', 'DROP', 'ALTER', 'INDEX',
            'CREATE VIEW', 'SHOW VIEW', 'CREATE ROUTINE',
            'ALTER ROUTINE', 'EXECUTE', 'TRIGGER', 'REFERENCES',
            'CREATE TEMPORARY TABLES', 'LOCK TABLES', 'EVENT'
        ];

        container.innerHTML = `
            <div class="permission-form">
                <h4>Grant Permissions</h4>
                <p class="form-description">Grant custom permissions to ${this.selectedUser}@${this.selectedHost}</p>

                <div class="form-group">
                    <label>Database</label>
                    <select id="grant-database" class="form-input">
                        <option value="*">*.* (Global)</option>
                        ${this.databases.map(db => `<option value="${db}">${db}.*</option>`).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label>Privileges</label>
                    <div class="privilege-checkboxes">
                        <label class="privilege-checkbox all-privs">
                            <input type="checkbox" name="grant-priv" value="ALL PRIVILEGES">
                            <span>ALL PRIVILEGES</span>
                        </label>
                        ${privileges.map(p => `
                            <label class="privilege-checkbox">
                                <input type="checkbox" name="grant-priv" value="${p}">
                                <span>${p}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div class="form-group checkbox-group">
                    <label>
                        <input type="checkbox" id="grant-with-grant">
                        WITH GRANT OPTION
                    </label>
                </div>

                <div class="form-actions">
                    <button class="btn btn-secondary" id="btn-cancel-grant">Cancel</button>
                    <button class="btn btn-primary" id="btn-confirm-grant">Grant</button>
                </div>
            </div>
        `;

        // Handle ALL PRIVILEGES toggle
        const allPrivsCheckbox = container.querySelector('input[value="ALL PRIVILEGES"]');
        allPrivsCheckbox.addEventListener('change', (e) => {
            container.querySelectorAll('input[name="grant-priv"]:not([value="ALL PRIVILEGES"])').forEach(cb => {
                cb.disabled = e.target.checked;
                if (e.target.checked) cb.checked = false;
            });
        });

        document.getElementById('btn-cancel-grant').addEventListener('click', () => {
            container.innerHTML = '';
        });

        document.getElementById('btn-confirm-grant').addEventListener('click', () => {
            this.executeGrant();
        });
    }

    async executeGrant() {
        const database = document.getElementById('grant-database').value;
        const withGrant = document.getElementById('grant-with-grant').checked;
        const privileges = Array.from(document.querySelectorAll('input[name="grant-priv"]:checked'))
            .map(cb => cb.value);

        if (privileges.length === 0) {
            toast.warning('Please select at least one privilege');
            return;
        }

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/permissions.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: this.selectedUser,
                    host: this.selectedHost,
                    privileges: privileges,
                    database: database,
                    with_grant_option: withGrant
                })
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            document.getElementById('permission-form-container').innerHTML = '';
            await this.loadPermissions();
            toast.success(result.data.message);

        } catch (error) {
            toast.error('Error: ' + error.message);
        }
    }

    async revokeScope(scope) {
        // Parse scope (e.g., "database.*" or "*.*")
        const parts = scope.split('.');
        const database = parts[0] === '*' ? '*' : parts[0];

        if (this.typeToConfirm) {
            const confirmed = await this.typeToConfirm.show({
                title: 'Revoke Permissions',
                message: `Revoke all permissions on "${scope}"?`,
                details: `This will remove all privileges for ${this.selectedUser}@${this.selectedHost} on ${scope}`,
                confirmWord: 'REVOKE',
                confirmButtonText: 'Revoke'
            });

            if (!confirmed) return;
        }

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/permissions.php`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: this.selectedUser,
                    host: this.selectedHost,
                    privileges: ['ALL PRIVILEGES'],
                    database: database
                })
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            await this.loadPermissions();

        } catch (error) {
            toast.error('Error: ' + error.message);
        }
    }

    async revokeAll() {
        if (!this.selectedUser) {
            toast.warning('Please select a user first');
            return;
        }

        if (this.typeToConfirm) {
            const confirmed = await this.typeToConfirm.show({
                title: 'Revoke ALL Permissions',
                message: `This will remove ALL permissions from "${this.selectedUser}"@"${this.selectedHost}"`,
                details: 'This action cannot be undone. The user will have no access to any database.',
                confirmWord: this.selectedUser,
                confirmButtonText: 'Revoke All'
            });

            if (!confirmed) return;
        }

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/permissions.php`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: this.selectedUser,
                    host: this.selectedHost,
                    revoke_all: true
                })
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            await this.loadPermissions();
            toast.success(result.data.message);

        } catch (error) {
            toast.error('Error: ' + error.message);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    clear() {
        this.selectedUser = null;
        this.selectedHost = null;
        this.permissions = {};

        const container = document.getElementById('permissions-container');
        const formContainer = document.getElementById('permission-form-container');

        if (container) container.innerHTML = '';
        if (formContainer) formContainer.innerHTML = '';
    }
}

export default PermissionManager;
