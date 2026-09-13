/* Reproduce the Android clip: the real Chrome viewport is much shorter than
   the full screen (status bar + URL bar + bottom toolbar + nav bar). Test at
   realistic SHORT viewports and measure how much the side panel's content
   overflows its box (which pushes NEXT off-screen and hides the deck). */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const b = await chromium.launch();
  // realistic Chrome-on-Android viewports (360 wide, shortened by browser chrome)
  for (const vp of [
    { name: 'chrome-360x560', width: 360, height: 560 },
    { name: 'chrome-360x600', width: 360, height: 600 },
    { name: 'chrome-412x640', width: 412, height: 640 },
  ]) {
    console.log(`\n=== ${vp.name} ===`);
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const p = await ctx.newPage();
    await p.goto(FILE, { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    const d = await p.evaluate(() => {
      const r = id => { const e = document.getElementById(id); if (!e) return null; const bb = e.getBoundingClientRect(); return { top: Math.round(bb.top), bottom: Math.round(bb.bottom), h: Math.round(bb.height), w: Math.round(bb.width) }; };
      const board = r('boardCanvas'), boardArea = r('boardArea'), sideM = r('sideM'), touch = r('touch');
      const panels = ['msScoreP','msLinesP','msLevelP','msHighP','pHoldM','pNextM'].map(id => {
        const e = document.getElementById(id); const bb = e.getBoundingClientRect();
        const cv = e.querySelector('canvas.mini'); const cb = cv ? cv.getBoundingClientRect() : null;
        return { id, h: Math.round(bb.height), bottom: Math.round(bb.bottom), canvasH: cb ? Math.round(cb.height) : null };
      });
      return {
        vh: innerHeight,
        board, boardArea, sideM, touch,
        sideScrollH: document.getElementById('sideM').scrollHeight,
        sideBoxH: Math.round(sideM.h),
        nextBottom: panels.find(x=>x.id==='pNextM').bottom,
        deckTop: Math.round(touch.top),
        panels,
      };
    });
    console.log(`  vh=${d.vh}  boardArea.h=${d.boardArea.h}  sideM.boxH=${d.sideM.h} sideM.scrollH=${d.sideScrollH}`);
    console.log(`  sideM.content overflow = ${d.sideScrollH - d.sideBoxH}px`);
    console.log(`  NEXT bottom=${d.nextBottom}  deck top=${d.deckTop}  (NEXT clipped past deck? ${d.nextBottom > d.deckTop})`);
    console.log(`  board bottom=${d.board.bottom}  deck top=${d.deckTop}  (board clipped? ${d.board.bottom > d.deckTop})`);
    console.log(`  sideM.bottom=${d.sideM.bottom}  vh=${d.vh}  (side panel off-screen? ${d.sideM.bottom > d.vh})`);
    for (const pn of d.panels) console.log(`    ${pn.id}: h=${pn.h} bottom=${pn.bottom} canvasH=${pn.canvasH}`);
    await p.screenshot({ path: path.join(__dirname, `repro_${vp.name}.png`) });
    await ctx.close();
  }
  await b.close();
  console.log('\ndone');
})();
