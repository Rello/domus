/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function setup(page) {
    await page.setContent('<button id="launcher">Open process</button><div id="app-content" class="app-domus"></div>');
    await page.addStyleTag({ path: 'css/style.css' });
    await page.evaluate(() => {
        window.t = (app, text, params = {}) => text.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? key);
        window.OC = { generateUrl: path => path };
    });
    for (const name of ['CoreBundle', 'Tasks']) await page.addScriptTag({ path: `js/domus${name}.js` });
    await page.evaluate(() => {
        window.run = { id: 90, name: 'Fixture process', entityType: 'unit', entityId: 8, status: 'open', year: 2026,
            steps: [
                { id: 91, title: 'Collect document', description: 'Read the first explanation.', status: 'open', actionType: 'document' },
                { id: 92, title: 'Review document', description: 'Check the next explanation.', status: 'new', allowEarlyCompletion: true },
                { id: 93, title: 'Finish review', description: '<unsafe> plain text', status: 'new' }
            ] };
        window.writes = 0; window.refreshes = 0; window.deleted = false; window.failClose = false; window.failReload = false;
        Domus.Api.getWorkflowRun = async () => { if (failReload) throw new Error('Fixture reload failed'); return structuredClone(run); };
        Domus.Api.closeTaskStep = async id => {
            writes++;
            if (failClose) throw new Error('Fixture close failed');
            await new Promise(resolve => setTimeout(resolve, 60));
            const index = run.steps.findIndex(step => step.id === id);
            if (run.steps[index].status !== 'open') throw new Error('Only open steps');
            run.steps[index].status = 'closed';
            const next = run.steps.slice(index + 1).find(step => step.status === 'new');
            if (next) next.status = 'open'; else run.status = 'closed';
        };
        Domus.Api.reopenTaskStep = async id => {
            writes++;
            run.steps.filter(step => step.status === 'open').forEach(step => { step.status = 'new'; });
            run.steps.filter(step => step.status === 'skipped').forEach(step => { step.status = 'new'; });
            run.steps.find(step => step.id === id).status = 'open'; run.status = 'open'; run.completionType = null;
        };
        Domus.Api.closeWorkflowRunEarly = async id => {
            writes++;
            if (failClose) throw new Error('Fixture early close failed');
            const current = run.steps.find(step => step.id === id);
            if (current.status !== 'open' || !current.allowEarlyCompletion) throw new Error('Not eligible');
            run.steps.filter(step => ['open','new'].includes(step.status)).forEach(step => { step.status = 'skipped'; });
            run.status = 'closed'; run.completionType = 'early';
        };
        Domus.Api.deleteWorkflowRun = async () => { deleted = true; };
        Domus.Router.navigate = () => { refreshes++; };
        Domus.UI.showNotification = message => { window.notification = message; };
        Domus.Documents = { openLinkModal: (type, id, onSaved) => {
            window.workTarget = [type, id];
            const form = Domus.UI.openModal({title: 'Add document', content: '<button id="fixture-save">Save</button>'});
            form.modalEl.querySelector('button#fixture-save').onclick = () => { form.close(); onSaved(); };
        }};
        const item = { type: 'process', runId: 90, stepId: 91, title: 'Collect document', workflowName: 'Fixture process', entityType: 'unit', entityId: 8, entityName: 'Fixture unit', status: 'open', completion: { total: 3, completed: 0 } };
        document.querySelector('#app-content').innerHTML = Domus.Tasks.buildOpenTasksTable([item]);
        Domus.Tasks.bindOpenTaskActions();
        document.querySelector('#launcher').onclick = () => document.querySelector('tr[data-task-detail]').click();
    });
    await page.getByRole('button', {name:'Open process', exact:true}).click();
    await page.getByRole('dialog', {name:'Fixture process', exact:true}).waitFor();
}

async function main() {
    const browser = await chromium.launch({headless:true});
    let failures = 0;
    async function test(name, action, width = 1280) {
        const page = await browser.newPage({viewport:{width, height:900}});
        page.setDefaultTimeout(5000);
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        try { await setup(page); await action(page); assert.deepEqual(errors, []); console.log(`PASS ${name}`); }
        catch (error) { failures++; console.error(`FAIL ${name}\n${error.stack}`); }
        finally { await page.close(); }
    }
    await test('one surface, native keyboard descriptions and safe text', async page => {
        assert.equal(await page.locator('.domus-modal').count(), 1);
        assert.equal(await page.locator('.domus-process-step').count(), 3);
        assert.match(await page.locator('.domus-process-progress').innerText(), /Step 1 of 3[\s\S]*0 of 3 completed/);
        await page.locator('[data-process-step="92"] summary').press('Enter');
        assert.equal(await page.getByText('Check the next explanation.', {exact:true}).isVisible(), true);
        await page.locator('[data-process-step="93"] summary').press('Space');
        assert.equal(await page.getByText('<unsafe> plain text', {exact:true}).isVisible(), true);
        assert.equal(await page.locator('unsafe').count(), 0);
        assert.equal(await page.locator('.domus-modal').count(), 1);
        assert.equal(await page.getByRole('button', {name:'Cancel process', exact:true}).isVisible(), false);
        await page.getByRole('button', {name:'Close modal',exact:true}).click();
        await page.locator('.domus-task-process-trigger-circle').press('Enter');
        await page.getByRole('dialog', {name:'Fixture process',exact:true}).waitFor();
        assert.equal(await page.getByRole('dialog', {name:'Fixture process',exact:true}).getByText('Fixture unit', {exact:true}).isVisible(), true);
        assert.equal(await page.locator('.domus-modal').count(), 1);

    });
    await test('optional work is primary and does not complete a step', async page => {
        await page.getByRole('button', {name:'Add document', exact:true}).click();
        assert.equal(await page.locator('.domus-modal').count(), 2);
        await page.getByRole('button', {name:'Save', exact:true}).click();
        assert.deepEqual(await page.evaluate(() => workTarget), ['unit',8]);
        assert.equal(await page.evaluate(() => writes), 0);
        assert.match(await page.locator('.domus-process-progress').innerText(), /0 of 3 completed/);
        assert.equal(await page.getByRole('button', {name:'Add document', exact:true}).evaluate(el => document.activeElement === el), true);
    });
    await test('completion advances in place, all-complete and reopen follow backend', async page => {
        const original = await page.locator('.domus-modal').evaluate(el => { el.dataset.fixtureIdentity = 'same'; return el.dataset.fixtureIdentity; });
        for (let index = 1; index <= 3; index++) {
            await page.getByRole('dialog', {name:'Fixture process',exact:true}).getByRole('button', {name:'Mark done',exact:true}).click();
            await page.getByText(`${index} of 3 completed`, {exact:true}).waitFor();
            assert.equal(await page.locator('.domus-modal').getAttribute('data-fixture-identity'), original);
            if (index < 3) assert.match(await page.locator('.domus-process-progress').innerText(), new RegExp(`Step ${index + 1} of 3`));
            assert.equal(await page.evaluate(() => refreshes), 0);
            assert.equal(await page.evaluate(() => document.activeElement.closest('.domus-modal') !== null), true);
        }
        assert.equal(await page.getByRole('dialog', {name:'Fixture process',exact:true}).getByRole('button', {name:'Mark done', exact:true}).count(), 0);
        await page.locator('[data-process-step="91"] summary').click();
        await page.locator('[data-process-step="91"]').getByRole('button', {name:'Reopen',exact:true}).click();
        await page.getByText('2 of 3 completed', {exact:true}).waitFor();
        assert.match(await page.locator('.domus-process-progress').innerText(), /Step 1 of 3/);
        await page.getByRole('button', {name:'Close modal'}).click();
        assert.equal(await page.evaluate(() => refreshes), 1);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'launcher');
    });
    await test('failed completion keeps the current step and permits retry', async page => {
        await page.evaluate(() => { failClose = true; });
        await page.getByRole('dialog', {name:'Fixture process',exact:true}).getByRole('button', {name:'Mark done',exact:true}).click();
        await page.waitForFunction(() => window.notification === 'Fixture close failed');
        assert.match(await page.locator('.domus-process-progress').innerText(), /Step 1 of 3[\s\S]*0 of 3 completed/);
        assert.equal(await page.getByRole('dialog', {name:'Fixture process',exact:true}).getByRole('button', {name:'Mark done',exact:true}).isEnabled(), true);
        await page.evaluate(() => { failClose = false; });
        await page.getByRole('dialog', {name:'Fixture process',exact:true}).getByRole('button', {name:'Mark done',exact:true}).click();
        await page.getByText('1 of 3 completed', {exact:true}).waitFor();
    });
    await test('failed reload blocks stale step actions and offers recovery', async page => {
        await page.evaluate(() => { failReload = true; });
        await page.getByRole('dialog', {name:'Fixture process',exact:true}).getByRole('button', {name:'Mark done',exact:true}).click();
        await page.waitForFunction(() => window.notification === 'Fixture reload failed');
        assert.equal(await page.getByRole('dialog', {name:'Fixture process',exact:true}).getByRole('button', {name:'Mark done',exact:true}).isEnabled(), false);
        await page.evaluate(() => { failReload = false; });
        await page.locator('.domus-process-menu summary').click();
        await page.getByRole('button', {name:'Refresh process',exact:true}).click();
        await page.getByText('1 of 3 completed', {exact:true}).waitFor();
    });
    await test('early completion requires confirmation, preserves history and resumes', async page => {
        assert.equal(await page.getByRole('button', {name:'Close early',exact:true}).count(), 0);
        await page.getByRole('dialog', {name:'Fixture process',exact:true}).getByRole('button', {name:'Mark done',exact:true}).click();
        await page.getByText('1 of 3 completed',{exact:true}).waitFor();
        const early = page.getByRole('button', {name:'Close early',exact:true});
        await early.click();
        await page.getByRole('button', {name:'Cancel',exact:true}).click();
        assert.equal(await page.evaluate(() => writes), 1);
        assert.equal(await early.evaluate(el => el === document.activeElement), true);
        await page.evaluate(() => { failClose = true; });
        await early.click();
        await page.getByRole('dialog').last().getByRole('button', {name:'Close early',exact:true}).click();
        await page.waitForFunction(() => notification === 'Fixture early close failed');
        assert.equal(await early.isEnabled(), true);
        await page.evaluate(() => { failClose = false; });
        await early.click();
        await page.getByRole('dialog').last().getByRole('button', {name:'Close early',exact:true}).click();
        await page.getByText('Completed early',{exact:true}).waitFor();
        assert.match(await page.locator('.domus-process-progress').innerText(), /1 of 3 completed.*2 not needed/s);
        assert.deepEqual(await page.evaluate(() => run.steps.map(step => step.status)), ['closed','skipped','skipped']);
        assert.equal(await page.locator('progress').getAttribute('value'), '3');
        await page.locator('[data-process-step="92"] summary').click();
        await page.locator('[data-process-step="92"]').getByRole('button', {name:'Reopen',exact:true}).click();
        await page.getByText('1 of 3 completed',{exact:true}).waitFor();
        assert.deepEqual(await page.evaluate(() => run.steps.map(step => step.status)), ['closed','open','new']);
        assert.equal(await early.isVisible(), true);
    });
    await test('cancellation confirms and restores focus when declined', async page => {
        await page.locator('.domus-process-menu summary').click();
        await page.getByRole('button', {name:'Cancel process',exact:true}).click();
        assert.equal(await page.locator('.domus-modal').count(), 2);
        await page.getByRole('button', {name:'Cancel',exact:true}).click();
        assert.equal(await page.evaluate(() => deleted), false);
        assert.equal(await page.getByRole('button', {name:'Cancel process',exact:true}).evaluate(el => document.activeElement === el), true);
        await page.getByRole('button', {name:'Cancel process',exact:true}).click();
        await page.getByRole('dialog').last().getByRole('button', {name:'Cancel process',exact:true}).click();
        await page.locator('.domus-modal').waitFor({state:'detached'});
        assert.equal(await page.evaluate(() => deleted), true);
        assert.equal(await page.evaluate(() => refreshes), 1);
    });
    await test('standalone task completion and reopening keep their existing detail flow', async page => {
        await page.getByRole('button', {name:'Close modal',exact:true}).click();
        await page.evaluate(() => {
            window.taskStatus = 'open';
            Domus.Api.closeTask = async () => { taskStatus = 'closed'; };
            Domus.Api.reopenTask = async () => { taskStatus = 'open'; };
            window.renderStandalone = () => {
                document.querySelector('#app-content').innerHTML = Domus.Tasks.buildOpenTasksTable([{type:'task',taskId:7,title:'Standalone fixture',status:taskStatus}]);
                Domus.Tasks.bindOpenTaskActions();
                document.querySelector('tr[data-task-detail]').click();
            };
            renderStandalone();
        });
        const detail = page.getByRole('dialog', {name:'Task Details',exact:true});
        await detail.getByRole('button', {name:'Mark done',exact:true}).first().click();
        await detail.waitFor({state:'detached'});
        assert.equal(await page.evaluate(() => taskStatus), 'closed');
        await page.evaluate(() => renderStandalone());
        await detail.getByRole('button', {name:'Reopen',exact:true}).first().click();
        await detail.waitFor({state:'detached'});
        assert.equal(await page.evaluate(() => taskStatus), 'open');
    });
    await test('narrow panel fits and keeps work controls visible', async page => {
        assert.equal(await page.locator('.domus-modal').evaluate(el => el.scrollWidth <= el.clientWidth), true);
        assert.equal(await page.locator('.domus-modal-header h3').evaluate(el => {
            el.textContent = 'A long process title that must wrap within its header';
            const title = el.getBoundingClientRect(); const header = el.parentElement.getBoundingClientRect();
            return title.top >= header.top && title.bottom <= header.bottom;
        }), true);
        assert.equal(await page.locator('.domus-modal').getByRole('button', {name:'Mark done',exact:true}).isVisible(), true);
        await page.locator('[data-process-step="92"] summary').press('Enter');
        assert.equal(await page.getByText('Check the next explanation.', {exact:true}).isVisible(), true);
    }, 375);
    await browser.close();
    if (failures) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode=1; });
