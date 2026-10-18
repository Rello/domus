/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

async function setup(page) {
    if (page.url() === 'about:blank') {
        await page.route('http://domus.test/**', route => route.fulfill({contentType: 'text/html', body: '<!doctype html>'}));
        await page.goto('http://domus.test/apps/domus/');
    }
    await page.setContent('<div id="app-content" class="app-domus"><div id="domus-content"></div></div>');
    await page.addStyleTag({path: 'css/style.css'});
    await page.evaluate(() => {
        window.t = (app, value, params = {}) => value.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? key);
        window.OC = {generateUrl: path => path, requestToken: 'fixture'};
    });
    for (const module of ['CoreBundle', 'Tasks', 'Settings']) await page.addScriptTag({path: `js/domus${module}.js`});
    await page.evaluate(() => {
        Domus.state.currentRoleView = 'landlord';
        Domus.state.currentView = 'dashboard';
        window.calls = [];
        window.task = {id: 99, taskId: 99, type: 'task', title: 'Review rent', description: 'The rent has not been increased for at least 36 months.', status: 'open', entityId: 7, entityType: 'unit', ruleId: 1, ruleTenancyId: null};
        window.showTask = () => {
            Domus.UI.renderContent(Domus.Tasks.buildOpenTasksTable([task], {showUnit: false}));
            Domus.Tasks.bindOpenTaskActions({});
        };
        Domus.Api.post = async (path, payload) => { calls.push({path, payload}); return {}; };
        Domus.Router.navigate = () => calls.push({path: 'refresh'});
    });
}

async function main() {
    const browser = await chromium.launch({headless: true});
    let failures = 0;
    async function test(name, action, width = 1280) {
        const page = await browser.newPage({viewport: {width, height: 900}});
        page.setDefaultTimeout(5000);
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        try { await setup(page); await action(page); assert.deepEqual(errors, []); console.log('PASS ' + name); }
        catch (error) { failures++; console.error('FAIL ' + name + '\n' + error.stack); }
        finally { await page.close(); }
    }
    await test('task reminders offer all intervals and submit the five-minute choice', async page => {
        await page.evaluate(() => showTask());
        await page.locator('.domus-task-detail-open').click();
        await page.getByRole('dialog').getByRole('button', {name: 'Remind me later', exact: true}).first().click();
        const modal = page.getByRole('dialog', {name: 'Remind me later', exact: true});
        assert.deepEqual(await modal.locator('select option').allTextContents(), ['5 minutes (test)', '1 month', '3 months', '6 months', 'Choose a date']);
        assert.equal(await modal.getByLabel('Reminder date', {exact: true}).isVisible(), false);
        await modal.getByRole('combobox').selectOption('5minutes');
        await modal.getByRole('button', {name: 'Save', exact: true}).click();
        assert.ok(await page.evaluate(() => calls.some(call => call.path === '/tasks/99/remind' && call.payload.choice === '5minutes')));
    }, 375);
    await test('custom reminder date and failure keep the dialog editable', async page => {
        await page.evaluate(() => { showTask(); Domus.Api.post = async () => { throw new Error('offline'); }; });
        await page.locator('.domus-task-detail-open').click();
        await page.getByRole('dialog').getByRole('button', {name: 'Remind me later', exact: true}).first().click();
        const modal = page.getByRole('dialog', {name: 'Remind me later', exact: true});
        await modal.getByRole('combobox').selectOption('date');
        await modal.getByLabel('Reminder date', {exact: true}).fill('2030-01-01');
        await modal.getByRole('button', {name: 'Save', exact: true}).click();
        await page.getByText('offline', {exact: true}).waitFor();
        assert.ok(await modal.getByRole('button', {name: 'Save', exact: true}).isEnabled());
        await page.evaluate(() => { Domus.Api.post = async (path, payload) => { calls.push({path, payload}); }; });
        await modal.getByRole('button', {name: 'Save', exact: true}).click();
        assert.ok(await page.evaluate(() => calls.some(call => call.payload?.date === '2030-01-01')));
    });
    await test('deferred rule tasks stay out of attention and remain accessible on the unit', async page => {
        await page.evaluate(async () => {
            task.deferredUntil = Math.floor(Date.now() / 1000) + 300;
            Domus.UI.renderContent(Domus.Tasks.buildUnitTasksPanel(7));
            Domus.Api.getWorkflowRunsByEntity = async () => [];
            Domus.Api.getTasksByEntity = async () => [task];
            Domus.Api.get = async () => ({label: 'Flat 7'});
            Domus.Tasks.loadUnitTasks(7);
        });
        await page.getByText('Deferred tasks', {exact: false}).waitFor();
        assert.equal(await page.locator('.domus-dashboard-task-group .domus-task-overview-card').count(), 0);
        await page.locator('.domus-task-deferred summary').click();
        assert.equal(await page.locator('.domus-task-deferred table').count(), 0);
        await page.locator('.domus-task-deferred .domus-task-overview-card').press('Enter');
        await page.getByText('The rent has not been increased for at least 36 months.', {exact: true}).waitFor();
        assert.ok(await page.getByRole('dialog').getByText(/Remind me on/).count());
    });
    await test('only missing-history tasks offer reference-date action', async page => {
        await page.evaluate(() => showTask());
        await page.locator('.domus-task-detail-open').click();
        assert.equal(await page.getByRole('dialog').getByRole('button', {name: 'Set reference date', exact: true}).count(), 0);
        await page.keyboard.press('Escape');
        await page.evaluate(() => { task.ruleTenancyId = 10; showTask(); });
        await page.locator('.domus-task-detail-open').click();
        await page.getByRole('dialog').getByRole('button', {name: 'Set reference date', exact: true}).first().click();
        await page.getByLabel('Last rent increase or tenancy start', {exact: true}).fill('2020-01-01');
        await page.getByRole('button', {name: 'Save', exact: true}).click();
        assert.ok(await page.evaluate(() => calls.some(call => call.path === '/rules/tenancies/10/reference')));
    });
    await test('ruleset editor previews without saving and persists scope and threshold', async page => {
        await page.evaluate(() => {
            window.rules = [];
            Domus.Api.getSettings = async () => ({settings: {}});
            Domus.Api.get = async path => path === '/rules/options' ? {units: [{id: 7, label: 'Flat 7'}, {id: 8, label: 'Flat 8'}], properties: [{id: 3, name: 'Building'}]} : rules;
            Domus.Api.getUnits = async () => [{id: 7, label: 'Flat 7'}, {id: 8, label: 'Flat 8'}];
            Domus.Api.getProperties = async () => [{id: 3, name: 'Building'}];
            Domus.TaskTemplates.renderSection = () => '';
            Domus.TaskTemplates.loadTemplates = () => {};
            Domus.Accounts = {renderSettingsSection: () => '', loadSettingsSection: () => {}};
            Domus.Api.post = async (path, payload) => {
                calls.push({path, payload});
                if (path === '/rules/preview') return [{unitLabel: 'Flat 7', status: 'due', baselineDate: '2013-01-01', dueDate: '2017-01-01', alertWarning: 'Warning should not appear in results'}];
                rules.push({id: 1, ...payload}); return rules[0];
            };
            Domus.Api.put = async (path, payload) => { calls.push({path, payload}); rules[0] = {id: 1, ...payload}; return rules[0]; };
            Domus.Settings.render();
        });
        await page.locator('#domus-rules-panel .domus-settings-section-header').click();
        await page.getByRole('button', {name: 'Add ruleset', exact: true}).click();
        await page.getByLabel('Name', {exact: true}).fill('Rental checks');
        await page.getByLabel('Threshold (months)', {exact: true}).fill('48');
        await page.getByLabel('Alert warning', {exact: true}).fill('Please review after {months} months.');
        await page.getByLabel('Applies to', {exact: true}).selectOption('units');
        await page.getByLabel('Flat 7', {exact: true}).check();
        assert.equal(await page.getByLabel('Create tasks automatically', {exact: true}).count(), 0);
        await page.getByRole('button', {name: 'Preview matches', exact: true}).click();
        await page.locator('#domus-rule-preview tbody tr').waitFor();
        assert.deepEqual(await page.locator('#domus-rule-preview th').allTextContents(), ['Unit', 'Status', 'Due date']);
        assert.equal(await page.locator('#domus-rule-preview').getByText(/Preview only|Warning should not appear/).count(), 0);
        assert.equal(await page.evaluate(() => rules.length), 0);
        const dueDateLabel = await page.evaluate(() => Domus.Utils.formatDate('2017-01-01'));
        assert.deepEqual(await page.locator('#domus-rule-preview td').allTextContents(), ['Flat 7', 'Rent review due', dueDateLabel]);
        assert.equal(await page.locator('#domus-rule-preview').evaluate(el => el.scrollWidth <= el.clientWidth), true);
        await page.locator('#domus-rule-form').getByRole('button', {name: 'Save', exact: true}).click();
        await page.locator('#domus-rule-list').getByText('Rental checks', {exact: true}).waitFor();
        const rule = await page.evaluate(() => rules[0]);
        assert.equal(rule.alertWarning, 'Please review after {months} months.'); assert.equal(rule.months, 48); assert.deepEqual(rule.scopeIds, [7]); assert.equal(rule.autoTask, true);
        await page.locator('#domus-rule-list').getByRole('button', {name: 'Edit', exact: true}).click();
        assert.equal(await page.getByLabel('Threshold (months)', {exact: true}).inputValue(), '48');
        assert.equal(await page.getByLabel('Alert warning', {exact: true}).inputValue(), 'Please review after {months} months.');
        await page.getByLabel('Enable ruleset', {exact: true}).uncheck();
        await page.locator('#domus-rule-form').getByRole('button', {name: 'Save', exact: true}).click();
        await page.locator('#domus-rule-list').getByText(/Disabled/).waitFor();
    }, 375);
    await browser.close();
    if (failures) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
