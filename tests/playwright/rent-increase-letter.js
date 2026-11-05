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
            await page.clock.setFixedTime(new Date('2026-11-01T12:00:00Z'));
            await page.evaluate(() => {
                window.t = (app, text, params = {}) => text.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? k);
                window.OC = {generateUrl: path => path};
            });
            await page.addStyleTag({path: 'css/style.css'});
            for (const module of ['domusCoreBundle', 'domusPartners', 'domusDocuments', 'domusTenancies']) await page.addScriptTag({path: `js/${module}.js`});
            await page.evaluate(() => {
                window.unit = {livingArea: 80, constructionYear: 1980, street: 'Musterstraße 1', zip: '12345', city: 'Musterstadt'};
                window.tenancy = {id: 1, unitId: 2, startDate: '2020-02-03', unitLabel: 'Apartment', baseRent: 800, serviceCharge: 100, unitLivingArea: 80, status: 'active', partners: [{id: 3, name: 'Anna Muster'}, {id: 4, name: 'Max *Muster*'}], partnerIds: [3, 4]};
                Domus.Role.setRoleInfo({currentRole: 'landlord', availableRoles: ['landlord']});
                Domus.Documents.renderLatestList = () => '';
                Domus.Api.getUnits = async () => [{id: 2, label: 'Apartment'}];
                Domus.Api.getPartners = async () => tenancy.partners;
                Domus.Api.getUnitStatistics = async () => ({cost: {rows: []}});
                Domus.Api.get = async path => path === '/settings/rent-increase-template' ? (window.rentTemplate || {fileId: null, ready: false}) : path === '/units/2' ? unit : tenancy;
                window.uploads = [];
                window.failUpload = false;
                window.delayUpload = false;
                Domus.Api.attachDocumentToTargets = async payload => {
                    uploads.push({targets: payload.targets, name: payload.file.name, type: payload.file.type, text: await payload.file.text(), date: payload.documentDate});
                    if (delayUpload) await new Promise(resolve => { window.resolveUpload = resolve; });
                    if (failUpload) throw new Error('Upload failed');
                    return [{fileId: 77, fileUrl: 'https://nextcloud.test/f/77'}];
                };
                window.render = () => Domus.Tenancies.renderDetail(1, {isCurrent: () => true});
                return render();
            });
            await page.locator('#domus-tenancy-rent-increase').click();
            assert.equal(await page.locator('#rent-limit').inputValue(), '15');
            await page.locator('#rent-limit').fill('20');
            assert.equal(await page.locator('#rent-letter').isDisabled(), true);
            await page.waitForFunction(() => document.querySelector('#rent-year').textContent === '1980');
            await page.locator('#rent-index').fill('10');
            await page.locator('#rent-adjustment').fill('10');
            await page.locator('#rent-letter').click();
            const letter = page.getByRole('dialog', {name: 'Rent increase letter', exact: true});
            const text = letter.locator('#rent-letter-text');
            const draft = await text.inputValue();
            assert.ok(draft.includes('Anna Muster, Max \\*Muster\\*'));
            assert.ok(draft.includes('letzte Mietanpassung erfolgte zum 03.02.2020'));
            assert.ok(draft.includes('Musterstraße 1 in 12345 Musterstadt'));
            assert.ok(draft.includes('8,47 bis 13,53 Euro pro m²'));
            assert.ok(draft.includes('Wohnfläche beträgt 80,00 m²'));
            assert.ok(draft.includes('800,00 Euro (10,00 Euro pro m²)'));
            assert.ok(draft.includes('Erhöhung um 10,00 Prozent'));
            assert.ok(draft.includes('**Neue Kaltmiete:** 880,00 Euro'));
            assert.ok(draft.includes('**Nebenkostenvorauszahlung:** 100,00 Euro'));
            assert.ok(draft.includes('**Neue Gesamtmiete:** 980,00 Euro'));
            assert.equal((draft.match(/XX\.XX\.20XX/g) || []).length, 2);
            assert.ok(draft.includes('Stand 20XX'));
            assert.ok(draft.length < 1000);
            assert.ok(!draft.includes('beigefügte Zustimmungserklärung'));
            assert.ok(draft.includes('\n\n'));
            assert.equal(await page.evaluate(() => uploads.length), 0, 'Preview does not create a file');
            assert.equal(await letter.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
            const reviewed = draft.replace('Stand 20XX', 'Stand 2025').replace('XX.XX.20XX', '01.02.2027').replace('XX.XX.20XX', '31.01.2027');
            await text.fill(reviewed);
            await page.evaluate(() => { failUpload = true; });
            await letter.locator('#rent-letter-create').click();
            await letter.getByText('Upload failed', {exact: true}).waitFor();
            assert.equal(await text.inputValue(), reviewed);
            await page.evaluate(() => { failUpload = false; delayUpload = true; });
            await letter.locator('#rent-letter-create').click();
            await page.waitForFunction(() => Boolean(window.resolveUpload));
            assert.equal(await letter.locator('#rent-letter-create').isDisabled(), true);
            await page.evaluate(() => resolveUpload());
            await letter.getByText('Rent increase letter created.', {exact: true}).waitFor();
            assert.equal(await letter.locator('#rent-letter-create').isDisabled(), true);
            assert.equal(await letter.getByRole('link', {name: 'Open'}).getAttribute('href'), 'https://nextcloud.test/f/77');
            const uploaded = await page.evaluate(() => uploads[1]);
            assert.equal(uploaded.text, reviewed);
            assert.equal(uploaded.name, 'Mieterhoehung_1_2026-11-01.md');
            assert.match(uploaded.type, /^text\/markdown/);
            assert.deepEqual(uploaded.targets, [{entityType: 'unit', entityId: 2}, {entityType: 'tenancy', entityId: 1}]);
            assert.equal(await page.evaluate(() => tenancy.baseRent), 800);
            await letter.getByRole('button', {name: 'Continue', exact: true}).click();
            assert.equal(await page.locator('#rent-selected').inputValue(), '11.00');
            await page.locator('#rent-close').click();
            await page.getByRole('dialog', {name: 'Discard changes?', exact: true}).getByRole('button', {name: 'Discard changes', exact: true}).click();
            await page.evaluate(() => {
                window.rentTemplate = {fileId: 42, ready: true, name: 'Rent.docx'};
                window.wordCalls = [];
                window.failWord = true;
                Domus.Api.post = async (path, payload) => {
                    wordCalls.push({path, payload});
                    if (failWord) throw new Error('Template unavailable');
                    return [{fileUrl: 'https://nextcloud.test/f/88'}];
                };
            });
            await page.locator('#domus-tenancy-rent-increase').click();
            assert.equal(await page.locator('#rent-limit').inputValue(), '15');
            await page.locator('#rent-limit').fill('20');
            await page.waitForFunction(() => document.querySelector('#rent-year').textContent === '1980');
            await page.locator('#rent-index').fill('10');
            await page.locator('#rent-adjustment').fill('10');
            await page.locator('#rent-letter').click();
            const word = page.getByRole('dialog', {name: 'Rent increase letter', exact: true});
            await word.locator('#rent-word-form').waitFor();
            assert.equal(await page.locator('#rent-letter-text').count(), 0);
            assert.equal(await word.locator('[name="consentDeadline"]').count(), 0);
            assert.equal(await word.locator('[name="rentIndexYear"]').inputValue(), '2026');
            assert.equal(await word.locator('[name="effectiveDate"]').inputValue(), '2027-02-01');
            // Month ends, leap years and year rollover must use calendar months.
            for (const [date, effective] of [
                ['2027-12-31', '2028-03-01'],
                ['2026-12-31', '2027-03-01'],
                ['2027-01-31', '2027-04-01'],
                ['2026-11-15', '2027-02-01']
            ]) {
                await word.locator('[name="documentDate"]').fill(date);
                await word.locator('[name="documentDate"]').blur();
                assert.equal(await word.locator('[name="effectiveDate"]').inputValue(), effective);
            }
            await word.locator('[name="effectiveDate"]').fill('2027-03-01');
            await word.locator('[name="effectiveDate"]').blur();
            await word.locator('[name="effectiveDate"]').fill('2027-05-01');
            await word.locator('[name="documentDate"]').fill('2026-11-01');
            await word.locator('[name="documentDate"]').blur();
            assert.equal(await word.locator('[name="effectiveDate"]').inputValue(), '2027-05-01');

            await word.locator('[name="rentIndexYear"]').fill('');
            await word.getByRole('button', {name: 'Create document'}).click();
            assert.equal(await page.evaluate(() => wordCalls.length), 0);
            await word.locator('[name="rentIndexYear"]').fill('2025');
            await word.locator('[name="effectiveDate"]').fill('2026-11-01');
            await word.getByRole('button', {name: 'Create document'}).click();
            assert.equal(await page.evaluate(() => wordCalls.length), 0);
            await word.locator('[name="effectiveDate"]').fill('2027-02-01');
            await word.getByRole('button', {name: 'Create document'}).click();
            await word.getByText('Template unavailable', {exact: true}).waitFor();
            assert.equal(await word.locator('[name="effectiveDate"]').inputValue(), '2027-02-01');
            await page.evaluate(() => { failWord = false; });
            await word.getByRole('button', {name: 'Create document'}).click();
            await word.getByRole('link', {name: 'Open'}).waitFor();
            assert.equal(await word.getByRole('button', {name: 'Create document'}).isDisabled(), true);
            const wordCall = await page.evaluate(() => wordCalls[1]);
            assert.equal(wordCall.path, '/tenancies/1/rent-increase-report');
            assert.equal(wordCall.payload.calculation.price, 11);
            assert.equal(wordCall.payload.calculation.currentBaseRent, 800);
            assert.equal(wordCall.payload.rentIndexYear, '2025');
            assert.equal(wordCall.payload.consentDeadline, wordCall.payload.effectiveDate);
            assert.equal(wordCall.payload.consentDeadline, '2027-02-01');
            assert.equal(await word.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
            await word.getByRole('button', {name: 'Continue', exact: true}).click();
            assert.equal(await page.locator('#rent-selected').inputValue(), '11.00');
            assert.equal(await page.locator('#rent-continue').innerText(), 'Apply changes to tenancy');
            await page.locator('#rent-continue').click();
            const conditions = page.getByRole('dialog', {name: 'Change conditions', exact: true});
            await conditions.locator('[name="startDate"]').waitFor();
            assert.equal(await conditions.locator('[name="startDate"]').inputValue(), '2027-02-01');
            assert.equal(await conditions.locator('[name="baseRent"]').inputValue(), '880');
            assert.equal(await conditions.locator('[name="serviceCharge"]').inputValue(), '100');
            await conditions.locator('#domus-tenancy-cancel').click();
            await page.evaluate(() => { rentTemplate.ready = false; rentTemplate.error = 'Missing template'; });
            await page.locator('#domus-tenancy-rent-increase').click();
            assert.equal(await page.locator('#rent-limit').inputValue(), '15');
            await page.locator('#rent-limit').fill('20');
            await page.waitForFunction(() => document.querySelector('#rent-year').textContent === '1980');
            await page.locator('#rent-index').fill('11');
            await page.locator('#rent-letter').click();
            await page.locator('#rent-use-markdown').click();
            await page.locator('#rent-letter-text').waitFor();
            await page.locator('#rent-letter-close').click();
            await page.locator('#rent-close').click();
            await page.getByRole('dialog', {name: 'Discard changes?', exact: true}).getByRole('button', {name: 'Discard changes', exact: true}).click();
            await page.evaluate(() => {
                const original = Domus.Role.hasCapability;
                Domus.Role.hasCapability = name => name === 'manageDocuments' ? false : original(name);
                return render();
            });
            await page.locator('#domus-tenancy-rent-increase').click();
            assert.equal(await page.locator('#rent-limit').inputValue(), '15');
            await page.locator('#rent-limit').fill('20');
            assert.equal(await page.locator('#rent-letter').count(), 0);
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('PASS German rent increase letter, review, save/retry, duplicate guard, permissions and desktop/phone layout');
    } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exit(1);});
