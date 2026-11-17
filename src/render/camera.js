// Isometric-style camera rig: bounded pan, three zoom bands, 90° rotation steps, fly-to (GDD §15).
import * as THREE from 'three';

export function createCameraRig(camera, bounds) {
  const rig = {
    target: new THREE.Vector3(-10, 0, 4),
    goal: new THREE.Vector3(-10, 0, 4),
    yaw: Math.PI / 4,
    yawGoal: Math.PI / 4,
    pitch: 0.92, // radians above horizon (~53°)
    pitchGoal: 0.92,
    dist: 300,
    distGoal: 300,
    minDist: 70,
    maxDist: 460,
    smooth: true,
    cinematic: null, // fn(t) → {target, yaw, pitch, dist}
  };
  const ray = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const v = new THREE.Vector3();
  const ndc = new THREE.Vector2();

  rig.pan = (dx, dz) => {
    // dx/dz in screen-aligned metres
    const c = Math.cos(rig.yawGoal);
    const s = Math.sin(rig.yawGoal);
    rig.goal.x += dx * c + dz * s;
    rig.goal.z += -dx * s + dz * c;
    clamp();
  };
  rig.zoom = (factor) => {
    rig.distGoal = THREE.MathUtils.clamp(rig.distGoal * factor, rig.minDist, rig.maxDist);
  };
  rig.rotate = (steps) => {
    rig.yawGoal += (steps * Math.PI) / 2;
  };
  rig.reset = () => {
    rig.goal.set(-10, 0, 4);
    rig.yawGoal = Math.round((rig.yawGoal - Math.PI / 4) / (Math.PI * 2)) * Math.PI * 2 + Math.PI / 4;
    rig.distGoal = 300;
    rig.pitchGoal = 0.92;
  };
  rig.flyTo = (x, z, dist) => {
    rig.goal.set(x, 0, z);
    if (dist) rig.distGoal = dist;
    clamp();
  };
  function clamp() {
    rig.goal.x = THREE.MathUtils.clamp(rig.goal.x, bounds.minX - 20, bounds.maxX + 20);
    rig.goal.z = THREE.MathUtils.clamp(rig.goal.z, bounds.minZ - 20, bounds.maxZ + 20);
  }
  rig.zoomBand = () => (rig.dist < 140 ? 'asset' : rig.dist < 280 ? 'district' : 'planning');

  rig.update = (dt, time) => {
    if (rig.cinematic) {
      const c = rig.cinematic(time);
      rig.target.copy(c.target);
      rig.yaw = c.yaw;
      rig.pitch = c.pitch;
      rig.dist = c.dist;
    } else {
      const k = rig.smooth ? 1 - Math.exp(-dt * 7) : 1;
      rig.target.lerp(rig.goal, k);
      rig.yaw += (rig.yawGoal - rig.yaw) * k;
      rig.pitch += (rig.pitchGoal - rig.pitch) * k;
      rig.dist += (rig.distGoal - rig.dist) * k;
    }
    const cp = Math.cos(rig.pitch);
    camera.position.set(
      rig.target.x + Math.sin(rig.yaw) * cp * rig.dist,
      rig.target.y + Math.sin(rig.pitch) * rig.dist,
      rig.target.z + Math.cos(rig.yaw) * cp * rig.dist,
    );
    camera.lookAt(rig.target);
  };

  /** Screen pixel → ground point {x,z} or null. */
  rig.groundAt = (px, py) => {
    ndc.set((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.ray.intersectPlane(ground, v);
    return hit ? { x: hit.x, z: hit.z } : null;
  };
  /** World → screen pixel, with visibility flag. */
  rig.toScreen = (x, y, z) => {
    v.set(x, y, z).project(camera);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, visible: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 };
  };
  /** North arrow angle (deg) for the compass. */
  rig.northDeg = () => (rig.yaw * 180) / Math.PI;
  return rig;
}
