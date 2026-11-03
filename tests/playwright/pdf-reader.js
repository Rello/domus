/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

function pdfFixture() {
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >>',
        '<< /Length 0 >>\nstream\n\nendstream'
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = pdf.length;
    pdf += 'xref\n0 5\n0000000000 65535 f \n';
    offsets.slice(1).forEach(offset => { pdf += String(offset).padStart(10, '0') + ' 00000 n \n'; });
    return pdf + `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
}

(async () => {
    const browser = await chromium.launch({headless: true, channel: 'chromium'});
    try {
        for (const width of [1280, 390]) {
            const page = await browser.newPage({viewport: {width, height: 720}});
            let mode = 'success';
            const requests = [];
            await page.route('http://domus.test/**', async route => {
                if (route.request().url().endsWith('/content')) {
                    requests.push(route.request().headers());
                    if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 200));
                    await route.fulfill({status: mode === 'error' ? 403 : 200,
                        contentType: mode === 'html' ? 'text/html' : 'application/pdf', body: pdfFixture()}).catch(() => {});
                } else await route.fulfill({contentType: 'text/html', body: '<main id="list"></main>'});
            });
            await page.goto('http://domus.test');
            await page.evaluate(() => {
                window.t = (app, value) => value;
                window.OC = {generateUrl: path => path, requestToken: 'fixture'};
            });
            await page.addStyleTag({path: 'css/style.css'});
            await page.addScriptTag({path: 'js/domusCoreBundle.js'});
            await page.addScriptTag({path: 'js/domusDocuments.js'});
            await page.evaluate(() => {
                window.violations = [];
                document.addEventListener('securitypolicyviolation', event => violations.push(event.violatedDirective));
                const policy = document.createElement('meta');
                policy.httpEquiv = 'Content-Security-Policy';
                policy.content = "frame-src blob:; object-src 'none'";
                document.head.appendChild(policy);
                Domus.state.managementContext = {activeTeamId: 'team-a'};
                Domus.Api.getDocuments = async () => [{id: 42, fileName: 'Receipt', filePath: '/Receipts/test.PDF', fileUrl: '/f/123?openfile=true'}];
                document.querySelector('#list').innerHTML = Domus.Documents.renderLatestList('unit', 1, {defer: true, canManageDocuments: false});
                Domus.Documents.loadLatestList('unit', 1, {canManageDocuments: false});
                window.revoked = [];
                const revoke = URL.revokeObjectURL.bind(URL);
                URL.revokeObjectURL = url => { revoked.push(url); revoke(url); };
            });
            const link = page.getByRole('link', {name: 'Receipt', exact: true});
            await link.focus();
            await link.press('Enter');
            const dialog = page.getByRole('dialog', {name: 'Receipt', exact: true});
            const download = dialog.getByRole('link', {name: 'Download', exact: true});
            await download.waitFor();
            assert.equal(requests.at(-1)['x-domus-team'], 'team-a');
            assert.match(await download.getAttribute('href'), /^blob:/);
            assert.equal(await download.getAttribute('download'), 'Receipt.pdf');
            assert.equal(await dialog.getByRole('link', {name: 'Open in Nextcloud'}).getAttribute('href'), 'http://domus.test/f/123?openfile=true');
            assert.equal(await page.locator('.domus-modal-footer a').count(), 2);
            const rect = await dialog.boundingBox();
            assert.ok(rect.x >= 0 && rect.x + rect.width <= width + 1);
            assert.ok((await dialog.locator('iframe').boundingBox()).height > 200);
            assert.deepEqual(await page.evaluate(() => violations), []);
            const downloadEvent = page.waitForEvent('download');
            await download.click();
            assert.equal((await downloadEvent).suggestedFilename(), 'Receipt.pdf');
            await dialog.getByRole('button', {name: 'Close modal'}).click();
            assert.equal(await page.evaluate(() => revoked.length), 1);
            assert.equal(await link.evaluate(el => el === document.activeElement), true);
            for (const failure of ['error', 'html']) {
                mode = failure;
                await link.click();
                await dialog.getByRole('alert').waitFor();
                assert.equal(await dialog.locator('iframe[src]').count(), 0);
                assert.equal(await dialog.getByRole('link', {name: 'Download', exact: true}).count(), 0);
                await page.keyboard.press('Escape');
            }
            mode = 'slow';
            await link.click();
            await dialog.getByRole('status').waitFor();
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);
            assert.equal(await page.getByRole('dialog').count(), 0);
            assert.equal(await page.evaluate(() => revoked.length), 1);
            mode = 'success';
            await page.evaluate(() => {
                Domus.state.managementContext = {activeTeamId: null};
                Domus.Documents.openPdf({id: 42, fileName: 'Team.pdf', fileUrl: '/apps/domus/api/documents/42/content'});
            });
            await page.getByRole('link', {name: 'Download', exact: true}).waitFor();
            assert.equal(requests.at(-1)['x-domus-team'], 'Personal');
            assert.equal(await page.getByRole('link', {name: 'Open in Nextcloud'}).count(), 0);
            await page.close();
        }
        console.log('PDF reader: desktop/mobile, scoped delivery, download, fallback, cleanup and focus passed');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
