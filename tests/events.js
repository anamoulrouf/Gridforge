// Run events through the real UI (playwright MCP, `filename`). For each scenario: load the stage
// with a seed whose deck contains the event, run the reference build, advance to the warning and
// then to the hit, and capture the alert, the visuals, choice cards (requests / protests), the
// Gazette and the Community panel. Writes review/ev-*.jpg. Requires `node serve.mjs`.
async (page) => {
  const errors = [];
  const requests = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => !r.url().startsWith('http://localhost:4173/gridforge.html') && !r.url().startsWith('data:') && requests.push(r.url()));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4173/gridforge.html');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('gridforge.settings.v1', JSON.stringify({ tutorial: false, unlockAll: true, autoPause: false })); });
  const shot = (n) => page.screenshot({ path: `review/ev-${n}.jpg`, type: 'jpeg', quality: 78 });
  const out = {};
  const seenChoice = new Set();
  const handleModals = async (tag) => {
    for (let i = 0; i < 8; i++) {
      const top = page.locator('.modal-wrap').last();
      if (!(await top.count())) break;
      const ch = top.locator('.modal.choice');
      if (await ch.count()) {
        const title = await ch.locator('h2').innerText({ timeout: 2000 }).catch(() => '?');
        if (!seenChoice.has(title)) {
          seenChoice.add(title);
          await page.waitForTimeout(500);
          await shot(`choice-${seenChoice.size}`);
          (out.choices ||= []).push({ at: tag, title });
        }
        await ch.locator('button.choice-opt').first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(200);
        continue;
      }
      const b = top.locator('button.primary').last();
      if (await b.count()) await b.click({ timeout: 2000 }).catch(() => {});
      else break;
      await page.waitForTimeout(150);
    }
  };
  const scenarios = [
    { n: 1, seed: 1, key: 'lane', name: 's1-arrivals' },
    { n: 1, seed: 1, key: 'wedding', name: 's1-wedding', reuse: true },
    { n: 1, seed: 2, key: 'storm', name: 's1-storm' },
    { n: 1, seed: 2, key: 'mayor', name: 's1-vip', reuse: true },
    { n: 2, seed: 3, key: 'lights', name: 's2-request' },
    { n: 2, seed: 2, key: 'flood', name: 's2-flood', act: 'Protect them' },
    { n: 2, seed: 3, key: 'theft', name: 's2-theft' },
    { n: 3, seed: 4, key: 'quake', name: 's3-quake' },
    { n: 3, seed: 3, key: 'coalTrip', name: 's3-blackout' },
    { n: 3, seed: 2, key: 'heat', name: 's3-heat' },
    { n: 4, seed: 2, key: 'tsunami', name: 's4-tsunami', act: 'Protect them' },
    { n: 4, seed: 4, key: 'inspection', name: 's4-inspection', reuse: true },
    { n: 5, seed: 3, key: 'cyclone', name: 's5-cyclone' },
    { n: 5, seed: 1, key: 'lights', name: 's5-festival', reuse: true },
    // round 8: new event kinds
    { n: 3, seed: 1, key: 'wildfire', name: 's3-wildfire', act: 'Protect them' },
    { n: 3, seed: 3, key: 'landslide', name: 's3-landslide' },
    { n: 4, seed: 1, key: 'dust', name: 's4-dust' },
    { n: 5, seed: 1, key: 'cyber', name: 's5-cyber' },
  ];
  for (const sc of scenarios) {
    if (!sc.reuse) {
      await page.goto(`http://localhost:4173/gridforge.html?test=1&seed=${sc.seed}`);
      await page.waitForTimeout(700);
      await page.evaluate((n) => __gf.startStage(n), sc.n);
      await page.waitForTimeout(1500);
      await handleModals('start');
      await page.evaluate(() => { __gf.refBuild(); if (!__gf.state().started) __gf.cmd({ type: 'begin' }); __gf.cmd({ type: 'startGen' }); });
    }
    // bring the event forward so it happens before a fast reference finishes the stage
    const d = await page.evaluate((k) => __gf.eventSoon(k, 0.3), sc.key);
    const r = { found: !!d };
    const goTo = async (h) => {
      for (let i = 0; i < 400; i++) {
        const c = await page.evaluate(() => __gf.state().clock / 60);
        if (c >= h || (await page.evaluate(() => !!__gf.state().result))) break;
        await page.evaluate((dh) => __gf.skipHours(dh), Math.min(1, Math.max(0.05, h - c)));
        await page.evaluate(() => __gf.heal());
        await page.waitForTimeout(30);
        await handleModals(sc.name);
      }
    };
    if (d) {
      if (d.warn < d.hit) {
        await goTo(d.warn + 0.05);
        await page.waitForTimeout(900);
        await handleModals(sc.name);
        r.warnAlert = await page.locator('.alert b').first().innerText().catch(() => null);
        await page.waitForTimeout(1600);
        await shot(`${sc.name}-warn`);
        if (sc.act) {
          const b = page.locator('.alert').getByRole('button', { name: sc.act });
          r.acted = (await b.count()) > 0;
          if (r.acted) await b.first().click();
        }
      }
      await goTo(d.hit + 0.2);
      await page.waitForTimeout(600);
      await handleModals(sc.name);
      r.hitAlert = await page.locator('.alert b').first().innerText().catch(() => null);
      await page.waitForTimeout(2800);
      await shot(`${sc.name}-hit`);
      r.fps = Math.round(await page.evaluate(() => __gf.fps()));
      r.state = await page.evaluate((k) => { const x = __gf.state().ev.deck.find((y) => y.key === k); return { phase: x.phase, damaged: x.damaged, ids: x.ids?.length }; }, sc.key);
    }
    out[sc.name] = r;
  }
  // today's side quests in the objectives panel, and town life at rush hour
  out.quests = await page.evaluate(() => (__gf.state().q?.list || []).map((q) => `${q.key}:${q.status}`));
  out.questRows = await page.locator('#objectives .obj.quest').count();
  await page.locator('#objectives').screenshot({ path: 'review/ev-quests.jpg', type: 'jpeg', quality: 82 });
  const qRow = page.locator('#objectives .obj.quest').first();
  if (await qRow.count()) {
    await qRow.hover();
    await page.waitForTimeout(400);
    out.questCard = (await page.locator('#objcard').innerText()).slice(0, 120);
    await page.screenshot({ path: 'review/ev-quest-card.jpg', type: 'jpeg', quality: 80, clip: { x: 0, y: 60, width: 760, height: 620 } });
    await page.mouse.move(900, 500);
  }
  await page.evaluate(() => { const c = __gf.state().clock; __gf.skipHours(((8.2 * 60 - (c % 1440) + 1440) % 1440) / 60); });
  await handleModals('life');
  await page.evaluate(() => __gf.focusAt(60, 60, 170));
  await page.waitForTimeout(2600);
  out.life = await page.evaluate(() => __gf.life());
  await page.screenshot({ path: 'review/ev-life-rush.jpg', type: 'jpeg', quality: 80 });
  // Gazette and Community panels (on the last stage)
  await page.locator('#btn-news').click();
  await page.waitForTimeout(400);
  out.gazette = await page.locator('#inspector .news-item').count();
  await page.locator('#inspector').screenshot({ path: 'review/ev-gazette.jpg', type: 'jpeg', quality: 80 });
  await page.locator('#chip-rep').click();
  await page.waitForTimeout(400);
  out.community = (await page.locator('#inspector').innerText()).includes('Reputation');
  await page.locator('#inspector').screenshot({ path: 'review/ev-community.jpg', type: 'jpeg', quality: 80 });
  await page.screenshot({ path: 'review/ev-topbar.jpg', type: 'jpeg', quality: 80, clip: { x: 0, y: 0, width: 1440, height: 70 } });
  return { out, errors: errors.slice(0, 8), nErr: errors.length, requests };
}
