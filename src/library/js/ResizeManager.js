/**
 * Resize Manager - Handles resizable panes with localStorage persistence
 */
class ResizeManager {
    constructor() {
        this.storageKey = 'qb-panel-sizes';
        this.isResizing = false;
        this.currentResizer = null;
        this.startX = 0;
        this.startY = 0;
        this.startWidth = 0;
        this.startHeight = 0;

        this.init();
    }

    init() {
        this.loadSizes();
        this.bindResizers();
    }

    loadSizes() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const sizes = JSON.parse(saved);

                // Apply sidebar width
                if (sizes.sidebarWidth) {
                    const sidebar = document.getElementById('sidebar');
                    if (sidebar) {
                        sidebar.style.width = `${sizes.sidebarWidth}px`;
                    }
                }

                // Apply bottom panel height
                if (sizes.bottomPanelHeight) {
                    const bottomPanel = document.getElementById('bottom-panel');
                    if (bottomPanel) {
                        bottomPanel.style.height = `${sizes.bottomPanelHeight}px`;
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to load panel sizes:', e);
        }
    }

    saveSizes() {
        try {
            const sidebar = document.getElementById('sidebar');
            const bottomPanel = document.getElementById('bottom-panel');

            const sizes = {
                sidebarWidth: sidebar ? sidebar.offsetWidth : null,
                bottomPanelHeight: bottomPanel ? bottomPanel.offsetHeight : null
            };

            localStorage.setItem(this.storageKey, JSON.stringify(sizes));
        } catch (e) {
            console.warn('Failed to save panel sizes:', e);
        }
    }

    bindResizers() {
        // Sidebar resizer (horizontal)
        const sidebarResizer = document.getElementById('sidebar-resizer');
        if (sidebarResizer) {
            sidebarResizer.addEventListener('mousedown', (e) => this.startResize(e, 'sidebar'));
        }

        // Bottom panel resizer (vertical)
        const bottomResizer = document.getElementById('bottom-resizer');
        if (bottomResizer) {
            bottomResizer.addEventListener('mousedown', (e) => this.startResize(e, 'bottom'));
        }

        // Global mouse events
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', () => this.stopResize());
    }

    startResize(e, type) {
        e.preventDefault();
        this.isResizing = true;
        this.currentResizer = type;
        this.startX = e.clientX;
        this.startY = e.clientY;

        if (type === 'sidebar') {
            const sidebar = document.getElementById('sidebar');
            this.startWidth = sidebar ? sidebar.offsetWidth : 0;
            document.getElementById('sidebar-resizer')?.classList.add('resizing');
        } else if (type === 'bottom') {
            const bottomPanel = document.getElementById('bottom-panel');
            this.startHeight = bottomPanel ? bottomPanel.offsetHeight : 0;
            document.getElementById('bottom-resizer')?.classList.add('resizing');
        }

        document.body.style.cursor = type === 'sidebar' ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
    }

    onMouseMove(e) {
        if (!this.isResizing) return;

        if (this.currentResizer === 'sidebar') {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                const delta = e.clientX - this.startX;
                const newWidth = Math.max(180, Math.min(500, this.startWidth + delta));
                sidebar.style.width = `${newWidth}px`;
            }
        } else if (this.currentResizer === 'bottom') {
            const bottomPanel = document.getElementById('bottom-panel');
            if (bottomPanel) {
                const delta = this.startY - e.clientY;
                const maxHeight = window.innerHeight * 0.7;
                const newHeight = Math.max(100, Math.min(maxHeight, this.startHeight + delta));
                bottomPanel.style.height = `${newHeight}px`;
            }
        }
    }

    stopResize() {
        if (!this.isResizing) return;

        this.isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        document.getElementById('sidebar-resizer')?.classList.remove('resizing');
        document.getElementById('bottom-resizer')?.classList.remove('resizing');

        // Save sizes after resize
        this.saveSizes();

        this.currentResizer = null;
    }
}

// Export singleton
const resizeManager = new ResizeManager();
export default resizeManager;
