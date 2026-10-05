"""Custom board end to end (Oct 4): a custom category (money out) with a sub-category and a group, a Savings
sub-category, Start tracking, then the dashboard (tabs, allocation, an entry lowers the balance) and the month budget.
Run: python3 tests/e2e/custom_board.py   (needs the UI on :3300, `npx next start -p 3300`, like tests/visual)."""
import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'visual'))
import capture as C
from playwright.async_api import async_playwright

FAILS = []
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

            await pg.click('#ob-add-cat'); await pg.wait_for_selector('#category-modal[open]')
            await pg.fill('#category-modal-name', 'Philanthropy'); await pg.fill('#category-modal-sub-0', 'Doctors without borders')
            await pg.click('#category-modal-save'); await pg.wait_for_timeout(300)
            check('custom category created', await pg.locator('.ds-list-sel .ds-list-sel-title').all_inner_texts() == ['Income', 'Savings and investments', 'Expenses', 'Philanthropy'])
            await pg.click('#ob-add-type'); await pg.wait_for_selector('#type-modal[open]')
            check('type modal names the custom category and starts on its sub-category',
                  await pg.inner_text('#type-modal .ds-modal-title') == 'Add a Philanthropy type' and await pg.inner_text('#type-modal-sub-trigger') == 'Doctors without borders')
            await pg.fill('#type-modal-group', 'Monthly'); await pg.fill('#type-modal-item-0', 'Donation'); await pg.click('#type-modal-save'); await pg.wait_for_timeout(300)
            await pg.click('#ob-cat-investment'); await pg.click('#ob-add-sub'); await pg.wait_for_selector('#subcategory-modal[open]')
            await pg.fill('#subcategory-modal-sub-0', 'Funds'); await pg.click('#subcategory-modal-save'); await pg.wait_for_timeout(300)
            await pg.click('#ob-add-type'); await pg.wait_for_selector('#type-modal[open]')
            await pg.click('#type-modal-sub-trigger'); await pg.click('.ds-dd-menu .ds-dd-item:text-is("Funds")')
            await pg.fill('#type-modal-item-0', 'ETF'); await pg.click('#type-modal-save'); await pg.wait_for_timeout(300)
            # Oct 5: rename while setting up (a custom category, its sub-category, and a built-in category)
            await pg.click('#ob-cat-custom-philanthropy'); await pg.click('#ob-rename-cat'); await pg.wait_for_selector('#ob-rename-modal[open]')
            await pg.fill('#ob-rename-modal-name', 'Giving'); await pg.click('#ob-rename-modal-save'); await pg.wait_for_timeout(250)
            await pg.click('.ob-rename-sub'); await pg.wait_for_selector('#ob-rename-modal[open]')
            await pg.fill('#ob-rename-modal-name', 'MSF'); await pg.click('#ob-rename-modal-save'); await pg.wait_for_timeout(250)
            await shot(pg, 'ob-renamed')
            check('setup: category and sub-category renamed', await pg.inner_text('.ds-list-sel.is-selected .ds-list-sel-title') == 'Giving' and 'MSF' in await pg.inner_text('.ob-col-types'))
            await pg.click('#ob-cat-investment')
            summ = await pg.inner_text('.ob-summary-list')
            check('summary: Funds 1 item, Philanthropy / Doctors without borders 1 item', 'Funds\n1 item' in summ and 'MSF\n1 item' in summ and 'Giving' in summ, summ)
            await pg.click('#ob-start'); await pg.wait_for_selector('#ob-welcome[open]', timeout=10000)

            await pg.goto(C.BASE + '/'); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(1000)
            check('dashboard tabs follow the board', await pg.locator('#breakdown-top-seg button').all_inner_texts() == ['Incomes', 'Save/Invest', 'Expenses', 'Giving'])
            check('allocation includes the custom category', 'GIVING' in [t.upper() for t in await pg.locator('.alloc-name').all_inner_texts()])
            await pg.click('#breakdown-top-seg button:has-text("Giving")'); await pg.wait_for_timeout(300)
            check('custom tab: its group and type, "Add entry"', 'Monthly' in await pg.inner_text('#itemslist') and 'Donation' in await pg.inner_text('#itemslist') and await pg.inner_text('#tracker-add-btn') == 'Add entry')
            await pg.click('#tracker-add-btn'); await pg.wait_for_selector('#add-panel.open'); await pg.wait_for_timeout(300)
            check('Add entry opens on the custom category and sub-category',
                  await pg.inner_text('#entry-kind-trigger') == 'Giving' and await pg.inner_text('#entry-sub-trigger') == 'MSF')
            await pg.fill('#entry-desc', 'MSF'); await pg.click('#entry-item-trigger'); await pg.click('.ds-dd-menu .ds-dd-item:text-is("Donation")')
            await pg.fill('#entry-amount', '25'); await pg.click('#entry-submit'); await pg.wait_for_timeout(1200)
            await pg.click('#add-panel .panel-close'); await pg.wait_for_timeout(500)
            bal = (await pg.inner_text('#balance-value')).replace('\n', ' ')
            check('a custom-category entry is money out: balance -25,00, Expenses 25,00', bal.startswith('-') and '25,00' in bal and '25,00' in await pg.inner_text('#mini-kpis'), bal)
            await pg.click('#breakdown-top-seg button:has-text("Save/Invest")'); await pg.wait_for_timeout(300)
            check('Savings shows its sub-category as a block', 'Funds' in await pg.inner_text('#itemslist') and 'ETF' in await pg.inner_text('#itemslist'))
            await pg.click('#tracker-menu-btn'); await pg.click('#adjust-budget'); await pg.wait_for_selector('#month-budget-panel.open'); await pg.wait_for_timeout(400)
            await pg.click('#month-budget-kind-trigger'); await pg.click('.ds-dd-menu .ds-dd-item:text-is("Giving")'); await pg.wait_for_timeout(300)
            sec = await pg.locator('#month-budget-sections .budget-type-section:not([hidden])').inner_text()
            check('month budget: the custom category, its sub-category and its type', await pg.inner_text('#month-budget-sub-trigger') == 'MSF' and 'Donation' in sec, sec)
            # Oct 5: rename a sub-category from this month on: Rename modal -> confirmation -> toast; an earlier month keeps the name
            mi = await pg.evaluate("new Date().getMonth()"); yr = await pg.evaluate("String(new Date().getFullYear())")
            if mi > 0:
                await pg.evaluate("async ([yr, mi]) => { const db = await window.claude.use('db'); await db.collection('entries').add({ year: yr, monthIndex: mi - 1, type: 'custom-philanthropy', group: 'MSF', category: 'Monthly', item: 'Donation', description: 'Earlier', amount: 10, date: yr + '-' + String(mi).padStart(2, '0') + '-03', createdAt: new Date().toISOString() }); }", [yr, mi])
            await shot(pg, 'month-panel'); await pg.click('#month-budget-rename-sub'); await pg.wait_for_selector('#month-rename-modal[open]')
            await pg.fill('#month-rename-modal-name', 'Doctors'); await pg.click('#month-rename-modal-save'); await pg.wait_for_selector('#month-rename-confirm[open]')
            await pg.wait_for_timeout(300); await shot(pg, 'month-confirm')
            desc = await pg.inner_text('#month-rename-confirm .ds-modal-description')
            check('the confirmation says what spreads', 'every month after it' in desc and 'Earlier months keep "MSF"' in desc, desc)
            await pg.click('#month-rename-confirm-ok'); await pg.wait_for_timeout(1500)
            toast = await pg.inner_text('#ds-toast'); await shot(pg, 'month-toast')
            check('the toast confirms the change and the spread', '"MSF" is now "Doctors"' in toast and 'Earlier months keep "MSF"' in toast, toast)
            check('the panel shows the new name', await pg.inner_text('#month-budget-sub-trigger') == 'Doctors')
            await pg.click('#month-budget-close'); await pg.wait_for_timeout(500)
            await pg.click('#breakdown-top-seg button:has-text("Giving")'); await pg.wait_for_timeout(300)
            check('this month: the tab is "Doctors" and the entry moved with it', await pg.locator('#breakdown-group-seg button').all_inner_texts() == ['Doctors'] and 'Donation' in await pg.inner_text('#itemslist'))
            if mi > 0:
                await pg.locator('.month-btn').nth(mi - 1).click(); await pg.wait_for_timeout(400)
                await pg.click('#breakdown-top-seg button:has-text("Giving")'); await pg.wait_for_timeout(300)
                tabs = await pg.locator('#breakdown-group-seg button').all_inner_texts()
                await pg.click('#breakdown-group-seg button:has-text("MSF")') if 'MSF' in tabs else None; await pg.wait_for_timeout(300)
                check('an earlier month keeps "MSF" only (its entry still there)', tabs == ['MSF'] and '10,00' in await pg.inner_text('#itemslist'), tabs)
            check('no page errors', not errs, errs)
        finally:
            srv.terminate()
        await b.close()
    print('ALL PASSED' if not FAILS else f'FAILED: {len(FAILS)}')
    sys.exit(1 if FAILS else 0)

asyncio.run(main())
