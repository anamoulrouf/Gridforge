// Playwright playthrough (run via the playwright MCP `browser_run_code_unsafe` with filename).
// Drives the real UI with mouse/keyboard: tutorial → build → first light → peak → fault → repair → victory → ending.
async (page) => {
  const BASE = 'http://localhost:4173/gridforge.html?test=1';
  const log = [];
  const errors = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const requests = [];
  page.on('request', (r) => !r.url().startsWith('http://localhost:4173/gridforge.html') && !r.url().startsWith('data:') && requests.push(r.url()));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'New Game' }).click();
  await page.waitForTimeout(1400);
  await page.mouse.move(720, 450);

  const ev = (fn, arg) => page.evaluate(fn, arg);
  const W = (t) => ev((t) => __gf.worldToScreen(t), t);
  const click = async (t, opts = {}) => {
    let p = await W(t);
    const covered = await ev(([x, y]) => document.elementFromPoint(x, y)?.id !== 'gl', [p.x, p.y]);
    if (covered) {
      const q = typeof t === 'string' ? await ev((id) => { const c = __gf.state().map.customers.find((c) => c.id === id) || (id === 'gen' ? __gf.state().map.generator : null); return { x: c.x, z: c.z }; }, t) : t;
      await ev((q) => __gf.focusAt(q.x, q.z), q);
      await page.waitForTimeout(900);
      p = await W(t);
    }
    await page.mouse.click(p.x, p.y, opts);
    await page.waitForTimeout(220);
  };
  const shot = async (name) => page.screenshot({ path: `review/play-${name}.jpg`, type: 'jpeg', quality: 82 });
  const tut = () => ev(() => __gf.app.tut);
  const nodeAt = (x, z) => ev(([x, z]) => Object.keys(__gf.state().nodes).find((k) => Math.hypot(__gf.state().nodes[k].x - x, __gf.state().nodes[k].z - z) < 1.5), [x, z]);
  const closeModals = async () => {
    for (let i = 0; i < 4; i++) {
      const b = page.locator('.modal button.primary').last();
      if (await b.count()) {
        await b.click();
        await page.waitForTimeout(250);
      } else break;
    }
  };
  const step = async (name) => log.push([name, await tut(), await ev(() => ({ c: __gf.state().credits, conn: __gf.state().flow.connected, pow: __gf.state().flow.powered }))]);

  // --- Tutorial with real clicks
  await shot('01-start');
  await click('gen');
  await step('inspect gen');
  await click('clinic');
  await step('inspect clinic');
  await page.click('#chip-demand');
  await page.waitForTimeout(200);
  await step('demand');
  await page.keyboard.press('Escape'); // close inspector
  await page.keyboard.press('l');
  await step('line tool');
  await click({ x: -98, z: -14 });
  await click({ x: -62, z: -8 });
  await click({ x: -24, z: -8 });
  await click({ x: 4, z: -8 });
  await page.mouse.click(700, 450, { button: 'right' });
  await step('mv');
  await shot('02-mv');
  await page.keyboard.press('t');
  await click({ x: 4, z: -8 });
  await step('xfmr');
  // branch MV to the south transformer site, then mount T2
  await page.keyboard.press('l');
  await click({ x: -24, z: -8 });
  await click({ x: -2, z: 10 });
  await page.mouse.click(700, 450, { button: 'right' });
  await page.keyboard.press('t');
  await click({ x: -2, z: 10 });
  // LV south toward the clinic
  await page.keyboard.press('l');
  await click({ x: -2, z: 10 });
  await click({ x: -2, z: 30 });
  await page.mouse.click(700, 450, { button: 'right' });
  await page.keyboard.press('c');
  await click('clinic');
  await step('lv+drop clinic');
  await shot('03-clinic-dropped');

  // --- Rest of the network (still real clicks)
  await page.keyboard.press('l');
  const chains = [
    [{ x: 4, z: -8 }, { x: 28, z: -8 }, { x: 50, z: -12 }, { x: 50, z: -30 }],
    [{ x: 4, z: -8 }, { x: 4, z: -28 }],
    [{ x: -2, z: 10 }, { x: 24, z: 10 }, { x: 48, z: 12 }, { x: 72, z: 12 }],
    [{ x: 48, z: 12 }, { x: 50, z: 36 }],
  ];
  for (const ch of chains) {
    for (const p of ch) await click(p);
    await page.mouse.click(700, 450, { button: 'right' });
    await page.waitForTimeout(150);
  }
  await page.keyboard.press('c');
  for (const p of [[4, -8], [50, -12], [50, -30], [4, -28], [-2, 10], [-2, 30], [48, 12], [72, 12], [50, 36]]) await click({ x: p[0], z: p[1] });
  await step('all drops');
  await page.keyboard.press('v');
  await shot('04-network-built');

  // --- Start the generator via the inspector button → first light
  await click('gen');
  await page.getByRole('button', { name: 'Start' }).click();
  await step('start');
  await page.waitForTimeout(3200);
  await shot('05-first-light');
  await closeModals();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await shot('06-lit-town');

  // --- Run the evening at x3, handle modals; check overlay
  await page.keyboard.press('o');
  await page.waitForTimeout(300);
  await shot('07-capacity-overlay');
  await page.keyboard.press('o');
  await page.keyboard.press('o');
  await page.keyboard.press('o');
  await page.keyboard.press('o');
  await page.keyboard.press('3');
  const until = async (pred, maxHours, onTick) => {
    for (let i = 0; i < maxHours * 4; i++) {
      if (await ev(pred)) return true;
      await ev(() => __gf.skipHours(0.25));
      await page.waitForTimeout(120);
      await closeModals();
      if (onTick) await onTick();
    }
    return ev(pred);
  };
  const keepFuel = async () => {
    const need = await ev(() => __gf.state().gen.fuel < 40 && !__gf.state().orders.some((o) => o.item === 'fuel'));
    if (need) {
      await click('gen');
      await page.getByRole('button', { name: /Order fuel/ }).first().click();
      await page.keyboard.press('Escape');
    }
  };
  await until(() => __gf.state().stats.bills > 0, 10, keepFuel);
  await step('first bill');
  await until(() => __gf.state().fault.phase === 'warn', 30, keepFuel);
  await step('fault warn');
  await shot('08-fault-warning');
  await until(() => __gf.state().fault.phase === 'active', 3, keepFuel);
  await page.waitForTimeout(600);
  await shot('09-fault');
  // Respond via the alert's button
  await closeModals();
  const send = page.getByRole('button', { name: 'Send repair crew' }).first();
  if (await send.count()) await send.click();
  await step('crew sent');
  await until(() => __gf.state().crew.job && __gf.state().crew.job.phase === 'work', 2, keepFuel);
  await page.waitForTimeout(500);
  await shot('10-crew-working');
  await until(() => __gf.state().fault.phase === 'repaired', 4, keepFuel);
  await page.waitForTimeout(400);
  await shot('11-restored');
  await closeModals();
  await until(() => !!__gf.state().result, 30, keepFuel);
  await page.waitForTimeout(2200);
  await shot('12-result');
  const result = await ev(() => __gf.state().result && { o: __gf.state().result.outcome, s: __gf.state().result.score?.total, e: __gf.state().result.score?.ending });
  const cont = page.getByRole('button', { name: 'Continue' });
  if (await cont.count()) await cont.click();
  await page.waitForTimeout(9000);
  await shot('13-ending');
  await page.getByRole('button', { name: 'Skip' }).click().catch(() => {});
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Return to main menu' }).click().catch(() => {});
  await page.waitForTimeout(1500);
  const mode = await ev(() => __gf.mode);
  return { log, result, finalMode: mode, errors, requests };
}
