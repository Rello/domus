/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

async function setup(page) {
    await page.setContent('<div id="app-navigation"></div><div id="app-content" class="app-domus"><div id="domus-content"></div></div>');
    await page.addStyleTag({path: 'css/style.css'});
    await page.evaluate(() => {
        window.t = (app, value, params = {}) => value.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? key);
        window.OC = {generateUrl: path => path, requestToken: 'fixture'};
    });
    for (const module of ['CoreBundle', 'Wizard', 'ActionLog', 'Accounts', 'Distributions', 'Tasks', 'Dashboard', 'Analytics', 'Properties', 'Units', 'Partners', 'Tenancies', 'Bookings', 'Settings', 'Documents']) {
        await page.addScriptTag({path: `js/domus${module}.js`});
    }
    await page.evaluate(() => {
        Domus.Role.setRoleInfo({availableRoles: ['landlord'], currentRole: 'landlord'});
        const unit = {id: 1, label: 'Test unit', propertyId: 2, activeTenancies: [], futureTenancies: [{id: 9, startDate: '2099-01-01', partnerName: 'Future renter'}], historicTenancies: [], currentTenancy: null};
        Domus.Api.get = async () => unit;
        Domus.Api.getUnitStatistics = async () => ({revenue: {rows: [], columns: []}, cost: {rows: [], columns: []}});
        Domus.Api.getSettings = async () => ({settings: {taxRate: '25'}});
        Domus.Api.getBookings = async () => [];
        Domus.Api.getUnitPartners = async () => [];
        Domus.Api.getProperties = async () => [{id: 2, name: 'Test property'}];
        Domus.Api.getProperty = async () => ({id: 2, name: 'Test property', units: [unit]});
        Domus.Api.getUnits = async () => [unit];
        Domus.Api.getDocuments = async () => [];
        Domus.Api.getActionLogs = async () => [];
        Domus.Api.getTasksByEntity = async () => [];
        Domus.Api.getWorkflowRunsByEntity = async () => [];
        Domus.Api.getDashboardSummary = async () => ({openTasks: []});
        Domus.Api.getPropertyPartners = async () => [];
        Domus.Distributions.loadForUnit = async () => [];
        Domus.Distributions.loadForProperty = async () => [];
        Domus.Router.register('unitDetail', Domus.Units.renderDetail);
        Domus.Router.register('propertyDetail', Domus.Properties.renderDetail);
        window.imageWrites = [];
        for (const entity of ['Unit', 'Property']) {
            Domus.Api['remove' + entity + 'Image'] = async id => {
                window.imageWrites.push({entity, id, action: 'remove'});
                if (window.failImageSave) throw new Error('Image save failed');
            };
            Domus.Api['upload' + entity + 'Image'] = async (id, file) => {
                window.imageWrites.push({entity, id, action: 'upload', name: file.name});
            };
        }
    });
}

async function main() {
    const browser = await chromium.launch({headless: true});
    let failures = 0;
    async function test(name, action) {
        const page = await browser.newPage();
        page.setDefaultTimeout(5000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
            await setup(page);
            await action(page);
            assert.deepEqual(errors, []);
            console.log('PASS ' + name);
        } catch (error) {
            failures++;
            console.error('FAIL ' + name + '\n' + error.stack);
        } finally { await page.close(); }
    }
    await test('shared KPI types preserve zero, escape text and handle missing values consistently', async page => {
        const values = await page.evaluate(() => {
            const read = html => {
                const element = document.createElement('div');
                element.innerHTML = html;
                return element.querySelector('.domus-kpi-value').textContent;
            };
            return ['money', 'percentage', 'count', 'contact', 'documents'].map(type => ({
                type,
                zero: read(Domus.UI.buildTypedKpiTile(type, {headline: 'Metric', value: 0})),
                missing: [undefined, null, ''].map(value => read(Domus.UI.buildTypedKpiTile(type, {headline: 'Metric', value}))),
                text: Domus.UI.buildTypedKpiTile(type, {headline: '<script>bad</script>', value: 1, detailTarget: 'revenue'})
            }));
        });
        for (const result of values) {
            assert.match(result.zero, /0/);
            assert.deepEqual(result.missing, ['—', '—', '—']);
            assert.ok(!result.text.includes('<script>'));
            assert.match(result.text, /data-kpi-target="revenue"/);
        }
        assert.equal(values.find(value => value.type === 'count').zero, '0');
    });
    await test('unit current tenancy stays vacant while future tenancy remains accessible', async page => {
        await page.evaluate(() => Domus.Router.navigate('unitDetail', [1]));
        await page.getByRole('navigation', {name: 'Unit sections'}).waitFor();
        assert.match(await page.locator('.domus-detail-hero').textContent(), /Vacant/);
        assert.ok(!(await page.locator('.domus-unit-tenancy-kpi-value').textContent()).includes('Future renter'));
        await page.getByRole('navigation', {name: 'Unit sections'}).getByRole('link', {name: 'Tenancies'}).click();
        assert.match(await page.locator('#domus-unit-kpi-detail').textContent(), /Future renter/);
    });
    await test('shared empty tenancy section preserves read-only role permissions', async page => {
        await page.evaluate(() => {
            Domus.Role.setRoleInfo({availableRoles: ['tenant'], currentRole: 'tenant'});
            Domus.Api.get = async () => ({id: 1, label: 'Empty unit', activeTenancies: [], historicTenancies: []});
            Domus.Router.navigate('unitDetail', [1, 'tenancies']);
        });
        await page.getByRole('navigation', {name: 'Unit sections'}).waitFor();
        assert.equal(await page.locator('#domus-add-tenancy-inline, #domus-unit-tenancies-empty-create').count(), 0);
    });
    for (const entity of ['unit', 'property']) {
        await test(entity + ' picture editor protects upload and removal, retries failed saves', async page => {
            const id = entity === 'unit' ? 1 : 2;
            await page.evaluate(({entity, id}) => Domus.Router.navigate(entity + 'Detail', [id]), {entity, id});
            await page.locator('#domus-' + entity + '-image-edit').click();
            const dialog = page.getByRole('dialog', {name: 'Edit picture', exact: true});
            await dialog.locator('input[type=file]').setInputFiles({name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.from('image fixture')});
            await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
            await page.getByRole('dialog', {name: 'Discard changes?', exact: true}).getByRole('button', {name: 'Keep editing'}).click();
            assert.equal(await dialog.locator('input[name=imageAction]').inputValue(), 'upload');
            await dialog.getByRole('button', {name: 'Use default image'}).click();
            assert.equal(await dialog.locator('input[name=imageAction]').inputValue(), 'remove');
            await dialog.press('Escape');
            await page.getByRole('dialog', {name: 'Discard changes?', exact: true}).getByRole('button', {name: 'Keep editing'}).click();
            await page.evaluate(() => { window.failImageSave = true; });
            await dialog.getByRole('button', {name: 'Save', exact: true}).click();
            await page.getByText('Image save failed', {exact: true}).waitFor();
            assert.ok(await dialog.isVisible());
            await page.evaluate(() => { window.failImageSave = false; });
            await dialog.getByRole('button', {name: 'Save', exact: true}).click();
            await dialog.waitFor({state: 'detached'});
            assert.deepEqual(await page.evaluate(() => window.imageWrites), [
                {entity: entity === 'unit' ? 'Unit' : 'Property', id, action: 'remove'},
                {entity: entity === 'unit' ? 'Unit' : 'Property', id, action: 'remove'}
            ]);
        });
    }
    await browser.close();
    if (failures) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
