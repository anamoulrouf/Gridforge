// Campaign UI flow (run via the playwright MCP `browser_run_code_unsafe` with filename).
// Real mouse/keyboard through the shell and each stage's new tools:
//   locked tiles → Stage 1 victory → "Next" → Stage 2 briefing/tutorial (finance chip, tariff,
//   transformer upgrade, Build tool) → pause → main menu Continue → campaign best/unlock state →
//   Settings "Unlock all" → Stage 3 HV line + Substation tool → Stage 4 Build wind + forecast →
//   Stage 5 Programs → campaign finale ending (no "Next").
async (page) => {
  const BASE = 'http://localhost:4173/gridforge.html?test=1';
  const R = {};
  const errors = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`${m.type()}: ${m.text()}`.slice(0, 240)));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const requests = [];
  page.on('request', (r) => !r.url().startsWith('http://localhost:4173/gridforge.html') && !r.url().startsWith('data:') && requests.push(r.url()));
  await page.setViewportSize({ width: 1440, height: 900 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const shot = (n) => page.screenshot({ path: `review/camp-${n}.jpg`, type: 'jpeg', quality: 80 });
  const closeLearn = async () => {
    for (let i = 0; i < 6; i++) {
      const b = page.locator('.modal.learn button.primary, .learn button.primary');
      if (!(await b.count())) break;
      await b.first().click().catch(() => {});
      await wait(200);
    }
  };
  /** Click a world target with the real mouse, focusing the camera on it first. */
  const clickWorld = async (t, opts = {}) => {
    const q = typeof t === 'string' ? await ev((id) => { const s = __gf.state(); const p = s.nodes[id] || s.map.customers.find((c) => c.id === id) || (s.map.sites || []).find((x) => x.id === id); return { x: p.x, z: p.z }; }, t) : t;
    if (!opts.noFocus) {
      await ev((q) => __gf.focusAt(q.x, q.z, 160), q);
      await wait(1300);
    }
    const p = await ev((t) => __gf.worldToScreen(t), t);
    await page.mouse.click(p.x, p.y, { button: opts.button || 'left' });
    await wait(250);
  };
  const tutText = () => page.locator('#tutorial:not([hidden])').innerText().catch(() => '');
  const brand = () => page.locator('#brand').innerText();

  try {
    // ---------------------------------------------------------------- A. fresh campaign: only Stage 1 open
    await page.goto(BASE);
    await ev(() => localStorage.clear());
    await page.goto(BASE);
    await wait(1200);
    R.menu = await page.locator('#menu button').allInnerTexts();
    await page.getByRole('button', { name: 'Campaign' }).click();
    await wait(400);
    R.tiles = await page.locator('.stage-tile').count();
    R.lockedTiles = await page.locator('.stage-tile.locked').count();
    R.lockMsg = await page.locator('.stage-tile').nth(1).locator('.st-best').innerText();
    R.play2Disabled = await page.locator('.stage-tile').nth(1).locator('button.primary').isDisabled();
    await shot('01-locked');
    await page.getByRole('button', { name: 'Back' }).click();
    await wait(300);

    // ---------------------------------------------------------------- B. Stage 1 victory → ending → Next stage
    await ev(() => __gf.jumpToEnding(1));
    await wait(2500);
    const next = page.getByRole('button', { name: /^Next:/ });
    R.nextLabel = (await next.count()) ? await next.innerText() : null;
    R.unlockedAfterS1 = await ev(() => JSON.parse(localStorage.getItem('gridforge.campaign.v1')).unlocked);
    await shot('02-ending-next');
    await next.click();
    await wait(2200);
    R.briefing = await page.locator('.modal').first().innerText().then((t) => t.slice(0, 80)).catch(() => null);
    await shot('03-briefing');
    await page.getByRole('button', { name: 'Begin' }).click();
    await wait(600);
    await closeLearn();
    R.s2brand = await brand();

    // ---------------------------------------------------------------- C. Stage 2 with real clicks (guided tutorial)
    R.s2tut1 = (await tutText()).includes('Open the books');
    await page.locator('#chip-cash').click();
    await wait(400);
    R.financeOpen = (await page.locator('#inspector:not([hidden])').innerText()).includes('Tariffs') || (await page.locator('#inspector .tariff-row').count()) > 0;
    const b0 = await ev(() => __gf.state().tariffs.business);
    await page.locator('#inspector button[aria-label="Raise business tariff"]').click();
    await wait(250);
    R.tariffRaised = (await ev(() => __gf.state().tariffs.business)) > b0;
    await wait(500);
    await closeLearn(); // the first tariff change opens the "Tariffs and fairness" learning card
    R.tariffLearn = true;
    await page.locator('#inspector button[aria-label="Lower business tariff"]').click();
    await wait(250);
    await closeLearn();
    R.s2tut2 = (await tutText()).includes('T1');
    const t1 = await ev(() => Object.keys(__gf.state().nodes).find((k) => { const n = __gf.state().nodes[k]; return n.kind === 'xfmr' && n.forecastPeakKW > n.ratingKW; }));
    await clickWorld(t1);
    const up = page.locator('#inspector').getByRole('button', { name: /^Upgrade to/ });
    R.upgradeButton = await up.count();
    if (R.upgradeButton) await up.first().click();
    await wait(300);
    await closeLearn();
    R.upgraded = await ev((id) => __gf.state().nodes[id].ratingKW, t1);
    R.s2tut3 = (await tutText()).includes('High Street');
    await shot('04-s2-upgraded');
    // Build tool (G) → click the gas plot → Build
    await page.keyboard.press('Escape');
    await page.keyboard.press('g');
    await clickWorld('gas');
    const build = page.locator('#inspector').getByRole('button', { name: /^Build ·/ });
    R.buildPanel = await build.count();
    if (R.buildPanel) await build.first().click();
    await wait(400);
    await closeLearn();
    R.gasBuilt = await ev(() => !!__gf.state().gens.gas);
    await shot('05-s2-gas');
    await page.keyboard.press('v');

    // ---------------------------------------------------------------- D. pause → main menu → Continue; campaign state
    for (let i = 0; i < 5 && !(await page.locator('.modal', { hasText: 'Simulation paused' }).count()); i++) {
      await page.keyboard.press('Escape');
      await wait(250);
    }
    await page.getByRole('button', { name: 'Back to main menu' }).click();
    await page.locator('.modal button.danger').last().click();
    await wait(1600);
    R.continueLabel = await page.locator('#menu button').first().innerText();
    await page.getByRole('button', { name: 'Campaign' }).click();
    await wait(400);
    R.s1Best = await page.locator('.stage-tile').nth(0).locator('.st-best').innerText();
    R.lockedAfterS1 = await page.locator('.stage-tile.locked').count();
    R.s2HasContinue = (await page.locator('.stage-tile').nth(1).getByRole('button', { name: 'Continue' }).count()) === 1;
    await shot('06-campaign-progress');
    await page.locator('.stage-tile').nth(1).getByRole('button', { name: 'Continue' }).click();
    await wait(2200);
    await closeLearn();
    R.resumed = await ev(() => ({ gas: !!__gf.state().gens.gas, t1Upgraded: Object.values(__gf.state().nodes).some((n) => n.upgraded) }));

    // ---------------------------------------------------------------- E. Settings → Unlock all stages
    for (let i = 0; i < 5 && !(await page.locator('.modal', { hasText: 'Simulation paused' }).count()); i++) {
      await page.keyboard.press('Escape');
      await wait(250);
    }
    await page.getByRole('button', { name: 'Back to main menu' }).click();
    await page.locator('.modal button.danger').last().click();
    await wait(1600);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('switch', { name: 'Unlock all stages' }).click();
    await page.getByRole('switch', { name: 'Guided tutorial' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Campaign' }).click();
    await wait(400);
    R.lockedWithUnlockAll = await page.locator('.stage-tile.locked').count();

    // ---------------------------------------------------------------- F. Stage 3: 66 kV line + Substation tool
    await page.locator('.stage-tile').nth(2).locator('button.primary').click();
    await wait(2200);
    await page.getByRole('button', { name: 'Begin' }).click();
    await wait(500);
    await closeLearn();
    R.s3brand = await brand();
    await page.keyboard.press('l');
    await ev(() => __gf.focusAt(-395, -65, 300)); // frame both ends of the span
    await wait(1400);
    await clickWorld('coal', { noFocus: true });
    await clickWorld({ x: -330, z: -60 }, { noFocus: true });
    await page.mouse.click(720, 450, { button: 'right' });
    await wait(200);
    const hv = await ev(() => Object.keys(__gf.state().nodes).find((k) => { const n = __gf.state().nodes[k]; return Math.hypot(n.x + 330, n.z + 60) < 5; }));
    R.hvPole = hv ? await ev((id) => __gf.state().nodes[id].tier, hv) : null;
    await page.keyboard.press('b');
    await clickWorld({ x: -330, z: -60 });
    await wait(300);
    await closeLearn();
    R.substation = await ev(() => Object.values(__gf.state().nodes).some((n) => n.kind === 'xfmr' && n.ratio === 'HV/MV' && Math.hypot(n.x + 330, n.z + 60) < 5));
    await shot('07-s3-substation');
    await page.keyboard.press('v');

    // ---------------------------------------------------------------- G. Stage 4: build wind + forecast panel
    for (let i = 0; i < 5 && !(await page.locator('.modal', { hasText: 'Simulation paused' }).count()); i++) {
      await page.keyboard.press('Escape');
      await wait(250);
    }
    await page.getByRole('button', { name: 'Back to main menu' }).click();
    await page.locator('.modal button.danger').last().click();
    await wait(1600);
    await page.getByRole('button', { name: 'Campaign' }).click();
    await wait(300);
    await page.locator('.stage-tile').nth(3).locator('button.primary').click();
    await wait(2200);
    await page.getByRole('button', { name: 'Begin' }).click();
    await wait(500);
    await closeLearn();
    R.s4brand = await brand();
    await page.keyboard.press('g');
    await clickWorld('wind1');
    await page.locator('#inspector').getByRole('button', { name: /^Build ·/ }).first().click();
    await wait(400);
    await closeLearn();
    R.windBuilt = await ev(() => !!__gf.state().gens.wind1);
    await page.keyboard.press('v');
    await page.locator('#chip-weather').click();
    await wait(400);
    R.forecastShown = (await page.locator('#inspector svg[aria-label="Weather forecast"]').count()) === 1;
    await shot('08-s4-forecast');

    // ---------------------------------------------------------------- H. Stage 5: Programs from the supply panel
    for (let i = 0; i < 5 && !(await page.locator('.modal', { hasText: 'Simulation paused' }).count()); i++) {
      await page.keyboard.press('Escape');
      await wait(250);
    }
    await page.getByRole('button', { name: 'Back to main menu' }).click();
    await page.locator('.modal button.danger').last().click();
    await wait(1600);
    await page.getByRole('button', { name: 'Campaign' }).click();
    await wait(300);
    await page.locator('.stage-tile').nth(4).locator('button.primary').click();
    await wait(2200);
    await page.getByRole('button', { name: 'Begin' }).click();
    await wait(500);
    await closeLearn();
    R.s5brand = await brand();
    await page.locator('#chip-mix').click();
    await wait(300);
    await page.locator('#inspector').getByRole('button', { name: 'Programs' }).click();
    await wait(300);
    await page.locator('#inspector').getByRole('button', { name: /^Enable · 12/ }).first().click();
    await wait(400);
    await closeLearn();
    R.smartOn = await ev(() => !!__gf.state().programs?.smart?.on);
    await shot('09-s5-programs');

    // ---------------------------------------------------------------- I. Campaign finale: no "Next" after Stage 5
    await ev(() => __gf.jumpToEnding(5));
    await wait(2500);
    R.finaleNext = await page.getByRole('button', { name: /^Next:/ }).count();
    R.finaleMenu = await page.getByRole('button', { name: 'Return to main menu' }).count();
    await shot('10-finale');
    R.bestS5 = await ev(() => JSON.parse(localStorage.getItem('gridforge.campaign.v1')).best);
  } catch (e) {
    R.error = String(e).slice(0, 400);
    await shot('zz-error');
  }
  R.errors = errors;
  R.requests = requests;
  return R;
}
