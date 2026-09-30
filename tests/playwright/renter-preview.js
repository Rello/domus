/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<div id="domus-top-nav-primary"></div><div id="domus-top-nav-secondary"></div><div id="app-content"><div id="domus-content"></div></div>');
        await page.addStyleTag({ path: 'css/style.css' });
        await page.evaluate(() => {
            window.t = (app, value, params = {}) => value.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? key);
            window.OC = { generateUrl: path => path };
        });
        for (const module of ['domusCoreBundle', 'domusPartners', 'domusDocuments', 'domusTenancies']) {
            await page.addScriptTag({ path: `js/${module}.js` });
        }
        await page.evaluate(() => {
            const alice = { id: 1, name: 'Alice <Renter>', partnerType: 'tenant', email: 'alice@example.test', phone: '123', street: 'Main Street 1', zip: '12345', city: 'Town', notes: 'Internal Alice note' };
            const bob = { id: 2, name: 'Bob Renter', partnerType: 'tenant', email: 'bob@example.test' };
            const empty = { id: 3, name: 'No tenancy', partnerType: 'tenant' };
            window.previewPartners = [alice, bob, empty, { id: 4, name: 'Owner only', partnerType: 'owner' }];
            window.previewTenancies = [
                { id: 10, unitLabel: 'Current home', partnerIds: [1, 2], partners: [alice, bob], baseRent: 900, serviceCharge: 100, deposit: 2700, startDate: '2026-01-01', conditions: 'Contract terms', status: 'active' },
                { id: 11, unitLabel: 'Previous home', partnerIds: [1], partners: [alice], startDate: '2024-01-01', endDate: '2025-12-31', status: 'historical' },
                { id: 12, unitLabel: 'Bob home', partnerIds: [2], partners: [bob], startDate: '2026-06-01', status: 'active' }
            ];
            window.previewCalls = [];
            window.previewFailures = {};
            window.pendingDetail = null;
            Domus.Api.getPartners = async () => {
                if (previewFailures.partners) throw new Error('Unable to load renters');
                return previewPartners;
            };
            Domus.Api.getTenancies = async () => previewTenancies;
            Domus.Api.get = async path => {
                previewCalls.push(path);
                if (window.delayDetail) await new Promise(resolve => { window.pendingDetail = resolve; });
                if (previewFailures.detail) throw new Error('Unable to load tenancy');
                return previewTenancies.find(item => String(item.id) === path.split('/').pop());
            };
            Domus.Api.getDocuments = async (type, id) => {
                previewCalls.push(`documents/${type}/${id}`);
                if (previewFailures.documents) throw new Error('Document failure');
                return Number(id) === 10 ? [{ id: 50, fileName: 'Contract.pdf', fileUrl: 'https://example.test/contract.pdf', note: 'Internal document note', createdAt: 1700000000 }] : [];
            };
            Domus.Role.setRoleInfo({ currentRole: 'landlord', availableRoles: ['landlord'] });
            Domus.Router.register('renterPreview', Domus.Tenancies.renderRenterPreview);
            Domus.Router.register('tenancyDetail', Domus.Tenancies.renderDetail);
            Domus.Router.register('dashboard', () => Domus.UI.renderContent('Owner dashboard'));
            Domus.Router.navigate('dashboard');
        });
        await page.getByRole('link', { name: 'Renter preview', exact: true }).click();
        await page.getByLabel('Simulate renter').selectOption('1');
        await page.getByRole('link', { name: 'Contract.pdf', exact: true }).waitFor();
        assert.equal(await page.locator('.domus-tenancy-detail h2').innerText(), 'Current home');
        assert.match(await page.locator('.domus-renter-contact').innerText(), /alice@example.test/);
        assert.doesNotMatch(await page.locator('.domus-tenancy-detail').innerText(), /bob@example.test|Bob Renter|Internal/);
        assert.equal(await page.locator('#domus-preview-renter option[value="4"]').count(), 0);
        assert.equal(await page.locator('#domus-tenancy-delete, #domus-tenancy-change, #domus-tenancy-details, #domus-tenancy-document-create, [data-doc-edit], a[href*="partnerDetail"]').count(), 0);
        assert.equal(await page.getByRole('link', { name: 'Settings', exact: true }).count(), 0);
        assert.equal(await page.locator('#domus-preview-tenancy option').count(), 2);
        console.log('PASS renter preview reuses tenancy detail with own contact data and read-only documents');

        await page.getByLabel('My tenancies', { exact: true }).selectOption('11');
        await page.getByRole('heading', { name: 'Previous home', exact: true }).waitFor();
        assert.equal(await page.locator('#domus-tenancy-documents-11 [role="button"], #domus-tenancy-documents-11 button').count(), 0);
        await page.getByLabel('Simulate renter').selectOption('2');
        await page.getByLabel('My tenancies', { exact: true }).selectOption('12');
        await page.getByRole('heading', { name: 'Bob home', exact: true }).waitFor();
        assert.doesNotMatch(await page.locator('.domus-tenancy-detail').innerText(), /Alice|alice@example/);
        await page.getByLabel('Simulate renter').selectOption('3');
        await page.getByText('No tenancies are assigned to this renter.', { exact: true }).waitFor();
        assert.equal(await page.locator('.domus-tenancy-detail').count(), 0);
        console.log('PASS renter switching, historical tenancies, empty documents and unassigned renters');

        await page.evaluate(() => Domus.Router.navigate('renterPreview', ['1', '12']));
        await page.getByRole('heading', { name: 'Current home', exact: true }).waitFor();
        await page.evaluate(() => { window.delayDetail = true; Domus.Router.navigate('renterPreview', ['1', '11']); });
        await page.waitForFunction(() => window.pendingDetail !== null);
        await page.getByRole('button', { name: 'Exit preview', exact: true }).click();
        await page.evaluate(async () => { window.delayDetail = false; window.pendingDetail(); await Promise.resolve(); });
        await page.getByText('Owner dashboard', { exact: true }).waitFor();
        assert.equal(await page.locator('.domus-tenancy-detail').count(), 0);
        console.log('PASS foreign tenancy selection and delayed responses cannot replace the selected view');

        await page.evaluate(() => { previewFailures.detail = true; Domus.Router.navigate('renterPreview', ['1']); });
        await page.getByText('Unable to load tenancy', { exact: true }).waitFor();
        assert.equal(await page.getByLabel('Simulate renter').count(), 1);
        await page.evaluate(() => { previewFailures.detail = false; previewFailures.documents = true; });
        await page.getByLabel('Simulate renter').selectOption('2');
        await page.getByText('Documents could not be loaded. Please try again.', { exact: true }).waitFor();
        await page.evaluate(() => { previewFailures.documents = false; previewFailures.partners = true; Domus.Router.navigate('renterPreview'); });
        await page.getByText('Unable to load renters', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Exit preview', exact: true }).click();
        await page.evaluate(() => { previewFailures.partners = false; previewPartners = []; Domus.Router.navigate('renterPreview'); });
        await page.getByText('No renter contacts available to preview.', { exact: true }).waitFor();
        console.log('PASS failed loads and empty accounts keep a usable exit and clear status');

        await page.evaluate(() => Domus.Router.navigate('tenancyDetail', ['10']));
        await page.locator('#domus-tenancy-change').waitFor();
        await page.locator('[data-doc-edit="50"]').waitFor();
        const headerGap = await page.evaluate(() => {
            const back = document.querySelector('.domus-tenancy-detail > .domus-back-button').getBoundingClientRect();
            const hero = document.querySelector('.domus-tenancy-detail > .domus-detail-hero').getBoundingClientRect();
            return Math.round(hero.top - back.bottom);
        });
        assert.equal(headerGap, 8);
        assert.equal(await page.locator('#domus-tenancy-delete').count(), 1);
        assert.equal(await page.locator('#domus-tenancy-document-create').count(), 1);
        assert.match(await page.locator('.domus-tenancy-detail').innerText(), /Internal document note/);
        console.log('PASS landlord tenancy and document management controls remain available');

        await page.evaluate(() => { previewPartners = previewTenancies[0].partners; Domus.Router.navigate('renterPreview', ['1']); });
        await page.locator('.domus-renter-contact').waitFor();
        await page.setViewportSize({ width: 375, height: 812 });
        await page.getByLabel('Simulate renter').focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'domus-preview-tenancy');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        assert.deepEqual(errors, []);
        console.log('PASS renter controls support keyboard navigation and narrow screens');
    } finally {
        await browser.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
