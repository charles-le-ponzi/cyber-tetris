const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const d = await page.evaluate(() => {
    const r = id => { const e = document.getElementById(id); if(!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), w: Math.round(b.width), disp: getComputedStyle(e).display }; };
    const sideM = document.getElementById('sideM');
    return {
      sideM: r('sideM'),
      boardArea: r('boardArea'),
      holdM: r('pHoldM'),
      nextM: r('pNextM'),
      holdCanvas: r('holdCanvasM'),
      nextCanvas: r('nextCanvasM'),
      msScore: r('msScoreP'),
      sideMChildren: [...sideM.children].map(c => ({ id: c.id, h: Math.round(c.getBoundingClientRect().height) })),
    };
  });
  console.log(JSON.stringify(d, null, 2));
  await browser.close();
})();
