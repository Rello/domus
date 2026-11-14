/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

(async () => {
    const browser = await chromium.launch({headless: true});
    let checks = 0;
    try {
        for (const width of [1280, 390]) {
            const page = await browser.newPage({viewport: {width, height: 900}});
            const requests = [];
            let rejectRemoval = false;
            let blocked = false;
            let failYears = false;
            await page.route('http://history.test/**', async route => {
                const request = route.request();
                const path = new URL(request.url()).pathname;
                if (!path.includes('/api/')) return route.fulfill({contentType: 'text/html', body: '<div id="app-content"><div id="domus-content"></div></div>'});
                if (path.endsWith('/statistics/units/1')) return failYears
                    ? route.fulfill({status: 500, json: {message: 'Could not load years'}})
                    : route.fulfill({json: {revenue: {rows: [{year: 2024}, {year: 2023}, {year: 2024}]}, cost: {rows: [{year: 2021}]}}});
                const data = request.postDataJSON();
                requests.push({path, data});
                if (path.endsWith('/remove')) return rejectRemoval
                    ? route.fulfill({status: 409, json: {message: 'Financial history changed. Create a new preview before removing it.'}})
                    : route.fulfill({json: {removed: true}});
                return route.fulfill({json: {
                    year: data.year, cutoff: `${data.year}-01-01`, scopeLabel: 'Flat <script>bad()</script>', unitCount: data.propertyId ? 2 : 1,
                    token: `preview-${requests.length}`, hasChanges: true,
                    bookings: [{id: 10, year: 2022, date: '2022-01-01', description: '<img src=x onerror=bad()>', amount: 123.45, unit: 'Flat'}],
                    deleteTenancies: [{id: 20, startDate: '2020-01-01', endDate: '2023-12-31', unit: 'Flat'}],
                    adjustTenancies: [{id: 21, startDate: '2022-05-01', endDate: null, newStartDate: `${data.year}-01-01`, unit: 'Flat', note: 'Original date 2022-05-01 retained in note.'}],
                    preservedDocuments: 3, removedClosures: 1, removedActivities: 1, closedTasks: 1,
                    blockers: blocked ? ['Remove history for the whole property instead.'] : []
                }});
            });
            await page.goto('http://history.test/apps/domus/');
            await page.addStyleTag({path: 'css/style.css'});
            await page.evaluate(() => {
                window.t = (app, value, params = {}) => value.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? key);
                window.OC = {generateUrl: value => value, requestToken: 'test'};
            });
            for (const module of ['CoreBundle', 'Units']) await page.addScriptTag({path: `js/domus${module}.js`});
            await page.evaluate(() => {
                window.refreshes = 0;
                Domus.UI.showNotification = message => { window.notification = message; };
                Domus.Units.openFinancialHistoryModal({unitId: 1}, () => { window.refreshes++; });
            });
            assert.equal(requests.length, 0);
            assert.equal(await page.locator('#domus-history-remove').count(), 0);
            await page.locator('#domus-history-year option').first().waitFor({state: 'attached'});
            assert.deepEqual(await page.locator('#domus-history-year option').evaluateAll(options => options.map(option => option.value)), ['2024', '2023', '2021']);
            assert.equal(await page.getByLabel('First retained year').inputValue(), '2021');
            assert.equal(await page.getByLabel('Scope', {exact: true}).count(), 0);
            assert.equal(await page.getByRole('dialog').getByText('Flat', {exact: true}).count(), 0);
            await page.getByLabel('First retained year').selectOption('2024');
            await page.getByRole('button', {name: 'Preview', exact: true}).click();
            await page.locator('#domus-history-confirm').waitFor();
            assert.deepEqual(requests[0].data, {year: 2024, unitId: 1});
            assert.equal(await page.locator('#domus-history-remove').isDisabled(), true);
            assert.equal(await page.locator('#domus-history-preview script, #domus-history-preview img').count(), 0);
            assert(!(await page.locator('#domus-history-preview').textContent()).includes('Original date 2022-05-01'));
            checks++;

            await page.locator('#domus-history-confirm').check();
            assert.equal(await page.locator('#domus-history-remove').isEnabled(), true);
            await page.getByLabel('First retained year').selectOption('2023');
            assert.equal(await page.locator('#domus-history-remove').count(), 0);
            assert.equal(await page.locator('#domus-history-preview').count(), 0);
            await page.getByRole('button', {name: 'Preview', exact: true}).click();
            await page.locator('#domus-history-confirm').waitFor();
            assert.deepEqual(requests[1].data, {year: 2023, unitId: 1});
            checks++;

            rejectRemoval = true;
            await page.locator('#domus-history-confirm').check();
            await page.locator('#domus-history-remove').click();
            await page.getByRole('alert').filter({hasText: 'Create a new preview'}).waitFor();
            assert.equal(await page.locator('#domus-history-remove').count(), 0);
            assert.deepEqual(requests[2].data, {year: 2023, unitId: 1, token: 'preview-2'});
            assert.equal(await page.evaluate(() => window.refreshes), 0);
            checks++;

            blocked = true;
            await page.getByRole('button', {name: 'Preview', exact: true}).click();
            await page.getByRole('alert').filter({hasText: 'whole property'}).waitFor();
            assert.equal(await page.locator('#domus-history-remove').count(), 0);
            checks++;

            blocked = false;
            rejectRemoval = false;
            await page.getByRole('button', {name: 'Preview', exact: true}).click();
            await page.locator('#domus-history-confirm').waitFor();
            await page.locator('#domus-history-confirm').check();
            await page.locator('#domus-history-remove').click();
            await page.waitForFunction(() => window.refreshes === 1);
            assert.equal(await page.getByRole('dialog').count(), 0);
            assert.equal(await page.evaluate(() => window.notification), 'Financial history removed. Documents were preserved.');
            checks++;

            await page.evaluate(() => Domus.Units.openFinancialHistoryModal({unitId: 1}));
            await page.keyboard.press('Escape');
            assert.equal(await page.getByRole('dialog').count(), 0);
            assert.equal(requests.filter(request => request.path.endsWith('/remove')).length, 2);
            failYears = true;
            await page.evaluate(() => Domus.Units.openFinancialHistoryModal({unitId: 1}));
            await page.getByRole('alert').filter({hasText: 'Could not load years'}).waitFor();
            assert.equal(await page.getByLabel('First retained year').isDisabled(), true);
            failYears = false;
            await page.getByRole('button', {name: 'Retry', exact: true}).click();
            await page.locator('#domus-history-year option').first().waitFor({state: 'attached'});
            await page.keyboard.press('Escape');
            checks++;
            await page.evaluate(() => {
                Domus.state.managementContext = {permissions: {deleteRecords: false}, activeTeamId: 'team'};
                Domus.Units.openFinancialHistoryModal({unitId: 1});
            });
            assert.equal(await page.getByRole('dialog').count(), 0);
            checks++;
            await page.close();
        }
        console.log(`Financial history: ${checks} checks passed (desktop and phone preview, consent, changed parameters, conflicts, document preservation, cancellation and permissions).`);
    } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exit(1);});
