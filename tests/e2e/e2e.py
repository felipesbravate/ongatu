"""End-to-end test against scripts/dev-mock-server.mjs (real UI, real API/vault/CSP code, fake sign-in).
Run:  python3 tests/e2e/e2e.py      (starts and stops its own server on port 3199)
Needs: python playwright + a chromium (set CHROMIUM_PATH if not at /opt/pw-browsers/chromium)."""
import asyncio, base64, json, os, re, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 3199
BASE = f'http://127.0.0.1:{PORT}'
FIX = os.path.join(ROOT, 'tests', 'e2e', 'fixtures')
IGNORE = ('fonts.googleapis', 'fonts.gstatic', 'ERR_TUNNEL', 'ERR_NAME_NOT_RESOLVED', 'ERR_INTERNET_DISCONNECTED')
fails = []
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra and not cond else ''))
    if not cond: fails.append(name)

def state():
    with urllib.request.urlopen(BASE + '/__test/state') as r: return json.load(r)

async def open_panel(pg):
    if await pg.get_attribute('#tracker-add-btn', 'aria-pressed') != 'true': await pg.click('#tracker-add-btn')
    await pg.wait_for_timeout(250)

async def dd_structure(pg, sid):
    """Open the dropdown behind <select id=sid>, read its menu as [(group|None, [items])], close it."""
    await pg.click(f'#{sid}-trigger'); await pg.wait_for_selector('.ds-dd-menu')
    out = await pg.evaluate("""() => [...document.querySelectorAll('.ds-dd-menu .ds-dd-block')].map(b => {
        const g = b.querySelector('.ds-dd-group'); return [g ? g.textContent : null, [...b.querySelectorAll('.ds-dd-item')].map(i => i.textContent)]; })""")
    await pg.keyboard.press('Escape'); await pg.wait_for_selector('.ds-dd-menu', state='detached')
    return out

async def dd_pick(pg, sid, text, group=None):
    await pg.click(f'#{sid}-trigger'); await pg.wait_for_selector('.ds-dd-menu')
    scope = f'.ds-dd-block:has(.ds-dd-group:text-is("{group}")) ' if group else ''
    await pg.click(f'.ds-dd-menu {scope}.ds-dd-item > span:text-is("{text}")'); await pg.wait_for_timeout(120)

async def dd_text(pg, sid): return await pg.inner_text(f'#{sid}-trigger')

async def login(ctx, email, name=None):
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and not any(x in m.text for x in IGNORE) else None)
    pg.on('response', lambda r: errs.append('HTTP %s %s' % (r.status, r.url)) if r.status >= 400 and r.url.startswith(BASE) else None)
    await sign_in(pg, email, name or email.split('@')[0].capitalize())
    return pg, errs

# The sign-in steps (Ongatu 335:7580 ...): email, then "Create account" for a new address, then the 6-digit code
# (the mock's code is 123456). An account with a password stops at the password step.
async def sign_in(pg, email, name):
    await pg.goto(BASE + '/login'); await pg.fill('#login-email', email)
    async with pg.expect_navigation(): await pg.click('#email-submit')
    if 'step=new' in pg.url:
        await pg.fill('#full-name', name)
        async with pg.expect_navigation(): await pg.click('#signup-submit')
    if 'step=code' in pg.url:
        await pg.fill('#code-0', '123456')
        async with pg.expect_navigation(): await pg.click('#code-submit')
    await skip_onboarding(pg)

# Oct 2: a new account starts at /welcome (onboarding, 397:4392). Tests that are about the dashboard mark the account
# onboarded and open it; the onboarding has its own checks.
async def ob_pick(pg, fid, name, create=False):
    if await pg.input_value(f'#{fid}') == name: return
    # Setup board comboboxes (Oct 6): type the name, then pick it (or 'Create "name"') from the list.
    await pg.click(f'#{fid}'); await pg.fill(f'#{fid}', name)
    await pg.wait_for_selector('.fld-combo-menu .ds-dd-item.is-active'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(250)

async def skip_onboarding(pg):
    for _ in range(30):
        if '/welcome' in pg.url or '/pending' in pg.url or '/login' in pg.url: break
        if await pg.locator('#user-nav').count(): return
        await pg.wait_for_timeout(100)
    if '/welcome' in pg.url:
        await pg.request.put(BASE + '/api/db/settings/onboarding', headers={'origin': BASE, 'x-requested-with': 'costs-tracker'}, data={'done': True})
        await pg.goto(BASE + '/')

async def main():
    env = dict(os.environ, PORT=str(PORT), APP_ORIGIN=BASE, ADMIN_EMAILS='admin@example.com', MOCK_TEST_ENDPOINTS='1', DAILY_READ_CAP='5')
    srv = subprocess.Popen(['node', 'scripts/dev-mock-server.mjs'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        for _ in range(50):
            try: urllib.request.urlopen(BASE + '/login'); break
            except Exception: time.sleep(0.1)
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/opt/pw-browsers/chromium'))
            admin_ctx = await b.new_context(viewport={'width': 1300, 'height': 900}); ann_ctx = await b.new_context(viewport={'width': 1300, 'height': 900})

            # 0. sign-in steps (Ongatu 325:10734 ...): email -> Create account (new address) -> 6-digit code
            sp = await admin_ctx.new_page(); sp_errs = []
            sp.on('pageerror', lambda e: sp_errs.append(str(e))); sp.on('console', lambda m: sp_errs.append(m.text) if m.type == 'error' and not any(x in m.text for x in IGNORE) else None)
            await sp.goto(BASE + '/login'); await sp.wait_for_selector('#email-submit')
            lg = await sp.evaluate("""() => { const cs = e => getComputedStyle(e), r = e => e.getBoundingClientRect(), card = document.querySelector('.login-card'), logo = document.querySelector('.login-header .ds-logo');
                return { title: document.querySelector('.login-title').textContent, tagline: document.querySelector('.login-tagline').textContent, logo: [Math.round(r(logo).width), Math.round(r(logo).height), logo.dataset.variant],
                         card: [r(card).width, cs(card).padding, cs(card).borderRadius, cs(card).borderTopWidth, cs(card).boxShadow], centre: Math.round((r(document.querySelector('.login-content')).top + r(document.querySelector('.login-content')).bottom) / 2 - innerHeight / 2), gap: r(card).top - r(document.querySelector('.login-tagline')).bottom,
                         bg: cs(document.querySelector('.login-page')).backgroundImage.slice(0, 15),
                         label: document.querySelector('.login-label').textContent }; }""")
            check('sign in (568:3989, Oct 9): the sign-in gradient, content centred, logo 131 x 104, tagline, 480 card (padding 40, radius 16, no stroke, Card shadow), 40 below the header',
                  lg['title'] == 'Sign in or create an account' and lg['tagline'] == 'Take charge of your money' and lg['logo'] == [131, 104, 'vertical'] and abs(lg['centre']) <= 1
                  and lg['card'][:4] == [480, '40px', '16px', '0px'] and '20px' in lg['card'][4] and lg['bg'] == 'linear-gradient' and abs(lg['gap'] - 40) < 1 and lg['label'] == 'Enter your email', lg)
            lp = await b.new_page(viewport={'width': 390, 'height': 844}); await lp.goto(BASE + '/login'); await lp.wait_for_selector('#email-submit')
            lm = await lp.evaluate("""() => { const cs = e => getComputedStyle(e), r = e => e.getBoundingClientRect(), card = document.querySelector('.login-card'), logo = document.querySelector('.login-header .ds-logo');
                return { logo: [Math.round(r(logo).width), Math.round(r(logo).height)], card: [Math.round(r(card).left), Math.round(r(card).width), cs(card).padding, cs(card).borderTopWidth], gap: Math.round(r(card).top - r(document.querySelector('.login-tagline')).bottom), scrollW: document.documentElement.scrollWidth }; }""")
            check('sign in on a phone (866:14705, Oct 9): logo 120 x 96, no card (342 wide at 24, no padding, no border), 80 below the tagline',
                  lm == {'logo': [120, 96], 'card': [24, 342, '0px', '0px'], 'gap': 80, 'scrollW': 390}, lm)
            await lp.close()
            await sp.fill('#login-email', 'newbie@example.com'); await sp.click('#email-submit'); await sp.wait_for_selector('#signup-submit')
            check('a new address gets "Create account": name, the address filled in, no "we sent" line yet (342:7702)',
                  await sp.inner_text('.login-title') == 'Create account' and await sp.input_value('#signup-email') == 'newbie@example.com' and await sp.locator('.login-sub').count() == 0)
            await sp.click('#signup-submit'); await sp.wait_for_timeout(300)
            check('Create account: the name is required', 'step=new' in sp.url or await sp.locator('#full-name:invalid').count() == 1)
            await sp.fill('#full-name', 'Nina Newbie'); await sp.click('#signup-submit'); await sp.wait_for_selector('#code-submit')
            boxes = await sp.locator('.login-code input:not([type=hidden])').count()
            cb = await sp.evaluate("""() => { const b = [...document.querySelectorAll('.login-code-box')].map(e => e.getBoundingClientRect()), f = document.querySelector('.login-code-field').getBoundingClientRect(),
                c = document.querySelector('.login-form').getBoundingClientRect(), l = document.getElementById('code-label').getBoundingClientRect();
                return [Math.round(b[0].width), Math.round(b[0].height), Math.round(b[1].left - b[0].right), getComputedStyle(document.querySelector('.login-code-box')).borderRadius,
                        Math.round(f.width), Math.round((f.left - c.left) - (c.right - f.right)), Math.round(l.left - b[0].left)]; }""")
            check('code boxes (430:5508, Oct 4): 48 x 48, 8 apart, radius 6; the 328-wide field centred, label over the first box', cb == [48, 48, 8, '6px', 328, 0, 0], cb)
            await sp.click('#code-0'); await sp.keyboard.type('1a2b3')
            typed = await sp.eval_on_selector('input[name=code]', 'e => e.value')
            check('code step (568:5234): "Check your inbox", 6 boxes, digits only, typing moves to the next box, the resend link waits',
                  boxes == 6 and typed == '123' and await sp.inner_text('.login-title') == 'Check your inbox' and 'We sent your sign-in code to newbie@example.com. It can take a minute to arrive.' == await sp.inner_text('.login-sub')
                  and await sp.eval_on_selector('#resend-code', 'e => e.disabled') and (await sp.inner_text('#resend-wait'))[:4] in ('in 0', 'in 1'), [boxes, typed])
            await sp.click('#code-0'); await sp.keyboard.press('Backspace'); await sp.keyboard.press('Backspace'); await sp.keyboard.press('Backspace')
            await sp.evaluate("""() => { const dt = new DataTransfer(); dt.setData('text', '987 654'); document.getElementById('code-0').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""")
            await sp.wait_for_timeout(100)
            check('pasting "987 654" fills all six boxes', await sp.eval_on_selector('input[name=code]', 'e => e.value') == '987654')
            await sp.click('#code-submit'); await sp.wait_for_selector('#login-msg')
            check('a wrong code says so and stays on the code step', 'step=code' in sp.url and "didn't work" in await sp.inner_text('#login-msg'))
            await sp.fill('#code-0', '123456')
            async with sp.expect_navigation(): await sp.click('#code-submit')
            await sp.wait_for_timeout(300)
            check('the right code signs in (a new account waits for approval)', '/pending' in sp.url, sp.url)
            await sp.goto(BASE + '/login'); await sp.wait_for_timeout(300)
            check('someone signed in who opens /login goes to the tracker', '/login' not in sp.url, sp.url)
            await sp.close(); await admin_ctx.clear_cookies()
            check('sign-in pages: no script or CSP errors', not sp_errs, sp_errs)

            # 1. admin: page loads with an empty account and no script/CSP errors
            pg, errs = await login(admin_ctx, 'admin@example.com')
            await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(700)
            check('admin: tracker renders, no page or CSP errors', not errs, errs)
            await pg.click('#year-add-toggle'); await pg.wait_for_timeout(300)
            ya = await pg.evaluate("""() => { const r = e => e.getBoundingClientRect(), p = document.getElementById('year-add-panel'), y = document.getElementById('year-add-year-trigger'), c = document.getElementById('year-add-currency-trigger'), b = document.getElementById('year-add-submit');
                return { h: r(p).height, border: getComputedStyle(p).borderTopColor, dd: [r(y).width, r(y).height, r(c).width, r(c).height], gap: r(c).left - r(y).right, btn: r(b).height }; }""")
            check('Add year (Oct 3: always the Mobile tokens): the pill hugs its Small close, border/default, two Tiny dropdowns 120 x 32, space/tn (4) apart, Tiny Add button (32)',
                  ya['h'] == 44 and ya['border'] == 'rgb(203, 202, 197)' and ya['dd'] == [120, 32, 120, 32] and ya['gap'] == 4 and ya['btn'] == 32, ya)
            # Year budget (232:5851 / 232:5853, Oct 3): groups are created, renamed and deleted in the panel; Cancel discards it all
            nxt = await pg.evaluate("() => { const s = document.getElementById('year-add-year'); const o = [...s.options].map(o => o.value).filter(Boolean); s.value = o[o.length - 1]; s.dispatchEvent(new Event('change', {bubbles:true})); return s.value; }")
            await pg.click('#year-add-submit'); await pg.wait_for_selector('#budget-panel.open'); await pg.wait_for_timeout(400)
            bp = await pg.evaluate("""() => { const r = e => e.getBoundingClientRect(), p = document.querySelector('#budget-panel.open'), pr = r(p);
                return { close: Math.round(r(document.getElementById('budget-close-btn')).top - pr.top), title: Math.round(r(document.getElementById('budget-panel-title')).top - pr.top),
                         save: [...document.querySelectorAll('#budget-panel.open > .add-actions .btn-pill')].map(b => b.textContent.trim()), saveIcon: !!document.querySelector('#budget-create-btn svg'),
                         label: document.querySelector('label[for="budget-new-group"]').textContent }; }""")
            check('Year budget (232:5853): close 8 from the top, title 24 under the 64 nav, Cancel then Save (no icon), "Create group (Optional)"',
                  bp['close'] == 8 and bp['title'] == 88 and bp['save'] == ['Cancel', 'Save ' + nxt] and not bp['saveIcon'] and bp['label'] == 'Create group (Optional)', bp)
            await pg.fill('#budget-new-group', 'Pets'); await pg.click('#budget-create-group'); await pg.wait_for_timeout(150)
            grp = pg.locator('#budget-sections .budget-type-section:not([hidden]) .budget-group[data-category="Pets"]')
            check('"Create new group" adds an empty group: "No types added yet." and its own "+ Add type"',
                  await grp.count() == 1 and (await grp.locator('.budget-group-empty').text_content()) == 'No types added yet.' and await grp.locator('.budget-group-add').count() == 1)
            await grp.locator('.budget-group-more').click(); await pg.wait_for_timeout(100)
            gm = await pg.evaluate("() => [...document.querySelectorAll('.group-menu .ds-dd-item')].map(e => e.textContent)")
            check('group menu (Drop-actions): "Change group name", "Delete group"', gm == ['Change group name', 'Delete group'], gm)
            await pg.click('.group-menu .group-rename'); await pg.wait_for_timeout(100)
            await pg.fill('.budget-group-rename input', 'Animals'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(150)
            check('renaming a group keeps it in place under the new name', await pg.locator('.budget-group[data-category="Animals"]').count() == 1 and await pg.locator('.budget-group[data-category="Pets"]').count() == 0)
            await pg.locator('.budget-group[data-category="Animals"] .budget-group-more').click(); await pg.click('.group-menu .group-delete'); await pg.wait_for_timeout(150)
            check('deleting a group removes it', await pg.locator('.budget-group[data-category="Animals"]').count() == 0)
            # Add type modal (661:6306 / 663:8893): one row = no remove; a second row shows the 16px red Remove; the Group field lists the groups in the custom Dropdown-list
            await pg.fill('#budget-new-group', 'Tmp'); await pg.click('#budget-create-group'); await pg.wait_for_timeout(150)
            await pg.locator('.budget-group[data-category="Tmp"] .budget-group-add').click(); await pg.wait_for_selector('#budget-type-modal[open]'); await pg.wait_for_timeout(200)
            m1 = await pg.evaluate("() => { const b = document.querySelectorAll('#budget-type-modal .fld-remove'); return { rm: b.length, off: b.length === 1 && b[0].disabled }; }")
            await pg.click('#budget-type-modal-more'); await pg.wait_for_timeout(100)
            m2 = await pg.evaluate("() => { const b = [...document.querySelectorAll('#budget-type-modal .fld-remove')], sv = b[0].querySelector('svg'); return { n: b.length, on: b.every((x) => !x.disabled), size: sv.getAttribute('width'), color: getComputedStyle(sv).color, link: getComputedStyle(document.getElementById('budget-type-modal-more')).fontSize }; }")
            check('Add type modal, desktop (577:6584 / 577:6612, audit D8-D9): one row has no Remove; with two, every row has the 16px Remove in action/destructive; "Add another type" Small',
                  m1['rm'] == 0 and m2['n'] == 2 and m2['on'] and m2['size'] == '16' and m2['color'] == 'rgb(189, 0, 7)' and m2['link'] == '14px', [m1, m2])
            await pg.fill('#budget-type-modal-group', 'Zoo'); await pg.wait_for_timeout(150)
            cm = await pg.evaluate("() => [...document.querySelectorAll('#budget-type-modal .fld-combo-menu .ds-dd-item')].map(e => e.textContent)")
            check('Group (Optional): a new name offers \'+ Create "Zoo"\' in the custom Dropdown-list (no native datalist)', cm[:1] == ['Create "Zoo"'] and await pg.locator('#budget-type-modal datalist').count() == 0, cm)
            await pg.click('#budget-type-modal-cancel'); await pg.wait_for_timeout(250)
            await pg.click('#budget-cancel-btn'); await pg.wait_for_timeout(400)
            check('Cancel closes the Year budget without creating the year', await pg.locator('#budget-panel.open').count() == 0 and await pg.locator(f'.year-btn:text-is("{nxt}")').count() == 0)
            check('admin: current year auto-created', await pg.locator('.year-btn').count() >= 1)

            # 2. manual entry persists across reload; storage holds ciphertext only
            await open_panel(pg)
            ae = await pg.evaluate("""() => { const r = e => e.getBoundingClientRect(), cs = e => getComputedStyle(e), sub = document.getElementById('entry-submit'), m = document.getElementById('ap-manual'),
                lk = document.querySelector('.dz-line .ds-action-link'), dl = document.querySelector('.date-dd-label'), cal = document.querySelector('.date-dd-cal');
                return { right: Math.round(r(m).right - r(sub).right), link: [cs(lk).fontSize, cs(lk).lineHeight], date: [cs(dl).fontSize, cs(dl).lineHeight], cal: cal ? r(cal).width : 0,
                         gap: Math.round(r(document.getElementById('entry-group-field')).left - r(document.getElementById('entry-kind-trigger')).right) }; }""")
            check('Add entry (229:18166): Save entry on the right, "Click to upload" 14/16, date Label/Medium 16/24 after a 24px Calendar, Category | Sub-category 16 apart',
                  ae['right'] == 0 and ae['link'] == ['14px', '16px'] and ae['date'] == ['16px', '24px'] and ae['cal'] == 24 and ae['gap'] == 16, ae)
            await pg.fill('#entry-desc', 'ZZTOP-PLAINTEXT-MARKER')
            await dd_pick(pg, 'entry-cat', 'Habitation')
            n_items = await pg.evaluate("document.querySelectorAll('#entry-item option[value]:not([value=\"\"])').length")
            check('a category with several sub-categories selects none by itself', n_items > 1 and await pg.eval_on_selector('#entry-item', 'e => e.value') == '', n_items)
            await dd_pick(pg, 'entry-item', 'Rent or mortgage')
            await pg.fill('#entry-amount', '777.5'); await pg.click('#entry-submit'); await pg.wait_for_timeout(600)
            st = state()
            check('manual entry stored (1 entries row)', len([r for r in st['rows'] if r['collection'] == 'entries']) == 1)
            check('no plaintext in stored rows', 'ZZTOP' not in json.dumps(st['rows']) and '777.5' not in json.dumps(st['rows']) and '777,5' not in json.dumps(st['rows']))
            await pg.reload(); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(700)
            body = await pg.inner_text('body')
            check('entry visible after reload (decrypted, totals updated)', '777,50' in body)

            # 2b. an imported spreadsheet cell with a note shows as a base line + the note's sub-lines
            ym = await pg.evaluate("[String(new Date().getFullYear()), new Date().getMonth()]")
            hdr = {'origin': BASE, 'x-requested-with': 'costs-tracker'}
            # the account made by the sign-in steps test is blocked, so it doesn't sit in the admin's approvals
            await admin_ctx.request.post(BASE + '/api/admin/users/u-' + 'newbie@example.com'.encode().hex()[:24] + '/block', headers=hdr)
            r = await admin_ctx.request.post(BASE + '/api/db/entries', headers=hdr, data={
                'year': ym[0], 'monthIndex': ym[1], 'type': 'expense', 'group': 'Fixed', 'category': 'Habitation', 'item': 'Note test item',
                'description': 'Imported', 'amount': 100, 'date': ym[0] + '-01-01', 'note': 'Alpha shop\nBeta shop (5/3)', 'realAmounts': [60, 40]})
            check('imported entry with note accepted', r.status in (200, 201), r.status)
            await pg.reload(); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(700)
            row = pg.locator('.bd-row', has_text='Note test item').first
            check('note item row visible', await row.count() == 1)
            await row.locator('.note-count').click(); await pg.wait_for_timeout(200)
            tip = await pg.inner_text('#note-tip')
            check('note tip: base line + both sub-lines with real amounts', 'From your spreadsheet' in tip and 'Alpha shop' in tip and 'Beta shop' in tip and '60,00' in tip and '40,00' in tip and 'Imported' not in tip, tip)
            check('note tip: badge counts the 2 note lines', (await row.locator('.note-count').inner_text()).strip() == '2')
            before = await pg.evaluate("(() => { const r = document.getElementById('note-tip').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })()")
            await row.locator('.note-count').click(); await pg.wait_for_timeout(30)
            during = await pg.evaluate("(() => { const t = document.getElementById('note-tip'), r = t.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), getComputedStyle(t).position]; })()")
            check('closing the entries tooltip fades it out where it was (no jump into the page)', during[:2] == before and during[2] == 'fixed', [before, during])
            await row.locator('.note-count').click(); await pg.wait_for_timeout(200)
            # Entry counter (Pressed) and Entries tooltip against the design system (nodes 146:5252, 144:4426)
            t = await pg.evaluate("""() => { const cs = e => getComputedStyle(e), r = e => e.getBoundingClientRect(), q = (a, s) => a.querySelector(s);
                const b = document.querySelector('.note-count.is-open'), tip = document.getElementById('note-tip'), it = q(tip, '.tip-item'), name = q(it, '.tip-name'), date = q(tip, '.tip-item .tip-date'),
                      amt = q(it, '.tip-amount'), del = q(tip, '.tip-del'), dot = q(it, '.tip-dot');
                const tb = r(tip), bb = r(b);
                return { badge: b && { h: r(b).height, pad: cs(b).padding, bg: cs(b).backgroundColor, font: [cs(b).fontSize, cs(b).fontWeight, cs(b).lineHeight, cs(b).letterSpacing], fam: cs(b).fontFamily.split(',')[0], ml: cs(b).marginLeft, gap: (() => { const n = b.parentElement && b.parentElement.querySelector('.n, .meter-name, .bd-item-name'); return n && n !== b ? Math.round(bb.left - r(n).right) : null; })() },
                         tip: { radius: cs(tip).borderRadius, pad: cs(tip).padding, bg: cs(tip).backgroundColor, shadow: cs(tip).boxShadow, w: tb.width },
                         gapX: tb.left - bb.right, kept: tb.bottom >= innerHeight - 24 || tb.top <= 24, midDy: (tb.top + tb.height / 2) - (bb.top + bb.height / 2),
                         item: { h: r(it).height, gap: cs(it).columnGap, rgap: cs(q(it, '.tip-right')).columnGap, dot: [r(dot).width, r(dot).height] },
                         name: [cs(name).fontSize, cs(name).fontWeight, cs(name).lineHeight, cs(name).color], date: date ? [cs(date).fontSize, cs(date).fontWeight, cs(date).color, cs(date).lineHeight, cs(date).letterSpacing] : null,
                         amt: [cs(amt).fontFamily.split(',')[0], cs(amt).fontSize, cs(amt).fontWeight, cs(amt).letterSpacing], euro: !!q(amt, '.money-ic svg'),
                         del: del && { w: r(del).width, h: r(del).height, svg: [r(q(del, 'svg')).width, r(q(del, 'svg')).height], vb: q(del, 'svg').getAttribute('viewBox'), color: cs(del).color } }; }""")
            check('counter (146:5256, Oct 8): 14px pill, 4 each side, counter-pressed background while its tooltip is open',
                  t['badge'] and t['badge']['h'] == 14 and t['badge']['pad'] == '0px 4px' and t['badge']['bg'] == 'rgb(31, 30, 25)', t['badge'])
            check('counter text (146:5256, Oct 8): Martian Mono Label/Tiny 10px, -4%', t['badge']['font'][0] == '10px' and t['badge']['font'][3] == '-0.4px' and 'Martian Mono' in t['badge']['fam'], t['badge'])
            check('tooltip (146:5252, Oct 3): dark surface, radius 16, padding 16/8/16/16, 320 wide, no shadow', t['tip']['bg'] == 'rgb(22, 21, 15)' and t['tip']['radius'] == '16px' and t['tip']['pad'] == '16px 8px 16px 16px' and t['tip']['w'] == 320 and t['tip']['shadow'] == 'none', t['tip'])
            check('tooltip opens beside the counter, 4px away, centred on it (or kept inside the window)', abs(t['gapX'] - 4) < 0.6 and (abs(t['midDy']) < 9 or t['kept']), [t['gapX'], t['midDy'], t['kept']])
            check('tooltip entry (144:4426, Oct 3): 24px row, 8 apart (also between amount and remove), 12px dot', t['item']['h'] >= 24 and t['item']['gap'] == '8px' and t['item']['rgap'] == '8px' and t['item']['dot'] == [12, 12], t['item'])
            check('tooltip entry text (144:4426, Oct 9): name 16/20 Medium text/white, date 14/16 Medium text/muted, on every screen', t['name'] == ['16px', '400', '20px', 'rgb(255, 255, 255)'] and t['date'] is not None and t['date'] == ['14px', '400', 'rgb(150, 146, 132)', '16px', '-0.28px'], [t['name'], t['date']])
            check('tooltip amount (144:4426, Oct 3): 16px Euro + Value/Medium (mono 12/400/-4% on desktop)', t['euro'] and 'Mono' in t['amt'][0] and t['amt'][1:] == ['12px', '400', '-0.48px'], t['amt'])
            check('tooltip remove (144:4426): Micro round button (24) with the 12px X, action/disable', t['del'] and t['del']['w'] == 24 and t['del']['h'] == 24 and t['del']['svg'] == [12, 12] and t['del']['vb'].endswith(' 12 12') and t['del']['color'] == 'rgb(150, 146, 132)', t['del'])
            await pg.keyboard.press('Escape'); await pg.mouse.click(5, 5)
            # Oct 3 (124:3667, 663:935): every Tracker row ends with a Micro Actions button; its menu names the row and offers "Add entry"
            mrow = pg.locator('#itemslist .bd-row').first
            mname = (await mrow.locator('.bd-item-name').evaluate("e => e.firstChild.textContent")).strip()
            rb = await mrow.locator('.br-more').evaluate("e => { const r = e.getBoundingClientRect(); return [r.width, r.height, e.querySelector('svg').getAttribute('data-icon')]; }")
            check('Tracker row (124:3667): Micro Tertiary round button (24) with the Actions icon', rb == [24, 24, 'actions'], rb)
            await mrow.locator('.br-more').click(); await pg.wait_for_timeout(100)
            menu = await pg.evaluate("""() => { const m = document.querySelector('#itemslist .row-menu'); if (!m) return null; const cs = getComputedStyle(m);
                return { desc: m.querySelector('.ds-dd-desc').textContent, items: [...m.querySelectorAll('.ds-dd-item')].map(e => e.textContent), pad: cs.padding, gap: cs.rowGap, icon: m.querySelector('.ds-dd-item svg').getAttribute('data-size') }; }""")
            check('row menu (Dropdown-list/Actions 663:935): the row name as description, "Add entry", 16px icons', menu and menu['desc'] == mname and menu['items'][0] == 'Add entry' and menu['icon'] == '16', menu)
            await pg.locator('#itemslist .row-menu .row-add').click(); await pg.wait_for_timeout(400)
            picked = await pg.evaluate("() => document.querySelector('#add-panel.open') && document.getElementById('entry-item-trigger') ? document.getElementById('entry-item-trigger').textContent.trim() : null")
            check('"Add entry" opens the Add entry panel with that type picked', picked == mname, [picked, mname])
            await pg.click('#entry-close-btn'); await pg.wait_for_timeout(400)

            # 2c. years list: newest first, and a duplicated year label appears once
            for y in ('2031', '2029', '2030', '2030'):
                await admin_ctx.request.post(BASE + '/api/db/years', headers=hdr, data={'year': y, 'currency': 'EUR', 'createdAt': '2026-01-01T00:00:00.000Z'})
            await pg.reload(); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(700)
            labels = [t.strip() for t in await pg.locator('.year-btn').all_inner_texts()]
            check('years listed newest first (as designed), each label once', labels[:3] == ['2031', '2030', '2029'] and labels.count('2030') == 1, labels)

            # 2b. main page against the Cost-tracker designs (node 2:2)
            d = await pg.evaluate("""() => { const cs = e => getComputedStyle(e), q = s => document.querySelector(s);
                const col = s => cs(q(s)).backgroundColor, tok = n => cs(document.documentElement).getPropertyValue(n).trim();
                return { radius: cs(q('.balance-card')).borderRadius, kpiR: cs(q('.mini-kpi')).borderRadius,
                         cols: cs(q('.ticker-strip')).gridTemplateColumns.split(' ').length, segBg: col('.seg-tabs'), tag: [cs(q('.insight-tag')).borderRadius, col('.insight-tag')],
                         allocBar: cs(q('.alloc-bar')).width, allocGap: cs(q('.alloc-bars')).columnGap, monthsPad: cs(q('.months')).paddingLeft,
                         swatches: [...document.querySelectorAll('.legend .swatch')].map(e => cs(e).backgroundColor),
                         euro: !!q('.mini-kpi .money-ic svg'), tokens: [tok('--group-fixed'), tok('--group-variable'), tok('--group-extra'), tok('--group-additional'), tok('--chart-invest')] }; }""")
            check('cards are radius 20, KPI cards 16', d['radius'] == '20px' and d['kpiR'] == '16px', d)
            check('expense cards sit four across', d['cols'] == 4, d)
            bw = await pg.evaluate("() => [...document.querySelectorAll('.card, .mini-kpi, .ticker-item')].map(e => getComputedStyle(e).borderTopWidth + ' ' + getComputedStyle(e).borderLeftStyle)")
            check('dashboard cards, KPI boxes and expense cards have no border', len(bw) >= 8 and all(x == '0px none' for x in bw), bw)
            gp = await pg.evaluate("() => { const g = s => getComputedStyle(document.querySelector(s)); return [g('.row1').columnGap, g('.hero-left').rowGap, g('.hero-right').rowGap, g('.yoy').columnGap, g('.mini-grid').columnGap, g('.mini-grid').rowGap, g('.ticker-strip').columnGap]; }")
            check('cards, KPI boxes and Expense cards space/md apart (12 on desktop, Ongatu 211:18753)', gp == ['12px'] * 7, gp)
            # phones (Ongatu 342:7993, 369:12607)
            mp = await admin_ctx.new_page(); await mp.set_viewport_size({'width': 390, 'height': 844})
            await mp.goto(BASE + '/'); await mp.wait_for_selector('#user-nav'); await mp.wait_for_timeout(900)
            mo = await mp.evaluate("""() => { const q = s => document.querySelector(s), r = s => q(s).getBoundingClientRect(), vis = s => !!q(s) && getComputedStyle(q(s)).display !== 'none';
                const cards = ['.balance-card', '.mini-grid', '.breakdown-card', '.alloc-card', '.hero-chart', '.glance-card'].map(s => Math.round(r(s).top));
                return { header: [r('#app-header').height, Math.round(r('.ds-app-header-logo svg').width)], user: vis('.ds-user'), bell: vis('#notif-btn'), add: vis('#tracker-add-btn'), nav: vis('#mobile-nav'),
                         ticker: vis('.ticker-strip'), side: Math.round(r('.balance-card').left), title: getComputedStyle(q('.app-title')).fontSize, cards, scrollW: document.documentElement.scrollWidth,
                         pill: [Math.round(r('.ds-mnav-pill').width), Math.round(r('#mnav-home').height)], home: q('#mnav-home').getAttribute('aria-current'), seg: [...document.querySelectorAll('#breakdown-top-seg button')].map(b => b.textContent) }; }""")
            check('phone: 64px header with a 32px logo and the bell, no user menu; 16px sides; 32px title (Display/Title-mobile, Oct 3); no sideways scroll',
                  mo['header'] == [64, 32] and not mo['user'] and mo['bell'] and mo['side'] == 16 and mo['title'] == '32px' and mo['scrollW'] <= 390, mo)
            check('phone: Balance, KPIs, Tracker, Expense allocation, chart, At a glance, in that order; no Expense cards; Add is in the bottom nav',
                  mo['cards'] == sorted(mo['cards']) and not mo['ticker'] and not mo['add'] and mo['nav'] and mo['seg'] == ['Incomes', 'Save/Invest', 'Expenses'], mo)
            check('phone: bottom nav (378:673) full-width 366 pill (12px from the edges), 56 high items, Home selected', mo['pill'] == [366, 56] and mo['home'] == 'page', mo)
            await mp.evaluate("window.scrollTo(0, 600)"); await mp.wait_for_timeout(300)
            st2 = await mp.evaluate("() => [Math.round(document.querySelector('#app-header').getBoundingClientRect().top), Math.round(document.querySelector('.actions-wrap').getBoundingClientRect().top)]")
            check('phone: scrolled, the header turns Surface=App Small (48) and the year/month nav sticks under it (369:12607)', st2 == [0, 48], st2)
            await mp.evaluate("window.scrollTo(0, 0)"); await mp.wait_for_timeout(150)
            ms = await mp.evaluate("""() => { const m = document.getElementById('months'), s = m.querySelector('.month-btn[aria-pressed="true"]'), mr = m.getBoundingClientRect(), sr = s.getBoundingClientRect(),
                  pad = parseFloat(getComputedStyle(m).paddingLeft), max = m.scrollWidth - m.clientWidth, yb = document.querySelector('.year-btn');
                return { over: m.classList.contains('is-overflow'), scroll: Math.round(m.scrollLeft), want: Math.round(Math.min(s.offsetLeft - pad, max)), visible: sr.left >= mr.left + pad - 1 && sr.right <= mr.right + 1,
                         endRoom: m.style.paddingRight, atEnd: !m.classList.contains('more-right'), labels: [...m.querySelectorAll('.month-btn')].map((b) => b.innerText),
                         year: [getComputedStyle(yb).fontSize, getComputedStyle(yb).lineHeight] }; }""")
            check('phone (699:11387 / 699:11765): the month row scrolls and opens on the selected month, as far left as it goes (no space after Dec), labels Jan, Feb, Mar…; year tabs Label/Large 18/20',
                  ms['over'] and abs(ms['scroll'] - ms['want']) <= 1 and ms['visible'] and ms['endRoom'] == '' and ms['labels'][:3] == ['Jan', 'Feb', 'Mar'] and ms['year'] == ['18px', '20px'], ms)
            await mp.click('#notif-btn'); await mp.wait_for_selector('.ds-notif-page')
            np_ = await mp.evaluate("""() => { const q = s => document.querySelector(s), r = e => e.getBoundingClientRect(), cs = e => getComputedStyle(e);
                const pg = q('.ds-notif-page'), nav = q('.ds-notif-page-nav'), t = q('.ds-notif-page-title'), list = q('.ds-notif-page-list'), it = list.querySelector('.ds-notif-item');
                return { page: [Math.round(r(pg).width), Math.round(r(pg).height), cs(pg).backgroundColor], nav: [r(nav).height, cs(nav).paddingLeft, Math.round(r(q('#notif-back')).width)],
                         title: [cs(t).fontSize, cs(t).fontWeight, cs(t).lineHeight], list: [cs(list).rowGap, cs(list).paddingLeft, Math.round(r(list).top - r(nav).bottom)], itemX: it ? Math.round(r(it).left) : null }; }""")
            check('phone: the bell opens the Notifications page (407:905): full screen, 64 bar, back 36 (audit D4), Heading/Large 20/400/24, items 12 apart at 16',
                  np_['page'][:2] == [390, 844] and np_['page'][2] == 'rgb(255, 255, 255)' and np_['nav'] == [64, '8px', 36] and np_['title'] == ['20px', '400', '24px'] and np_['list'] == ['12px', '16px', 16] and np_['itemX'] == 16, np_)
            await mp.click('#notif-back'); await mp.wait_for_timeout(200)
            check('phone: the back arrow closes the Notifications page', await mp.locator('.ds-notif-page').count() == 0)
            # Mobile Create year (703:17437 -> 703:16128, Oct 4)
            await mp.click('#year-add-toggle'); await mp.wait_for_selector('#year-modal[open]'); await mp.wait_for_timeout(300)
            yrm = await mp.evaluate("""() => { const m = document.getElementById('year-modal'), il = m.querySelector('.ds-illustration');
                return { art: il && il.dataset.illustration, w: il && Math.round(il.getBoundingClientRect().width), title: m.querySelector('.ds-modal-title').textContent,
                         labels: [...m.querySelectorAll('.fld-label')].map(l => l.textContent), year: document.getElementById('year-modal-year-trigger').textContent.trim(),
                         cur: document.getElementById('year-modal-currency-trigger').textContent.trim(), pill: document.getElementById('year-add-panel').classList.contains('open') }; }""")
            rad = await mp.evaluate("() => getComputedStyle(document.getElementById('year-modal')).borderRadius")
            check('phone modals have 48px corners (DS 443:1485, Oct 4)', rad == '48px', rad)
            check('phone: the year + opens "Set up a new year" (Calendar 97 wide, Year + Currency, next free year picked, €), not the pill',
                  yrm['art'] == 'calendar' and yrm['w'] == 97 and yrm['title'] == 'Set up a new year' and yrm['labels'] == ['Year', 'Currency'] and yrm['year'].isdigit() and yrm['cur'] == '€' and not yrm['pill'], yrm)
            await mp.click('#year-modal-next'); await mp.wait_for_selector('#budget-panel.open'); await mp.wait_for_timeout(500)
            yp = await mp.evaluate("""() => ({ modal: !!document.querySelector('#year-modal[open]'), title: document.getElementById('budget-panel-title').textContent,
                hint: document.getElementById('budget-panel-hint').textContent, x: Math.round(document.getElementById('budget-panel').getBoundingClientRect().left),
                group: (document.querySelector('label[for="budget-new-group"]') || {}).textContent, link: (document.getElementById('budget-create-group') || {}).textContent })""")
            check('phone: Next closes the modal and slides in the Year budget panel with the 703:16128 copy',
                  not yp['modal'] and yp['title'].endswith('/ Starting budget') and yp['hint'].startswith('This baseline budget uses your past 12 months') and yp['x'] == 0
                  and (yp['group'] is None or (yp['group'] == 'Group name (Optional)' and yp['link'].strip() == 'Add group')), yp)
            await mp.click('#budget-close-btn'); await mp.wait_for_timeout(400)
            await mp.click('#mnav-add'); await mp.wait_for_timeout(500)
            check('phone: the bottom nav + opens Add an entry', await mp.locator('#add-panel.open').count() == 1)
            await mp.close()
            check('Segments sit on surface/secondary, tags are round Label chips (radius/full since Oct 2)', d['segBg'] == 'rgb(239, 238, 229)' and d['tag'] == ['999px', 'rgb(239, 238, 229)'], d)
            check('allocation bars are 48 wide, space/md apart (12 on desktop)', d['allocBar'] == '48px' and d['allocGap'] == '12px', d)
            al = await pg.evaluate("() => { const m = document.getElementById('months'), sl = m.scrollLeft; m.scrollLeft = 0; const r = [Math.round(document.querySelector('.year-btn').getBoundingClientRect().left), Math.round(m.querySelector('.month-btn').getBoundingClientRect().left)]; m.scrollLeft = sl; return r; }")
            check('the first month starts exactly under the first year tab (Oct 4)', al[0] == al[1], [d['monthsPad'], al])
            if await pg.locator('#tracker-menu-btn').count():
                await pg.click('#tracker-menu-btn'); await pg.wait_for_selector('#tracker-menu')
                da = await pg.evaluate("() => { const m = document.getElementById('tracker-menu'), i = m.querySelector('.ds-dd-item'), c = getComputedStyle(m), ci = getComputedStyle(i); return [Math.round(m.getBoundingClientRect().width), c.paddingTop, c.borderTopLeftRadius, Math.round(i.getBoundingClientRect().height), ci.fontSize, ci.lineHeight]; }")
                check('desktop action menus (Okara audit Oct 8): 242 wide, padding 12, radius 16, 36-high items in Label/Small 16/20', da == [242, '12px', '16px', 36, '16px', '20px'], da)
                await pg.click('#tracker-menu-btn'); await pg.wait_for_selector('#tracker-menu', state='detached'); await pg.wait_for_selector('.month-btn')
            check('chart legend matches the lines: indigo, pink, lime', d['swatches'] == ['rgb(79, 70, 229)', 'rgb(227, 2, 159)', 'rgb(205, 217, 54)'], d)
            check('data colours come from the Color variables (purple, light blue, orange, pink, lime)', [x[:7] if len(x) == 9 and x.endswith('ff') else x for x in d['tokens']] == ['#4b0fa5', '#1dc0bb', '#ffba3a', '#e3029f', '#cdd936'], d)
            check('money figures carry the Euro icon', d['euro'], d)
            await pg.wait_for_selector('.month-btn:not(.estimated)')
            mb = await pg.evaluate("() => { const b = document.querySelector('.month-btn:not(.estimated)'), c = getComputedStyle(b); return [c.fontSize, c.fontWeight, c.lineHeight, c.letterSpacing, c.height, c.paddingLeft, c.textTransform]; }")
            check('month selector (4:171, Oct 2, Desktop): Label/Small 14/400/16 -2%, 20 high (space/tn round the text), space/sm sides, Jan..Dec as in the Oct 3 desktop frames', mb == ['14px', '400', '16px', '-0.28px', '20px', '8px', 'none'], mb)

            # 2c. the Sept 22 DS pull and the dashboard changes (Cost-tracker 2:2, 52:3443, 171:13746)
            n = await pg.evaluate("""() => { const cs = e => getComputedStyle(e), q = s => document.querySelector(s), all = s => [...document.querySelectorAll(s)];
                const tiles = all('#mini-kpis .mini-kpi'), lab = q('.mini-kpi .label'), tag = q('.insight-tag'), nm = q('.ticker-item .ti-name'), d = q('.hc-delta');
                const fig = e => [cs(e).fontSize, cs(e).fontWeight, cs(e).lineHeight, cs(e).letterSpacing];
                return { gauge: !!q('.gauge-wrap') || !!q('#gauge'), row2: !!q('.row2'), h2s: all('.card h2').map(h => h.textContent.trim()),
                         glance: !!q('.hero-left .glance-card #insight-text'), detail: tiles[2] && tiles[2].querySelector('.detail') ? tiles[2].querySelector('.detail').textContent : null,
                         detailStyle: tiles[2] && tiles[2].querySelector('.detail') ? [cs(tiles[2].querySelector('.detail')).fontFamily.includes('Mono'), ...fig(tiles[2].querySelector('.detail')).slice(0, 2), cs(tiles[2].querySelector('.detail')).letterSpacing, cs(tiles[2].querySelector('.detail')).color, cs(tiles[2].querySelector('.detail')).marginTop] : null,
                         noDetail: !tiles[0].querySelector('.detail') && !tiles[1].querySelector('.detail'),
                         label: fig(lab), tag: fig(tag).concat([cs(tag).height, cs(tag).paddingLeft, cs(tag).borderRadius]), name: fig(nm), segR: cs(q('.seg-tabs')).borderRadius,
                         delta: d ? { h: cs(d).height, r: cs(d).borderRadius, pad: cs(d).paddingLeft, font: fig(d), svg: d.querySelector('svg') ? [d.querySelector('svg').getBoundingClientRect().width, d.querySelector('svg').getBoundingClientRect().height] : null, cls: d.className, bg: cs(d).backgroundColor, label: d.getAttribute('aria-label') } : null };
            }""")
            check('Savings rate card is gone (no gauge, no second row); At a glance sits under Expense allocation', not n['gauge'] and not n['row2'] and 'Savings rate' not in n['h2s'] and n['glance'], n)
            check('Savings/Investments tile carries the rate: Value/Small (11/400/-4% on desktop), text/secondary, right under the value (the card gap); Incomes and Expenses carry "↑ details" (Sept 28)',
                  n['detail'] is not None and (n['detail'] == 'No income recorded' or (' rate - ' in n['detail'] and ' saved of ' in n['detail'])) and not n['noDetail'] and n['detailStyle'] == [True, '11px', '400', '-0.44px', 'rgb(116, 113, 103)', '0px'], n)
            check('KPI and Expense card names (Oct 2): Heading/Medium (14/400/14 -2% on desktop), sentence case', n['label'] == ['14px', '400', '14px', '-0.28px'] and n['name'] == ['14px', '400', '14px', '-0.28px'], n)
            check('Label chip (211:859, Oct 2): Label/Tiny, 24 high, space/xs sides (4 on desktop), radius/full', n['tag'] == ['12px', '400', '14px', '-0.24px', '24px', '4px', '999px'], n['tag'])
            check('Segments container radius is 8', n['segR'] == '8px', n['segR'])
            check('chart delta is a Label with a 12px sign icon',
                  n['delta'] and n['delta']['h'] == '24px' and n['delta']['r'] == '999px' and n['delta']['pad'] == '4px' and n['delta']['svg'] == [12, 12] and n['delta']['font'] == ['12px', '400', '14px', '-0.24px']
                  and n['delta']['bg'] in ('rgb(227, 244, 236)', 'rgb(255, 196, 198)') and ('since' in (n['delta']['label'] or '')), n['delta'])
            tv = await pg.evaluate("""() => { const cs = e => getComputedStyle(e), host = document.body, out = {};
                for (const t of ['success', 'fail', 'neutral']){
                  const el = document.createElement('div'); el.className = 'ds-toast visible ' + t; el.innerHTML = '<span class="ds-toast-strip"></span><span class="ds-toast-msg">Saved</span><button class="round-btn micro ds-toast-close"></button>'; host.appendChild(el);
                  const c = cs(el), st = el.children[0], m = cs(el.children[1]); const r = el.getBoundingClientRect();
                  out[t] = { bg: c.backgroundColor, font: [m.fontSize, m.fontWeight, m.lineHeight, m.letterSpacing, m.color], gap: c.columnGap, h: r.height, w: r.width, r: c.borderRadius, padR: c.paddingRight, top: r.top, right: innerWidth - r.right, strip: [st.getBoundingClientRect().width, st.getBoundingClientRect().height, cs(st).backgroundColor], close: [el.children[2].getBoundingClientRect().width] };
                  el.remove(); }
                return out; }""")
            check('Toast (DS 304:659, Oct 3, Desktop): surface/dark, Body/Medium/Medium (12/400/14) white, space/md gap and right padding (12), hugs a Micro close (24, Mobile tokens) between space/md (56 high, as in Figma), 240 wide at least, radius 8',
                  all(tv[k]['bg'] == 'rgb(22, 21, 15)' and tv[k]['font'] == ['12px', '400', '14px', '-0.24px', 'rgb(255, 255, 255)'] and tv[k]['gap'] == '12px' and tv[k]['h'] == 56 and tv[k]['w'] >= 240 and tv[k]['r'] == '8px' and tv[k]['padR'] == '12px' and tv[k]['close'] == [24] for k in tv), tv)
            check('Toast strip: 16px, full height; Positive brand/mint, Negative data/red, Neutral surface/tertiary',
                  all(tv[k]['strip'][:2] == [16, 56] for k in tv) and [tv[k]['strip'][2] for k in ('success', 'fail', 'neutral')] == ['rgb(19, 208, 117)', 'rgb(189, 0, 7)', 'rgb(116, 113, 103)'], tv)
            check('Toast sits top-right (Ongatu 238:7184): 24px from the right, 116 from the top', all(abs(tv[k]['top'] - 116) < 1 and abs(tv[k]['right'] - 24) < 1 for k in tv), tv)
            sz = await pg.evaluate("""() => { const out = {}; const host = document.body;
                for (const z of ['md', 'sm', 'tiny']) { const w = document.createElement('div'); w.className = 'ds-dd ds-dd--' + z; w.innerHTML = '<button class="ds-dd-trigger"><span class="ds-dd-label">A</span></button>'; host.appendChild(w);
                  const t = w.firstChild, c = getComputedStyle(t); out['dd-' + z] = [t.getBoundingClientRect().height, c.paddingLeft, c.fontSize, c.fontWeight, c.lineHeight]; w.remove(); }
                for (const z of ['', 'small', 'tiny']) { const w = document.createElement('span'); w.className = 'ds-input ' + z; w.innerHTML = '<input value="A">'; host.appendChild(w);
                  const c = getComputedStyle(w), i = getComputedStyle(w.firstChild); out['in-' + (z || 'medium')] = [w.getBoundingClientRect().height, c.paddingLeft, i.fontSize, i.fontWeight, i.lineHeight]; w.remove(); }
                return out; }""")
            # Desktop mode (Sept 29): Medium hugs space/sm round the 24px icon slot (40), sides space/md (12, minus the 1px border);
            # Small fixed 40 with space/xs; Tiny hugs space/xs round 16 (24). Body/Large/Medium 14/16, Tiny Body/Medium/Medium 12/14.
            # Oct 2: every size hugs its padding round the icon-size slot: Medium space/sm round xl (32 on desktop), Small and
            # Tiny space/xs round xl / md (24). Dropdowns write Label/Large (18/600/16 on desktop), inputs Body/Large/Medium, Tiny Label/Tiny.
            # Oct 3: Input, Dropdown and dropdown-item always use the Mobile tokens; Medium and Small write Label/Medium at 400 (16/400/24), Tiny Label/Tiny.
            check('Dropdown sizes (71:1096, Oct 3, Mobile tokens everywhere): Medium 48 / 16 Label/Medium, Small 36 / 8 Label/Small, Tiny 32 / 8 Label/Tiny (Oct 3 re-read)',
                  sz['dd-md'] == [48, '15px', '16px', '400', '24px'] and sz['dd-sm'] == [36, '7px', '16px', '400', '20px'] and sz['dd-tiny'] == [32, '7px', '14px', '400', '16px'], sz)
            check('Input sizes (Okara audit Oct 8: Surface/Mobile at every width): Medium 48, Label/Medium 16/24; Small 36; Tiny 32',
                  sz['in-medium'] == [48, '15px', '16px', '400', '24px'] and sz['in-small'] == [36, '7px', '16px', '400', '20px'] and sz['in-tiny'] == [32, '7px', '14px', '400', '16px'], sz)
            st = await pg.evaluate("""() => { const host = document.body, mk = (h) => { const w = document.createElement('div'); w.innerHTML = h; host.appendChild(w); return w; };
                const e = mk('<span class="ds-input"><input placeholder="Label"></span>'), f = mk('<span class="ds-input"><input placeholder="Label" value="Felipe"></span>'),
                      de = mk('<div class="ds-dd ds-dd--md is-empty"><button class="ds-dd-trigger">Select</button></div>'), df = mk('<div class="ds-dd ds-dd--md"><button class="ds-dd-trigger">Rent</button></div>'),
                      dd = mk('<div class="ds-dd ds-dd--md is-disabled"><button class="ds-dd-trigger" disabled>Select</button></div>');
                const bc = (w, s) => getComputedStyle(w.querySelector(s)).borderTopColor, col = (w, s) => getComputedStyle(w.querySelector(s)).color;
                const out = { inEmpty: bc(e, '.ds-input'), inFilled: bc(f, '.ds-input'), ddEmpty: [bc(de, '.ds-dd-trigger'), col(de, '.ds-dd-trigger')], ddFilled: [bc(df, '.ds-dd-trigger'), col(df, '.ds-dd-trigger')], ddDisabled: col(dd, '.ds-dd-trigger'),
                              ph: getComputedStyle(e.querySelector('input'), '::placeholder').fontWeight };
                [e, f, de, df, dd].forEach((w) => w.remove()); return out; }""")
            check('Empty = border/default + text/secondary; Filled = border/selected-item + text/primary; Disable text = text/muted',
                  st['inEmpty'] == 'rgb(203, 202, 197)' and st['inFilled'] == 'rgb(144, 138, 246)' and st['ddEmpty'] == ['rgb(203, 202, 197)', 'rgb(116, 113, 103)']
                  and st['ddFilled'] == ['rgb(144, 138, 246)', 'rgb(22, 21, 15)'] and st['ddDisabled'] == 'rgb(150, 146, 132)', st)
            yd = await pg.evaluate("""() => { const cs = e => getComputedStyle(e), tab = document.createElement('div'); tab.className = 'year-tab'; tab.style.cssText = 'position:relative;width:48px;height:32px;margin:40px';
                tab.innerHTML = '<button class="year-btn">2031</button><button class="year-del-btn" aria-label="Delete"><svg data-icon="x" viewBox="0 0 10 10" width="10" height="10"></svg></button>'; document.body.appendChild(tab);
                const b = tab.querySelector('.year-del-btn'), c = cs(b), tr = tab.getBoundingClientRect(), br = b.getBoundingClientRect(), o = { size: [br.width, br.height], dx: br.left - tr.left, dy: br.top - tr.top, bg: c.backgroundColor, r: c.borderRadius, svg: [cs(b.firstChild).width, cs(b.firstChild).height] };
                tab.remove(); return o; }""")
            check('Year tab delete = Micro round button: 14px, dark, 10px X, at x 41 / y -4 of a 48 x 32 tab (DS 53:801)', yd['size'] == [14, 14] and yd['bg'] == 'rgb(22, 21, 15)' and yd['r'] == '999px' and yd['svg'] == ['10px', '10px'] and abs(yd['dx'] - 41) < 0.6 and abs(yd['dy'] + 4) < 0.6, yd)

            # 2c. Sept 24 adjustments: sub-types only under Expenses; every item of the year listed, 0,00 when empty
            await pg.keyboard.press('Escape'); await pg.mouse.click(5, 5)
            await pg.click('#breakdown-top-seg button[data-v=Income]'); await pg.wait_for_timeout(200)
            check('Tracker: Income shows no sub-types', not await pg.is_visible('#breakdown-group-seg'))
            await pg.click('#breakdown-top-seg button[data-v=Investments]'); await pg.wait_for_timeout(200)
            check('Tracker: Savings/Investments shows no sub-types', not await pg.is_visible('#breakdown-group-seg'))
            await pg.click('#breakdown-top-seg button[data-v=Expenses]'); await pg.wait_for_timeout(200)
            check('Tracker: Expenses shows the sub-types', await pg.is_visible('#breakdown-group-seg'))
            zeros = await pg.evaluate("[...document.querySelectorAll('#itemslist .bd-row')].filter(r => /(^|\\s)0,00$/.test(r.querySelector('.n').textContent.trim())).length")
            check('Tracker: items without entries are listed at 0,00', zeros > 0, zeros)

            # 3. CSV reading via the server-side reader
            await open_panel(pg)
            check('upload dropzone enabled', not await pg.evaluate("document.getElementById('dropzone').classList.contains('is-off')"))
            await pg.set_input_files('#file-input', [os.path.join(FIX, 'statement.csv')]); await pg.wait_for_timeout(300)
            di = await pg.evaluate("""() => { const cs = e => getComputedStyle(e), r = e => e.getBoundingClientRect(), it = document.querySelector('.doc-item'), b = it.querySelector('.doc-remove'), sv = b.querySelector('svg');
                return { icon: (it.querySelector('.doc-ic svg').dataset.icon === 'document' || (!!window.ICON_LIB && it.querySelector('.doc-ic path').getAttribute('d') === window.ICON_LIB.document.d)), ic: [r(it.querySelector('.doc-ic svg')).width, r(it.querySelector('.doc-ic svg')).height],
                         btn: [r(b).width, r(b).height], svg: [r(sv).width, r(sv).height], vb: sv.getAttribute('viewBox'), color: cs(b).color, radius: cs(b).borderRadius, meta: it.querySelector('.doc-meta').textContent }; }""")
            check('file list (229:18169): a CSV shows the Document icon (16px on desktop); delete = Tiny Tertiary round button (32) with the 12px X in surface/dark; "1KB ⋅ Ready"',
                  di['icon'] and di['ic'] == [16, 16] and di['btn'] == [32, 32] and di['svg'] == [12, 12] and di['vb'].endswith(' 12 12') and di['color'] == 'rgb(22, 21, 15)' and di['radius'] == '999px' and di['meta'].endswith(' ⋅ Ready'), di)
            ad = await pg.evaluate("() => ({ cancel: !!document.getElementById('doc-cancel'), icon: !!document.querySelector('#doc-add svg'), gap: Math.round(document.getElementById('doc-actions').getBoundingClientRect().top - document.getElementById('doc-list').getBoundingClientRect().bottom) })")
            check('files (229:18169): only "Add files" (no icon, no Cancel), 24 under the list', not ad['cancel'] and not ad['icon'] and ad['gap'] == 24, ad)
            await pg.click('#doc-add'); await pg.wait_for_selector('#ap-review:not([hidden])', timeout=8000)
            check('CSV: review shows a row from the AI reply', await pg.locator('.rv-row').count() == 1)
            # best-guess category: a reply without "sure" is marked, the status line says so, and Submit is not blocked
            check('reader prompt asks for certainty', '"certainty"' in state()['aiCalls'][-1]['prompt'])
            check('review (229:18717): an unsure category starts its dropdown with Question / Outlined', await pg.locator('#rv-rows .c-cat .ds-dd-lead[data-icon=question-outlined]').count() == 1)
            check('review: the guess note starts with the Question icon', await pg.locator('#rv-status .rv-guess svg[data-icon=question-outlined]').count() == 1)
            check('review: status counts the guess and Submit stays enabled', (await pg.inner_text('#rv-status')).startswith('1 category is a guess') and not await pg.is_disabled('#rv-submit'), await pg.inner_text('#rv-status'))
            g = await pg.evaluate("""() => { const r = e => e.getBoundingClientRect(), row = document.querySelector('#rv-rows .rv-row'), lead = row.querySelector('.c-cat .ds-dd-lead'), v = row.querySelector('.rv-value');
                return { w: r(lead).width, rm: !!row.querySelector('.rv-rm'), value: v && v.textContent, input: !!row.querySelector('.c-amt input'), widths: ['.c-desc', '.c-type', '.c-cat'].map((s) => r(row.querySelector(s)).width), date: getComputedStyle(row.querySelector('.c-date')).color }; }""")
            check('review row (229:18717): 16px guess icon in the dropdown, controls 140 wide, the amount as a value (no input), no remove button, date text/secondary',
                  g['w'] == 16 and not g['rm'] and not g['input'] and (g['value'] or '').strip() == '23,40' and g['widths'] == [140, 140, 140] and g['date'] == 'rgb(116, 113, 103)', g)
            # Oct 3 (229:18167): rows are always open, the Category dropdown is right there
            await pg.click('#rv-rows .rv-row .c-cat .ds-dd-trigger'); await pg.wait_for_selector('.ds-dd-menu')
            await pg.click('.ds-dd-menu .ds-dd-item > span:text-is("Groceries")'); await pg.wait_for_timeout(150)  # the proposed one: confirming it is enough
            await pg.click('#add-panel-title'); await pg.wait_for_timeout(150)
            check('review: choosing a category (even the proposed one) removes the Guess chip and the note', await pg.locator('#rv-rows .ds-dd-lead').count() == 0 and (await pg.inner_text('#rv-status')).strip() == '', [await pg.locator('#rv-rows .ds-dd-lead').count(), await pg.inner_text('#rv-status'), await pg.inner_text('#rv-rows')])
            # a reply that says "sure" is not marked
            await pg.click('#rv-cancel'); await open_panel(pg)
            await pg.set_input_files('#file-input', [os.path.join(FIX, 'certain.csv')]); await pg.wait_for_timeout(300)
            await pg.click('#doc-add'); await pg.wait_for_selector('#ap-review:not([hidden])', timeout=8000)
            check('review: a "sure" category has no Guess icon', await pg.locator('#rv-rows .rv-row').count() == 1 and await pg.locator('#rv-rows .ds-dd-lead').count() == 0)
            # "Month and year" (174:15607): starts on the month of the entry's date; an earlier month is refused, a later one is fine
            rp = await pg.evaluate("""() => { const t = document.getElementById('rv-period-trigger'), r = t.getBoundingClientRect(), l = document.querySelector('label[for="rv-period-trigger"]'); return { label: t.textContent.trim(), w: r.width, h: r.height, cap: l ? l.textContent : null }; }""")
            check('review: Track in is a 200px Medium dropdown (48, 229:18717), on the month of the entry (Sep 2026)', rp['label'] == 'September 2026' and rp['w'] == 200 and rp['h'] == 48 and (rp['cap'] or '').lower() == 'track in', rp)
            await dd_pick(pg, 'rv-period', 'August', '2026')
            rs = await pg.inner_text('#rv-status')
            check('review: an entry dated after the month selected is refused (date in red, message, Submit off)',
                  "match the month and year selected" in rs and await pg.is_disabled('#rv-submit') and await pg.locator('#rv-rows .rv-date.bad').count() == 1, rs)
            await dd_pick(pg, 'rv-period', 'October', '2026')
            rs = await pg.inner_text('#rv-status')
            check('review: a later month is accepted and the status says where the entry will count', not await pg.is_disabled('#rv-submit') and 'will count toward October 2026' in rs and await pg.locator('#rv-rows .rv-date.bad').count() == 0, rs)
            await pg.click('#rv-submit'); await pg.wait_for_timeout(700)
            check('review: the entry is booked in the month picked (toast says Oct 2026)', 'Oct 2026' in await pg.inner_text('#ds-toast'), await pg.inner_text('#ds-toast'))
            check('reviewed row saved as third entry (after the imported note entry)', len([r for r in state()['rows'] if r['collection'] == 'entries']) == 3)
            check('AI got text only for CSV', state()['aiCalls'][-1]['images'] == 0 and 'FAKE SUPERMARKET' in state()['aiCalls'][-1]['prompt'], state()['aiCalls'][-1])

            # 3b. categories are per year: the pickers and the reader only offer what that year has
            for y, tax in (('2027', {'incomes': ['Freela'], 'investments': [], 'expenses': {'Variable': {'Food': ['Supermarket']}}}),
                           ('2028', {'incomes': ['Salary'], 'investments': ['Trips'], 'expenses': {'Fixed': {'Habitation': ['Rent']}}})):
                await admin_ctx.request.post(BASE + '/api/db/years', headers=hdr, data={'year': y, 'currency': 'EUR', 'createdAt': '2026-01-02T00:00:00.000Z', 'taxonomy': tax})
            await pg.reload(); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(700)
            await open_panel(pg)
            async def set_date(v):
                await pg.evaluate("v => { const i = document.getElementById('entry-date'); i.value = v; i.dispatchEvent(new Event('change', {bubbles:true})); }", v)
                await pg.wait_for_timeout(150)
            seg = lambda sid: pg.evaluate("id => [...document.querySelectorAll('#' + id + ' button')].filter(b => !b.hidden).map(b => b.textContent)", sid)
            await set_date('2028-05-10')
            # Oct 2 (229:18166): Category | Sub-category dropdowns, Group (Optional) | Type.
            check('2028: Category offers only what that year has, in order (Income, Savings and investments, Expenses); Sub-category only Fixed',
                  await dd_structure(pg, 'entry-kind') == [[None, ['Income', 'Savings and investments', 'Expenses']]] and await dd_structure(pg, 'entry-sub') == [[None, ['Fixed']]], [await dd_structure(pg, 'entry-kind'), await dd_structure(pg, 'entry-sub')])
            check('2028: Group menu only has its own group', await dd_structure(pg, 'entry-cat') == [[None, ['Habitation']]], await dd_structure(pg, 'entry-cat'))
            check('with no group picked, Type lists every type of the sub-category', await dd_structure(pg, 'entry-item') == [[None, ['Rent']]] and not await pg.eval_on_selector('#entry-item', 'e => e.disabled'), await dd_structure(pg, 'entry-item'))
            await dd_pick(pg, 'entry-cat', 'Habitation')
            check('2028: a group with one type selects it (174:15087)', await dd_text(pg, 'entry-item') == 'Rent' and await pg.eval_on_selector('#entry-item', 'e => e.value') == 'Rent', await dd_text(pg, 'entry-item'))
            await set_date('2027-05-10'); await dd_pick(pg, 'entry-sub', 'Variable'); await pg.wait_for_timeout(100)
            check('2027: Variable offers the Food group and its Supermarket type', await dd_structure(pg, 'entry-cat') == [[None, ['Food']]] and await dd_structure(pg, 'entry-item') == [[None, ['Supermarket']]], [await dd_structure(pg, 'entry-cat'), await dd_structure(pg, 'entry-item')])
            await dd_pick(pg, 'entry-item', 'Supermarket')
            check('picking a type fills its group', await dd_text(pg, 'entry-cat') == 'Food', await dd_text(pg, 'entry-cat'))
            check('the dropdowns show the choice: Expenses and Variable', [await dd_text(pg, 'entry-kind'), await dd_text(pg, 'entry-sub')] == ['Expenses', 'Variable'])
            await dd_pick(pg, 'entry-kind', 'Income'); await pg.wait_for_timeout(100)
            check('2027: Income has no Sub-category and no Group; its Type dropdown lists the income types', await dd_structure(pg, 'entry-item') == [[None, ['Freela']]] and await pg.locator('#entry-category-field').is_hidden() and await pg.locator('#entry-group-field').is_hidden(), await dd_structure(pg, 'entry-item'))
            # spec metrics from the Figma Dropdown / DropdownItem / Dropdown-list components (the Add to menu is grouped by year)
            await pg.click('#entry-period-trigger'); await pg.wait_for_selector('.ds-dd-menu')
            m = await pg.evaluate("""() => { const cs = e => getComputedStyle(e), r = e => e.getBoundingClientRect();
                const menu = document.querySelector('.ds-dd-menu'), g = menu.querySelector('.ds-dd-group'), its = [...menu.querySelectorAll('.ds-dd-block')[0].querySelectorAll('.ds-dd-item')], t = document.getElementById('entry-period-trigger');
                return { pad: cs(menu).padding, gFont: [cs(g).fontSize, cs(g).fontWeight, cs(g).lineHeight], gX: r(g).left - r(menu).left - 1, itemH: r(its[0]).height, itemPad: cs(its[0]).padding, iFont: [cs(its[0]).fontSize, cs(its[0]).fontWeight, cs(its[0]).lineHeight],
                         itemGap: its.length > 1 ? r(its[1]).top - r(its[0]).bottom : 4, itemX: r(its[0]).left - r(menu).left - 1, tFont: [cs(t).fontSize, cs(t).lineHeight, cs(t).letterSpacing], tPad: cs(t).padding, tBg: cs(t).backgroundColor, tSel: cs(its[0]).fontWeight }; }""")
            check('menu (Okara audit Oct 8): padding 12, group title Heading/Medium 16/16 flush, rows space/xs round Label/Small (36), 4 apart',
                  m['pad'] == '12px' and m['gFont'] == ['16px', '400', '16px'] and abs(m['gX'] - 12) < 0.6 and m['itemH'] == 36 and m['itemPad'] == '8px' and m['iFont'] == ['16px', '400', '20px'] and m['itemGap'] == 4 and abs(m['itemX'] - 12) < 0.6, m)
            check('trigger in the panel (Oct 3): Label/Medium 16/24 -2%, space/md sides (16, minus the border), no fill', m['tFont'] == ['16px', '24px', '-0.32px'] and m['tPad'] == '0px 15px' and m['tBg'] == 'rgba(0, 0, 0, 0)', m)
            await pg.keyboard.press('Escape'); await pg.wait_for_selector('.ds-dd-menu', state='detached')
            # keyboard: open with Enter, move, choose with Enter; Escape only closes the menu
            await pg.focus('#entry-item-trigger'); await pg.keyboard.press('Enter'); await pg.wait_for_selector('.ds-dd-menu')
            await pg.keyboard.press('Escape'); await pg.wait_for_selector('.ds-dd-menu', state='detached')
            check('Escape closes the menu but not the panel', await pg.get_attribute('#tracker-add-btn', 'aria-pressed') == 'true')
            await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(100)
            check('keyboard picks an option', await dd_text(pg, 'entry-item') == 'Freela', await dd_text(pg, 'entry-item'))
            # the native select still holds the value, and the menu lands inside the viewport
            check('hidden select keeps the value', await pg.eval_on_selector('#entry-item', 'e => e.value') == 'Freela')
            await pg.click('#entry-item-trigger'); await pg.wait_for_selector('.ds-dd-menu')
            box = await pg.eval_on_selector('.ds-dd-menu', 'e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, innerWidth, innerHeight]; }')
            check('menu stays inside the viewport', box[0] >= 0 and box[1] >= 0 and box[2] <= box[4] and box[3] <= box[5], box)
            await pg.mouse.click(5, 5); await pg.wait_for_selector('.ds-dd-menu', state='detached')
            check('clicking outside closes the menu', True)
            await pg.keyboard.press('Escape')

            # 3c. "Add to" (174:15081): the month and year an entry is booked in. Dated after it: refused. In it or earlier: fine.
            await open_panel(pg)
            entries_n = lambda: len([r for r in state()['rows'] if r['collection'] == 'entries'])
            async def fill_entry(desc):
                await dd_pick(pg, 'entry-kind', 'Income'); await pg.wait_for_timeout(100)
                opts = await pg.evaluate("[...document.querySelectorAll('#entry-item option')].map(o => o.value).filter(Boolean)")
                await pg.evaluate("v => { const s = document.getElementById('entry-item'); s.value = v; s.dispatchEvent(new Event('change', {bubbles:true})); }", opts[0])
                await pg.fill('#entry-desc', desc); await pg.fill('#entry-amount', '10')
            grp = await dd_structure(pg, 'entry-period')
            check('Add to: every month of every year, newest year first', [g[0] for g in grp][:3] == ['2031', '2030', '2029'] and all(len(g[1]) == 12 for g in grp[:6]), [[g[0], len(g[1])] for g in grp])
            box = await pg.evaluate("""() => { const r = document.getElementById('entry-period-trigger').getBoundingClientRect(); return [r.width, r.height, document.querySelector('label[for="entry-period-trigger"]').textContent]; }""")
            check('Track in: a 242px Medium dropdown under a "Track in" label', box[0] == 242 and box[2] == 'Track in', box)
            lay = await pg.evaluate("""() => { const r = id => document.getElementById(id).closest('.fld').getBoundingClientRect(), lab = document.querySelector('label[for="entry-kind-trigger"]'), cs = getComputedStyle(lab);
                const p = r('entry-period'), k = r('entry-kind'), d = r('entry-desc'), i = r('entry-item'), dt = r('entry-date'), a = r('entry-amount');
                return { label: [cs.fontSize, cs.fontWeight, cs.color, lab.textContent], itemLabel: document.querySelector('label[for="entry-item-trigger"]').textContent,
                         stack: p.top < k.top && k.top < d.top && d.top < i.top && i.top < a.top, sameRow: a.top === dt.top, gap: [k.top - p.bottom, d.top - k.bottom, i.top - d.bottom, a.top - i.bottom],
                         save: document.getElementById('entry-submit').textContent, addType: !!document.getElementById('entry-add-type') }; }""")
            check('Figma 229:18167 (Desktop, Oct 3): Track in space/2xl over the fields, rows space/lg apart, labels Label/Small text/secondary, "+ Add type", Save entry',
                  lay['label'][:3] == ['14px', '400', 'rgb(116, 113, 103)'] and lay['label'][3] == 'Category' and lay['itemLabel'] == 'Type' and lay['stack'] and lay['sameRow'] and lay['gap'] == [40, 16, 16, 16] and lay['save'] == 'Save entry' and lay['addType'], lay)
            await set_date('2029-09-13')
            check('Add to follows the date until it is picked by hand', await dd_text(pg, 'entry-period') == 'September 2029', await dd_text(pg, 'entry-period'))
            await dd_pick(pg, 'entry-period', 'August', '2029'); await fill_entry('Too early')
            n0 = entries_n(); await pg.click('#entry-submit'); await pg.wait_for_timeout(500)
            es = await pg.inner_text('#entry-status')
            check('a date after the month selected is refused with the mismatch message, nothing saved', "date of the entry (13/09/2029) doesn't match the month and year selected (August 2029)" in es and entries_n() == n0, [es, entries_n(), n0])
            await set_date('2029-09-14')
            check('once picked by hand, the month stays when the date changes', await dd_text(pg, 'entry-period') == 'August 2029', await dd_text(pg, 'entry-period'))
            await dd_pick(pg, 'entry-period', 'October', '2029')
            await pg.click('#entry-submit'); await pg.wait_for_timeout(700)
            check('a date in the month before the one selected is accepted, and lands in that month (13/09 into October)', entries_n() == n0 + 1 and 'Oct 2029' in await pg.inner_text('#ds-toast'), [entries_n(), n0, await pg.inner_text('#ds-toast')])
            today_label = await pg.evaluate("() => { const d = new Date(); return ['January','February','March','April','May','June','July','August','September','October','November','December'][d.getMonth()] + ' ' + d.getFullYear(); }")
            check('after saving, the panel starts over on today\'s month', await dd_text(pg, 'entry-period') == today_label, [await dd_text(pg, 'entry-period'), today_label])
            await set_date('2028-05-10')
            check('after a reset the month follows the date again', await dd_text(pg, 'entry-period') == 'May 2028', await dd_text(pg, 'entry-period'))
            await pg.keyboard.press('Escape')

            # 4. photo reading sends an image
            await open_panel(pg)
            await pg.set_input_files('#file-input', [os.path.join(FIX, 'receipt.png')]); await pg.wait_for_timeout(500)
            check('file list: a photo shows the Image icon', await pg.evaluate("document.querySelector('.doc-item .doc-ic svg').dataset.icon === 'image' || (!!window.ICON_LIB && document.querySelector('.doc-item .doc-ic path').getAttribute('d') === window.ICON_LIB.image.d)"))
            await pg.click('#doc-add'); await pg.wait_for_selector('#ap-review:not([hidden])', timeout=8000)
            check('photo: image sent to the reader', state()['aiCalls'][-1]['images'] == 1, state()['aiCalls'][-1])
            # review table: Type and Category are the same dropdown, and the row stays open while the menu is used
            # Oct 3 (229:18167): every row is open: description input, Type and Category dropdowns, amount
            check('review (229:18717): rows are open (input + two dropdowns), the amount shown as a value', await pg.locator('#rv-rows .rv-row [data-f=desc]').count() == 1 and await pg.locator('#rv-rows .rv-row .ds-dd').count() == 2 and await pg.locator('#rv-rows .rv-row .rv-value').count() == 1)
            await pg.click('#rv-rows .rv-row .c-cat .ds-dd-trigger'); await pg.wait_for_selector('.ds-dd-menu')
            check('review: Category trigger takes focus', await pg.evaluate("document.activeElement && document.activeElement.classList.contains('ds-dd-trigger')"))
            await pg.click('.ds-dd-menu .ds-dd-item >> nth=0'); await pg.wait_for_timeout(200)
            check('review: picking sets the row category', await pg.eval_on_selector('#rv-rows [data-f=cat]', 'e => e.value') != '')
            await pg.click('#rv-rows .rv-row .c-type .ds-dd-trigger'); await pg.wait_for_selector('.ds-dd-menu')
            check('review: Type menu is grouped', (await pg.locator('.ds-dd-menu .ds-dd-group').first.inner_text()) == 'Expenses')
            await pg.keyboard.press('Escape'); await pg.wait_for_selector('.ds-dd-menu', state='detached')
            check('review: Escape closed the menu, the row stays open', await pg.locator('#rv-rows .rv-row [data-f=desc]').count() == 1)
            cur = await pg.evaluate('String(new Date().getFullYear())')
            pr = state()['aiCalls'][-1]['prompt']
            check('reader is shown the current year categories, not the generic starter list', f'exist in {cur})' in pr and 'Supermarket' in pr and 'Restaurants' not in pr and 'Taxi' not in pr, pr[-600:])
            await pg.keyboard.press('Escape')

            # 4b. from the 25th of December, January of the next year is open for entries (and the first one creates the year)
            fake = lambda d, m, day: "(() => { const R = Date, T = new R(%d, %d, %d, 10, 0, 0).getTime(), off = T - R.now(); class D extends R { constructor(...a){ if (a.length === 0) super(R.now() + off); else super(...a); } static now(){ return R.now() + off; } } window.Date = D; })();" % (d, m, day)
            storage = await admin_ctx.storage_state()
            for day, label in ((20, 'Dec 20'), (27, 'Dec 27')):
                yc = await b.new_context(viewport={'width': 1300, 'height': 900}, storage_state=storage)
                await yc.add_init_script(fake(2035, 11, day))
                yp = await yc.new_page(); yerrs = []
                yp.on('pageerror', lambda e: yerrs.append(str(e)))
                await yp.goto(BASE + '/'); await yp.wait_for_selector('#user-nav'); await yp.wait_for_timeout(900)
                await open_panel(yp)
                mx = await yp.eval_on_selector('#entry-date', 'e => e.max')
                if day == 20:
                    check('Dec 20: the date field stops at the last existing year', mx == '2031-12-31', mx)
                else:
                    check('Dec 27: the date field also opens January of the next year (2036-01-31)', mx == '2036-01-31', mx)
                    async def try_add(date, desc):
                        await yp.evaluate("v => { const i = document.getElementById('entry-date'); i.value = v; i.dispatchEvent(new Event('change', {bubbles:true})); }", date)
                        await yp.wait_for_timeout(200)
                        await dd_pick(yp, 'entry-kind', 'Income'); await yp.wait_for_timeout(100)
                        opts = await yp.evaluate("[...document.querySelectorAll('#entry-item option')].map(o => o.value).filter(Boolean)")
                        await yp.evaluate("v => { const s = document.getElementById('entry-item'); s.value = v; s.dispatchEvent(new Event('change', {bubbles:true})); }", opts[0])
                        await yp.fill('#entry-desc', desc); await yp.fill('#entry-amount', '1234.5')
                        await yp.click('#entry-submit'); await yp.wait_for_timeout(1500)
                    await try_add('2036-02-05', 'Too far')
                    labels = [t.strip() for t in await yp.locator('.year-btn').all_inner_texts()]
                    check('Dec 27: February of the missing year is still refused, no year created', '2036' not in labels and 'match the month and year selected' in await yp.inner_text('#entry-status'), [labels, await yp.inner_text('#entry-status')])
                    await try_add('2036-01-15', 'Salary for January')
                    labels = [t.strip() for t in await yp.locator('.year-btn').all_inner_texts()]
                    check('Dec 27: an entry dated 15 Jan 2036 creates 2036 and is saved in January', '2036' in labels and await yp.locator('.year-btn[aria-pressed="true"]').inner_text() == '2036' and '1.234,50' in await yp.inner_text('body'), [labels, await yp.inner_text('#entry-status')])
                    check('Dec 27: no page errors', not yerrs, yerrs)
                await yc.close()

            # 5. CSP blocks injected inline handlers; CSRF guard refuses cross-site writes
            await pg.evaluate("document.body.insertAdjacentHTML('beforeend','<img src=x onerror=\"window.__pwned=1\">')"); await pg.wait_for_timeout(300)
            check('CSP: injected onerror handler did not run', await pg.evaluate('window.__pwned') is None)
            r = await admin_ctx.request.post(BASE + '/api/db/entries', data={'a': 1}, headers={'origin': 'https://evil.test', 'x-requested-with': 'costs-tracker'})
            check('CSRF: cross-origin write refused', r.status == 403)
            r = await admin_ctx.request.post(BASE + '/api/db/entries', data={'a': 1})
            check('CSRF: write without custom header refused', r.status == 403)
            r = await b.new_context()
            resp = await r.request.get(BASE + '/api/db/entries'); check('anonymous API call -> 401', resp.status == 401); await r.close()

            # 6. second user is pending, then approved, and sees none of the admin's data
            ann, aerrs = await login(ann_ctx, 'ann@example.com', 'Ann Lee'); await ann.wait_for_url('**/pending', timeout=5000)
            check('new user lands on the pending page', ann.url.endswith('/pending'))
            resp = await ann_ctx.request.get(BASE + '/api/db/entries'); check('pending user API -> 403', resp.status == 403)
            await pg.keyboard.press('Escape'); await pg.evaluate("(document.querySelector('#add-panel.open .add-panel-close, #add-panel.open [aria-label*=lose]')||{click(){}}).click()"); await pg.wait_for_timeout(300)
            await pg.reload(); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(700)
            check('admin: a pending account lights the notification dot', await pg.locator('#user-nav .ds-notif-badge').count() == 1)
            await pg.click('#notif-btn'); await pg.wait_for_selector('#notif-panel')
            item = pg.locator('#notif-panel .ds-notif-item', has_text='ann@example.com is waiting for your approval.')
            check('admin: the notification names the account waiting for approval', await item.count() == 1, await pg.inner_text('#notif-panel'))
            ni = await item.evaluate("e => { const cs = x => getComputedStyle(x), t = e.querySelector('.ds-notif-text'), c = e.querySelector('.ds-notif-content'); return [cs(t).fontSize, cs(t).fontWeight, cs(t).lineHeight, cs(c).columnGap]; }")
            check('notification-item (228:469, Oct 3, Mobile tokens): text Body/Medium/Medium 14/400/16', ni[:3] == ['14px', '400', '16px'], ni)
            await item.hover(); await pg.wait_for_timeout(150)
            nh = await item.evaluate("e => getComputedStyle(e.querySelector('.ds-notif-content')).columnGap")
            check('notification-item Hover: the layout does not move (Oct 3: the action sits in the header row)', nh == '16px', nh)
            await item.get_by_text('Approve', exact=True).click(); await pg.wait_for_timeout(400)
            check('approving from the notification clears it', await pg.locator('#user-nav .ds-notif-badge').count() == 0)
            await pg.keyboard.press('Escape')
            await ann.goto(BASE + '/'); await ann.wait_for_url('**/welcome', timeout=8000)
            await ann.wait_for_selector('#ob-next')
            check('a newly approved account starts at the onboarding (397:4392): tour card 1, steps Account done and Tour on going',
                  await ann.inner_text('.ob-card-title') == 'Every cent in one place' and await ann.locator('.ds-step.is-done').count() == 1 and 'Tour' in await ann.inner_text('.ds-step.is-current'))
            # Set up your board (401:4464 / 749:10871, Oct 6): the categories selector (827:2047), fixed categories
            await ann.click('#ob-next'); await ann.wait_for_timeout(500)
            check('tour card 2 (399:4485, Oct 9): the new title, Back + Next sharing the row',
                  await ann.inner_text('#ob-tour-title') == 'Your data is fully encrypted and accessible only by you' and await ann.locator('.ob-tour-cta #ob-back').count() == 1 and await ann.locator('.ob-tour-cta #ob-next').count() == 1)
            await ann.click('#ob-skip'); await ann.click('#ob-template'); await ann.wait_for_selector('.ob-setup')
            heads = await ann.eval_on_selector_all('.ob-col-summary .ob-col-title', 'els => els.map(e => e.textContent)')
            check('set up (401:4464, Oct 9): "Start tracking from" and "Summary" boxes, the new note', heads == ['Start tracking from', 'Summary'] and await ann.inner_text('.ob-summary-note') == 'You can rename or add categories later.', heads)
            cs = await ann.evaluate("""() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
              return [r('.ds-cat-sel'), r('.ds-cat-sel-bg'), [...document.querySelectorAll('.ds-cat-item')].map(e => [e.id, e.getAttribute('aria-selected'), getComputedStyle(e.querySelector('.ds-cat-item-title')).fontSize])]; }""")
            check('categories selector (827:2047): 640x96, the pill 2px wider and 104 high, the three items, Income selected, 14px titles',
                  cs[0] == [640, 96] and cs[1][1] == 104 and cs[2] == [['ob-cat-income', 'true', '14px'], ['ob-cat-investment', 'false', '14px'], ['ob-cat-expense', 'false', '14px']], cs)
            # Oct 5–6 (Felipe): no category creation or renaming at all
            check('no category creation or renaming', await ann.locator('#ob-add-cat, #ob-rename-cat, #category-modal').count() == 0)
            # ...but sub-categories and groups are free: delete one of the four Expenses defaults, and a group
            await ann.click('#ob-cat-expense'); await ann.wait_for_timeout(400)
            check('Expenses opens on its first sub-category with its groups', await ann.input_value('#ob-sub') == 'Fixed' and await ann.locator('.ob-board .budget-group').count() > 2)
            await ob_pick(ann, 'ob-sub', 'Extra'); await ann.click('#ob-delete-sub'); await ann.wait_for_selector('#confirm-modal[open]')
            check('deleting a sub-category asks first', 'delete Extra?' in await ann.inner_text('#confirm-modal .ds-modal-title'))
            await ann.click('#confirm-delete'); await ann.wait_for_timeout(300)
            check('a default Expenses sub-category can be deleted', 'Extra' not in await ann.inner_text('.ob-summary-list'))
            await ob_pick(ann, 'ob-sub', 'Fixed')
            g0 = await ann.locator('.ob-board .budget-group[data-category]').first.get_attribute('data-category')
            await ann.locator('.ob-board .budget-group-more').first.click(); await ann.click('.group-menu .group-delete'); await ann.wait_for_selector('#confirm-modal[open]')
            await ann.click('#confirm-delete'); await ann.wait_for_timeout(300)
            check('a group can be deleted (with its types)', await ann.locator(f'.ob-board .budget-group[data-category="{g0}"]').count() == 0, g0)
            await ob_pick(ann, 'ob-group', 'Pets', create=True)
            check('typing a new group creates it, empty', await ann.locator('.ob-board .budget-group[data-category="Pets"] .budget-group-empty').count() == 1)
            await ann.click('#ob-cat-income'); await ob_pick(ann, 'ob-sub', 'Side projects', create=True)
            check('any sub-category name for Income, created by typing it', await ann.input_value('#ob-sub') == 'Side projects' and 'No income added yet' in await ann.inner_text('.ob-board-empty'))
            summ = await ann.inner_text('.ob-summary-list')
            check('summary: Income\'s new sub-category, no deleted Extra', 'Side projects' in summ and 'Extra' not in summ, summ)
            await skip_onboarding(ann); await ann.wait_for_selector('#user-nav'); await ann.wait_for_timeout(700)
            abody = await ann.inner_text('body')
            check('approved user sees an empty account (isolation)', '777,50' not in abody and '23,40' not in abody)
            check('approved user: no errors', not aerrs, aerrs)
            resp = await ann_ctx.request.get(BASE + '/api/admin/users'); check('non-admin cannot list users', resp.status == 403)
            check('two users -> two wrapped keys', len(state()['keys']) == 2)

            # 6b. ids containing . : @ + ~ (as the app's own budget-default ids do) survive the round trip
            odd = 'budgetDefaults__expense__Fixed__Rent.v1~a:b@c+d'
            await pg.evaluate("async (id) => { const db = await window.claude.use('db'); await db.doc('budgetDefaults/' + id).set({ amount: 5 }); }", odd)
            got = await pg.evaluate("fetch('/api/db/budgetDefaults').then(r => r.json())")
            check('odd doc id stored and returned unchanged', [d['id'] for d in got['docs']] == [odd], got)

            # 7. daily cap (5): admin already used 3 reads
            await pg.reload(); await pg.wait_for_selector('#user-nav')
            codes = []
            for _ in range(4):
                rr = await admin_ctx.request.post(BASE + '/api/read-document', data={'prompt': 'x'}, headers={'origin': BASE, 'x-requested-with': 'costs-tracker'}); codes.append(rr.status)
            check('daily read cap enforced', codes == [200, 200, 429, 429], codes)

            # 7a. over budget: Variable / Groceries has a 10,00 budget this month and two 8,00 entries -> a bell notification;
            # the Entries tooltip starts with "Budget set"
            await admin_ctx.request.post(BASE + '/api/db/budgets', headers=hdr, data={'year': ym[0], 'type': 'expense', 'group': 'Variable', 'category': 'Food', 'item': 'Groceries', 'amount': 10, 'createdAt': '2026-01-01T00:00:00Z'})
            for i, d in enumerate(('03', '05')):
                await admin_ctx.request.post(BASE + '/api/db/entries', headers=hdr, data={'year': ym[0], 'monthIndex': ym[1], 'type': 'expense', 'group': 'Variable', 'category': 'Food', 'item': 'Groceries',
                    'description': 'Shop %d' % i, 'amount': 8, 'date': ym[0] + '-%02d-%s' % (ym[1] + 1, d), 'createdAt': ym[0] + '-%02d-%sT10:0%d:00Z' % (ym[1] + 1, d, i)})
            await pg.reload(); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(900)
            check('over budget: the bell shows the red dot', await pg.locator('.ds-notif-badge').count() == 1)
            await pg.click('#notif-btn'); await pg.wait_for_selector('#notif-panel')
            ntext = await pg.inner_text('#notif-panel')
            check('over budget: notification names the item, the group, spent and budget', 'Groceries (Variable) is over budget' in ntext and ('16,00' in ntext or '39,40' in ntext) and '10,00' in ntext, ntext)  # 39,40 when the mock's 23,40 import lands in this month too (date-dependent)
            mk = pg.locator('#notif-panel .ds-notif-item', has_text='Groceries').locator('.ds-notif-mark')
            n_mk = await mk.count()
            check('an unread alert offers "Mark as read" (211:19682)', n_mk >= 1, n_mk)
            await mk.first.click(); await pg.wait_for_timeout(400)
            check('"Mark as read" takes the link away', await pg.locator('#notif-panel .ds-notif-item', has_text='Groceries').locator('.ds-notif-mark').count() == n_mk - 1)
            await pg.locator('#notif-panel .ds-notif-item', has_text='Groceries').get_by_role('button', name='View').first.click(); await pg.wait_for_timeout(400)
            check('View opens the Variable expenses of that month', await pg.locator('#notif-panel').count() == 0 and 'Groceries' in await pg.inner_text('.breakdown-card'))
            le = await pg.evaluate("() => { const e = document.querySelector('.bd-tabs-stack .tracker-last-entry'); return e && [e.querySelector('.tle-text').textContent, [...e.querySelectorAll('.tle-num')].map(n => n.textContent), !!e.querySelector('.tle-dot'), getComputedStyle(e.querySelector('.tle-text')).fontSize, getComputedStyle(e.querySelector('.tle-num')).fontSize]; }")
            check('Latest line (581:19517, Oct 9): inside the selectors, "Latest: <item>/<description>, <Mon D>", the Dot, then € and the figure in mono (14 / 12)',
                  bool(le) and re.fullmatch(r'Latest: Groceries/[^,]+, [A-Z][a-z]{2} \d{1,2}', le[0]) and le[1][0] == '€' and re.fullmatch(r'[\d.]+,\d\d', le[1][1]) and le[2] and le[3:] == ['14px', '12px'], le)
            await pg.locator('.bd-row, .meter-row', has_text='Groceries').first.locator('.note-count').click(); await pg.wait_for_timeout(250)
            head = await pg.inner_text('#note-tip .tip-head')
            check('Entries tooltip starts with "Budget set" and the budget', 'Budget set' in head and '10,00' in head, head)
            await pg.locator('.bd-row, .meter-row', has_text='Groceries').first.locator('.note-count').click(); await pg.wait_for_timeout(200)
            # budget only, nothing recorded: the header alone (no "Starting budget" line, no explanation); income says "Estimated"
            await admin_ctx.request.post(BASE + '/api/db/budgets', headers=hdr, data={'year': ym[0], 'type': 'expense', 'group': 'Variable', 'category': 'Food', 'item': 'Budget only', 'amount': 400})
            await admin_ctx.request.post(BASE + '/api/db/budgets', headers=hdr, data={'year': ym[0], 'type': 'income', 'group': None, 'category': None, 'item': 'Estimated pay', 'amount': 2500})
            await pg.reload(); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(900)
            # Oct 9: after a reload the board opens on today's month (it used to jump to the last year when the years
            # list arrived twice before a redraw), so Expenses shows this month's sub-categories.
            check('after a reload the board shows the current month', str(__import__('datetime').date.today().year) in (await pg.inner_text('#cat-hint')), await pg.inner_text('#cat-hint'))
            await pg.click('#breakdown-top-seg button[data-v=Expenses]'); await pg.wait_for_selector('#breakdown-group-seg:not([hidden]) button[data-v=Variable]')
            await pg.click('#breakdown-group-seg button[data-v=Variable]'); await pg.wait_for_timeout(300)
            await pg.locator('.bd-row, .meter-row', has_text='Budget only').first.locator('.note-count').click(); await pg.wait_for_timeout(250)
            t = await pg.evaluate("() => { const b = document.querySelector('.note-count.is-open'), cs = getComputedStyle(b); return { head: document.querySelector('#note-tip .tip-head')?.textContent, items: document.querySelectorAll('#note-tip .tip-item').length, foot: !!document.querySelector('#note-tip .tip-foot'), hr: !!document.querySelector('#note-tip .tip-head-divider'), empty: document.querySelector('#note-tip .tip-empty')?.textContent, icon: b.classList.contains('is-icon') && !!b.querySelector('svg'), bg: cs.backgroundColor, color: cs.color }; }")
            check('budget without entries (354:618): header, divider, "There\'s no entries yet."', 'Budget set' in (t['head'] or '') and t['items'] == 0 and not t['foot'] and t['hr'] and t['empty'] == "There's no entries yet.", t)
            check('budget without entries: the counter is Type=Icon (Chart), pressed (354:618) = surface/dark with a white icon', t['icon'] and t['bg'] == 'rgb(22, 21, 15)' and t['color'] == 'rgb(255, 255, 255)', t)
            await pg.locator('.bd-row, .meter-row', has_text='Budget only').first.locator('.note-count').click(); await pg.wait_for_timeout(200)
            await pg.click('#breakdown-top-seg button[data-v=Income]'); await pg.wait_for_timeout(300)
            await pg.locator('.bd-row, .meter-row', has_text='Estimated pay').first.locator('.note-count').click(); await pg.wait_for_timeout(250)
            check('income: the header says "Estimated"', 'Estimated' in (await pg.inner_text('#note-tip .tip-head')))
            await pg.locator('.bd-row, .meter-row', has_text='Estimated pay').first.locator('.note-count').click(); await pg.wait_for_timeout(200)
            await pg.reload(); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(900)
            check('seen alerts: no red dot after reload', await pg.locator('.ds-notif-badge').count() == 0)
            await pg.click('#notif-btn'); await pg.wait_for_selector('#notif-panel')
            check('read alerts stay read after a reload', await pg.locator('#notif-panel .ds-notif-item', has_text='Groceries').locator('.ds-notif-mark').count() == n_mk - 1)
            await pg.click('#notif-btn'); await pg.wait_for_timeout(200)

            # 7b. removing an entry from the Entries tooltip confirms with a toast
            r = await admin_ctx.request.post(BASE + '/api/db/entries', headers=hdr, data={
                'year': ym[0], 'monthIndex': ym[1], 'type': 'income', 'group': None, 'category': None, 'item': 'Toast test', 'description': 'Toast test', 'amount': 5, 'date': ym[0] + '-%02d-01' % (ym[1] + 1)})
            await pg.reload(); await pg.wait_for_selector('#user-nav'); await pg.wait_for_timeout(700)
            await pg.click('#breakdown-top-seg button[data-v=Income]'); await pg.wait_for_timeout(200)
            await pg.locator('.meter-row', has_text='Toast test').locator('.note-count').click(); await pg.wait_for_timeout(200)
            await pg.locator('#note-tip .tip-item', has_text='Toast test').locator('.tip-del').click()
            await pg.wait_for_selector('#confirm-modal[open]', timeout=3000)
            m = await pg.evaluate('''() => { const d = document.querySelector('#confirm-modal'), b = d.querySelector('#confirm-delete'), il = d.querySelector('.ds-illustration');
              return { title: d.querySelector('.ds-modal-title').textContent, desc: d.querySelector('.ds-modal-description').textContent, art: il && il.dataset.illustration,
                       ilSize: il && [il.getAttribute('width'), il.getAttribute('height')], bg: getComputedStyle(b).backgroundColor, label: b.textContent, cancel: d.querySelector('#confirm-cancel').textContent }; }''')
            check('deleting an entry asks first: modal with the entry name, Trash can 64x72, Cancel + red Delete',
                  'Toast test' in m['title'] and m['art'] == 'trashCan' and m['ilSize'][0] == '64' and abs(float(m['ilSize'][1]) - 72) < 0.5 and m['label'] == 'Delete' and m['cancel'] == 'Cancel' and m['bg'] == 'rgb(189, 0, 7)', m)
            await pg.click('#confirm-cancel'); await pg.wait_for_timeout(200)
            check('Cancel keeps the entry', not await pg.locator('#confirm-modal[open]').count() and await pg.locator('.meter-row', has_text='Toast test').count() == 1)
            await pg.locator('.meter-row', has_text='Toast test').locator('.note-count').click(); await pg.wait_for_timeout(200)
            await pg.locator('#note-tip .tip-item', has_text='Toast test').locator('.tip-del').click()
            await pg.wait_for_selector('#confirm-modal[open]'); await pg.click('#confirm-delete')
            await pg.wait_for_selector('#ds-toast.visible', timeout=4000)
            check('removing an entry shows a toast', 'removed' in await pg.inner_text('#ds-toast'), await pg.inner_text('#ds-toast'))

            # 7b. deleting a year asks first (2028 is a future year the test created)
            await pg.locator('.year-btn', has_text='2028').click(); await pg.wait_for_timeout(200)
            await pg.click('.year-del-btn'); await pg.wait_for_selector('#confirm-modal[open]', timeout=3000)
            check('deleting a year asks first: "Are you sure you want to delete 2028?"', (await pg.inner_text('#confirm-modal .ds-modal-title')).strip() == 'Are you sure you want to delete 2028?')
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
            check('Escape closes it and keeps the year', not await pg.locator('#confirm-modal[open]').count() and await pg.locator('.year-btn', has_text='2028').count() == 1)
            await pg.click('.year-del-btn'); await pg.wait_for_selector('#confirm-modal[open]'); await pg.click('#confirm-delete')
            await pg.wait_for_selector('#year-toast.visible', timeout=5000); await pg.wait_for_timeout(500)
            check('Delete removes the year (Undo toast shown)', await pg.locator('.year-btn', has_text='2028').count() == 0)

            # 8. App header: logo + User nav, sticks to the top when the page scrolls
            hdr = await ann.evaluate("""() => { const h = document.querySelector('#app-header'), r0 = h.getBoundingClientRect().top;
              window.scrollTo(0, 600); const r1 = h.getBoundingClientRect().top; window.scrollTo(0, 0);
              return { logo: !!h.querySelector('.ds-logo[data-variant=symbol]'), nav: !!h.querySelector('#user-nav'), r0, r1, h: h.getBoundingClientRect().height }; }""")
            check('App header: symbol logo + User nav, 40 from the top (as the desktop frame places it), sticks at 0 on scroll, 64 high', hdr['logo'] and hdr['nav'] and hdr['r0'] == 40 and hdr['r1'] == 0 and hdr['h'] == 64, hdr)
            check('greets the user by the first part of the email', (await ann.inner_text('.app-title')).strip() == 'Hey, Ann')

            # 9. Account page: name, sign-in method, data
            await ann.click('#user-menu-btn'); await ann.click('#menu-account'); await ann.wait_for_url('**/account'); await ann.wait_for_selector('#profile')
            check('Account page (250:3399): three cards and the Side menu (Personal information, Security, Data & privacy)', await ann.locator('.acct-card').count() == 3
                  and await ann.eval_on_selector_all('.acct-menu .ds-menu-item', 'els => els.map(e => e.textContent)') == ['Personal information', 'Security', 'Data & privacy'])
            ab = await ann.evaluate("() => [...document.querySelectorAll('.acct-card')].map(e => getComputedStyle(e).borderTopStyle)")
            check('Account page cards have no border', ab == ['none'] * 3, ab)
            av = await ann.evaluate("() => { const a = document.querySelector('#app-header .ds-avatar'), c = getComputedStyle(a); return [a.getBoundingClientRect().width, c.fontSize, c.fontWeight, c.lineHeight, c.letterSpacing, c.backgroundColor]; }")
            check('avatar (221:1044, Oct 3): 40px, initial Heading/Small (14/400/14 -2%, Mobile tokens), white on surface/accent', av == [40, '14px', '400', '14px', '-0.28px', 'rgb(79, 70, 229)'], av)
            await ann.click('#menu-data'); await ann.wait_for_timeout(900)
            al = await ann.evaluate("""() => { const r = s => document.querySelector(s).getBoundingClientRect(), b = r('#acct-back'), h = r('.acct-head h1'), c = r('.acct-content');
                return { back: document.querySelector('#acct-back').textContent, arrow: Math.round(document.querySelector('#acct-back svg').getBoundingClientRect().width), titleGap: h.top - b.bottom, contentGap: c.top - r('.acct-head .app-sub').bottom,
                         cards: ['#profile', '#security', '#data'].map(s => Math.round(r(s).height)), h2: [...document.querySelectorAll('.acct-card-head h2')].map(e => getComputedStyle(e).fontSize),
                         h3: getComputedStyle(document.querySelector('.acct-meta h3')).fontSize, label: getComputedStyle(document.querySelector('label[for=first-name]')).textTransform }; }""")
            check('Account (250:3399, Oct 4): "Go to dashboard" with a 16px arrow, title 8 below, content 40 below; cards 408 / 217 / 533; all card titles 20px, option titles 16px, labels upper case',
                  al == {'back': 'Go to dashboard', 'arrow': 16, 'titleGap': 8, 'contentGap': 40, 'cards': [408, 217, 533], 'h2': ['20px'] * 3, 'h3': '16px', 'label': 'uppercase'}, al)
            sm = await ann.evaluate('''() => [...document.querySelectorAll('.acct-menu .ds-menu-item')].map(e => [e.getBoundingClientRect().height, e.classList.contains('is-selected')])''')
            check('Side menu: every item 40 high, clicking one selects it (no jump)', all(h == 40 for h, _ in sm) and [x for _, x in sm] == [False, False, True], sm)
            await ann.click('#menu-profile'); await ann.wait_for_timeout(900)
            check('email is shown locked', await ann.eval_on_selector('#email', 'e => e.disabled && e.value') == 'ann@example.com')
            await ann.fill('#first-name', 'Annabel'); await ann.fill('#last-name', 'Lee'); await ann.click('#profile-save')
            await ann.wait_for_selector('#ds-toast.visible', timeout=4000)
            await ann.wait_for_timeout(300); await ann.click('#user-menu-btn'); await ann.wait_for_selector('.ds-user-name')
            await ann.wait_for_timeout(250)
            um = await ann.evaluate("""() => { const cs = e => getComputedStyle(e), r = e => e.getBoundingClientRect();
                const c = document.getElementById('user-menu'), n = c.querySelector('.ds-user-name'), m = c.querySelector('.ds-menu-items .ds-dd-items');
                return { w: r(c).width, name: [cs(n).fontSize, cs(n).fontWeight, cs(n).lineHeight], menuW: r(m).width, menuR: Math.round(r(c).right - r(m).right), closed: Math.round(r(document.querySelector('.ds-user-trigger')).width) }; }""")
            check('user (221:1059, Oct 3): card 240 wide, name Body/Large/Medium (16/400/20: the header uses the Mobile tokens), items 202 wide, 4 from the card padding on the right, closed pill 76', um['w'] == 240 and um['name'] == ['16px', '400', '20px'] and um['menuW'] == 202 and um['menuR'] == 9 and um['closed'] == 76, um)
            check('the first name reaches the user menu', (await ann.inner_text('.ds-user-name')).strip() == 'Annabel', await ann.inner_text('.ds-user-name'))
            await ann.click('#menu-account'); await ann.wait_for_timeout(400)
            check('choosing an item keeps the user menu open (Account on the Account page does nothing)', await ann.locator('#user-menu').count() == 1 and ann.url.endswith('/account'))
            await ann.click('#user-menu .ds-user-info'); await ann.wait_for_timeout(400)
            check('the menu closes from its top row', await ann.locator('#user-menu').count() == 0)
            # picture: upload a PNG, the avatar turns into the image; delete asks first
            png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC')
            await ann.set_input_files('#avatar-file', files=[{'name': 'me.png', 'mimeType': 'image/png', 'buffer': png}])
            await ann.wait_for_selector('.acct-avatar-row .ds-avatar.is-image img', timeout=5000)
            check('uploaded picture shows in the avatar and in the user menu', await ann.locator('.ds-user-trigger .ds-avatar.is-image img').count() == 1)
            await ann.click('#avatar-delete'); await ann.wait_for_selector('#confirm-modal[open]')
            check('deleting the picture asks first', 'picture' in await ann.inner_text('#confirm-modal .ds-modal-title'))
            await ann.click('#confirm-delete'); await ann.wait_for_selector('.acct-avatar-row .ds-avatar:not(.is-image)', timeout=4000)
            # sign-in method: set a password (either-or with codes)
            check('sign-in code is on by default', await ann.get_attribute('#toggle-code', 'aria-checked') == 'true' and await ann.get_attribute('#toggle-password', 'aria-checked') == 'false')
            await ann.click('#toggle-password')
            check('turning Password on shows Password + Repeat password + Save password, code turns off',
                  await ann.locator('#pw-save').count() == 1 and await ann.get_attribute('#toggle-code', 'aria-checked') == 'false')
            await ann.fill('#pw-a', 'correct-horse'); await ann.fill('#pw-b', 'correct-hors'); await ann.click('#pw-save')
            check('mismatched passwords are refused', "don't match" in await ann.inner_text('#security-error'))
            await ann.fill('#pw-b', 'correct-horse'); await ann.click('#pw-save'); await ann.wait_for_selector('#pw-change', timeout=4000)
            check('with a password set: Current + New password + Change password', await ann.locator('#pw-change').count() == 1)
            # sign out and back in with the password
            await ann.click('#user-menu-btn'); await ann.click('#menu-signout'); await ann.wait_for_url('**/login', timeout=5000)
            await ann.fill('#login-email', 'ann@example.com'); await ann.click('#email-submit'); await ann.wait_for_selector('#pw-submit')
            check('an account with a password is asked for it at sign-in, greeted by name (335:7542)', 'Hello, Ann!' in await ann.inner_text('.login-user') and await ann.locator('#forgot-password').count() == 1)
            await ann.fill('input[name=password]', 'wrong-one-here'); await ann.click('#pw-submit'); await ann.wait_for_selector('#login-msg')
            await ann.fill('input[name=password]', 'correct-horse'); await ann.click('#pw-submit'); await ann.wait_for_selector('#user-nav', timeout=8000)
            check('the right password signs in', '/login' not in ann.url)
            # back to sign-in codes
            await ann.goto(BASE + '/account'); await ann.wait_for_selector('#security'); await ann.wait_for_timeout(400)
            await ann.click('#toggle-code'); await ann.click('#signin-save'); await ann.wait_for_function("() => document.querySelector('#toggle-code').getAttribute('aria-checked') === 'true' && !document.querySelector('#signin-save')")
            check('switching back to codes: Save changes, then no password form', await ann.locator('#pw-form').count() == 0)

            # 10. delete my data (account and profile stay), then delete the account
            await ann.click('#delete-data-btn'); await ann.wait_for_selector('#confirm-modal[open]', timeout=3000)
            check('delete data asks first', (await ann.inner_text('#confirm-modal .ds-modal-title')).strip() == 'Are you sure you want to delete all your data?')
            def rows_by_user():
                c = {}
                for r in state()['rows']: c[r['user_id']] = c.get(r['user_id'], 0) + 1
                return c
            ann_rows = lambda: [(r['collection'], r['doc_id']) for r in state()['rows'] if r['user_id'].startswith('u-616e6e')]
            before = rows_by_user()
            await ann.click('#confirm-delete'); await ann.wait_for_selector('#ds-toast.visible', timeout=5000); await ann.wait_for_timeout(300)
            after = rows_by_user()
            check('delete data: only the profile and onboarding settings are left (no second tour), the other user untouched, still signed in',
                  sorted(ann_rows()) == [('settings', 'onboarding'), ('settings', 'profile')] and all(after.get(u) == n for u, n in before.items() if not u.startswith('u-616e6e')) and '/login' not in ann.url, [ann_rows(), ann.url])
            check('Delete account is off until the box is ticked', await ann.eval_on_selector('#delete-account-btn', 'e => e.disabled'))
            await ann.click('.ds-check'); await ann.click('#delete-account-btn'); await ann.wait_for_selector('#confirm-modal[open]', timeout=3000)
            check('delete account asks first', (await ann.inner_text('#confirm-modal .ds-modal-title')).strip() == 'Are you sure you want to delete your account?')
            await ann.click('#confirm-delete'); await ann.wait_for_url('**/login', timeout=5000)
            check('delete account: signed out, key and rows gone', len(state()['keys']) == 1 and not ann_rows(), state()['keys'])
            await pg.click('#user-menu-btn'); await pg.click('#menu-signout'); await pg.wait_for_url('**/login', timeout=5000)
            check('sign-out returns to login', True)
            await b.close()
    finally:
        srv.terminate()
    print('\nFAILED: ' + ', '.join(fails) if fails else '\nALL PASSED'); sys.exit(1 if fails else 0)
asyncio.run(main())
