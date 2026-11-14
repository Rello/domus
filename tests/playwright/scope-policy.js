/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async () => {
    const browser = await chromium.launch({headless: true});
    try {
        for (const admin of [true, false]) {
            const page = await browser.newPage({viewport: {width: 390, height: 844}});
            const requests = [];
            let saves = 0;
            await page.route('http://policy.test/**', async route => {
                const req = route.request();
                const path = new URL(req.url()).pathname;
                if (!path.startsWith('/apps/domus/api/')) return route.fulfill({contentType: 'text/html', body: '<header id="header"><div class="header-start"></div></header><div id="app-navigation"></div><div id="app-content"><div id="domus-content"></div></div>'});
                requests.push(path);
                if (req.method() === 'PUT') {
                    assert.deepEqual(req.postDataJSON(), {allowPersonal: false, enabledTeamIds: ['b']});
                    saves++;
                    return route.fulfill({status: 500, json: {message: 'Save failed'}});
                }
                const teams = [{teamId: 'a', displayName: 'Assigned <Team>'}, {teamId: 'b', displayName: 'Other Team'}];
                return route.fulfill({json: path.endsWith('access-policy') ? {allowPersonal: false, enabledTeamIds: ['a'], teams} : {allowPersonal: false, teams: teams.slice(0, 1)}});
            });
            await page.goto('http://policy.test/apps/domus/');
            await page.evaluate(() => {
                window.t = (app, value) => value;
                window.OC = {generateUrl: value => value, requestToken: 'test'};
            });
            await page.addScriptTag({path: 'js/domusCoreBundle.js'});
            await page.addScriptTag({path: 'js/domusSettings.js'});
            await page.evaluate(admin => {
                Domus.state.managementContext = {mode: 'unavailable', isAdmin: admin, allowPersonal: false};
                Domus.UI.showNotification = message => { window.lastNotification = message; };
                Domus.Role.setRoleInfo({currentRole: 'landlord', availableRoles: ['landlord']});
                Domus.Router.register('settings', Domus.Settings.render);
                Domus.Router.navigate('dashboard');
            }, admin);
            await page.locator('.domus-team-chip').first().waitFor();
            assert.equal(await page.getByText('Teams must be enabled for Domus by a Nextcloud administrator.').count(), admin ? 0 : 1);
            await page.locator('#domus-context-select option').nth(1).waitFor({state: 'attached'});
            assert.equal(await page.locator('#domus-context-select').textContent(), 'Select a Team.Assigned <Team>');
            assert.equal(await page.locator('#domus-access-policy').locator('script').count(), 0);
            if (admin) {
                await page.locator('.domus-team-chip button').click();
                assert.equal(await page.locator('.domus-team-chip').count(), 0);
                await page.getByRole('button', {name: 'Add', exact: true}).click();
                await page.getByLabel('Other Team', {exact: true}).check();
                await page.getByRole('button', {name: 'Cancel', exact: true}).click();
                assert.equal(await page.locator('.domus-team-chip').count(), 0);
                await page.getByRole('button', {name: 'Add', exact: true}).click();
                await page.getByLabel('Search Teams').fill('Other');
                assert.equal(await page.locator('[data-team-row]').first().isVisible(), false);
                await page.getByLabel('Search Teams').fill('');
                await page.getByLabel('Assigned <Team>', {exact: true}).uncheck();
                await page.getByLabel('Other Team', {exact: true}).check();
                await page.getByRole('button', {name: 'Apply', exact: true}).click();
                assert.equal(await page.locator('.domus-team-chip').count(), 1);
                assert.equal(await page.locator('.domus-team-chip > span').textContent(), 'Other Team');
                await page.getByRole('button', {name: 'Save', exact: true}).click();
                await page.waitForFunction(() => window.lastNotification === 'Save failed');
                assert.equal(saves, 1);
                assert.equal(await page.getByRole('button', {name: 'Save', exact: true}).isEnabled(), true);
            } else {
                assert.equal(await page.locator('.domus-team-chip').count(), 1);
                assert.equal(await page.locator('.domus-team-chip button').count(), 0);
                assert.equal(await page.locator('#domus-add-teams').count(), 0);
                await page.locator('#domus-access-policy').getByText('Assigned <Team>', {exact: true}).waitFor();
                assert.equal(await page.getByLabel('Allow Personal portfolios').count(), 0);
                assert.equal(await page.getByText('Other Team', {exact: true}).count(), 0);
                assert(!requests.some(path => path.endsWith('access-policy')));
            }
            assert(!requests.some(path => path.endsWith('/settings')));
            await page.close();
        }
        console.log('Scope policy: admin controls, membership filtering, disabled Personal, no-scope recovery, search, failed save and phone layout passed.');
    } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exit(1);});
