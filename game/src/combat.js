// SOLMAR BAY — combat. On foot the player punches (Space, close range) and
// shoots (mouse click, hitscan ray against peds, officers and cars). Shots
// and kills raise the wanted level; hitting a car damages it until it smokes.
// Health regenerates slowly when the player is out of trouble.
import * as THREE from 'three';
import { PLAYER } from './config.js';

export class Combat {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.fireCooldown = 0;
    this.punchCooldown = 0;
    this.tracer = null;
    this.tracerTimer = 0;
    // A thin glowing line that flashes along each shot.
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0 }));
    this.tracer.visible = false;
    this.scene.add(this.tracer);
  }

  // Hitscan shot from the player's position along a direction. Returns what
  // was hit: {type:'ped'|'officer'|'car'|'none', target, killed}.
  shoot(origin, dir, peds, officers, cars) {
    if (this.fireCooldown > 0) return null;
    this.fireCooldown = 1 / PLAYER.fireRate;
    this.audio.shoot();
    const ray = new THREE.Raycaster(
      new THREE.Vector3(origin.x, 1.4, origin.z),
      new THREE.Vector3(dir.x, 0, dir.z).normalize(),
      0,
      PLAYER.shootRange,
    );
    const targets = [];
    for (const ped of peds) {
      if (ped.alive) targets.push({ obj: ped.mesh, kind: 'ped', ref: ped });
    }
    for (const off of officers) {
      if (off.alive) targets.push({ obj: off.mesh, kind: 'officer', ref: off });
    }
    for (const car of cars) {
      targets.push({ obj: car.mesh, kind: 'car', ref: car });
    }
    const hits = ray.intersectObjects(targets.map((t) => t.obj), true);
    const end = new THREE.Vector3(origin.x + dir.x * PLAYER.shootRange, 1.4, origin.z + dir.z * PLAYER.shootRange);
    let result = { type: 'none', killed: false };
    if (hits.length > 0) {
      const hit = hits[0];
      end.copy(hit.point);
      let node = hit.object;
      while (node.parent && node.parent !== this.scene) node = node.parent;
      const found = targets.find((t) => t.obj === node || t.obj === hit.object);
      if (found) {
        result = this.damage(found, PLAYER.shootDamage);
      }
    }
    this.flashTracer(new THREE.Vector3(origin.x, 1.4, origin.z), end);
    return result;
  }

  damage(found, amount) {
    const target = found.ref;
    if (found.kind === 'car') {
      target.hp -= amount;
      target.mesh.userData.smoke.visible = target.hp < 45;
      return { type: 'car', target, killed: target.hp <= 0 };
    }
    target.hp -= amount;
    if (target.hp <= 0) {
      if (found.kind === 'ped') {
        target.alive = false;
        target.mesh.visible = false;
      } else {
        target.alive = false;
        target.mesh.visible = false;
      }
      return { type: found.kind, target, killed: true };
    }
    return { type: found.kind, target, killed: false };
  }

  punch(origin, facing, peds, officers) {
    if (this.punchCooldown > 0) return null;
    this.punchCooldown = 0.5;
    this.audio.punch();
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    let best = null;
    let bestDist = PLAYER.punchRange;
    for (const ped of [...peds, ...officers]) {
      if (!ped.alive) continue;
      const dx = ped.x - origin.x;
      const dz = ped.z - origin.z;
      const dist = Math.hypot(dx, dz);
      const dot = dist > 0 ? (dx * fx + dz * fz) / dist : 0;
      if (dist < bestDist && dot > 0.5) {
        bestDist = dist;
        best = ped;
      }
    }
    if (!best) return { type: 'none', killed: false };
    best.hp -= PLAYER.punchDamage;
    if (best.hp <= 0) {
      best.alive = false;
      best.mesh.visible = false;
      return { type: 'ped', target: best, killed: true };
    }
    return { type: 'ped', target: best, killed: false };
  }

  flashTracer(from, to) {
    const pos = this.tracer.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    this.tracer.visible = true;
    this.tracerTimer = 0.08;
  }

  update(dt) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0) this.tracer.visible = false;
    }
  }
}
