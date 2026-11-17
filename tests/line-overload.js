// Line-congestion explanation (playwright MCP, `filename`). Stage 3: feed Ironvale Steel (2 MW)
// through an 11 kV line (rated 1.5 MW) instead of straight from the substation, then check that the
// overload alert names the mill, gives a fix that works in this model, and that "How to fix" opens
// the learning card. Then apply the suggested fix (drop the mill straight onto the substation) and
// check the line is no longer overloaded.
async (page) => {
  const errors = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4173/gridforge.html');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('gridforge.settings.v1', JSON.stringify({ tutorial: false, unlockAll: true, autoPause: false })); });
  await page.goto('http://localhost:4173/gridforge.html?test=1');
  await page.waitForTimeout(800);
  await page.evaluate(() => __gf.startStage(3));
  await page.waitForTimeout(1500);
  const closeModals = async () => {
    for (let i = 0; i < 6; i++) {
      const b = page.locator('.modal button.primary').last();
      if (await b.count()) await b.click().catch(() => {});
      else break;
      await page.waitForTimeout(150);
    }
  };
  await closeModals();
  const setup = await page.evaluate(() => {
    __gf.refBuild();
    const st = __gf.state();
    const sub = Object.values(st.nodes).find((n) => n.kind === 'xfmr' && n.ratio === 'HV/MV' && Math.hypot(n.x - 352, n.z + 60) < 5);
    const dropId = Object.keys(st.edges).find((id) => st.edges[id].kind === 'drop' && st.edges[id].b === 'mill');
    const r1 = __gf.cmd({ type: 'remove', target: dropId });
    const r2 = __gf.cmd({ type: 'line', from: sub.id, tier: 'down', to: { x: 318, z: -60 } });
    const r3 = __gf.cmd({ type: 'drop', building: 'mill', from: r2.id || Object.keys(__gf.state().nodes).pop() });
    return { sub: sub.id, r1: r1.ok, r2: r2.ok || r2.reason, r3: r3.ok || r3.reason };
  });
  // run until the line overloads (mill on shift)
  let alertText = null;
  for (let i = 0; i < 400 && !alertText; i++) {
    await page.evaluate(() => __gf.skipHours(5 / 60));
    await page.waitForTimeout(60);
    const a = page.locator('.alert', { hasText: 'line overloaded' });
    if (await a.count()) alertText = await a.first().innerText();
  }
  await page.waitForTimeout(600);
  // the learning card opens automatically the first time
  const card = page.locator('.modal.learn');
  const cardText = (await card.count()) ? await card.first().innerText() : null;
  await page.screenshot({ path: 'review/r6-congestion-card.jpg', type: 'jpeg', quality: 80 });
  if (await card.count()) await card.locator('button.primary').click();
  await page.waitForTimeout(300);
  await page.locator('.alert', { hasText: 'line overloaded' }).first().screenshot({ path: 'review/r6-congestion-alert.jpg', type: 'jpeg', quality: 85 });
  // "How to fix" reopens it
  await closeModals();
  await page.locator('.alert', { hasText: 'line overloaded' }).first().getByRole('button', { name: 'How to fix' }).click();
  await page.waitForTimeout(400);
  const reopened = await page.locator('.modal.learn', { hasText: 'A line is overloaded' }).count();
  await page.screenshot({ path: 'review/r6-congestion-card.jpg', type: 'jpeg', quality: 80 });
  await closeModals();
  // Focus → inspector explains too
  await page.locator('.alert', { hasText: 'line overloaded' }).first().getByRole('button', { name: 'Focus' }).click();
  await page.waitForTimeout(900);
  const insp = await page.locator('#inspector').innerText().catch(() => '');
  await page.locator('#inspector').screenshot({ path: 'review/r6-congestion-inspector.jpg', type: 'jpeg', quality: 80 }).catch(() => {});
  // apply the advice: mill straight onto the substation
  const after = await page.evaluate((sub) => {
    const st = __gf.state();
    const dropId = Object.keys(st.edges).find((id) => st.edges[id].kind === 'drop' && st.edges[id].b === 'mill');
    __gf.cmd({ type: 'remove', target: dropId });
    const r = __gf.cmd({ type: 'drop', building: 'mill', from: sub });
    __gf.skipHours(1);
    const lines = Object.values(__gf.state().edges).filter((e) => e.kind === 'line' && e.tier === 'MV');
    return { redrop: r.ok || r.reason, maxMVpct: Math.round(Math.max(...lines.map((e) => e.loadPct || 0))), millOn: __gf.state().cust.mill.status };
  }, setup.sub);
  return { setup, alertText, cardText, reopened, inspHasFix: /How to fix/.test(insp) && /Ironvale Steel/.test(insp), after, errors };
}
