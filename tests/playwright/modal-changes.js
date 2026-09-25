/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Real Chromium, actual application modules; API responses are fixtures and no
// Nextcloud records are written. Live Nextcloud verification is a separate check.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const confirmDialog = page => page.getByRole('dialog', { name: 'Discard changes?', exact: true });
const bookingDialog = page => page.getByRole('dialog', { name: 'Add Booking or Document', exact: true });
const waitClosed = page => page.locator('.domus-modal').waitFor({ state: 'detached' });
const discard = async page => {
    await confirmDialog(page).getByRole('button', { name: 'Discard changes', exact: true }).click();
    await waitClosed(page);
};

async function setup(page) {
    await page.setContent('<button id="launcher">Open form</button><div id="app-content" class="app-domus"></div>');
    await page.addStyleTag({ path: 'css/style.css' });
    await page.evaluate(() => {
        window.t = (app, text, params = {}) => text.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? key);
        window.OC = { generateUrl: path => path, dialogs: { filepicker: (title, callback) => callback('/test/document.pdf') } };
    });
    for (const module of ['CoreBundle', 'Accounts', 'Distributions', 'Units', 'Partners', 'Tenancies', 'Tasks', 'Bookings', 'Documents']) {
        await page.addScriptTag({ path: `js/domus${module}.js` });
    }
    await page.evaluate(() => {
        Domus.Api.getProperties = async () => [{ id: 1, name: 'Test property' }];
        Domus.Api.getUnits = async () => [{ id: 1, label: 'Test unit', propertyId: 1 }];
        Domus.Api.getPartners = async () => [{ id: 1, name: 'Test tenant', partnerType: 'tenant' }];
        Domus.Api.getTaskTemplates = async () => [];
        Domus.Api.getDistributions = async () => [{ id: 2, name: 'Area', type: 'area' }];
        Domus.Api.createBooking = async () => ({ id: 1 });
        Domus.Accounts.toOptions = () => [{ value: '', label: 'Select account' }, { value: '2000', label: 'Test account' }];
        window.openBooking = (defaults = {}, options = {}) => Domus.Bookings.openCreateModal(defaults, () => {}, options);
        document.querySelector('#launcher').addEventListener('click', () => window.openBooking());
    });
}

async function openBooking(page) {
    await page.getByRole('button', { name: 'Open form' }).click();
    await bookingDialog(page).waitFor();
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    let failures = 0;
    async function test(name, action, viewport = { width: 1280, height: 900 }) {
        const page = await browser.newPage({ viewport });
        page.setDefaultTimeout(5000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
            await setup(page);
            await action(page);
            assert.deepEqual(errors, [], 'No browser errors');
            console.log(`PASS ${name}`);
        } catch (error) {
            failures++;
            console.error(`FAIL ${name}\n${error.stack}`);
        } finally {
            await page.close();
        }
    }

    for (const dismissal of ['Escape', 'Close', 'Cancel', 'Backdrop']) {
        await test(`booking ${dismissal}: keep, discard, reopen and focus return`, async page => {
            await openBooking(page);
            const description = bookingDialog(page).getByRole('textbox', { name: 'Description', exact: true });
            await description.fill('Temporary description');
            const dismiss = async () => {
                if (dismissal === 'Escape') await description.press('Escape');
                if (dismissal === 'Close') await bookingDialog(page).getByRole('button', { name: 'Close modal' }).click();
                if (dismissal === 'Cancel') await bookingDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
                if (dismissal === 'Backdrop') await page.locator('.domus-modal-backdrop').click({ position: { x: 2, y: 2 } });
            };
            await dismiss();
            await confirmDialog(page).getByRole('button', { name: 'Keep editing' }).click();
            assert.equal(await description.inputValue(), 'Temporary description');
            await dismiss();
            await discard(page);
            assert.equal(await page.evaluate(() => document.activeElement.id), 'launcher');
            await openBooking(page);
            assert.equal(await description.inputValue(), '');
            await description.press('Escape');
            await waitClosed(page);
        });
    }

    await test('booking defaults, reverted text and trailing empty rows stay clean', async page => {
        await openBooking(page);
        const description = bookingDialog(page).getByRole('textbox', { name: 'Description', exact: true });
        await description.fill('Changed');
        await description.fill('');
        const amount = page.locator('[data-role="amount"]').first();
        await amount.fill('20');
        assert.equal(await page.locator('.domus-booking-entry').count(), 2);
        await amount.fill('');
        await description.press('Escape');
        await waitClosed(page);
    });

    await test('nested Escape and Tab affect only the top dialog', async page => {
        await openBooking(page);
        const description = bookingDialog(page).getByRole('textbox', { name: 'Description', exact: true });
        await description.fill('Keep this');
        await description.press('Escape');
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Keep editing');
        await confirmDialog(page).getByRole('button', { name: 'Discard changes', exact: true }).focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Close modal');
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Discard changes');
        await page.keyboard.press('Escape');
        await confirmDialog(page).waitFor({ state: 'detached' });
        assert.equal(await description.inputValue(), 'Keep this');
        assert.equal(await description.evaluate(el => el === document.activeElement), true);
        assert.equal(await bookingDialog(page).evaluate(el => el.inert), false);
        await page.evaluate(() => { Domus.UI.confirmAction({ title: 'Nested delete', message: 'Delete?' }); });
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.domus-modal').count(), 1);
        assert.equal(await description.inputValue(), 'Keep this');
    });

    await test('shared snapshots normalize numbers and selections, track checkbox and hidden values', async page => {
        await page.evaluate(() => {
            window.fixture = Domus.UI.openModal({ title: 'Form', content: '<form><input name="amount" type="number" value="2"><input name="choice" type="checkbox"><input name="path" type="hidden" value="old"><select multiple><option selected value="b">B</option><option selected value="a">A</option></select></form>' });
            fixture.modalEl.querySelector('input').value = '3';
            fixture.protectChanges();
        });
        await page.locator('input[name="amount"]').fill('3.00');
        await page.locator('input[name="choice"]').check();
        await page.keyboard.press('Escape');
        await confirmDialog(page).getByRole('button', { name: 'Keep editing' }).click();
        await page.locator('input[name="choice"]').uncheck();
        await page.evaluate(() => {
            const select = fixture.modalEl.querySelector('select');
            select.appendChild(select.firstElementChild);
        });
        await page.keyboard.press('Escape');
        await waitClosed(page);
        await page.evaluate(() => {
            window.fixture = Domus.UI.openModal({ title: 'Hidden', content: '<input type="hidden" value="old">' });
            fixture.protectChanges();
            fixture.modalEl.querySelector('input').value = 'new';
            fixture.requestClose();
        });
        await discard(page);
    });

    await test('read-only dialogs and successful completion close immediately, including pending confirmation', async page => {
        await page.evaluate(() => { Domus.UI.openModal({ title: 'Details', content: '<p>Read only</p>' }); });
        await page.keyboard.press('Escape');
        await waitClosed(page);
        await page.evaluate(() => {
            window.closeCount = 0;
            window.fixture = Domus.UI.openModal({ title: 'Save race', content: '<input value="initial">', onClose: () => closeCount++ });
            fixture.protectChanges();
            fixture.modalEl.querySelector('input').value = 'edited';
            fixture.requestClose();
            fixture.requestClose();
        });
        assert.equal(await page.locator('.domus-modal').count(), 2);
        await page.evaluate(() => { fixture.close(); fixture.close(); });
        await waitClosed(page);
        assert.equal(await page.evaluate(() => closeCount), 1);
    });

    await test('booking save failure retains fields; successful retry has no discard warning', async page => {
        await openBooking(page);
        await page.locator('select[name="unitId"]').selectOption('1');
        await page.locator('[data-role="account"]').first().selectOption('2000');
        await page.locator('[data-role="amount"]').first().fill('10');
        await page.evaluate(() => { Domus.Api.createBooking = async () => { throw new Error('Test save failure'); }; });
        await bookingDialog(page).getByRole('button', { name: 'Save', exact: true }).click();
        await page.getByText('Test save failure', { exact: true }).waitFor();
        await page.keyboard.press('Escape');
        await confirmDialog(page).getByRole('button', { name: 'Keep editing' }).click();
        assert.equal(await page.locator('[data-role="amount"]').first().inputValue(), '10');
        await page.evaluate(() => { Domus.Api.createBooking = async () => ({ id: 1 }); });
        await bookingDialog(page).getByRole('button', { name: 'Save', exact: true }).click();
        await waitClosed(page);
    });

    await test('completion of a lower modal leaves an unrelated child draft open', async page => {
        await page.evaluate(() => {
            window.lower = Domus.UI.openModal({ title: 'Saving', content: 'Saving' });
            window.upper = Domus.UI.openModal({ title: 'Another form', content: '<input value="initial">' });
            upper.protectChanges();
            upper.modalEl.querySelector('input').value = 'Draft';
            upper.modalEl.querySelector('input').focus();
            lower.close();
        });
        assert.equal(await page.getByRole('textbox').inputValue(), 'Draft');
        assert.equal(await page.getByRole('textbox').evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('Escape');
        await discard(page);
    });

    for (const edited of [false, true]) {
        await test(`async distribution defaults preserve ${edited ? 'edits during loading' : 'clean state'}`, async page => {
            await page.evaluate(() => {
                Domus.state.currentRoleView = 'buildingMgmt';
                Domus.Role.isBuildingMgmtView = () => true;
                Domus.Distributions.canManageDistributions = () => true;
                Domus.Api.getDistributions = () => new Promise(resolve => { window.resolveDistributions = resolve; });
                // Supply a property default before form binding starts its async
                // options request, without dispatching a user change event.
                const openModal = Domus.UI.openModal;
                Domus.UI.openModal = options => {
                    const modal = openModal(options);
                    const property = modal.modalEl.querySelector('select[name="propertyId"]');
                    if (property) property.value = '1';
                    return modal;
                };
                openBooking({ distributionKeyId: 2 }, { multiEntry: false });
            });
            await bookingDialog(page).waitFor();
            if (edited) await bookingDialog(page).getByRole('textbox', { name: 'Description', exact: true }).fill('During loading');
            await page.evaluate(() => resolveDistributions([{ id: 2, name: 'Area', type: 'area' }]));
            await page.waitForFunction(() => !document.querySelector('#domus-booking-distribution').disabled);
            await page.keyboard.press('Escape');
            if (edited) await discard(page);
            else await waitClosed(page);
        });
    }

    await test('document picker selection and upload are protected', async page => {
        await page.evaluate(() => openBooking({ unitId: 1 }, { createContext: 'document' }));
        await bookingDialog(page).waitFor();
        await page.getByRole('button', { name: 'Select existing file', exact: true }).click();
        await page.keyboard.press('Escape');
        await discard(page);
        await page.evaluate(() => openBooking({ unitId: 1 }, { createContext: 'document' }));
        await bookingDialog(page).waitFor();
        await page.locator('input[type="file"]').setInputFiles({ name: 'test.txt', mimeType: 'text/plain', buffer: Buffer.from('test') });
        await page.keyboard.press('Escape');
        await confirmDialog(page).getByRole('button', { name: 'Keep editing' }).click();
        assert.equal(await page.locator('input[type="file"]').evaluate(el => el.files[0].name), 'test.txt');
    });

    for (const kind of ['unit', 'tenancy', 'task']) {
        await test(`${kind} initialized form closes cleanly and protects changed fields`, async page => {
            async function open() {
                await page.evaluate(kind => {
                    if (kind === 'unit') Domus.Units.openCreateModal({}, () => {}, { useGuidedWorkflow: false });
                    if (kind === 'tenancy') Domus.Tenancies.openCreateModal({ partnerIds: [1], unitId: 1 }, () => {});
                    if (kind === 'task') Domus.Tasks.openCreateTaskModal('unit', 1, () => {});
                }, kind);
                await page.locator(`form[id^="domus-${kind}-"]`).waitFor();
            }
            await open();
            await page.keyboard.press('Escape');
            await waitClosed(page);
            await open();
            const input = page.locator('form input:not([type="hidden"]):not([disabled]), form textarea:not([disabled])').first();
            const type = await input.getAttribute('type');
            await input.fill(type === 'date' ? '2027-01-15' : type === 'number' ? '25' : 'Changed value');
            await page.getByRole('button', { name: 'Cancel', exact: true }).click();
            await discard(page);
        });
    }

    await test('external picker owns Escape without dismissing the parent', async page => {
        await openBooking(page);
        await page.evaluate(() => {
            const picker = document.createElement('div');
            picker.setAttribute('role', 'dialog');
            picker.innerHTML = '<button id="picker-button">Select</button>';
            document.body.appendChild(picker);
            picker.querySelector('button').focus();
        });
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.domus-modal').count(), 1);
    });

    await test('narrow viewport retains fields and keeps confirmation controls within the viewport', async page => {
        await openBooking(page);
        await bookingDialog(page).getByRole('textbox', { name: 'Description', exact: true }).fill('Mobile draft');
        await page.keyboard.press('Escape');
        const box = await confirmDialog(page).boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844);
        await confirmDialog(page).getByRole('button', { name: 'Keep editing' }).click();
        assert.equal(await bookingDialog(page).getByRole('textbox', { name: 'Description', exact: true }).inputValue(), 'Mobile draft');
    }, { width: 390, height: 844 });

    await browser.close();
    if (failures) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
