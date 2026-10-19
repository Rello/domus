/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function setup(page, role, summary) {
    if (page.url() === 'about:blank') {
        await page.route('http://domus.test/**', route => route.fulfill({contentType: 'text/html', body: '<!doctype html>'}));
        await page.goto('http://domus.test/apps/domus/');
    }
    await page.setContent('<div id="app-content" class="app-domus"></div>');
    // Nextcloud's native-button selectors are more specific than a single class.
    // Keep these host defaults present to catch divergence from the upload div.
    await page.addStyleTag({ content: `
        button:not(.button-vue,[class^=vs__]) {
            padding: 7px 14px; min-height: 44px; border: none;
            background-color: rgb(229, 239, 249); border-radius: 22px; font-weight: bold;
        }
        button:not(.button-vue,[class^=vs__]):not(.app-navigation-entry-button) {
            margin: 3px; margin-inline-start: 0;
        }
    ` });
    await page.addStyleTag({ path: 'css/style.css' });
    await page.evaluate(() => {
        window.t = (app, value, params = {}) => value.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? key);
        window.OC = { generateUrl: path => path };
    });
    for (const module of ['CoreBundle', 'ActionLog', 'Accounts', 'Distributions', 'Tasks', 'Dashboard', 'Properties', 'Units', 'Partners', 'Tenancies', 'Bookings', 'Documents']) {
        await page.addScriptTag({ path: `js/domus${module}.js` });
    }
    await page.evaluate(({ role, summary }) => {
        Domus.state.currentRoleView = role;
        Domus.state.currentView = 'dashboard';
        const originalPost = Domus.Api.post;
        Domus.Api.post = (path, payload) => path === '/rules/evaluate'
            ? Promise.resolve({alerts: [], createdTasks: 0}) : originalPost(path, payload);
        Domus.Api.getDashboardSummary = async () => summary;
        Domus.Api.getWorkflowRun = async () => ({ id: 3, name: 'Inspection process', status: 'open', entityType: 'unit', entityId: 1, steps: [{id: 2, title: 'Inspection', status: 'open'}] });
        window.actionCalls = [];
        Domus.Bookings.openCreateModal = () => actionCalls.push('booking');
        Domus.Tasks.openCreateTaskModalWithUnitSelect = () => actionCalls.push('task');
        Domus.ActionLog.openCreateModal = () => actionCalls.push('note');
        Domus.Units.openCreateModal = () => actionCalls.push('unit');
        Domus.Partners.openCreateModal = () => actionCalls.push('partner');
        HTMLInputElement.prototype.showPicker = function() { actionCalls.push('upload'); };
        Domus.Dashboard.render();
    }, { role, summary });
    await page.locator('.domus-dashboard, h2').first().waitFor();
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    let failures = 0;
    async function test(name, action, viewport = { width: 1280, height: 900 }) {
        const page = await browser.newPage({ viewport, timezoneId: 'Europe/Berlin', locale: 'de-DE' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
            await action(page);
            assert.deepEqual(errors, []);
            console.log(`PASS ${name}`);
        } catch (error) {
            failures++;
            console.error(`FAIL ${name}\n${error.stack}`);
        } finally {
            await page.close();
        }
    }

    const dates = await browser.newPage({ timezoneId: 'Europe/Berlin', locale: 'de-DE' }).then(async page => {
        const result = await page.evaluate(() => {
            const date = offset => {
                const value = new Date();
                value.setDate(value.getDate() + offset);
                return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
            };
            return { overdue: date(-2), today: date(0), later: date(3) };
        });
        await page.close();
        return result;
    });
    const tasks = [
        { type: 'task', taskId: 1, entityType: 'unit', entityId: 1, entityName: 'Flat 1', title: 'Late repair', dueDate: dates.overdue },
        { type: 'process', stepId: 2, runId: 3, entityType: 'unit', entityId: 1, entityName: 'Flat 1', title: 'Inspection', workflowName: 'Annual review 2026', dueDate: dates.today },
        { type: 'task', taskId: 4, entityType: 'unit', entityId: 1, entityName: 'Flat 1', title: 'Later work', dueDate: dates.later },
        { type: 'task', taskId: 5, entityType: 'unit', entityId: 1, entityName: 'Flat 1', title: 'Unscheduled', dueDate: '' }
    ];
    const summary = { propertyCount: 1, unitCount: 1, openTasks: tasks, occupancy: { occupied: 1, vacant: 0 } };

    await test('desktop resize keeps statistics at the bottom and scrolls tasks', async page => {
        await setup(page, 'landlord', { ...summary, openTasks: Array.from({ length: 40 }, (_, index) => ({
            ...tasks[0], taskId: index + 10, title: `Task ${index}`
        })) });
        // Model the bounded Nextcloud content area and the app's navigation wrapper.
        await page.addStyleTag({ content: 'html, body { height: 100%; margin: 0; }' });
        await page.evaluate(() => {
            const app = document.getElementById('app-content');
            const dashboard = app.firstElementChild;
            app.innerHTML = '<div class="domus-top-navigation" style="height: 60px"></div><div id="domus-content" class="domus-content"></div>';
            document.getElementById('domus-content').append(dashboard);
        });
        const heights = [];
        for (const height of [900, 650, 1100]) {
            await page.setViewportSize({ width: 1280, height });
            const layout = await page.evaluate(() => {
                const tasks = document.querySelector('.domus-upcoming-card-shell .domus-panel-body');
                const tiles = document.querySelector('.domus-dashboard-kpi-row').getBoundingClientRect();
                tasks.scrollTop = tasks.scrollHeight;
                return { bottom: tiles.bottom, height: tasks.clientHeight, scrolled: tasks.scrollTop,
                    taskBottom: tasks.getBoundingClientRect().bottom, tileTop: tiles.top };
            });
            assert.ok(Math.abs(layout.bottom - (height - 16)) < 2, 'Tiles stay at the bottom');
            assert.ok(layout.scrolled > 0, 'All tasks remain reachable by scrolling');
            assert.ok(layout.taskBottom <= layout.tileTop, 'Tasks do not overlap statistics');
            heights.push(layout.height);
        }
        assert.ok(heights[1] < heights[0] && heights[2] > heights[0], 'Task area follows viewport height');
    });

    await test('landlord groups due tasks and opens actions with keyboard', async page => {
        await setup(page, 'landlord', summary);
        if (process.env.DASHBOARD_SCREENSHOT_DIR) {
            await page.screenshot({ path: `${process.env.DASHBOARD_SCREENSHOT_DIR}/dashboard-desktop.png`, fullPage: true });
        }
        const panelPositions = await page.evaluate(() => {
            const attention = document.querySelector('.domus-upcoming-card-shell').getBoundingClientRect();
            const actions = document.querySelector('.domus-dashboard-quick-panel').getBoundingClientRect();
            return {attentionX: attention.x, actionsX: actions.x, attentionY: attention.y, actionsY: actions.y};
        });
        assert.ok(panelPositions.attentionX < panelPositions.actionsX, 'Attention remains in the left column');
        assert.ok(Math.abs(panelPositions.attentionY - panelPositions.actionsY) < 2, 'Quick actions remain alongside attention');
        assert.deepEqual(await page.locator('.domus-dashboard-task-group-title').allTextContents(), ['Overdue 1', 'Today 1', 'Later 2']);
        assert.match(await page.locator('section.domus-dashboard-task-group-overdue').innerText(), /2 days overdue/);
        assert.equal(await page.locator('section.domus-dashboard-task-group-overdue .domus-task-date-exact').count(), 0);
        assert.match(await page.locator('.domus-dashboard-task-group-today').innerText(), /Due today/);
        assert.match(await page.locator('.domus-dashboard-task-group-today').innerText(), /Inspection[\s\S]*Flat 1[\s\S]*Annual review 2026/);
        assert.match(await page.locator('.domus-dashboard-task-group-later').innerText(), /No due date/);
        const actionBounds = await page.locator('.domus-dashboard-quick-grid > .domus-dashboard-quick-card').evaluateAll(cards =>
            cards.map(card => {
                const { x, y, width, height } = card.getBoundingClientRect();
                const style = getComputedStyle(card);
                return { x, y, width, height, appearance: [
                    style.padding, style.margin, style.backgroundColor,
                    style.borderWidth, style.borderRadius, style.fontWeight
                ] };
            })
        );
        assert.equal(actionBounds.length, 4);
        assert.equal(actionBounds[2].x, actionBounds[0].x);
        assert.equal(actionBounds[3].x, actionBounds[1].x);
        assert.equal(actionBounds[2].y, actionBounds[3].y);
        actionBounds.forEach(card => {
            assert.equal(card.width, actionBounds[0].width);
            assert.equal(card.height, actionBounds[0].height);
            assert.ok(card.height >= 88);
            assert.deepEqual(card.appearance, actionBounds[0].appearance);
        });
        assert.equal(await page.locator('#domus-dashboard-unit-create, #domus-dashboard-partner-create').count(), 0);
        assert.match(await page.locator('#domus-dashboard-booking-create').innerText(), /Record an expense/);
        assert.match(await page.locator('.domus-dashboard-kpi-row').innerText(), /Agreed in active tenancies/);
        await page.locator('#domus-dashboard-booking-create').focus();
        await page.keyboard.press('Enter');
        await page.locator('#domus-dashboard-task-create').focus();
        await page.keyboard.press('Space');
        await page.locator('#domus-dashboard-action-log-create').click();
        await page.locator('#domus-dashboard-quick-upload').click();
        assert.deepEqual(await page.evaluate(() => actionCalls), ['booking', 'task', 'note', 'upload']);
        await page.locator('.domus-dashboard-task-group-overdue .domus-task-overview-card').focus();
        await page.keyboard.press('Enter');
        await page.getByRole('dialog', { name: 'Task Details' }).waitFor();
        assert.ok(await page.getByRole('dialog', { name: 'Task Details' }).getByText('Mark done').count());
        await page.keyboard.press('Escape');
        await page.locator('.domus-dashboard-task-group-today .domus-task-overview-card').focus();
        await page.keyboard.press('Space');
        await page.getByRole('dialog', { name: 'Inspection process' }).waitFor();
        assert.ok(await page.getByRole('dialog', { name: 'Inspection process' }).getByText('Mark done').count());
    });

    await test('task-based rules preserve the dashboard grid without separate alerts', async page => {
        await setup(page, 'landlord', summary);
        assert.equal(await page.locator('#domus-rule-alerts').count(), 0);
        const layout = await page.evaluate(() => {
            const row = document.querySelector('.domus-dashboard-panel-row');
            const kpis = document.querySelector('.domus-dashboard-kpi-row');
            const attention = document.querySelector('.domus-upcoming-card-shell').getBoundingClientRect();
            const actions = document.querySelector('.domus-dashboard-quick-panel').getBoundingClientRect();
            return {children: row.children.length, gap: kpis.getBoundingClientRect().top - row.getBoundingClientRect().bottom,
                expectedGap: parseFloat(getComputedStyle(row.parentElement).rowGap),
                sameRow: Math.abs(attention.y - actions.y) < 2 && attention.x < actions.x};
        });
        assert.equal(layout.children, 2);
        assert.ok(layout.sameRow);
        assert.ok(Math.abs(layout.gap - layout.expectedGap) < 2);
    });

    await test('phone keeps work and actions before compact statistics', async page => {
        await setup(page, 'landlord', summary);
        if (process.env.DASHBOARD_SCREENSHOT_DIR) {
            await page.screenshot({ path: `${process.env.DASHBOARD_SCREENSHOT_DIR}/dashboard-phone.png`, fullPage: true });
        }
        const positions = await page.evaluate(() => {
            const top = selector => document.querySelector(selector).getBoundingClientRect().top;
            return {
                attention: top('.domus-upcoming-card-shell'),
                actions: top('.domus-dashboard-quick-panel'),
                kpis: top('.domus-dashboard-kpi-row'),
                columns: getComputedStyle(document.querySelector('.domus-dashboard-quick-grid')).gridTemplateColumns.split(' ').length,
                horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
                overflowing: Array.from(document.querySelectorAll('.domus-dashboard *'))
                    .filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
                    .slice(0, 8).map(element => [element.className, Math.round(element.getBoundingClientRect().right)])
            };
        });
        assert.ok(positions.attention < positions.actions && positions.actions < positions.kpis);
        assert.equal(positions.columns, 1);
        assert.equal(positions.horizontalOverflow, false, JSON.stringify(positions.overflowing));
    }, { width: 375, height: 812 });

    await test('small phone has no dashboard overflow', async page => {
        await setup(page, 'landlord', summary);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    }, { width: 320, height: 640 });

    await test('building management includes property tasks without units', async page => {
        await setup(page, 'buildingMgmt', { propertyCount: 1, unitCount: 0, openTasks: [{ ...tasks[0], entityType: 'property' }] });
        assert.equal(await page.getByText('Needs attention').count(), 1);
        assert.equal(await page.locator('#domus-dashboard-booking-create').count(), 1);
        await page.locator('#domus-dashboard-task-create').click();
        assert.deepEqual(await page.evaluate(() => actionCalls), ['task']);
    });

    await test('first run guides setup', async page => {
        await setup(page, 'landlord', { propertyCount: 0, unitCount: 0, openTasks: [] });
        await page.locator('#domus-dashboard-unit-create').click();
        assert.deepEqual(await page.evaluate(() => actionCalls), ['unit']);
        assert.equal(await page.locator('#domus-dashboard-booking-create').count(), 0);
    });

    await test('no open tasks offers creation', async page => {
        await setup(page, 'landlord', { ...summary, openTasks: [] });
        assert.ok((await page.locator('#domus-dashboard-empty-task-create').innerText()).includes('Create the first one'));
        await page.locator('#domus-dashboard-empty-task-create').focus();
        await page.keyboard.press('Enter');
        assert.deepEqual(await page.evaluate(() => actionCalls), ['task']);
    });

    await test('tenant sees no management actions', async page => {
        await setup(page, 'tenant', { tenancies: [], reports: [] });
        assert.equal(await page.locator('.domus-dashboard-quick-panel').count(), 0);
    });

    await browser.close();
    if (failures) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
