/* Verify the game is ALIVE on mobile: start, drop pieces, score changes,
   hold works, game over fires. Plus a desktop regression check. */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

let failures = 0;
function check(name, cond, detail) {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch();

  // ---- mobile gameplay ----
  console.log('=== mobile gameplay (390x844) ===');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  const s0 = await page.evaluate(() => G.state);
  check('starts in menu', s0 === 'menu');

  // tap Insert Coin
  await page.tap('#startBtn');
  await page.waitForTimeout(300);
  const s1 = await page.evaluate(() => G.state);
  check('tap Insert Coin -> playing', s1 === 'playing', `state=${s1}`);

  // play: hard drop pieces via the touch button until the board overfills.
  // (On "over", any touch tap restarts — so stop as soon as we hit game over.)
  let over = false;
  for (let i = 0; i < 70; i++) {
    await page.tap('#touch button[data-act="drop"]');
    await page.waitForTimeout(40);
    const s = await page.evaluate(() => G.state);
    if (s === 'over') { over = true; break; }
  }
  const st = await page.evaluate(() => ({ state: G.state, score: G.score, lines: G.lines, gridFull: G.grid ? G.grid.flat().filter(Boolean).length : -1 }));
  check('score increased after drops', st.score > 0, `score=${st.score}`);
  check('blocks locked on grid', st.gridFull > 0, `cells=${st.gridFull}`);
  check('reached game over (stacked to top)', st.state === 'over', `state=${st.state}`);

  // retry works
  if (st.state === 'over') {
    await page.tap('#retryBtn');
    await page.waitForTimeout(300);
    const s2 = await page.evaluate(() => ({ state: G.state, score: G.score }));
    check('Reboot restarts game', s2.state === 'playing' && s2.score === 0, JSON.stringify(s2));
  }

  // hold works
  await page.tap('#touch button[data-act="hold"]');
  await page.waitForTimeout(100);
  const hold = await page.evaluate(() => ({ hold: G.hold, canHold: G.canHold }));
  check('hold captured a piece', hold.hold !== null, JSON.stringify(hold));

  // rotate + move buttons don't throw
  await page.tap('#touch button[data-act="rotate"]');
  await page.tap('#touch button[data-act="left"]');
  await page.waitForTimeout(50);
  check('no JS errors during play', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: path.join(__dirname, 'shot_gameplay.png') });
  await ctx.close();

  // ---- desktop regression ----
  console.log('=== desktop regression (1280x800) ===');
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dpage = await dctx.newPage();
  const derrors = [];
  dpage.on('pageerror', e => derrors.push(e.message));
  await dpage.goto(FILE, { waitUntil: 'load' });
  await dpage.waitForTimeout(800);
  const d = await dpage.evaluate(() => {
    const b = document.getElementById('boardCanvas').getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight;
    return {
      boardIn: b.top >= 0 && b.left >= 0 && b.right <= vw && b.bottom <= vh,
      board: { w: Math.round(b.width), h: Math.round(b.height) },
      sideLVisible: document.getElementById('sideL').offsetParent !== null,
      sideRVisible: document.getElementById('sideR').offsetParent !== null,
      holdMHidden: getComputedStyle(document.getElementById('pHoldM')).display === 'none',
      hudHidden: getComputedStyle(document.getElementById('hudTop')).display === 'none',
      touchHidden: getComputedStyle(document.getElementById('touch')).display === 'none',
    };
  });
  check('desktop: board on screen', d.boardIn, JSON.stringify(d.board));
  check('desktop: side panels visible', d.sideLVisible && d.sideRVisible);
  check('desktop: mobile chips hidden', d.holdMHidden && d.hudHidden);
  check('desktop: touch deck hidden (fine pointer)', d.touchHidden);
  check('desktop: no JS errors', derrors.length === 0, derrors.slice(0, 3).join(' | '));
  // desktop keyboard start
  await dpage.keyboard.press('Enter');
  await dpage.waitForTimeout(200);
  const dstate = await dpage.evaluate(() => G.state);
  check('desktop: Enter starts game', dstate === 'playing', `state=${dstate}`);
  await dpage.screenshot({ path: path.join(__dirname, 'shot_desktop.png') });
  await dctx.close();

  await browser.close();
  console.log(failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)');
  process.exit(failures ? 1 : 0);
})();
