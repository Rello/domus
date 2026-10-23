/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

const labels = ['Einnahmen', 'Mieteinnahmen für Wohnungen', '1) Weitere Geschosse',
    'Mieteinnahmen', 'Neben-/ Betriebskosten', 'Nachzahlung von NK vom Mieter', 'Erstattung von NK an den Mieter',
    'Abschreibung', 'Betriebskosten und andere Ausgaben', 'Schuldzinsen', 'Sonstige Kosten', 'Umlagefähige Kosten laut Abrechnung',
    'Grundsteuer', 'Nicht umlagefähige Kosten laut Abrechnung', 'Sonstige Kosten', 'Status', 'Kontroll-Saldo'];

(async () => {
    const browser = await chromium.launch({headless: true});
    let failures = 0;
    for (const width of [1280, 375]) {
        const page = await browser.newPage({viewport: {width, height: 900}});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
            await page.route('http://domus.test/**', route => route.fulfill({contentType: 'text/html', body: '<!doctype html>'}));
            await page.goto('http://domus.test/apps/domus/');
            await page.setContent('<style>* {box-sizing: border-box} :root {--color-main-background: #fff; --color-main-text: #222; --color-background-dark: #eee}</style><div id="app-content" class="app-domus"><div id="domus-content"></div></div>');
            await page.addStyleTag({path: 'css/style.css'});
            await page.evaluate(() => {
                window.t = (app, value) => value;
                window.OC = {generateUrl: value => value};
            });
            for (const name of ['CoreBundle', 'Settings']) await page.addScriptTag({path: `js/domus${name}.js`});
            await page.evaluate(() => {
                Domus.Api.getSettings = async () => ({settings: {}});
                Domus.TaskTemplates = {renderSection: () => '', loadTemplates: () => {}};
                Domus.Accounts = {renderSettingsSection: () => '', loadSettingsSection: () => {}};
                Domus.Api.get = async path => {
                    if (!path.startsWith('/tax-report/')) return [];
                    if (window.failLoad) throw new Error('Cannot load report');
                    const year = Number(path.split('/').pop());
                    return {year, years: [new Date().getFullYear(), new Date().getFullYear() - 1],
                        units: window.emptyUnits ? [] : ['Apartment <A>', 'Apartment B', 'No history'].map((label, index) => ({
                            label, closed: index === 0 && year === new Date().getFullYear() - 1,
                            amounts: {rent: 3600, prepayments: 1080, tenantPayment: 543, depreciation: 709,
                                interest: 125, management: 15, nonAllocable: 242, otherCosts: 6410,
                                allocable: 1509, propertyTax: 114, tenantCredit: 20, totalIncome: 5203, totalOperatingExpenses: 8400, controlBalance: -3906},
                            otherCostBookings: [{description: 'Administration <script>test</script>', amount: 5900},
                                {description: 'Refund', amount: -10}, {description: '', amount: 520}]
                        }))};
                };
                Domus.Settings.render();
            });
            const header = page.locator('#domus-tax-declaration-panel .domus-section-header');
            await header.waitFor();
            await header.press('Enter');
            assert.equal(await header.getAttribute('aria-expanded'), 'true');
            await page.getByRole('button', {name: 'Tax report', exact: true}).click();
            await page.getByRole('note').filter({hasText: 'This is beta. The report shows the data in the same input format as WISO Steuer for simple transfer.'}).waitFor();
            const table = page.locator('.domus-tax-table');
            await table.waitFor();
            assert.deepEqual(await table.locator('tbody th').allTextContents(), labels);
            assert.deepEqual(await table.locator('thead th').allTextContents(), ['Objekt', 'Apartment <A>', 'Apartment B', 'No history']);
            const statuses = table.locator('tbody tr').filter({has: page.getByRole('rowheader', {name: 'Status', exact: true})});
            assert.deepEqual(await statuses.locator('td').allTextContents(), ['Closed', 'Provisional', 'Provisional']);
            assert.equal(await statuses.locator('.domus-badge-success').count(), 1);
            assert.equal(await statuses.locator('.domus-badge-warning.domus-badge-provisional').count(), 2);
            await page.locator('#domus-tax-report-year').selectOption(String(new Date().getFullYear()));
            assert.deepEqual(await statuses.locator('td').allTextContents(), ['Provisional', 'Provisional', 'Provisional']);
            assert.match(await table.locator('tbody tr').last().locator('td').first().textContent(), /3.*906/);
            const payment = table.locator('tbody tr').filter({has: page.getByRole('rowheader', {name: 'Nachzahlung von NK vom Mieter', exact: true})});
            assert.match(await payment.locator('td').first().textContent(), /543/);
            const otherCosts = table.locator('tbody tr').filter({has: page.getByRole('rowheader', {name: 'Sonstige Kosten', exact: true})}).filter({has: page.locator('th.domus-tax-depth-2')});
            assert.equal(await otherCosts.locator('td').first().locator('li').count(), 3);
            assert.equal(await otherCosts.locator('td').first().evaluate(cell => Array.from(cell.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim()), '', 'Other costs show line items without a separate total');
            assert.ok((await otherCosts.locator('td').first().innerText()).includes('Administration <script>test</script>'));
            assert.ok((await otherCosts.locator('td').first().innerText()).includes('Booking without description'));
            assert.equal(await otherCosts.locator('script').count(), 0);
            assert.match(await otherCosts.locator('td').first().locator('li').nth(1).innerText(), /-.*10/);
            const interest = table.locator('tbody tr').filter({has: page.getByRole('rowheader', {name: 'Schuldzinsen', exact: true})});
            assert.match(await interest.locator('td').first().textContent(), /125/);
            const nonAllocable = table.locator('tbody tr').filter({has: page.getByRole('rowheader', {name: 'Nicht umlagefähige Kosten laut Abrechnung', exact: true})});
            assert.match(await nonAllocable.locator('td').first().textContent(), /242/);
            assert.equal(await page.getByRole('rowheader', {name: 'Nicht umlagefähige Kosten', exact: true}).count(), 0);
            assert.equal(await otherCosts.locator('th').getAttribute('class'), 'domus-tax-depth-2');
            for (const [label, amount] of [['Einnahmen', 5203], ['Abschreibung', 709], ['Betriebskosten und andere Ausgaben', 8400]]) {
                const subtotal = table.locator('tbody tr').filter({has: page.getByRole('rowheader', {name: label, exact: true})});
                assert.ok((await subtotal.getAttribute('class')).includes('domus-tax-group'));
                const expected = await page.evaluate(value => Domus.Utils.formatCurrency(value), amount);
                assert.equal(await subtotal.locator('td').first().textContent(), expected);
                const backgrounds = await subtotal.evaluate(row => Array.from(row.children, cell => getComputedStyle(cell).backgroundColor));
                assert.ok(backgrounds.every(color => color === backgrounds[0] && color !== 'rgba(0, 0, 0, 0)'), 'Subtotal shading covers the entire row');
            }
            const dimensions = await page.locator('.domus-tax-table-scroll').evaluate(el => ({right: el.getBoundingClientRect().right, width: innerWidth, scroll: el.scrollWidth, client: el.clientWidth}));
            assert.ok(dimensions.right <= dimensions.width, 'The table stays within the viewport');
            if (width === 375) assert.ok(dimensions.scroll > dimensions.client, 'Unit columns scroll on phones');
            const frozen = await page.locator('.domus-tax-table-scroll').evaluate(async host => {
                host.scrollTop = 150;
                host.scrollLeft = 100;
                await new Promise(requestAnimationFrame);
                const region = host.getBoundingClientRect();
                const corner = host.querySelector('thead th').getBoundingClientRect();
                const header = host.querySelector('thead th:nth-child(2)').getBoundingClientRect();
                const label = host.querySelector('tbody th').getBoundingClientRect();
                return {scrollTop: host.scrollTop, cornerTop: corner.top, cornerLeft: corner.left,
                    headerTop: header.top, labelLeft: label.left, regionTop: region.top, regionLeft: region.left};
            });
            assert.ok(frozen.scrollTop > 0, 'The report can scroll vertically');
            assert.ok(Math.abs(frozen.headerTop - frozen.regionTop) <= 2, 'Unit headers remain fixed at the top');
            assert.ok(Math.abs(frozen.cornerTop - frozen.regionTop) <= 2, 'The corner remains fixed vertically');
            assert.ok(Math.abs(frozen.cornerLeft - frozen.regionLeft) <= 2, 'The corner remains fixed horizontally');
            assert.ok(Math.abs(frozen.labelLeft - frozen.regionLeft) <= 2, 'Row labels remain fixed horizontally');
            await page.locator('#domus-tax-report-close').click();
            await page.evaluate(() => { window.failLoad = true; });
            await page.getByRole('button', {name: 'Tax report', exact: true}).click();
            await page.getByText('Cannot load report', {exact: true}).waitFor();
            await page.evaluate(() => { window.failLoad = false; });
            await page.getByRole('button', {name: 'Retry', exact: true}).click();
            await table.waitFor();
            await page.keyboard.press('Escape');
            await page.evaluate(() => { window.emptyUnits = true; });
            await page.getByRole('button', {name: 'Tax report', exact: true}).click();
            await page.getByText('No units available for this scope.', {exact: true}).waitFor();
            await page.keyboard.press('Escape');
            assert.deepEqual(errors, []);
            console.log(`PASS Tax report layout, year status, retry, empty state and keyboard (${width}px)`);
        } catch (error) {
            failures++;
            console.error('FAIL Tax report ' + width + '\n' + error.stack);
        } finally { await page.close(); }
    }
    await browser.close();
    if (failures) process.exit(1);
})();
