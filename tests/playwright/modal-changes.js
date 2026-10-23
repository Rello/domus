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
    if (page.url() === 'about:blank') {
        await page.route('http://domus.test/**', route => route.fulfill({contentType: 'text/html', body: '<!doctype html>'}));
        await page.goto('http://domus.test/apps/domus/');
    }
    await page.setContent('<button id="launcher">Open form</button><div id="app-content" class="app-domus"></div>');
    await page.addStyleTag({ path: 'css/style.css' });
    await page.evaluate(() => {
        window.t = (app, text, params = {}) => text.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? key);
        window.OC = { generateUrl: path => path, dialogs: { filepicker: (title, callback) => callback('/test/document.pdf') } };
    });
    for (const module of ['CoreBundle', 'ActionLog', 'Accounts', 'Distributions', 'Units', 'Partners', 'Tenancies', 'Tasks', 'Bookings', 'Documents']) {
        await page.addScriptTag({ path: `js/domus${module}.js` });
    }
    await page.evaluate(() => {
        Domus.Api.getProperties = async () => [{ id: 1, name: 'Test property' }];
        Domus.Api.getUnits = async () => [{ id: 1, label: 'Test unit', propertyId: 1 }];
        Domus.Api.getPartners = async () => [{ id: 1, name: 'Test tenant', partnerType: 'tenant' }];
        const originalGet = Domus.Api.get;
        Domus.Api.get = path => path.endsWith('/tenancies') ? Promise.resolve([]) : originalGet(path);
        Domus.Api.getTaskTemplates = async () => [];
        Domus.Api.getActionLogs = async () => [];
        Domus.Api.getDistributions = async () => [{ id: 2, name: 'Area', type: 'area' }];
        Domus.Api.createBooking = async () => ({ id: 1 });
        Domus.Accounts.label = number => ({2000:'Allocatable costs',2100:'Non-allocatable costs',2200:'Reserve contribution'}[number] || '');
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
            await page.route('**/settings/ai-document-validation', route => route.fulfill({json:{available:true,enabled:/assignment preview|dashboard|unit Add document/.test(name)}}));
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

    await test('disabled AI does not process selected PDFs or show a Test button', async page => {
        let creates = 0;
        await page.route('**/booking-assignment-preview**', route => {creates++; return route.fulfill({json:{taskId:1}});});
        await page.evaluate(() => openBooking({}, {createContext:'document'}));
        const dialog = bookingDialog(page);
        await dialog.locator('input[type="file"]').setInputFiles({name:'statement.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-fixture')});
        await page.waitForTimeout(200);
        assert.equal(creates, 0);
        assert.equal(await page.getByRole('dialog', {name:'Automatic assignment preview',exact:true}).count(), 0);
        assert.equal(await dialog.locator('[data-role="assignment-preview"]').count(), 0);
    });

    await test('assignment preview starts for an initial dashboard dropped PDF', async page => {
        await page.route('**/booking-assignment-preview**', route => route.fulfill({status:422,json:{message:'Automatic request received'}}));
        await page.evaluate(() => openBooking({}, {createContext:'document',initialDocumentSelection:{type:'upload',file:new File(['%PDF-fixture'],'drop.pdf',{type:'application/pdf'})}}));
        await page.getByRole('dialog',{name:'Automatic assignment preview',exact:true}).getByText('Automatic request received',{exact:true}).waitFor();
    });

    await test('assignment preview replaces inferred units but preserves manual choice', async page => {
        let detected = 1;
        await page.route('**/booking-assignment-preview**', route => {
            if (route.request().method() === 'POST') return route.fulfill({json:{taskId:55}});
            if (route.request().method() === 'DELETE') return route.fulfill({json:{}});
            return route.fulfill({json:{status:'complete',result:{unitId:detected,period:{start:'2025-01-01',end:'2025-12-31'},accounts:[]}}});
        });
        await page.evaluate(() => {
            Domus.Api.getUnits = async () => [{id:1,label:'First'},{id:2,label:'Second'}];
            openBooking({}, {createContext:'document'});
        });
        const dialog = bookingDialog(page);
        const unit = dialog.locator('[name="unitId"]');
        const preview = page.getByRole('dialog',{name:'Automatic assignment preview',exact:true});
        const select = async name => {
            await dialog.locator('input[type="file"]').setInputFiles({name,mimeType:'application/pdf',buffer:Buffer.from('%PDF-fixture')});
            await preview.getByRole('table').waitFor();
            await preview.getByRole('button',{name:'Close',exact:true}).click();
        };
        await select('first.pdf');
        assert.equal(await unit.inputValue(), '1');
        detected = 2;
        await select('second.pdf');
        assert.equal(await unit.inputValue(), '2');
        await unit.selectOption('1');
        await select('third.pdf');
        assert.equal(await unit.inputValue(), '1');
    });

    await test('assignment preview does not inject landlord accounts into building management', async page => {
        let requests = 0;
        await page.route('**/booking-assignment-preview**', route => {requests++; return route.fulfill({json:{taskId:1}});});
        await page.evaluate(() => {
            Domus.Role.isBuildingMgmtView = () => true;
            openBooking({}, {createContext:'document'});
        });
        await bookingDialog(page).locator('input[type="file"]').setInputFiles({name:'statement.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-fixture')});
        await page.waitForTimeout(200);
        assert.equal(requests, 0);
    });

    await test('dashboard identifies unit only after starting preview', async page => {
        let calls = 0;
        await page.route('**/booking-assignment-preview**', route => {
            calls++;
            if (route.request().method() === 'POST') return route.fulfill({json:{taskId:55}});
            if (route.request().method() === 'DELETE') return route.fulfill({json:{}});
            return route.fulfill({json:{status:'complete',result:{unitId:1,unitIdentification:{addresses:['Test street 4'],unitNumbers:['DH10']},period:{start:'2025-01-01',end:'2025-12-31'},accounts:[]}}});
        });
        await page.evaluate(() => openBooking({}, {createContext:'document',identifyDocumentUnit:true}));
        const dialog = page.getByRole('dialog', {name:'Add document',exact:true});
        await dialog.locator('input[type="file"]').setInputFiles({name:'statement.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-fixture')});
        assert.equal(await dialog.locator('[name="unitId"]').inputValue(), '');
        const preview = page.getByRole('dialog', {name:'Automatic assignment preview',exact:true});
        await preview.getByText('Unit detection details', {exact:true}).waitFor();
        assert.equal(await preview.locator('details').evaluate(node => node.open), false);
        assert.equal(await preview.getByText('Test street 4', {exact:true}).isVisible(), false);
        assert.doesNotMatch(await preview.innerText(), /statement\.pdf/);
        const paragraphs = await preview.locator('[role="status"] > p').allTextContents();
        assert.match(paragraphs[0], /^Reporting period:/);
        assert.match(paragraphs[1], /^Unit:/);
        await preview.getByText('Unit detection details', {exact:true}).click();
        await preview.getByText('Test street 4', {exact:true}).waitFor();
        assert.equal(await page.getByRole('dialog', {name:'Automatic assignment preview',exact:true}).getByText('DH10', {exact:true}).count(), 1);
        assert.equal(await dialog.locator('[name="unitId"]').inputValue(), '1');
    });

    await test('dashboard Book transfers amounts without a matched unit', async page => {
        await page.route('**/booking-assignment-preview**', route => {
            if (route.request().method() === 'POST') return route.fulfill({json:{taskId:56}});
            if (route.request().method() === 'DELETE') return route.fulfill({json:{}});
            return route.fulfill({json:{status:'complete',result:{unitId:null,period:{start:'2025-01-01',end:'2025-12-31'},accounts:[{account:'2000',amount:123.45,confidence:'low',pages:[]}]}}});
        });
        await page.evaluate(() => openBooking({}, {createContext:'document',identifyDocumentUnit:true}));
        const dialog = page.getByRole('dialog', {name:'Add document',exact:true});
        await dialog.locator('input[type="file"]').setInputFiles({name:'statement.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-fixture')});
        const preview = page.getByRole('dialog', {name:'Automatic assignment preview',exact:true});
        await preview.getByRole('table').waitFor();
        assert.equal(await preview.getByRole('button', {name:'Book',exact:true}).isEnabled(), true);
        await preview.getByRole('button', {name:'Book',exact:true}).click();
        assert.equal(await dialog.locator('[name="unitId"]').inputValue(), '');
        assert.equal(await dialog.locator('[data-role="section-toggle"][data-section="booking"]').getAttribute('aria-expanded'), 'true');
        assert.equal(await dialog.locator('.domus-booking-entry [data-role="amount"]').first().inputValue(), '123.45');
        assert.equal(await dialog.locator('input[name="date"]').inputValue(), '2025-12-31');
    });

    await test('unit Add document offers assignment preview without a booking', async page => {
        await page.evaluate(() => Domus.Documents.openLinkModal('unit', 1));
        const dialog = page.getByRole('dialog', {name:'Add document',exact:true});
        await page.route('**/booking-assignment-preview**', route => {
            if (route.request().method() === 'POST') return route.fulfill({json:{taskId:55}});
            if (route.request().method() === 'DELETE') return route.fulfill({json:{}});
            return route.fulfill({json:{status:'complete',result:{period:{start:'2025-01-01',end:'2025-12-31'},accounts:[
                {account:'2000',amount:1939.39,confidence:'low',pages:[1]},
                {account:'2100',amount:0,confidence:'supported',pages:[1]},
                {account:'2200',amount:null,confidence:null,pages:[]}
            ]}}});
        });
        await dialog.locator('input[type="file"]').setInputFiles({name:'statement.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-fixture')});
        const preview = page.getByRole('dialog', {name:'Automatic assignment preview',exact:true});
        await preview.getByRole('table').waitFor();
        await preview.getByRole('button', {name:'Book',exact:true}).click();
        assert.equal(await dialog.locator('[data-role="section-toggle"][data-section="booking"]').getAttribute('aria-expanded'), 'true');
        assert.equal(await dialog.locator('input[name="date"]').inputValue(), '2025-12-31');
        assert.equal(await dialog.locator('input[name="deliveryDate"]').inputValue(), '2025-12-31');
        assert.deepEqual(await dialog.locator('.domus-booking-entry [data-role="account"]').evaluateAll(nodes => nodes.map(node => node.value).filter(Boolean)), ['2000','2100']);
        assert.deepEqual(await dialog.locator('.domus-booking-entry [data-role="amount"]').evaluateAll(nodes => nodes.map(node => node.value).filter(value => value !== '')), ['1939.39','0']);
        assert.equal(await dialog.isVisible(), true);
    });

    for (const source of ['upload', 'Nextcloud']) {
        await test(`assignment preview ${source}: empty fields, retry, evidence, focus and preserved draft`, async page => {
            const calls = [];
            let creates = 0;
            await page.route('**/booking-assignment-preview**', async route => {
                calls.push(route.request().method());
                if (route.request().method() === 'POST') return route.fulfill({json: {taskId: ++creates}});
                if (route.request().method() === 'DELETE') return route.fulfill({json: {}});
                if (creates === 1) return route.fulfill({status: 422, json: {message: 'No AI chat provider is available.'}});
                return route.fulfill({json: {status: 'complete', result: {
                    period: {start:'2025-01-01',end:'2025-12-31',source:'Abrechnungsperiode 2025',status:'found'},
                    accounts: ['2000','2100','2200'].map((account,index) => ({account,confidence:index===0?'supported':'low',pages:index===0?[2,3]:[],amount: index === 2 ? null : index === 1 ? 0 : 1939.39,source:'<b>Source evidence</b>',status:index===2?'not_found':'found'}))
                }}});
            });
            await page.evaluate(() => openBooking({unitId:1}, {assignmentPreview:true, initialDocumentSelection: null}));
            const booking = bookingDialog(page);
            await booking.waitFor();
            // The document section is optional in a new cost booking.
            await booking.getByText('Attach document (optional)', {exact:true}).click();
            await booking.getByRole('textbox',{name:'Description',exact:true}).fill('Keep this draft');
            if (source === 'upload') {
                await booking.locator('input[type="file"]').setInputFiles({name:'statement.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-fixture')});
            } else await booking.getByRole('button',{name:'Select existing file',exact:true}).click();
            const preview = page.getByRole('dialog',{name:'Automatic assignment preview',exact:true});
            await preview.getByText('No AI chat provider is available.',{exact:true}).waitFor();
            await preview.getByRole('button',{name:'Retry',exact:true}).click();
            await preview.getByRole('table').waitFor();
            assert.deepEqual(await preview.locator('tbody tr td:first-child').allTextContents(), ['Allocatable costs','Non-allocatable costs','Reserve contribution']);
            assert.equal(await preview.locator('tbody tr').count(),3);
            assert.equal(await preview.getByText('Evidence matched', {exact:true}).count(),1);
            assert.equal(await preview.getByText('Low confidence', {exact:true}).count(),1);
            assert.deepEqual(await preview.locator('tbody tr td:last-child').allTextContents(), ['2, 3', '—', '']);
            assert.equal(await preview.locator('tbody tr').last().locator('td').last().textContent(),'');
            assert.doesNotMatch(await preview.innerText(), /2000|2100|2200|Source evidence|Needs review|Building comparison|Not found/);
            assert.equal(await preview.locator('blockquote b').count(),0);
            assert.match(await preview.innerText(), /2025-01-01/);
            await preview.getByRole('button',{name:'Close',exact:true}).click();
            assert.equal(await booking.getByRole('textbox',{name:'Description',exact:true}).inputValue(),'Keep this draft');
            assert.equal(creates,2);
            await page.waitForTimeout(100);
            assert.equal(calls.filter(method => method === 'DELETE').length,2);
        });
    }
    await test('assignment preview shows queued and provider-reported running progress', async page => {
        let phase = 'queued';
        await page.route('**/booking-assignment-preview**', route => {
            if (route.request().method() === 'POST') return route.fulfill({json:{taskId:24}});
            if (route.request().method() === 'DELETE') return route.fulfill({json:{}});
            return route.fulfill({json:{status:'processing',phase,progress:phase==='running'?0.35:null}});
        });
        await page.evaluate(() => openBooking({unitId:1}, {assignmentPreview:true}));
        const booking = bookingDialog(page);
        await booking.getByText('Attach document (optional)',{exact:true}).click();
        await booking.getByRole('button',{name:'Select existing file',exact:true}).click();
        const preview = page.getByRole('dialog',{name:'Automatic assignment preview',exact:true});
        await preview.getByText('PDF text extracted. Waiting for the AI worker…',{exact:true}).waitFor();
        phase = 'running';
        await preview.getByText('AI is extracting the reporting period and suggested values… 35% complete',{exact:true}).waitFor();
    });

    await test('assignment preview reports the HTTP status for an HTML route error', async page => {
        await page.route('**/booking-assignment-preview', route => route.fulfill({status:404,contentType:'text/html',body:'<html>Not found</html>'}));
        await page.evaluate(() => openBooking({unitId:1}, {assignmentPreview:true}));
        const booking = bookingDialog(page);
        await booking.getByText('Attach document (optional)',{exact:true}).click();
        await booking.getByRole('button',{name:'Select existing file',exact:true}).click();
        await page.getByRole('dialog',{name:'Automatic assignment preview',exact:true})
            .getByText('Server request failed (404). Reload the page and try again.',{exact:true}).waitFor();
    });

    await test('assignment preview discards late creation after closure and stops on Team changes', async page => {
        let finish;
        let deletes = 0;
        await page.route('**/booking-assignment-preview**', async route => {
            if (route.request().method() === 'DELETE') { deletes++; return route.fulfill({json:{}}); }
            if (route.request().method() === 'POST') { await new Promise(resolve => {finish=resolve;}); return route.fulfill({json:{taskId:99}}); }
            return route.fulfill({json:{status:'processing'}});
        });
        await page.evaluate(() => openBooking({unitId:1}, {assignmentPreview:true}));
        const booking = bookingDialog(page);
        await booking.getByText('Attach document (optional)',{exact:true}).click();
        await booking.getByRole('button',{name:'Select existing file',exact:true}).click();
        const preview=page.getByRole('dialog',{name:'Automatic assignment preview',exact:true});
        await preview.getByText('Reading PDF and preparing AI request…',{exact:true}).waitFor();
        await preview.getByRole('button',{name:'Close',exact:true}).click();
        finish();
        await page.waitForTimeout(150);
        assert.equal(deletes,1);
        await booking.locator('input[type="file"]').setInputFiles({name:'second.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-fixture')});
        await preview.waitFor();
        await page.evaluate(() => {Domus.state.managementContext={activeTeamId:'other-team'};});
        await preview.waitFor({state:'detached'});
        finish();
        await page.waitForTimeout(150);
    });

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
        await page.locator('.domus-modal-footer button[form="domus-partner-form"]', {hasText: 'Save'}).click();
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
        await page.locator('.domus-modal-footer button[form="domus-partner-relation-form"]', {hasText: 'Save'}).click();
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

    await test('document picker starts in the currently selected unit document folder', async page => {
        await page.evaluate(() => {
            Domus.Api.getUnits = async () => [
                { id: 1, label: 'First unit', propertyId: 1, documentPath: '/Domus/First unit' },
                { id: 2, label: 'Second unit', propertyId: 1, documentPath: '/Custom/Second unit' },
                { id: 3, label: 'No folder', propertyId: 1 }
            ];
            window.pickerPaths = [];
            OC.dialogs.filepicker = (title, callback, multiple, mime, modal, type, path) => {
                window.pickerPaths.push(path ?? null);
                callback('/test/document.pdf');
            };
            Domus.Documents.openLinkModal('unit', 1, () => {});
        });
        await bookingDialog(page).waitFor();
        const picker = page.getByRole('button', { name: 'Select existing file', exact: true });
        await picker.click();
        assert.deepEqual(await page.evaluate(() => pickerPaths), ['/Domus/First unit']);
        await page.keyboard.press('Escape');
        await discard(page);
        await page.evaluate(() => openBooking({}, { createContext: 'document' }));
        await bookingDialog(page).waitFor();
        const unitSelect = bookingDialog(page).locator('select[name="unitId"]');
        await unitSelect.selectOption('2');
        await picker.click();
        await unitSelect.selectOption('3');
        await picker.click();
        await unitSelect.selectOption('');
        await picker.click();
        assert.deepEqual(await page.evaluate(() => pickerPaths), [
            '/Domus/First unit', '/Custom/Second unit', null, null
        ]);
    });

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
        assert.equal(await bookingDialog(page).locator('.domus-booking-document-preview').textContent(), 'document.pdf');
        assert.equal(await page.getByRole('textbox', {name: 'Title', exact: true}).inputValue(), 'Invoice.pdf');
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

    for (const withBooking of [false, true]) {
        await test(`new upload assigns a tenancy ${withBooking ? 'with' : 'without'} a booking`, async page => {
            await page.evaluate(withBooking => {
                Domus.Api.get = async () => [{id: 13, partners: [{name: 'New renter'}], startDate: '2026-01-01'}, {id: 14, unitLabel: 'Other unit', partners: [{name: 'Other renter'}]}];
                Domus.Api.attachDocumentToTargets = async payload => {window.savedAttachment = {type: payload.type, targets: payload.targets}; return [];};
                Domus.Api.createBooking = async () => ({id: 12});
                if (withBooking) openBooking({unitId: 1});
                else Domus.Documents.openLinkModal('unit', 1);
            }, withBooking);
            const editor = bookingDialog(page);
            if (withBooking) {
                await editor.getByRole('button', {name: 'Attach document (optional)', exact: true}).click();
                await editor.locator('[data-role="account"]').first().selectOption('2000');
                await editor.locator('[data-role="amount"]').first().fill('10');
            }
            const tenancy = editor.getByRole('group', {name: 'Assign to tenancies'});
            await tenancy.locator('[value="13"]').check();
            await tenancy.locator('[value="14"]').check();
            assert.match(await tenancy.innerText(), /New renter/);
            await editor.locator('input[type="file"]').setInputFiles({name: 'lease.txt', mimeType: 'text/plain', buffer: Buffer.from('lease')});
            await editor.getByRole('button', {name: 'Save', exact: true}).click();
            await waitClosed(page);
            const saved = await page.evaluate(() => window.savedAttachment);
            assert.equal(saved.type, 'upload');
            assert.deepEqual(saved.targets, [
                ...(withBooking ? [{entityType: 'booking', entityId: 12}] : []),
                {entityType: 'unit', entityId: '1'},
                {entityType: 'tenancy', entityId: '13'},
                {entityType: 'tenancy', entityId: '14'}
            ]);
        }, {width: 390, height: 844});
    }

    await test('document-only upload uses its date for 2025 and stays visible in the 2025 list', async page => {
        await page.evaluate(() => {
            Domus.Api.attachDocumentToTargets = async payload => {window.savedDocument = payload; return [];};
            Domus.Documents.openLinkModal('unit', 1);
        });
        const editor = bookingDialog(page);
        await editor.getByLabel('Document date', {exact: true}).fill('2025-06-15');
        await editor.locator('input[type="file"]').setInputFiles({name: 'old.txt', mimeType: 'text/plain', buffer: Buffer.from('2025 document')});
        await editor.getByRole('button', {name: 'Save', exact: true}).click();
        await waitClosed(page);
        assert.deepEqual(await page.evaluate(() => ({date: savedDocument.documentDate, year: savedDocument.year})), {date: '2025-06-15', year: 2025});
        await page.evaluate(() => {
            Domus.Api.getDocuments = async () => [{id: 90, documentDate: savedDocument.documentDate, createdAt: 1790000000, fileName: '2025 document', fileUrl: 'https://files.example.test/90'}];
            document.querySelector('#app-content').innerHTML = Domus.Documents.renderList('unit', 1, {year: 2025});
        });
        await page.getByRole('link', {name: '2025 document', exact: true}).waitFor();
    });

    await test('upload tenancy loading stays clean and supports retry', async page => {
        await page.evaluate(() => {
            window.failTenancies = false;
            Domus.Api.get = async () => {
                if (window.failTenancies) throw new Error('Unavailable');
                return [{id: 13, partners: [{name: 'New renter'}]}];
            };
            Domus.Documents.openLinkModal('unit', 1);
        });
        await bookingDialog(page).getByRole('group', {name: 'Assign to tenancies'}).waitFor();
        await bookingDialog(page).getByRole('button', {name: 'Close modal', exact: true}).click();
        await waitClosed(page);
        await page.evaluate(() => {
            window.failTenancies = true;
            Domus.Documents.openLinkModal('unit', 1);
        });
        await bookingDialog(page).getByText('Could not load tenancies.', {exact: true}).waitFor();
        await page.evaluate(() => {window.failTenancies = false;});
        await bookingDialog(page).getByRole('button', {name: 'Retry', exact: true}).click();
        await bookingDialog(page).getByRole('group', {name: 'Assign to tenancies'}).locator('[value="13"]').check();
        await bookingDialog(page).getByRole('button', {name: 'Close modal', exact: true}).click();
        await confirmDialog(page).waitFor();
    });

    await test('upload scopes tenancies to the selected unit and ignores delayed responses', async page => {
        await page.evaluate(() => {
            Domus.Api.getUnits = async () => [{id: 1, label: 'First unit'}, {id: 2, label: 'Second unit'}];
            Domus.Api.get = path => path === '/units/1/tenancies'
                ? new Promise(resolve => {window.resolveFirst = resolve;})
                : Promise.resolve([{id: 22, unitLabel: 'Second unit', partners: [{name: 'Second renter'}]}]);
            openBooking({}, {createContext: 'document'});
        });
        const editor = bookingDialog(page);
        const unit = editor.getByRole('combobox', {name: 'Unit', exact: true});
        await unit.selectOption('1');
        await unit.selectOption('2');
        await editor.getByRole('checkbox', {name: 'Second unit · Second renter', exact: true}).check();
        await page.evaluate(() => window.resolveFirst([{id: 11, partners: [{name: 'First renter'}]}]));
        assert.equal(await editor.getByRole('checkbox', {name: /First renter/}).count(), 0);
        assert.equal(await editor.getByRole('checkbox', {name: /Second renter/}).isChecked(), true);
        await unit.selectOption('');
        assert.equal(await editor.getByRole('checkbox').count(), 0);
    });

    await test('repeated document note edits retain the existing unit and booking relations', async page => {
        await page.evaluate(() => {
            window.documentNote = 'Original note';
            window.documentDates = [];
            window.documentTitles = [];
            window.unlinked = [];
            window.savedTargets = [];
            Domus.Api.getDocuments = async () => [{id: 7, fileName: 'Invoice.pdf', fileUrl: 'https://files.example.test/42', note: window.documentNote}];
            Domus.Api.getDocumentDetail = async () => ({
                document: {id: 7, filePath: '/Invoice.pdf', fileName: 'Invoice.pdf', note: window.documentNote},
                linkedEntities: [{id: 7, entityType: 'unit', entityId: 1}, {id: 8, entityType: 'booking', entityId: 2}, {id: 9, entityType: 'tenancy', entityId: 31}, {id: 10, entityType: 'tenancy', entityId: 32}]
            });
            Domus.Api.get = async path => path.endsWith('/tenancies') ? [] : {unitId: 1, account: '2000', amount: 100, date: '2026-09-25'};
            Domus.Api.updateBooking = async () => {};
            Domus.Api.attachDocumentToTargets = async payload => {
                window.documentNote = payload.note || '';
                window.documentDates.push(payload.documentDate);
                window.documentTitles.push(payload.title);
                window.savedTargets.push(payload.targets);
                return [{id: 8, entityType: 'booking', entityId: 2}, {id: 7, entityType: 'unit', entityId: 1}];
            };
            Domus.Api.unlinkDocument = async id => {window.unlinked.push(id);};
            document.querySelector('#app-content').innerHTML = Domus.Documents.renderList('unit', 1);
        });
        for (const note of ['Changed note', '']) {
            await page.getByRole('link', {name: 'Invoice.pdf', exact: true}).hover();
            await page.getByRole('button', {name: 'Edit document Invoice.pdf', exact: true}).click();
            const dialog = bookingDialog(page);
            await dialog.getByRole('textbox', {name: 'Note', exact: true}).fill(note);
            await dialog.getByLabel('Document date', {exact: true}).fill('2025-06-15');
            await dialog.getByRole('textbox', {name: 'Title', exact: true}).fill('Updated invoice');
            await dialog.getByRole('button', {name: 'Save', exact: true}).click();
            await waitClosed(page);
            assert.deepEqual(await page.evaluate(() => window.unlinked), []);
            assert.equal(await page.evaluate(() => window.documentNote), note);
        }
        assert.deepEqual(await page.evaluate(() => window.documentDates), ['2025-06-15', '2025-06-15']);
        assert.deepEqual(await page.evaluate(() => window.documentTitles), ['Updated invoice', 'Updated invoice']);
        assert.deepEqual(await page.evaluate(() => window.savedTargets), Array(2).fill([
            {entityType: 'booking', entityId: 2}, {entityType: 'unit', entityId: 1},
            {entityType: 'tenancy', entityId: 31}, {entityType: 'tenancy', entityId: 32}
        ]));
    });

    await test('document editor updates every linked booking by identity and preserves differing metadata', async page => {
        await page.evaluate(() => {
            window.updatedBookings = [];
            window.createdBookings = [];
            Domus.Accounts.toOptions = () => [{value: '', label: 'Select account'}, {value: '2000', label: 'Allocable'}, {value: '2100', label: 'Other'}];
            Domus.Api.getDocuments = async () => [{id: 7, fileName: 'Invoice.pdf'}];
            Domus.Api.getDocumentDetail = async () => ({
                document: {id: 7, filePath: '/Invoice.pdf', fileName: 'Invoice.pdf', documentDate: '2025-12-31'},
                linkedEntities: [{id: 7, entityType: 'unit', entityId: 1}, {id: 8, entityType: 'booking', entityId: 397}, {id: 9, entityType: 'booking', entityId: 396}]
            });
            Domus.Api.get = async path => path.endsWith('/tenancies') ? [] : {
                unitId: 1, account: path.endsWith('/397') ? '2000' : '2100',
                amount: path.endsWith('/397') ? 2843.3 : 906.85,
                date: path.endsWith('/397') ? '2025-12-31' : '2025-12-30',
                description: path.endsWith('/397') ? 'First' : 'Second'
            };
            Domus.Api.updateBooking = async (id, payload) => window.updatedBookings.push({id, payload});
            Domus.Api.createBooking = async payload => {window.createdBookings.push(payload); return {id: 398};};
            Domus.Api.attachDocumentToTargets = async () => [{id: 7}];
            document.querySelector('#app-content').innerHTML = Domus.Documents.renderList('unit', 1);
        });
        await page.locator('tr[data-doc-info="7"]').hover();
        await page.getByRole('button', {name: 'Edit document Invoice.pdf', exact: true}).click();
        const dialog = bookingDialog(page);
        const rows = dialog.locator('.domus-booking-entry');
        await rows.nth(2).waitFor();
        assert.equal(await rows.nth(0).locator('[data-role="amount"]').inputValue(), '2843.3');
        assert.equal(await rows.nth(1).locator('[data-role="amount"]').inputValue(), '906.85');
        await rows.nth(0).locator('[data-role="amount"]').fill('2800');
        await rows.nth(1).locator('[data-role="amount"]').fill('900');
        await rows.nth(2).locator('select').selectOption('2000');
        await rows.nth(2).locator('[data-role="amount"]').fill('50');
        await dialog.getByRole('button', {name: 'Save', exact: true}).click();
        await waitClosed(page);
        assert.deepEqual(await page.evaluate(() => window.updatedBookings), [
            {id: 397, payload: {account: '2000', amount: '2800'}},
            {id: 396, payload: {account: '2100', amount: '900'}}
        ]);
        const created = await page.evaluate(() => window.createdBookings);
        assert.equal(created.length, 1);
        assert.equal(created[0].amount, '50');
        assert.equal('row' in created[0], false);
        await page.locator('tr[data-doc-info="7"]').hover();
        await page.getByRole('button', {name: 'Edit document Invoice.pdf', exact: true}).click();
        await dialog.locator('[name="description"]').fill('Shared description');
        await dialog.getByRole('button', {name: 'Save', exact: true}).click();
        await waitClosed(page);
        assert.deepEqual(await page.evaluate(() => window.updatedBookings.slice(2).map(item => item.payload.description)), ['Shared description', 'Shared description']);
        await page.evaluate(() => {
            Domus.Api.get = async path => {
                if (path.endsWith('/396')) throw new Error('Cannot load second booking');
                return {unitId: 1, account: '2000', amount: 100, date: '2025-12-31'};
            };
        });
        await page.locator('tr[data-doc-info="7"]').hover();
        await page.getByRole('button', {name: 'Edit document Invoice.pdf', exact: true}).click();
        await page.getByText('Cannot load second booking', {exact: true}).waitFor();
        assert.equal(await dialog.count(), 0);
    });

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
            Domus.Api.attachDocumentToTargets = async payload => { window.savedAttachment = payload; return [{id: 7}, {id: 9}]; };
            Domus.Api.unlinkDocument = async id => { window.unlinkedDocument = id; };
            document.querySelector('#app-content').innerHTML = Domus.Documents.renderList('unit', 1);
        });
        await page.locator('tr[data-doc-info="7"]').hover();
        await page.getByRole('button', {name: 'Edit document Lease.pdf'}).click();
        const dialog = page.getByRole('dialog', {name: 'Edit document', exact: true});
        await dialog.waitFor();
        const tenancy = dialog.getByRole('group', {name: 'Assign to tenancies'});
        assert.deepEqual(await tenancy.locator('input').evaluateAll(options => options.map(option => option.value)), ['12', '13']);
        assert.equal(await tenancy.locator('[value="12"]').isChecked(), true);
        assert.doesNotMatch(await dialog.innerText(), /Already assigned to:/);
        await tenancy.locator('[value="13"]').check();
        await dialog.getByRole('button', {name: 'Save', exact: true}).click();
        await waitClosed(page);
        const saved = await page.evaluate(() => ({attachment: window.savedAttachment, unlinked: window.unlinkedDocument}));
        assert.equal(saved.attachment.type, 'link');
        assert.equal(saved.attachment.filePath, '/Domus/Unit/Lease.pdf');
        assert.deepEqual(saved.attachment.targets, [
            {entityType: 'unit', entityId: 1},
            {entityType: 'tenancy', entityId: 12},
            {entityType: 'tenancy', entityId: '13'}
        ]);
        assert.equal(saved.unlinked, null);
    });

    for (const width of [1280, 390]) {
        await test(`existing tenancy checkboxes are compact and removable (${width}px)`, async page => {
            await page.evaluate(() => {
                window.removedLinks = [];
                window.failAttachment = true;
                Domus.Api.getDocuments = async () => [{id: 7, fileName: 'Shared.pdf', fileUrl: 'https://files.example.test/42'}];
                Domus.Api.getDocumentDetail = async () => ({
                    document: {id: 7, filePath: '/Shared.pdf', fileName: 'Shared.pdf'},
                    linkedEntities: [{id: 7, entityType: 'unit', entityId: 1}, {id: 8, entityType: 'tenancy', entityId: 12}]
                });
                Domus.Api.get = async path => {
                    if (path !== '/units/1/tenancies') throw new Error('Wrong tenancy scope');
                    return [{id: 12, partners: [{name: 'Existing renter'}]}, {id: 13, partners: [{name: 'New renter'}]}];
                };
                Domus.Api.attachDocumentToTargets = async payload => {
                    if (window.failAttachment) throw new Error('Save failed');
                    window.savedTargets = payload.targets;
                    return [{id: 7}];
                };
                Domus.Api.unlinkDocument = async id => {window.removedLinks.push(Number(id));};
                document.querySelector('#app-content').innerHTML = Domus.Documents.renderList('unit', 1);
            });
            await page.getByRole('link', {name: 'Shared.pdf', exact: true}).hover();
            await page.getByRole('button', {name: 'Edit document Shared.pdf', exact: true}).click();
            const editor = bookingDialog(page);
            const existing = editor.getByRole('checkbox', {name: 'Existing renter', exact: true});
            assert.equal(await existing.isChecked(), true);
            assert.doesNotMatch(await editor.innerText(), /Already assigned to:/);
            const layout = await existing.evaluate(input => {
                const row = input.closest('label');
                const box = input.getBoundingClientRect();
                const text = row.querySelector('span').getBoundingClientRect();
                return {direction: getComputedStyle(row).flexDirection, rowHeight: row.getBoundingClientRect().height, listHeight: row.closest('fieldset').getBoundingClientRect().height, sameLine: Math.abs(box.y - text.y) < 12};
            });
            assert.equal(layout.direction, 'row');
            assert.ok(layout.rowHeight <= 40 && layout.listHeight <= 170 && layout.sameLine);
            await existing.uncheck();
            await editor.getByRole('checkbox', {name: 'New renter', exact: true}).check();
            await editor.getByRole('button', {name: 'Save', exact: true}).click();
            await page.getByText('Save failed', {exact: true}).waitFor();
            assert.deepEqual(await page.evaluate(() => window.removedLinks), []);
            await page.evaluate(() => {window.failAttachment = false;});
            await editor.getByRole('button', {name: 'Save', exact: true}).click();
            await waitClosed(page);
            assert.deepEqual(await page.evaluate(() => window.removedLinks), [8]);
            assert.deepEqual(await page.evaluate(() => window.savedTargets), [{entityType: 'unit', entityId: 1}, {entityType: 'tenancy', entityId: '13'}]);
        }, {width, height: 844});
    }

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

    await test('cleared booking description remains empty after saving and reopening', async page => {
        await page.evaluate(() => {
            window.fixtureBooking = {unitId: 1, account: '2000', amount: 100, date: '2026-09-25', description: 'Existing note'};
            Domus.Api.get = async () => window.fixtureBooking;
            Domus.Api.getDocuments = async () => [];
            Domus.Api.updateBooking = async (id, payload) => {
                window.savedBooking = payload;
                Object.assign(window.fixtureBooking, payload);
            };
            Domus.Units.refreshDetail = () => {};
            Domus.Bookings.openEditModal(7, {refreshView: 'unitDetail', refreshId: 1});
        });
        await bookingDialog(page).getByRole('textbox', {name: 'Description', exact: true}).fill('');
        await bookingDialog(page).getByRole('button', {name: 'Save', exact: true}).click();
        await waitClosed(page);
        assert.equal(await page.evaluate(() => window.savedBooking.description), '');
        await page.evaluate(() => Domus.Bookings.openEditModal(7));
        assert.equal(await bookingDialog(page).getByRole('textbox', {name: 'Description', exact: true}).inputValue(), '');
    });

    await test('booking edits preserve existing document links and remove only the chosen relation', async page => {
        await page.evaluate(() => {
            window.fixtureBooking = {unitId: 1, account: '2000', amount: 100, date: '2026-09-25', description: 'Old note'};
            window.fixtureDocuments = [7, 8].map(id => ({id, fileId: 42, filePath: '/Electricity.pdf', fileName: 'Electricity', fileUrl: 'https://files.example.test/42'}));
            window.attachments = [];
            window.unlinked = [];
            Domus.Api.get = async () => window.fixtureBooking;
            Domus.Api.getDocuments = async () => window.fixtureDocuments;
            Domus.Api.updateBooking = async (id, payload) => Object.assign(window.fixtureBooking, payload);
            Domus.Api.attachDocumentToTargets = async payload => window.attachments.push(payload);
            Domus.Api.unlinkDocument = async id => {
                if (window.failUnlink) throw new Error('Unlink failed');
                window.unlinked.push(Number(id));
                window.fixtureDocuments = window.fixtureDocuments.filter(doc => String(doc.id) !== String(id));
            };
            Domus.Units.refreshDetail = () => {};
            Domus.Bookings.openEditModal(7, {refreshView: 'unitDetail', refreshId: 1});
        });
        for (const note of ['Changed note', '']) {
            const editor = bookingDialog(page);
            await editor.getByRole('textbox', {name: 'Description', exact: true}).fill(note);
            await editor.getByRole('button', {name: 'Save', exact: true}).click();
            await waitClosed(page);
            assert.equal(await page.evaluate(() => window.attachments.length), 0);
            await page.evaluate(() => Domus.Bookings.openEditModal(7, {refreshView: 'unitDetail', refreshId: 1}));
        }
        const editor = bookingDialog(page);
        await editor.getByRole('heading', {name: 'Documents', exact: true}).waitFor();
        assert.equal(await editor.getByRole('button', {name: 'Attach document (optional)', exact: true}).count(), 0);
        assert.equal(await editor.locator('[data-section="document"]').getAttribute('data-enabled'), '1');
        const remove = editor.getByRole('button', {name: 'Remove document link Electricity', exact: true});
        assert.equal(await remove.count(), 2);
        await page.evaluate(() => {window.failUnlink = true;});
        await remove.first().click();
        await page.getByText('Unlink failed', {exact: true}).waitFor();
        assert.equal(await remove.count(), 2);
        await page.evaluate(() => {window.failUnlink = false;});
        await remove.first().click();
        await page.waitForFunction(() => document.querySelectorAll('[data-doc-unlink]').length === 1);
        assert.deepEqual(await page.evaluate(() => window.unlinked), [7]);
        assert.equal(await editor.getByRole('link', {name: 'Electricity', exact: true}).count(), 1);
        await editor.getByRole('textbox', {name: 'Description', exact: true}).fill('After unlink');
        await editor.getByRole('button', {name: 'Save', exact: true}).click();
        await waitClosed(page);
        assert.equal(await page.evaluate(() => window.attachments.length), 0);
        assert.equal(await page.evaluate(() => window.fixtureDocuments.length), 1);
    });

    for (const direct of [false, true]) {
    for (const width of [1280, 390]) {
        await test(`booking documents allow editing existing tenancy assignments ${direct ? 'directly' : 'in document editor'} (${width}px)`, async page => {
            await page.evaluate(() => {
                window.removedLinks = [];
                window.savedTargets = null;
                Domus.Api.getDocuments = async () => [{id: 7, fileName: 'Invoice.pdf', fileUrl: 'https://files.example.test/42'}];
                Domus.Api.getDocumentDetail = async () => ({
                    document: {id: 7, filePath: '/Invoice.pdf', fileName: 'Invoice.pdf'},
                    linkedEntities: [
                        {id: 7, entityType: 'booking', entityId: 402},
                        {id: 8, entityType: 'unit', entityId: 1},
                        {id: 9, entityType: 'tenancy', entityId: 12}
                    ]
                });
                Domus.Api.get = async path => path === '/units/1/tenancies'
                    ? [{id: 12, partners: [{name: 'Existing renter'}]}, {id: 13, partners: [{name: 'New renter'}]}]
                    : {unitId: 1, account: '2000', amount: 100, date: '2026-09-25', description: 'Existing booking'};
                Domus.Api.updateBooking = async () => {};
                Domus.Api.attachDocumentToTargets = async payload => {
                    window.savedTargets = payload.targets;
                    return [{id: 7}, {id: 8}, {id: 10}];
                };
                Domus.Api.unlinkDocument = async id => {window.removedLinks.push(Number(id));};
                Domus.Bookings.openEditModal(402);
            });
            const booking = page.getByRole('dialog', {name: 'Edit booking', exact: true});
            const selected = booking.getByRole('checkbox', {name: 'Existing renter', exact: true});
            await selected.waitFor();
            assert.equal(await selected.isChecked(), true);
            const layout = await selected.evaluate(input => {
                const fieldset = input.closest('fieldset');
                const root = fieldset.parentElement;
                const sections = root.previousElementSibling;
                return {
                    border: getComputedStyle(fieldset).borderTopWidth,
                    direction: getComputedStyle(input.closest('label')).flexDirection,
                    belowSections: sections.classList.contains('domus-booking-sections') && root.getBoundingClientRect().top >= sections.getBoundingClientRect().bottom,
                    lastInForm: root === root.parentElement.lastElementChild
                };
            });
            assert.equal(layout.border, '0px');
            assert.equal(layout.direction, 'row');
            assert.equal(layout.belowSections, true);
            // Persistent actions are moved into the modal footer.
            assert.equal(layout.lastInForm, true);
            let editor = booking;
            if (!direct) {
                await booking.getByRole('link', {name: 'Invoice.pdf', exact: true}).hover();
                await booking.getByRole('button', {name: 'Edit document Invoice.pdf', exact: true}).click();
                editor = page.getByRole('dialog', {name: 'Edit document', exact: true});
            }
            const existing = editor.getByRole('checkbox', {name: 'Existing renter', exact: true});
            assert.equal(await existing.isChecked(), true);
            await existing.uncheck();
            await editor.getByRole('checkbox', {name: 'New renter', exact: true}).check();
            await editor.getByRole('button', {name: 'Save', exact: true}).click();
            await editor.waitFor({state: 'detached'});
            assert.deepEqual(await page.evaluate(() => window.savedTargets), [
                {entityType: 'booking', entityId: 402},
                {entityType: 'unit', entityId: 1},
                {entityType: 'tenancy', entityId: '13'}
            ]);
            assert.deepEqual(await page.evaluate(() => window.removedLinks), [9]);
            if (!direct) {
                assert.equal(await booking.isVisible(), true);
                await booking.getByRole('button', {name: 'Cancel', exact: true}).click();
            }
            await waitClosed(page);
        }, {width, height: 844});
    }
    }

    for (const width of [1280, 390]) {
        await test(`closed-year booking displays locked fields and documents (${width}px)`, async page => {
            await page.evaluate(() => {
                window.writes = 0;
                Domus.Api.get = async () => ({unitId: 1, account: 2000, amount: 116.48, date: '2025-03-14', deliveryDate: '2025-03-14', description: 'Existing booking', yearClosed: true});
                Domus.Api.getDocuments = async () => [{id: 9, fileId: 42, fileName: 'Receipt', fileUrl: 'https://files.example.test/42'}];
                Domus.Api.updateBooking = Domus.Api.deleteBooking = Domus.Api.attachDocumentToTargets = Domus.Api.unlinkDocument = async () => {window.writes++;};
                Domus.Bookings.openEditModal(402);
            });
            const viewer = page.getByRole('dialog', {name: 'Display Booking', exact: true});
            await viewer.getByText('Year already closed', {exact: true}).waitFor();
            await viewer.getByRole('link', {name: 'Receipt', exact: true}).waitFor();
            assert.equal(await viewer.locator('[data-role="amount"]').inputValue(), '116.48');
            assert.equal(await viewer.getByRole('textbox', {name: 'Description', exact: true}).inputValue(), 'Existing booking');
            assert.equal(await viewer.locator('input:enabled, select:enabled, textarea:enabled').count(), 0);
            assert.equal(await viewer.getByRole('button', {name: /Save|Delete|Attach document|Select existing file|Remove document/}).count(), 0);
            assert.equal(await viewer.locator('input[type="file"]').count(), 0);
            assert.equal(await viewer.locator('[data-doc-info], [data-doc-unlink]').count(), 0);
            await viewer.getByRole('button', {name: 'Close', exact: true}).click();
            await waitClosed(page);
            assert.equal(await page.evaluate(() => window.writes), 0);
            await page.evaluate(() => Domus.Bookings.openEditModal(402));
            await viewer.waitFor();
            await page.keyboard.press('Escape');
            await waitClosed(page);
            assert.equal(await confirmDialog(page).count(), 0);
        }, {width, height: 844});
    }

    await test('booking deletion requires confirmation and refreshes the unit', async page => {
        await page.evaluate(() => {
            window.deletedBookings = [];
            window.refreshedUnits = [];
            Domus.Api.get = async () => ({unitId: 1, account: '2000', amount: 100, date: '2026-09-25'});
            Domus.Api.getDocuments = async () => [];
            Domus.Api.deleteBooking = async id => {window.deletedBookings.push(id);};
            Domus.Units.refreshDetail = id => {window.refreshedUnits.push(id);};
            Domus.Bookings.openEditModal(7, {refreshView: 'unitDetail', refreshId: 1});
        });
        const editor = bookingDialog(page);
        await editor.getByRole('button', {name: 'Delete', exact: true}).click();
        const confirmation = page.getByRole('dialog', {name: 'Delete Booking?', exact: true});
        await confirmation.getByRole('button', {name: 'Cancel', exact: true}).click();
        assert.deepEqual(await page.evaluate(() => window.deletedBookings), []);
        assert.equal(await editor.isVisible(), true);
        await editor.getByRole('button', {name: 'Delete', exact: true}).click();
        await confirmation.getByRole('button', {name: 'Delete', exact: true}).click();
        await waitClosed(page);
        assert.deepEqual(await page.evaluate(() => window.deletedBookings), [7]);
        assert.deepEqual(await page.evaluate(() => window.refreshedUnits), [1]);
    });

    for (const width of [1280, 390]) {
        await test(`tenancy checkboxes preserve partners and reject empty selection (${width}px)`, async page => {
            await page.evaluate(() => {
                Domus.Api.getPartners = async () => [
                    { id: 7, name: 'Gerhard', partnerType: 'tenant' },
                    { id: 8, name: 'Thomas', partnerType: 'tenant' },
                    { id: 9, name: 'Bhupinder', partnerType: 'tenant' }
                ];
                window.savedTenancy = null;
                Domus.Tenancies.openCreateModal({ unitId: 1, partnerIds: [8, '9'], baseRent: '900' }, () => {},
                    async data => { window.savedTenancy = data; return { id: 1 }; }, undefined, undefined, { useGuidedWorkflow: false });
            });
            const group = page.getByRole('group', { name: 'Partners', exact: true });
            await group.waitFor();
            assert.equal(await group.getByRole('checkbox', { name: 'Thomas', exact: true }).isChecked(), true);
            assert.equal(await group.getByRole('checkbox', { name: 'Bhupinder', exact: true }).isChecked(), true);
            assert.equal(await group.getByRole('checkbox', { name: 'Gerhard', exact: true }).isChecked(), false);
            assert.deepEqual(await group.locator('label').allTextContents(), ['Thomas', 'Bhupinder', 'Gerhard']);
            assert.equal(await group.locator('label').first().evaluate(label => getComputedStyle(label).flexDirection), 'row');
            const box = await group.boundingBox();
            assert.ok(box.height >= 132 && box.x >= 0 && box.x + box.width <= width);
            await group.getByRole('checkbox', { name: 'Thomas', exact: true }).focus();
            await page.keyboard.press('Space');
            await group.getByRole('checkbox', { name: 'Bhupinder', exact: true }).uncheck();
            await page.getByRole('button', { name: 'Save', exact: true }).click();
            assert.equal(await page.evaluate(() => window.savedTenancy), null);
            await page.getByText('Unit and at least one partner are required.', { exact: true }).waitFor();
            await group.getByRole('checkbox', { name: 'Thomas', exact: true }).check();
            await group.getByRole('checkbox', { name: 'Bhupinder', exact: true }).check();
            await page.screenshot({ path: `/tmp/tenancy-partners-${width}.png` });
            await page.getByRole('button', { name: 'Save', exact: true }).click();
            await waitClosed(page);
            assert.deepEqual(await page.evaluate(() => savedTenancy.partnerIds), ['8', '9']);
        }, { width, height: 900 });
    }

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
            const input = page.locator('form input:not([type="hidden"]):not([type="checkbox"]):not([disabled]), form textarea:not([disabled])').first();
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

    await test('attachment selection switches sources and resets without retaining files', async page => {
        const selections = await page.evaluate(() => {
            const widget = Domus.Documents.createAttachmentWidget();
            document.body.append(widget.root);
            const file = new File(['a'], 'A.pdf');
            widget.dropZone.setFile([file]);
            widget.setPath('/B.pdf');
            const linked = {
                display: widget.root.querySelector('.domus-dropzone-filename').textContent,
                type: widget.getSelection().type,
                path: widget.getSelection().filePath,
                files: widget.dropZone.input.files.length
            };
            widget.dropZone.setFile([file]);
            const uploaded = {type: widget.getSelection().type, file: widget.getSelection().file.name};
            widget.reset();
            return {linked, uploaded, reset: widget.getSelection(), filesAfterReset: widget.dropZone.input.files.length};
        });
        assert.deepEqual(selections, {
            linked: {display: 'B.pdf', type: 'link', path: '/B.pdf', files: 0},
            uploaded: {type: 'upload', file: 'A.pdf'},
            reset: null,
            filesAfterReset: 0
        });
    });

    for (const failure of ['attachment', 'booking']) {
        await test(`${failure} retry retains successful booking identities`, async page => {
            await page.evaluate(failure => {
                window.created = [];
                window.updated = [];
                window.attached = [];
                window.failBooking = failure === 'booking';
                Domus.Api.updateBooking = async (id, data) => updated.push({id, data});
                Domus.Api.createBooking = async data => {
                    if (data.amount === '20' && failBooking) {
                        failBooking = false;
                        throw new Error('Save failed');
                    }
                    created.push(data);
                    return {id: created.length};
                };
                Domus.Api.attachDocumentToTargets = async data => {
                    attached.push(data);
                    if (failure === 'attachment' && attached.length === 1) throw new Error('Save failed');
                    return [];
                };
                openBooking({unitId: 1}, {createContext: 'document'});
            }, failure);
            await bookingDialog(page).waitFor();
            await bookingDialog(page).getByRole('button', {name: 'Select existing file', exact: true}).click();
            await bookingDialog(page).getByRole('button', {name: 'Create a booking for this document', exact: true}).click();
            for (const [index, amount] of ['10', '20'].entries()) {
                await bookingDialog(page).locator('[data-role="account"]').nth(index).selectOption('2000');
                await bookingDialog(page).locator('[data-role="amount"]').nth(index).fill(amount);
            }
            await bookingDialog(page).getByRole('button', {name: 'Save', exact: true}).click();
            await page.getByText('Save failed', {exact: true}).waitFor();
            await bookingDialog(page).getByRole('button', {name: 'Save', exact: true}).click();
            await waitClosed(page);
            const result = await page.evaluate(() => ({
                created: created.length,
                updated: updated.map(item => item.id),
                attachedIds: attached.at(-1).targets.filter(target => target.entityType === 'booking').map(target => target.entityId)
            }));
            assert.equal(result.created, 2);
            assert.deepEqual(result.updated, failure === 'attachment' ? [1, 2] : [1]);
            assert.deepEqual(result.attachedIds, [1, 2]);
        });
    }

    await test('property-scoped editor retains allocation and unit', async page => {
        await page.evaluate(() => {
            Domus.Role.setRoleInfo({currentRole: 'buildingMgmt', availableRoles: ['buildingMgmt']});
            Domus.Api.getDocuments = async () => [];
            Domus.Api.get = async path => path.endsWith('/tenancies') ? [] : {
                id: 1, propertyId: 1, unitId: 1, date: '2026-01-01', deliveryDate: '2026-01-01', account: 2000, amount: 10
            };
            Domus.Bookings.openEditModal(1);
        });
        await bookingDialog(page).waitFor();
        await page.waitForFunction(() => !document.querySelector('#domus-booking-distribution').disabled);
        const result = await page.evaluate(() => ({
            distribution: document.querySelector('#domus-booking-distribution').value,
            unit: document.querySelector('[name="unitId"]').value,
            property: document.querySelector('[name="propertyId"]').value
        }));
        assert.deepEqual(result, {distribution: 'unit-allocation', unit: '1', property: '1'});
        assert.equal(await bookingDialog(page).getByText('Add multiple booking lines.', {exact: false}).count(), 0);
        await bookingDialog(page).getByRole('button', {name: 'Cancel', exact: true}).click();
        await waitClosed(page);
    });

    await test('section toggle preserves selected allocation without reloading options', async page => {
        await page.evaluate(() => {
            window.distributionLoads = 0;
            Domus.Role.setRoleInfo({currentRole: 'buildingMgmt', availableRoles: ['buildingMgmt']});
            Domus.Api.getDistributions = async () => {
                distributionLoads++;
                return [{id: 2, name: 'Area', type: 'area'}];
            };
            openBooking();
        });
        await bookingDialog(page).waitFor();
        await bookingDialog(page).locator('select[name="propertyId"]').selectOption('1');
        await page.waitForFunction(() => !document.querySelector('#domus-booking-distribution').disabled);
        await bookingDialog(page).locator('#domus-booking-distribution').selectOption('2');
        const toggle = bookingDialog(page).getByRole('button', {name: 'Attach document (optional)', exact: true});
        await toggle.click();
        await toggle.click();
        assert.equal(await bookingDialog(page).locator('#domus-booking-distribution').inputValue(), '2');
        assert.equal(await page.evaluate(() => distributionLoads), 1);
    });

    for (const key of ['Enter', 'Space']) {
        await test(`${key} on existing-file action opens only the Nextcloud picker`, async page => {
            await page.evaluate(() => {
                window.nativePicker = 0;
                window.cloudPicker = 0;
                HTMLInputElement.prototype.showPicker = function() { nativePicker++; };
                OC.dialogs.filepicker = () => { cloudPicker++; };
                openBooking({unitId: 1}, {createContext: 'document'});
            });
            await bookingDialog(page).waitFor();
            await bookingDialog(page).getByRole('button', {name: 'Select existing file', exact: true}).press(key);
            assert.deepEqual(await page.evaluate(() => ({native: nativePicker, cloud: cloudPicker})), {native: 0, cloud: 1});
            await bookingDialog(page).locator('.domus-dropzone').press(key);
            assert.equal(await page.evaluate(() => nativePicker), 1, 'Upload area remains keyboard accessible');
        });
    }

    await test('nested document editor leaves booking editing to its parent', async page => {
        await page.evaluate(() => {
            window.record = {id: 402, unitId: 1, account: 2000, amount: 100, date: '2026-09-25', deliveryDate: '2026-09-25', description: 'Existing'};
            window.bookingUpdates = [];
            Domus.Api.getDocuments = async () => [{id: 7, fileName: 'Invoice.pdf'}];
            Domus.Api.getDocumentDetail = async () => ({
                document: {id: 7, filePath: '/Invoice.pdf', fileName: 'Invoice.pdf'},
                linkedEntities: [{id: 7, entityType: 'booking', entityId: 402}, {id: 8, entityType: 'unit', entityId: 1}]
            });
            Domus.Api.get = async path => path.endsWith('/tenancies') ? [] : {...record};
            Domus.Api.updateBooking = async (id, data) => {
                bookingUpdates.push(id);
                Object.assign(record, data);
            };
            Domus.Api.attachDocumentToTargets = async () => [{id: 7}, {id: 8}];
            Domus.Bookings.openEditModal(402);
        });
        const parent = page.getByRole('dialog', {name: 'Edit booking', exact: true});
        await parent.getByRole('textbox', {name: 'Description', exact: true}).fill('Parent draft');
        await parent.getByRole('button', {name: 'Edit document Invoice.pdf'}).press('Enter');
        const child = page.getByRole('dialog', {name: 'Edit document', exact: true});
        await child.waitFor();
        assert.equal(await child.locator('[data-role="amount"]').count(), 0);
        await child.getByRole('textbox', {name: 'Note', exact: true}).fill('Updated document');
        await child.getByRole('button', {name: 'Save', exact: true}).click();
        await child.waitFor({state: 'detached'});
        assert.deepEqual(await page.evaluate(() => bookingUpdates), []);
        assert.equal(await parent.getByRole('textbox', {name: 'Description', exact: true}).inputValue(), 'Parent draft');
        await parent.getByRole('button', {name: 'Save', exact: true}).click();
        await waitClosed(page);
        const result = await page.evaluate(() => ({amount: record.amount, description: record.description, updates: bookingUpdates}));
        assert.deepEqual(result, {amount: '100', description: 'Parent draft', updates: [402]});
    });

    await browser.close();
    if (failures) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
