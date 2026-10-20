/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

(async () => {
    const browser = await chromium.launch({headless: true});
    try {
        for (const width of [1280, 390]) {
            const page = await browser.newPage({viewport: {width, height: 640}});
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.setContent('<button id="launcher">Open</button>');
            await page.evaluate(() => {
                window.t = (app, text) => text;
                window.OC = {generateUrl: path => path};
            });
            // Approximate host defaults so the fixture catches leaked native button borders.
            await page.addStyleTag({content: ':root { --color-main-background: #fff; --color-border: #999; --color-primary: #12426e; --color-primary-text: #fff; } button { border: 2px solid #222; border-radius: 20px; }'});
            await page.addStyleTag({path: 'css/style.css'});
            await page.addStyleTag({path: 'css/wizard.css'});
            await page.addScriptTag({path: 'js/domusCoreBundle.js'});
            await page.addScriptTag({path: 'js/domusWizard.js'});
            await page.locator('#launcher').focus();
            await page.evaluate(() => {
                window.saved = 0;
                window.formModal = Domus.UI.openModal({title: 'Form', content:
                    '<form><input name="value" required><div style="height:1000px"></div><div class="domus-form-actions">' +
                    '<button type="submit">Save</button><button type="button" id="cancel">Cancel</button></div></form>'});
                const form = formModal.modalEl.querySelector('form');
                form.onsubmit = event => { event.preventDefault(); saved++; };
                formModal.modalEl.querySelector('#cancel').onclick = formModal.requestClose;
                formModal.protectChanges();
            });
            const dialog = page.getByRole('dialog', {name: 'Form', exact: true});
            assert.equal(await dialog.locator(':scope > .domus-modal-header').count(), 1);
            assert.equal(await dialog.locator(':scope > .domus-modal-footer').count(), 1);
            assert.equal(await dialog.locator('.domus-modal-body button').count(), 0);
            const borders = await dialog.evaluate(el => {
                const modal = getComputedStyle(el);
                const footer = getComputedStyle(el.querySelector(':scope > .domus-modal-footer'));
                const button = getComputedStyle(el.querySelector('.domus-modal-footer button'));
                const header = getComputedStyle(el.querySelector('.domus-modal-header'));
                return {
                    modalBorder: modal.borderBottomWidth + ' ' + modal.borderBottomColor,
                    buttonBorder: button.borderBottomWidth + ' ' + button.borderBottomColor,
                    separator: footer.borderTopWidth + ' ' + footer.borderTopColor,
                    headerSeparator: header.borderBottomWidth + ' ' + header.borderBottomColor,
                    modalRadius: modal.borderBottomLeftRadius,
                    footerBackground: footer.backgroundColor,
                    buttonRadius: button.borderBottomLeftRadius
                };
            });
            assert.equal(borders.buttonBorder, borders.modalBorder);
            assert.equal(borders.separator, borders.modalBorder);
            assert.equal(borders.headerSeparator, borders.modalBorder);
            assert.equal(borders.footerBackground, 'rgba(0, 0, 0, 0)', 'Footer uses the modal background');
            assert.equal(borders.buttonRadius, borders.modalRadius);
            const alignment = await dialog.evaluate(el => {
                const header = el.querySelector('.domus-modal-header');
                const footer = el.querySelector('.domus-modal-footer');
                const title = header.querySelector('h3').getBoundingClientRect();
                const footerButton = footer.querySelector('button:last-child').getBoundingClientRect();
                const glyph = document.createRange();
                glyph.selectNodeContents(header.querySelector('.domus-modal-close'));
                const rect = el.getBoundingClientRect();
                return {left: title.left - rect.left, right: rect.right - footerButton.right, close: rect.right - glyph.getBoundingClientRect().right};
            });
            assert.ok(Math.abs(alignment.left - alignment.right) <= 1, 'Title and footer actions have equal outer offsets');
            assert.ok(Math.abs(alignment.left - alignment.close) <= 1, 'Close glyph has the same outer offset as the title');
            const save = dialog.getByRole('button', {name: 'Save', exact: true});
            await save.click();
            assert.equal(await page.evaluate(() => saved), 0, 'Required-field validation still applies');
            await dialog.locator('input').fill('Draft');
            await dialog.locator('input').press('Enter');
            assert.equal(await page.evaluate(() => saved), 1, 'Enter submits through the associated footer button');
            await save.click();
            assert.equal(await page.evaluate(() => saved), 2, 'Footer button submits its form');
            const geometry = await dialog.evaluate(el => {
                const footer = el.querySelector(':scope > .domus-modal-footer').getBoundingClientRect();
                const body = el.querySelector('.domus-modal-body').getBoundingClientRect();
                return {bottom: footer.bottom, top: footer.top, bodyBottom: body.bottom, width: el.scrollWidth, clientWidth: el.clientWidth};
            });
            assert.ok(geometry.bottom <= 640 && geometry.top >= geometry.bodyBottom - 1);
            assert.ok(geometry.width <= geometry.clientWidth + 1);
            await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
            const confirmation = page.getByRole('dialog', {name: 'Discard changes?', exact: true});
            assert.equal(await confirmation.locator(':scope > .domus-modal-footer button').count(), 2);
            await confirmation.getByRole('button', {name: 'Keep editing', exact: true}).click();
            assert.equal(await dialog.locator('input').inputValue(), 'Draft');
            await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
            await confirmation.getByRole('button', {name: 'Discard changes', exact: true}).click();
            assert.equal(await page.evaluate(() => document.activeElement.id), 'launcher');
            await page.evaluate(() => {
                window.finished = 0;
                window.closedReasons = [];
                window.wizard = Domus.Wizard.create({brandName: 'Welcome', slides: [
                    {title: 'First', intro: 'Start'}, {title: 'Second', intro: 'Continue', primaryLabel: 'Open dashboard'}
                ], onFinish: () => { finished++; }, onClose: reason => closedReasons.push(reason)});
                wizard.open();
            });
            const wizard = page.getByRole('dialog', {name: 'Welcome', exact: true});
            assert.equal(await wizard.locator(':scope > .domus-modal-header').count(), 1);
            const footer = wizard.locator(':scope > .domus-modal-footer');
            assert.equal(await footer.getByRole('button', {name: 'Previous', exact: true}).isDisabled(), true);
            await footer.getByRole('button', {name: 'Next', exact: true}).click();
            await wizard.getByRole('heading', {name: 'Second', exact: true}).waitFor();
            assert.ok(await footer.evaluate(el => el.getBoundingClientRect().bottom <= window.innerHeight));
            assert.ok(await wizard.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
            await footer.getByRole('button', {name: 'Previous', exact: true}).click();
            await wizard.getByRole('heading', {name: 'First', exact: true}).waitFor();
            await wizard.press('ArrowRight');
            await footer.getByRole('button', {name: 'Open dashboard', exact: true}).click();
            assert.equal(await page.evaluate(() => finished), 1);
            assert.equal(await wizard.count(), 0);
            await page.evaluate(() => wizard.open());
            await wizard.press('Escape');
            assert.equal(await wizard.count(), 0);
            assert.equal(await page.evaluate(() => finished), 1, 'Dismissal does not finish the welcome flow');
            assert.deepEqual(await page.evaluate(() => closedReasons), ['finish', 'escape']);
            await page.evaluate(() => Domus.UI.openModal({title: 'Help', content: '<p>Read only</p>'}));
            await page.getByRole('dialog', {name: 'Help', exact: true}).locator(':scope > .domus-modal-footer').getByRole('button', {name: 'Close', exact: true}).click();
            assert.equal(await page.getByRole('dialog').count(), 0);
            assert.deepEqual(errors, []);
            console.log(`PASS shared dialog form validation, Enter, footer actions, discard, focus and welcome navigation (${width}px)`);
            await page.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
