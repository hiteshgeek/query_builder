/**
 * ConfirmModal - Custom confirmation modal to replace native confirm()
 *
 * Usage:
 *   import confirmModal from './ConfirmModal.js';
 *
 *   // Simple usage
 *   const result = await confirmModal.show('Are you sure?');
 *
 *   // With options
 *   const result = await confirmModal.show({
 *       title: 'Confirm Delete',
 *       message: 'Are you sure you want to delete this item?',
 *       confirmText: 'Delete',
 *       cancelText: 'Cancel',
 *       type: 'danger' // 'default', 'danger', 'warning'
 *   });
 */

class ConfirmModal {
    constructor() {
        this.modal = null;
        this.resolvePromise = null;
        this.init();
    }

    init() {
        // Create modal element
        this.modal = document.createElement('div');
        this.modal.className = 'confirm-modal-overlay';
        this.modal.innerHTML = `
            <div class="confirm-modal">
                <div class="confirm-modal-header">
                    <span class="confirm-modal-icon"></span>
                    <h3 class="confirm-modal-title">Confirm</h3>
                </div>
                <div class="confirm-modal-body">
                    <p class="confirm-modal-message"></p>
                </div>
                <div class="confirm-modal-footer">
                    <button class="btn btn-cancel" type="button">Cancel</button>
                    <button class="btn btn-confirm" type="button">Confirm</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modal);

        // Bind events
        this.modal.querySelector('.btn-cancel').addEventListener('click', () => this.close(false));
        this.modal.querySelector('.btn-confirm').addEventListener('click', () => this.close(true));

        // Close on overlay click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close(false);
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                this.close(false);
            }
        });
    }

    /**
     * Show the confirmation modal
     * @param {string|Object} options - Message string or options object
     * @returns {Promise<boolean>} - Resolves to true if confirmed, false otherwise
     */
    show(options) {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;

            // Normalize options
            const opts = typeof options === 'string'
                ? { message: options }
                : options;

            const {
                title = 'Confirm',
                message = 'Are you sure?',
                confirmText = 'Confirm',
                cancelText = 'Cancel',
                type = 'default' // 'default', 'danger', 'warning', 'info'
            } = opts;

            // Update content
            this.modal.querySelector('.confirm-modal-title').textContent = title;
            this.modal.querySelector('.confirm-modal-message').textContent = message;
            this.modal.querySelector('.btn-confirm').textContent = confirmText;
            this.modal.querySelector('.btn-cancel').textContent = cancelText;

            // Update type/style
            const modalEl = this.modal.querySelector('.confirm-modal');
            modalEl.className = 'confirm-modal';
            if (type !== 'default') {
                modalEl.classList.add(`confirm-modal-${type}`);
            }

            // Update icon based on type
            const iconEl = this.modal.querySelector('.confirm-modal-icon');
            iconEl.innerHTML = this.getIcon(type);

            // Update confirm button style
            const confirmBtn = this.modal.querySelector('.btn-confirm');
            confirmBtn.className = 'btn btn-confirm';
            if (type === 'danger') {
                confirmBtn.classList.add('btn-danger');
            } else if (type === 'warning') {
                confirmBtn.classList.add('btn-warning');
            } else {
                confirmBtn.classList.add('btn-primary');
            }

            // Show modal
            this.modal.classList.add('active');

            // Focus confirm button
            this.modal.querySelector('.btn-confirm').focus();
        });
    }

    /**
     * Close the modal
     * @param {boolean} result - The result to resolve with
     */
    close(result) {
        this.modal.classList.remove('active');
        if (this.resolvePromise) {
            this.resolvePromise(result);
            this.resolvePromise = null;
        }
    }

    /**
     * Get icon SVG based on type
     */
    getIcon(type) {
        const icons = {
            default: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
            </svg>`,
            danger: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>`,
            warning: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>`,
            info: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>`
        };
        return icons[type] || icons.default;
    }
}

// Export singleton instance
const confirmModal = new ConfirmModal();
export default confirmModal;
