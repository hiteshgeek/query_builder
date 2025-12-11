/**
 * TypeToConfirm - A modal component for confirming dangerous operations
 *
 * Requires user to type a specific word/phrase to confirm the action
 */

class TypeToConfirm {
    constructor() {
        this.modal = null;
        this.resolvePromise = null;
        this.createModal();
    }

    createModal() {
        // Check if modal already exists
        if (document.getElementById('type-to-confirm-modal')) {
            this.modal = document.getElementById('type-to-confirm-modal');
            return;
        }

        const modalHtml = `
            <div class="modal" id="type-to-confirm-modal">
                <div class="modal-backdrop"></div>
                <div class="modal-content confirm-modal">
                    <div class="modal-header danger-header">
                        <h3 id="ttc-title">Confirm Dangerous Action</h3>
                        <button class="btn-icon modal-close" id="ttc-cancel">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="confirm-warning">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/>
                                <line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                        </div>
                        <p id="ttc-message" class="confirm-message">This action cannot be undone.</p>
                        <p id="ttc-details" class="confirm-details"></p>
                        <div class="confirm-input-wrapper">
                            <label id="ttc-label">Type <strong id="ttc-word"></strong> to confirm:</label>
                            <input type="text" id="ttc-input" class="confirm-input" autocomplete="off" spellcheck="false">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="ttc-cancel-btn">Cancel</button>
                        <button class="btn btn-danger" id="ttc-confirm-btn" disabled>Delete</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.modal = document.getElementById('type-to-confirm-modal');

        // Bind events
        this.modal.querySelector('#ttc-cancel').addEventListener('click', () => this.close(false));
        this.modal.querySelector('#ttc-cancel-btn').addEventListener('click', () => this.close(false));
        this.modal.querySelector('#ttc-confirm-btn').addEventListener('click', () => this.close(true));
        this.modal.querySelector('.modal-backdrop').addEventListener('click', () => this.close(false));

        // Handle input
        const input = this.modal.querySelector('#ttc-input');
        input.addEventListener('input', (e) => this.handleInput(e));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !this.modal.querySelector('#ttc-confirm-btn').disabled) {
                this.close(true);
            } else if (e.key === 'Escape') {
                this.close(false);
            }
        });
    }

    handleInput(e) {
        const confirmBtn = this.modal.querySelector('#ttc-confirm-btn');
        const expectedWord = this.modal.querySelector('#ttc-word').textContent;
        confirmBtn.disabled = e.target.value !== expectedWord;
    }

    /**
     * Show the confirmation modal
     * @param {Object} options - Configuration options
     * @param {string} options.title - Modal title
     * @param {string} options.message - Main warning message
     * @param {string} options.details - Additional details (optional)
     * @param {string} options.confirmWord - Word user must type to confirm
     * @param {string} options.confirmButtonText - Text for confirm button (default: "Delete")
     * @returns {Promise<boolean>} - Resolves true if confirmed, false if cancelled
     */
    show(options) {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;

            // Set content
            this.modal.querySelector('#ttc-title').textContent = options.title || 'Confirm Action';
            this.modal.querySelector('#ttc-message').textContent = options.message || 'This action cannot be undone.';
            this.modal.querySelector('#ttc-details').textContent = options.details || '';
            this.modal.querySelector('#ttc-word').textContent = options.confirmWord || 'DELETE';
            this.modal.querySelector('#ttc-confirm-btn').textContent = options.confirmButtonText || 'Delete';

            // Reset input
            const input = this.modal.querySelector('#ttc-input');
            input.value = '';
            this.modal.querySelector('#ttc-confirm-btn').disabled = true;

            // Show modal
            this.modal.classList.add('active');

            // Focus input
            setTimeout(() => input.focus(), 100);
        });
    }

    close(confirmed) {
        this.modal.classList.remove('active');
        if (this.resolvePromise) {
            this.resolvePromise(confirmed);
            this.resolvePromise = null;
        }
    }
}

// Export singleton instance
const typeToConfirm = new TypeToConfirm();
export default typeToConfirm;
