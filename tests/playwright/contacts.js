/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.setContent('<div id="domus-top-nav-primary"></div><div id="domus-top-nav-secondary"></div><div id="app-content"><div id="domus-content"></div></div>');
        await page.addStyleTag({ path: 'css/style.css' });
        await page.evaluate(() => {
            window.t = (app, value, params = {}) => value.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? key);
            window.OC = { generateUrl: path => path };
            const contacts = [
                { id: 1, name: 'Tenant contact', partnerType: 'tenant' },
                { id: 2, name: 'Owner contact', partnerType: 'owner' }
            ];
            window.partnerRequests = [];
            window.fetch = async url => {
                const request = new URL(url, 'http://localhost/');
                partnerRequests.push(request.search);
                const type = request.searchParams.get('type');
                return new Response(JSON.stringify(contacts.filter(contact => !type || contact.partnerType === type)), {
                    headers: { 'Content-Type': 'application/json' }
                });
            };
        });
        await page.addScriptTag({ path: 'js/domusCoreBundle.js' });
        await page.addScriptTag({ path: 'js/domusPartners.js' });
        await page.evaluate(() => { Domus.state.currentView = 'partners'; });
        await page.evaluate(() => Domus.Partners.renderList());
        const filter = page.locator('#domus-partner-filter');
        await filter.waitFor({ timeout: 5000 }).catch(async error => {
            throw new Error(`${error.message}\nBrowser errors: ${errors.join('; ')}\nRequests: ${JSON.stringify(await page.evaluate(() => partnerRequests))}\nBody: ${(await page.locator('body').innerText()).slice(0, 500)}`);
        });
        const positions = await page.evaluate(() => {
            const add = document.getElementById('domus-partner-create').getBoundingClientRect();
            const type = document.getElementById('domus-partner-filter').getBoundingClientRect();
            return { addTop: add.top, addRight: add.right, typeTop: type.top, typeRight: type.right };
        });
        assert.ok(positions.addTop < positions.typeTop);
        assert.ok(positions.addRight >= positions.typeRight);
        for (const [type, count, name] of [['tenant', 1, 'Tenant contact'], ['owner', 1, 'Owner contact'], ['facilities', 0, ''], ['', 2, 'Owner contact'], ['tenant', 1, 'Tenant contact']]) {
            await filter.selectOption(type);
            await page.waitForFunction(({ expected, name }) => {
                const results = document.getElementById('domus-partners-results');
                return results && results.querySelectorAll('.domus-table tbody tr[data-navigate]').length === expected &&
                    (!name || results.textContent.includes(name));
            }, { expected: count, name });
            assert.equal(await page.locator('#domus-partners-results .domus-panel').count(), count ? 1 : 0);
            assert.equal(await page.locator('#domus-partners-results .domus-panel .domus-panel').count(), 0);
            assert.equal(await page.locator('#domus-partners-results .domus-empty-state').count(), count ? 0 : 1);
        }
        assert.deepEqual(await page.evaluate(() => partnerRequests), ['', '?type=tenant', '?type=owner', '?type=facilities', '', '?type=tenant']);
        const search = page.locator('#domus-primary-nav-search');
        await search.fill('missing');
        assert.equal(await page.locator('#domus-partners-results tbody tr[data-navigate]').count(), 0);
        assert.match(await page.locator('#domus-partners-results').innerText(), /No matching Contacts found/);
        await search.fill('tenant');
        assert.equal(await page.locator('#domus-partners-results tbody tr[data-navigate]').count(), 1);
        await filter.selectOption('');
        await page.waitForFunction(() => document.querySelectorAll('#domus-partners-results tbody tr[data-navigate]').length === 1);
        await search.fill('owner');
        assert.equal(await page.locator('#domus-partners-results tbody tr[data-navigate]').count(), 1);
        await search.fill('');
        assert.equal(await page.locator('#domus-partners-results tbody tr[data-navigate]').count(), 2);
        assert.deepEqual(errors, []);
        console.log('PASS contact type and quick search filters combine without nesting panels');

        const tableStyles = await page.evaluate(() => {
            const contact = document.querySelector('#domus-partners-results .domus-table-primary-action');
            const samples = [
                { cells: ['<button type="button">Booking date</button>'], dataset: { 'booking-id': 1 } },
                { cells: ['Tenancy unit'], dataset: { navigate: 'tenancyDetail', args: 1 } },
                { cells: ['<button type="button">Financial year</button>'], dataset: { 'stat-year': 2026 } },
                { cells: ['<a href="/file.pdf">Document</a>'], dataset: { 'doc-info': 1 } },
                { cells: ['Report total'] }
            ];
            const host = document.createElement('div');
            host.innerHTML = Domus.UI.buildTable(['Name'], samples, { wrapPanel: false });
            document.body.appendChild(host);
            const style = element => {
                const computed = getComputedStyle(element);
                return { color: computed.color, decoration: computed.textDecorationLine, background: computed.backgroundColor,
                    shadow: computed.boxShadow, cursor: computed.cursor };
            };
            const actions = [...host.querySelectorAll('.domus-table-primary-action')];
            const focusStyle = element => {
                element.focus();
                const computed = getComputedStyle(element);
                return { background: computed.backgroundColor, shadow: computed.boxShadow };
            };
            return { contact: style(contact), actions: actions.map(style), actionCount: actions.length,
                contactFocus: focusStyle(contact), actionFocus: actions.map(focusStyle),
                rowCursors: [...host.querySelectorAll('tbody tr')].map(row => getComputedStyle(row).cursor),
                headerScope: host.querySelector('thead th')?.getAttribute('scope') };
        });
        assert.equal(tableStyles.actionCount, 4);
        assert.equal(tableStyles.headerScope, 'col');
        assert.deepEqual(tableStyles.actions, Array(4).fill(tableStyles.contact));
        assert.deepEqual(tableStyles.actionFocus, Array(4).fill(tableStyles.contactFocus));
        assert.deepEqual(tableStyles.rowCursors, ['pointer', 'pointer', 'pointer', 'pointer', 'auto']);
        console.log('PASS contact, booking, tenancy, finance and document tables share primary-action styles');
    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
