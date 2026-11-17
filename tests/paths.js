// Verifies GDD §21 acceptance paths through the real UI (run via playwright MCP).
async (page) => {
  const R = {};
  const errors = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const W = (t) => ev((t) => __gf.worldToScreen(t), t);
  const click = async (t, opts = {}) => {
    const p = await W(t);
    await page.mouse.click(p.x, p.y, opts);
    await page.waitForTimeout(200);
  };
  const closeLearn = async () => {
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(500);
      const b = page.locator('.learn button.primary');
      if (!(await b.count())) break;
      await b.first().click();
    }
  };
  const shot = (n) => page.screenshot({ path: `review/path-${n}.jpg`, type: 'jpeg', quality: 80 });
  const buildRef = (singleXfmr) =>
    ev((single) => {
      const sim = __gf.sim();
      let last = null;
      const at = (x, z) => Object.keys(sim.state.nodes).find((id) => Math.hypot(sim.state.nodes[id].x - x, sim.state.nodes[id].z - z) < 1);
      const steps = single
        ? [
            { type: 'line', from: 'gen', to: { x: -62, z: -8 } }, { type: 'line', from: '@last', to: { x: -24, z: -8 } }, { type: 'line', from: '@last', to: { x: 4, z: -8 } }, { type: 'transformer', at: '@last' },
            { type: 'line', from: '@node:4,-8', to: { x: 28, z: -8 } }, { type: 'line', from: '@last', to: { x: 50, z: -12 } }, { type: 'line', from: '@last', to: { x: 50, z: -30 } }, { type: 'line', from: '@node:4,-8', to: { x: 4, z: -28 } },
            { type: 'line', from: '@node:4,-8', to: { x: -2, z: 10 } }, { type: 'line', from: '@last', to: { x: -2, z: 30 } }, { type: 'line', from: '@node:-2,10', to: { x: 24, z: 10 } }, { type: 'line', from: '@last', to: { x: 48, z: 12 } }, { type: 'line', from: '@last', to: { x: 72, z: 12 } }, { type: 'line', from: '@node:48,12', to: { x: 50, z: 36 } },
            ...sim.map.customers.map((c) => ({ type: 'drop', building: c.id })),
          ]
        : sim.map.reference;
      for (const s of steps) {
        const from = s.from === '@last' ? last : typeof s.from === 'string' && s.from.startsWith('@node:') ? at(...s.from.slice(6).split(',').map(Number)) : s.from;
        if (s.type === 'line') last = sim.cmd({ type: 'line', from, to: s.to }).last;
        else if (s.type === 'transformer') sim.cmd({ type: 'transformer', at: s.at === '@last' ? last : s.at });
        else sim.cmd({ type: 'drop', building: s.building });
      }
      return sim.state.flow.connected;
    }, singleXfmr);

  try {
  // 1. Intro is skippable → main menu
  await page.goto('http://localhost:4173/gridforge.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:4173/gridforge.html?fps=1');
  await page.waitForTimeout(2500);
  await shot('01-intro');
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  R.introSkip = (await page.locator('#menu').count()) === 1;
  // 2. How to Play (tabs) and Settings (sound off)
  await page.getByRole('button', { name: 'How to Play' }).click();
  await page.getByRole('tab', { name: 'Electricity basics' }).click();
  await shot('02-howto');
  R.howTo = (await page.locator('.modal').innerText()).includes('kWh');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('switch', { name: 'Sound', exact: true }).click();
  await shot('03-settings');
  R.soundOff = (await ev(() => JSON.parse(localStorage.getItem('gridforge.settings.v1')).sound)) === false;
  R.endingShortcut = (await page.getByRole('button', { name: 'Play ending' }).count()) === 1;
  await page.getByRole('switch', { name: 'Sound', exact: true }).click();
  await page.getByRole('switch', { name: 'Guided tutorial' }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  // 3. New game (tutorial off) — ghost preview visible
  await page.goto('http://localhost:4173/gridforge.html?test=1');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'New Game' }).click();
  await page.waitForTimeout(1200);
  await page.mouse.move(720, 450);
  await page.keyboard.press('l');
  await click('gen');
  const p = await W({ x: -30, z: -8 });
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(400);
  await shot('04-ghost');
  R.ghostTip = (await page.locator('#cursor-tip').innerText()).includes('11 kV line');
  const bad = await W({ x: -40, z: 0 });
  await page.mouse.move(bad.x, bad.y);
  await page.waitForTimeout(300);
  R.invalidReason = (await page.locator('#cursor-tip').innerText()).includes('road');
  await page.mouse.click(720, 450, { button: 'right' });
  await page.keyboard.press('v');

  // 4. Single transformer → forecast + overload + trip → reset (Balance)
  R.connected = await buildRef(true);
  await click('gen');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.waitForTimeout(600);
  R.forecastAlert = (await page.locator('.alert', { hasText: 'forecast' }).count()) > 0;
  await shot('05-forecast');
  for (let i = 0; i < 12 && !(await ev(() => __gf.state().stats.trips > 0)); i++) {
    await ev(() => __gf.skipHours(0.25));
    await page.waitForTimeout(250);
    if (await page.locator('.learn').count()) {
      R.learnPanel = (R.learnPanel || []).concat(await page.locator('.learn h2').innerText());
      if (!R.overloadShot) {
        await shot('06-overload-panel');
        R.overloadShot = true;
      }
      await page.locator('.learn button.primary').first().click();
    }
  }
  R.tripped = await ev(() => __gf.state().stats.trips);
  await page.waitForTimeout(500);
  await shot('07-trip');
  const T = await ev(() => Object.keys(__gf.state().nodes).find((k) => __gf.state().nodes[k].kind === 'xfmr'));
  await closeLearn();
  await ev(() => __gf.skipHours(0.6));
  await closeLearn();
  await click(T);
  await page.waitForTimeout(400);
  const reset = page.locator('#inspector').getByRole('button', { name: /^Reset/ });
  R.resetButton = await reset.count();
  if (R.resetButton) await reset.first().click();
  R.afterReset = await ev((T) => __gf.state().nodes[T].state, T);

  // 5. Maintain: service the generator from the inspector
  await closeLearn();
  await click('gen');
  const c0 = await ev(() => __gf.state().credits);
  await page.locator('#inspector').getByRole('button', { name: /Service/ }).first().click();
  await page.waitForTimeout(300);
  R.serviceCharged = c0 - (await ev(() => __gf.state().credits));
  for (let i = 0; i < 8 && !(await ev(() => __gf.state().gen.servicing)); i++) await ev(() => __gf.skipHours(0.25));
  R.servicingCap = await ev(() => __gf.state().flow.availKW);
  await page.waitForTimeout(400);
  await shot('08-servicing');

  // 6. Esc → pause menu freezes time; Restart → deterministic fresh state
  await closeLearn();
  for (let i = 0; i < 5 && !(await page.locator('.modal', { hasText: 'Simulation paused' }).count()); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
  R.pauseOpen = (await page.locator('.modal', { hasText: 'Simulation paused' }).count()) === 1;
  const t0 = await ev(() => __gf.state().t);
  await page.waitForTimeout(2000);
  R.frozen = (await ev(() => __gf.state().t)) === t0;
  await shot('09-pause');
  R.pauseItems = await page.locator('.modal button').allInnerTexts();
  await page.getByRole('button', { name: 'Restart level' }).click();
  await page.locator('.modal button.danger').last().click();
  await page.waitForTimeout(1500);
  R.restartHash = await ev(() => __gf.hash());

  // 7. Fail path: fuel starvation → warning → fail screen → Retry
  await buildRef(false);
  await click('gen');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.keyboard.press('Escape');
  for (let i = 0; i < 400 && !(await ev(() => !!__gf.state().result)); i++) {
    await ev(() => __gf.skipHours(1));
    for (const b of await page.locator('.learn button.primary').all()) await b.click().catch(() => {});
    await ev(() => {
      const s = __gf.state();
      if (s.fault.phase === 'active' && !s.crew.job) __gf.cmd({ type: 'repair', target: s.fault.target });
    });
    if (await ev(() => __gf.state().gen.fuel <= 0) && !R.failWarnSeen) {
      await page.waitForTimeout(300);
      R.failWarnSeen = (await page.locator('.alert.critical', { hasText: 'Fuel' }).count()) > 0;
      await shot('10-fuel-out');
    }
  }
  await page.waitForTimeout(2000);
  await shot('11-fail');
  R.failCause = await ev(() => __gf.state().result?.cause);
  R.failButtons = await page.locator('.modal button').allInnerTexts();
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.waitForTimeout(1200);
  R.retryFresh = await ev(() => __gf.state().t === 0 && Object.keys(__gf.state().edges).length === 0 && !__gf.state().result);

  // 8. Mute toggle from the top bar
  await page.locator('#btn-sound').click();
  R.muteToggled = (await ev(() => JSON.parse(localStorage.getItem('gridforge.settings.v1')).sound)) === false;
  await page.locator('#btn-sound').click();

  } catch (e) {
    R.error = String(e).slice(0, 300);
    await shot('zz-error');
  }
  R.fps = await ev(() => __gf.fps());
  R.errors = errors;
  return R;
}
