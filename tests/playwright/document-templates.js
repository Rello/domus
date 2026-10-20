/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

async function setup(page, ready) {
    await page.route('http://domus.test/**', route => route.fulfill({contentType: 'text/html', body: '<!doctype html>'}));
    await page.goto('http://domus.test/apps/domus/');
    await page.setContent('<div id="app-content" class="app-domus"><div id="domus-content"></div></div>');
    await page.addStyleTag({path: 'css/style.css'});
    await page.evaluate(() => {
        window.t = (app, value, params = {}) => value.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? key);
        window.OC = {generateUrl: path => path, requestToken: 'fixture'};
    });
    for (const name of ['CoreBundle', 'Units', 'Settings']) await page.addScriptTag({path: `js/domus${name}.js`});
    await page.evaluate(ready => {
        window.calls = [];
        window.template = {fileId: ready ? 42 : null, ready, name: ready ? 'Utility.docx' : '', error: ready ? '' : 'No document template configured.'};
        Domus.Api.get = async () => template;
        Domus.Api.getUnitStatistics = async () => ({});
        Domus.Api.getUnitSettlements = async () => [{groupId: 'p1', partnerId: 1, partnerName: 'Tenant', serviceCharge: 100, houseFee: 80, propertyTax: 5, saldo: 15}];
        Domus.Api.createUnitSettlementReport = async (id, payload) => {
            calls.push(payload);
            if (window.failGeneration) throw new Error('Template was removed');
            return {documents: [{fileId: 42, fileName: 'Draft.docx', fileUrl: '/file/42'}], reportPath: '/Draft.docx'};
        };
        Domus.Router.navigate = view => calls.push({view});
        Domus.UI.showNotification = message => { window.lastNotification = message; };
    }, ready);
}
async function preview(page) {
    await page.evaluate(() => Domus.UnitSettlements.openModal(7));
    await page.locator('#domus-settlement-year option').first().waitFor({state: 'attached'});
    await page.locator('#domus-settlement-continue').click();
    await page.getByText('Tenant', {exact: true}).waitFor();
    await page.locator('#domus-settlement-next').click();
}
(async () => {
    const browser = await chromium.launch({headless: true});
    let failures = 0;
    async function test(name, ready, run, width = 1280) {
        const page = await browser.newPage({viewport: {width, height: 900}});
        page.setDefaultTimeout(5000);
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        try { await setup(page, ready); await run(page); assert.deepEqual(errors, []); console.log('PASS ' + name); }
        catch (error) { failures++; console.error('FAIL ' + name + '\n' + error.stack); }
        finally { await page.close(); }
    }
    await test('missing template automatically creates Markdown', false, async page => {
        await preview(page);
        await page.getByText('No template is used. The default Markdown file will be created.', {exact: true}).waitFor();
        assert.equal(await page.locator('#domus-create-settlement').isEnabled(), true);
        assert.equal(await page.locator('#domus-settlement-markdown').count(), 0);
        await page.locator('#domus-create-settlement').click();
        await page.locator('#domus-settlement-close').waitFor();
        assert.equal(await page.evaluate(() => calls[0].format), 'md');
    }, 375);
    await test('unusable template automatically uses Markdown', true, async page => {
        await page.evaluate(() => { template.ready = false; template.error = 'File is inaccessible'; });
        await preview(page);
        await page.getByText('No template is used. The default Markdown file will be created.', {exact: true}).waitFor();
        await page.locator('#domus-create-settlement').click();
        await page.locator('#domus-settlement-close').waitFor();
        assert.equal(await page.evaluate(() => calls[0].format), 'md');
    });
    await test('creation waits until the template default is known', true, async page => {
        await page.evaluate(() => { Domus.Api.get = () => new Promise(resolve => { window.resolveTemplate = resolve; }); });
        await preview(page);
        assert.equal(await page.locator('#domus-create-settlement').isEnabled(), false);
        await page.evaluate(() => resolveTemplate(template));
        await page.getByText('Template used: Utility.docx', {exact: true}).waitFor();
        assert.equal(await page.locator('#domus-create-settlement').isEnabled(), true);
        assert.equal(await page.locator('#domus-settlement-markdown').count(), 0);
    });
    await test('assigned template creates DOCX', true, async page => {
        await preview(page);
        await page.locator('#domus-create-settlement').click();
        await page.locator('#domus-settlement-close').waitFor();
        assert.equal(await page.evaluate(() => calls[0].format), 'docx');
    });
    await test('generation error keeps the template default', true, async page => {
        await page.evaluate(() => { window.failGeneration = true; });
        await preview(page);
        await page.locator('#domus-create-settlement').click();
        await page.waitForFunction(() => window.lastNotification === 'Template was removed');
        await page.getByText('Template used: Utility.docx', {exact: true}).waitFor();
        assert.equal(await page.locator('#domus-create-settlement').isEnabled(), true);
        assert.equal(await page.locator('#domus-settlement-configure').count(), 0);
    });
    await test('settings selects an existing DOCX and can remove its assignment', false, async page => {
        await page.evaluate(() => {
            Domus.Api.getSettings = async () => ({settings: {}, utilityReportTemplate: template});
            Domus.Api.get = async () => [];
            Domus.Api.put = async (path, payload) => {
                calls.push({path, payload});
                return {fileId: payload.path ? 42 : null, ready: !!payload.path, name: payload.path ? 'Utility.docx' : '', error: payload.path ? '' : 'No document template configured.'};
            };
            Domus.TaskTemplates = {renderSection: () => '', loadTemplates: () => {}};
            Domus.Accounts = {renderSettingsSection: () => '', loadSettingsSection: () => {}};
            OC.dialogs = {filepicker: (title, callback) => callback('/DomusApp/Templates/Utility.docx')};
            Domus.Settings.render('documentTemplates');
        });
        await page.locator('#domus-template-add').waitFor();
        assert.equal(await page.locator('#domus-document-templates-panel .domus-section-header').getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator('#domus-template-list tbody tr').count(), 0);
        await page.locator('#domus-template-add').click();
        await page.locator('#domus-template-pick').click();
        assert.equal(await page.evaluate(() => calls.length), 0);
        await page.getByRole('dialog').filter({has: page.locator('#domus-template-form')}).getByRole('button', {name: 'Save', exact: true}).click();
        await page.locator('#domus-template-list').getByText('Utility.docx', {exact: true}).waitFor();
        assert.deepEqual(await page.locator('#domus-template-list th').allTextContents(), ['Document', 'Process', 'Scope', '']);
        assert.ok((await page.locator('#domus-template-list').innerText()).includes('Personal'));
        assert.equal(await page.locator('#domus-template-list tbody tr').count(), 1);
        assert.equal(await page.evaluate(() => calls[0].payload.path), '/DomusApp/Templates/Utility.docx');
        await page.locator('#domus-template-delete').click();
        await page.getByText('No document template configured.', {exact: true}).waitFor();
        assert.equal(await page.evaluate(() => calls[1].payload.path), '');
    });
    await test('assigned row shows Team scope and failed replacement keeps original', true, async page => {
        await page.evaluate(() => {
            Domus.state.managementContext = {activeTeamId: 'team-a'};
            const select = document.createElement('select'); select.id = 'domus-context-select';
            select.add(new Option('Example Team', 'team-a')); document.body.appendChild(select);
            Domus.Api.getSettings = async () => ({settings: {}, utilityReportTemplate: template});
            Domus.Api.get = async () => [];
            Domus.Api.put = async () => { throw new Error('File is inaccessible'); };
            Domus.TaskTemplates = {renderSection: () => '', loadTemplates: () => {}};
            Domus.Accounts = {renderSettingsSection: () => '', loadSettingsSection: () => {}};
            OC.dialogs = {filepicker: (title, callback) => callback(['/DomusApp/Templates/New.docx'])};
            Domus.Settings.render('documentTemplates');
        });
        await page.locator('#domus-template-list').getByText('Example Team', {exact: true}).waitFor();
        const bounds = await page.locator('#domus-template-list').evaluate(host => ({right: host.getBoundingClientRect().right, buttonRight: host.querySelector('button').getBoundingClientRect().right}));
        assert.ok(bounds.buttonRight <= bounds.right + 1, 'Delete stays within the panel on phones');
        await page.locator('#domus-template-add').press('Enter');
        await page.locator('#domus-template-pick').click();
        await page.getByRole('dialog').filter({has: page.locator('#domus-template-form')}).getByRole('button', {name: 'Save', exact: true}).click();
        await page.locator('#domus-template-error').getByText('File is inaccessible', {exact: true}).waitFor();
        assert.equal(await page.locator('#domus-template-list tbody tr').count(), 1);
        assert.ok((await page.locator('#domus-template-list').innerText()).includes('Utility.docx'));
        assert.equal(await page.getByRole('dialog').filter({has: page.locator('#domus-template-form')}).getByRole('button', {name: 'Save', exact: true}).isEnabled(), true);
        await page.locator('#domus-template-cancel').click();
        await page.locator('#domus-template-delete').click();
        assert.equal(await page.locator('#domus-template-list tbody tr').count(), 1);
    }, 390);
    await test('HTML server errors are readable instead of displaying page markup', false, async page => {
        await page.route('http://domus.test/apps/domus/api/settings/utility-template', route => route.fulfill({status: 404, contentType: 'text/html', body: '<!DOCTYPE html><html>Not found</html>'}));
        const message = await page.evaluate(async () => {
            try { await Domus.Api.put('/settings/utility-template', {path: ''}); }
            catch (error) { return error.message; }
        });
        assert.equal(message, 'Server request failed (404). Reload the page and try again.');
    });
    await browser.close();
    if (failures) process.exitCode = 1;
})();
