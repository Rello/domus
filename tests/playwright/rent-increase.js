/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async () => {
    const browser = await chromium.launch({headless: true});
    try {
        for (const width of [1280, 390]) {
            const page = await browser.newPage({viewport: {width, height: 900}});
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.setContent('<div id="app-content"><div id="domus-content"></div></div>');
            await page.evaluate(() => {
                window.t = (app, text, params = {}) => text.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? k);
                window.OC = {generateUrl: path => path};
            });
            await page.addStyleTag({path: 'css/style.css'});
            for (const module of ['domusCoreBundle', 'domusPartners', 'domusDocuments', 'domusTenancies']) await page.addScriptTag({path: `js/${module}.js`});
            await page.evaluate(() => {
                window.unit = {livingArea: 80, constructionYear: 1980};
                window.tenancy = {id: 1, unitId: 2, unitLabel: 'Apartment', baseRent: 800, serviceCharge: 100, conditions: 'Existing terms', unitLivingArea: 80, status: 'active', partners: [], partnerIds: []};
                Domus.Role.setRoleInfo({currentRole: 'landlord', availableRoles: ['landlord']});
                Domus.Documents.renderLatestList = () => '';
                Domus.Api.getUnits = async () => [{id: 2, label: 'Apartment'}];
                Domus.Api.getPartners = async () => [];
                window.conditionWrites = 0;
                Domus.Api.changeTenancyConditions = async () => { conditionWrites++; return tenancy; };
                window.costRows = [{year: new Date().getFullYear() - 1, allocableCosts: 1700, isProvisional: true}, {year: new Date().getFullYear(), allocableCosts: 9999}];
                Domus.Api.getUnitStatistics = async () => {
                    if (window.failCosts) throw new Error('Cost failure');
                    if (window.delayCosts) await new Promise(resolve => { window.resolveCosts = resolve; });
                    return {cost: {rows: costRows}};
                };
                Domus.Api.get = async path => {
                    if (path === '/units/2') { if (window.failUnit) throw new Error('failed'); return unit; }
                    return tenancy;
                };
                window.render = () => Domus.Tenancies.renderDetail(1, {isCurrent: () => true});
                return render();
            });
            await page.clock.setFixedTime(new Date('2026-10-30T12:00:00Z'));
            // Loaded defaults remain clean; all user dismissal paths protect edits.
            await page.locator('#domus-tenancy-rent-increase').click();
            await page.waitForFunction(() => document.querySelector('#rent-service-selected').value === '141.67');
            await page.locator('#rent-close').click();
            assert.equal(await page.getByRole('dialog').count(), 0);
            for (const dismissal of ['button', 'header', 'escape', 'backdrop']) {
                await page.locator('#domus-tenancy-rent-increase').click();
                await page.locator('#rent-index').fill('12');
                if (dismissal === 'button') await page.locator('#rent-close').click();
                if (dismissal === 'header') await page.getByRole('button', {name: 'Close modal', exact: true}).click();
                if (dismissal === 'escape') await page.keyboard.press('Escape');
                if (dismissal === 'backdrop') await page.locator('.domus-modal-backdrop').click({position: {x: 2, y: 2}});
                const confirmation = page.getByRole('dialog', {name: 'Discard changes?', exact: true});
                await confirmation.getByRole('button', {name: 'Keep editing', exact: true}).click();
                assert.equal(await page.locator('#rent-index').inputValue(), '12');
                await page.locator('#rent-close').click();
                await confirmation.getByRole('button', {name: 'Discard changes', exact: true}).click();
                assert.equal(await page.getByRole('dialog').count(), 0);
            }
            for (const [startDate, expected] of [['2023-10-31', 1], ['2026-10-30', 1], ['2023-10-30', 0], ['2022-10-30', 0], ['2026-10-31', 0], ['', 0], ['invalid', 0]]) {
                await page.evaluate(date => { tenancy.startDate = date; }, startDate);
                await page.locator('#domus-tenancy-rent-increase').click();
            assert.equal(await page.locator('#rent-limit').inputValue(), '15');
            await page.locator('#rent-limit').fill('20');
                assert.equal(await page.locator('.domus-rent-warning').count(), expected);
                if (expected) assert.equal(await page.locator('.domus-rent-calculator > :first-child').getAttribute('role'), 'alert');
                await page.locator('#rent-close').click();
            await page.getByRole('dialog', {name: 'Discard changes?', exact: true}).getByRole('button', {name: 'Discard changes', exact: true}).click();
            }
            assert.equal(await page.locator('#domus-tenancy-change').count(), 1);
            await page.locator('#domus-tenancy-rent-increase').click();
            assert.equal(await page.locator('#rent-limit').inputValue(), '15');
            await page.locator('#rent-limit').fill('20');
            await page.waitForFunction(() => document.querySelector('#rent-year').textContent === '1980');
            await page.locator('#rent-index').fill('10');
            await page.locator('#rent-adjustment').fill('10');
            const selected = page.locator('#rent-selected');
            await page.waitForFunction(() => document.querySelector('#rent-service-selected').value === '141.67');
            assert.match(await page.locator('#rent-service-cost').innerText(), /141[.,]67/);
            assert.equal(await page.locator('#rent-service-status').innerText(), '');
            assert.equal(await page.locator('#rent-range').count(), 1);
            assert.match(await page.locator('#rent-range').innerText(), /–/);
            assert.match(await page.locator('#rent-increase').innerText(), /201[.,]67/);
            assert.match(await page.locator('#rent-combined-total').innerText(), /1[.,]?101[.,]67/);
            await page.locator('#rent-service-selected').fill('160');
            assert.match(await page.locator('#rent-combined-total').innerText(), /1[.,]?120/);
            assert.match(await page.locator('#rent-increase').innerText(), /220/);
            await page.locator('#rent-service-selected').fill('-1');
            assert.equal(await page.locator('#rent-combined-total').innerText(), '—');
            await page.locator('#rent-service-selected').fill('0');
            assert.match(await page.locator('#rent-combined-total').innerText(), /960/);
            await page.locator('#rent-service-selected').fill('160');
            assert.equal(await selected.getAttribute('min'), '10.00');
            assert.equal(await selected.getAttribute('max'), '12.00');
            assert.equal(await selected.inputValue(), '12.00');

            assert.equal(await page.locator('#rent-limit').inputValue(), '20');
            await page.locator('#rent-limit').fill('15');
            assert.equal(await selected.inputValue(), '11.50');

            for (const value of ['', '-1', '0']) {
                await page.locator('#rent-limit').fill(value);
                assert.equal(await selected.isDisabled(), true);
                assert.equal(await page.locator('#rent-continue').isDisabled(), true);
                assert.equal(await page.locator('#rent-combined-total').innerText(), '—');
            }
            await page.locator('#rent-limit').fill('20');
            assert.equal(await selected.inputValue(), '12.00');
            assert.equal(await page.locator('#rent-result-status').innerText(), '');
            assert.equal(await page.locator('.domus-rent-inputs').first().locator('input').count(), 4);
            for (const input of await page.locator('.domus-rent-calculator input').all()) {
                assert.equal(await input.evaluate(el => Boolean(el.closest('.domus-form .domus-form-table .domus-form-value'))), true);
            }
            const fieldBoxes = await Promise.all(['index', 'adjustment', 'spread', 'limit'].map(name => page.locator('#rent-' + name).boundingBox()));
            assert.ok(fieldBoxes.every(box => box.width <= 180));
            if (width > 600) {
                assert.ok(Math.abs(fieldBoxes[0].y - fieldBoxes[1].y) < 1);
                assert.ok(Math.abs(fieldBoxes[2].y - fieldBoxes[3].y) < 1);
                assert.ok(fieldBoxes[1].x > fieldBoxes[0].x);
            } else {
                assert.ok(fieldBoxes[1].y > fieldBoxes[0].y);
            }
            assert.ok(fieldBoxes[2].y > fieldBoxes[0].y);
            const indexLabel = await page.locator('label[for="rent-index"]').boundingBox();
            assert.ok(indexLabel.x < fieldBoxes[0].x);
            assert.ok(indexLabel.y < fieldBoxes[0].y + fieldBoxes[0].height);
            assert.match(await page.locator('.domus-rent-range-summary').innerText(), /←.*→/);
            await selected.fill('11.00');
            assert.match(await page.locator('#rent-combined-total').innerText(), /1[.,]?040/);
            assert.match(await page.locator('#rent-increase').innerText(), /140/);

            await selected.fill('12.00');

            await selected.fill('12.01');
            assert.equal(await page.locator('#rent-combined-total').innerText(), '—');
            await page.locator('#rent-index').fill('30');
            assert.equal(await selected.isDisabled(), false);
            assert.equal(await selected.inputValue(), '12.00');

            assert.equal(await selected.getAttribute('min'), '10.00');
            await page.locator('#rent-index').fill('11');
            assert.equal(await selected.evaluate(el => el.readOnly), false);
            await page.locator('#rent-spread').fill('10');
            assert.equal(await selected.getAttribute('min'), '10.89');
            assert.equal(await selected.inputValue(), '12.00');
            await page.locator('#rent-index').fill('4');
            assert.equal(await selected.isDisabled(), true);
            await page.locator('#rent-index').fill('10');
            await page.locator('#rent-spread').fill('0');
            assert.equal(await selected.getAttribute('min'), '10.00');
            assert.equal(await selected.getAttribute('max'), '11.00');
            assert.equal(await selected.inputValue(), '11.00');

            await page.locator('#rent-adjustment').fill('-100');
            assert.equal(await selected.isDisabled(), true);
            await page.locator('#rent-adjustment').fill('0');
            await page.locator('#rent-index').fill('');
            assert.equal(await selected.isDisabled(), true);
            const overflow = await page.getByRole('dialog').evaluate(el => el.scrollWidth > el.clientWidth + 1);
            assert.equal(overflow, false);
            await page.locator('#rent-close').click();
            await page.getByRole('dialog', {name: 'Discard changes?', exact: true}).getByRole('button', {name: 'Discard changes', exact: true}).click();
            await page.evaluate(() => { tenancy.baseRent = 632; });
            await page.locator('#domus-tenancy-rent-increase').click();
            assert.equal(await page.locator('#rent-limit').inputValue(), '15');
            await page.locator('#rent-limit').fill('20');
            await page.waitForFunction(() => document.querySelector('#rent-year').textContent === '1980');
            await page.locator('#rent-index').fill('13.55');
            assert.equal(await selected.inputValue(), '9.48');
            assert.equal(await selected.getAttribute('min'), '7.90');
            assert.equal(await selected.getAttribute('max'), '9.48');
            assert.equal(await selected.evaluate(el => el.readOnly), false);

            await selected.fill('9.00');

            const inputBox = await selected.boundingBox();
            const serviceBox = await page.locator('#rent-service-selected').boundingBox();
            assert.ok(inputBox.width <= 180);
            assert.ok(serviceBox.y > inputBox.y);
            assert.ok(Math.abs(inputBox.x - serviceBox.x) < 1);
            assert.equal(await selected.evaluate(el => getComputedStyle(el).textAlign), 'end');
            await page.locator('#rent-close').click();
            await page.getByRole('dialog', {name: 'Discard changes?', exact: true}).getByRole('button', {name: 'Discard changes', exact: true}).click();
            await page.locator('#domus-tenancy-rent-increase').click();
            assert.equal(await page.locator('#rent-limit').inputValue(), '15');
            await page.locator('#rent-limit').fill('20');
            await page.waitForFunction(() => document.querySelector('#rent-service-selected').value === '141.67');
            await page.locator('#rent-index').fill('13.55');
            await selected.fill('9');
            await page.locator('#rent-service-selected').fill('160');
            await page.locator('#rent-continue').click();
            const conditions = page.getByRole('dialog', {name: 'Change conditions', exact: true});
            await conditions.waitFor();
            assert.equal(await conditions.locator('[name="baseRent"]').inputValue(), '720');
            assert.equal(await conditions.locator('[name="serviceCharge"]').inputValue(), '160');
            const note = await conditions.locator('[name="conditions"]').inputValue();
            assert.ok(note.startsWith('Existing terms\n\nRent calculation:'));
            assert.match(note, /0% adjustments applied/);
            assert.match(note, /manually selected below the rent index range/);
            assert.match(note, /720.*month/);
            assert.equal(await page.evaluate(() => tenancy.conditions), 'Existing terms');
            assert.equal(await page.locator('#rent-selected').count(), 0);
            assert.equal(await page.evaluate(() => conditionWrites), 0);
            assert.equal(await page.evaluate(() => tenancy.baseRent), 632);
            await conditions.locator('#domus-tenancy-cancel').click();
            await page.locator('#domus-tenancy-change').click();
            await conditions.waitFor();
            assert.equal(await conditions.locator('[name="baseRent"]').inputValue(), '632');
            assert.equal(await conditions.locator('[name="serviceCharge"]').inputValue(), '100');
            await conditions.locator('#domus-tenancy-cancel').click();
            for (const [index, adjustment, reason] of [['13.55', '6', 'Base rent capped by the 20% increase limit.'], ['7.5', '0', 'Base rent within the rent index range.']]) {
                await page.locator('#domus-tenancy-rent-increase').click();
            assert.equal(await page.locator('#rent-limit').inputValue(), '15');
            await page.locator('#rent-limit').fill('20');
                await page.waitForFunction(() => document.querySelector('#rent-year').textContent === '1980');
                await page.locator('#rent-index').fill(index);
                await page.locator('#rent-adjustment').fill(adjustment);
                await page.locator('#rent-continue').click();
                await conditions.waitFor();
                const explanation = await conditions.locator('[name="conditions"]').inputValue();
                assert.ok(explanation.includes(reason), explanation);
                assert.ok(explanation.includes(adjustment + '% adjustments applied'));
                assert.equal(explanation.split('Rent calculation:').length, 2);
                await conditions.locator('#domus-tenancy-cancel').click();
            }
            await page.evaluate(() => { failCosts = true; });
            await page.locator('#domus-tenancy-rent-increase').click();
            assert.equal(await page.locator('#rent-limit').inputValue(), '15');
            await page.locator('#rent-limit').fill('20');
            await page.locator('#rent-service-retry').waitFor({state: 'visible'});
            assert.equal(await page.locator('#rent-service-selected').inputValue(), '100.00');
            await page.locator('#rent-service-selected').fill('170');
            await page.evaluate(() => { failCosts = false; costRows[0].allocableCosts = 1800; });
            await page.locator('#rent-service-retry').click();
            await page.waitForFunction(() => document.querySelector('#rent-service-recommended').textContent.includes('150'));
            assert.equal(await page.locator('#rent-service-selected').inputValue(), '170');
            await page.locator('#rent-close').click();
            await page.getByRole('dialog', {name: 'Discard changes?', exact: true}).getByRole('button', {name: 'Discard changes', exact: true}).click();
            await page.evaluate(() => { costRows = []; });
            await page.locator('#domus-tenancy-rent-increase').click();
            assert.equal(await page.locator('#rent-limit').inputValue(), '15');
            await page.locator('#rent-limit').fill('20');
            await page.waitForFunction(() => document.querySelector('#rent-service-status').textContent.startsWith('No cost report'));
            assert.equal(await page.locator('#rent-service-recommended').innerText(), '—');
            assert.equal(await page.locator('#rent-service-selected').inputValue(), '100.00');
            await page.locator('#rent-close').click();
            await page.getByRole('dialog', {name: 'Discard changes?', exact: true}).getByRole('button', {name: 'Discard changes', exact: true}).click();
            await page.evaluate(() => { failUnit = true; });
            await page.locator('#domus-tenancy-rent-increase').click();
            assert.equal(await page.locator('#rent-limit').inputValue(), '15');
            await page.locator('#rent-limit').fill('20');
            await page.locator('#rent-retry').waitFor({state:'visible'});
            await page.evaluate(() => { failUnit = false; unit.livingArea = 0; });
            await page.locator('#rent-retry').click();
            await page.locator('#rent-index').fill('10');
            assert.equal(await selected.isDisabled(), true);
            await page.locator('#rent-close').click();
            await page.getByRole('dialog', {name: 'Discard changes?', exact: true}).getByRole('button', {name: 'Discard changes', exact: true}).click();
            for (const status of ['historical', 'future']) {
                await page.evaluate(status => { tenancy.status = status; return render(); }, status);
                assert.equal(await page.locator('#domus-tenancy-rent-increase').count(), 0);
            }
            await page.evaluate(() => { tenancy.status = 'active'; Domus.Role.hasCapability = () => false; return render(); });
            assert.equal(await page.locator('#domus-tenancy-rent-increase').count(), 0);
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('PASS rent increase calculations, limits, invalid inputs, load retry, permissions and responsive dialog');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
