/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
async function setup(page) {
    await page.route('http://domus.test/**', route => route.fulfill({contentType:'text/html', body:'<!doctype html>'}));
    await page.goto('http://domus.test/apps/domus/');
    await page.setContent('<div id="app-content" class="app-domus"></div>');
    await page.addStyleTag({path:'css/style.css'});
    await page.evaluate(() => {
        window.t = (app, text) => text;
        window.n = (app, single, plural, count) => (count === 1 ? single : plural).replace('%n', count);
        window.OC = {generateUrl:path => path};
    });
    for (const name of ['CoreBundle', 'Tasks']) await page.addScriptTag({path:`js/domus${name}.js`});
    await page.evaluate(() => {
        window.scope = 'Personal'; window.overrides = {}; window.calls = [];
        window.system = {id:1,key:'year_end',name:'Year End',description:'Default',appliesTo:'unit',isActive:true,isSystem:true,isOverride:false,stepsCount:1,
            steps:[{id:10,title:'Original step',description:'Default instructions',sortOrder:1,defaultDueDaysOffset:2}]};
        const effective = () => overrides[scope] || system;
        Domus.Api.getTaskTemplates = async () => [structuredClone(effective())];
        Domus.Api.getTaskTemplate = async id => {
            if (Number(id) !== effective().id) throw new Error('Template not found');
            return structuredClone(effective());
        };
        Domus.Api.customizeTaskTemplate = async id => {
            calls.push(['customize',scope,id]);
            if (window.failCustomize) throw new Error('Customize failed');
            overrides[scope] = {...structuredClone(system),id:2,isSystem:false,isOverride:true};
            return structuredClone(overrides[scope]);
        };
        Domus.Api.updateTaskTemplate = async (id,data) => {
            calls.push(['update',scope,id,data]);
            if (!overrides[scope]) overrides[scope] = {...structuredClone(system),id:2,isSystem:false,isOverride:true};
            Object.assign(overrides[scope],data);
            return structuredClone(overrides[scope]);
        };
        Domus.Api.resetTaskTemplate = async id => {
            calls.push(['reset',scope,id]);
            if (window.failReset) throw new Error('Reset failed');
            delete overrides[scope]; return structuredClone(system);
        };
        Domus.UI.showNotification = message => { window.notice = message; };
        document.getElementById('app-content').innerHTML = Domus.TaskTemplates.renderSection();
        document.getElementById('domus-task-templates-panel').classList.remove('domus-collapsed');
        Domus.TaskTemplates.loadTemplates();
    });
    await page.getByRole('button',{name:'Customize',exact:true}).waitFor();
    assert.equal(await page.getByText('Customizations and disabling apply only to the selected Personal or Team portfolio.', {exact:true}).count(), 0);
}
(async () => {
    const browser = await chromium.launch({headless:true});
    let failures = 0;
    async function test(name, run, width=1280) {
        const page = await browser.newPage({viewport:{width,height:900}}); page.setDefaultTimeout(5000);
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        try { await setup(page); await run(page); assert.deepEqual(errors,[]); console.log('PASS '+name); }
        catch(e) { failures++;console.error('FAIL '+name+'\n'+e.stack); }
        finally { await page.close(); }
    }
    await test('customize opens an independent editor and saves the override', async page => {
        assert.equal(await page.getByRole('button',{name:'Delete',exact:true}).count(),0);
        await page.getByRole('button',{name:'Customize',exact:true}).click();
        await page.locator('#domus-task-template-form').waitFor();
        await page.locator('#domus-task-template-form [name=name]').fill('My year end');
        await page.getByRole('button',{name:'Save',exact:true}).click();
        await page.getByText('My year end',{exact:false}).first().waitFor();
        assert.equal(await page.evaluate(()=>system.name),'Year End');
        assert.equal(await page.evaluate(()=>overrides.Personal.name),'My year end');
        assert.equal(await page.getByRole('button',{name:'Reset to system default',exact:true}).count(),1);
    });
    await test('disable is scoped and reset confirmation preserves state on cancel', async page => {
        await page.getByRole('button',{name:'Disable',exact:true}).click();
        await page.getByRole('button',{name:'Enable',exact:true}).waitFor();
        await page.evaluate(()=>{scope='Team A';Domus.TaskTemplates.loadTemplates();});
        await page.getByRole('button',{name:'Customize',exact:true}).waitFor();
        await page.evaluate(()=>{scope='Personal';Domus.TaskTemplates.loadTemplates();});
        await page.getByRole('button',{name:'Reset to system default',exact:true}).click();
        await page.getByRole('button',{name:'Cancel',exact:true}).click();
        assert.equal(await page.evaluate(()=>overrides.Personal.isActive),false);
        await page.getByRole('button',{name:'Reset to system default',exact:true}).click();
        await page.getByRole('button',{name:'Reset to system default',exact:true}).last().click();
        await page.getByRole('button',{name:'Customize',exact:true}).waitFor();
        assert.equal(await page.evaluate(()=>Object.keys(overrides).length),0);
    },375);
    await test('failed customize leaves a retryable system row', async page => {
        await page.evaluate(()=>{failCustomize=true;});
        await page.getByRole('button',{name:'Customize',exact:true}).click();
        await page.waitForFunction(()=>window.notice==='Customize failed');
        assert.equal(await page.getByRole('button',{name:'Customize',exact:true}).isEnabled(),true);
        assert.equal(await page.locator('#domus-task-template-form').count(),0);
    });
    await test('failed reset preserves the override', async page => {
        await page.getByRole('button',{name:'Disable',exact:true}).click();
        await page.getByRole('button',{name:'Enable',exact:true}).waitFor();
        await page.evaluate(()=>{failReset=true;});
        await page.getByRole('button',{name:'Reset to system default',exact:true}).click();
        await page.getByRole('button',{name:'Reset to system default',exact:true}).last().click();
        await page.waitForFunction(()=>window.notice==='Reset failed');
        assert.equal(await page.evaluate(()=>overrides.Personal.isActive),false);
    });
    await browser.close();process.exitCode=failures?1:0;
})();
