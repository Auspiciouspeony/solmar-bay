// SOLMAR BAY — cars. A car is a group of boxes (body, cabin, wheels, lights)
// in one of the city's paint colours, with simple arcade driving: throttle,
// brake, steering that scales down at speed, and damage that smokes when the
// car is hurt. Traffic cars cruise the road grid on their own lanes and turn
// at intersections; the player's car is driven, stolen, and entered/exited.
import * as THREE from 'three';
import { CAR, CITY } from './config.js';
import { makeRng } from './rng.js';
import { nearestRoadCoord, resolveCollisions } from './world.js';

export const CAR_COLORS = [0xe84a2a, 0x2a6ae8, 0xf2c94c, 0x2ad8a0, 0xe8e8e8, 0x1a1a22, 0x8a4ad8, 0xff8c2a, 0x4ad8e8];
export const CAR_NAMES = ['Coupe', 'Sedan', 'Hatch', 'Pickup', 'Van', 'Sport'];

export function buildCarMesh(color, kind) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const long = kind === 'Van' || kind === 'Pickup';
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, long ? 5.2 : 4.4), bodyMat);
  body.position.y = 0.65;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, long ? 2.2 : 2.0), glassMat);
  cabin.position.set(0, 1.25, long ? -0.4 : -0.2);
  group.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  for (const [wx, wz] of [[-1.0, 1.5], [1.0, 1.5], [-1.0, -1.5], [1.0, -1.5]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx of [-0.6, 0.6]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), lightMat);
    light.position.set(sx, 0.7, 2.25);
    group.add(light);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xe82a2a });
  for (const sx of [-0.6, 0.6]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), tailMat);
    tail.position.set(sx, 0.7, -2.25);
    group.add(tail);
  }
  // Smoke puff shown when the car is badly damaged.
  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.55 }),
  );
  smoke.position.set(0, 1.6, 1.6);
  smoke.visible = false;
  group.add(smoke);
  group.userData.smoke = smoke;
  return group;
}

export function makeCar(x, z, heading, color, kind, isPolice) {
  const mesh = buildCarMesh(color, kind);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  return {
    mesh,
    x,
    z,
    heading,
    speed: 0,
    hp: CAR.maxHp,
    kind,
    isPolice: !!isPolice,
    driver: null, // 'player' | 'traffic' | 'police' | null (parked)
    targetSpeed: 0,
    smokeOn: false,
  };
}

// Arcade driving for the player's car: W/S throttle and brake/reverse,
// A/D steering, speed clamped, buildings block the car.
export function driveCar(car, input, dt, colliders, onCrash) {
  const steer = input.s;
  const throttle = input.f;
  if (throttle > 0) car.speed += CAR.accel * dt;
  else if (throttle < 0) {
    car.speed -= car.speed > 0.5 ? CAR.brake * dt : CAR.accel * 0.6 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  car.speed = Math.max(-CAR.reverseSpeed, Math.min(CAR.maxSpeed, car.speed));
  const speedFactor = Math.min(1, Math.abs(car.speed) / 10 + 0.25);
  car.heading += steer * CAR.turnRate * speedFactor * dt * (car.speed < 0 ? -1 : 1);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const fixed = resolveCollisions(colliders, nx, nz, 1.6);
  if ((fixed.x !== nx || fixed.z !== nz) && Math.abs(car.speed) > 6) {
    car.hp -= 6;
    car.speed *= 0.4;
    if (onCrash) onCrash();
  }
  car.x = fixed.x;
  car.z = fixed.z;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  car.mesh.userData.smoke.visible = car.hp < 45;
}

// Traffic: cars that follow the road grid, turning at intersections, and
// slow down when another car is right ahead of them.
export class Traffic {
  constructor(scene, seed, lines, colliders) {
    this.scene = scene;
    this.rng = makeRng(seed + 101);
    this.lines = lines;
    this.colliders = colliders;
    this.cars = [];
    for (let i = 0; i < 10; i += 1) this.spawnCar(true);
    // Parked cars the player can steal, placed on road shoulders.
    this.parked = [];
    for (let i = 0; i < 8; i += 1) {
      const line = this.rng.pick(lines);
      const along = this.rng.range(-CITY.half + 20, CITY.half - 20);
      const horizontal = this.rng.chance(0.5);
      const x = horizontal ? along : line + 4.5;
      const z = horizontal ? line + 4.5 : along;
      const car = makeCar(x, z, horizontal ? Math.PI / 2 : 0, this.rng.pick(CAR_COLORS), this.rng.pick(CAR_NAMES), false);
      car.driver = null;
      this.scene.add(car.mesh);
      this.parked.push(car);
    }
    // The mission coupe: sunset-orange, parked at the marina.
    const coupe = makeCar(-112, -118, Math.PI / 2, 0xff8c2a, 'Coupe', false);
    coupe.driver = null;
    coupe.isMissionCar = true;
    this.scene.add(coupe.mesh);
    this.parked.push(coupe);
    this.missionCar = coupe;
  }

  spawnCar(anywhere) {
    const line = this.rng.pick(this.lines);
    const along = anywhere ? this.rng.range(-CITY.half + 10, CITY.half - 10) : -CITY.half + 10;
    const horizontal = this.rng.chance(0.5);
    const car = makeCar(
      horizontal ? along : line + 2.2,
      horizontal ? line + 2.2 : along,
      horizontal ? Math.PI / 2 : 0,
      this.rng.pick(CAR_COLORS),
      this.rng.pick(CAR_NAMES),
      false,
    );
    car.driver = 'traffic';
    car.speed = this.rng.range(7, 12);
    car.horizontal = horizontal;
    car.lane = line;
    this.scene.add(car.mesh);
    this.cars.push(car);
    return car;
  }

  // Nearest parked (or traffic, if slow) car within reach of a point.
  nearestStealable(x, z, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const car of [...this.parked, ...this.cars]) {
      if (car.driver === 'player') continue;
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }

  update(dt, playerCar) {
    for (const car of this.cars) {
      if (car.driver === 'player') continue;
      // Turn at intersections: when close to a cross road, sometimes turn.
      const along = car.horizontal ? car.x : car.z;
      const cross = nearestRoadCoord(along, this.lines);
      if (Math.abs(along - cross) < 1.2 && this.rng.chance(dt * 0.25)) {
        car.horizontal = !car.horizontal;
        car.lane = cross;
        car.heading = car.horizontal ? (this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : this.rng.chance(0.5) ? 0 : Math.PI;
      }
      // Keep to the lane and cruise.
      const targetSpeed = 9;
      car.speed += (targetSpeed - car.speed) * dt;
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const fixed = resolveCollisions(this.colliders, nx, nz, 1.6);
      car.x = fixed.x;
      car.z = fixed.z;
      if (fixed.x !== nx || fixed.z !== nz) {
        car.heading += Math.PI / 2;
      }
      if (Math.abs(car.x) > CITY.half + 5 || Math.abs(car.z) > CITY.half + 5) {
        // Recycle a car that drove out of town.
        this.scene.remove(car.mesh);
        const index = this.cars.indexOf(car);
        if (index >= 0) this.cars.splice(index, 1);
        this.spawnCar(true);
        continue;
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    }
    // Parked cars never move; the mission coupe waits at the marina.
    void playerCar;
  }
}
