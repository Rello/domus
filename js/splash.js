(function() {
    'use strict';

    function initSplash(splash) {
        const appContent = splash.closest('#app-content');
        if (appContent) {
            appContent.classList.add('has-splash');
        }

        const splashName = splash.querySelector('[data-splash-name]');
        if (splashName && !splashName.textContent.trim()) {
            splashName.textContent = t('domus', 'Domus for Nextcloud');
        }

        splash.style.setProperty('--splash-draw-ms', `${splash.dataset.drawMs}ms`);
        splash.style.setProperty('--splash-reveal-ms', `${splash.dataset.revealMs}ms`);
        splash.style.setProperty('--splash-hold-ms', `${splash.dataset.holdMs}ms`);
        splash.style.setProperty('--splash-fade-ms', `${splash.dataset.fadeMs}ms`);

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
