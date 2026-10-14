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
        await page.setContent('<div id="app-content" class="app-domus"></div>');
        await page.evaluate(() => {
            window.t = (app, value, params = {}) => value.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? key);
            window.OC = { generateUrl: path => path };
        });
        for (const module of ['CoreBundle', 'Accounts', 'Distributions', 'Partners', 'Properties', 'ActionLog', 'Tasks', 'Units', 'Dashboard', 'Analytics', 'Tenancies', 'Bookings', 'Settings', 'Documents']) {
            await page.addScriptTag({ path: `js/domus${module}.js` });
        }
        await page.evaluate(() => {
            Domus.Navigation.render = () => {};
            Domus.Router.register('dashboard', Domus.Dashboard.render);
            Domus.Router.register('other', () => Domus.UI.renderContent('<h2>Other screen</h2>'));
            window.requests = [];
            Domus.Api.getDashboardSummary = () => new Promise((resolve, reject) => requests.push({ resolve, reject }));
            window.charts = [];
            window.Chart = class {
                constructor() { this.destroyCalls = 0; charts.push(this); }
                destroy() { this.destroyCalls++; }
            };
            window.summary = { unitCount: 1, monthlyBaseRentSum: 120, occupancy: { occupied: 1, vacant: 0 }, openTasks: [] };
            Domus.Router.navigate('dashboard');
            Domus.Router.navigate('other');
            requests[0].resolve(summary);
        });
        await page.waitForTimeout(30);
        assert.equal(await page.locator('h2').innerText(), 'Other screen');
        assert.equal(await page.evaluate(() => charts.length), 0);
        console.log('PASS delayed dashboard success cannot overwrite the next screen');

        await page.evaluate(() => {
            Domus.Router.navigate('dashboard');
            Domus.Router.navigate('other');
            requests[1].reject(new Error('Obsolete failure'));
        });
        await page.waitForTimeout(30);
        assert.equal(await page.locator('h2').innerText(), 'Other screen');
        console.log('PASS delayed dashboard failure cannot replace the next screen');

        await page.evaluate(() => {
            Domus.Router.navigate('dashboard');
            Domus.Dashboard.render();
            requests[3].resolve(summary);
        });
        await page.locator('#domus-dashboard-occupancy-chart').waitFor();
        const currentContent = await page.locator('#app-content').innerHTML();
        await page.evaluate(() => requests[2].resolve({ unitCount: 99 }));
        await page.waitForTimeout(30);
        assert.equal(await page.locator('#app-content').innerHTML(), currentContent);
        assert.equal(await page.evaluate(() => charts.length), 1);
        console.log('PASS direct same-route refresh invalidates the previous response');

        await page.evaluate(() => {
            Domus.Router.navigate('other');
            Domus.UI.renderContent('<h2>Replacement</h2>');
        });
        assert.deepEqual(await page.evaluate(() => charts.map(chart => chart.destroyCalls)), [1]);
        console.log('PASS navigation destroys chart resources exactly once');

        await page.evaluate(() => {
            Domus.Router.navigate('dashboard');
            requests[4].reject(new Error('Current failure'));
        });
        await page.locator('.domus-error').waitFor();
        assert.equal(await page.locator('.domus-error').innerText(), 'Current failure');
        console.log('PASS current view failures still show the error');

        // Embedded document requests must not populate another incarnation of
        // the same container after navigating away and back.
        await page.evaluate(() => {
            window.documentRequests = [];
            Domus.Api.getDocuments = () => new Promise((resolve, reject) => documentRequests.push({ resolve, reject }));
            Domus.Router.register('documents', () => {
                Domus.UI.renderContent(Domus.Documents.renderList('unit', 1, { canManageDocuments: false }));
            });
            Domus.Router.navigate('documents');
            Domus.Router.navigate('other');
            Domus.Router.navigate('documents');
            documentRequests[1].resolve([{ id: 2, name: 'Current document', fileName: 'Current document' }]);
        });
        await page.locator('.domus-documents-row').waitFor();
        const documentContent = await page.locator('#domus-documents-unit-1').innerHTML();
        await page.evaluate(() => documentRequests[0].reject(new Error('Old document failure')));
        await page.waitForTimeout(30);
        assert.equal(await page.locator('#domus-documents-unit-1').innerHTML(), documentContent);
        console.log('PASS stale embedded document failure cannot clear new content');

        await page.evaluate(() => {
            Domus.Accounts.toOptions = () => [{ value: '2000', label: 'Rent' }];
            Domus.Api.getUnits = async () => [];
            Domus.Api.getAccountTotals = async () => ({ years: [2026], series: { 2000: [120] } });
            Domus.Router.register('analytics', Domus.Analytics.render);
            Domus.Router.navigate('analytics');
        });
        await page.locator('#domus-analytics-chart').waitFor({ state: 'visible' });
        await page.evaluate(() => Domus.Router.navigate('other'));
        assert.deepEqual(await page.evaluate(() => charts.map(chart => chart.destroyCalls)), [1, 1]);
        console.log('PASS analytics chart participates in shared disposal');
        await page.evaluate(() => {
            const unit = { id: 1, label: 'Lifecycle unit', activeTenancies: [], futureTenancies: [], historicTenancies: [] };
            Domus.Api.get = async () => unit;
            Domus.Api.getUnitStatistics = async () => ({
                revenue: { columns: [], rows: [{ year: 2025, baseRent: 1200, netRentability: 2 }, { year: 2026, baseRent: 1200, netRentability: 2 }] },
                cost: { columns: [], rows: [] }
            });
            Domus.Api.getSettings = async () => ({ settings: {} });
            Domus.Api.getBookings = async () => [];
            Domus.Api.getUnitPartners = async () => [];
            Domus.Api.getProperties = async () => [];
            Domus.Api.getDocuments = async () => Array.from({ length: 20 }, (_, index) => ({ id: index + 1, fileName: 'Document ' + index }));
            Domus.Api.getTasksByEntity = async () => [];
            Domus.Api.getWorkflowRunsByEntity = async () => [];
            Domus.Distributions.loadForUnit = async () => [];
            Domus.Router.register('unitDetail', Domus.Units.renderDetail);
            Domus.Router.navigate('unitDetail', [1]);
        });
        await page.getByRole('navigation', { name: 'Unit sections' }).waitFor();
        await page.evaluate(() => { window.unitCharts = charts.slice(-2); });
        await page.getByRole('navigation', { name: 'Unit sections' }).getByRole('link', { name: 'Documents', exact: true }).click();
        await page.locator('#domus-unit-detail-documents-1 .domus-documents-row').first().waitFor();
        assert.equal(await page.locator('#domus-unit-detail-documents-1 .domus-documents-row').count(), 10);
        await page.evaluate(() => {
            Domus.Api.getUnitStatistics = async () => { throw new Error('Unit refresh failed'); };
            Domus.Units.refreshDetail(1);
        });
        await page.getByText('Unit refresh failed', { exact: true }).waitFor();
        assert.deepEqual(await page.evaluate(() => unitCharts.map(chart => chart.destroyCalls)), [0, 0]);
        await page.locator('#domus-unit-detail-documents-1-more').click();
        assert.equal(await page.locator('#domus-unit-detail-documents-1 .domus-documents-row').count(), 20);
        console.log('PASS failed in-place unit refresh retains charts and working document pagination');

        await page.evaluate(() => {
            window.slotRequests = [];
            Domus.Api.getDocuments = () => new Promise((resolve, reject) => slotRequests.push({ resolve, reject }));
        });
        const sections = page.getByRole('navigation', { name: 'Unit sections' });
        await sections.getByRole('link', { name: 'Overview', exact: true }).click();
        await sections.getByRole('link', { name: 'Documents', exact: true }).click();
        await sections.getByRole('link', { name: 'Overview', exact: true }).click();
        await sections.getByRole('link', { name: 'Documents', exact: true }).click();
        await page.evaluate(() => slotRequests[1].resolve([{ id: 101, fileName: 'Latest section document' }]));
        await page.getByText('Latest section document', { exact: true }).waitFor();
        await page.evaluate(() => slotRequests[0].reject(new Error('Obsolete section request')));
        await page.waitForTimeout(30);
        assert.equal(await page.getByText('Latest section document', { exact: true }).count(), 1);
        console.log('PASS section re-entry invalidates the previous embedded request');

        await page.evaluate(() => {
            Domus.Documents.loadLatestList('unit', 1, { containerId: 'domus-unit-detail-documents-1' });
            Domus.Api.getUnitStatistics = async () => ({
                revenue: { columns: [], rows: [{ year: 2025, baseRent: 1800, netRentability: 3 }] },
                cost: { columns: [], rows: [] }
            });
            Domus.Units.refreshDetail(1);
        });
        await page.waitForFunction(() => slotRequests.length === 5);
        await page.evaluate(() => {
            slotRequests[3].resolve([{ id: 102, fileName: 'Committed document' }]);
            slotRequests[4].resolve([]);
        });
        await page.getByText('Committed document', { exact: true }).waitFor();
        await page.evaluate(() => slotRequests[2].resolve([{ id: 103, fileName: 'Old content document' }]));
        await page.waitForTimeout(30);
        assert.equal(await page.getByText('Committed document', { exact: true }).count(), 1);
        assert.equal(await page.getByText('Old content document', { exact: true }).count(), 0);
        assert.deepEqual(await page.evaluate(() => unitCharts.map(chart => chart.destroyCalls)), [1, 1]);
        await page.evaluate(() => {
            window.replacementCharts = charts.slice(-2);
            Domus.Router.navigate('other');
        });
        assert.deepEqual(await page.evaluate(() => replacementCharts.map(chart => chart.destroyCalls)), [1, 1]);
        console.log('PASS successful refresh invalidates old content requests and disposes old charts');
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
