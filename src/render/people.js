// Hi-vis workers, the repair crew truck and town traffic (visible progress, GDD §15).
import * as THREE from 'three';
import { glowTexture } from './textures.js';

const VEST = new THREE.Color('#c8f03a');

function makeWorker() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.9, 3, 8), new THREE.MeshStandardMaterial({ color: VEST, emissive: VEST, emissiveIntensity: 0.25, roughness: 0.6 }));
  body.position.y = 1.0;
  body.castShadow = true;
  g.add(body);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.2) }));
  stripe.position.y = 1.05;
  g.add(stripe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshStandardMaterial({ color: '#c99a7a' }));
  head.position.y = 1.85;
  g.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.4 }));
  helmet.position.y = 1.92;
  g.add(helmet);
  g.scale.setScalar(1.35);
  return g;
}

function makeVehicle(bodyColor, isTruck) {
  const g = new THREE.Group();
  const bm = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.5, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(isTruck ? 5.4 : 4.2, 1.3, 2.1), bm);
  body.position.y = 1.0;
  body.castShadow = true;
  g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(isTruck ? 2.2 : 2.4, 1.1, 1.9), new THREE.MeshStandardMaterial({ color: '#1a2633', roughness: 0.3, metalness: 0.5 }));
  cab.position.set(isTruck ? 1.3 : -0.1, 2.1, 0);
  g.add(cab);
  const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.4) });
  for (const s of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.4), lightMat);
    hl.position.set((isTruck ? 5.4 : 4.2) / 2 + 0.02, 1.1, s);
    g.add(hl);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.15, 0.1) });
  for (const s of [-0.75, 0.75]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.3), tailMat);
    tl.position.set(-(isTruck ? 5.4 : 4.2) / 2 - 0.02, 1.1, s);
    g.add(tl);
  }
  // headlight cone on the ground
  const cone = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 7),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(0.9, 0.85, 0.7), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  cone.rotation.x = -Math.PI / 2;
  cone.position.set((isTruck ? 5.4 : 4.2) / 2 + 6, 0.25, 0);
  g.add(cone);
  g.userData.cone = cone;
  if (isTruck) {
    const barMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 1.4, 0.1) });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 1.5), barMat);
    bar.position.set(1.3, 2.75, 0);
    g.add(bar);
    g.userData.bar = barMat;
    // ladder rack
    const rack = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 1.6), new THREE.MeshStandardMaterial({ color: '#8a96a3', metalness: 0.6 }));
    rack.position.set(-1.0, 2.0, 0);
    g.add(rack);
  }
  return g;
}

export function createPeople(scene, map) {
  const root = new THREE.Group();
  scene.add(root);
  const gen = map.generator;
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
  const truck = makeVehicle('#e9eef3', true);
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
  const cars = ['#7d2f36', '#2f4f7d', '#c9a24a'].map((c, i) => {
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
    truck.userData.cone.material.opacity = 0.55 * nightK;
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
      if (c.route === 'main') {
        const x = -150 + c.off * 300;
        const fwd = i % 2 === 0;
        c.v.position.set(fwd ? x : -x, 0, fwd ? 2 : -2);
        c.v.rotation.y = fwd ? 0 : Math.PI;
      } else {
        const z = -90 + c.off * 180;
        c.v.position.set(38, 0, z);
        c.v.rotation.y = -Math.PI / 2;
      }
      c.v.userData.cone.material.opacity = 0.5 * nightK;
    });
  }

  return { root, update, truck };
}
