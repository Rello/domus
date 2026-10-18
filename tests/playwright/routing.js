/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({headless: true});
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('http://domus.test/**', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><div id="domus-content"></div>'}));
        async function load(url, base = '/apps/domus') {
            await page.goto(url);
            await page.evaluate(base => {
                window.t = (app, text) => text;
                window.OC = {generateUrl: path => base.replace(/\/apps\/domus$/, '') + path};
            }, base);
            await page.addScriptTag({path: 'js/domusCoreBundle.js'});
            await page.evaluate(() => {
                Domus.Navigation.render = () => {};
                for (const name of ['dashboard', 'unitDetail', 'units', 'renter']) {
                    Domus.Router.register(name, (...args) => {
                        document.getElementById('domus-content').textContent = JSON.stringify([name, ...args]);
                    });
                }
                Domus.Router.navigateFromUrl();
            });
        }
        const rendered = () => page.locator('#domus-content').textContent();
        await load('http://domus.test/apps/domus/unitDetail/8/documents');
        assert.equal(await rendered(), '["unitDetail","8","documents"]');
        await load(page.url());
        assert.equal(await rendered(), '["unitDetail","8","documents"]');
        console.log('PASS direct deep links and reload retain unit sections');

        await page.evaluate(() => Domus.Router.navigate('units'));
        assert.equal(new URL(page.url()).hash, '');
        await page.goBack();
        await page.waitForFunction(() => Domus.state.currentView === 'unitDetail');
        assert.equal(await rendered(), '["unitDetail","8","documents"]');
        await page.goForward();
        await page.waitForFunction(() => Domus.state.currentView === 'units');
        console.log('PASS browser Back and Forward restore the exact route');

        await page.evaluate(() => {
            window.routingMarker = true;
            document.body.insertAdjacentHTML('beforeend', '<a id="route-link" href="' + Domus.Router.url('unitDetail', ['8', 'revenue']) + '">Finances</a>');
        });
        await page.locator('#route-link').click();
        assert.equal(await rendered(), '["unitDetail","8","revenue"]');
        assert.equal(await page.evaluate(() => window.routingMarker), true);
        console.log('PASS ordinary route links navigate without reloading');

        await load('http://domus.test/cloud/index.php/apps/domus/unitDetail/a%2Fb/hello%20world', '/cloud/index.php/apps/domus');
        assert.equal(await rendered(), '["unitDetail","a/b","hello world"]');
        assert.equal(page.url(), 'http://domus.test/cloud/index.php/apps/domus/unitDetail/a%2Fb/hello%20world');
        console.log('PASS encoded arguments, subdirectory and index.php installations');
        const apiRequests = [];
        await page.route('http://domus.test/**/api/**', route => {
            apiRequests.push(new URL(route.request().url()).pathname);
            return route.fulfill({contentType: 'application/json', body: '[]'});
        });
        await page.evaluate(async () => {
            await Domus.Api.getUnits();
            await Domus.Api.get('/tasks');
        });
        assert.deepEqual(apiRequests, ['/cloud/index.php/apps/domus/api/units', '/cloud/index.php/apps/domus/api/tasks']);
        console.log('PASS data requests use the API root separately from page URLs');

        await page.evaluate(() => {
            Domus.state.managementContext = {mode: 'external'};
            Domus.Router.navigate('unitDetail', ['8']);
        });
        assert.equal(await rendered(), '["renter"]');
        assert.equal(new URL(page.url()).hash, '');
        assert.deepEqual(errors, []);
        console.log('PASS renter navigation remains restricted');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
