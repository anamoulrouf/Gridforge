// Visual + smoke pass over Stages 2–5 (playwright MCP, `filename`): load each stage through the
// campaign, run its reference build, advance a few hours, capture start/day/night/close-up shots,
// open each new panel, and collect console errors and fps. Writes review/s{N}-*.jpg.
async (page) => {
  const errors = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4173/gridforge.html');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('gridforge.settings.v1', JSON.stringify({ tutorial: false, unlockAll: true, autoPause: false })); });
  await page.goto('http://localhost:4173/gridforge.html?test=1&fps=1');
  await page.waitForTimeout(1000);
  const out = {};
  const closeModals = async () => {
    for (let i = 0; i < 6; i++) {
      const b = page.locator('.modal button.primary').last();
      if (await b.count()) await b.click().catch(() => {});
      else break;
      await page.waitForTimeout(150);
    }
  };
  const shots = {
    2: [['town', -40, 0, 220], ['estate', 130, 60, 200], ['gen', -205, 0, 160]],
    3: [['park', 380, -40, 260], ['coal', -430, -60, 240], ['town', 10, 0, 260]],
    4: [['town', 20, 40, 300], ['ridge', 280, -200, 260], ['marsh', -140, 150, 240]],
    5: [['city', 0, -20, 420], ['ev', 120, 100, 200], ['business', 150, -90, 240]],
  };
  for (const n of [2, 3, 4, 5]) {
    await page.evaluate((n) => __gf.startStage(n), n);
    await page.waitForTimeout(1800);
    await closeModals();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `review/s${n}-start.jpg`, type: 'jpeg', quality: 80 });
    await page.evaluate(() => __gf.refBuild());
    await page.waitForTimeout(500);
    out['s' + n] = await page.evaluate(() => ({ powered: __gf.state().flow.powered, total: __gf.state().flow.activeCount, built: Object.keys(__gf.state().built) }));
    for (const p of ['mix', 'finance', 'trust', 'programs']) {
      await closeModals();
      await page.evaluate((p) => __gf.panel(p), p);
      await page.waitForTimeout(250);
      await closeModals();
      if (await page.locator('#inspector:not([hidden])').count()) await page.locator('#inspector').screenshot({ path: `review/s${n}-panel-${p}.jpg`, type: 'jpeg', quality: 80 });
    }
    await page.keyboard.press('Escape');
    await page.evaluate(() => __gf.skipHours(4));
    await page.waitForTimeout(800);
    await closeModals();
    for (const [name, x, z, d] of shots[n]) {
      await page.evaluate(([x, z, d]) => __gf.focusAt(x, z, d), [x, z, d]);
      await page.waitForTimeout(1300);
      await closeModals();
      await page.screenshot({ path: `review/s${n}-${name}.jpg`, type: 'jpeg', quality: 80 });
    }
    await page.evaluate(() => __gf.skipHours(10));
    await page.waitForTimeout(800);
    await closeModals();
    await page.evaluate(([x, z, d]) => __gf.focusAt(x, z, d), shots[n][0].slice(1));
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `review/s${n}-night.jpg`, type: 'jpeg', quality: 80 });
    out['s' + n].fps = await page.evaluate(() => __gf.fps());
    out['s' + n].clock = await page.evaluate(() => __gf.state().clock);
  }
  return { errors: errors.slice(0, 10), nErr: errors.length, out };
}
