/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        if (page.url() === 'about:blank') {
        await page.route('http://domus.test/**', route => route.fulfill({contentType: 'text/html', body: '<!doctype html>'}));
        await page.goto('http://domus.test/apps/domus/');
    }
    await page.setContent('<header id="header"><div class="header-start"><nav id="header-start__appmenu">Domus</nav></div></header><div id="app-navigation"></div><div id="app-content"><div id="domus-content"></div></div>');
        await page.evaluate(() => {
            window.t = (app, value) => value;
            window.OC = { generateUrl: value => value, requestToken: 'test' };
            window.fetch = async () => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ teams: [
                { teamId: 'team-a', displayName: 'Team A' },
                { teamId: 'team-b', displayName: 'Team B' },
            ] }) });
        });
        await page.addScriptTag({ path: 'js/domusCoreBundle.js' });
        await page.evaluate(() => {
            Domus.state.managementContext = { mode: 'personal', activeTeamId: null };
            Domus.Role.setRoleInfo({ currentRole: 'landlord', availableRoles: ['landlord'] });
            Domus.Router.register('dashboard', () => Domus.UI.renderContent('Dashboard'));
            Domus.Router.navigate('dashboard');
        });
        await page.locator('#domus-context-select option').nth(2).waitFor({ state: 'attached' });
        assert.deepEqual(await page.locator('#domus-context-select option').allTextContents(), ['Personal', 'Team A', 'Team B']);
        assert.equal(await page.locator('#domus-context-select').inputValue(), '');
        await page.evaluate(() => Domus.Navigation.render());
        await page.locator('#domus-context-select option').nth(2).waitFor({ state: 'attached' });
        assert.equal(await page.locator('#domus-context-select').count(), 1);
        assert.equal(await page.locator('#header .domus-context-selector--header #domus-context-select').count(), 1);
        assert.equal(await page.locator('#app-content #domus-context-select').count(), 0);
        await page.addStyleTag({ path: 'css/style.css' });
        await page.locator('#domus-context-select').focus();
        assert.equal(await page.locator('#domus-context-select').evaluate(el => el === document.activeElement), true);
        await page.setViewportSize({ width: 375, height: 812 });
        const bounds = await page.locator('#domus-context-select').boundingBox();
        assert.ok(bounds.width > 0 && bounds.x + bounds.width <= 375);
        await page.evaluate(() => {
            Domus.state.currentView = 'renter';
            Domus.Teams.mountSelector();
        });
        assert.equal(await page.locator('#domus-context-select').count(), 0);
        console.log('PASS header placement, keyboard focus, narrow sizing, and renter removal');
        console.log('PASS Personal and multiple Teams remain available after navigation refresh');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
