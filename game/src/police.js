// SOLMAR BAY — the wanted system and the Bay Police. Stars rise when the
// player steals, shoots or hurts people; police cars and foot officers spawn
// and chase, ram, and arrest. When no officer can see the player for a while,
// stars decay one at a time. Getting caught on foot with stars up means
// BUSTED; at 5 stars the police shoot.
import * as THREE from 'three';
import { WANTED } from './config.js';
import { makeRng } from './rng.js';
import { makeCar } from './vehicles.js';
import { buildPedMesh } from './pedestrians.js';
import { resolveCollisions } from './world.js';

export class Police {
  constructor(scene, seed, colliders, lines) {
    this.scene = scene;
    this.rng = makeRng(seed + 303);
    this.colliders = colliders;
    this.lines = lines;
    this.stars = 0;
    this.unseenTimer = 0;
    this.cars = [];
    this.officers = [];
    this.bustedTimer = 0;
  }

  addStars(n) {
    this.stars = Math.min(WANTED.maxStars, this.stars + n);
    this.unseenTimer = 0;
    this.ensureForce();
  }

  clear() {
    this.stars = 0;
    this.unseenTimer = 0;
    for (const car of this.cars) this.scene.remove(car.mesh);
    for (const off of this.officers) this.scene.remove(off.mesh);
    this.cars = [];
    this.officers = [];
  }

  ensureForce() {
    const wantCars = this.stars >= 1 ? Math.min(2 + this.stars, 5) : 0;
    while (this.cars.length < wantCars) this.spawnCar();
    const wantOfficers = this.stars >= 2 ? this.stars : 0;
    while (this.officers.length < wantOfficers) this.spawnOfficer();
  }

  spawnCar() {
    const x = this.rng.range(-120, 120);
    const z = this.rng.range(-120, 120);
    const car = makeCar(x, z, this.rng.range(0, Math.PI * 2), 0x1a2a3a, 'Sedan', true);
    // Police livery: white doors and a light bar.
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.25, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    bar.position.set(0, 1.65, 0);
    car.mesh.add(bar);
    car.driver = 'police';
    car.speed = 0;
    this.scene.add(car.mesh);
    this.cars.push(car);
  }

  spawnOfficer() {
    const mesh = buildPedMesh(0x1a2a4a);
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.12, 10),
      new THREE.MeshLambertMaterial({ color: 0x101828 }),
    );
    hat.position.y = 1.9;
    mesh.add(hat);
    mesh.position.set(this.rng.range(-100, 100), 0, this.rng.range(-100, 100));
    this.scene.add(mesh);
    this.officers.push({ mesh, x: mesh.position.x, z: mesh.position.z, heading: 0, speed: 4.5, hp: 60, alive: true });
  }

  // True when any police unit is within sight range of the player.
  anyCanSee(px, pz) {
    for (const car of this.cars) {
      if (Math.hypot(car.x - px, car.z - pz) < 55) return true;
    }
    for (const off of this.officers) {
      if (off.alive && Math.hypot(off.x - px, off.z - pz) < 30) return true;
    }
    return false;
  }

  // dt step. Returns 'busted' when an officer reaches the player on foot.
  update(dt, player, inCar) {
    if (this.stars === 0) return null;
    this.ensureForce();
    const seen = this.anyCanSee(player.x, player.z);
    if (seen) this.unseenTimer = 0;
    else {
      this.unseenTimer += dt;
      if (this.unseenTimer > WANTED.decayDelay) {
        this.stars -= 1;
        this.unseenTimer = 0;
        if (this.stars === 0) this.clear();
      }
    }
    // Police cars chase and ram the player's position.
    for (const car of this.cars) {
      const dx = player.x - car.x;
      const dz = player.z - car.z;
      const dist = Math.hypot(dx, dz) || 1;
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
      const targetSpeed = Math.min(30, 12 + this.stars * 3);
      car.speed += (targetSpeed - car.speed) * dt * 0.8;
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const fixed = resolveCollisions(this.colliders, nx, nz, 1.6);
      car.x = fixed.x;
      car.z = fixed.z;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    }
    // Foot officers run at the player; touching the player on foot busts them.
    for (const off of this.officers) {
      if (!off.alive) continue;
      const dx = player.x - off.x;
      const dz = player.z - off.z;
      const dist = Math.hypot(dx, dz) || 1;
      off.heading = Math.atan2(dx, dz);
      const step = off.speed * dt;
      const nx = off.x + Math.sin(off.heading) * step;
      const nz = off.z + Math.cos(off.heading) * step;
      const fixed = resolveCollisions(this.colliders, nx, nz, 0.5);
      off.x = fixed.x;
      off.z = fixed.z;
      off.mesh.position.set(off.x, 0, off.z);
      off.mesh.rotation.y = off.heading;
      if (dist < 1.6 && !inCar) {
        this.bustedTimer += dt;
        if (this.bustedTimer > 1.2) return 'busted';
      } else {
        this.bustedTimer = 0;
      }
    }
    return null;
  }
}
