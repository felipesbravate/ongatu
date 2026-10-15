"""Shared boards end to end (Oct 11, redone Oct 15): Ana creates a joint board (header switcher -> setup flow), opens
"Share your board" from the dashboard, copies a Viewer link and invites someone by email; Ben (signed out) opens the
link, signs up, lands on the invite, joins as a viewer (no edit controls, the server refuses writes); in Board settings
Ana makes him a Collaborator and his add button comes back; the switcher moves between boards; Ana deletes the board
from Board settings and Ben falls back to his own board.
Run: python3 tests/e2e/shared_board.py   (needs the UI on :3300, `npx next start -p 3300`)."""
import asyncio, os, subprocess, sys, time, urllib.request
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'visual'))
import capture as C
from playwright.async_api import async_playwright

FAILS = []
SHOTS = os.environ.get('SHOTS')
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else f'  -> {extra}'))
    if not cond: FAILS.append(name)
async def shot(pg, n):
    if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, n + '.png'), full_page=True)

def start_server():
    # Open sign-up (as in production), so a new account can follow an invite link straight away.
    env = dict(os.environ, PORT=str(C.PORT), APP_ORIGIN=C.BASE, ADMIN_EMAILS='admin@example.com', MOCK_TEST_ENDPOINTS='1', REQUIRE_APPROVAL='0')
    srv = subprocess.Popen(['node', 'scripts/dev-mock-server.mjs'], cwd=C.ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    for _ in range(80):
        try: urllib.request.urlopen(C.BASE + '/login'); return srv
        except Exception: time.sleep(0.1)
    raise RuntimeError('mock server did not start')

async def sign_in(pg, email, name):
    await pg.fill('#login-email', email)
    async with pg.expect_navigation(): await pg.click('#email-submit')
    if 'step=new' in pg.url:
        await pg.fill('#full-name', name)
        async with pg.expect_navigation(): await pg.click('#signup-submit')
    await pg.fill('#code-0', '123456')
    async with pg.expect_navigation(): await pg.click('#code-submit')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/opt/pw-browsers/chromium'))
        srv = start_server()
        errs = []
        try:
            # ---- Ana: her own board first (template), then a shared board from Account ----
            actx = await b.new_context(viewport={'width': 1320, 'height': 1000}); await C.route_fonts(actx)
            await actx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=C.BASE)
            ana = await actx.new_page(); ana.on('pageerror', lambda e: errs.append('ana: ' + str(e)))
            await ana.goto(C.BASE + '/login'); await sign_in(ana, 'admin@example.com', 'Ana Lima')
            await ana.wait_for_url('**/welcome'); await ana.click('#ob-skip'); await ana.click('#ob-template'); await ana.wait_for_selector('.ob-setup')
            await ana.click('#ob-start'); await ana.wait_for_selector('#ob-welcome[open]', timeout=15000)
            # Oct 15 (boards-a): "Create joint board" in the header's board switcher -> the joint setup (961:32094 ff.):
            # Setup (template, Continue) -> Name and share (name, Finish and start tracking) -> welcome -> the dashboard.
            await ana.goto(C.BASE + '/'); await ana.wait_for_selector('.breakdown-card')
            await ana.click('#board-dd'); await ana.wait_for_selector('#board-switcher #board-create-joint')
            async with ana.expect_navigation(): await ana.click('#board-create-joint')
            await ana.wait_for_selector('.ob-choose')
            title = await ana.inner_text('.ob-title')
            steps = await ana.locator('.ds-steps .ds-step').all_inner_texts()
            check('Create joint board opens its setup: no tour, "Set up your joint board", Setup / Name and share', title == 'Set up your joint board' and [x.strip() for x in steps] == ['Setup', 'Name and share'], (title, steps))
            await ana.click('#ob-template'); await ana.wait_for_selector('.ob-setup'); await ana.click('#ob-start')
            await ana.wait_for_selector('#ob-board-name')
            await ana.click('#ob-finish'); await ana.wait_for_timeout(200)
            check('Finish needs a board name first (nothing created yet)', await ana.locator('#ob-board-name-error').count() == 1 and await ana.evaluate("localStorage.getItem('ongatu.board')") is None)
            await ana.fill('#ob-board-name', 'Casa'); await ana.click('#ob-finish')
            await ana.wait_for_selector('#ob-welcome[open]', timeout=15000)
            check('setup done: "You\'re all set"', 'all set' in await ana.inner_text('#ob-welcome'))
            await ana.click('#ob-go'); await ana.wait_for_selector('.breakdown-card'); await ana.wait_for_timeout(600)
            sub = await ana.inner_text('#board-sub')
            check('the dashboard is titled with the joint board, with its members and the invite (+) button', 'Casa' in sub and 'Check your joint board' in sub and await ana.locator('#board-users .ds-avatar').count() == 1 and await ana.locator('#board-share').count() == 1, sub)
            check('the header pill names the joint board', 'Casa' in await ana.inner_text('#board-dd'))
            await shot(ana, 'shared-dashboard')

            # ---- Share your board (994:40586): the dashboard "+" opens it; copy a link, invite by email ----
            board_id = await ana.evaluate("localStorage.getItem('ongatu.board')")
            await ana.click('#board-share'); await ana.wait_for_selector('#share-modal[open] #share-people')
            check('the share modal lists Ana as the owner', 'Ana' in await ana.inner_text('#share-people') and await ana.input_value('#board-role-' + (await ana.locator('#share-people .jb-person-row').first.get_attribute('data-user'))) == 'co_owner')
            await ana.click('#share-copy-link'); await ana.wait_for_timeout(400)
            url = await ana.evaluate('navigator.clipboard.readText()')
            check('Copy link puts a /join#token link on the clipboard', url.startswith(C.BASE + '/join#') and len(url.split('#')[1]) == 43, url)
            await ana.fill('#share-emails', 'cai@example.com'); await ana.click('#share-send'); await ana.wait_for_timeout(600)
            check('Send invite emails it and confirms', 'Invite sent to cai@example.com' in await ana.inner_text('#ds-toast'))
            check('the invited address is listed as "Invite sent"', 'Invite sent' in await ana.inner_text('#share-people .jb-person-row.is-invite'))
            await shot(ana, 'shared-share')
            await ana.click('#share-modal .ds-modal-header button'); await ana.wait_for_timeout(300)

            # ---- Ben: signed out, opens the link, signs up, lands back on the invite ----
            bctx = await b.new_context(viewport={'width': 390, 'height': 844}); await C.route_fonts(bctx)
            ben = await bctx.new_page(); ben.on('pageerror', lambda e: errs.append('ben: ' + str(e)))
            await ben.goto(url); await ben.wait_for_selector('#login-email', timeout=15000)
            await sign_in(ben, 'ben@example.com', 'Ben Costa')
            await ben.wait_for_selector('#join-accept', timeout=15000)
            check('after signing up Ben is back on the invite; the token left the address bar', ben.url.endswith('/join') and '#' not in ben.url, ben.url)
            text = await ben.inner_text('#join-text')
            check('the invite says who, which board and the access', 'Ana' in text and 'Viewer' in text and 'Join Casa' == await ben.inner_text('#join-title'), text)
            await shot(ben, 'shared-join')
            await ben.click('#join-accept'); await ben.wait_for_selector('.breakdown-card', timeout=15000); await ben.wait_for_timeout(800)
            check('Ben joins and sees Casa as a viewer', 'Casa' in await ben.inner_text('#board-sub') and await ben.evaluate("document.documentElement.dataset.boardRole") == 'viewer')
            check('as a viewer Ben has no add / edit controls', not await ben.locator('#mnav-add').is_visible())
            st = await ben.evaluate("fetch(location.origin + '/api/boards/' + localStorage.getItem('ongatu.board') + '/db/entries', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'costs-tracker' }, body: '{\"item\":\"x\"}' }).then(r => r.status)")
            check('and the server refuses a viewer write', st == 403, st)
            await shot(ben, 'shared-viewer')
            # the same link again: already used
            again = await bctx.new_page(); await again.goto(url); await again.wait_for_selector('#join-title')
            check('opening the link again: already on the board', 'already on' in await again.inner_text('#join-title'))
            await again.close()

            # ---- Board settings (970:18246): Ana makes Ben a Collaborator ----
            await ana.goto(C.BASE + '/board-settings?board=' + board_id); await ana.wait_for_selector('#board-sec-sharing .jb-person-row')
            check('Board settings shows the name, sharing and delete cards', await ana.input_value('#board-name') == 'Casa' and await ana.locator('#board-sec-delete').count() == 1)
            ben_id = await ana.locator('#board-sec-sharing .jb-person-row', has_text='ben@example.com').get_attribute('data-user')
            await ana.click(f'#board-role-{ben_id}-trigger'); await ana.click(f'#board-role-{ben_id}-editor'); await ana.wait_for_timeout(600)
            check('Ana changes Ben to Collaborator', 'Access changed' in await ana.inner_text('#ds-toast') and 'Collaborator' in await ana.inner_text(f'#board-role-{ben_id}-trigger'))
            await shot(ana, 'shared-settings')
            await ben.reload(); await ben.wait_for_selector('.breakdown-card'); await ben.wait_for_timeout(800)
            check('as a collaborator (editor) Ben gets the add button', await ben.locator('#mnav-add').is_visible() and await ben.evaluate("document.documentElement.dataset.boardRole") == 'editor')
            await ben.goto(C.BASE + '/board-settings'); await ben.wait_for_selector('#board-name')
            check('Ben\'s Board settings: the name is read-only and he can leave', await ben.locator('#board-name').is_disabled() and await ben.locator('#board-leave').count() == 1 and await ben.locator('#board-sec-sharing').count() == 0)

            # ---- switcher (board-dropdown 1052:6292): the header pill opens "Your boards" ----
            await ana.goto(C.BASE + '/'); await ana.wait_for_selector('.breakdown-card')
            await ana.click('#board-dd'); await ana.wait_for_selector('#board-pick-personal')
            items = await ana.locator('#board-switcher .ds-bsw-name').all_inner_texts()
            check('the switcher lists the personal board and Casa', items == ['Ana\u2019s personal board', 'Casa'], items)
            async with ana.expect_navigation(): await ana.click('#board-pick-personal')
            await ana.wait_for_selector('.breakdown-card'); await ana.wait_for_timeout(500)
            check('personal board: no joint heading', await ana.locator('#board-sub').count() == 0)

            # ---- Ana deletes Casa (Board settings: tick the confirm, Delete board); Ben is moved back to his own board ----
            await ana.goto(C.BASE + '/board-settings?board=' + board_id); await ana.wait_for_selector('#board-delete')
            check('Delete board waits for the confirm tick', await ana.locator('#board-delete').is_disabled())
            await ana.click('label[for="board-delete-confirm"]'); await ana.click('#board-delete'); await ana.wait_for_selector('#confirm-modal[open]')
            async with ana.expect_navigation(): await ana.click('#confirm-delete')
            left = await ana.evaluate("fetch('/api/boards', { headers: { 'x-requested-with': 'costs-tracker' } }).then(r => r.json()).then(j => j.boards.length)")
            check('the board is gone from Ana\'s boards', left == 0, left)
            await ben.reload(); await ben.wait_for_timeout(2500)
            check('Ben lands on his own board (onboarding, as he has none yet)', '/welcome' in ben.url and await ben.evaluate("localStorage.getItem('ongatu.board')") is None, ben.url)
            check('no page errors', not errs, errs)
        finally:
            srv.terminate()
        await b.close()
    print('\nALL PASSED' if not FAILS else f'\nFAILED: {len(FAILS)}')
    sys.exit(1 if FAILS else 0)
asyncio.run(main())
