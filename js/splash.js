(function() {
    'use strict';

    function parseDuration(value, fallback) {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    }

    function initSplash(splash) {
        const appContent = splash.closest('#app-content');
        if (appContent) {
            appContent.classList.add('has-splash');
        }

        const splashName = splash.querySelector('[data-splash-name]');
        if (splashName && !splashName.textContent.trim()) {
            splashName.textContent = t('domus', 'Domus for Nextcloud');
        }

        const drawMs = parseDuration(splash.dataset.drawMs, 2000);
        const revealMs = parseDuration(splash.dataset.revealMs, 800);
        const holdMs = parseDuration(splash.dataset.holdMs, 1000);
        const fadeMs = parseDuration(splash.dataset.fadeMs, 320);

        splash.style.setProperty('--splash-draw-ms', `${drawMs}ms`);
        splash.style.setProperty('--splash-reveal-ms', `${revealMs}ms`);
        splash.style.setProperty('--splash-hold-ms', `${holdMs}ms`);
        splash.style.setProperty('--splash-fade-ms', `${fadeMs}ms`);

        window.requestAnimationFrame(() => {
            splash.classList.add('is-running');
        });
    }

    function initAvailableSplashes() {
        const splashes = document.querySelectorAll('[data-splash]:not([data-splash-ready])');
        splashes.forEach(splash => {
            splash.setAttribute('data-splash-ready', '1');
            initSplash(splash);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAvailableSplashes);
    } else {
        initAvailableSplashes();
    }

    const observer = new MutationObserver(() => {
        initAvailableSplashes();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
})();
