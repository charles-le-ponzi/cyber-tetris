/* Isolate the fix: same in-flow layout, only the ResizeObserver target differs.
   OLD-copy = current file but observer watches boardWrap (the bug).
   NEW      = current file, observer watches boardArea (the fix).
   Trigger = deck grows taller AFTER load WITHOUT a window resize event
   (the real Android trigger: webfont load / safe-area / URL-bar update). */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

function fileURL(p) { return 'file:///' + p.replace(/\\/g, '/'); }
const repo = path.resolve(__dirname, '..');
const curFile = path.join(repo, 'index.html');
const cur = fs.readFileSync(curFile, 'utf8');

// OLD copy: revert the observer to boardWrap (the bug)
const oldCopy = cur.replace(
  'new ResizeObserver(()=>fitBoard()).observe(document.getElementById("boardArea"));',
  'new ResizeObserver(()=>fitBoard()).observe(document.getElementById("boardWrap"));'
);
if (oldCopy === cur) { console.error('could not patch observer line'); process.exit(2); }
const oldFile = path.join(__dirname, '_old_isolated.html');
fs.writeFileSync(oldFile, oldCopy);

async function test(browser, file, label) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 608 }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  });
  const p = await ctx.newPage();
  await p.goto(fileURL(file), { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const before = await p.evaluate(() => ({
    deckH: Math.round(document.getElementById('touch').getBoundingClientRect().height),
    boardH: Math.round(document.getElementById('boardCanvas').getBoundingClientRect().height),
    boardAreaH: Math.round(document.getElementById('boardArea').getBoundingClientRect().height),
  }));
  // REAL TRIGGER: deck grows taller after load, NO window resize event.
  await p.evaluate(() => { document.getElementById('touch').style.paddingBottom = 'calc(8px + 44px)'; });
  await p.waitForTimeout(900);
  const d = await p.evaluate(() => {
    const cv = document.getElementById('boardCanvas').getBoundingClientRect();
    const t = document.getElementById('touch').getBoundingClientRect();
    const ba = document.getElementById('boardArea').getBoundingClientRect();
    const next = document.getElementById('pNextM').getBoundingClientRect();
    return {
      vh: innerHeight, boardW: Math.round(cv.width), boardH: Math.round(cv.height),
      boardAreaH: Math.round(ba.height), deckTop: Math.round(t.top), deckH: Math.round(t.height),
      boardOverflowsDeck: cv.bottom > t.top + 2, nextClipped: next.bottom > t.top + 2,
      deckVisible: t.top < innerHeight && t.bottom <= innerHeight + 1,
    };
  });
  const ok = !d.boardOverflowsDeck && !d.nextClipped && d.deckVisible;
  console.log(`\n=== ${label} (360x608 Android) ===`);
  console.log(`  before: deckH=${before.deckH} boardH=${before.boardH} boardAreaH=${before.boardAreaH}`);
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] after deck-grow (no window resize): board=${d.boardW}x${d.boardH} boardAreaH=${d.boardAreaH} deckTop=${d.deckTop} deckH=${d.deckH} vh=${d.vh}`);
  console.log(`         overflow=${d.boardOverflowsDeck} nextClipped=${d.nextClipped} deckVisible=${d.deckVisible}`);
  await p.screenshot({ path: path.join(__dirname, `iso_${label.replace(/[^a-z0-9]+/gi, '_')}.png`) });
  await ctx.close();
  return ok;
}

(async () => {
  const b = await chromium.launch();
  const oldOk = await test(b, oldFile, 'OLD boardWrap');
  const newOk = await test(b, curFile, 'NEW boardArea');
  fs.unlinkSync(oldFile);
  await b.close();
  console.log(`\nOLD passes: ${oldOk}   NEW passes: ${newOk}`);
  console.log(newOk && !oldOk ? '=> FIX CONFIRMED: boardArea observer re-fits, boardWrap does not' : '=> need another repro');
  process.exit(newOk ? 0 : 1);
})();
