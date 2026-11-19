// Town life (render only, no sim state): traffic on every road, people on the pavements outside
// buildings that have power, boats on open water, birds, a tower crane on plots about to be built,
// and market stalls during festivals. Everything is instanced (a handful of draw calls) and follows
// the in-game hour, so towns wake up at dawn, rush at 08:00 and 18:00, and go quiet at night.
// Dark districts empty out: power is visible in the life of the street.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const CAR_COLS = ['#d9443a', '#3d6fa8', '#f2b630', '#f4f1ea', '#4f9a6a', '#2f3640', '#e07a3f', '#8a6fc2'];
const PED_COLS = ['#e2734e', '#5fd3c6', '#f2d15c', '#9bd36b', '#b48cf2', '#ff7eb6', '#7cc4f0', '#efe2c4'];
const rand = (s) => {
  let x = s >>> 0 || 1;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
};
/** Share of cars on the road by hour: quiet nights, morning and evening rush. */
const trafficAt = (h) => (h < 5 ? 0.12 : h < 7 ? 0.35 + (h - 5) * 0.2 : h < 10 ? 1 : h < 16 ? 0.6 : h < 20 ? 1 : h < 23 ? 0.5 : 0.2);
const walkersAt = (h) => (h < 6 ? 0 : h < 8 ? 0.5 : h < 21 ? 1 : h < 23 ? 0.35 : 0);

export function createLife(scene, map) {
  const root = new THREE.Group();
  root.name = 'life';
  scene.add(root);
  const R = rand(0x5eed + (map.id || '').length * 977);
  const T = map.tile || { cx: 0, cz: 0, hw: 170, hd: 170 };
  const L = map.life || {};
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v3 = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();
  const disposables = [];
  const inst = (geo, mat, n) => {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    im.count = 0;
    im.frustumCulled = false;
    im.castShadow = true;
    root.add(im);
    disposables.push(geo, mat);
    return im;
  };

  // ---------------------------------------------------------------- lanes from the road rectangles
  const lanes = [];
  for (const r0 of map.roads || []) {
    const along = r0.w > r0.d;
    let { x, z, w, d } = r0;
    if (along) {
      const x0 = Math.max(x - w / 2, T.cx - T.hw + 4);
      const x1 = Math.min(x + w / 2, T.cx + T.hw - 4);
      x = (x0 + x1) / 2;
      w = x1 - x0;
    } else {
      const z0 = Math.max(z - d / 2, T.cz - T.hd + 4);
      const z1 = Math.min(z + d / 2, T.cz + T.hd - 4);
      z = (z0 + z1) / 2;
      d = z1 - z0;
    }
    const len = along ? w : d;
    const wide = along ? d : w;
    if (len < 40 || wide < 6) continue;
    for (const dir of [1, -1]) lanes.push({ along, x, z, len, off: dir * wide * 0.24, dir });
  }
  const laneLen = lanes.reduce((s, l) => s + l.len, 0);
  const NV = Math.round(Math.min(70, Math.max(lanes.length ? 6 : 0, (laneLen / 38) * (L.traffic ?? 1))));
  const NB = lanes.length ? Math.max(1, Math.round(NV / 14)) : 0;

  // ---------------------------------------------------------------- vehicle meshes (cars, vans, buses)
  const bodyGeo = new RoundedBoxGeometry(4.4, 1.35, 2.2, 2, 0.45).translate(0, 1.05, 0);
  const cabGeo = new RoundedBoxGeometry(2.5, 1.1, 2.0, 2, 0.4).translate(-0.15, 2.0, 0);
  const wheelGeo = new THREE.BoxGeometry(3.4, 0.9, 2.3).translate(0, 0.5, 0);
  const lampGeo = mergeGeometries([new THREE.SphereGeometry(0.24, 6, 4).translate(2.2, 1.15, -0.7), new THREE.SphereGeometry(0.24, 6, 4).translate(2.2, 1.15, 0.7)]);
  const busGeo = new RoundedBoxGeometry(10, 2.8, 2.5, 2, 0.4).translate(0, 1.9, 0);
  const busWinGeo = new THREE.BoxGeometry(8.6, 0.8, 2.56).translate(-0.2, 2.5, 0);
  const cars = inst(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 }), NV);
  const cabs = inst(cabGeo, new THREE.MeshStandardMaterial({ color: '#2d3f52', roughness: 0.2, metalness: 0.3 }), NV);
  const wheels = inst(wheelGeo, new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 0.9 }), NV + NB);
  const lamps = inst(lampGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 2.5, 1.9), toneMapped: false }), NV + NB);
  lamps.castShadow = false;
  const buses = inst(busGeo, new THREE.MeshStandardMaterial({ color: L.busColor || '#2fa38a', roughness: 0.5 }), NB);
  const busWin = inst(busWinGeo, new THREE.MeshStandardMaterial({ color: '#23313d', roughness: 0.2, metalness: 0.3 }), NB);
  const veh = [];
  for (let i = 0; i < NV + NB; i++) {
    const bus = i >= NV;
    veh.push({ bus, lane: lanes.length ? Math.floor(R() * lanes.length) : 0, s: R(), speed: bus ? 7 : 8 + R() * 6, gate: R(), stopT: 0, color: CAR_COLS[Math.floor(R() * CAR_COLS.length)] });
  }
  veh.sort((a, b) => a.gate - b.gate);
  for (let i = 0, k = 0; i < veh.length; i++) if (!veh[i].bus) cars.setColorAt(k++, col.set(veh[i].color));
  if (cars.instanceColor) cars.instanceColor.needsUpdate = true;

  // ---------------------------------------------------------------- pedestrians outside buildings
  const nearestRoad = (c) => {
    let best = null;
    for (const r of map.roads || []) {
      const along = r.w > r.d;
      const px = along ? Math.max(r.x - r.w / 2, Math.min(r.x + r.w / 2, c.x)) : r.x;
      const pz = along ? r.z : Math.max(r.z - r.d / 2, Math.min(r.z + r.d / 2, c.z));
      const dd = Math.hypot(px - c.x, pz - c.z);
      if (!best || dd < best.dd) best = { dd, r, along, px, pz };
    }
    return best;
  };
  const walkers = [];
  const perBuilding = L.walkers ?? 3;
  for (const c of map.customers || []) {
    const nr = nearestRoad(c);
    if (!nr || nr.dd > 60) continue;
    const half = (nr.along ? nr.r.d : nr.r.w) / 2 + 1.4;
    const side = nr.along ? Math.sign(c.z - nr.r.z) || 1 : Math.sign(c.x - nr.r.x) || 1;
    const big = Math.max(c.w || 10, c.d || 10);
    const n = Math.min(8, Math.max(1, Math.round(perBuilding * (big / 14) ** 0.6 * (c.scale ? 1.5 : 1))));
    for (let k = 0; k < n; k++) {
      walkers.push({
        id: c.id,
        along: nr.along,
        x: nr.along ? nr.px : nr.r.x + side * half,
        z: nr.along ? nr.r.z + side * half : nr.pz,
        span: Math.max(6, big * 0.6),
        ph: R() * Math.PI * 2,
        sp: 0.12 + R() * 0.12,
        gate: R(),
        color: PED_COLS[Math.floor(R() * PED_COLS.length)],
      });
    }
  }
  const pedGeo = new THREE.CapsuleGeometry(0.42, 1.0, 2, 6).translate(0, 1.0, 0);
  const headGeo = new THREE.SphereGeometry(0.33, 8, 6).translate(0, 2.1, 0);
  const peds = inst(pedGeo, new THREE.MeshStandardMaterial({ roughness: 0.75 }), walkers.length);
  const heads = inst(headGeo, new THREE.MeshStandardMaterial({ color: '#c99a7a', roughness: 0.8 }), walkers.length);
  heads.castShadow = false;
  walkers.forEach((w, i) => peds.setColorAt(i, col.set(w.color)));
  if (peds.instanceColor) peds.instanceColor.needsUpdate = true;

  // ---------------------------------------------------------------- boats on open water
  const seas = (map.water || []).filter((w) => Math.min(w.w, w.d) >= 30);
  const boats = [];
  for (const w of seas) {
    const n = Math.min(6, Math.max(2, Math.round(Math.max(w.w, w.d) / 160)));
    for (let k = 0; k < n; k++) boats.push({ w, along: w.w >= w.d, s: R(), off: (R() - 0.5) * 0.6, speed: 2 + R() * 3, dir: R() < 0.5 ? 1 : -1 });
  }
  const hullGeo = new THREE.BoxGeometry(7, 1.2, 2.6).translate(0, 0.5, 0);
  const deckGeo = new THREE.BoxGeometry(2.6, 1.4, 2).translate(-0.8, 1.8, 0);
  const hulls = inst(hullGeo, new THREE.MeshStandardMaterial({ color: '#c8452f', roughness: 0.6 }), boats.length);
  const decks = inst(deckGeo, new THREE.MeshStandardMaterial({ color: '#f4efe4', roughness: 0.6 }), boats.length);

  // ---------------------------------------------------------------- birds (a loose flock, daytime)
  const NBIRD = L.birds ?? 14;
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.6, 0, -1.4, -0.3, 0, 0, 0, 0, 0, -0.3, 0, 0, -0.6, 0, 1.4], 3));
  birdGeo.computeVertexNormals();
  const birds = inst(birdGeo, new THREE.MeshBasicMaterial({ color: '#2b2b30', side: THREE.DoubleSide }), NBIRD);
  birds.castShadow = false;
  const flock = Array.from({ length: NBIRD }, () => ({ a: R() * Math.PI * 2, r: 6 + R() * 14, y: R() * 6, f: 6 + R() * 4 }));

  // ---------------------------------------------------------------- tower crane (plots about to be built) and market stalls
  const crane = new THREE.Group();
  {
    const steel = new THREE.MeshStandardMaterial({ color: '#f2b630', roughness: 0.5, metalness: 0.2 });
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.4, 34, 1.4).translate(0, 17, 0), steel);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(30, 1.2, 1.2).translate(8, 34, 0), steel);
    const weight = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2.4).translate(-6, 33, 0), new THREE.MeshStandardMaterial({ color: '#8e8a82' }));
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2).translate(1.2, 32.5, 1.4), new THREE.MeshStandardMaterial({ color: '#e9e2d4' }));
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.15, 12, 0.15).translate(18, 28, 0), new THREE.MeshStandardMaterial({ color: '#333' }));
    const load = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1.6).translate(18, 21.5, 0), new THREE.MeshStandardMaterial({ color: '#b5651d' }));
    crane.add(mast, jib, weight, cab, hook, load);
    crane.userData.top = new THREE.Group();
    for (const o of [jib, weight, cab, hook, load]) {
      crane.remove(o);
      crane.userData.top.add(o);
    }
    crane.add(crane.userData.top);
    crane.traverse((o) => o.isMesh && (o.castShadow = true));
    crane.visible = false;
    root.add(crane);
  }
  const stallGeo = new THREE.BoxGeometry(3.2, 1.1, 2).translate(0, 0.55, 0);
  const awnGeo = new THREE.ConeGeometry(2.6, 1.2, 4).rotateY(Math.PI / 4).translate(0, 2.6, 0);
  const stalls = inst(stallGeo, new THREE.MeshStandardMaterial({ color: '#b98a5a', roughness: 0.8 }), 24);
  const awns = inst(awnGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), 24);
  for (let i = 0; i < 24; i++) awns.setColorAt(i, col.set(['#d9443a', '#f4f1ea', '#3d6fa8', '#f2b630'][i % 4]));
  if (awns.instanceColor) awns.instanceColor.needsUpdate = true;

  // an electric train on the railway (Highvale): it only moves while the traction supply has power
  let train = null;
  if (map.rail) {
    train = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: '#d9443a', roughness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: '#23313d', roughness: 0.2, metalness: 0.3 });
    for (let k = 0; k < 4; k++) {
      const car = new THREE.Mesh(new RoundedBoxGeometry(11, 3.2, 2.8, 2, 0.5), body);
      car.position.set(-k * 11.8, 2.1, 0);
      car.castShadow = true;
      train.add(car);
      const win = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.9, 2.86), glass);
      win.position.set(-k * 11.8, 2.6, 0);
      train.add(win);
    }
    const panto = new THREE.Mesh(new THREE.BoxGeometry(2, 0.15, 1.2), new THREE.MeshStandardMaterial({ color: '#444' }));
    panto.position.set(0, 4.1, 0);
    train.add(panto);
    root.add(train);
    train.userData = { s: 0.2, dir: 1, along: map.rail.w > map.rail.d, len: Math.min(Math.max(map.rail.w, map.rail.d), (map.rail.w > map.rail.d ? T.hw : T.hd) * 2 - 20) };
  }
  const custById = new Map((map.customers || []).map((c) => [c.id, c]));
  const lit = (st, id) => {
    const cs = st.cust?.[id];
    return cs && cs.active !== false && (cs.status === 'on' || cs.status === 'partial');
  };

  const busLamp = new THREE.Matrix4().makeTranslation(2.8, 0.6, 0);
  let t0 = 0;
  function update(st, dt, time, nightK, reduceMotion) {
    if (!st) return;
    const hour = ((st.clock % 1440) + 1440) % 1440 / 60;
    const move = reduceMotion ? 0 : Math.min(dt, 0.1);
    t0 += move;
    const night = nightK > 0.45;

    // traffic
    const share = trafficAt(hour);
    let nc = 0;
    let nb = 0;
    let nw = 0;
    let nl = 0;
    for (const v of veh) {
      if (v.gate > share || !lanes.length) continue;
      const ln = lanes[v.lane];
      if (v.stopT > 0) v.stopT -= move;
      else {
        v.s += (move * v.speed * ln.dir) / ln.len;
        if (v.bus && Math.abs(((v.s * ln.len) % 120) - 60) < v.speed * move) v.stopT = 2.5; // bus stop every 120 m
      }
      v.s = ((v.s % 1) + 1) % 1;
      const p = (v.s - 0.5) * ln.len;
      const x = ln.along ? ln.x + p : ln.x + ln.off;
      const z = ln.along ? ln.z + ln.off : ln.z + p;
      const yaw = ln.along ? (ln.dir > 0 ? 0 : Math.PI) : ln.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      q.setFromAxisAngle(up, yaw);
      m4.compose(v3.set(x, 0.3, z), q, sc.set(1, 1, 1));
      if (v.bus) {
        buses.setMatrixAt(nb, m4);
        busWin.setMatrixAt(nb++, m4);
      } else {
        cars.setMatrixAt(nc, m4);
        cabs.setMatrixAt(nc++, m4);
      }
      wheels.setMatrixAt(nw++, m4);
      if (night) {
        if (v.bus) m4.multiply(busLamp);
        lamps.setMatrixAt(nl++, m4);
      }
    }
    // cars keep their colour by slot; recolour if the visible set changed order
    cars.count = cabs.count = nc;
    buses.count = busWin.count = nb;
    wheels.count = nw;
    lamps.count = nl;
    for (const im of [cars, cabs, buses, busWin, wheels, lamps]) im.instanceMatrix.needsUpdate = true;

    // pedestrians: only outside buildings with power, more by day
    const wshare = walkersAt(hour);
    let np = 0;
    for (const w of walkers) {
      if (w.gate > wshare || !lit(st, w.id)) continue;
      const u = Math.sin(t0 * w.sp + w.ph);
      const off = u * w.span * 0.5;
      const x = w.along ? w.x + off : w.x;
      const z = w.along ? w.z : w.z + off;
      const dir = Math.cos(t0 * w.sp + w.ph) >= 0 ? 1 : -1;
      q.setFromAxisAngle(up, w.along ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      const bob = reduceMotion ? 0 : Math.abs(Math.sin(t0 * 7 + w.ph)) * 0.12;
      m4.compose(v3.set(x, 0.25 + bob, z), q, sc.set(1, 1, 1));
      peds.setColorAt(np, col.set(w.color));
      peds.setMatrixAt(np, m4);
      heads.setMatrixAt(np++, m4);
    }
    peds.count = heads.count = np;
    peds.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
    if (peds.instanceColor) peds.instanceColor.needsUpdate = true;

    // boats drift along the coast or river
    let nbo = 0;
    for (const b of boats) {
      b.s = (((b.s + (move * b.speed * b.dir) / Math.max(b.w.w, b.w.d)) % 1) + 1) % 1;
      const p = (b.s - 0.5) * (b.along ? b.w.w : b.w.d) * 0.9;
      const x = b.along ? b.w.x + p : b.w.x + b.off * b.w.w;
      const z = b.along ? b.w.z + b.off * b.w.d : b.w.z + p;
      q.setFromAxisAngle(up, b.along ? (b.dir > 0 ? 0 : Math.PI) : b.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      m4.compose(v3.set(x, 0.1 + Math.sin(time * 1.4 + b.s * 40) * 0.12, z), q, sc.set(1, 1, 1));
      hulls.setMatrixAt(nbo, m4);
      decks.setMatrixAt(nbo++, m4);
    }
    hulls.count = decks.count = nbo;
    hulls.instanceMatrix.needsUpdate = decks.instanceMatrix.needsUpdate = true;

    // birds circle lazily over the town by day
    let nbi = 0;
    if (!night && hour > 6 && hour < 20) {
      const cx = T.cx + Math.sin(t0 * 0.02) * T.hw * 0.4;
      const cz = T.cz + Math.cos(t0 * 0.017) * T.hd * 0.4;
      for (const b of flock) {
        const a = b.a + t0 * 0.35;
        const flap = reduceMotion ? 1 : 0.6 + 0.4 * Math.abs(Math.sin(t0 * b.f + b.a));
        q.setFromAxisAngle(up, -a);
        m4.compose(v3.set(cx + Math.cos(a) * b.r, 42 + b.y, cz + Math.sin(a) * b.r), q, sc.set(1.3, 1, 1.3 * flap));
        birds.setMatrixAt(nbi++, m4);
      }
    }
    birds.count = nbi;
    birds.instanceMatrix.needsUpdate = true;

    if (train) {
      const u = train.userData;
      const on = !map.railCustomer || lit(st, map.railCustomer);
      if (on) u.s += (move * 9 * u.dir) / u.len;
      if (u.s > 1) (u.s = 1), (u.dir = -1);
      if (u.s < 0) (u.s = 0), (u.dir = 1);
      const p = (u.s - 0.5) * (u.len - 50);
      train.position.set(u.along ? map.rail.x + p : map.rail.x, 0.2, u.along ? map.rail.z : map.rail.z + p);
      train.rotation.y = u.along ? (u.dir > 0 ? 0 : Math.PI) : u.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    // crane over a plot that is about to be built (arrivals warned, or a building not yet active)
    let craneAt = null;
    for (const d of st.ev?.deck || []) if (d.kind === 'arrivals' && d.phase === 'warned' && d.p.at) craneAt = d.p.at;
    crane.visible = !!craneAt;
    if (craneAt) {
      crane.position.set(craneAt.x + 10, 0, craneAt.z - 10);
      crane.scale.setScalar(0.62);
      crane.userData.top.rotation.y = reduceMotion ? 0.6 : Math.sin(time * 0.15) * 1.4;
    }

    // market stalls during festivals and VIP visits
    let ns = 0;
    for (const d of st.ev?.deck || []) {
      if (d.phase !== 'active' || !(d.kind === 'festival' || d.kind === 'vipVisit')) continue;
      const at = d.p.at || (d.p.zone ? { x: d.p.zone.x, z: d.p.zone.z } : null);
      const c0 = at || (d.ids?.[0] ? custById.get(d.ids[0]) : null);
      if (!c0) continue;
      const nr = nearestRoad(c0);
      const ax = nr ? nr.px : c0.x;
      const az = nr ? nr.pz : c0.z;
      for (let k = 0; k < 8 && ns < 24; k++, ns++) {
        const s = (k - 3.5) * 5;
        const along = nr ? nr.along : true;
        const side = k % 2 ? 1 : -1;
        const half = nr ? (along ? nr.r.d : nr.r.w) / 2 + 3.2 : 6;
        const x = along ? ax + s : ax + side * half;
        const z = along ? az + side * half : az + s;
        q.setFromAxisAngle(up, along ? 0 : Math.PI / 2);
        m4.compose(v3.set(x, 0.2, z), q, sc.set(1, 1, 1));
        stalls.setMatrixAt(ns, m4);
        awns.setMatrixAt(ns, m4);
      }
    }
    stalls.count = awns.count = ns;
    stalls.instanceMatrix.needsUpdate = awns.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    scene.remove(root);
    for (const x of disposables) x.dispose?.();
    crane.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }

  return { update, dispose, root, counts: () => ({ vehicles: cars.count + buses.count, walkers: peds.count, boats: hulls.count, birds: birds.count }) };
}
