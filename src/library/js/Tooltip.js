/**
 * Tooltip - Custom tooltip system
 *
 * Usage:
 *   import tooltip from './Tooltip.js';
 *
 *   // Initialize on elements with data-tooltip attribute
 *   tooltip.init();
 *
 *   // Or manually show/hide
 *   tooltip.show(element, 'Tooltip text', 'top');
 *   tooltip.hide();
 *
 * HTML Usage:
 *   <button data-tooltip="Click to save" data-tooltip-position="top">Save</button>
 *   <span data-tooltip="More info here" data-tooltip-position="right">Info</span>
 */

class Tooltip {
    constructor() {
        this.tooltip = null;
        this.currentTarget = null;
        this.showTimeout = null;
        this.hideTimeout = null;
        this.delay = 300; // Delay before showing tooltip
        this.suppressUntil = 0; // Timestamp until which tooltips are suppressed
        this.init();
    }

    init() {
        // Create tooltip element
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'custom-tooltip';
        this.tooltip.innerHTML = `
            <div class="custom-tooltip-content"></div>
            <div class="custom-tooltip-arrow"></div>
        `;
        document.body.appendChild(this.tooltip);

        // Bind global events for data-tooltip attributes
        this.bindGlobalEvents();
    }

    /**
     * Bind events for all elements with data-tooltip
     */
    bindGlobalEvents() {
        // Helper to safely get closest element with data-tooltip
        const getTooltipTarget = (e) => {
            if (!e.target || typeof e.target.closest !== 'function') {
                return null;
            }
            return e.target.closest('[data-tooltip]');
        };

        // Use event delegation for better performance
        document.addEventListener('mouseenter', (e) => {
            const target = getTooltipTarget(e);
            if (target) {
                this.handleMouseEnter(target);
            }
        }, true);

        document.addEventListener('mouseleave', (e) => {
            const target = getTooltipTarget(e);
            if (target) {
                this.handleMouseLeave(target);
            }
        }, true);

        document.addEventListener('focus', (e) => {
            const target = getTooltipTarget(e);
            if (target) {
                this.handleMouseEnter(target);
            }
        }, true);

        document.addEventListener('blur', (e) => {
            const target = getTooltipTarget(e);
            if (target) {
                this.handleMouseLeave(target);
            }
        }, true);

        // Hide tooltip on scroll
        document.addEventListener('scroll', () => {
            this.hide();
        }, true);

        // Hide tooltip when switching browser tabs
        document.addEventListener('visibilitychange', () => {
            this.hide();
        });

        // Hide tooltip on click (e.g., when clicking tabs, buttons, etc.)
        document.addEventListener('click', () => {
            this.hide();
            // Suppress tooltips for a short period after clicking to prevent flickering
            this.suppressUntil = Date.now() + 500;
        }, true);

        // Hide tooltip on keydown (e.g., Escape key or tab navigation)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.key === 'Tab') {
                this.hide();
            }
        });
    }

    /**
     * Handle mouse enter on tooltip target
     */
    handleMouseEnter(target) {
        clearTimeout(this.hideTimeout);

        this.showTimeout = setTimeout(() => {
            // Don't show if suppressed (e.g., after a click)
            if (Date.now() < this.suppressUntil) {
                return;
            }

            const text = target.getAttribute('data-tooltip');
            const position = target.getAttribute('data-tooltip-position') || 'top';
            if (text) {
                this.show(target, text, position);
            }
        }, this.delay);
    }

    /**
     * Handle mouse leave on tooltip target
     */
    handleMouseLeave(target) {
        clearTimeout(this.showTimeout);

        this.hideTimeout = setTimeout(() => {
            this.hide();
        }, 100);
    }

    /**
     * Show tooltip
     * @param {HTMLElement} target - Element to attach tooltip to
     * @param {string} text - Tooltip text
     * @param {string} position - Position: 'top', 'bottom', 'left', 'right'
     */
    show(target, text, position = 'top') {
        this.currentTarget = target;

        // Set content
        this.tooltip.querySelector('.custom-tooltip-content').textContent = text;

        // Reset classes
        this.tooltip.className = 'custom-tooltip';
        this.tooltip.classList.add(`custom-tooltip-${position}`);

        // Show tooltip (needed for size calculation)
        this.tooltip.classList.add('visible');

        // Position tooltip
        this.position(target, position);
    }

    /**
     * Position the tooltip relative to target
     */
    position(target, position) {
        const targetRect = target.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        const gap = 8; // Gap between target and tooltip

        let top, left;

        switch (position) {
            case 'top':
                top = targetRect.top + scrollY - tooltipRect.height - gap;
                left = targetRect.left + scrollX + (targetRect.width - tooltipRect.width) / 2;
                break;
            case 'bottom':
                top = targetRect.bottom + scrollY + gap;
                left = targetRect.left + scrollX + (targetRect.width - tooltipRect.width) / 2;
                break;
            case 'left':
                top = targetRect.top + scrollY + (targetRect.height - tooltipRect.height) / 2;
                left = targetRect.left + scrollX - tooltipRect.width - gap;
                break;
            case 'right':
                top = targetRect.top + scrollY + (targetRect.height - tooltipRect.height) / 2;
                left = targetRect.right + scrollX + gap;
                break;
            default:
                top = targetRect.top + scrollY - tooltipRect.height - gap;
                left = targetRect.left + scrollX + (targetRect.width - tooltipRect.width) / 2;
        }

        // Keep tooltip within viewport
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };

        // Adjust horizontal position
        if (left < scrollX + gap) {
            left = scrollX + gap;
        } else if (left + tooltipRect.width > scrollX + viewport.width - gap) {
            left = scrollX + viewport.width - tooltipRect.width - gap;
        }

        // Adjust vertical position
        if (top < scrollY + gap) {
            // Flip to bottom if too close to top
            if (position === 'top') {
                top = targetRect.bottom + scrollY + gap;
                this.tooltip.classList.remove('custom-tooltip-top');
                this.tooltip.classList.add('custom-tooltip-bottom');
            } else {
                top = scrollY + gap;
            }
        } else if (top + tooltipRect.height > scrollY + viewport.height - gap) {
            // Flip to top if too close to bottom
            if (position === 'bottom') {
                top = targetRect.top + scrollY - tooltipRect.height - gap;
                this.tooltip.classList.remove('custom-tooltip-bottom');
                this.tooltip.classList.add('custom-tooltip-top');
            } else {
                top = scrollY + viewport.height - tooltipRect.height - gap;
            }
        }

        this.tooltip.style.top = `${top}px`;
        this.tooltip.style.left = `${left}px`;
    }

    /**
     * Hide tooltip
     */
    hide() {
        clearTimeout(this.showTimeout);
        this.tooltip.classList.remove('visible');
        this.currentTarget = null;
    }

    /**
     * Update tooltip text for an element
     */
    update(element, text) {
        element.setAttribute('data-tooltip', text);
        if (this.currentTarget === element && this.tooltip.classList.contains('visible')) {
            this.tooltip.querySelector('.custom-tooltip-content').textContent = text;
        }
    }

    /**
     * Remove tooltip from an element
     */
    remove(element) {
        element.removeAttribute('data-tooltip');
        element.removeAttribute('data-tooltip-position');
        if (this.currentTarget === element) {
            this.hide();
        }
    }
}

// Export singleton instance
const tooltip = new Tooltip();
export default tooltip;
