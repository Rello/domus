/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<div id="domus-top-nav-primary"></div><div id="domus-top-nav-secondary"></div><div id="app-content"><div id="domus-content"></div></div>');
        await page.addStyleTag({ content: '*, *::before, *::after { box-sizing: border-box } dl { display:flex; flex-wrap:wrap } dt, dd { display:inline; width:33% } .domus-panel dl { padding:12px 0 } .domus-panel dt, .domus-panel dd { padding:12px; text-align:end }' });
        await page.addStyleTag({ path: 'css/style.css' });
        await page.evaluate(() => { window.t = (app, value, params = {}) => value.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? key); window.OC = { generateUrl: path => path }; });
        for (const module of ['domusCoreBundle', 'domusActionLog', 'domusPartners', 'domusDocuments', 'domusTenancies']) await page.addScriptTag({ path: `js/${module}.js` });
        await page.evaluate(() => {
            window.tenancies = [{ teamId: 'a', id: 11, unitLabel: 'Home A', startDate: '2020-01-01', endDate: '2021-01-01' }];
            window.calls = []; window.pending = null; window.delay = false; window.revoked = false; window.requests = []; window.activities = [];
            Domus.state.managementContext = { mode: 'external', canManage: false };
            Domus.Role.setRoleInfo({ currentRole: 'tenant', availableRoles: ['tenant'] });
            Domus.Router.register('renter', Domus.Tenancies.renderRenter);
            Domus.Router.register('renterPreview', Domus.Tenancies.renderRenterPreview);
            Domus.Router.register('dashboard', () => Domus.UI.renderContent('Management dashboard'));
            Domus.Api.get = async path => {
                calls.push(path);
                if (path === '/api/renter/me') return { partners: [{ id: 1 }], tenancies: window.revoked ? [] : tenancies };
                if (path.includes('/corrections')) return requests;
                if (!path.startsWith('/api/renter/teams/')) throw new Error('Unexpected management request ' + path);
                if (delay) await new Promise(resolve => { pending = resolve; });
                if (revoked) throw new Error('Access removed');
                const tenancy = tenancies.find(item => String(item.id) === path.split('/').pop());
                return { tenancy: { ...tenancy, partnerIds: [1], baseRent: 900, serviceCharge: 100, deposit: 2700, conditions: 'Agreed conditions' },
                    contacts: [{ id: 1, name: 'Alice', email: 'alice@example.test' }],
                    documents: [{ id: 51, fileName: 'Contract.pdf', fileUrl: '/apps/domus/api/renter/documents/51/content' }], corrections: requests, activities };
            };
            Domus.Api.post = async (path, data) => {
                calls.push(path);
                if (path.includes('/api/renter/')) requests.push({ id: 101, partnerId: 1, state: 'pending', createdAt: 1, original: { phone: '' }, proposed: data.proposed });
                else requests[0].state = data.approve ? 'approved' : 'rejected';
                return { state: requests[0].state };
            };
            Domus.Router.navigate('dashboard');
        });
        await page.getByRole('heading', { name: 'Home A', exact: true }).waitFor();
        assert.equal(await page.locator('[data-doc-edit], #domus-tenancy-change, #domus-context-select').count(), 0);
        assert.equal(await page.getByRole('link', { name: 'Management', exact: true }).count(), 0);
        assert.equal(await page.getByRole('link', { name: 'Contract.pdf' }).getAttribute('href'), '/apps/domus/api/renter/documents/51/content');
        assert.equal(await page.locator('.domus-renter-contact').first().evaluate(el => getComputedStyle(el).display), 'grid');
        assert.equal(await page.locator('.domus-renter-contact dt').first().evaluate(el => getComputedStyle(el).textAlign), 'start');
        assert.equal(await page.locator('.domus-renter-contact dd').first().evaluate(el => getComputedStyle(el).padding), '0px');
        assert.match(await page.locator('.domus-tenancy-detail').innerText(), /Agreed conditions|alice@example.test/);
        assert.ok((await page.evaluate(() => calls)).every(path => path.startsWith('/api/renter/')));
        console.log('PASS renter entry uses dedicated APIs, historical tenancy facts and authenticated document links');

        await page.getByRole('button', { name: 'Request a correction' }).click();
        await page.getByLabel('Phone', { exact: true }).fill('12345');
        await page.getByRole('button', { name: 'Submit for review' }).click();
        await page.getByText('Pending review', { exact: false }).waitFor();
        assert.equal(await page.getByRole('dialog').count(), 0);
        assert.equal(await page.locator('.domus-renter-contact').first().innerText().then(text => text.includes('12345')), false);
        console.log('PASS correction submission retains existing contact details until reviewed');

        await page.evaluate(() => {
            requests[0].state = 'approved';
            activities.push({ id: 201, type: 'event', source: 'system', title: 'Contact correction approved', data: 'Phone: old → 12345', createdAt: 2 });
            Domus.Router.navigate('renter', ['a', 11]);
        });
        await page.locator('#domus-renter-activity').getByRole('button', { name: /Contact correction approved/ }).waitFor();
        assert.equal(await page.locator('.domus-correction-request').count(), 0);
        await page.locator('#domus-renter-activity').getByRole('button').click();
        await page.getByRole('dialog').getByText('Phone: old → 12345', { exact: true }).waitFor();
        assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Edit', exact: true }).count(), 0);
        assert.ok((await page.evaluate(() => calls)).every(path => path.startsWith('/api/renter/')));
        await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
        console.log('PASS renter uses standard activity list and read-only dialog without management API requests');

        await page.evaluate(() => { tenancies.push({ teamId: 'b', id: 22, unitLabel: 'Home B', startDate: '2026-01-01' }); Domus.Router.navigate('renter'); });
        await page.getByRole('link', { name: /Home B/ }).waitFor();
        await page.getByRole('link', { name: /Home B/ }).click();
        await page.getByRole('heading', { name: 'Home B', exact: true }).waitFor();
        assert.ok((await page.evaluate(() => calls)).includes('/api/renter/teams/b/tenancies/22'));
        await page.evaluate(() => { delay = true; Domus.Router.navigate('renter', ['a', 11]); });
        await page.waitForFunction(() => pending !== null);
        await page.evaluate(() => { Domus.Router.navigate('renter'); delay = false; pending(); });
        await page.getByRole('link', { name: /Home A/ }).waitFor();
        assert.equal(await page.locator('.domus-tenancy-detail').count(), 0);
        console.log('PASS multiple Teams and delayed responses preserve the selected renter context');

        await page.setViewportSize({ width: 375, height: 812 });
        await page.getByRole('link', { name: /Home A/ }).focus();
        await page.keyboard.press('Enter');
        await page.getByRole('heading', { name: 'Home A', exact: true }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.evaluate(() => { revoked = true; Domus.Router.navigate('renter'); });
        await page.getByText('No tenancies are linked to your account. Contact your property manager.').waitFor();
        assert.equal(await page.getByRole('link', { name: 'Contract.pdf' }).count(), 0);
        await page.evaluate(() => { revoked = false; Domus.state.managementContext = { mode: 'personal', canManage: true }; Domus.Role.setRoleInfo({ currentRole: 'landlord', availableRoles: ['landlord'] }); Domus.Router.navigate('renter', ['a', 11]); });
        await page.getByRole('link', { name: 'Management', exact: true }).waitFor();
        await page.getByRole('link', { name: 'Management', exact: true }).click();
        await page.getByText('Management dashboard').waitFor();
        await page.getByRole('link', { name: 'My tenancies', exact: true }).waitFor();
        console.log('PASS revocation, keyboard/narrow layout and authorized staff/renter switches');

        await page.evaluate(() => {
            Domus.state.managementContext = { mode: 'team', activeTeamId: 'a', canManage: true };
            Domus.Api.getActionLogs = async () => activities;
            Domus.Api.getActionLogEntry = async id => activities.find(entry => entry.id === Number(id));
            Domus.Api.get = async path => path === '/partners/1' ? { id: 1, partnerType: 'tenant', name: 'Alice', tenancies: [] }
                : path.endsWith('/corrections') ? requests : { ncUserId: 'renter', accountEnabled: true };
            Domus.Api.post = async (path, data) => {
                const request = requests.find(item => item.state === 'pending');
                request.state = data.approve ? 'approved' : 'rejected';
                activities.push({ id: activities.length + 202, type: 'event', source: 'system', title: 'Contact correction ' + request.state, data: 'Phone: old → new', createdAt: 3 });
                return { state: request.state };
            };
            Domus.Documents.renderLatestList = () => '';
            Domus.Router.register('partnerDetail', Domus.Partners.renderDetail);
            requests.push({ id: 102, partnerId: 1, state: 'pending', createdAt: 2, original: { phone: 'old' }, proposed: { phone: 'new' } });
            Domus.Router.navigate('partnerDetail', [1]);
        });
        await page.getByRole('button', { name: 'Reject', exact: true }).click();
        await page.locator('#domus-action-log-partner-1').getByRole('button', { name: /Contact correction rejected/ }).waitFor();
        assert.equal(await page.locator('.domus-correction-request').count(), 0);
        assert.equal(await page.getByRole('heading', { name: 'Pending review', exact: true }).count(), 0);
        assert.equal(await page.getByRole('heading', { name: 'Contact corrections', exact: true }).count(), 0);
        await page.locator('#domus-action-log-partner-1').getByRole('button', { name: /Contact correction rejected/ }).click();
        await page.getByRole('dialog').getByText('Phone: old → new', { exact: true }).waitFor();
        await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
        await page.evaluate(() => {
            requests.push({ id: 103, partnerId: 1, state: 'pending', createdAt: 3, original: { phone: 'old' }, proposed: { phone: 'new' } });
            Domus.Router.navigate('partnerDetail', [1]);
        });
        await page.getByRole('button', { name: 'Approve', exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll('#domus-action-log-partner-1 [data-domus-action-log-open]').length === 3);
        assert.equal(await page.locator('.domus-correction-request').count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#domus-content *')].filter(el => el.getBoundingClientRect().right > innerWidth).map(el => [el.tagName, el.className, el.getBoundingClientRect().width]).slice(0, 20))));
        console.log('PASS partner review replaces pending requests with standard activities for approval and rejection');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
