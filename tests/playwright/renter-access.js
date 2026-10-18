/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        if (page.url() === 'about:blank') {
        await page.route('http://domus.test/**', route => route.fulfill({contentType: 'text/html', body: '<!doctype html>'}));
        await page.goto('http://domus.test/apps/domus/');
    }
    await page.setContent('<div id="app-content"><div id="domus-content"></div></div>');
        await page.addStyleTag({ path: 'css/style.css' });
        await page.evaluate(() => {
            window.t = (app, text, params = {}) => text.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? key);
            window.OC = { generateUrl: value => value, requestToken: 'fixture' };
            window.fixture = { ncUserId: '', accountEnabled: true, guestCreated: false, failCreationResponse: false, calls: [] };
            window.fetch = async (url, options = {}) => {
                fixture.calls.push({ url, method: options.method, data: options.body && JSON.parse(options.body) });
                const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
                if (url.includes('/ocs/v2.php/apps/guests/')) {
                    fixture.guestCreated = true;
                    if (fixture.failCreationResponse) return respond({ ocs: { meta: { message: 'Creation response lost' } } }, 503);
                    return respond({ ocs: { data: { username: 'canonical-hash' } } }, 201);
                }
                if (url.includes('/action-logs/')) return respond([]);
                if (url.endsWith('/corrections')) return respond([]);
                if (url.endsWith('/guest-creation')) return respond({ canCreate: true });
                if (url.endsWith('/partners/1')) return respond({ id: 1, partnerType: 'tenant', name: 'Test renter', email: 'renter@example.invalid', tenancies: [] });
                if (url.endsWith('/account') && options.method === 'GET') return respond({ ncUserId: fixture.ncUserId, accountEnabled: fixture.accountEnabled });
                if (url.endsWith('/account') && options.method === 'POST') {
                    const data = JSON.parse(options.body);
                    if (data.ncUserId || fixture.guestCreated) {
                        fixture.ncUserId = data.ncUserId || 'canonical-hash';
                        return respond({ ncUserId: fixture.ncUserId, accountEnabled: fixture.accountEnabled });
                    }
                    return respond({ needsGuest: true, email: 'renter@example.invalid', displayName: 'Test renter' });
                }
                throw new Error('Unexpected fixture request: ' + url);
            };
        });
        await page.addScriptTag({ path: 'js/domusCoreBundle.js' });
        await page.addScriptTag({ path: 'js/domusActionLog.js' });
        await page.addScriptTag({ path: 'js/domusPartners.js' });
        await page.addScriptTag({ path: 'js/domusTenancies.js' });
        await page.evaluate(() => {
            Domus.state.managementContext = { mode: 'team', activeTeamId: 'a' };
            Domus.Documents = { renderLatestList: () => '' };
            Domus.Tenancies.renderInline = () => '';
            Domus.UI.confirmAction = async () => true;
            Domus.Partners.renderDetail(1);
        });
        const badge = page.locator('#domus-partner-renter-access-badge');
        const panel = page.locator('.domus-online-access-modal-body');
        const openAccess = async () => {
            await badge.getByText('No account linked', { exact: true }).waitFor();
            await badge.click();
            await panel.getByText('No account linked', { exact: true }).waitFor();
        };
        const closeAccess = async () => {
            await page.getByRole('dialog', { name: 'Online access', exact: true }).getByRole('button', { name: 'Close modal' }).click();
            await panel.waitFor({ state: 'detached' });
        };
        await openAccess();
        await panel.getByText('No account linked', { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => fixture.calls.some(call => call.url.endsWith('/guest-creation'))), false);
        await panel.getByRole('button', { name: 'Create or link account by email', exact: true }).click();
        await panel.getByText('canonical-hash', { exact: true }).waitFor();
        await panel.getByText('Account enabled', { exact: true }).waitFor();
        const creates = await page.evaluate(() => fixture.calls.filter(call => call.url.includes('/ocs/v2.php/apps/guests/')));
        assert.equal(creates.length, 1);
        assert.deepEqual(creates[0].data.groups, []);
        assert.equal(creates[0].data.sendInvite, true);
        assert.equal(creates[0].method, 'PUT');
        assert.equal(await panel.getByRole('checkbox').count(), 0);
        assert.equal(await panel.getByRole('button').count(), 0);
        await badge.getByText('Renter Access available', { exact: true }).waitFor();
        assert.equal(await badge.getAttribute('href'), '/settings/users');
        assert.equal(await badge.getAttribute('title'), 'Linked account: canonical-hash');
        await closeAccess();
        console.log('PASS standard Guests creation saves returned UID and shows account status');

        await page.evaluate(() => {
            fixture.ncUserId = ''; fixture.guestCreated = false; fixture.failCreationResponse = true; fixture.calls = [];
            Domus.Partners.renderDetail(1);
        });
        await openAccess();
        await panel.getByRole('button', { name: 'Create or link account by email' }).click();
        await panel.getByText('Creation response lost', { exact: true }).waitFor();
        await panel.getByRole('button', { name: 'Create or link account by email' }).click();
        await panel.getByText('canonical-hash', { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => fixture.calls.filter(call => call.url.includes('/ocs/v2.php/apps/guests/')).length), 1);
        await closeAccess();
        console.log('PASS retry after lost response reuses existing account');

        await page.evaluate(() => { fixture.ncUserId = ''; fixture.accountEnabled = false; Domus.Partners.renderDetail(1); });
        await openAccess();
        await panel.getByText('Link an existing account by user ID', { exact: true }).click();
        await panel.getByRole('textbox', { name: 'Nextcloud user ID' }).fill('existing-user');
        await panel.getByRole('button', { name: 'Link account', exact: true }).click();
        await panel.getByText('existing-user', { exact: true }).waitFor();
        await panel.getByText('Account disabled', { exact: true }).waitFor();
        await badge.getByText('Renter Access pending', { exact: true }).waitFor();
        await page.setViewportSize({ width: 375, height: 812 });
        assert.equal(await panel.evaluate(el => el.scrollWidth <= el.clientWidth), true);
        await closeAccess();
        await page.evaluate(() => { fixture.ncUserId = ''; Domus.Partners.renderDetail(1); });
        await openAccess();
        await panel.getByText('No account linked', { exact: true }).waitFor();
        assert.equal(await panel.evaluate(el => el.scrollWidth <= el.clientWidth), true);
        await closeAccess();
        await page.evaluate(() => { Domus.state.managementContext = { mode: 'personal' }; Domus.Partners.renderDetail(1); });
        await badge.waitFor({ state: 'detached' });
        assert.deepEqual(errors, []);
        console.log('PASS explicit UID, disabled status, narrow layout and Personal visibility');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
