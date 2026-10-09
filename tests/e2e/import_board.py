"""Onboarding "Import a file" end to end (Oct 9): a bank CSV becomes the board (three categories, Fixed/Variable/Extra
sub-categories, monthly budgets) and its past months; a type deleted in setup is not imported; a bad file explains why.
Run: python3 tests/e2e/import_board.py   (needs the UI on :3300, `npx next start -p 3300`, like tests/visual)."""
import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'visual'))
import capture as C
from playwright.async_api import async_playwright

FAILS = []
SHOTS = os.environ.get('SHOTS')
async def shot(pg, n):
    if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, n + '.png'), full_page=True)
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else f'  -> {extra}'))
    if not cond: FAILS.append(name)

ROWS = []
for m in ('01', '02', '03'):
    ROWS += [f'28/{m}/2026;NOMINA ACME SL;2.500,00', f'01/{m}/2026;Alquiler piso;-900,00', f'05/{m}/2026;MERCADONA BCN;-85,40',
             f'09/{m}/2026;Netflix.com;-12,99', f'12/{m}/2026;Traspaso a cuenta ahorro;-300,00', f'18/{m}/2026;Tienda Rara;-{20 + int(m) * 7},00']
ROWS.append('20/03/2026;Vueling Airlines;-180,00')
CSV = ('Fecha;Concepto;Importe\n' + '\n'.join(ROWS)).encode()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/opt/pw-browsers/chromium'))
        errs = []
        srv = None
        try:
            for vp, size in (('desktop', {'width': 1320, 'height': 1000}), ('mobile', {'width': 390, 'height': 844})):
                if srv: srv.terminate(); await asyncio.sleep(1)
                srv = await C.start_server()  # a fresh mock store for each run: the admin starts with no board
                ctx = await b.new_context(viewport=size); await C.route_fonts(ctx); pg = await ctx.new_page()
                pg.on('pageerror', lambda e: errs.append(str(e)))
                await pg.goto(C.BASE + '/login'); await pg.fill('#login-email', 'admin@example.com')
                async with pg.expect_navigation(): await pg.click('#email-submit')
                if 'step=new' in pg.url:
                    await pg.fill('#full-name', 'Felipe')
                    async with pg.expect_navigation(): await pg.click('#signup-submit')
                await pg.fill('#code-0', '123456')
                async with pg.expect_navigation(): await pg.click('#code-submit')
                await pg.wait_for_url('**/welcome'); await pg.click('#ob-skip'); await pg.wait_for_selector('#ob-import')
                await shot(pg, f'{vp}-ob-choose')
                check(f'{vp}: Choose offers Import a file as a third way', await pg.locator('.ob-option').count() == 3)
                await pg.click('#ob-import'); await pg.wait_for_selector('#ob-dropzone')
                await shot(pg, f'{vp}-ob-import')
                await pg.set_input_files('#ob-import-file', files=[{'name': 'notes.csv', 'mimeType': 'text/csv', 'buffer': b'hello\nworld'}])
                await pg.wait_for_selector('#ob-import-error')
                check(f'{vp}: a file with no dates and amounts says why', 'No amounts with a date' in await pg.inner_text('#ob-import-error'))
                await pg.set_input_files('#ob-import-file', files=[{'name': 'cuenta.csv', 'mimeType': 'text/csv', 'buffer': CSV}])
                await pg.wait_for_selector('#ob-import-note')
                note = await pg.inner_text('#ob-import-note')
                check(f'{vp}: the board says what was found (file, Jan–Mar 2026, 19 entries)', 'cuenta.csv' in note and 'Jan 2026 – Mar 2026' in note and '19 entries' in note, note)
                fr = await pg.inner_text('.ob-from-row'); check(f'{vp}: tracking starts from the file\'s first month (Jan 2026)', '2026' in fr and 'Jan' in fr, fr)
                summ = await pg.inner_text('.ob-summary-list')
                check(f'{vp}: summary counts per category and sub-category', 'Income\n1 type' in summ and 'Savings and investments\n1 type' in summ and 'Fixed\n2 items' in summ and 'Variable\n2 items' in summ and 'Extra\n1 item' in summ, summ)
                check(f'{vp}: the board opens on Income with the salary', 'Salary' in await pg.inner_text('.ob-board-groups'))
                await pg.click('#ob-cat-expense'); await pg.wait_for_timeout(300)
                board = await pg.inner_text('.ob-board-groups')
                check(f'{vp}: Expenses opens on Fixed with Habitation / Rent at its monthly average', 'Habitation' in board and 'Rent' in board and '900,00' in board, board)
                await shot(pg, f'{vp}-ob-board')
                # delete "Other" (Variable / Other): its rows are not imported
                await pg.click('#ob-sub'); await pg.fill('#ob-sub', 'Variable'); await pg.wait_for_selector('.fld-combo-menu .ds-dd-item.is-active'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
                row = pg.locator('.ob-board .budget-group[data-category="Other"] .budget-row').first
                await row.locator('.br-more').click(); await pg.wait_for_timeout(200)
                await pg.locator('.br-remove').first.click(); await pg.wait_for_timeout(200)
                if await pg.locator('#confirm-delete').is_visible(): await pg.click('#confirm-delete'); await pg.wait_for_timeout(300)
                note = await pg.inner_text('#ob-import-note')
                check(f'{vp}: deleting a type leaves its rows out (16 entries)', '16 entries' in note, note)
                await pg.click('#ob-start')
                if vp == 'desktop': await pg.wait_for_selector('#ob-welcome[open]', timeout=15000)
                else: await pg.wait_for_selector('.ob-welcome-page', timeout=15000)
                ents = (await (await ctx.request.get(C.BASE + '/api/db/entries', headers=C.HDR)).json())['docs']
                years = (await (await ctx.request.get(C.BASE + '/api/db/years', headers=C.HDR)).json())['docs']
                buds = (await (await ctx.request.get(C.BASE + '/api/db/budgets', headers=C.HDR)).json())['docs']
                d = [e['data'] for e in ents]
                rent = [e for e in d if e['item'] == 'Rent']
                check(f'{vp}: 16 entries saved, Rent as Fixed / Habitation in Jan–Mar', len(d) == 16 and len(rent) == 3 and rent[0]['group'] == 'Fixed' and rent[0]['category'] == 'Habitation' and sorted(e['monthIndex'] for e in rent) == [0, 1, 2], (len(d), rent[:1]))
                tx = years[0]['data'].get('taxonomy', {}) if years else {}
                check(f'{vp}: one 2026 year with the board as its categories', [y['data']['year'] for y in years] == ['2026'] and 'Rent' in tx.get('expenses', {}).get('Fixed', {}).get('Habitation', []), [y['data'] for y in years])
                check(f'{vp}: monthly budgets saved (Rent 900)', any(x['data']['item'] == 'Rent' and x['data']['amount'] == 900 for x in buds))
                await pg.goto(C.BASE + '/'); await pg.wait_for_selector('.breakdown-card'); await pg.wait_for_timeout(800)
                await pg.evaluate("document.querySelectorAll('.month-btn')[1].click()"); await pg.wait_for_timeout(500)
                check(f'{vp}: the dashboard shows February from the file', '2.500' in await pg.inner_text('#mini-kpis'))
                await shot(pg, f'{vp}-dash-feb')
                await ctx.close()
            check('no page errors', not errs, errs)
        finally:
            if srv: srv.terminate()
        await b.close()
    print('\nALL PASSED' if not FAILS else f'\nFAILED: {len(FAILS)}')
    sys.exit(1 if FAILS else 0)
asyncio.run(main())
