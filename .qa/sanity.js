/* Sanity: confirm the portrait fix did NOT break the landscape phone layout,
   and capture a clean portrait screenshot of the fixed build. */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const b = await chromium.launch();

  // landscape phone (should be untouched by the portrait-only changes)
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(FILE, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const d = await p.evaluate(() => {
    const bc = document.getElementById('boardCanvas').getBoundingClientRect();
    const t = document.getElementById('touch').getBoundingClientRect();
    const cs = getComputedStyle(document.getElementById('touch'));
    return {
      boardBottom: Math.round(bc.bottom), touchTop: Math.round(t.top), vh: innerHeight,
      touchDisplay: cs.display, touchPos: cs.position,
      scrollH: document.documentElement.scrollHeight,
    };
  });
  console.log('LANDSCAPE:', JSON.stringify(d));
  console.log('  board/deck overlap?', d.boardBottom > d.touchTop + 2);
  console.log('  js errors:', errs.length);
  await p.screenshot({ path: path.join(__dirname, 'sanity_landscape.png') });
  await ctx.close();

  // clean portrait screenshot of the fixed build
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p2 = await ctx2.newPage();
  await p2.goto(FILE, { waitUntil: 'load' });
  await p2.waitForTimeout(1500);
  await p2.screenshot({ path: path.join(__dirname, 'fixed_portrait.png') });
  await ctx2.close();

  await b.close();
  console.log('done');
})();
