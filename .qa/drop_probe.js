const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.tap('#startBtn');
  await page.waitForTimeout(200);
  for (let i = 1; i <= 70; i++) {
    await page.tap('#touch button[data-act="drop"]');
    await page.waitForTimeout(45);
    if (i % 10 === 0) {
      const s = await page.evaluate(() => ({ state: G.state, score: G.score, lines: G.lines, top: G.grid ? G.grid.findIndex(r => r.some(Boolean)) : -1 }));
      console.log(`drop ${i}: state=${s.state} score=${s.score} lines=${s.lines} topRow=${s.top}`);
    }
  }
  const final = await page.evaluate(() => ({ state: G.state, score: G.score, lines: G.lines }));
  console.log('FINAL', JSON.stringify(final));
  await browser.close();
})();
