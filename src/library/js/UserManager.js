/**
 * UserManager - MySQL User Management UI
 *
 * Features:
 * - List all MySQL users
 * - Create new user
 * - Delete user (with type-to-confirm)
 * - Change password
 * - Lock/Unlock accounts
 */

class UserManager {
    constructor(typeToConfirm, onUserSelect = null) {
        this.typeToConfirm = typeToConfirm;
        this.onUserSelect = onUserSelect;
        this.users = [];
        this.selectedUser = null;

        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        // Create user button
        document.getElementById('btn-create-user')?.addEventListener('click', () => this.showCreateUserForm());

        // Refresh users button
        document.getElementById('btn-refresh-users')?.addEventListener('click', () => this.loadUsers());
    }

    async loadUsers() {
        const container = document.getElementById('users-list-container');
        if (!container) return;

        container.innerHTML = '<div class="loading">Loading users...</div>';

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/users.php`);
            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            this.users = result.data.users;
            this.renderUsersList();

        } catch (error) {
            container.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
            console.error('Failed to load users:', error);
        }
    }

    renderUsersList() {
        const container = document.getElementById('users-list-container');
        if (!container) return;

        if (!this.users.length) {
            container.innerHTML = '<div class="placeholder">No users found</div>';
            return;
        }

        container.innerHTML = `
            <div class="users-list">
                ${this.users.map(user => this.renderUserRow(user)).join('')}
            </div>
        `;

        // Bind events
        container.querySelectorAll('.user-row').forEach(row => {
            row.addEventListener('click', () => {
                const username = row.dataset.username;
                const host = row.dataset.host;
                this.selectUser(username, host);
            });
        });

        container.querySelectorAll('.user-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const row = btn.closest('.user-row');
                const username = row.dataset.username;
                const host = row.dataset.host;

                switch (action) {
                    case 'password':
                        this.showChangePasswordForm(username, host);
                        break;
                    case 'lock':
                        this.toggleLock(username, host, true);
                        break;
                    case 'unlock':
                        this.toggleLock(username, host, false);
                        break;
                    case 'delete':
                        this.deleteUser(username, host);
                        break;
                }
            });
        });
    }

    renderUserRow(user) {
        const isRoot = user.username.toLowerCase() === 'root';
        const isLocked = user.is_locked === 'Yes';

        return `
            <div class="user-row ${isRoot ? 'root-user' : ''}" data-username="${user.username}" data-host="${user.host}">
                <div class="user-info">
                    <span class="user-name">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                        </svg>
                        ${user.username}
                    </span>
                    <span class="user-host">@${user.host}</span>
                    ${isLocked ? '<span class="user-badge locked">Locked</span>' : ''}
                    ${user.has_password === 'No' ? '<span class="user-badge warning">No Password</span>' : ''}
                </div>
                <div class="user-actions">
                    <button class="user-action-btn" data-action="password" title="Change Password">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0110 0v4"/>
                        </svg>
                    </button>
                    ${isLocked ?
                        `<button class="user-action-btn" data-action="unlock" title="Unlock Account">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                <path d="M7 11V7a5 5 0 019.9-1"/>
                            </svg>
                        </button>` :
                        `<button class="user-action-btn" data-action="lock" title="Lock Account" ${isRoot ? 'disabled' : ''}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                <path d="M7 11V7a5 5 0 0110 0v4"/>
                            </svg>
                        </button>`
                    }
                    <button class="user-action-btn danger" data-action="delete" title="Delete User" ${isRoot ? 'disabled' : ''}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }

    async selectUser(username, host) {
        // Update selection UI
        document.querySelectorAll('.user-row').forEach(row => {
            row.classList.toggle('selected',
                row.dataset.username === username && row.dataset.host === host
            );
        });

        // Load user details
        const detailsContainer = document.getElementById('user-details-container');
        if (!detailsContainer) return;

        detailsContainer.innerHTML = '<div class="loading">Loading details...</div>';

        try {
            const response = await fetch(
                `${window.APP_CONFIG.apiBase}/users.php?user=${encodeURIComponent(username)}&host=${encodeURIComponent(host)}`
            );
            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            this.selectedUser = result.data;
            this.renderUserDetails();

            // Notify callback if set
            if (this.onUserSelect) {
                this.onUserSelect(username, host);
            }

        } catch (error) {
            detailsContainer.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
        }
    }

    renderUserDetails() {
        const container = document.getElementById('user-details-container');
        if (!container || !this.selectedUser) return;

        const user = this.selectedUser;

        container.innerHTML = `
            <div class="user-details">
                <h4>${user.username}@${user.host}</h4>

                <div class="detail-section">
                    <h5>Account Status</h5>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">Has Password:</span>
                            <span class="detail-value">${user.has_password}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Locked:</span>
                            <span class="detail-value">${user.is_locked}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Password Expired:</span>
                            <span class="detail-value">${user.password_expired}</span>
                        </div>
                    </div>
                </div>

                <div class="detail-section">
                    <h5>Connection Limits</h5>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">Max Connections:</span>
                            <span class="detail-value">${user.max_connections || 'Unlimited'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Max User Connections:</span>
                            <span class="detail-value">${user.max_user_connections || 'Unlimited'}</span>
                        </div>
                    </div>
                </div>

                ${user.grants && user.grants.length ? `
                    <div class="detail-section">
                        <h5>Grants</h5>
                        <div class="grants-list">
                            ${user.grants.map(g => `<code class="grant-item">${this.escapeHtml(g)}</code>`).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    showCreateUserForm() {
        const container = document.getElementById('user-form-container');
        if (!container) return;

        container.innerHTML = `
            <div class="user-form">
                <h4>Create New User</h4>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Username</label>
                        <input type="text" id="new-user-name" class="form-input" placeholder="username">
                    </div>
                    <div class="form-group">
                        <label>Host</label>
                        <select id="new-user-host" class="form-input">
                            <option value="%">% (Any host)</option>
                            <option value="localhost">localhost</option>
                            <option value="127.0.0.1">127.0.0.1</option>
                            <option value="custom">Custom...</option>
                        </select>
                    </div>
                    <div class="form-group" id="custom-host-group" style="display: none;">
                        <label>Custom Host</label>
                        <input type="text" id="new-user-custom-host" class="form-input" placeholder="192.168.1.%">
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <input type="password" id="new-user-password" class="form-input" placeholder="Strong password">
                    </div>
                    <div class="form-group">
                        <label>Confirm Password</label>
                        <input type="password" id="new-user-password-confirm" class="form-input" placeholder="Confirm password">
                    </div>
                </div>
                <div class="form-actions">
                    <button class="btn btn-secondary" id="btn-cancel-create-user">Cancel</button>
                    <button class="btn btn-primary" id="btn-confirm-create-user">Create User</button>
                </div>
            </div>
        `;

        // Handle custom host toggle
        document.getElementById('new-user-host').addEventListener('change', (e) => {
            document.getElementById('custom-host-group').style.display =
                e.target.value === 'custom' ? 'block' : 'none';
        });

        document.getElementById('btn-cancel-create-user').addEventListener('click', () => {
            container.innerHTML = '';
        });

        document.getElementById('btn-confirm-create-user').addEventListener('click', () => {
            this.createUser();
        });
    }

    async createUser() {
        const username = document.getElementById('new-user-name').value.trim();
        let host = document.getElementById('new-user-host').value;
        const password = document.getElementById('new-user-password').value;
        const confirmPassword = document.getElementById('new-user-password-confirm').value;

        if (!username) {
            alert('Username is required');
            return;
        }

        if (host === 'custom') {
            host = document.getElementById('new-user-custom-host').value.trim();
            if (!host) {
                alert('Custom host is required');
                return;
            }
        }

        if (password !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/users.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, host, password })
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            // Clear form and reload users
            document.getElementById('user-form-container').innerHTML = '';
            await this.loadUsers();
            alert(result.data.message);

        } catch (error) {
            alert('Error: ' + error.message);
        }
    }

    showChangePasswordForm(username, host) {
        const container = document.getElementById('user-form-container');
        if (!container) return;

        container.innerHTML = `
            <div class="user-form">
                <h4>Change Password: ${username}@${host}</h4>
                <div class="form-grid">
                    <div class="form-group">
                        <label>New Password</label>
                        <input type="password" id="change-password" class="form-input" placeholder="New password">
                    </div>
                    <div class="form-group">
                        <label>Confirm Password</label>
                        <input type="password" id="change-password-confirm" class="form-input" placeholder="Confirm password">
                    </div>
                </div>
                <div class="form-actions">
                    <button class="btn btn-secondary" id="btn-cancel-change-password">Cancel</button>
                    <button class="btn btn-primary" id="btn-confirm-change-password">Change Password</button>
                </div>
            </div>
        `;

        document.getElementById('btn-cancel-change-password').addEventListener('click', () => {
            container.innerHTML = '';
        });

        document.getElementById('btn-confirm-change-password').addEventListener('click', async () => {
            const password = document.getElementById('change-password').value;
            const confirmPassword = document.getElementById('change-password-confirm').value;

            if (!password) {
                alert('Password is required');
                return;
            }

            if (password !== confirmPassword) {
                alert('Passwords do not match');
                return;
            }

            try {
                const response = await fetch(`${window.APP_CONFIG.apiBase}/users.php`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username,
                        host,
                        action: 'change_password',
                        new_password: password
                    })
                });

                const result = await response.json();

                if (result.error) {
                    throw new Error(result.message);
                }

                container.innerHTML = '';
                alert(result.data.message);

            } catch (error) {
                alert('Error: ' + error.message);
            }
        });
    }

    async toggleLock(username, host, lock) {
        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/users.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    host,
                    action: lock ? 'lock' : 'unlock'
                })
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            await this.loadUsers();

        } catch (error) {
            alert('Error: ' + error.message);
        }
    }

    async deleteUser(username, host) {
        // Type-to-confirm for deletion
        if (this.typeToConfirm) {
            const confirmed = await this.typeToConfirm.show({
                title: 'Delete MySQL User',
                message: `This will permanently delete user "${username}"@"${host}"`,
                details: 'All permissions for this user will be revoked.',
                confirmWord: username,
                confirmButtonText: 'Delete User'
            });

            if (!confirmed) return;
        }

        try {
            const response = await fetch(`${window.APP_CONFIG.apiBase}/users.php`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, host })
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.message);
            }

            await this.loadUsers();

            // Clear details if deleted user was selected
            if (this.selectedUser?.username === username && this.selectedUser?.host === host) {
                this.selectedUser = null;
                const detailsContainer = document.getElementById('user-details-container');
                if (detailsContainer) {
                    detailsContainer.innerHTML = '<div class="placeholder">Select a user to view details</div>';
                }
            }

        } catch (error) {
            alert('Error: ' + error.message);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    clear() {
        this.users = [];
        this.selectedUser = null;

        const listContainer = document.getElementById('users-list-container');
        const detailsContainer = document.getElementById('user-details-container');
        const formContainer = document.getElementById('user-form-container');

        if (listContainer) listContainer.innerHTML = '';
        if (detailsContainer) detailsContainer.innerHTML = '';
        if (formContainer) formContainer.innerHTML = '';
    }
}

export default UserManager;
