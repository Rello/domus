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
        if (page.url() === 'about:blank') {
        await page.route('http://domus.test/**', route => route.fulfill({contentType: 'text/html', body: '<!doctype html>'}));
        await page.goto('http://domus.test/apps/domus/');
    }
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
        await page.evaluate(() => {
            window.portfolioCalls = [];
            window.performanceMissing = false;
            window.performanceEmpty = false;
            window.performanceFail = false;
            window.performanceFixture = filters => {
                const years = performanceEmpty ? [] : [2024, 2025, new Date().getFullYear()];
                const trend = years.map((year, index) => {
                    const factor = .8 + index / 10;
                    const rows = [
                        {unitId: 1, label: 'Unit one', baseRent: 12000 * factor, netProfit: 9000 * factor, netRentability: .09 * factor, isProvisional: year !== 2024},
                        {unitId: 3, label: 'Unit three', baseRent: 24000 * factor, netProfit: 21000 * factor, netRentability: performanceMissing ? null : .07 * factor, isProvisional: year !== 2024}
                    ].filter(row => (!filters.unitId || String(row.unitId) === filters.unitId) && (!filters.propertyId || (row.unitId === 1 ? '2' : '4') === filters.propertyId));
                    const totals = {year, rows, baseRent: 0, netProfit: 0, totalCosts: 0, missingCosts: 0, isProvisional: year !== 2024};
                    rows.forEach(row => {totals.baseRent += row.baseRent; totals.netProfit += row.netProfit; totals.totalCosts += row.unitId === 1 ? 100000 : (performanceMissing ? 0 : 300000); if (row.unitId === 3 && performanceMissing) totals.missingCosts++;});
                    totals.netRentability = rows.length && !totals.missingCosts ? totals.netProfit / totals.totalCosts : null;
                    return totals;
                });
                return {years, trend, unitCount: performanceEmpty ? 0 : trend[0].rows.length, taxRate: .3};
            };
            Domus.Api.getPortfolioPerformance = async filters => {
                portfolioCalls.push(filters);
                if (performanceFail) throw new Error('fixture failure');
                return performanceFixture(filters);
            };
        });
        await page.setViewportSize({width: 1280, height: 900});
        await page.locator('#domus-analytics-preset').selectOption('portfolio');
        await page.locator('#domus-analytics-summary .domus-kpi-tile').first().waitFor();
        await page.locator('#domus-analytics-property').selectOption('');
        await page.waitForFunction(() => document.querySelector('#domus-analytics-summary').textContent.includes('30,000'));
        assert.equal(await page.locator('#domus-analytics-summary .domus-kpi-tile').count(), 3);
        assert.match(await page.locator('#domus-analytics-summary').innerText(), /7[.,]5/);
        assert.match(await page.locator('#domus-analytics-status').innerText(), /provisional/);
        assert.equal(await page.locator('#domus-analytics-year').isVisible(), false);
        assert.equal(await page.locator('#domus-analytics-month').count(), 0);
        assert.equal(await page.locator('#domus-analytics-values > table tbody tr').count(), 3);
        assert.match(await page.locator('#domus-analytics-values > table').innerText(), /2024/);
        assert.match(await page.locator('#domus-analytics-values > table').innerText(), /2025/);
        assert.deepEqual(await page.evaluate(() => Chart.getChart(document.querySelector('canvas')).data.datasets[0].data), [28800, 32400, 36000]);
        await page.locator('#domus-analytics-metric').selectOption('netProfit');
        assert.deepEqual(await page.evaluate(() => Chart.getChart(document.querySelector('canvas')).data.datasets[0].data), [24000, 27000, 30000]);
        await page.locator('#domus-analytics-metric').selectOption('netRentability');
        const ratios = await page.evaluate(() => Chart.getChart(document.querySelector('canvas')).data.datasets[0].data);
        assert.ok(ratios.every((value, index) => Math.abs(value - [.06, .0675, .075][index]) < 1e-10));
        await page.getByText('Details by unit and year', {exact: true}).click();
        await page.locator('#domus-analytics-values details details summary').first().click();
        assert.equal(await page.locator('#domus-analytics-values details details').first().locator('tbody tr').count(), 2);
        assert.match(await page.locator('#domus-analytics-values details details').first().locator('tbody th a').first().getAttribute('href'), /unit/);
        console.log('PASS all-year development chart, yearly metrics, weighted ratios and unit details without period selectors');
        await page.locator('#domus-analytics-unit').selectOption('1');
        await page.waitForFunction(() => document.querySelector('#domus-analytics-summary').textContent.includes('9.0 %'));
        await page.locator('#domus-analytics-property').selectOption('4');
        await page.waitForFunction(() => document.querySelector('#domus-analytics-summary').textContent.includes('21,000'));
        assert.equal(await page.locator('#domus-analytics-unit').inputValue(), '');
        assert.deepEqual(await page.evaluate(() => portfolioCalls.at(-1)), {unitId: '', propertyId: '4'});
        console.log('PASS property and unit scope filters without year or month API parameters');
        await page.evaluate(() => {performanceMissing = true;});
        await page.locator('#domus-analytics-property').selectOption('');
        await page.waitForFunction(() => document.querySelector('#domus-analytics-status').textContent.includes('acquisition costs are missing'));
        assert.equal(await page.locator('#domus-analytics-summary .domus-kpi-value').nth(2).innerText(), '—');
        assert.equal(await page.locator('canvas').isVisible(), false);
        await page.setViewportSize({width: 390, height: 844});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal(await page.locator('#domus-analytics-values > table').evaluate(table => table.scrollWidth > table.parentElement.clientWidth), true);
        await page.evaluate(() => {Domus.UI.renderContent('Other page'); Domus.Analytics.render();});
        await page.locator('#domus-analytics-summary .domus-kpi-tile').first().waitFor();
        assert.equal(await page.locator('#domus-analytics-year').isVisible(), false);
        assert.equal(await page.locator('#domus-analytics-metric').inputValue(), 'netRentability');
        console.log('PASS missing costs, phone layout and development selection continuity');
        if (process.env.DOMUS_ANALYTICS_SCREENSHOT) {
            await page.screenshot({path: process.env.DOMUS_ANALYTICS_SCREENSHOT + '-missing-phone.png', fullPage: true});
            await page.evaluate(() => {performanceMissing = false;});
            await page.locator('#domus-analytics-unit').selectOption('1');
            await page.locator('#domus-analytics-unit').selectOption('');
            await page.waitForFunction(() => document.querySelector('#domus-analytics-summary .domus-kpi-tile:last-child .domus-kpi-value').textContent !== '—');
            await page.locator('#domus-analytics-metric').selectOption('baseRent');
            await page.screenshot({path: process.env.DOMUS_ANALYTICS_SCREENSHOT + '-phone.png', fullPage: true});
            await page.setViewportSize({width: 1280, height: 900});
            await page.screenshot({path: process.env.DOMUS_ANALYTICS_SCREENSHOT + '-desktop.png', fullPage: true});
        }
        await page.evaluate(() => {performanceFail = true;});
        await page.locator('#domus-analytics-unit').selectOption('1');
        await page.getByRole('button', {name: 'Retry', exact: true}).waitFor();
        assert.equal(await page.locator('#domus-analytics-summary').isVisible(), false);
        await page.evaluate(() => {performanceFail = false; performanceEmpty = true;});
        await page.getByRole('button', {name: 'Retry', exact: true}).click();
        await page.waitForFunction(() => document.querySelector('#domus-analytics-status').textContent.includes('No units available'));
        assert.equal(await page.locator('canvas').isVisible(), false);
        await page.evaluate(() => {
            Domus.Api.getPortfolioPerformance = () => new Promise(resolve => {window.resolvePerformance = resolve;});
        });
        await page.locator('#domus-analytics-unit').selectOption('');
        await page.locator('#domus-analytics-preset').selectOption('annual');
        await page.locator('#domus-analytics-values tbody tr').first().waitFor();
        await page.evaluate(() => resolvePerformance(performanceFixture({})));
        await page.waitForTimeout(50);
        assert.equal(await page.locator('#domus-analytics-summary').isVisible(), false);
        assert.equal(await page.locator('canvas').isVisible(), true);
        assert.equal(await page.locator('#domus-analytics-portfolio-controls').isVisible(), false);
        assert.equal(await page.locator('#domus-analytics-year').isVisible(), true);
        console.log('PASS development retry, empty scope, stale responses and booking year selector restoration');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
