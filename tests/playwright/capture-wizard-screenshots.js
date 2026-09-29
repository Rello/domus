/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = (process.env.DOMUS_BASE_URL || 'http://host.docker.internal:8035').replace(/\/$/, '');
const outputDir = path.resolve('img/pictures');
const captureNames = ['unit.png', 'booking.png', 'tenancy.png', 'dashboard.png'];

async function capture(page, stageDir, name, clip) {
    await page.screenshot({path: path.join(stageDir, name), clip, animations: 'disabled'});
    console.log(`Captured ${name}`);
}

async function main() {
    if (!process.env.DOMUS_USER || !process.env.DOMUS_PASSWORD) {
        throw new Error('DOMUS_USER and DOMUS_PASSWORD are required.');
    }

    const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'domus-wizard-'));
    const browser = await chromium.launch({headless: true});
    try {
        const context = await browser.newContext({
            viewport: {width: 1280, height: 900},
            deviceScaleFactor: 1,
            locale: 'en-US',
            timezoneId: 'Europe/Berlin',
            colorScheme: 'light'
        });
        const page = await context.newPage();
        await page.goto(`${baseUrl}/index.php/apps/domus/`, {waitUntil: 'domcontentloaded'});
        if (new URL(page.url()).pathname.includes('/login')) {
            await page.locator('input[name="user"]').fill(process.env.DOMUS_USER);
            await page.locator('input[name="password"]').fill(process.env.DOMUS_PASSWORD);
            await page.locator('button[type="submit"]').click();
            await page.waitForURL(/\/apps\/domus\//);
        }

        await page.locator('.domus-dashboard').first().waitFor();
        const wizard = page.getByRole('dialog', {name: 'Domus'});
        if (await wizard.isVisible() || await wizard.waitFor({state: 'visible', timeout: 800}).then(() => true, () => false)) {
            await wizard.getByRole('button', {name: 'Close'}).click();
        }

        await page.getByRole('link', {name: 'Units', exact: true}).first().click();
        await page.getByRole('button', {name: /Demo apartment Demo apartment/}).click();
        await page.getByRole('heading', {name: 'Demo apartment', exact: true}).waitFor();
        const unitPhoto = page.locator('.domus-unit-workspace img[alt="Demo apartment"]');
        await unitPhoto.waitFor();
        await page.waitForFunction(() => {
            const image = document.querySelector('.domus-unit-workspace img[alt="Demo apartment"]');
            return image && image.complete && image.naturalWidth > 0 && image.currentSrc.includes('/core/preview?');
        });
        const unitHero = await page.locator('.domus-unit-workspace .domus-detail-hero').boundingBox();
        const tenancyTile = await page.locator('.domus-kpi-tiles-unit-detail .domus-unit-kpi-tile').nth(2).boundingBox();
        if (!unitHero || !tenancyTile) throw new Error('Unit overview is not ready for capture.');
        await capture(page, stageDir, 'unit.png', {
            x: unitHero.x,
            y: unitHero.y,
            width: tenancyTile.x + tenancyTile.width - unitHero.x + 24,
            height: tenancyTile.y + tenancyTile.height - unitHero.y
        });

        await page.getByRole('link', {name: 'Finances', exact: true}).click();
        const financeSummary = page.locator('.domus-unit-finance-summary');
        await financeSummary.waitFor();
        const financeTable = page.locator('#domus-unit-revenue-table-detail table.domus-table');
        await financeTable.waitFor();
        const financeHeading = await page.getByRole('heading', {name: 'Finances', exact: true}).boundingBox();
        const financeSummaryBox = await financeSummary.boundingBox();
        const financeTableBox = await financeTable.boundingBox();
        if (!financeHeading || !financeSummaryBox || !financeTableBox) throw new Error('Finance table is not ready for capture.');
        await capture(page, stageDir, 'booking.png', {
            x: financeSummaryBox.x,
            y: financeHeading.y,
            width: Math.floor(financeSummaryBox.width * 2 / 3),
            height: financeTableBox.y + financeTableBox.height - financeHeading.y
        });

        await page.getByRole('link', {name: /Demo renter/}).first().click();
        await page.getByRole('heading', {name: /Demo renter.*Demo apartment/}).waitFor();
        await page.getByRole('heading', {name: 'Conditions'}).waitFor();
        const tenancyHero = await page.locator('.domus-tenancy-detail .domus-detail-hero').boundingBox();
        if (!tenancyHero) throw new Error('Tenancy details are not ready for capture.');
        await capture(page, stageDir, 'tenancy.png', {
            x: tenancyHero.x,
            y: tenancyHero.y,
            width: 922,
            height: 560
        });

        await page.getByRole('link', {name: 'Dashboard', exact: true}).first().click();
        await page.getByRole('heading', {name: 'Needs attention'}).waitFor();
        await page.getByRole('heading', {name: 'Quick Actions'}).waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll('.domus-dashboard-panel-row img[alt="Demo apartment"]')]
            .some(image => image.complete && image.naturalWidth > 0));
        await page.addStyleTag({content: '.domus-dashboard-task-group:not(.domus-dashboard-task-group-overdue) { display: none !important; }'});
        const dashboardPanels = await page.locator('.domus-dashboard-panel-row').boundingBox();
        const dashboardKpis = await page.locator('.domus-dashboard-kpi-row').boundingBox();
        if (!dashboardPanels || !dashboardKpis) throw new Error('Dashboard is not ready for capture.');
        await capture(page, stageDir, 'dashboard.png', {
            x: dashboardPanels.x,
            y: dashboardPanels.y,
            width: dashboardPanels.width,
            height: dashboardKpis.y + dashboardKpis.height - dashboardPanels.y
        });

        for (const name of captureNames) {
            await fs.copyFile(path.join(stageDir, name), path.join(outputDir, name));
        }

        if (process.env.DOMUS_PREVIEW_DIR) {
            const previewDir = path.resolve(process.env.DOMUS_PREVIEW_DIR);
            await fs.mkdir(previewDir, {recursive: true});
            if (!await page.evaluate(() => Boolean(window.Domus.Wizard))) {
                const wizardScript = await page.locator('script[src*="domusWizard"]').getAttribute('src');
                throw new Error(`Wizard script did not load: ${wizardScript}`);
            }
            await page.evaluate(() => window.Domus.Wizard.show());
            const dialog = page.getByRole('dialog', {name: 'Domus'});
            for (const [label, name] of [
                ['Money and paperwork', 'booking-wizard.png'],
                ['Dashboard', 'dashboard-wizard.png']
            ]) {
                await dialog.getByRole('button', {name: label}).click();
                await page.waitForFunction(() => {
                    const image = document.querySelector('.domus-guidance-media-image');
                    return image && image.complete && image.naturalWidth > 0;
                });
                const imageWidth = await page.locator('.domus-guidance-media-image').evaluate(image => image.getBoundingClientRect().width);
                if (imageWidth < 300) throw new Error(`${label} screenshot is too small in the wizard: ${imageWidth}px`);
                await page.screenshot({path: path.join(previewDir, name), animations: 'disabled'});
            }
        }
        console.log('Updated four wizard images from NC35.');
    } finally {
        await browser.close();
        await fs.rm(stageDir, {recursive: true, force: true});
    }
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
