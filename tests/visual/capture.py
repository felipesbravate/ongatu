"""Reference screenshots of every screen, panel and state, against scripts/dev-mock-server.mjs.

Run:  python3 tests/visual/capture.py [out_dir]     (default tests/visual/reference)
Needs python playwright + chromium (CHROMIUM_PATH, default /opt/pw-browsers/chromium) and the
app fonts as woff2 files in FONTS_DIR (default ~/fonts; Fontsource "latin" files). The fonts are
served in place of Google Fonts so the shots use the real typefaces with no network.

Deterministic: the clock is frozen at 23 Sep 2026 10:00, the data is synthetic and generated
from fixed formulas, animations and caret blinking are off. Two runs must match pixel for pixel.
The same script drives the React rewrite: selectors are the contract.
"""
import asyncio, json, os, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tests', 'visual', 'reference'))
FONTS = os.path.expanduser(os.environ.get('FONTS_DIR', '~/fonts'))
FIX = os.path.join(ROOT, 'tests', 'e2e', 'fixtures')
PORT = int(os.environ.get('VISUAL_PORT', '3198'))
BASE = f'http://127.0.0.1:{PORT}'
HDR = {'origin': BASE, 'x-requested-with': 'costs-tracker'}
VIEWPORTS = {'desktop': {'width': 1440, 'height': 1000}, 'mobile': {'width': 390, 'height': 844}}
ONLY = set(filter(None, os.environ.get('ONLY', '').split(',')))

FROZEN = "(() => { const R = Date, T = new R(2026, 8, 23, 10, 0, 0).getTime(), off = T - R.now(); class D extends R { constructor(...a){ if (a.length === 0) super(R.now() + off); else super(...a); } static now(){ return R.now() + off; } } D.UTC = R.UTC; D.parse = R.parse; window.Date = D; })();"
CALM = "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important} ::-webkit-scrollbar{width:0!important;height:0!important}"

def font_css():
    faces = []
    for fam, slug in (('Plus Jakarta Sans', 'plus-jakarta-sans'), ('JetBrains Mono', 'jetbrains-mono')):
        for w in (300, 400, 500, 600):
            for sub in ('latin-ext', 'latin'):
                f = f'{slug}-{sub}-{w}-normal.woff2'
                if os.path.exists(os.path.join(FONTS, f)):
                    faces.append(f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{w};font-display:block;src:url(https://fonts.gstatic.com/local/{f}) format('woff2')}}")
    return '\n'.join(faces)

async def route_fonts(ctx):
    css = font_css()
    async def css_route(r): await r.fulfill(status=200, content_type='text/css', body=css)
    async def file_route(r):
        p = os.path.join(FONTS, r.request.url.rsplit('/', 1)[-1])
        if os.path.exists(p): await r.fulfill(status=200, content_type='font/woff2', body=open(p, 'rb').read(), headers={'access-control-allow-origin': '*'})
        else: await r.fulfill(status=404, body='')
    await ctx.route('https://fonts.googleapis.com/**', css_route)
    await ctx.route('https://fonts.gstatic.com/**', file_route)

# ---------- synthetic data (no personal data) ----------
def amt(base, y, m, k, spread=0.12):
    """Deterministic 'noisy' amount: base +/- spread, rounded to cents."""
    x = ((y * 131 + m * 17 + k * 7) % 23) / 22.0 - 0.5
    return round(base * (1 + 2 * spread * x), 2)

LINES = [  # type, group, category, item, base, every-month?
    ('income', None, None, 'Salary', 3900, True), ('income', None, None, 'Freelance', 650, False), ('income', None, None, 'Bonus', 1200, 'jun'),
    ('investment', None, None, 'Savings', 700, True), ('investment', None, None, 'Stocks & funds', 350, True), ('investment', None, None, 'Pension', 180, True),
    ('expense', 'Fixed', 'Habitation', 'Rent or mortgage', 1150, True), ('expense', 'Fixed', 'Habitation', 'Electricity', 64, True), ('expense', 'Fixed', 'Habitation', 'Internet', 38, True),
    ('expense', 'Fixed', 'Habitation', 'Phone', 22, True), ('expense', 'Fixed', 'Bank', 'Bank fees', 6, True), ('expense', 'Fixed', 'Insurances', 'Health insurance', 96, True),
    ('expense', 'Fixed', 'Other', 'Subscriptions', 41, True),
    ('expense', 'Variable', 'Food', 'Groceries', 420, True), ('expense', 'Variable', 'Food', 'Restaurants', 160, True), ('expense', 'Variable', 'Transport', 'Public transport', 40, True),
    ('expense', 'Variable', 'Transport', 'Taxi', 35, False), ('expense', 'Variable', 'Health', 'Pharmacy', 28, False), ('expense', 'Variable', 'Personal care', 'Haircut', 25, False),
    ('expense', 'Variable', 'Credit card', 'Credit card payment', 210, True),
    ('expense', 'Additional', 'Fun', 'Cinema and events', 55, False), ('expense', 'Additional', 'Clothes', 'Clothes', 120, False), ('expense', 'Additional', 'Trips', 'Flights', 380, 'trip'),
    ('expense', 'Additional', 'Trips', 'Hotels', 290, 'trip'), ('expense', 'Additional', 'Others', 'Gifts', 70, 'dec'),
    ('expense', 'Extra', 'Health', 'Dentist', 140, 'dent'), ('expense', 'Extra', 'Maintence and prevention', 'Home repairs', 260, 'rep'),
]
def occurs(rule, m):
    if rule is True: return True
    if rule is False: return m % 2 == 0 or m % 3 == 0
    return {'jun': m == 5, 'trip': m in (3, 6, 7), 'dec': m == 11, 'dent': m in (1, 8), 'rep': m in (4, 9)}[rule]

def entries_for(year, last_month):
    out = []
    for m in range(last_month + 1):
        for k, (t, g, c, item, base, rule) in enumerate(LINES):
            if not occurs(rule, m): continue
            e = {'year': str(year), 'monthIndex': m, 'type': t, 'item': item, 'description': item, 'amount': amt(base, year, m, k), 'date': f'{year}-{m+1:02d}-{(k % 27) + 1:02d}'}
            if g: e.update(group=g, category=c)
            out.append(e)
    return out

async def seed(ctx):
    post = lambda col, data: ctx.request.post(f'{BASE}/api/db/{col}', headers=HDR, data=data)
    for y, cur, at in (('2024', 'SEK', '2024-01-01T00:00:00.000Z'), ('2025', 'EUR', '2025-01-01T00:00:00.000Z'), ('2026', 'EUR', '2026-01-01T00:00:00.000Z')):
        await post('years', {'year': y, 'currency': cur, 'createdAt': at})
    rows = entries_for(2025, 11) + entries_for(2026, 7)
    # September 2026 (the frozen "today"): only a few real entries, the rest projected
    rows += [e for e in entries_for(2026, 8) if e['monthIndex'] == 8 and e['item'] in ('Salary', 'Rent or mortgage', 'Groceries', 'Internet')]
    # SEK year: a small real history so the SEK year-over-year chart has data
    rows += [dict(e, amount=round(e['amount'] * 11.2, 2)) for e in entries_for(2024, 11) if e['item'] in ('Salary', 'Rent or mortgage', 'Groceries', 'Savings', 'Restaurants')]
    # a spreadsheet cell with a note (entry counter + entries tooltip)
    rows.append({'year': '2026', 'monthIndex': 8, 'type': 'expense', 'group': 'Variable', 'category': 'Food', 'item': 'Restaurants', 'description': 'Imported',
                 'amount': 86.4, 'date': '2026-09-01', 'note': 'Lunch with team\nPizza night (5/9)', 'realAmounts': [52.1, 34.3]})
    for e in rows: await post('entries', e)

# ---------- helpers ----------
async def fresh(pg):
    await pg.goto(BASE + '/'); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(900)
    await pg.add_style_tag(content=CALM)
    await pg.evaluate("document.fonts.ready"); await pg.mouse.move(0, 0)

async def open_panel(pg):
    if await pg.get_attribute('#tracker-add-btn', 'aria-pressed') != 'true': await pg.click('#tracker-add-btn')
    await pg.wait_for_timeout(300)

async def year(pg, label): await pg.click(f'.year-btn:text-is("{label}")'); await pg.wait_for_timeout(300)
async def month(pg, i): await pg.locator('.month-btn').nth(i).click(); await pg.wait_for_timeout(300)
async def tab(pg, top, group=None):
    await pg.click(f'#breakdown-top-seg button[data-v={top}]'); await pg.wait_for_timeout(150)
    if group: await pg.click(f'#breakdown-group-seg button[data-v={group}]'); await pg.wait_for_timeout(150)
async def settle(pg): await pg.wait_for_timeout(350); await pg.evaluate("document.fonts.ready")

# ---------- the states ----------
# (name, kind, fn): kind 'page' = full page shot, 'view' = viewport shot (overlays, panels)
async def s_dash(pg): pass
async def s_income(pg): await tab(pg, 'Income')
async def s_invest(pg): await tab(pg, 'Investments')
async def s_variable(pg): await tab(pg, 'Expenses', 'Variable')
async def s_additional(pg): await tab(pg, 'Expenses', 'Additional')
async def s_extra(pg): await tab(pg, 'Expenses', 'Extra')
async def s_month_past(pg): await month(pg, 5)
async def s_month_future(pg): await month(pg, 10)
async def s_year_prev(pg): await year(pg, '2025'); await month(pg, 11)
async def s_year_sek(pg): await year(pg, '2024'); await month(pg, 3)
async def s_trend_tip(pg):
    box = await pg.locator('#trend-chart').bounding_box()
    await pg.mouse.move(box['x'] + box['width'] * 0.55, box['y'] + box['height'] * 0.5); await settle(pg)
async def s_note_tip(pg):
    await tab(pg, 'Expenses', 'Variable')
    await pg.locator('.bd-row', has_text='Restaurants').locator('.note-count').first.click(); await settle(pg)
async def s_counter_hover(pg):
    await tab(pg, 'Expenses', 'Variable')
    await pg.locator('.bd-row', has_text='Restaurants').locator('.note-count').first.hover(); await settle(pg)
async def s_row_estimate_tip(pg):
    await tab(pg, 'Expenses', 'Fixed')
    c = pg.locator('.bd-row .note-count')
    if await c.count(): await c.first.click(); await settle(pg)
async def s_year_add(pg): await pg.click('#year-add-toggle'); await pg.evaluate("() => { const s = document.getElementById('year-add-year'); s.value = '2027'; s.dispatchEvent(new Event('change', {bubbles:true})); }"); await settle(pg)
async def s_year_add_currency(pg):
    await pg.click('#year-add-toggle'); await pg.click('#year-add-currency-trigger'); await settle(pg)
async def s_year_hover(pg): await pg.locator('.year-btn:text-is("2025")').hover(); await settle(pg)
async def s_year_del_hover(pg):
    await year(pg, '2026'); await pg.locator('.year-btn[aria-pressed="true"]').hover(); await settle(pg)
async def s_year_delete_modal(pg):
    await year(pg, '2026'); await pg.click('.year-del-btn'); await pg.wait_for_selector('#confirm-modal[open]'); await settle(pg)
async def s_month_hover(pg): await pg.locator('.month-btn').nth(3).hover(); await settle(pg)
async def s_btn_hover(pg): await pg.locator('#tracker-add-btn').hover(); await settle(pg)

async def s_panel(pg): await open_panel(pg); await settle(pg)
async def s_panel_income(pg): await open_panel(pg); await pg.click('#entry-kind-trigger'); await pg.click('.ds-dd-menu .ds-dd-item:text-is("Income")'); await settle(pg)
async def s_panel_invest(pg): await open_panel(pg); await pg.click('#entry-kind-trigger'); await pg.click('.ds-dd-menu .ds-dd-item:text-is("Savings and investments")'); await settle(pg)
async def s_panel_filled(pg):
    await open_panel(pg)
    for sid, v in (('entry-cat', 'Habitation'), ('entry-item', 'Electricity')):
        await pg.evaluate("([id, v]) => { const s = document.getElementById(id); s.value = v; s.dispatchEvent(new Event('change', {bubbles:true})); }", [sid, v]); await pg.wait_for_timeout(150)
    await pg.fill('#entry-desc', 'Electricity bill'); await pg.fill('#entry-amount', '64.2'); await settle(pg)
async def s_panel_cat_menu(pg): await open_panel(pg); await pg.click('#entry-cat-trigger'); await settle(pg)
async def s_panel_period_menu(pg): await open_panel(pg); await pg.click('#entry-period-trigger'); await settle(pg)
async def s_panel_error(pg):
    await open_panel(pg); await pg.click('#entry-submit'); await settle(pg)
async def s_panel_files(pg):
    await open_panel(pg); await pg.set_input_files('#file-input', [os.path.join(FIX, 'statement.csv'), os.path.join(FIX, 'receipt.png')]); await settle(pg)
async def s_review(pg):
    await open_panel(pg); await pg.set_input_files('#file-input', [os.path.join(FIX, 'statement.csv')]); await pg.wait_for_timeout(300)
    await pg.click('#doc-add'); await pg.wait_for_selector('#ap-review:not([hidden])', timeout=8000); await settle(pg)
async def s_review_edit(pg):
    await s_review(pg); await pg.click('#rv-rows .rv-row .c-cat .rv-link'); await pg.wait_for_selector('#rv-rows .rv-row.is-editing'); await settle(pg)
async def s_review_bad_date(pg):
    await s_review(pg); await pg.click('#rv-period-trigger')
    await pg.click('.ds-dd-menu .ds-dd-block:has(.ds-dd-group:text-is("2026")) .ds-dd-item:text-is("August")'); await settle(pg)
async def s_toast(pg):
    await open_panel(pg); await pg.click('#entry-kind-trigger'); await pg.click('.ds-dd-menu .ds-dd-item:text-is("Income")'); await pg.wait_for_timeout(100)
    opts = await pg.evaluate("[...document.querySelectorAll('#entry-item option')].map(o => o.value).filter(Boolean)")
    await pg.evaluate("v => { const s = document.getElementById('entry-item'); s.value = v; s.dispatchEvent(new Event('change', {bubbles:true})); }", opts[0])
    await pg.fill('#entry-desc', 'Side project'); await pg.fill('#entry-amount', '250'); await pg.click('#entry-submit')
    await pg.wait_for_selector('#ds-toast.visible, .ds-toast.visible', timeout=4000); await settle(pg)

async def budget(pg):
    await pg.click('#year-add-toggle'); await pg.evaluate("() => { const s = document.getElementById('year-add-year'); s.value = '2027'; s.dispatchEvent(new Event('change', {bubbles:true})); }"); await pg.click('#year-add-submit')
    await pg.wait_for_selector('#budget-panel.open, #budget-panel[aria-hidden="false"], #budget-panel:not([hidden])', timeout=5000); await settle(pg)
async def s_budget(pg): await budget(pg)
async def s_budget_income(pg):
    await budget(pg); await pg.click('#budget-kind-trigger'); await pg.click('.ds-dd-menu .ds-dd-item:text-is("Income")'); await settle(pg)
async def s_budget_variable(pg):
    await budget(pg); await pg.click('#budget-sub-trigger'); await pg.click('.ds-dd-menu .ds-dd-item:text-is("Variable")'); await settle(pg)
async def s_budget_hover(pg):
    await budget(pg); await pg.locator('#budget-sections .budget-type-section:not([hidden]) .br-amount').first.hover(); await settle(pg)
async def s_budget_edit(pg):
    await budget(pg); await pg.locator('#budget-sections .budget-type-section:not([hidden]) .br-amount').first.click(); await settle(pg)

async def s_admin(pg): await pg.click('#user-menu-btn'); await pg.click('#menu-admin'); await pg.wait_for_selector('dialog.ct-dialog[open]'); await settle(pg)
async def s_user_menu(pg): await pg.click('#user-menu-btn'); await pg.wait_for_selector('#user-menu'); await settle(pg)
async def s_notif(pg): await pg.click('#notif-btn'); await pg.wait_for_selector('#notif-panel'); await settle(pg)
async def s_tracker_menu(pg): await pg.click('#tracker-menu-btn'); await pg.wait_for_selector('#tracker-menu'); await settle(pg)
async def s_month_budget(pg):
    await month(pg, 10); await pg.click('#tracker-menu-btn'); await pg.click('#adjust-budget')
    await pg.wait_for_selector('#month-budget-panel.open'); await settle(pg)

STATES = [
    ('01-dashboard', 'page', s_dash), ('02-tab-income', 'page', s_income), ('03-tab-invest', 'page', s_invest),
    ('04-tab-variable', 'page', s_variable), ('05-tab-additional', 'page', s_additional), ('06-tab-extra', 'page', s_extra),
    ('07-month-past', 'page', s_month_past), ('08-month-projected', 'page', s_month_future), ('09-year-2025-dec', 'page', s_year_prev),
    ('10-year-sek', 'page', s_year_sek), ('11-trend-tooltip', 'view', s_trend_tip), ('12-entries-tooltip', 'view', s_note_tip),
    ('13-counter-hover', 'view', s_counter_hover), ('14-estimate-tooltip', 'view', s_row_estimate_tip), ('15-year-add', 'view', s_year_add),
    ('16-year-add-currency', 'view', s_year_add_currency), ('17-year-hover', 'view', s_year_hover), ('18-year-delete-hover', 'view', s_year_del_hover),
    ('19-month-hover', 'view', s_month_hover), ('20-button-hover', 'view', s_btn_hover),
    ('21-panel', 'view', s_panel), ('22-panel-income', 'view', s_panel_income), ('23-panel-invest', 'view', s_panel_invest),
    ('24-panel-filled', 'view', s_panel_filled), ('25-panel-category-menu', 'view', s_panel_cat_menu), ('26-panel-period-menu', 'view', s_panel_period_menu),
    ('27-panel-error', 'view', s_panel_error), ('28-panel-files', 'view', s_panel_files), ('29-review', 'view', s_review),
    ('30-review-editing', 'view', s_review_edit), ('31-review-bad-date', 'view', s_review_bad_date), 
    ('33-budget', 'view', s_budget), ('34-budget-income', 'view', s_budget_income), ('35-budget-variable', 'view', s_budget_variable),
    ('36-budget-amount-hover', 'view', s_budget_hover), ('37-budget-editing', 'view', s_budget_edit), ('38-admin-dialog', 'view', s_admin),
    ('40-user-menu', 'view', s_user_menu), ('41-notifications', 'view', s_notif), ('42-tracker-menu', 'view', s_tracker_menu),
    ('43-month-budget', 'view', s_month_budget),
    ('44-year-delete-modal', 'view', s_year_delete_modal),
    ('39-toast', 'view', s_toast),  # writes an entry: keep last
]

async def start_server():
    env = dict(os.environ, PORT=str(PORT), APP_ORIGIN=BASE, ADMIN_EMAILS='admin@example.com', MOCK_TEST_ENDPOINTS='1', DAILY_READ_CAP='999')
    srv = subprocess.Popen(['node', 'scripts/dev-mock-server.mjs'], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    for _ in range(80):
        try: urllib.request.urlopen(BASE + '/login'); return srv
        except Exception: time.sleep(0.1)
    raise RuntimeError('mock server did not start')

async def main():
    manifest, problems = [], []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/opt/pw-browsers/chromium'))
        for vp, size in VIEWPORTS.items():
            srv = await start_server()   # fresh data for every viewport, so a state that writes can't leak
            try:
                seed_ctx = await b.new_context(); await seed_ctx.add_init_script(FROZEN); await route_fonts(seed_ctx)
                pg = await seed_ctx.new_page(); await pg.goto(BASE + '/login'); await pg.fill('#login-email', 'admin@example.com')
                async with pg.expect_navigation(): await pg.click('#email-submit')
                if 'step=new' in pg.url:
                    await pg.fill('#full-name', 'Felipe')
                    async with pg.expect_navigation(): await pg.click('#signup-submit')
                if 'step=code' in pg.url:
                    await pg.fill('#code-0', '12345678')
                    async with pg.expect_navigation(): await pg.click('#code-submit')
                # Oct 2: a new account starts at /welcome (onboarding); mark it onboarded so the dashboard opens.
                await pg.wait_for_url('**/welcome'); await seed_ctx.request.put(f'{BASE}/api/db/settings/onboarding', headers=HDR, data={'done': True})
                await pg.goto(BASE + '/'); await pg.wait_for_selector('#user-nav'); await seed(seed_ctx)
                storage = await seed_ctx.storage_state(); await seed_ctx.close()
                os.makedirs(os.path.join(OUT, vp), exist_ok=True)
                for name, kind, fn in STATES:
                    if ONLY and name not in ONLY: continue
                    ctx = await b.new_context(viewport=size, device_scale_factor=1, storage_state=storage, reduced_motion='reduce')
                    await ctx.add_init_script(FROZEN); await route_fonts(ctx)
                    page = await ctx.new_page(); page.set_default_timeout(6000); errs = []
                    page.on('pageerror', lambda e: errs.append(str(e)))
                    ok = True
                    try:
                        await fresh(page); await fn(page)
                        if not any(k in name for k in ('hover', 'tooltip')): await page.mouse.move(1, 1)
                        await page.wait_for_timeout(250)
                        await page.screenshot(path=os.path.join(OUT, vp, name + '.png'), full_page=(kind == 'page'), animations='disabled', caret='hide')
                        manifest.append({'viewport': vp, 'state': name, 'kind': kind, 'errors': errs})
                        if errs: problems.append(f'{vp}/{name}: {errs}'); ok = False
                    except Exception as ex:
                        problems.append(f'{vp}/{name}: {type(ex).__name__}: {str(ex).splitlines()[0]} | {" / ".join(l.strip() for l in str(ex).splitlines()[-3:])}'); ok = False
                    await ctx.close(); print(vp, name, 'ok' if ok else 'FAIL', flush=True)
            finally:
                srv.terminate(); srv.wait()
        await b.close()
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    print(f'{len(manifest)} shots in {OUT}')
    for p_ in problems: print('PROBLEM', p_)
    sys.exit(1 if problems else 0)

if __name__ == '__main__':
    asyncio.run(main())
