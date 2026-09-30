/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const unit = {
    id: 1,
    label: 'Test unit',
    propertyId: 2,
    street: 'Market Street 12',
    city: 'Sampletown',
    livingArea: 72,
    activeTenancies: [{
        id: 3,
        startDate: '2025-01-01',
        baseRent: 950,
        partners: [{name: 'Test renter', email: 'renter@example.test', phone: '12345'}]
    }],
    historicTenancies: [{id: 4, partnerName: 'Former renter', startDate: '2023-01-01'}]
};
const statistics = {
    revenue: {
        columns: [
            {key: 'year', label: 'Year', format: 'year'},
            {key: 'rent', label: 'Base rent', format: 'currency'}
        ],
        rows: [
            {year: 2026, rent: 11400, netRentab: 5.6, isProvisional: true},
            {year: 2025, rent: 11400, netRentab: 5.6}
        ]
    },
    cost: {
        columns: [
            {key: 'year', label: 'Year', format: 'year'},
            {key: 'cost', label: 'Costs', format: 'currency'}
        ],
        rows: [{year: 2026, cost: 1200}]
    }
};

async function setup(page, role = 'landlord') {
    await page.setContent('<div id="app-navigation"></div><div id="app-content" class="app-domus"><div class="domus-top-navigation"><div class="domus-top-navigation-inner"><div id="domus-top-nav-primary" class="domus-top-nav-primary"></div></div></div><div id="domus-content" class="domus-content"></div></div>');
    await page.addStyleTag({path: 'css/style.css'});
    await page.evaluate(() => {
        window.t = (app, value, params = {}) => value.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? key);
        window.OC = {generateUrl: path => path, requestToken: 'fixture'};
    });
    for (const module of [
        'CoreBundle', 'Wizard', 'ActionLog', 'Accounts', 'Distributions', 'Tasks',
        'Dashboard', 'Analytics', 'Properties', 'Units', 'Partners', 'Tenancies',
        'Bookings', 'Settings', 'Documents'
    ]) {
        await page.addScriptTag({path: `js/domus${module}.js`});
    }
    await page.evaluate(({unitData, stats, currentRole}) => {
        Domus.Role.setRoleInfo({availableRoles: [currentRole], currentRole});
        Domus.Navigation.render();
        Domus.state.currentYear = 2026;
        Domus.Api.get = async path => path === '/units/1' ? unitData : null;
        Domus.Api.getUnitStatistics = async () => stats;
        Domus.Api.getSettings = async () => ({settings: {taxRate: '25'}});
        Domus.Api.getBookings = async () => [];
        Domus.Api.getUnitPartners = async () => [];
        Domus.Api.getProperties = async () => [{id: 2, name: 'Test property'}];
        Domus.Api.getProperty = async () => ({id: 2, name: 'Test property'});
        Domus.Api.getUnits = async () => [unitData];
        Domus.Api.getDocuments = async () => [{id: 6, fileName: 'Lease.pdf', createdAt: 1790000000}];
        Domus.Api.getActionLogs = async () => [{id: 5, title: 'Inspection note', type: 'note', createdAt: 1790000000}];
        Domus.Api.getTasksByEntity = async () => [];
        Domus.Api.getWorkflowRunsByEntity = async () => [];
        Domus.Distributions.loadForUnit = async () => [];
        Domus.Distributions.canManageDistributions = () => currentRole === 'buildingMgmt';
        Domus.Accounts.toOptions = () => [
            {value: '', label: 'Select account'},
            {value: '2000', label: 'Test account'}
        ];
        Domus.Router.register('unitDetail', Domus.Units.renderDetail);
        Domus.Router.register('tenancyDetail', id => {
            Domus.UI.renderContent(`<h2>Tenancy ${id}</h2>`);
        });
        Domus.Router.navigate('unitDetail', [1]);
    }, {unitData: unit, stats: statistics, currentRole: role});
    await page.getByRole('navigation', {name: 'Unit sections'}).waitFor();
}

async function main() {
    const browser = await chromium.launch({headless: true});
    let failures = 0;
    async function test(name, action, role = 'landlord', viewport = {width: 1280, height: 900}) {
        const page = await browser.newPage({viewport});
        page.setDefaultTimeout(5000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
            await setup(page, role);
            await action(page);
            assert.deepEqual(errors, [], 'No browser errors');
            console.log(`PASS ${name}`);
        } catch (error) {
            failures++;
            console.error(`FAIL ${name}\n${error.stack}`);
        } finally {
            await page.close();
        }
    }

    await test('tenancy identity and locale dates remain readable at narrow widths', async page => {
        await page.setViewportSize({width: 390, height: 844});
        await page.evaluate(() => {
            Domus.Api.get = async () => ({id: 1, unitId: 1, unitLabel: 'Apartment with a very long descriptive name', partnerName: 'Tenant with a long name', startDate: '2025-01-01', endDate: '2026-12-31', period: '2025-01-01 - 2026-12-31', status: 'active', partners: []});
            Domus.Tenancies.renderDetail(1);
        });
        await page.getByRole('heading', {name: 'Apartment with a very long descriptive name'}).waitFor();
        assert.match(await page.locator('.domus-hero-meta-stack').innerText(), /Tenant with a long name/);
        assert.equal(await page.locator('.domus-hero-kicker').textContent(), 'Tenancy #1');
        assert.ok(!(await page.locator('.domus-hero-meta-stack').innerText()).includes('2025-01-01'));
        const layout = await page.evaluate(() => ({width: innerWidth, scroll: document.documentElement.scrollWidth}));
        assert.ok(layout.scroll <= layout.width, JSON.stringify(layout));
    });

    await test('failed entity images have an accessible fallback', async page => {
        await page.evaluate(() => {
            const image = document.querySelector('.domus-entity-image img');
            image.dispatchEvent(new Event('error'));
        });
        assert.equal(await page.locator('.domus-entity-image-missing img').isVisible(), false);
        assert.ok(await page.locator('.domus-entity-image-missing').getAttribute('aria-label'));
    });

    await test('unit details opens viewing and editing while delete stays secondary', async page => {
        assert.equal(await page.locator('#domus-unit-edit, #domus-unit-details').count(), 0);
        assert.match(await page.locator('#domus-unit-masterdata').innerText(), /Unit details/);
        await page.locator('#domus-unit-masterdata').click();
        await page.getByRole('dialog', {name: 'Unit details', exact: true}).waitFor();
        await page.getByRole('dialog', {name: 'Unit details', exact: true}).getByRole('button', {name: 'Edit', exact: true}).click();
        await page.getByRole('dialog', {name: 'Edit unit', exact: true}).waitFor();
        await page.getByRole('dialog', {name: 'Edit unit', exact: true}).getByRole('button', {name: 'Cancel'}).click();
        assert.equal(await page.getByRole('button', {name: 'Delete', exact: true}).isVisible(), false);
        await page.getByRole('button', {name: 'More actions'}).click();
        assert.equal(await page.getByRole('button', {name: 'Delete', exact: true}).isVisible(), true);
        assert.equal(await page.locator('#domus-unit-masterdata').count(), 1);
    });

    await test('landlord section navigation, rent labels, tenancy link and booking context', async page => {
        const sections = page.getByRole('navigation', {name: 'Unit sections'});
        const layout = await page.evaluate(() => {
            const bounds = selector => document.querySelector(selector).getBoundingClientRect();
            const back = bounds('.domus-unit-workspace > .domus-back-button');
            const hero = bounds('.domus-unit-workspace .domus-detail-hero');
            const picture = bounds('.domus-unit-workspace .domus-hero-indicator');
            const metaLines = [...document.querySelectorAll('.domus-unit-workspace .domus-hero-meta-stack > .domus-hero-meta-line')]
                .map(node => node.getBoundingClientRect().top);
            const nav = bounds('.domus-unit-sections');
            const actions = bounds('.domus-unit-direct-actions');
            const cards = bounds('.domus-kpi-tiles-unit-detail');
            return {backBottom: back.bottom, heroTop: hero.top, heroBottom: hero.bottom, pictureWidth: picture.width,
                metaLines, navTop: nav.top, actionsTop: actions.top, cardsTop: cards.top};
        });
        assert.ok(layout.pictureWidth >= 128, `Unit picture is prominent: ${JSON.stringify(layout)}`);
        assert.equal(layout.metaLines.length, 2);
        assert.ok(Math.abs(layout.metaLines[0] - layout.metaLines[1]) <= 1, `Address, size and renter share a line: ${JSON.stringify(layout)}`);
        assert.ok(layout.heroTop - layout.backBottom < 18, `Unit identity follows the Back control: ${JSON.stringify(layout)}`);
        assert.ok(Math.abs(layout.navTop - layout.actionsTop) <= 8, `Sections and actions share a row: ${JSON.stringify(layout)}`);
        assert.ok(layout.cardsTop - layout.heroBottom < 100, `Unit information starts near the header: ${JSON.stringify(layout)}`);
        assert.equal(await page.locator('.domus-unit-direct-actions .domus-dashboard-quick-card-subtitle').count(), 0);
        assert.equal(await sections.getByRole('link', {name: 'Overview'}).getAttribute('aria-current'), 'page');
        await sections.getByRole('link', {name: 'Finances'}).press('Enter');
        await page.getByRole('heading', {name: 'Finances'}).waitFor();
        assert.equal(await page.locator('#domus-unit-kpi-detail .domus-kpi-detail-close').count(), 0);
        assert.equal(await sections.getByRole('link', {name: 'Finances'}).getAttribute('aria-current'), 'page');
        assert.match(await page.locator('.domus-unit-finance-summary').innerText(), /Agreed monthly base rent[\s\S]*950[\s\S]*Agreed annual base rent[\s\S]*11[.,]400[\s\S]*Applied tax rate[\s\S]*25 %/);
        assert.match(await page.locator('.domus-unit-finance-explanation').innerText(), /not recorded payments received[\s\S]*entered bookings[\s\S]*estimates/);
        const yearAction = page.locator('#domus-unit-kpi-detail [data-stat-year-open]').first();
        await yearAction.press('Enter');
        assert.equal(await yearAction.getAttribute('aria-expanded'), 'true');
        await sections.getByRole('link', {name: 'Documents'}).click();
        await page.getByRole('heading', {name: 'Documents'}).waitFor();
        await page.locator('#domus-unit-kpi-detail').getByText('Lease.pdf').waitFor();
        assert.equal(await sections.getByRole('link', {name: 'Documents'}).getAttribute('aria-current'), 'page');
        await sections.getByRole('link', {name: 'Activity'}).click();
        await page.getByRole('heading', {name: 'Activity'}).waitFor();
        await page.getByRole('button', {name: 'Add Action log entry'}).waitFor();
        await page.getByText('Inspection note').waitFor();
        await page.goBack();
        await page.getByRole('heading', {name: 'Documents'}).waitFor();
        await page.goBack();
        await page.getByRole('heading', {name: 'Finances'}).waitFor();
        await sections.getByRole('link', {name: 'Tenancies'}).click();
        await page.getByText('Former renter').waitFor();
        await sections.getByRole('link', {name: 'Overview'}).click();
        await page.getByRole('link', {name: 'Annual base rent'}).click();
        await page.getByRole('heading', {name: 'Finances'}).waitFor();
        await page.evaluate(() => Domus.Router.navigate('unitDetail', [1, 'cost']));
        await page.getByRole('heading', {name: 'Costs'}).waitFor();
        assert.equal(await sections.getByRole('link', {name: 'Finances'}).getAttribute('aria-current'), 'page');
        await page.evaluate(() => Domus.Router.navigate('unitDetail', [1, 'finances']));
        await page.getByRole('heading', {name: 'Finances'}).waitFor();
        await sections.getByRole('link', {name: 'Overview'}).click();
        await page.getByRole('button', {name: 'Show phone number'}).click();
        assert.equal(await sections.getByRole('link', {name: 'Overview'}).getAttribute('aria-current'), 'page');
        await page.locator('.domus-detail-hero [data-current-tenancy-id]').click();
        await page.getByRole('heading', {name: 'Tenancy 3'}).waitFor();
        await page.goBack();
        await page.getByRole('navigation', {name: 'Unit sections'}).waitFor();
        await page.locator('#domus-unit-direct-booking').press('Enter');
        await page.getByRole('dialog', {name: /^Add (booking|Booking or Document)$/}).waitFor();
        assert.equal(await page.locator('input[name="unitId"]').inputValue(), '1');
    });

    await test('unit tenancy names open details from the first cell', async page => {
        await page.getByRole('navigation', {name: 'Unit sections'}).getByRole('link', {name: 'Tenancies'}).click();
        const table = page.locator('#domus-unit-kpi-detail table.domus-table');
        const firstRow = table.locator('tbody tr').first();
        const name = firstRow.getByRole('link', {name: 'Test renter'});
        assert.equal(await name.getAttribute('href'), '#/tenancyDetail/3');
        assert.equal(await name.getAttribute('class').then(value => value.includes('domus-table-primary-action')), true);
        assert.equal(await name.evaluate(element => getComputedStyle(element).textDecorationLine), 'none');
        assert.equal(await name.evaluate(element => getComputedStyle(element.closest('tr')).cursor), 'pointer');
        assert.equal(await firstRow.getByRole('link', {name: 'Email'}).count(), 1);
        assert.equal(await firstRow.getByRole('button', {name: 'Show phone number'}).count(), 1);
        assert.equal(await table.getByRole('link', {name: 'Former renter'}).getAttribute('href'), '#/tenancyDetail/4');
        await name.press('Enter');
        await page.getByRole('heading', {name: 'Tenancy 3'}).waitFor();
    });

    await test('narrow unit workspace keeps section navigation usable', async page => {
        const sections = page.getByRole('navigation', {name: 'Unit sections'});
        const firstScreen = await page.evaluate(() => {
            const rect = selector => document.querySelector(selector).getBoundingClientRect();
            const settings = rect('.domus-nav-settings');
            const menu = rect('.domus-nav-top');
            const menuLinks = [...document.querySelectorAll('.domus-nav-top a')].map(link => link.getBoundingClientRect());
            const links = [...document.querySelectorAll('.domus-unit-section-link')].map(link => link.getBoundingClientRect());
            const title = document.querySelector('#domus-unit-direct-document .domus-dashboard-quick-card-title');
            const word = title.firstChild;
            const characterTops = [...word.textContent.matchAll(/Document/g)].map(match => [...'Document'].map((_, offset) => {
                const range = document.createRange();
                range.setStart(word, match.index + offset);
                range.setEnd(word, match.index + offset + 1);
                return range.getBoundingClientRect().top;
            }));
            return {
                settingsTop: settings.top,
                menuTop: menu.top,
                menuLinksVisible: menuLinks.every(link => link.left >= 0 && link.right <= settings.left),
                cardsTop: rect('.domus-kpi-tiles-unit-detail').top,
                tabsVisible: links.every(link => link.left >= 0 && link.right <= innerWidth && link.bottom <= innerHeight),
                documentWordIntact: characterTops.every(tops => tops.every(top => top === tops[0]))
            };
        });
        assert.ok(Math.abs(firstScreen.settingsTop - firstScreen.menuTop) < 2, JSON.stringify(firstScreen));
        assert.ok(firstScreen.menuLinksVisible, JSON.stringify(firstScreen));
        assert.ok(firstScreen.cardsTop < 844, JSON.stringify(firstScreen));
        assert.ok(firstScreen.tabsVisible, JSON.stringify(firstScreen));
        assert.ok(firstScreen.documentWordIntact, JSON.stringify(firstScreen));
        if (process.env.SCREENSHOT_DIR) {
            await page.screenshot({path: path.join(process.env.SCREENSHOT_DIR, 'unit-phone-overview.png')});
        }
        const pageOverflow = () => page.evaluate(() => ({
            amount: document.documentElement.scrollWidth - window.innerWidth,
            elements: [...document.querySelectorAll('#app-content *')]
                .filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
                .slice(0, 5)
                .map(element => `${element.tagName}.${element.className}: ${Math.round(element.getBoundingClientRect().right)}`)
        }));
        const overviewOverflow = await pageOverflow();
        assert.ok(overviewOverflow.amount <= 1, `Overview fits the viewport: ${JSON.stringify(overviewOverflow)}`);
        await sections.getByRole('link', {name: 'Finances'}).click();
        if (process.env.SCREENSHOT_DIR) {
            await page.screenshot({path: path.join(process.env.SCREENSHOT_DIR, 'unit-phone-finances.png')});
        }
        const financeOverflow = await pageOverflow();
        assert.ok(financeOverflow.amount <= 1, `Finances fits the viewport: ${JSON.stringify(financeOverflow)}`);
        await sections.getByRole('link', {name: 'Documents'}).press('Enter');
        await page.getByRole('heading', {name: 'Documents'}).waitFor();
        assert.equal(await sections.isVisible(), true);
        assert.equal(await sections.getByRole('link', {name: 'Documents'}).getAttribute('aria-current'), 'page');
        const overflow = await page.evaluate(() => ({
            amount: document.documentElement.scrollWidth - window.innerWidth,
            elements: [...document.querySelectorAll('#app-content *')]
                .filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
                .slice(0, 5)
                .map(element => `${element.tagName}.${element.className}: ${Math.round(element.getBoundingClientRect().right)}`)
        }));
        assert.ok(overflow.amount <= 1, `No horizontal page overflow: ${JSON.stringify(overflow)}`);
    }, 'landlord', {width: 390, height: 844});

    await test('enlarged text and longer unit labels remain readable on phones', async page => {
        const layout = await page.evaluate(() => {
            document.querySelector('#app-content').style.fontSize = '20px';
            document.querySelector('.domus-nav-settings a span:last-child').textContent = 'Einstellungen';
            document.querySelector('[data-unit-section="documents"]').textContent = 'Dokumente und Dateien';
            document.querySelector('[data-unit-section="activity"]').textContent = 'Aktivitäten';
            document.querySelector('#domus-unit-direct-document .domus-dashboard-quick-card-title').textContent = 'Dokument hinzufügen';
            const settings = document.querySelector('.domus-nav-settings').getBoundingClientRect();
            const menu = document.querySelector('.domus-nav-top').getBoundingClientRect();
            const tabs = [...document.querySelectorAll('.domus-unit-section-link')].map(link => link.getBoundingClientRect());
            return {overflow: document.documentElement.scrollWidth - innerWidth,
                settingsTop: settings.top, menuTop: menu.top,
                tabsVisible: tabs.every(tab => tab.left >= 0 && tab.right <= innerWidth)};
        });
        assert.ok(layout.overflow <= 1, JSON.stringify(layout));
        assert.ok(Math.abs(layout.settingsTop - layout.menuTop) < 2, JSON.stringify(layout));
        assert.ok(layout.tabsVisible, JSON.stringify(layout));
        if (process.env.SCREENSHOT_DIR) {
            await page.screenshot({path: path.join(process.env.SCREENSHOT_DIR, 'unit-phone-enlarged.png')});
        }
    }, 'landlord', {width: 390, height: 844});

    await test('tenant has read-only unit actions', async page => {
        assert.equal(await page.locator('#domus-unit-edit').count(), 0);
        assert.equal(await page.locator('#domus-unit-direct-booking').count(), 0);
        assert.equal(await page.locator('#domus-unit-direct-document').count(), 0);
        assert.equal(await page.locator('#domus-unit-direct-task').count(), 0);
        await page.getByRole('navigation', {name: 'Unit sections'}).getByRole('link', {name: 'Tenancies'}).click();
        await page.getByRole('heading', {name: 'My tenancies'}).waitFor();
    }, 'tenant');

    await test('document and task actions retain the current unit', async page => {
        await page.evaluate(() => {
            window.unitActionCalls = [];
            Domus.Documents.openLinkModal = (...args) => window.unitActionCalls.push(['document', args[0], args[1], args[4]?.propertyId]);
            Domus.Tasks.openCreateTaskModal = (...args) => window.unitActionCalls.push(['task', args[0], args[1]]);
        });
        await page.locator('#domus-unit-direct-document').click();
        await page.locator('#domus-unit-direct-task').click();
        assert.deepEqual(await page.evaluate(() => window.unitActionCalls), [
            ['document', 'unit', '1', 2],
            ['task', 'unit', '1']
        ]);
    });

    await test('unit tasks keep dashboard urgency and process identity', async page => {
        await page.evaluate(() => {
            const dueDate = offset => {
                const date = new Date();
                date.setDate(date.getDate() + offset);
                return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
            };
            Domus.Api.getWorkflowRunsByEntity = async () => [
                {id: 11, name: 'Year End 2025', year: 2025, steps: [{id: 21, title: 'Review records', status: 'open', dueDate: dueDate(-2)}]},
                {id: 12, name: 'Year End 2026', year: 2026, steps: [{id: 22, title: 'Review records', status: 'open', dueDate: dueDate(3)}]}
            ];
            Domus.Api.getTasksByEntity = async () => [
                {id: 31, title: 'Call caretaker', status: 'open', dueDate: dueDate(-1)}
            ];
            Domus.Tasks.loadUnitTasks(1);
        });
        await page.locator('#domus-unit-tasks-body .domus-dashboard-task-group-later').waitFor();
        assert.match(await page.locator('#domus-unit-tasks-panel').innerText(), /Needs attention/);
        assert.deepEqual(await page.locator('#domus-unit-tasks-body .domus-dashboard-task-group-title').allTextContents(), ['Overdue 2', 'Later 1']);
        const overdue = await page.locator('#domus-unit-tasks-body .domus-dashboard-task-group-overdue').innerText();
        assert.match(overdue, /Review records[\s\S]*Year End 2025[\s\S]*2 days overdue/);
        assert.match(overdue, /Call caretaker[\s\S]*1 day overdue/);
        assert.ok(!overdue.includes('Year End 2026'));
        const later = await page.locator('#domus-unit-tasks-body .domus-dashboard-task-group-later').innerText();
        assert.match(later, /Review records[\s\S]*Year End 2026[\s\S]*In 3 days/);
    });

    await test('building management retains finance and tenancy sections', async page => {
        const sections = page.getByRole('navigation', {name: 'Unit sections'});
        await sections.getByRole('link', {name: 'Finances'}).click();
        await page.getByRole('heading', {name: 'Finances'}).waitFor();
        await sections.getByRole('link', {name: 'Owners'}).click();
        await page.getByRole('heading', {name: 'Owners'}).waitFor();
    }, 'buildingMgmt');

    await test('unit section switch restores its financial year without moving focus or scroll', async page => {
        await page.evaluate(unitData => {
            Domus.Api.getBookings = async ({unitId, year}) => String(unitId) === '1' && String(year) === '2025'
                ? [{id: 101, unitId: 1, account: '2000', amount: 10, date: '2025-01-01', description: 'Year fixture'}] : [];
            Domus.Api.get = async path => ({...unitData, id: path === '/units/2' ? 2 : 1});
            const root = document.getElementById('app-content');
            root.style.height = '400px';
            root.style.overflow = 'auto';
        }, unit);
        const sections = page.getByRole('navigation', {name: 'Unit sections'});
        await sections.getByRole('link', {name: 'Finances'}).click();
        await page.locator('#domus-unit-kpi-detail tr[data-stat-year="2025"] [data-stat-year-open]').click();
        await page.getByRole('button', {name: 'Edit Booking #101', exact: true}).waitFor();
        await sections.getByRole('link', {name: 'Documents'}).click();
        const scrollBeforeReturn = await page.evaluate(() => {
            const root = document.getElementById('app-content');
            const finances = document.querySelector('[data-unit-section="finances"]');
            finances.focus({preventScroll: true});
            root.scrollTop = 80;
            const scroll = root.scrollTop;
            finances.click();
            return scroll;
        });
        await page.getByRole('button', {name: 'Edit Booking #101', exact: true}).waitFor();
        assert.equal(await page.locator('.domus-stat-year-selected').getAttribute('data-stat-year'), '2025');
        assert.equal(await page.locator('#domus-unit-kpi-detail tr[data-stat-year="2025"] [data-stat-year-open]').getAttribute('aria-expanded'), 'true');
        assert.equal(await page.evaluate(() => document.activeElement.dataset.unitSection), 'finances');
        assert.equal(await page.evaluate(() => document.getElementById('app-content').scrollTop), scrollBeforeReturn);

        await page.evaluate(() => Domus.Router.navigate('unitDetail', [2, 'revenue']));
        await page.getByRole('navigation', {name: 'Unit sections'}).waitFor();
        assert.equal(await page.locator('.domus-stat-year-selected').count(), 0);
        await page.evaluate(() => Domus.Router.navigate('unitDetail', [1, 'revenue']));
        await page.waitForFunction(() => document.querySelector('.domus-stat-year-selected')?.dataset.statYear === '2025');
    });


    await test('unit financial year survives booking save, failed refresh and Back', async page => {
        await page.getByRole('navigation', {name: 'Unit sections'}).getByRole('link', {name: 'Finances'}).click();
        const year = page.locator('#domus-unit-kpi-detail tr[data-stat-year="2025"] [data-stat-year-open]');
        await year.press('Enter');
        await page.locator('#domus-unit-bookings-body .domus-empty-state').waitFor();
        await page.evaluate(() => {
            Domus.Api.createBooking = async () => ({id: 99});
            Domus.Router.register('other', () => Domus.UI.renderContent('<p>Other view</p>'));
        });
        await page.evaluate(() => {
            const root = document.getElementById('app-content');
            root.style.height = '400px'; root.style.overflow = 'auto';
        });
        await page.locator('#domus-unit-direct-booking').press('Enter');
        const scrollBeforeSave = await page.evaluate(() => document.getElementById('app-content').scrollTop);
        await page.getByRole('dialog', {name: 'Add booking', exact: true}).waitFor();
        assert.match((await page.locator('.domus-booking-assignment-context').allTextContents()).join(' '), /Test unit/);
        await page.locator('[data-role="account"]').first().selectOption('2000');
        await page.locator('[data-role="amount"]').first().fill('10');
        await page.getByRole('button', {name: 'Save', exact: true}).click();
        await page.getByRole('dialog', {name: 'Add booking', exact: true}).waitFor({state: 'detached'});
        await page.waitForFunction(() => !document.querySelector('.domus-unit-workspace')?.hasAttribute('aria-busy'));
        await page.waitForFunction(() => document.querySelector('.domus-stat-year-selected')?.dataset.statYear === '2025');
        assert.equal(await page.getByRole('navigation', {name: 'Unit sections'}).getByRole('link', {name: 'Finances'}).getAttribute('aria-current'), 'page');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'domus-unit-direct-booking');
        assert.equal(await page.evaluate(() => document.getElementById('app-content').scrollTop), scrollBeforeSave);
        await page.evaluate(() => {
            Domus.Api.getUnitStatistics = async () => {throw new Error('Statistics failed');};
            Domus.Units.refreshDetail(1);
        });
        await page.getByText('Statistics failed', {exact: true}).waitFor();
        assert.equal(await year.getAttribute('aria-expanded'), 'true');
        await page.evaluate(stats => {
            Domus.Api.getUnitStatistics = async () => stats;
            Domus.Router.navigate('other');
            Domus.Router.back();
        }, statistics);
        await page.waitForFunction(() => document.querySelector('.domus-stat-year-selected')?.dataset.statYear === '2025');
        assert.equal(await page.getByRole('navigation', {name: 'Unit sections'}).getByRole('link', {name: 'Finances'}).getAttribute('aria-current'), 'page');

        await page.evaluate(() => {
            const booking = {id: 101, unitId: 1, account: '2000', amount: 10, date: '2025-01-01', description: 'Year fixture'};
            Domus.Api.getBookings = async () => [booking];
            Domus.Api.get = async path => path === '/bookings/101' ? booking : {id: 1, label: 'Test unit', propertyId: 2};
            Domus.Api.updateBooking = async (id, payload) => Object.assign(booking, payload);
            Domus.Api.getDocuments = async () => [];
            Domus.Units.refreshDetail(1);
        });
        await page.getByRole('button', {name: 'Edit Booking #101', exact: true}).waitFor();
        await page.getByRole('button', {name: 'Edit Booking #101', exact: true}).press('Enter');
        await page.getByRole('dialog', {name: 'Edit booking', exact: true}).waitFor();
        await page.getByRole('textbox', {name: 'Description', exact: true}).fill('Edited year fixture');
        await page.getByRole('button', {name: 'Save', exact: true}).click();
        await page.getByRole('dialog', {name: 'Edit booking', exact: true}).waitFor({state: 'detached'});
        await page.waitForFunction(() => document.querySelector('.domus-stat-year-selected')?.dataset.statYear === '2025' && document.activeElement.getAttribute('aria-label') === 'Edit Booking #101');
    });

    await browser.close();
    if (failures) process.exitCode = 1;
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
