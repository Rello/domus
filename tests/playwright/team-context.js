/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function checkTabScope(browser) {
    const context = await browser.newContext();
    let savedTeam = '';
    let revokedTeam = null;
    const contacts = [];
    const requests = [];
    await context.route('http://scope.test/**', async route => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        if (!path.startsWith('/apps/domus/api/')) {
            return route.fulfill({ contentType: 'text/html', body: '<header id="header"><div class="header-start"></div></header><div id="app-navigation"></div><div id="app-content"><div id="domus-content"></div></div>' });
        }
        const headers = req.headers();
        const scope = headers['x-domus-team'] || savedTeam || 'Personal';
        requests.push({ path, method: req.method(), headers, scope });
        let result = {};
        if (path.endsWith('/activate')) savedTeam = decodeURIComponent(path.split('/').at(-2));
        else if (path.endsWith('/deactivate')) savedTeam = '';
        else if (path.endsWith('/teams')) result = { teams: [
            { teamId: 'team-a', displayName: 'Team A' },
            { teamId: 'team-b', displayName: 'Team B' }
        ] };
        else if (path.endsWith('/partners') && req.method() === 'POST') {
            result = { ...req.postDataJSON(), id: contacts.length + 1, scope };
            contacts.push(result);
        } else if (path.endsWith('/partners')) result = contacts.filter(contact => contact.scope === scope);
        // The server also resolves response capabilities from this header after switching.
        if (scope === revokedTeam) return route.fulfill({ status: 403, json: { message: 'Team access revoked' } });
        return route.fulfill({ json: result });
    });
    async function initialize(page) {
        await page.evaluate(team => {
            window.t = (app, value) => value;
            window.OC = { generateUrl: value => value, requestToken: 'test' };
            window.fixtureTeam = team;
        }, savedTeam);
        await page.addScriptTag({ path: 'js/domusCoreBundle.js' });
        await page.addScriptTag({ path: 'js/domusPartners.js' });
        await page.evaluate(() => {
            Domus.state.managementContext = { mode: fixtureTeam ? 'team' : 'personal', activeTeamId: fixtureTeam || null };
            Domus.Role.setRoleInfo({ currentRole: 'landlord', availableRoles: ['landlord'] });
            Domus.Router.register('dashboard', () => Domus.UI.renderContent('Dashboard'));
            Domus.Router.navigate('dashboard');
        });
        await page.locator('#domus-context-select option').nth(2).waitFor({ state: 'attached' });
    }
    async function switchTeam(page, team) {
        await Promise.all([
            page.waitForEvent('load'),
            page.locator('#domus-context-select').selectOption(team)
        ]);
        await initialize(page);
        assert.equal(await page.locator('#domus-context-select').inputValue(), team);
        const selection = requests.findLast(request => request.path.endsWith('/activate') || request.path.endsWith('/deactivate'));
        assert.equal(selection.headers['x-domus-team'], team || 'Personal');
    }
    async function draft(page, name) {
        await page.evaluate(() => Domus.Partners.openCreateModal({}, () => {}));
        await page.locator('#domus-partner-form [name="name"]').fill(name);
        await page.locator('#domus-partner-form [name="partnerType"]').selectOption('tenant');
    }
    async function save(page) {
        await page.locator('.domus-modal button[type="submit"]').click();
        await page.locator('#domus-partner-form').waitFor({ state: 'detached' });
    }
    try {
        const tabA = await context.newPage();
        const tabB = await context.newPage();
        for (const tab of [tabA, tabB]) {
            await tab.goto('http://scope.test/apps/domus/');
            await initialize(tab);
        }
        await draft(tabA, 'Private draft');
        await switchTeam(tabB, 'team-b');
        await save(tabA);
        assert.equal(contacts[0].scope, 'Personal');
        assert.deepEqual(await tabB.evaluate(() => Domus.Api.getPartners()), []);
        assert.equal(await tabA.locator('#domus-context-select').inputValue(), '');

        await switchTeam(tabA, 'team-a');
        await draft(tabA, 'Team A draft');
        await switchTeam(tabB, '');
        await save(tabA);
        assert.equal(contacts[1].scope, 'team-a');
        assert.deepEqual((await tabB.evaluate(() => Domus.Api.getPartners())).map(contact => contact.name), ['Private draft']);

        // Exercise each multipart helper in both contexts while the persisted preference differs.
        for (const [tab, scope] of [[tabA, 'team-a'], [tabB, 'Personal']]) {
            savedTeam = scope === 'Personal' ? 'team-b' : '';
            const before = requests.length;
            await tab.evaluate(async () => {
                const file = new File(['fixture'], 'fixture.txt', { type: 'text/plain' });
                await Domus.Api.attachDocumentToTargets({ type: 'upload', file, targets: [] });
                await Domus.Api.uploadDocument('partner', 1, file, 2026);
                await Domus.Api.uploadPropertyImage(1, file);
                await Domus.Api.uploadUnitImage(1, file);
                await Domus.Api.get('/settings');
                await Domus.Api.put('/settings', {});
                await Domus.Api.delete('/documents/1');
            });
            const batch = requests.slice(before);
            assert.equal(batch.length, 7);
            for (const request of batch) {
                assert.equal(request.headers['x-domus-team'], scope);
                assert.equal(request.headers.requesttoken, 'test');
            }
            for (const request of batch.slice(0, 4)) {
                assert.match(request.headers['content-type'], /^multipart\/form-data; boundary=/);
            }
        }
        revokedTeam = 'team-a';
        assert.equal(await tabA.evaluate(async () => {
            try { await Domus.Api.getPartners(); } catch (error) { return error.message; }
        }), 'Team access revoked');
        await switchTeam(tabA, 'team-b');
        // Model another already-open Team A tab escaping to Personal after revocation.
        await tabA.evaluate(() => { Domus.state.managementContext = { mode: 'team', activeTeamId: 'team-a' }; });
        await switchTeam(tabA, '');
        assert.ok(requests.every(request => request.headers['x-domus-team']));
        console.log('PASS two-tab contact saves remain Personal/Team scoped, explicit switches reload, and JSON/multipart requests retain tab scope');
    } finally {
        await context.close();
    }
}

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
        await checkTabScope(browser);
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
