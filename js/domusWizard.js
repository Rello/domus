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
            closeLabel: t('domus', 'Close'),
            previousLabel: t('domus', 'Previous'),
            nextLabel: t('domus', 'Next'),
            finishLabel: t('domus', 'Finish'),
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
        let modal = null;
        let contentHost = null;
        let dotsHost = null;
        let previousButton = null;
        let nextButton = null;
        let finishButton = null;

        function close(reason) {
            if (!isOpen || !modal) return;
            modal.close(reason || 'close');
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
            previousButton.disabled = currentIndex === 0;
            nextButton.hidden = currentIndex === slides.length - 1;
            finishButton.hidden = currentIndex !== slides.length - 1 && !slides[currentIndex].primaryLabel;
            finishButton.textContent = slides[currentIndex].primaryLabel || options.finishLabel;
            if (document.activeElement === nextButton && nextButton.hidden) finishButton.focus();
            if (document.activeElement === previousButton && previousButton.disabled) nextButton.focus();
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

        function buildDialog() {
            const content = createElement('div');
            contentHost = createElement('div', 'domus-guidance-content');
            dotsHost = createElement('div', 'domus-guidance-dots');
            content.appendChild(contentHost);
            content.appendChild(dotsHost);

            const actions = createElement('div', 'domus-form-actions');
            const closeButton = createElement('button', '', options.closeLabel);
            closeButton.type = 'button';
            closeButton.addEventListener('click', () => close('close'));
            previousButton = createElement('button', '', options.previousLabel);
            previousButton.type = 'button';
            previousButton.addEventListener('click', () => {
                if (currentIndex > 0) { currentIndex--; render(); }
            });
            nextButton = createElement('button', 'primary', options.nextLabel);
            nextButton.type = 'button';
            nextButton.addEventListener('click', () => {
                if (currentIndex < slides.length - 1) { currentIndex++; render(); }
            });
            finishButton = createElement('button', 'primary');
            finishButton.type = 'button';
            finishButton.addEventListener('click', finish);
            actions.append(closeButton, previousButton, nextButton, finishButton);
            content.appendChild(actions);
            isOpen = true;
            render();
            modal = Domus.UI.openModal({
                title: options.brandName || t('domus', 'Domus'),
                size: 'welcome',
                content,
                onClose: reason => {
                    isOpen = false;
                    modal = null;
                    if (typeof options.onClose === 'function') {
                        options.onClose(reason, currentIndex, slides[currentIndex]);
                    }
                }
            });
            modal.modalEl.addEventListener('keydown', onKeyDown);
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
                if (Domus.state.managementContext?.mode !== 'legacy') {
                    return;
                }
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
