/**
 * ThemeManager - Handles light/dark/system theme switching
 *
 * Modes:
 * - light: Always light theme
 * - dark: Always dark theme
 * - system: Follows OS preference
 */

class ThemeManager {
    constructor() {
        this.storageKey = 'qb-theme';
        this.themes = ['light', 'dark', 'system'];
        this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        this.init();
    }

    init() {
        // Apply saved theme or default to system
        const savedTheme = this.getSavedTheme();
        this.applyTheme(savedTheme, false);

        // Listen for OS theme changes
        this.mediaQuery.addEventListener('change', (e) => {
            if (this.getCurrentMode() === 'system') {
                this.applyTheme('system', true);
            }
        });
    }

    /**
     * Get saved theme from localStorage
     */
    getSavedTheme() {
        const saved = localStorage.getItem(this.storageKey);
        return this.themes.includes(saved) ? saved : 'system';
    }

    /**
     * Get current theme mode
     */
    getCurrentMode() {
        return this.getSavedTheme();
    }

    /**
     * Get the actual theme being displayed (light or dark)
     */
    getActiveTheme() {
        const mode = this.getCurrentMode();
        if (mode === 'system') {
            return this.mediaQuery.matches ? 'dark' : 'light';
        }
        return mode;
    }

    /**
     * Set theme mode
     */
    setTheme(mode) {
        if (!this.themes.includes(mode)) {
            console.warn(`Invalid theme mode: ${mode}`);
            return;
        }
        localStorage.setItem(this.storageKey, mode);
        this.applyTheme(mode, true);
    }

    /**
     * Cycle through themes: light -> dark -> system -> light
     */
    cycleTheme() {
        const currentIndex = this.themes.indexOf(this.getCurrentMode());
        const nextIndex = (currentIndex + 1) % this.themes.length;
        this.setTheme(this.themes[nextIndex]);
    }

    /**
     * Apply theme to document
     */
    applyTheme(mode, animate = true) {
        const html = document.documentElement;

        // Add transition class for smooth animation
        if (animate) {
            html.classList.add('theme-transition');
            setTimeout(() => {
                html.classList.remove('theme-transition');
            }, 300);
        }

        // Determine actual theme
        let actualTheme = mode;
        if (mode === 'system') {
            actualTheme = this.mediaQuery.matches ? 'dark' : 'light';
        }

        // Apply theme attribute
        html.setAttribute('data-theme', actualTheme);

        // Update meta theme-color for mobile browsers
        this.updateMetaThemeColor(actualTheme);

        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('themechange', {
            detail: { mode, activeTheme: actualTheme }
        }));

        // Update toggle button state
        this.updateToggleButton(mode);
    }

    /**
     * Update meta theme-color for mobile browsers
     */
    updateMetaThemeColor(theme) {
        let metaTheme = document.querySelector('meta[name="theme-color"]');
        if (!metaTheme) {
            metaTheme = document.createElement('meta');
            metaTheme.name = 'theme-color';
            document.head.appendChild(metaTheme);
        }
        metaTheme.content = theme === 'dark' ? '#1f2937' : '#ffffff';
    }

    /**
     * Update toggle button active state
     */
    updateToggleButton(mode) {
        const buttons = document.querySelectorAll('.theme-toggle .theme-btn');
        buttons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === mode);
        });
    }

    /**
     * Bind event listeners to theme toggle buttons
     */
    bindToggleButtons() {
        const buttons = document.querySelectorAll('.theme-toggle .theme-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setTheme(btn.dataset.theme);
            });
        });

        // Initial state
        this.updateToggleButton(this.getCurrentMode());
    }
}

export default ThemeManager;
