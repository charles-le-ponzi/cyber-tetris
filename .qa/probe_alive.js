const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  // Is the game actually alive? Probe for the loop + state.
  const probe = await page.evaluate(() => {
    const out = {};
    try { out.hasG = typeof G; out.gState = (typeof G !== 'undefined') ? G.state : 'n/a'; } catch (e) { out.hasG = 'TDZ: ' + e.message; }
    try { out.hasLoop = typeof loop; } catch (e) { out.hasLoop = 'TDZ'; }
    try {
      const btn = document.getElementById('startBtn');
      const before = (typeof G !== 'undefined') ? G.state : 'no-G';
      btn && btn.click();
      const after = (typeof G !== 'undefined') ? G.state : 'no-G';
      out.click = { before, after };
    } catch (e) { out.click = 'ERR ' + e.message; }
    return out;
  });
  console.log('pageerrors:', errors);
  console.log('probe:', JSON.stringify(probe, null, 2));
  await browser.close();
})();
