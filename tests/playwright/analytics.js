/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({headless: true});
    const page = await browser.newPage();
    try {
        await page.setContent('<div id="app-content" class="app-domus"></div>');
        await page.addStyleTag({path: 'css/style.css'});
        await page.evaluate(() => {
            window.t = (app, text) => text;
            window.OC = {generateUrl: path => path, requestToken: 'fixture'};
        });
        await page.addScriptTag({path: 'js/domusCoreBundle.js'});
        await page.addScriptTag({path: 'js/domusAccounts.js'});
        await page.addScriptTag({path: 'js/3rdParty/chart.umd.js'});
        await page.addScriptTag({path: 'js/domusAnalytics.js'});
        await page.evaluate(() => {
            Domus.Role.setRoleInfo({availableRoles: ['buildingMgmt'], currentRole: 'buildingMgmt'});
            document.getElementById('app-content').dataset.accounts = JSON.stringify([]);
            Domus.Accounts.toOptions = () => [{value:'02000',label:'2000 Parent'}, {value:'2000',label:'2000 Duplicate'}, {value:'2001',label:'— 2001 Child'}, {value:'4000',label:'4000 Other'}];
            window.calls = [];
            window.fail = false;
            window.empty = false;
            Domus.Api.getUnits = async () => [{id:1,label:'Unit one',propertyId:2}, {id:3,label:'Unit three',propertyId:4}];
            Domus.Api.getProperties = async () => [{id:2,name:'Property two'}, {id:4,name:'Property four'}];
            Domus.Api.getAccountTotals = async (accounts, filters) => {
                calls.push({accounts,filters});
                if (window.fail) throw new Error('fixture failure');
                if (window.empty) return {years:[],series:{}};
                return {years:[2024,2025],series:{2000:[10,100],2001:[20,200],4000:[0,0]}};
            };
            Domus.Analytics.render();
        });
        await page.locator('#domus-analytics-values tbody tr').first().waitFor();
        assert.deepEqual(await page.evaluate(() => calls[0].accounts), ['2000','2001','4000']);
        assert.match(await page.locator('#domus-analytics-values tfoot').innerText(), /300/);
        assert.equal(await page.locator('#domus-analytics-year').inputValue(), '2025');
        assert.equal(await page.locator('canvas').isVisible(), true);
        console.log('PASS default latest-year chart, normalized accounts and parent/child totals');
        await page.locator('#domus-analytics-preset').selectOption('trend');
        await page.waitForFunction(() => document.querySelector('#domus-analytics-values thead').textContent.includes('2024'));
        assert.match(await page.locator('#domus-analytics-values tfoot').innerText(), /30/);
        await page.locator('#domus-analytics-year').selectOption('2024');
        await page.locator('#domus-analytics-property').selectOption('2');
        await page.waitForFunction(() => document.querySelector('#domus-analytics-values tbody tr'));
        assert.equal(await page.locator('#domus-analytics-unit option').count(), 2);
        await page.locator('#domus-analytics-unit').selectOption('1');
        await page.waitForFunction(() => calls.at(-1).filters.unitId === '1');
        assert.deepEqual(await page.evaluate(() => calls.at(-1).filters), {propertyId:'2',unitId:'1'});
        console.log('PASS trend, year and property/unit scope changes');
        await page.locator('#domus-analytics-preset').selectOption('custom');
        await page.getByLabel('Search accounts').fill('Child');
        await page.getByRole('checkbox', {name:'— 2001 Child',exact:true}).press('Space');
        await page.waitForFunction(() => document.querySelector('#domus-analytics-values tbody tr'));
        assert.deepEqual(await page.evaluate(() => calls.at(-1).accounts), ['2001']);
        await page.evaluate(() => { Domus.UI.renderContent('Other page'); Domus.Analytics.render(); });
        await page.waitForFunction(() => document.querySelector('#domus-analytics-values tbody tr'));
        assert.equal(await page.locator('#domus-analytics-unit').inputValue(), '1');
        assert.equal(await page.locator('#domus-analytics-year').inputValue(), '2024');
        assert.equal(await page.getByLabel('Search accounts').inputValue(), 'Child');
        assert.equal(await page.getByRole('checkbox', {name:'— 2001 Child',exact:true}).isChecked(), true);
        console.log('PASS keyboard account selection and navigation continuity');
        await page.setViewportSize({width:390,height:844});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        console.log('PASS narrow viewport without page overflow');
        await page.evaluate(() => { window.fail = true; });
        await page.locator('#domus-analytics-unit').selectOption('');
        await page.getByRole('button', {name:'Retry',exact:true}).waitFor();
        assert.equal(await page.locator('canvas').isVisible(), false);
        assert.match(await page.locator('#domus-analytics-status').innerText(), /Could not load/);
        await page.evaluate(() => {window.fail = false; window.empty = true;});
        await page.getByRole('button', {name:'Retry',exact:true}).click();
        await page.waitForFunction(() => document.querySelector('#domus-analytics-status').textContent.includes('No recorded bookings'));
        assert.equal(await page.locator('canvas').isVisible(), false);
        console.log('PASS failure/retry and empty data without stale charts');
        // A failed obsolete request must not clear a newer successful chart.
        await page.evaluate(() => {
            window.empty = false;
            Domus.Api.getAccountTotals = (accounts, filters) => {
                if (filters.unitId === '1') return new Promise((resolve,reject) => {window.rejectOld = reject;});
                return Promise.resolve({years:[2025],series:{2001:[200]}});
            };
        });
        await page.locator('#domus-analytics-unit').selectOption('1');
        await page.locator('#domus-analytics-unit').selectOption('');
        await page.locator('#domus-analytics-values tbody tr').waitFor();
        await page.evaluate(() => window.rejectOld(new Error('obsolete')));
        await page.waitForTimeout(50);
        assert.equal(await page.locator('canvas').isVisible(), true);
        assert.equal(await page.locator('#domus-analytics-status').innerText(), '');
        console.log('PASS obsolete request rejection preserves current results');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
