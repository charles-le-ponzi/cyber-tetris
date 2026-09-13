/* Reproduce the user's real-phone bug: the touch deck overlapping the board.
   Root cause was a position:fixed deck + a measured --deckH padding that went
   stale when the mobile dynamic viewport resized (URL bar collapse / safe-area
   change). This test resizes the viewport repeatedly (simulating that) and
   asserts the board NEVER overlaps the deck, before and after every resize.
   Also does a full gameplay end-to-end (start, move, rotate, soft/hard drop,
   hold, pause/resume) to prove the game still works. */
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
  for (const vp of [
    { name: 'iphone-12 (390x844)', width: 390, height: 844 },
    { name: 'iphone-se (375x667)', width: 375, height: 667 },
  ]) {
    console.log(`\n=== ${vp.name} ===`);
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    await page.goto(FILE, { waitUntil: 'load' });
    await page.waitForTimeout(1200);

    const measure = () => page.evaluate(() => {
      const b = document.getElementById('boardCanvas').getBoundingClientRect();
      const t = document.getElementById('touch').getBoundingClientRect();
      const vw = innerWidth, vh = innerHeight;
      return {
        boardBottom: Math.round(b.bottom), touchTop: Math.round(t.top),
        overlap: b.bottom > t.top + 2,
        boardInView: b.bottom <= vh + 1 && b.top >= -1,
        scrollH: document.documentElement.scrollHeight, vh,
        deckH: Math.round(t.height),
      };
    });

    let m = await measure();
    check('initial: no board/deck overlap', !m.overlap, `board.bottom=${m.boardBottom} touch.top=${m.touchTop}`);
    check('initial: board on screen', m.boardInView);
    check('initial: no vertical overflow', m.scrollH <= m.vh, `scrollH=${m.scrollH} vh=${m.vh}`);

    // Simulate the mobile dynamic viewport: URL bar collapses (taller) then
    // expands (shorter), several times. After each resize the layout must
    // re-fit with NO overlap.
    const seq = [
      { h: vp.height - 120, label: 'URL bar expanded (shorter)' },
      { h: vp.height + 40,  label: 'URL bar collapsed (taller)' },
      { h: vp.height - 60,  label: 'URL bar half' },
      { h: vp.height,       label: 'back to full' },
    ];
    for (const s of seq) {
      await page.setViewportSize({ width: vp.width, height: s.h });
      await page.waitForTimeout(350); // let fitBoard/ResizeObserver settle
      m = await measure();
      check(`after ${s.label}: no overlap`, !m.overlap, `board.bottom=${m.boardBottom} touch.top=${m.touchTop} (deckH=${m.deckH})`);
      check(`after ${s.label}: board on screen`, m.boardInView, `board.bottom=${m.boardBottom} vh=${m.vh}`);
      check(`after ${s.label}: no vertical overflow`, m.scrollH <= m.vh + 1, `scrollH=${m.scrollH} vh=${m.vh}`);
    }

    // ---- gameplay end-to-end on the phone viewport ----
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(300);
    await page.tap('#startBtn');
    await page.waitForTimeout(500);
    const playing = await page.evaluate(() => G.state === 'playing');
    check('game starts (state=playing)', playing, 'state=' + await page.evaluate(() => G.state));

    const before = await page.evaluate(() => ({ score: G.score, lines: G.lines, pieceY: G.piece ? G.piece.y : -1 }));
    // move left, rotate, soft drop via the touch deck
    await page.tap('#touch button[data-act="left"]');
    await page.tap('#touch button[data-act="rotate"]');
    for (let i = 0; i < 3; i++) await page.tap('#touch button[data-act="down"]');
    await page.waitForTimeout(150);
    const mid = await page.evaluate(() => ({ score: G.score, pieceY: G.piece ? G.piece.y : -1 }));
    check('soft drop advanced piece', mid.pieceY > before.pieceY, `y ${before.pieceY} -> ${mid.pieceY}`);
    check('soft drop scored', mid.score > before.score, `score ${before.score} -> ${mid.score}`);

    // hard drop -> locks a piece
    await page.tap('#touch button[data-act="drop"]');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({
      lines: G.lines, score: G.score, hasPiece: !!G.piece,
      locked: G.grid.some(row => row.some(c => c)),
    }));
    check('hard drop locked a block', after.locked, 'grid has locked cells');
    check('a new piece spawned', after.hasPiece);

    // hold works
    const holdState = await page.evaluate(() => { doHold(); return G.hold; });
    check('hold swaps a piece', typeof holdState === 'string', 'hold=' + holdState);

    // pause / resume
    await page.tap('#touch button[data-act="left"]'); // no-op guard
    await page.evaluate(() => togglePause());
    const paused = await page.evaluate(() => G.state === 'paused');
    check('pause works', paused);
    await page.evaluate(() => togglePause());
    const resumed = await page.evaluate(() => G.state === 'playing');
    check('resume works', resumed);

    check('no JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));

    await page.screenshot({ path: path.join(__dirname, `dyn_${vp.name.replace(/[^a-z0-9]+/gi, '_')}.png`) });
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
