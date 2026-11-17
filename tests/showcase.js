// Builds the reference network, runs to 21:00 day 1 and captures art-review shots.
async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4173/gridforge.html?test=1');
  await page.evaluate(() => localStorage.clear());
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'New Game' }).click();
  await page.waitForTimeout(1200);
  await page.mouse.move(720, 450);
  await page.evaluate(() => {
    __gf.app.tut = -1;
    __gf.app.learnSeen.add('firstLight');
    const sim = __gf.sim();
    let last = null;
    const at = (x, z) => Object.keys(sim.state.nodes).find((id) => Math.hypot(sim.state.nodes[id].x - x, sim.state.nodes[id].z - z) < 1);
    for (const s of sim.map.reference) {
      const from = s.from === '@last' ? last : typeof s.from === 'string' && s.from.startsWith('@node:') ? at(...s.from.slice(6).split(',').map(Number)) : s.from;
      if (s.type === 'line') last = sim.cmd({ type: 'line', from, to: s.to }).last;
      else if (s.type === 'transformer') sim.cmd({ type: 'transformer', at: s.at === '@last' ? last : s.at });
      else sim.cmd({ type: 'drop', building: s.building });
    }
    sim.cmd({ type: 'startGen' });
    __gf.skipHours(4);
    __gf.app.paused = true;
  });
  await page.waitForTimeout(4000);
  await page.evaluate(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()));
  await page.evaluate(() => (__gf.app.hold = 0));
  await page.screenshot({ path: 'review/show-night-default.jpg', type: 'jpeg', quality: 85 });
  await page.evaluate(() => __gf.focusAt(20, 0, 170));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'review/show-night-close.jpg', type: 'jpeg', quality: 85 });
  await page.evaluate(() => {
    __gf.app.overlay = 'capacity';
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'review/show-capacity.jpg', type: 'jpeg', quality: 85 });
  await page.evaluate(() => {
    __gf.app.overlay = 'flow';
    __gf.app.paused = false;
    __gf.skipHours(15);
    __gf.app.paused = true;
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'review/show-day.jpg', type: 'jpeg', quality: 85 });
  return await page.evaluate(() => ({ fps: __gf.fps(), clock: __gf.state().clock }));
}
