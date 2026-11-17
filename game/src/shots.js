// SOLMAR BAY — the screenshot scenes behind ?shot=start|play|drive|end.
// Each one stages the real game from a fresh seeded world and a fixed
// camera, so the same seed always gives the same frame. The scenes are what
// a short game really looks like: title over the city, on-foot action by the
// mission marker, a police chase in a car, and the mission-complete screen.
import { PLACES } from './config.js';

export function stageShot(name, game) {
  const g = game;
  if (name === 'start') {
    g.setScreen('title');
    g.orbitCamera(0);
    return;
  }
  if (name === 'play') {
    g.setScreen('play');
    g.startGame(true);
    // On foot on the road by the marina, facing the orange coupe and the
    // mission beacon — city, traffic and pedestrians all in frame.
    g.player.x = -91;
    g.player.z = -108;
    g.player.heading = Math.PI;
    g.player.mesh.position.set(g.player.x, 0, g.player.z);
    g.camYaw = g.player.heading;
    g.camPitch = 0.3;
    g.missions.start();
    return;
  }
  if (name === 'drive') {
    g.setScreen('play');
    g.startGame(true);
    g.missions.start();
    // Behind the wheel of the mission coupe, 3 wanted stars, police in pursuit.
    const coupe = g.traffic.missionCar;
    g.enterCar(coupe, true);
    g.playerCar.x = -40;
    g.playerCar.z = -60;
    g.playerCar.heading = Math.PI / 2;
    g.playerCar.speed = 22;
    g.playerCar.mesh.position.set(g.playerCar.x, 0, g.playerCar.z);
    g.police.addStars(3);
    // Pull two police cars in close behind the player for the chase frame.
    g.police.cars.forEach((car, i) => {
      car.x = g.playerCar.x - 14 - i * 8;
      car.z = g.playerCar.z - 6 + i * 10;
      car.heading = Math.PI / 2;
      car.speed = 24;
    });
    g.camYaw = g.playerCar.heading;
    g.camPitch = 0.28;
    return;
  }
  if (name === 'end') {
    g.setScreen('play');
    g.startGame(true);
    g.missions.start();
    // Finish mission one on screen: cash paid, completion banner up.
    g.player.x = PLACES.garage.x - 4;
    g.player.z = PLACES.garage.z;
    g.player.mesh.position.set(g.player.x, 0, g.player.z);
    g.player.heading = -Math.PI / 2;
    g.camYaw = g.player.heading;
    g.camPitch = 0.3;
    g.cash = 620;
    g.missions.missionIndex = 1;
    g.missions.stepIndex = 0;
    g.missions.placeMarker();
    // Title and text are set BEFORE the screen opens, so the panel reads
    // them; the screen itself is applied after the settle loop (main.js),
    // so the camera and HUD have already framed the garage.
    g.endTitle = 'MISSION COMPLETE';
    g.endText = "FIRST WHEELS complete — $500. Rosa: \"Clean work. The garage is yours now.\"";
    g.pendingScreen = 'complete';
    return;
  }
  // Unknown shot name: fall back to the title screen.
  g.setScreen('title');
}
