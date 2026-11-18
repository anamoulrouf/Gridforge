// Visuals for run events: warning rings and storm paths, flood/tsunami water, rain, storm
// darkness, earthquake camera shake, festival lanterns and protest crowds. Everything is driven
// from `state.ev` each frame, so it also works after loading a save.
import * as THREE from 'three';

const AMBER = new THREE.Color('#f5b041');
const RED = new THREE.Color('#ff5a4e');
const WATER = new THREE.Color('#3a7fa8');

function zoneShape(z) {
  if (z.poly) {
    const s = new THREE.Shape();
    z.poly.forEach(([x, zz], i) => (i ? s.lineTo(x, -zz) : s.moveTo(x, -zz)));
    s.closePath();
    return s;
  }
  const s = new THREE.Shape();
  s.absarc(z.x, -z.z, z.r, 0, Math.PI * 2, false);
  return s;
}
function zoneOutline(z) {
  const pts = z.poly ? [...z.poly, z.poly[0]].map(([x, zz]) => new THREE.Vector3(x, 0.6, zz)) : Array.from({ length: 65 }, (_, i) => new THREE.Vector3(z.x + Math.cos((i / 64) * Math.PI * 2) * z.r, 0.6, z.z + Math.sin((i / 64) * Math.PI * 2) * z.r));
  return new THREE.BufferGeometry().setFromPoints(pts);
}
export const zoneCenter = (z) => (z.poly ? { x: z.poly.reduce((a, p) => a + p[0], 0) / z.poly.length, z: z.poly.reduce((a, p) => a + p[1], 0) / z.poly.length, r: Math.max(...z.poly.map((p) => Math.hypot(p[0] - z.poly.reduce((a, q) => a + q[0], 0) / z.poly.length, p[1] - z.poly.reduce((a, q) => a + q[1], 0) / z.poly.length))) } : { x: z.x, z: z.z, r: z.r });

export function createHazards(scene) {
  const root = new THREE.Group();
  root.name = 'hazards';
  scene.add(root);
  const views = new Map(); // deck id → { kind, objs, water, level }

  // ------------------------------------------------------------ rain (one shared field near the camera target)
  const DROPS = 1400;
  const rainPos = new Float32Array(DROPS * 6);
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#9fb8cc', transparent: true, opacity: 0.35, depthWrite: false }));
  rain.frustumCulled = false;
  rain.visible = false;
  root.add(rain);
  const seeds = Array.from({ length: DROPS }, () => [Math.random(), Math.random(), Math.random()]);
  let rainK = 0;

  // ------------------------------------------------------------ lanterns (festival) and crowds (protests)
  const LMAX = 260;
  const lanternGeo = new THREE.SphereGeometry(0.9, 8, 6);
  const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.3, 0.45), toneMapped: false });
  const lanterns = new THREE.InstancedMesh(lanternGeo, lanternMat, LMAX);
  lanterns.count = 0;
  lanterns.frustumCulled = false;
  root.add(lanterns);
  const PMAX = 40;
  const personGeo = new THREE.CapsuleGeometry(0.55, 1.3, 3, 6);
  personGeo.translate(0, 1.2, 0);
  const crowd = new THREE.InstancedMesh(personGeo, new THREE.MeshStandardMaterial({ color: '#c9b79c', roughness: 0.8 }), PMAX);
  const signGeo = new THREE.BoxGeometry(1.8, 1.1, 0.12);
  signGeo.translate(0, 3.6, 0);
  const signs = new THREE.InstancedMesh(signGeo, new THREE.MeshStandardMaterial({ color: '#f3ead8', roughness: 0.9 }), PMAX);
  crowd.count = signs.count = 0;
  crowd.castShadow = true;
  root.add(crowd, signs);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v3 = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);

  let shakeT = 0;
  let shakeAmp = 0;

  function makeView(d) {
    const v = { kind: d.kind, objs: [], level: 0 };
    const zone = d.p.zone;
    if (zone) {
      const ring = new THREE.Line(zoneOutline(zone), new THREE.LineDashedMaterial({ color: AMBER, dashSize: 6, gapSize: 4, transparent: true, opacity: 0.9, depthWrite: false }));
      ring.computeLineDistances();
      ring.renderOrder = 6;
      v.ring = ring;
      v.objs.push(ring);
      if (d.kind === 'flood' || d.kind === 'tsunami') {
        const w = new THREE.Mesh(new THREE.ShapeGeometry(zoneShape(zone), 48), new THREE.MeshStandardMaterial({ color: WATER, transparent: true, opacity: 0.62, roughness: 0.15, metalness: 0.1, depthWrite: false }));
        w.rotation.x = -Math.PI / 2;
        w.position.y = -0.4;
        w.visible = false;
        w.renderOrder = 3;
        v.water = w;
        v.objs.push(w);
      }
    }
    if (d.p.track) {
      const [x1, z1, x2, z2] = d.p.track;
      const len = Math.hypot(x2 - x1, z2 - z1);
      const wd = (d.p.width ?? 90) * 2;
      const band = new THREE.Mesh(new THREE.PlaneGeometry(len + wd, wd), new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.08, depthWrite: false }));
      band.rotation.x = -Math.PI / 2;
      band.rotation.z = -Math.atan2(z2 - z1, x2 - x1);
      band.position.set((x1 + x2) / 2, 0.5, (z1 + z2) / 2);
      v.band = band;
      v.objs.push(band);
    }
    for (const o of v.objs) root.add(o);
    return v;
  }

  function drop(id) {
    const v = views.get(id);
    if (!v) return;
    for (const o of v.objs) {
      root.remove(o);
      o.geometry?.dispose();
      o.material?.dispose();
    }
    views.delete(id);
  }

  function update(st, dt, time, ctx) {
    const ev = st.ev;
    const live = new Set();
    let raining = 0;
    let storm = 0;
    let nL = 0;
    if (ev) {
      for (const d of ev.deck) {
        const showing = (d.phase === 'warned' || d.phase === 'active') && (d.p.zone || d.p.track);
        const wetAfter = (d.kind === 'flood' || d.kind === 'tsunami') && d.phase === 'done' && views.get(d.id)?.level > 0.01;
        if (showing || wetAfter) {
          live.add(d.id);
          if (!views.has(d.id)) views.set(d.id, makeView(d));
          const v = views.get(d.id);
          const active = d.phase === 'active';
          const pulse = 0.55 + 0.45 * Math.sin(time * 4);
          if (v.ring) {
            v.ring.material.color.copy(active ? RED : AMBER);
            v.ring.material.opacity = active ? 0.5 : pulse;
            v.ring.visible = !wetAfter;
          }
          if (v.band) {
            v.band.material.opacity = active ? 0.05 : 0.05 + 0.08 * pulse;
            v.band.visible = d.phase === 'warned';
          }
          if (v.water) {
            const target = active ? 1 : 0;
            v.level += (target - v.level) * Math.min(1, dt * (d.kind === 'tsunami' ? 0.9 : 0.35));
            v.water.visible = v.level > 0.01;
            v.water.position.y = -0.4 + v.level * (d.kind === 'tsunami' ? 2.4 : 1.5) + Math.sin(time * 1.3) * 0.05 * v.level;
            v.water.material.opacity = 0.35 + 0.3 * v.level;
          }
          if (active && (d.kind === 'flood' || d.kind === 'cyclone')) raining = Math.max(raining, 1);
          if (active && d.kind === 'cyclone') storm = 1;
        }
        if (d.kind === 'festival' && d.phase === 'active' && d.ids) {
          for (const id of d.ids) {
            const c = ctx.custOf(id);
            if (!c || nL >= LMAX - 4) continue;
            const lit = st.cust[id]?.status === 'on' || st.cust[id]?.status === 'partial';
            if (!lit) continue;
            for (let k = 0; k < 4; k++) {
              const a = (k / 4) * Math.PI * 2 + id.length;
              v3.set(c.x + Math.cos(a) * ((c.w || 12) * 0.55), 9 + Math.sin(time * 2 + k + c.x) * 0.6, c.z + Math.sin(a) * ((c.d || 12) * 0.55));
              m4.compose(v3, q.identity(), one);
              lanterns.setMatrixAt(nL++, m4);
            }
          }
        }
      }
    }
    for (const id of [...views.keys()]) if (!live.has(id)) drop(id);
    lanterns.count = nL;
    lanterns.instanceMatrix.needsUpdate = true;

    // protest crowds where a protest is open (or was just answered)
    let nP = 0;
    for (const ch of Object.values(ev?.choices || {})) {
      if (ch.kind !== 'protest' || !ch.at || (ch.done && !(ch.recheckAt && st.t < ch.recheckAt))) continue;
      for (let i = 0; i < 12 && nP < PMAX; i++, nP++) {
        const a = i * 2.4;
        const r = 4 + (i % 3) * 3;
        v3.set(ch.at.x + Math.cos(a) * r, Math.abs(Math.sin(time * 5 + i)) * 0.35, ch.at.z + Math.sin(a) * r);
        q.setFromAxisAngle(up, -a + Math.PI / 2);
        m4.compose(v3, q, one);
        crowd.setMatrixAt(nP, m4);
        signs.setMatrixAt(nP, m4);
      }
    }
    crowd.count = signs.count = nP;
    crowd.instanceMatrix.needsUpdate = signs.instanceMatrix.needsUpdate = true;

    // rain field around the camera target
    rainK += (raining - rainK) * Math.min(1, dt * 1.5);
    rain.visible = rainK > 0.02 && !ctx.reduceMotion;
    if (rain.visible) {
      const cx = ctx.target.x;
      const cz = ctx.target.z;
      const span = Math.max(160, ctx.dist * 1.1);
      const n = Math.floor(DROPS * rainK);
      for (let i = 0; i < DROPS; i++) {
        const [a, b, c] = seeds[i];
        const y = 60 - ((c * 60 + time * 55) % 60);
        const x = cx + (a - 0.5) * span + storm * 6 * Math.sin(time + i);
        const z = cz + (b - 0.5) * span;
        const o = i * 6;
        const show = i < n ? 1 : 0;
        rainPos[o] = x;
        rainPos[o + 1] = y * show - (1 - show) * 50;
        rainPos[o + 2] = z;
        rainPos[o + 3] = x + 1.2 * (0.4 + storm);
        rainPos[o + 4] = (y - 3.2) * show - (1 - show) * 50;
        rainPos[o + 5] = z + 0.6 * storm;
      }
      rainGeo.attributes.position.needsUpdate = true;
      rain.material.opacity = 0.18 + 0.25 * rainK;
    }
    return { storm: Math.max(storm, rainK * 0.6) };
  }

  /** Dim the lights in a storm (call after the day/night update). */
  function weatherLight(G, k) {
    if (k <= 0.01) return;
    G.key.intensity *= 1 - 0.55 * k;
    G.hemi.intensity *= 1 - 0.3 * k;
  }

  function shake(sec, amp = 2.2) {
    shakeT = sec;
    shakeAmp = amp;
  }
  /** Earthquake camera shake (call after the camera rig update). */
  function applyShake(camera, dt, reduceMotion) {
    if (shakeT <= 0) return;
    shakeT -= dt;
    const k = Math.max(0, shakeT) * shakeAmp * (reduceMotion ? 0.15 : 1);
    camera.position.x += (Math.random() - 0.5) * k;
    camera.position.y += (Math.random() - 0.5) * k * 0.5;
    camera.position.z += (Math.random() - 0.5) * k;
  }

  function clear() {
    for (const id of [...views.keys()]) drop(id);
    lanterns.count = crowd.count = signs.count = 0;
    rainK = 0;
    rain.visible = false;
  }

  return { update, weatherLight, shake, applyShake, clear, root };
}
