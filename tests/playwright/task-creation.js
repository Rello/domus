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
        await page.setContent('<button id="launcher">New task</button><div id="app-content" class="app-domus"></div>');
        await page.addStyleTag({ path: 'css/style.css' });
        await page.evaluate(() => {
            window.t = (app, text, params = {}) => text.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? key);
            window.OC = { generateUrl: path => path };
        });
        for (const name of ['CoreBundle', 'Tasks']) {
            await page.addScriptTag({ path: `js/domus${name}.js` });
        }
        await page.evaluate(() => {
            window.starts = 0;
            Domus.Api.getTaskTemplates = async () => [{ id: 7, name: 'Year End', description: null, appliesTo: 'unit' }];
            Domus.Api.get = async () => ({ id: 8, label: 'Apartment 8' });
            Domus.Api.getTaskTemplate = () => new Promise(resolve => {
                window.resolveTemplate = () => resolve({ id: 7, name: 'Year End', description: null, steps: [
                    { title: 'Send report', sortOrder: 2, defaultDueDaysOffset: 21 },
                    { title: 'Collect invoices', sortOrder: 1, defaultDueDaysOffset: 0 }
                ] });
            });
            Domus.Api.startWorkflowRun = async () => { starts++; };
            document.querySelector('#launcher').onclick = () => Domus.Tasks.openCreateTaskModal('unit', 8, () => {});
        });
        await page.locator('#launcher').click();
        const dialog = page.getByRole('dialog', { name: 'New task' });
        await dialog.waitFor();
        assert.equal(await dialog.getByText('Apartment 8', { exact: true }).isVisible(), true);
        assert.match(await dialog.innerText(), /single task is one item.*process follows/s);
        assert.equal(await dialog.getByRole('button', { name: 'Create task' }).isEnabled(), true);
        await dialog.locator('#domus-task-template').selectOption('7');
        const process = page.getByRole('dialog', { name: 'New process' });
        assert.equal(await process.getByRole('button', { name: 'Start process' }).isEnabled(), false);
        assert.equal(await process.getByText('Loading process steps…').isVisible(), true);
        await page.evaluate(() => resolveTemplate());
        await process.getByText('Collect invoices', { exact: true }).waitFor();
        assert.equal(await process.getByRole('button', { name: 'Start process' }).isEnabled(), true);
        const preview = await process.locator('#domus-task-process-preview').innerText();
        assert.match(preview, /Year End has 2 steps, from Collect invoices to Send report/);
        assert.match(preview, /first step opens when you start the process/);
        assert.match(preview, /following step opens when the previous step is completed/);
        assert.match(preview, /Collect invoices\s+Due on opening day[\s\S]*Send report\s+Due 21 days after opening/);
        assert.equal(await process.getByText('Apartment 8', { exact: true }).isVisible(), true);
        assert.equal(await page.evaluate(() => starts), 0);
        await page.setViewportSize({ width: 390, height: 640 });
        assert.equal(await process.evaluate(el => el.scrollWidth <= el.clientWidth), true);
        await process.locator('#domus-task-template').selectOption('');
        await dialog.waitFor();
        assert.equal(await dialog.getByRole('textbox', { name: 'Title' }).inputValue(), '');
        assert.equal(await dialog.getByRole('textbox', { name: 'Description' }).isVisible(), true);
        assert.equal(await dialog.getByLabel('Due date').isVisible(), true);
        assert.equal(await dialog.locator('#domus-task-process-preview').isVisible(), false);
        assert.deepEqual(errors, []);
        console.log('PASS task and process creation explain target, steps, and scheduling before a process starts');
    } finally {
        await browser.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
