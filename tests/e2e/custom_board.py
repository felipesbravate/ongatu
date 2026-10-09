"""Board editing end to end (Oct 4–5): the three fixed categories; Expenses and Savings sub-categories added, renamed
and deleted in setup; then the dashboard, and renaming / deleting a sub-category from a month on in the month budget.
Run: python3 tests/e2e/custom_board.py   (needs the UI on :3300, `npx next start -p 3300`, like tests/visual)."""
import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'visual'))
import capture as C
from playwright.async_api import async_playwright

FAILS = []
async def pick(pg, fid, name, create=False):
    if await pg.input_value(f'#{fid}') == name: return
    await pg.click(f'#{fid}'); await pg.fill(f'#{fid}', name)
    await pg.wait_for_selector('.fld-combo-menu .ds-dd-item.is-active'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(250)
SHOTS = os.environ.get('SHOTS')
async def shot(pg, n):
    if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, n + '.png'))
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else f'  -> {extra}'))
    if not cond: FAILS.append(name)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/opt/pw-browsers/chromium'))
        srv = await C.start_server()
        errs = []
        try:
            ctx = await b.new_context(viewport={'width': 1320, 'height': 1000}); await C.route_fonts(ctx); pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(C.BASE + '/login'); await pg.fill('#login-email', 'admin@example.com')
            async with pg.expect_navigation(): await pg.click('#email-submit')
            if 'step=new' in pg.url:
                await pg.fill('#full-name', 'Felipe')
                async with pg.expect_navigation(): await pg.click('#signup-submit')
            await pg.fill('#code-0', '123456')
            async with pg.expect_navigation(): await pg.click('#code-submit')
            await pg.wait_for_url('**/welcome'); await pg.click('#ob-skip'); await pg.click('#ob-template'); await pg.wait_for_selector('.ob-setup')

            # Oct 5–6 (Felipe): the three categories are fixed; sub-categories and groups are free.
            check('the three categories, nothing to add', await pg.locator('.ds-cat-item .ds-cat-item-title').all_inner_texts() == ['Income', 'Savings and investments', 'Expenses'] and await pg.locator('#ob-add-cat').count() == 0)
            await pg.click('#ob-cat-expense'); await pg.wait_for_timeout(300)
            await pick(pg, 'ob-sub', 'Giving', create=True)
            await pick(pg, 'ob-group', 'Monthly', create=True)
            await pg.click('.ob-board .budget-group[data-category="Monthly"] .budget-group-add'); await pg.wait_for_selector('#type-modal[open]')
            check('Add type opens on the shown sub-category and group', await pg.input_value('#type-modal-group') == 'Monthly')
            await pg.fill('#type-modal-item-0', 'Donation'); await pg.click('#type-modal-save'); await pg.wait_for_timeout(300)
            await pg.click('#ob-rename-sub'); await pg.wait_for_selector('#ob-rename-modal[open]')
            await pg.fill('#ob-rename-modal-name', 'MSF'); await pg.click('#ob-rename-modal-save'); await pg.wait_for_timeout(250)
            await pick(pg, 'ob-sub', 'Extra'); await pg.click('#ob-delete-sub'); await pg.click('#confirm-delete'); await pg.wait_for_timeout(300)
            await pick(pg, 'ob-sub', 'MSF')
            await shot(pg, 'ob-board')
            check('setup: Expenses sub-category added (MSF after a rename) with its group and type; a default deleted (Extra)',
                  'Donation' in await pg.inner_text('.ob-board .budget-group[data-category="Monthly"]') and 'Extra' not in await pg.inner_text('.ob-summary-list'))
            await pg.click('#ob-cat-investment'); await pick(pg, 'ob-sub', 'Funds', create=True)
            await pg.wait_for_selector('#ob-rename-sub')
            for _ in range(20):
                if await pg.input_value('#ob-sub') == 'Funds': break
                await pg.wait_for_timeout(100)  # the new sub-category is shown before Add type (was flaky)
            await pg.click('#ob-add-type'); await pg.wait_for_selector('#type-modal[open]')
            await pg.fill('#type-modal-item-0', 'ETF'); await pg.click('#type-modal-save'); await pg.wait_for_timeout(300)
            summ = await pg.inner_text('.ob-summary-list')
            check('summary: Funds 1 item, MSF 1 item, no Extra', 'Funds\n1 item' in summ and 'MSF\n1 item' in summ and 'Extra' not in summ, summ)
            await pg.click('#ob-start'); await pg.wait_for_selector('#ob-welcome[open]', timeout=10000)

            await pg.goto(C.BASE + '/'); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(1000)
            check('dashboard: the three tabs', await pg.locator('#breakdown-top-seg button').all_inner_texts() == ['Incomes', 'Save/Invest', 'Expenses'])
            tabs = await pg.locator('#breakdown-group-seg button').all_inner_texts()
            check('Expenses sub-tabs follow the board (MSF, no Extra)', 'MSF' in tabs and 'Extra' not in tabs and 'Fixed' in tabs, tabs)
            await pg.click('#breakdown-group-seg button:has-text("MSF")'); await pg.wait_for_timeout(300)
            check('MSF tab: its group and type', 'Monthly' in await pg.inner_text('#itemslist') and 'Donation' in await pg.inner_text('#itemslist'))
            await pg.click('#tracker-add-btn'); await pg.wait_for_selector('#add-panel.open'); await pg.wait_for_timeout(300)
            check('Add entry opens on Expenses / MSF', await pg.inner_text('#entry-kind-trigger') == 'Expenses' and await pg.inner_text('#entry-sub-trigger') == 'MSF')
            await pg.fill('#entry-desc', 'MSF'); await pg.click('#entry-item-trigger'); await pg.click('.ds-dd-menu .ds-dd-item > span:text-is("Donation")')
            await pg.fill('#entry-amount', '25'); await pg.click('#entry-submit'); await pg.wait_for_timeout(1200)
            await pg.click('#add-panel .panel-close'); await pg.wait_for_timeout(500)
            bal = (await pg.inner_text('#balance-value')).replace('\n', ' ')
            check('the entry is money out: balance -25,00', bal.startswith('-') and '25,00' in bal, bal)
            await pg.click('#breakdown-top-seg button:has-text("Save/Invest")'); await pg.wait_for_timeout(300)
            check('Savings shows its sub-category as a block', 'Funds' in await pg.inner_text('#itemslist') and 'ETF' in await pg.inner_text('#itemslist'))

            await pg.click('#tracker-menu-btn'); await pg.click('#adjust-budget'); await pg.wait_for_selector('#month-budget-panel.open'); await pg.wait_for_timeout(400)
            check('month budget: no "Rename category", Expenses has "+ Add sub-category"', await pg.locator('#month-budget-rename-cat').count() == 0 and await pg.locator('#month-budget-add-sub').is_visible())
            await pg.click('#month-budget-sub-trigger'); await pg.click('.ds-dd-menu .ds-dd-item > span:text-is("MSF")'); await pg.wait_for_timeout(300)
            sec = await pg.locator('#month-budget-sections .budget-type-section:not([hidden])').inner_text()
            check('month budget: MSF and its type', 'Donation' in sec, sec)
            # Rename a sub-category from this month on: Rename modal -> confirmation -> toast; an earlier month keeps the name
            mi = await pg.evaluate("new Date().getMonth()"); yr = await pg.evaluate("String(new Date().getFullYear())")
            if mi > 0:
                await pg.evaluate("async ([yr, mi]) => { const db = await window.claude.use('db'); await db.collection('entries').add({ year: yr, monthIndex: mi - 1, type: 'expense', group: 'MSF', category: 'Monthly', item: 'Donation', description: 'Earlier', amount: 10, date: yr + '-' + String(mi).padStart(2, '0') + '-03', createdAt: new Date().toISOString() }); }", [yr, mi])
            await shot(pg, 'month-panel'); await pg.click('#month-budget-rename-sub'); await pg.wait_for_selector('#month-rename-modal[open]')
            await pg.fill('#month-rename-modal-name', 'Doctors'); await pg.click('#month-rename-modal-save'); await pg.wait_for_selector('#month-rename-confirm[open]')
            desc = await pg.inner_text('#month-rename-confirm .ds-modal-description')
            check('the rename confirmation says what spreads', 'every month after it' in desc and 'Earlier months keep "MSF"' in desc, desc)
            await pg.click('#month-rename-confirm-ok'); await pg.wait_for_timeout(1500)
            toast = await pg.inner_text('#ds-toast')
            check('the toast confirms the rename and the spread', '"MSF" is now "Doctors"' in toast and 'Earlier months keep "MSF"' in toast, toast)
            check('the panel shows the new name', await pg.inner_text('#month-budget-sub-trigger') == 'Doctors')
            # Delete: refused while the sub-category has entries from this month on, then a sub-category without any
            await pg.click('#month-budget-delete-sub'); await pg.wait_for_timeout(1000)
            toast = await pg.inner_text('#ds-toast')
            check('deleting a sub-category with entries is refused straight away (no confirmation), and says why', 'still has 1 entry' in toast and await pg.locator('#month-rename-confirm[open]').count() == 0 and await pg.inner_text('#month-budget-sub-trigger') == 'Doctors', toast)
            await pg.click('#month-budget-sub-trigger'); await pg.click('.ds-dd-menu .ds-dd-item > span:text-is("Variable")'); await pg.wait_for_timeout(300)
            await pg.click('#month-budget-delete-sub'); await pg.wait_for_selector('#month-rename-confirm[open]')
            await pg.wait_for_timeout(300); await shot(pg, 'month-delete-confirm')
            desc = await pg.inner_text('#month-rename-confirm .ds-modal-description')
            check('the delete confirmation says what spreads', 'every month after it' in desc and 'Earlier months keep it' in desc, desc)
            await pg.click('#month-rename-confirm-ok'); await pg.wait_for_timeout(1500)
            toast = await pg.inner_text('#ds-toast'); await shot(pg, 'month-delete-toast')
            check('the toast confirms the delete and the spread', '"Variable" was deleted from' in toast and 'Earlier months keep it' in toast, toast)
            check('Variable is gone from the panel', 'Variable' not in await pg.locator('#month-budget-sub-trigger').inner_text())
            await pg.click('#month-budget-close'); await pg.wait_for_timeout(500)
            await pg.click('#breakdown-top-seg button:has-text("Expenses")'); await pg.wait_for_timeout(300)
            tabs = await pg.locator('#breakdown-group-seg button').all_inner_texts()
            check('this month: "Doctors" (with the entry), no MSF, no Variable', 'Doctors' in tabs and 'MSF' not in tabs and 'Variable' not in tabs, tabs)
            if mi > 0:
                await pg.locator('.month-btn').nth(mi - 1).click(); await pg.wait_for_timeout(400)
                await pg.click('#breakdown-top-seg button:has-text("Expenses")'); await pg.wait_for_timeout(300)
                tabs = await pg.locator('#breakdown-group-seg button').all_inner_texts()
                check('an earlier month keeps "MSF" and "Variable", no "Doctors"', 'MSF' in tabs and 'Variable' in tabs and 'Doctors' not in tabs, tabs)
                await pg.click('#breakdown-group-seg button:has-text("MSF")'); await pg.wait_for_timeout(300)
                check('...with its entry', '10,00' in await pg.inner_text('#itemslist'))
            check('no page errors', not errs, errs)
        finally:
            srv.terminate()
        await b.close()
    print('ALL PASSED' if not FAILS else f'FAILED: {len(FAILS)}')
    sys.exit(1 if FAILS else 0)

asyncio.run(main())
