/* Verify the resync fix in musicTick.
   The guard: if the scheduler fell >0.5s behind the audio clock, re-anchor
   M.nextT to now+0.05 instead of replaying every missed step. So during a
   drift-recovery, ZERO past-timed notes should be scheduled. Before the fix,
   a 6s drift dumped ~54 past-timed notes in the catch-up.

   We wrap scheduleStep (top-level fn => window.scheduleStep intercepts the
   real call) and count notes scheduled with t < now-1ms.

   Run: node music_fix_verify.js   (from .qa/)
*/
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);

  const result = await page.evaluate(async () => {
    // Count past-timed notes scheduled by the REAL scheduler.
    let past = 0;
    const orig = window.scheduleStep;
    window.scheduleStep = function (step, t) {
      if (t < AC.currentTime - 0.001) past++;
      return orig(step, t);
    };

    // ---- 1. HEALTHY: 3s of normal play -> no past-timed notes, stays ahead ----
    past = 0;
    await new Promise(r => setTimeout(r, 3000));
    const healthy = {
      pastNotes: past,                                   // expect 0
      lag: +(AC.currentTime - M.nextT).toFixed(3),       // negative = ahead
      ahead: (AC.currentTime - M.nextT) < 0,
    };

    // ---- 2. DRIFT: force a 6s fall-behind (simulated throttled tab), recover ----
    const before = { step: M.step, nextT: M.nextT, t: AC.currentTime };
    M.nextT = AC.currentTime - 6;
    past = 0;                                            // count only the recovery
    await new Promise(r => setTimeout(r, 600));
    const after = { step: M.step, nextT: M.nextT, t: AC.currentTime };
    const drift = {
      before, after,
      lagAfter: +(after.t - after.nextT).toFixed(3),
      pastNotesInRecovery: past,                         // BEFORE fix: ~54; AFTER: 0
      reanchored: after.nextT > before.t,                // clock moved forward
      stillAhead: (after.t - after.nextT) < 0,
    };

    window.scheduleStep = orig;
    return { healthy, drift };
  });

  console.log(JSON.stringify(result, null, 2));
  console.log('pageerrors:', errors);
  const ok =
    result.healthy.ahead && result.healthy.pastNotes === 0 &&
    result.drift.pastNotesInRecovery <= 1 &&
    result.drift.reanchored && result.drift.stillAhead;
  console.log(ok ? 'FIX VERIFIED: healthy=seamless & ahead, drift=re-anchored with no past-timed burst'
                : 'FIX NOT VERIFIED');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
