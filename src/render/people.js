// Hi-vis workers, the repair crew truck and town traffic (visible progress, GDD §15).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { glowTexture } from './textures.js';

const VEST = new THREE.Color('#ff8a2a');

function makeWorker() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.9, 3, 8), new THREE.MeshStandardMaterial({ color: VEST, emissive: VEST, emissiveIntensity: 0.12, roughness: 0.6 }));
  body.position.y = 1.0;
  body.castShadow = true;
  g.add(body);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.2) }));
  stripe.position.y = 1.05;
  g.add(stripe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshStandardMaterial({ color: '#c99a7a' }));
  head.position.y = 1.85;
  g.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffd23a', roughness: 0.4 }));
  helmet.position.y = 1.92;
  g.add(helmet);
  g.scale.setScalar(1.35);
  return g;
}

function makeVehicle(bodyColor, isTruck) {
  // chunky toy car / crew van (reso/graphic image 1, 19, 20): rounded body, glass cabin, fat wheels
  const g = new THREE.Group();
  const L = isTruck ? 5.6 : 4.4;
  const bm = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.45, metalness: 0.1 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(L, 1.35, 2.2, 3, 0.45), bm);
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const glass = new THREE.MeshStandardMaterial({ color: '#2d3f52', roughness: 0.2, metalness: 0.3 });
  const cab = new THREE.Mesh(new RoundedBoxGeometry(isTruck ? 2.0 : 2.5, 1.15, 2.0, 3, 0.4), glass);
  cab.position.set(isTruck ? 1.55 : -0.15, 2.05, 0);
  cab.castShadow = true;
  g.add(cab);
  const roof = new THREE.Mesh(new RoundedBoxGeometry(isTruck ? 2.1 : 2.3, 0.25, 2.05, 2, 0.12), bm);
  roof.position.set(isTruck ? 1.55 : -0.15, 2.66, 0);
  g.add(roof);
  if (isTruck) {
    const box = new THREE.Mesh(new RoundedBoxGeometry(3.2, 1.6, 2.15, 3, 0.3), bm);
    box.position.set(-1.1, 2.1, 0);
    box.castShadow = true;
    g.add(box);
    const stripe = new THREE.Mesh(new RoundedBoxGeometry(L + 0.04, 0.3, 2.24, 2, 0.1), new THREE.MeshStandardMaterial({ color: '#f0782e', roughness: 0.5 }));
    stripe.position.y = 1.2;
    g.add(stripe);
  }
  const tyre = new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 0.9 });
  const hubM = new THREE.MeshStandardMaterial({ color: '#d9d4c8', roughness: 0.5 });
  const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 16);
  const hubGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.48, 10);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, tyre);
      w.rotation.x = Math.PI / 2;
      w.position.set(sx * (L / 2 - 0.95), 0.55, sz * 1.0);
      g.add(w);
      const hb = new THREE.Mesh(hubGeo, hubM);
      hb.rotation.x = Math.PI / 2;
      hb.position.copy(w.position);
      g.add(hb);
    }
  const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.4, 1.9) });
  for (const s of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), lightMat);
    hl.position.set(L / 2 - 0.05, 1.15, s);
    g.add(hl);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.15, 0.1) });
  for (const s of [-0.75, 0.75]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.32), tailMat);
    tl.position.set(-L / 2 - 0.02, 1.15, s);
    g.add(tl);
  }
  // headlight cone on the ground (night only)
  const cone = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 7),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(0.9, 0.8, 0.6), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  cone.rotation.x = -Math.PI / 2;
  cone.position.set(L / 2 + 6, 0.4, 0);
  g.add(cone);
  g.userData.cone = cone;
  if (isTruck) {
    const barMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 1.4, 0.1) });
    const bar = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.26, 1.5, 2, 0.1), barMat);
    bar.position.set(1.55, 2.92, 0);
    g.add(bar);
    g.userData.bar = barMat;
    const rack = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 1.6), new THREE.MeshStandardMaterial({ color: '#c9ccce', metalness: 0.5 }));
    rack.position.set(-1.1, 3.0, 0);
    g.add(rack);
  }
  return g;
}

export function createPeople(scene, map) {
  const root = new THREE.Group();
  scene.add(root);
  const gen = map.generator || (map.sources || [])[0] || { x: map.depot.x - 30, z: map.depot.z };
  const dep = map.depot;

  // idle workers (generator yard, depot)
  const idle = [
    [gen.x + 6, gen.z + 3, 2.2],
    [gen.x + 4, gen.z + 6, -0.6],
    [dep.x - 6, dep.z - 9, 1.2],
    [dep.x - 3, dep.z - 10, -2.4],
  ].map(([x, z, r]) => {
    const w = makeWorker();
    w.position.set(x, 0, z);
    w.rotation.y = r;
    root.add(w);
    return w;
  });

  // crew truck + crew
  const truck = makeVehicle('#f4f1ea', true);
  const home = new THREE.Vector3(dep.x - 2, 0, dep.z - 13);
  truck.position.copy(home);
  truck.rotation.y = Math.PI;
  root.add(truck);
  const crew = [makeWorker(), makeWorker(), makeWorker()];
  crew.forEach((w) => {
    w.visible = false;
    root.add(w);
  });

  // cars that appear as the town comes alive
  const cars = ['#d9443a', '#3d6fa8', '#f2b630'].map((c, i) => {
    const v = makeVehicle(c, false);
    v.visible = false;
    root.add(v);
    return { v, off: i / 3, lane: i % 2 ? 2 : -2, speed: 0.014 + i * 0.003, route: i === 2 ? 'cross' : 'main' };
  });

  // route for the truck: depot → main road → along road → stop beside the asset
  function routeTo(site) {
    const pts = [home.clone(), new THREE.Vector3(dep.x - 2, 0, 2), new THREE.Vector3(site.x, 0, 2)];
    const roadSide = site.z < 0 ? -1 : 1;
    const nearRoad = Math.abs(site.z) < 40;
    if (!nearRoad && Math.abs(site.x - 40) < 80) {
      pts[2] = new THREE.Vector3(42, 0, 2);
      pts.push(new THREE.Vector3(42, 0, site.z));
      pts.push(new THREE.Vector3(Math.abs(site.x - 42) > 6 ? site.x + (site.x > 42 ? -4 : 4) : 42, 0, site.z + 6 * roadSide * 0));
    } else {
      pts.push(new THREE.Vector3(site.x + 3, 0, roadSide * 4.5));
    }
    return pts;
  }
  function along(pts, f) {
    let total = 0;
    const seg = [];
    for (let i = 1; i < pts.length; i++) {
      const d = pts[i].distanceTo(pts[i - 1]);
      seg.push(d);
      total += d;
    }
    let s = f * total;
    for (let i = 0; i < seg.length; i++) {
      if (s <= seg[i] || i === seg.length - 1) {
        const k = seg[i] ? Math.min(1, s / seg[i]) : 1;
        const p = pts[i].clone().lerp(pts[i + 1], k);
        const dir = pts[i + 1].clone().sub(pts[i]);
        return { p, yaw: Math.atan2(-dir.z, dir.x) };
      }
      s -= seg[i];
    }
    return { p: pts[pts.length - 1].clone(), yaw: 0 };
  }

  let route = null;
  let routeTarget = null;
  /** Sync with sim crew job; render interpolates sim time (deterministic progress). */
  function update(state, dt, time, nightK, reduceMotion, siteOf) {
    const job = state.crew.job;
    let showCrew = false;
    let crewAt = null;
    if (job) {
      const site = siteOf(job.target);
      if (site && routeTarget !== job.target) {
        route = routeTo(site);
        routeTarget = job.target;
      }
      if (route) {
        let f = 0;
        if (job.phase === 'travel') f = 1 - job.remain / job.travel;
        else if (job.phase === 'return') f = job.remain / job.travel;
        else f = 1;
        const a = along(route, Math.max(0, Math.min(1, f)));
        if (job.phase === 'travel' && job.hopFrom && site) {
          // driving straight from the last job to this one
          const k = Math.max(0, Math.min(1, 1 - job.remain / (job.hopTravel || 1)));
          a.p = a.p.clone().set(job.hopFrom.x + (site.x - job.hopFrom.x) * k, a.p.y, job.hopFrom.z + (site.z - job.hopFrom.z) * k);
          a.yaw = Math.atan2(-(site.z - job.hopFrom.z), site.x - job.hopFrom.x);
        }
        truck.position.lerp(a.p, Math.min(1, dt * 8));
        let yaw = a.yaw + (job.phase === 'return' ? Math.PI : 0);
        truck.rotation.y += (((yaw - truck.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 6);
        if (job.phase === 'work' || job.phase === 'standby') {
          showCrew = true;
          crewAt = site;
        }
      }
    } else {
      routeTarget = null;
      truck.position.lerp(home, Math.min(1, dt * 3));
    }
    truck.userData.bar.color.setRGB(job && !reduceMotion && Math.sin(time * 10) > 0 ? 2.8 : 0.3, job && !reduceMotion && Math.sin(time * 10) > 0 ? 1.4 : 0.15, 0.05);
    const nk = Math.max(0, (nightK - 0.3) / 0.7) ** 2;
    truck.userData.cone.material.opacity = 0.55 * nk;
    crew.forEach((w, i) => {
      w.visible = showCrew;
      if (showCrew) {
        const a = (i / 3) * Math.PI * 2 + 0.6;
        w.position.set(crewAt.x + Math.cos(a) * 2.6, reduceMotion ? 0 : Math.abs(Math.sin(time * 5 + i)) * 0.25, crewAt.z + Math.sin(a) * 2.6);
        w.lookAt(crewAt.x, 0, crewAt.z);
      }
    });
    idle.forEach((w, i) => {
      if (!reduceMotion) w.rotation.y += Math.sin(time * 0.5 + i) * dt * 0.2;
    });

    // traffic grows with powered customers
    const powered = state.flow.powered || 0;
    cars.forEach((c, i) => {
      c.v.visible = powered >= 5 + i * 3;
      if (!c.v.visible) return;
      c.off = (c.off + dt * c.speed * (reduceMotion ? 0.5 : 1)) % 1;
      const mainR = map.roads.find((r) => r.id === 'main');
      const crossR = map.roads.find((r) => r !== mainR && (r.lanes ?? r.id === 'cross') && r.d > r.w);
      if (c.route === 'main' || !crossR) {
        const half = Math.min(150, mainR.w * 0.45);
        const x = mainR.x - half + c.off * half * 2;
        const fwd = i % 2 === 0;
        c.v.position.set(fwd ? x : 2 * mainR.x - x, 0, mainR.z + (fwd ? 2 : -2));
        c.v.rotation.y = fwd ? 0 : Math.PI;
      } else {
        const half = crossR.d * 0.45;
        const z = crossR.z - half + c.off * half * 2;
        c.v.position.set(crossR.x - 2, 0, z);
        c.v.rotation.y = -Math.PI / 2;
      }
      c.v.userData.cone.material.opacity = 0.5 * nk;
    });
  }

  return { root, update, truck, dispose: () => scene.remove(root) };
}
