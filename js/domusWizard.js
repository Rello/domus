/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

(function() {
    'use strict';

    window.Domus = window.Domus || {};

    function createElement(tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) {
            element.className = className;
        }
        if (typeof text === 'string') {
            element.textContent = text;
        }
        return element;
    }

    function normalizeFeature(feature) {
        return {
            title: feature && feature.title ? feature.title : '',
            body: feature && feature.body ? feature.body : '',
            iconClass: feature && feature.iconClass ? feature.iconClass : 'domus-icon-info'
        };
    }

    function normalizeSlide(slide) {
        const normalized = {
            layout: slide && slide.layout ? slide.layout : 'detail',
            title: slide && slide.title ? slide.title : '',
            intro: slide && slide.intro ? slide.intro : '',
            body: slide && slide.body ? slide.body : '',
            bullets: Array.isArray(slide && slide.bullets) ? slide.bullets.filter(Boolean) : [],
            features: Array.isArray(slide && slide.features) ? slide.features.map(normalizeFeature) : [],
            mediaLabel: slide && slide.mediaLabel ? slide.mediaLabel : '',
            mediaHint: slide && slide.mediaHint ? slide.mediaHint : '',
            mediaSrc: slide && slide.mediaSrc ? slide.mediaSrc : '',
            primaryLabel: slide && slide.primaryLabel ? slide.primaryLabel : '',
            secondaryLabel: slide && slide.secondaryLabel ? slide.secondaryLabel : ''
        };

        return normalized;
    }

    function createWizard(config) {
        const options = Object.assign({
            brandName: '',
            brandLogo: '',
            closeLabel: 'Close',
            previousLabel: 'Previous',
            nextLabel: 'Next',
            finishLabel: 'Finish',
            slides: [],
            onClose: null,
            onFinish: null
        }, config || {});

        const slides = Array.isArray(options.slides) ? options.slides.map(normalizeSlide) : [];
        if (!slides.length) {
            return null;
        }

        let currentIndex = 0;
        let isOpen = false;
        let backdrop = null;
        let contentHost = null;
        let dotsHost = null;
        let previousButton = null;
        let nextButton = null;
        let finishButton = null;
        let closeButton = null;
        let previousActiveElement = null;

        function close(reason) {
            if (!isOpen || !backdrop) {
                return;
            }

            document.removeEventListener('keydown', onKeyDown);
            backdrop.remove();
            backdrop = null;
            isOpen = false;

            if (previousActiveElement && document.body.contains(previousActiveElement)) {
                previousActiveElement.focus();
            }

            if (typeof options.onClose === 'function') {
                options.onClose(reason || 'close', currentIndex, slides[currentIndex]);
            }
        }

        function finish() {
            if (typeof options.onFinish === 'function') {
                options.onFinish(currentIndex, slides[currentIndex]);
            }
            close('finish');
        }

        function renderFeatureOverview(slide) {
            const wrapper = createElement('div', 'domus-guidance-page domus-guidance-page-overview');
            const intro = createElement('p', 'domus-guidance-overview-intro', slide.intro);
            wrapper.appendChild(intro);

            const grid = createElement('div', 'domus-guidance-feature-grid');
            slide.features.forEach(function(feature, index) {
                const item = createElement('div', 'domus-guidance-feature');
                const icon = createElement('div', 'domus-guidance-feature-icon');
                const iconGlyph = createElement('span', 'domus-icon ' + feature.iconClass);
                iconGlyph.setAttribute('aria-hidden', 'true');
                icon.appendChild(iconGlyph);

                const title = createElement('h3', 'domus-guidance-feature-title', feature.title);
                const body = createElement('p', 'domus-guidance-feature-body', feature.body);

                item.appendChild(icon);
                item.appendChild(title);
                if (feature.body) {
                    item.appendChild(body);
                }
                grid.appendChild(item);
            });

            wrapper.appendChild(grid);
            return wrapper;
        }

        function renderMedia(slide) {
            if (slide.mediaSrc) {
                const image = createElement('img', 'domus-guidance-media-image');
                image.src = slide.mediaSrc;
                image.alt = slide.mediaLabel || '';
                return image;
            }

            const placeholder = createElement('div', 'domus-guidance-media-placeholder');
            const frame = createElement('div', 'domus-guidance-media-frame');
            const headline = createElement('div', 'domus-guidance-media-label', slide.mediaLabel);
            const hint = createElement('div', 'domus-guidance-media-hint', slide.mediaHint);
            frame.appendChild(headline);
            if (slide.mediaHint) {
                frame.appendChild(hint);
            }
            placeholder.appendChild(frame);
            return placeholder;
        }

        function renderDetail(slide) {
            const wrapper = createElement('div', 'domus-guidance-page domus-guidance-page-detail');
            const mediaColumn = createElement('div', 'domus-guidance-detail-media');
            const textColumn = createElement('div', 'domus-guidance-detail-copy');

            mediaColumn.appendChild(renderMedia(slide));

            const title = createElement('h2', 'domus-guidance-detail-title', slide.title);
            const intro = createElement('p', 'domus-guidance-detail-intro', slide.intro);
            const bullets = createElement('ul', 'domus-guidance-detail-bullets');

            slide.bullets.forEach(function(text) {
                const item = createElement('li', 'domus-guidance-detail-bullet');
                item.textContent = text;
                bullets.appendChild(item);
            });

            textColumn.appendChild(title);
            if (slide.intro) {
                textColumn.appendChild(intro);
            }
            if (slide.body) {
                textColumn.appendChild(createElement('p', 'domus-guidance-detail-body', slide.body));
            }
            textColumn.appendChild(bullets);

            if (slide.primaryLabel) {
                const actions = createElement('div', 'domus-guidance-detail-actions');
                const primaryButton = createElement('button', 'domus-guidance-detail-action primary', slide.primaryLabel);
                primaryButton.type = 'button';
                primaryButton.addEventListener('click', function() {
                    finish();
                });
                actions.appendChild(primaryButton);
                textColumn.appendChild(actions);
            }

            wrapper.appendChild(mediaColumn);
            wrapper.appendChild(textColumn);
            return wrapper;
        }

        function renderPage(slide) {
            contentHost.innerHTML = '';
            contentHost.appendChild(slide.layout === 'featureGrid' ? renderFeatureOverview(slide) : renderDetail(slide));
        }

        function renderDots() {
            dotsHost.innerHTML = '';
            slides.forEach(function(slide, index) {
                const dot = createElement('button', 'domus-guidance-dot');
                dot.type = 'button';
                dot.setAttribute('aria-label', slide.title || String(index + 1));
                if (index === currentIndex) {
                    dot.classList.add('is-active');
                }
                dot.addEventListener('click', function() {
                    currentIndex = index;
                    render();
                });
                dotsHost.appendChild(dot);
            });
        }

        function renderNavigation() {
            previousButton.classList.toggle('is-disabled', currentIndex === 0);
            previousButton.setAttribute('aria-disabled', currentIndex === 0 ? 'true' : 'false');
            nextButton.hidden = currentIndex === slides.length - 1;
            finishButton.hidden = true;
            finishButton.textContent = slides[currentIndex].primaryLabel || options.finishLabel;
        }

        function render() {
            renderPage(slides[currentIndex]);
            renderDots();
            renderNavigation();
        }

        function onKeyDown(event) {
            if (!isOpen) {
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                close('escape');
                return;
            }

            if (event.key === 'ArrowRight' && currentIndex < slides.length - 1) {
                event.preventDefault();
                currentIndex += 1;
                render();
                return;
            }

            if (event.key === 'ArrowLeft' && currentIndex > 0) {
                event.preventDefault();
                currentIndex -= 1;
                render();
            }
        }

        function buildHeader() {
            const header = createElement('div', 'domus-guidance-header');
            const brand = createElement('div', 'domus-guidance-brand');

            if (options.brandLogo) {
                const logo = createElement('img', 'domus-guidance-brand-logo');
                logo.src = options.brandLogo;
                logo.alt = options.brandName || '';
                brand.appendChild(logo);
            }

            if (options.brandName) {
                brand.appendChild(createElement('div', 'domus-guidance-brand-name', options.brandName));
            }

            header.appendChild(brand);
            return header;
        }

        function buildDialog() {
            previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

            backdrop = createElement('div', 'domus-guidance-backdrop');
            backdrop.setAttribute('role', 'presentation');

            const dialog = createElement('div', 'domus-guidance-dialog');
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-label', options.brandName || 'Domus');

            closeButton = createElement('span', 'domus-guidance-close');
            closeButton.setAttribute('role', 'button');
            closeButton.setAttribute('tabindex', '0');
            closeButton.setAttribute('aria-label', options.closeLabel);
            closeButton.innerHTML = '<span class="domus-guidance-close-icon" aria-hidden="true"></span>';
            closeButton.addEventListener('click', function() {
                close('close');
            });
            closeButton.addEventListener('keydown', function(event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    close('close');
                }
            });

            previousButton = createElement('button', 'domus-guidance-nav domus-guidance-nav-previous');
            previousButton.type = 'button';
            previousButton.setAttribute('aria-label', options.previousLabel);
            previousButton.innerHTML = '<span class="domus-icon domus-icon-back" aria-hidden="true"></span>';
            previousButton.addEventListener('click', function() {
                if (currentIndex === 0) {
                    return;
                }
                currentIndex -= 1;
                render();
            });

            nextButton = createElement('button', 'domus-guidance-nav domus-guidance-nav-next');
            nextButton.type = 'button';
            nextButton.setAttribute('aria-label', options.nextLabel);
            nextButton.innerHTML = '<span class="domus-icon domus-icon-arrow-right" aria-hidden="true"></span>';
            nextButton.addEventListener('click', function() {
                if (currentIndex >= slides.length - 1) {
                    return;
                }
                currentIndex += 1;
                render();
            });

            const shell = createElement('div', 'domus-guidance-shell');
            shell.appendChild(buildHeader());

            contentHost = createElement('div', 'domus-guidance-content');
            shell.appendChild(contentHost);

            const footer = createElement('div', 'domus-guidance-footer');
            dotsHost = createElement('div', 'domus-guidance-dots');
            finishButton = createElement('button', 'domus-guidance-finish');
            finishButton.type = 'button';
            finishButton.addEventListener('click', finish);
            footer.appendChild(dotsHost);
            footer.appendChild(finishButton);
            shell.appendChild(footer);

            dialog.appendChild(closeButton);
            dialog.appendChild(previousButton);
            dialog.appendChild(shell);
            dialog.appendChild(nextButton);
            backdrop.appendChild(dialog);
            document.body.appendChild(backdrop);

            backdrop.addEventListener('click', function(event) {
                if (event.target === backdrop) {
                    close('backdrop');
                }
            });

            document.addEventListener('keydown', onKeyDown);
            isOpen = true;
            render();
            closeButton.focus();
        }

        return {
            open: function() {
                if (isOpen) {
                    return;
                }
                currentIndex = 0;
                buildDialog();
            },
            close: close
        };
    }

    Domus.Wizard = (function() {
        let welcomeWizard = null;

        function readConfig() {
            const configEl = document.getElementById('domus-wizard-config');
            if (!configEl) {
                return null;
            }

            try {
                const parsed = JSON.parse(configEl.textContent || '{}');
                return parsed && typeof parsed === 'object' ? parsed : null;
            } catch (error) {
                return null;
            }
        }

        function hasSeenWelcome() {
            const value = Domus.Utils.getInitialState('wizard');
            return value === 1 || value === '1' || value === true;
        }

        function buildWelcomeWizard() {
            const config = readConfig();
            if (!config) {
                return null;
            }

            return createWizard({
                brandName: config.brandName || t('domus', 'Domus'),
                brandLogo: config.brandLogo || '',
                closeLabel: config.closeLabel || t('domus', 'Close'),
                previousLabel: config.previousLabel || t('domus', 'Previous'),
                nextLabel: config.nextLabel || t('domus', 'Next'),
                finishLabel: config.finishLabel || t('domus', 'Open dashboard'),
                slides: Array.isArray(config.slides) ? config.slides : [],
                onFinish: function() {
                    Domus.Api.updateSettings({ wizard: 1 })
                        .catch(function(error) {
                            console.warn('Failed to persist wizard completion state:', error);
                        })
                        .finally(function() {
                            if (window.Domus && Domus.Router && typeof Domus.Router.navigate === 'function') {
                                Domus.Router.navigate('dashboard');
                            }
                        });
                }
            });
        }

        function ensureWizard() {
            if (!welcomeWizard) {
                welcomeWizard = buildWelcomeWizard();
            }
            return welcomeWizard;
        }

        function show(options) {
            const settings = options || {};
            if (!settings.force && hasSeenWelcome()) {
                return;
            }

            const wizard = ensureWizard();
            if (!wizard) {
                return;
            }

            wizard.open();
        }

        function init() {
            window.setTimeout(function() {
                show();
            }, 400);
        }

        function resetState() {
            return Domus.Api.updateSettings({ wizard: 0 }).catch(function(error) {
                console.warn('Failed to reset wizard completion state:', error);
            });
        }

        return {
            init: init,
            show: function() {
                show({ force: true });
            },
            resetState: resetState,
            create: createWizard
        };
    })();

    document.addEventListener('DOMContentLoaded', function() {
        if (Domus.Wizard && typeof Domus.Wizard.init === 'function') {
            Domus.Wizard.init();
        }
    });
})();
