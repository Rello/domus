/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Real Chromium, actual application modules; API responses are fixtures and no
// Nextcloud records are written. Live Nextcloud verification is a separate check.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const confirmDialog = page => page.getByRole('dialog', { name: 'Discard changes?', exact: true });
const bookingDialog = page => page.getByRole('dialog', { name: /^(Add booking|Add document|Edit booking|Edit document)$/, exact: true });
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

    await test('landlord booking explains agreed rent and offers expense accounts', async page => {
        await page.evaluate(() => {
            Domus.Role.setRoleInfo({currentRole: 'landlord', availableRoles: ['landlord']});
            Domus.Accounts.toOptions = (includePlaceholder, filter) => [
                {value: '1000', label: 'Base rent'},
                {value: '2000', label: 'Maintenance fee'}
            ].filter(option => !filter || filter(option.value));
        });
        await openBooking(page);
        assert.match(await bookingDialog(page).innerText(), /Agreed base rent is calculated from tenancies/);
        assert.match(await bookingDialog(page).innerText(), /not rent payments received/);
        assert.deepEqual(await bookingDialog(page).locator('[data-role="account"]').first().locator('option').allTextContents(), ['Maintenance fee']);
        assert.deepEqual(await bookingDialog(page).locator('[data-role="account"]').first().locator('option').evaluateAll(options => options.map(option => option.value)), ['2000']);
    });

    for (const formKind of ['create', 'edit', 'assignment']) {
        for (const dismissal of ['Escape', 'Close', 'Cancel', 'Backdrop']) {
            await test(`partner ${formKind} ${dismissal} protects changed contact fields`, async page => {
                await page.evaluate(() => {
                    Domus.Api.get = async () => ({id: 1, name: 'Demo renter', partnerType: 'tenant', city: 'Berlin', tenancies: []});
                    Domus.Api.getPartners = async () => [
                        {id: 1, name: 'Demo renter', partnerType: 'tenant'},
                        {id: 2, name: 'Other contact', partnerType: 'supplier'}
                    ];
                    Domus.Api.getDocuments = async () => [];
                });
                const open = async () => {
                    if (formKind === 'create') {
                        await page.evaluate(() => Domus.Partners.openCreateModal({}, () => {}));
                    } else if (formKind === 'edit') {
                        await page.evaluate(() => Domus.Partners.renderDetail(1));
                        await page.locator('#domus-partner-masterdata').click();
                        await page.getByRole('dialog', {name: 'Contact details', exact: true}).getByRole('button', {name: 'Edit', exact: true}).click();
                    } else {
                        await page.evaluate(() => {
                            document.querySelector('#app-content').innerHTML = Domus.PartnerRelations.renderSection([], {entityType: 'unit'});
                            Domus.PartnerRelations.bindSection({entityType: 'unit', entityId: 1});
                        });
                        await page.locator('#domus-unit-add-partner').click();
                    }
                    await page.locator(formKind === 'assignment' ? '#domus-partner-relation-form' : '#domus-partner-form').waitFor();
                };
                await open();
                const dialog = page.locator('.domus-modal[aria-modal="true"]');
                const city = dialog.locator('input[name="city"]');
                await city.fill('Hamburg');
                const dismiss = async () => {
                    if (dismissal === 'Escape') await city.press('Escape');
                    if (dismissal === 'Close') await dialog.getByRole('button', {name: 'Close modal'}).click();
                    if (dismissal === 'Cancel') await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
                    if (dismissal === 'Backdrop') await page.locator('.domus-modal-backdrop').click({position: {x: 2, y: 2}});
                };
                await dismiss();
                await confirmDialog(page).getByRole('button', {name: 'Keep editing'}).click();
                assert.equal(await city.inputValue(), 'Hamburg');
                if (dismissal === 'Escape') assert.equal(await city.evaluate(el => document.activeElement === el), true);
                await dismiss();
                await discard(page);
                await open();
                assert.equal(await city.inputValue(), formKind === 'edit' ? 'Berlin' : '');
                await city.fill('Changed again');
                await city.fill(formKind === 'edit' ? 'Berlin' : '');
                await city.press('Escape');
                await waitClosed(page);
            });
        }
    }

    await test('partner save closes without a discard prompt and read-only details close directly', async page => {
        await page.evaluate(() => {
            Domus.Api.get = async () => ({id: 1, name: 'Demo renter', partnerType: 'tenant', city: 'Berlin', tenancies: []});
            Domus.Api.getDocuments = async () => [];
            Domus.Api.updatePartner = async (id, data) => {window.savedPartner = data;};
            Domus.Partners.renderDetail(1);
        });
        await page.locator('#domus-partner-masterdata').click();
        await page.getByRole('dialog', {name: 'Contact details', exact: true}).getByRole('button', {name: 'Close', exact: true}).click();
        await waitClosed(page);
        await page.locator('#domus-partner-masterdata').click();
        await page.getByRole('dialog', {name: 'Contact details', exact: true}).getByRole('button', {name: 'Edit', exact: true}).click();
        await page.locator('#domus-partner-form input[name="city"]').fill('Hamburg');
        await page.getByRole('dialog', {name: 'Edit contact', exact: true}).getByRole('button', {name: 'Save', exact: true}).click();
        await waitClosed(page);
        assert.equal(await confirmDialog(page).count(), 0);
        assert.equal(await page.evaluate(() => window.savedPartner.city), 'Hamburg');
    });

    await test('contact details opens viewing and editing while delete stays secondary', async page => {
        await page.evaluate(() => {
            Domus.Api.get = async () => ({id: 1, name: 'Demo renter', partnerType: 'tenant', phone: '12345', tenancies: []});
            Domus.Api.getDocuments = async () => [];
            Domus.Partners.renderDetail(1);
        });
        assert.equal(await page.locator('#domus-partner-edit, #domus-partner-details').count(), 0);
        assert.match(await page.locator('#domus-partner-masterdata').innerText(), /Contact details/);
        await page.locator('#domus-partner-masterdata').click();
        await page.getByRole('dialog', {name: 'Contact details', exact: true}).waitFor();
        await page.getByRole('dialog', {name: 'Contact details', exact: true}).getByRole('button', {name: 'Edit', exact: true}).click();
        await page.getByRole('dialog', {name: 'Edit contact', exact: true}).waitFor();
        await page.getByRole('dialog', {name: 'Edit contact', exact: true}).getByRole('button', {name: 'Cancel'}).click();
        assert.equal(await page.getByRole('button', {name: 'Delete', exact: true}).isVisible(), false);
        await page.getByRole('button', {name: 'More actions'}).click();
        assert.equal(await page.getByRole('button', {name: 'Delete', exact: true}).isVisible(), true);
        assert.equal(await page.locator('#domus-partner-masterdata').count(), 1);
    });

    await test('new partner save closes directly', async page => {
        await page.evaluate(() => {
            Domus.Api.createPartner = async data => {window.savedPartner = data; return {id: 3};};
            Domus.Partners.openCreateModal({}, () => {});
        });
        await page.locator('#domus-partner-form input[name="name"]').fill('New contact');
        await page.locator('#domus-partner-form input[name="city"]').fill('Hamburg');
        await page.locator('#domus-partner-form').getByRole('button', {name: 'Save', exact: true}).click();
        await waitClosed(page);
        assert.equal(await confirmDialog(page).count(), 0);
        assert.equal(await page.evaluate(() => window.savedPartner.city), 'Hamburg');
    });

    await test('contact assignment protects an existing selection and closes after save', async page => {
        await page.evaluate(() => {
            Domus.Api.getPartners = async () => [{id: 2, name: 'Other contact', partnerType: 'supplier'}];
            Domus.Api.createUnitPartner = async (id, data) => {window.savedAssignment = data;};
            document.querySelector('#app-content').innerHTML = Domus.PartnerRelations.renderSection([], {entityType: 'unit'});
            Domus.PartnerRelations.bindSection({entityType: 'unit', entityId: 1});
        });
        await page.locator('#domus-unit-add-partner').click();
        await page.locator('#domus-partner-relation-form select[name="partnerId"]').selectOption('2');
        await page.keyboard.press('Escape');
        await confirmDialog(page).getByRole('button', {name: 'Keep editing'}).click();
        assert.equal(await page.locator('#domus-partner-relation-form select[name="partnerId"]').inputValue(), '2');
        await page.locator('#domus-partner-relation-form').getByRole('button', {name: 'Save', exact: true}).click();
        await waitClosed(page);
        assert.equal(await confirmDialog(page).count(), 0);
        assert.deepEqual(await page.evaluate(() => window.savedAssignment), {partnerId: '2'});
    });

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

    await test('document filenames open directly; details use a separate keyboard action', async page => {
        await page.context().route('https://files.example.test/**', route => route.fulfill({body: 'Fixture file'}));
        await page.evaluate(() => {
            window.detailReads = 0;
            Domus.Api.getDocuments = async () => [{id: 7, fileName: 'Invoice.pdf', fileUrl: 'https://files.example.test/f/8', note: 'Existing note'}];
            Domus.Api.getDocumentDetail = async () => {
                window.detailReads++;
                return {document: {filePath: '/test/document.pdf', fileName: 'Invoice.pdf', fileUrl: 'https://files.example.test/f/8', note: 'Existing note'}, linkedEntities: [{id: 7, entityType: 'unit', entityId: 1}]};
            };
            document.querySelector('#app-content').innerHTML = Domus.Documents.renderList('unit', 1);
        });
        const file = page.getByRole('link', {name: 'Invoice.pdf', exact: true});
        await file.waitFor();
        const edit = page.getByRole('button', {name: 'Edit document Invoice.pdf'});
        assert.equal(await edit.evaluate(el => getComputedStyle(el).opacity), '0');
        await file.hover();
        assert.equal(await edit.evaluate(el => getComputedStyle(el).opacity), '1');
        await page.mouse.move(0, 0);
        await file.focus();
        assert.equal(await edit.evaluate(el => getComputedStyle(el).opacity), '1');
        await page.getByText('Existing note', {exact: true}).click();
        assert.equal(await page.locator('.domus-modal').count(), 0);
        const popupPromise = page.waitForEvent('popup');
        await file.press('Enter');
        const popup = await popupPromise;
        await popup.waitForLoadState();
        assert.equal(popup.url(), 'https://files.example.test/f/8');
        await popup.close();
        assert.equal(await page.evaluate(() => window.detailReads), 0);
        assert.equal(await page.locator('.domus-modal').count(), 0);
        await page.getByRole('button', {name: 'Edit document Invoice.pdf'}).press('Space');
        await page.getByRole('dialog', {name: 'Edit document', exact: true}).waitFor();
        assert.equal(await page.getByRole('textbox', {name: 'Note', exact: true}).inputValue(), 'Existing note');
        await page.getByRole('textbox', {name: 'Note', exact: true}).fill('Changed note');
        await page.keyboard.press('Escape');
        await confirmDialog(page).getByRole('button', {name: 'Keep editing'}).click();
        assert.equal(await page.getByRole('textbox', {name: 'Note', exact: true}).inputValue(), 'Changed note');
    });

    for (const entityType of ['property', 'unit', 'partner', 'tenancy', 'booking']) {
        await test(`document edit preserves ${entityType} assignment and refreshes`, async page => {
            await page.evaluate(entityType => {
                window.savedTargets = [];
                window.refreshes = 0;
                Domus.Api.getDocuments = async () => [{id: 7, fileName: 'Invoice.pdf', fileUrl: 'https://files.example.test/f/8'}];
                Domus.Api.getDocumentDetail = async () => ({
                    document: {filePath: '/test/document.pdf', fileName: 'Invoice.pdf', fileUrl: 'https://files.example.test/f/8'},
                    linkedEntities: [{id: 7, entityType, entityId: 1}]
                });
                Domus.Api.get = async path => path.endsWith('/tenancies')
                    ? []
                    : {id: 1, unitId: 1, propertyId: 1, account: '2000', amount: 100, date: '2026-09-25'};
                Domus.Api.updateBooking = async () => {};
                Domus.Api.attachDocumentToTargets = async payload => { window.savedTargets = payload.targets; };
                Domus.Api.unlinkDocument = async () => {};
                document.querySelector('#app-content').innerHTML = Domus.Documents.renderList(entityType, 1, {onUpdated: () => window.refreshes++});
            }, entityType);
            await page.locator('tr[data-doc-info="7"]').hover();
            await page.getByRole('button', {name: 'Edit document Invoice.pdf'}).click();
            await page.getByRole('dialog', {name: 'Edit document', exact: true}).waitFor();
            await page.getByRole('textbox', {name: 'Note', exact: true}).fill('Metadata update');
            await page.getByRole('button', {name: 'Save', exact: true}).click();
            await waitClosed(page);
            assert.ok((await page.evaluate(() => window.savedTargets)).some(target => target.entityType === entityType && String(target.entityId) === '1'));
            assert.equal(await page.evaluate(() => window.refreshes), 1);
        });
    }

    await test('unit document editor links an additional tenancy without reuploading or duplicating links', async page => {
        await page.evaluate(() => {
            window.savedAttachment = null;
            window.unlinkedDocument = null;
            Domus.Api.getDocuments = async () => [{id: 7, fileName: 'Lease.pdf'}];
            Domus.Api.getDocumentDetail = async () => ({
                document: {filePath: '/Domus/Unit/Lease.pdf', fileName: 'Lease.pdf'},
                linkedEntities: [
                    {id: 7, entityType: 'unit', entityId: 1},
                    {id: 8, entityType: 'tenancy', entityId: 12}
                ]
            });
            Domus.Api.get = async path => path === '/units/1/tenancies'
                ? [
                    {id: 12, unitId: 1, partners: [{name: 'Existing renter'}], startDate: '2024-01-01'},
                    {id: 13, unitId: 1, partners: [{name: 'New renter'}], startDate: '2026-10-01'}
                ]
                : {};
            Domus.Api.attachDocumentToTargets = async payload => { window.savedAttachment = payload; };
            Domus.Api.unlinkDocument = async id => { window.unlinkedDocument = id; };
            document.querySelector('#app-content').innerHTML = Domus.Documents.renderList('unit', 1);
        });
        await page.locator('tr[data-doc-info="7"]').hover();
        await page.getByRole('button', {name: 'Edit document Lease.pdf'}).click();
        const dialog = page.getByRole('dialog', {name: 'Edit document', exact: true});
        await dialog.waitFor();
        const tenancy = dialog.getByRole('combobox', {name: 'Add tenancy assignment'});
        assert.deepEqual(await tenancy.locator('option').evaluateAll(options => options.map(option => option.value)), ['', '13']);
        assert.match(await dialog.innerText(), /Already assigned to: Existing renter/);
        await tenancy.selectOption('13');
        await dialog.getByRole('button', {name: 'Save', exact: true}).click();
        await waitClosed(page);
        const saved = await page.evaluate(() => ({attachment: window.savedAttachment, unlinked: window.unlinkedDocument}));
        assert.equal(saved.attachment.type, 'link');
        assert.equal(saved.attachment.filePath, '/Domus/Unit/Lease.pdf');
        assert.deepEqual(saved.attachment.targets, [
            {entityType: 'unit', entityId: 1},
            {entityType: 'tenancy', entityId: '13'}
        ]);
        assert.equal(saved.unlinked, 7);
    });

    await test('narrow latest documents retain dates, long filenames, and separate actions', async page => {
        await page.evaluate(() => {
            Domus.Api.getDocuments = async () => [
                {id: 7, fileName: 'VeryLongDocumentNameWithoutSpaces'.repeat(6) + '.pdf', fileUrl: 'https://files.example.test/f/8', createdAt: 1790000000},
                {id: 9, fileName: 'External.pdf', fileUrl: 'https://external.example.test/document.pdf', createdAt: 1790000000},
                {id: 10, fileName: 'Invalid.pdf', fileUrl: 'javascript:alert(1)', createdAt: 1790000000}
            ];
            document.querySelector('#app-content').innerHTML = Domus.Documents.renderLatestList('unit', 1);
        });
        await page.locator('button[data-doc-edit]').first().waitFor();
        assert.equal(await page.locator('tr[role="button"]').count(), 0);
        assert.equal(await page.getByRole('link', {name: 'External.pdf'}).getAttribute('href'), 'https://external.example.test/document.pdf');
        assert.equal(await page.getByRole('link', {name: 'Invalid.pdf'}).count(), 0);
        assert.equal(await page.locator('.domus-documents-date-cell').first().isVisible(), true);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }, {width: 390, height: 844});

    for (const startWithDocument of [true, false]) {
        await test(`${startWithDocument ? 'upload to booking' : 'booking to document'} retains unit and booking assignments`, async page => {
            await page.evaluate(startWithDocument => {
                window.savedAttachment = null;
                window.savedBooking = null;
                Domus.Api.createBooking = async payload => {window.savedBooking = payload; return {id: 12};};
                Domus.Api.attachDocumentToTargets = async payload => {window.savedAttachment = {type: payload.type, targets: payload.targets};};
                if (startWithDocument) {
                    Domus.Documents.openLinkModal('unit', 1, () => {});
                } else {
                    openBooking({unitId: 1});
                }
            }, startWithDocument);
            await page.getByRole('dialog', {name: startWithDocument ? 'Add document' : 'Add booking', exact: true}).waitFor();
            if (startWithDocument) {
                await page.getByRole('button', {name: 'Create a booking for this document', exact: true}).press('Space');
            } else {
                await page.getByRole('button', {name: 'Attach document (optional)', exact: true}).press('Space');
            }
            await page.locator('[data-role="account"]').first().selectOption('2000');
            await page.locator('[data-role="amount"]').first().fill('10');
            await page.locator('input[type="file"]').setInputFiles({name: 'test.txt', mimeType: 'text/plain', buffer: Buffer.from('test')});
            await page.getByRole('button', {name: 'Save', exact: true}).click();
            await waitClosed(page);
            const saved = await page.evaluate(() => ({booking: window.savedBooking, attachment: window.savedAttachment}));
            assert.equal(String(saved.booking.unitId), '1');
            assert.equal(saved.attachment.type, 'upload');
            assert.deepEqual(saved.attachment.targets, [{entityType: 'booking', entityId: 12}, {entityType: 'unit', entityId: '1'}]);
        });
    }

    await test('booking editor has an edit title and preserves booking defaults', async page => {
        await page.evaluate(() => {
            Domus.Api.get = async () => ({unitId: 1, account: '2000', amount: 100, date: '2026-09-25', description: 'Existing booking'});
            Domus.Api.getDocuments = async () => [];
            Domus.Bookings.openEditModal(1);
        });
        await page.getByRole('dialog', {name: 'Edit booking', exact: true}).waitFor();
        assert.equal(await page.getByRole('textbox', {name: 'Description', exact: true}).inputValue(), 'Existing booking');
        assert.equal(await page.locator('input[name="unitId"]').inputValue(), '1');
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


    for (const viewport of [{width: 1280, height: 720}, {width: 390, height: 640}]) {
        await test(`booking footer and disclosures at ${viewport.width}x${viewport.height}`, async page => {
            await openBooking(page);
            assert.equal(await bookingDialog(page).getByRole('heading', {name: 'Booking', exact: true}).count(), 1);
            assert.equal(await bookingDialog(page).getByRole('checkbox').count(), 0);
            const disclosure = bookingDialog(page).getByRole('button', {name: 'Attach document (optional)', exact: true});
            await disclosure.press('Enter');
            assert.equal(await disclosure.getAttribute('aria-expanded'), 'true');
            await disclosure.press('Space');
            assert.equal(await disclosure.getAttribute('aria-expanded'), 'false');
            const geometry = await page.evaluate(() => {
                const footer = document.querySelector('.domus-modal > .domus-modal-footer').getBoundingClientRect();
                const body = document.querySelector('.domus-modal-body').getBoundingClientRect();
                return {top: footer.top, bottom: footer.bottom, left: footer.left, right: footer.right, bodyBottom: body.bottom};
            });
            assert.ok(geometry.top >= 0 && geometry.bottom <= viewport.height && geometry.left >= 0 && geometry.right <= viewport.width);
            assert.ok(geometry.bodyBottom <= geometry.top + 1, 'Footer does not cover fields');
            await bookingDialog(page).getByRole('button', {name: 'Cancel', exact: true}).click();
            await waitClosed(page);
            assert.equal(await page.evaluate(() => document.activeElement.id), 'launcher');
        }, viewport);
    }

    await test('filtered later booking page survives save, refresh failure and Back', async page => {
        await page.evaluate(() => {
            Domus.Role.setRoleInfo({currentRole: 'landlord', availableRoles: ['landlord']});
            window.fixtureBookings = Array.from({length: 65}, (_, i) => ({id: i + 1, unitId: 1, date: '2026-01-01', account: '2000', amount: 10, description: 'Fixture booking ' + (i + 1)}));
            Domus.Api.getBookings = async () => fixtureBookings;
            Domus.Api.get = async path => fixtureBookings.find(b => path === '/bookings/' + b.id);
            Domus.Api.getDocuments = async () => [];
            Domus.Api.updateBooking = async (id, payload) => Object.assign(fixtureBookings.find(b => b.id === Number(id)), payload);
            Domus.Accounts.label = () => 'Test account';
            Domus.Router.register('bookings', Domus.Bookings.renderList);
            Domus.Router.register('other', () => Domus.UI.renderContent('<p>Other view</p>'));
            Domus.Router.navigate('bookings');
        });
        await page.getByRole('searchbox', {name: 'Search bookings'}).fill('Fixture');
        await page.locator('#domus-booking-unit-filter').selectOption('1');
        await page.getByRole('button', {name: 'Next', exact: true}).click();
        await page.locator('#domus-bookings-table').getByText('Showing 21 - 40 of 65').waitFor();
        const edit = page.locator('[data-domus-booking-edit]').first();
        const editLabel = await edit.getAttribute('aria-label');
        await page.evaluate(() => {
            const root = document.getElementById('app-content');
            root.style.height = '400px'; root.style.overflow = 'auto';
        });
        await edit.press('Enter');
        const scrollBeforeSave = await page.evaluate(() => document.getElementById('app-content').scrollTop);
        await bookingDialog(page).getByRole('textbox', {name: 'Description', exact: true}).fill('Fixture updated');
        await bookingDialog(page).getByRole('button', {name: 'Save', exact: true}).click();
        await waitClosed(page);
        await page.locator('#domus-bookings-table').getByText('Fixture updated', {exact: true}).waitFor();
        assert.equal(await page.getByRole('searchbox', {name: 'Search bookings'}).inputValue(), 'Fixture');
        assert.equal(await page.locator('#domus-booking-unit-filter').inputValue(), '1');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), editLabel);
        assert.equal(await page.evaluate(() => document.getElementById('app-content').scrollTop), scrollBeforeSave);
        assert.match(await page.locator('.domus-pagination-info').innerText(), /21 - 40/);
        await page.evaluate(() => {
            Domus.Api.getBookings = async () => {throw new Error('Refresh failed');};
            Domus.Bookings.renderList();
        });
        await page.getByText('Refresh failed', {exact: true}).waitFor();
        assert.equal(await page.locator('#domus-bookings-table').getAttribute('aria-busy'), null);
        assert.match(await page.locator('.domus-pagination-info').innerText(), /21 - 40/);
        await page.evaluate(() => {
            Domus.Api.getBookings = async () => fixtureBookings;
            Domus.Router.navigate('other');
            Domus.Router.back();
        });
        await page.locator('#domus-bookings-table').getByText('Showing 21 - 40 of 65').waitFor();
        assert.equal(await page.getByRole('searchbox', {name: 'Search bookings'}).inputValue(), 'Fixture');
    });

    await browser.close();
    if (failures) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
