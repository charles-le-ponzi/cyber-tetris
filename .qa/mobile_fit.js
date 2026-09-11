/* Tight feedback loop: assert the mobile portrait UI (v6: board + side panel)
   fits the screen. RED on the user's symptom (board/buttons don't fit / grey
   overlap), GREEN when fixed. */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

const VIEWPORTS = [
  { name: 'iphone-se (375x667)',  width: 375, height: 667 },
  { name: 'iphone-12 (390x844)',  width: 390, height: 844 },
  { name: 'small (320x568)',      width: 320, height: 568 },
  { name: 'tall (430x932)',       width: 430, height: 932 },
  { name: 'wide-portrait (560x1024)', width: 560, height: 1024 },
];

let failures = 0;
function check(name, cond, detail) {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    console.log(`\n=== ${vp.name} ===`);
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    await page.goto(FILE, { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    const data = await page.evaluate(() => {
      const vw = innerWidth, vh = innerHeight;
      const inView = r => r.top >= -1 && r.left >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1;
      const board = document.getElementById('boardCanvas').getBoundingClientRect();
      const touch = document.getElementById('touch').getBoundingClientRect();
      const sideM = document.getElementById('sideM').getBoundingClientRect();
      const holdM = document.getElementById('pHoldM').getBoundingClientRect();
      const nextM = document.getElementById('pNextM').getBoundingClientRect();
      const iconBtns = document.getElementById('iconBtns').getBoundingClientRect();
      const btns = [...document.querySelectorAll('#touch button')].map(b => {
        const r = b.getBoundingClientRect();
        return { act: b.dataset.act, inView: inView(r), w: Math.round(r.width), h: Math.round(r.height) };
      });
      // is the board frame grey chrome? check boardWrap inner bg is dark/translucent (no metallic gradient)
      const innerBg = getComputedStyle(document.querySelector('#boardWrap .inner')).background;
      return {
        vw, vh,
        scrollW: document.documentElement.scrollWidth,
        scrollH: document.documentElement.scrollHeight,
        board: { top: Math.round(board.top), bottom: Math.round(board.bottom), left: Math.round(board.left), right: Math.round(board.right), w: Math.round(board.width), h: Math.round(board.height), inView: inView(board) },
        touch: { top: Math.round(touch.top), bottom: Math.round(touch.bottom), inView: inView(touch) },
        sideM: { top: Math.round(sideM.top), bottom: Math.round(sideM.bottom), left: Math.round(sideM.left), right: Math.round(sideM.right), inView: inView(sideM) },
        holdM: { inView: inView(holdM) },
        nextM: { inView: inView(nextM) },
        iconBtns: { inView: inView(iconBtns) },
        btns,
        boardRightOfSide: board.right <= sideM.left + 2,
        sideRightOfBoard: sideM.left >= board.right - 2,
      };
    });

    check('no horizontal overflow', data.scrollW <= data.vw, `scrollW=${data.scrollW} vs vw=${data.vw}`);
    check('no vertical overflow', data.scrollH <= data.vh, `scrollH=${data.scrollH} vs vh=${data.vh}`);
    check('board fully on screen', data.board.inView, `board ${data.board.w}x${data.board.h}`);
    check('board is 1:2 aspect', Math.abs(data.board.h - data.board.w * 2) <= 2, `${data.board.w}x${data.board.h}`);
    check('board big enough to play', data.board.h >= 300, `h=${data.board.h}`);
    check('board sits LEFT of side panel', data.boardRightOfSide, `board.right=${data.board.right} side.left=${data.sideM.left}`);
    check('side panel fully on screen', data.sideM.inView, JSON.stringify(data.sideM));
    check('hold panel on screen', data.holdM.inView);
    check('next panel on screen', data.nextM.inView);
    check('icon buttons on screen', data.iconBtns.inView);
    check('touch deck fully on screen', data.touch.inView, `top=${data.touch.top} bottom=${data.touch.bottom} (vh=${data.vh})`);
    const badBtns = data.btns.filter(b => !b.inView);
    check('all 6 touch buttons on screen', badBtns.length === 0 && data.btns.length === 6, `${data.btns.length} btns` + (badBtns.length ? ' missing: ' + badBtns.map(b => b.act).join(',') : ''));
    const tiny = data.btns.filter(b => b.w < 40 || b.h < 34);
    check('touch buttons thumb-sized (>=40x34)', tiny.length === 0, tiny.length ? tiny.map(b => `${b.act}:${b.w}x${b.h}`).join(',') : 'ok');
    check('board bottom above touch deck top', data.board.bottom <= data.touch.top + 2, `board.bottom=${data.board.bottom} touch.top=${data.touch.top}`);
    check('no JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));

    await page.screenshot({ path: path.join(__dirname, `shot_${vp.name.replace(/[^a-z0-9]+/gi, '_')}.png`) });
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'} `);
  process.exit(failures === 0 ? 0 : 1);
})();
