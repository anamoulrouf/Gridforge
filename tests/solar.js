// Rooftop solar (playwright MCP, `filename`): enrol two Stage 4 streets in the solar programme and
// check the fitted roof arrays appear only on enrolled homes; Stage 5 streets start with panels.
// Writes review/solar-s4.jpg and review/solar-s5.jpg. Requires `node serve.mjs`.
async (page) => {
  const errors = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4173/gridforge.html');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('gridforge.settings.v1', JSON.stringify({ tutorial: false, unlockAll: true, autoPause: false })); });
  const out = {};
  for (const n of [4, 5]) {
    await page.goto('http://localhost:4173/gridforge.html?test=1&seed=1');
    await page.waitForTimeout(700);
    await page.evaluate((n) => __gf.startStage(n), n);
    await page.waitForTimeout(1500);
    for (let i = 0; i < 6; i++) { const b = page.locator('.modal-wrap').last().locator('button.primary').last(); if (await b.count()) await b.click().catch(() => {}); else break; await page.waitForTimeout(150); }
    await page.evaluate(() => { __gf.refBuild(); if (!__gf.state().started) __gf.cmd({ type: 'begin' }); __gf.cmd({ type: 'startGen' }); });
    if (n === 4) await page.evaluate(() => { __gf.state().credits += 9000; for (const id of ['st1', 'st2']) __gf.cmd({ type: 'program', id: 'rooftop', target: id }); });
    await page.waitForTimeout(600);
    for (let i = 0; i < 6; i++) { const b = page.locator('.modal-wrap').last().locator('button.primary').last(); if (await b.count()) await b.click().catch(() => {}); else break; await page.waitForTimeout(200); }
    await page.evaluate(() => __gf.setSpeed?.(0));
    const id = n === 4 ? 'st1' : 's1';
    out['vis' + n] = await page.evaluate((id) => ({ pv: __gf.world.buildings[id].pv?.visible }), id);
    await page.evaluate((id) => { const b = __gf.world.buildings[id]; __gf.focusAt(b.c.x, b.c.z, 75); }, id);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `review/solar-s${n}.jpg`, type: 'jpeg', quality: 80 });
    if (n === 4) out.unenrolled = await page.evaluate(() => __gf.world.buildings.st4.pv?.visible);
  }
  return { out, errors };
}
