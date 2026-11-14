/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {setup} = require('./ui-reuse');

async function main() {
    const browser = await chromium.launch({headless: true});
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
        await setup(page);
        for (const role of ['member', 'admin', 'member']) {
            await page.evaluate(role => {
                Domus.state.managementContext = {activeTeamId: 'team-a', canManage: true, teamRole: role,
                    permissions: {editContacts: true, editBookings: true, addDocuments: true, manageTasks: true,
                        managePortfolio: role === 'admin', manageTenancies: role === 'admin', deleteRecords: role === 'admin',
                        manageSettings: role === 'admin', manageRenterAccess: role === 'admin', closeYears: role === 'admin'}};
                Domus.Router.navigate('unitDetail', [1]);
            }, role);
            await page.getByRole('navigation', {name: 'Unit sections'}).waitFor();
            assert.equal(await page.locator('#domus-unit-delete').isDisabled(), role !== 'admin');
            assert.equal(await page.locator('#domus-unit-image-edit').isDisabled(), role !== 'admin');
            assert.equal(await page.evaluate(() => Domus.Role.hasCapability('manageBookings')), true);
            assert.equal(await page.evaluate(() => Domus.Role.hasCapability('manageTenancies')), role === 'admin');
            await page.evaluate(() => Domus.Router.navigate('unitDetail', [1, 'tenancies']));
            await page.getByRole('navigation', {name: 'Unit sections'}).waitFor();
            assert.equal(await page.locator('#domus-add-tenancy-inline').count(), role === 'admin' ? 1 : 0);
            console.log('PASS ' + role + ' controls after role refresh');
        }
        await page.evaluate(() => {
            Domus.Units.openCreateModal();
            Domus.Properties.openCreateModal();
            Domus.Tenancies.openCreateModal();
        });
        assert.equal(await page.getByRole('dialog').count(), 0);
        console.log('PASS member cannot enter structural forms through direct calls');
        await page.evaluate(() => Domus.Partners.openCreateModal());
        const contact = page.getByRole('dialog');
        await contact.waitFor();
        assert.equal(await contact.getByRole('button', {name: 'Save', exact: true}).isEnabled(), true);
        await contact.getByRole('button', {name: 'Cancel', exact: true}).click();
        console.log('PASS member can still create contacts');
        await page.evaluate(() => {
            Domus.state.managementContext = {activeTeamId: 'team-a'};
        });
        assert.equal(await page.evaluate(() => Domus.Access.can('deleteRecords')), false);
        assert.equal(await page.evaluate(() => Domus.Access.can('editBookings')), false);
        console.log('PASS missing Team permissions fail closed');
        await page.evaluate(() => { Domus.state.managementContext = {activeTeamId: null, canManage: true}; });
        assert.equal(await page.evaluate(() => Domus.Access.can('managePortfolio')), true);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
