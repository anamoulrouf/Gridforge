// Round-3 review captures: building close-ups by day, islands, and every objective card in
// several phases (run via the playwright MCP with `filename`). Writes review/r3x-*.jpg.
async (page) => {
  const errors = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const W = 1440;
  await page.setViewportSize({ width: W, height: 900 });
  await page.goto('http://localhost:4173/gridforge.html');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('gridforge.settings.v1', JSON.stringify({ tutorial: false })); });
  await page.goto('http://localhost:4173/gridforge.html?test=1');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'New Game' }).click();
  await page.waitForTimeout(1200);
  const ev = (fn, a) => page.evaluate(fn, a);
  const closeLearn = async () => { for (const b of await page.locator('.learn button.primary').all()) await b.click().catch(() => {}); };
  const cards = {};
  const card = async (id, tag) => {
    for (let i = 0; i < 4 && (await page.locator('.modal-wrap:not(.side) .modal button.primary').count()); i++) await page.locator('.modal-wrap:not(.side) .modal button.primary').last().click().catch(() => {});
    await closeLearn();
    await page.mouse.move(W / 2, 450);
    await page.waitForTimeout(250);
    for (let i = 0; i < 4; i++) {
      try {
        await page.locator(`.obj[data-obj="${id}"]`).hover({ timeout: 2500 });
        break;
      } catch {
        for (const b of await page.locator('.modal button.primary').all()) await b.click().catch(() => {});
      }
    }
    await page.waitForTimeout(350);
    if (!(await page.locator('#objcard').isVisible())) {
      for (const b of await page.locator('.modal button.primary').all()) await b.click().catch(() => {});
      await page.mouse.move(W / 2, 450);
      await page.locator(`.obj[data-obj="${id}"]`).hover({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(350);
    }
    const t = await page.locator('#objcard').innerText().catch(() => '');
    cards[`${id}@${tag}`] = t.split('RIGHT NOW')[1]?.split('\n').filter(Boolean).slice(0, 6).join(' | ');
    const box = await page.locator('#objcard').boundingBox();
    cards[`${id}@${tag}:box`] = box && [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)];
    return t;
  };
  // phase 0: nothing built
  for (const id of ['inspect', 'route', 'xfmr', 'connect', 'start', 'revenue', 'fault', 'stable', 'service', 'losses']) await card(id, 'empty');
  await card('route', 'empty');
  await page.locator('#objcard').screenshot({ path: 'review/r3x-card-route-empty.jpg', type: 'jpeg', quality: 85 });
  // phase 1: MV only
  const build = (from, to) => ev(([a, b]) => {
    const sim = __gf.sim(); let last = null;
    const at = (x, z) => Object.keys(sim.state.nodes).find((id) => Math.hypot(sim.state.nodes[id].x - x, sim.state.nodes[id].z - z) < 1);
    for (const s of sim.map.reference.slice(a, b)) {
      const f = s.from === '@last' ? last : typeof s.from === 'string' && s.from.startsWith('@node:') ? at(...s.from.slice(6).split(',').map(Number)) : s.from;
      if (s.type === 'line') last = sim.cmd({ type: 'line', from: f, to: s.to }).last;
      else if (s.type === 'transformer') sim.cmd({ type: 'transformer', at: s.at === '@last' ? last || at(4, -8) : s.at });
      else sim.cmd({ type: 'drop', building: s.building });
    }
  }, [from, to]);
  await build(0, 3);
  await card('route', 'mv');
  await card('xfmr', 'mv');
  await build(3, 100);
  await card('connect', 'built');
  await card('start', 'off');
  await ev(() => __gf.cmd({ type: 'startGen' }));
  await page.waitForTimeout(300);
  await card('start', 'starting');
  for (let i = 0; i < 3; i++) { await ev(() => __gf.skipHours(0.25)); await closeLearn(); }
  await card('start', 'running');
  await card('revenue', 'running');
  await card('stable', 'prefault');
  await card('service', 'evening');
  await card('losses', 'running');
  // to day 2 noon
  await ev(() => __gf.skipHours(19));
  await closeLearn();
  await card('revenue', 'billed');
  await card('service', 'noon');
  await card('fault', 'pending');
  // close-ups (day)
  await page.mouse.move(W / 2, 450);
  const shots = [['home', -12, -18, 60], ['school', 4, -42, 75], ['clinic', 8, 22, 65], ['market', 60, 24, 65], ['gen', -106, -22, 65], ['depot', 114, 28, 70], ['xfmr', 4, -8, 45], ['homes-s', -10, 32, 80]];
  await ev(() => document.getElementById('objectives').style.visibility = 'hidden');
  for (const [n, x, z, d] of shots) {
    await ev(([x, z, d]) => __gf.focusAt(x, z, d), [x, z, d]);
    await page.waitForTimeout(1300);
    await closeLearn();
    await page.screenshot({ path: `review/r3x-${n}.jpg`, type: 'jpeg', quality: 82 });
  }
  await ev(() => document.getElementById('objectives').style.visibility = '');
  // fault warn / active
  for (let i = 0; i < 40 && (await ev(() => __gf.state().fault.phase)) === 'pending'; i++) { await ev(() => __gf.skipHours(0.25)); await closeLearn(); }
  await page.waitForTimeout(2500);
  await card('fault', 'warn');
  if (await page.locator('#objcard').isVisible()) await page.locator('#objcard').screenshot({ path: 'review/r3x-card-fault-warn.jpg', type: 'jpeg', quality: 85 });
  else cards.warnCardHidden = await ev(() => [...document.querySelectorAll('.modal-wrap')].map((m) => m.innerText.slice(0, 80)));
  for (let i = 0; i < 8 && (await ev(() => __gf.state().fault.phase)) === 'warn'; i++) { await ev(() => __gf.skipHours(0.25)); await closeLearn(); }
  await card('fault', 'active');
  await ev(() => { const s = __gf.state(); __gf.cmd({ type: 'repair', target: s.fault.target }); });
  await ev(() => __gf.skipHours(0.25));
  await closeLearn();
  await card('fault', 'crew');
  for (let i = 0; i < 24 && (await ev(() => __gf.state().fault.phase)) !== 'repaired'; i++) { await ev(() => __gf.skipHours(0.25)); await closeLearn(); }
  await ev(() => __gf.skipHours(3));
  await closeLearn();
  await page.waitForTimeout(2500);
  await card('stable', 'counting');
  if (await page.locator('#objcard').isVisible()) await page.locator('#objcard').screenshot({ path: 'review/r3x-card-stable.jpg', type: 'jpeg', quality: 85 });
  // 720p layout of a long card
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(400);
  await card('connect', '720p');
  await page.screenshot({ path: 'review/r3x-720p-card.jpg', type: 'jpeg', quality: 82 });
  // keyboard focus + pin + Esc
  await page.mouse.move(700, 400);
  await page.locator('.obj[data-obj="route"]').focus();
  await page.waitForTimeout(250);
  const focusOpen = await page.locator('#objcard').isVisible();
  await page.keyboard.press('Enter');
  await page.mouse.move(900, 500);
  await page.waitForTimeout(500);
  const pinnedStays = await page.locator('#objcard').isVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const escCloses = !(await page.locator('#objcard').isVisible());
  const paused = await page.locator('.modal', { hasText: 'Simulation paused' }).count();
  return { errors, focusOpen, pinnedStays, escCloses, pausedByThatEsc: paused, fps: await ev(() => __gf.fps()), cards };
}
