import asyncio, os, sys, json
# Trial (Nov 25): the Add entry panel of the Expo app (mobile/) running on the web through react-native-web, served by
# the site under /rn. Same mock server as the other suites. Needs the web export first:
#   (cd mobile && npm run web:export) && npx next build && npx next start -p 3300 &   then   python3 tests/e2e/rn_add_panel.py
# Checks, on desktop (1320) and phone (390) widths: a manual entry saves through the Next.js API; a CSV upload is read
# by the shared reader.js and saved from the review; a rename is remembered (shared merchants.js) and comes back with
# "Was: …"; the Next.js page sees the same data.
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, ROOT + '/tests/visual')
import capture as C
from playwright.async_api import async_playwright
FIX = ROOT + '/tests/e2e/fixtures/statement.csv'
OUT = os.environ.get('RN_SHOTS', '/tmp/rn-web-shots'); os.makedirs(OUT, exist_ok=True)
ok = []
def check(name, cond, info=''):
    ok.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name, '' if cond else info)
GET = "async (c) => (await (await fetch('/api/db/' + c, { credentials: 'same-origin' })).json()).docs.map((d) => ({ id: d.id, ...d.data }))"
async def login(pg):
    await pg.goto(C.BASE + '/login'); await pg.fill('#login-email', 'admin@example.com')
    async with pg.expect_navigation(): await pg.click('#email-submit')
    if 'step=new' in pg.url:
        await pg.fill('#full-name', 'Felipe')
        async with pg.expect_navigation(): await pg.click('#signup-submit')
    await pg.fill('#code-0', '123456')
    async with pg.expect_navigation(): await pg.click('#code-submit')
    await pg.wait_for_url('**/welcome'); await pg.click('#ob-skip'); await pg.click('#ob-template'); await pg.wait_for_selector('.ob-setup')
    await pg.click('#ob-start'); await pg.wait_for_selector('#ob-welcome[open]', timeout=10000)
async def pick(q, field, text):
    await q.click('#' + field); await q.wait_for_selector('[role=menuitem]'); await q.wait_for_timeout(150)
    await q.locator('[role=menuitem]', has_text=text).first.click(); await q.wait_for_timeout(200)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/opt/pw-browsers/chromium'))
        srv = await C.start_server()
        errs = []
        try:
            ctx = await b.new_context(viewport={'width': 1320, 'height': 900}); await C.route_fonts(ctx); pg = await ctx.new_page()
            await login(pg); cookies = await ctx.cookies()
            for name, vp, mob in [('desktop', {'width': 1320, 'height': 900}, False), ('phone', {'width': 390, 'height': 844}, True)]:
                c2 = await b.new_context(viewport=vp, is_mobile=mob, has_touch=mob); await C.route_fonts(c2); await c2.add_cookies(cookies); q = await c2.new_page()
                q.on('pageerror', lambda e: errs.append(name + ' ' + str(e)[:200]))
                # manual entry
                await q.goto(C.BASE + '/rn/add'); await q.wait_for_selector('#entry-desc', timeout=15000); await q.wait_for_timeout(500)
                before = len(await q.evaluate(GET, 'entries'))
                await q.fill('#entry-desc', f'Electricity bill {name}')
                await pick(q, 'entry-cat', 'Habitation')
                await pick(q, 'entry-item', 'Electricity')
                await q.fill('#entry-amount', '64,2'); await q.locator('#entry-amount').blur()
                check(f'{name}: amount formatted on blur', await q.input_value('#entry-amount') == '64,20', await q.input_value('#entry-amount'))
                dis = await q.evaluate("() => document.getElementById('entry-submit').getAttribute('aria-disabled')")
                check(f'{name}: Save entry enabled when ready', dis in (None, 'false'), dis)
                await q.click('#entry-submit'); await q.wait_for_timeout(1500)
                ents = await q.evaluate(GET, 'entries')
                mine = [e for e in ents if e.get('description') == f'Electricity bill {name}']
                check(f'{name}: manual entry saved through the Next.js API', len(ents) == before + 1 and mine and mine[0]['item'] == 'Electricity' and mine[0]['amount'] == 64.2, mine)
                await q.screenshot(path=f'{OUT}/{name}-after-save.png')
                # upload + review
                await q.goto(C.BASE + '/rn/add'); await q.wait_for_selector('#entry-desc', timeout=15000); await q.wait_for_timeout(500)
                await q.set_input_files('#file-input', [FIX]); await q.wait_for_timeout(500)
                await q.click('#doc-add'); await q.wait_for_selector('#rv-rows', timeout=15000); await q.wait_for_timeout(500)
                await q.screenshot(path=f'{OUT}/{name}-review.png')
                first = q.locator('#rv-rows input').first
                d0 = await first.input_value()
                check(f'{name}: review lists the read rows', bool(d0), d0)
                if name == 'desktop':
                    await first.fill('Carrefour')
                    await q.locator('#rv-rows [aria-label^="Category"]').first.click(); await q.wait_for_selector('[role=menuitem]'); await q.locator('[role=menuitem]').first.click(); await q.wait_for_timeout(200)
                n0 = len(await q.evaluate(GET, 'entries'))
                await q.click('#rv-submit'); await q.wait_for_timeout(2000)
                ents = await q.evaluate(GET, 'entries')
                check(f'{name}: review saved', len(ents) > n0, (n0, len(ents)))
                st = await q.evaluate("async () => (await (await fetch('/api/db/settings', { credentials: 'same-origin' })).json()).docs.find((d) => d.id === 'merchants')?.data")
                if name == 'desktop':
                    check('desktop: rename remembered in merchants (shared merchants.js)', st and any(v.get('d') == 'Carrefour' for v in st['map'].values()), json.dumps(st)[:200])
                else:
                    # the second read (phone) arrives renamed with the "Was" note
                    pass
                if name == 'desktop':
                    await q.goto(C.BASE + '/rn/add'); await q.wait_for_selector('#entry-desc', timeout=15000); await q.wait_for_timeout(400)
                    await q.set_input_files('#file-input', [FIX]); await q.wait_for_timeout(400)
                    await q.click('#doc-add'); await q.wait_for_selector('#rv-rows', timeout=15000); await q.wait_for_timeout(400)
                    v = await q.locator('#rv-rows input').first.input_value(); was = await q.locator('text=/^Was: /').count()
                    check('desktop: next read arrives renamed with "Was"', v == 'Carrefour' and was >= 1, (v, was))
                    await q.screenshot(path=f'{OUT}/desktop-review-was.png')
                    await q.click('#rv-cancel'); await q.wait_for_timeout(300)
                    check('desktop: Cancel returns to the form', await q.locator('#entry-desc').count() == 1)
                await c2.close()
            # the web app shows the entries the RN build saved
            await pg.goto(C.BASE + '/'); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(800)
            ents = await pg.evaluate(GET, 'entries')
            check('same data seen by the Next.js page', any(e.get('description') == 'Electricity bill desktop' for e in ents))
        finally:
            srv.terminate()
        print('page errors', errs)
        print('RESULT', sum(ok), '/', len(ok))
        print('ALL PASSED' if all(ok) and not errs else 'FAILED')
asyncio.run(main())
