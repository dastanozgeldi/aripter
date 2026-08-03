import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { getArenaLayout } from "./arenaLayout";

const PLAYER_COLORS = [
  "#ff755f",
  "#8b78ff",
  "#58d6b4",
  "#ffc44f",
  "#5db7ff",
  "#ff79b7",
];

function getPlayerColor(player, index) {
  if (player.isViewer) return "#dfff57";
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

function roundedRectangle(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.closePath();
}

function makeLabelSprite(
  player,
  color,
  { focused = false, mode = "play", standing = null, winner = false } = {},
) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 192;
  const context = canvas.getContext("2d");
  const status =
    mode === "results" && standing
      ? `${winner ? "WINNER  ·  " : ""}${standing.roundScore} ${
          standing.roundScore === 1 ? "WORD" : "WORDS"
        }  ·  ${standing.points} PT${standing.points === 1 ? "" : "S"}`
      : mode === "reveal"
        ? focused
          ? "VOTING NOW"
          : "WAITING"
        : player.online
          ? player.isViewer
            ? "YOU"
            : "IN ROUND"
          : "OFFLINE";

  context.clearRect(0, 0, canvas.width, canvas.height);
  roundedRectangle(context, 8, 8, 752, 176, 48);
  context.fillStyle = "rgba(14, 16, 21, 0.92)";
  context.fill();
  context.lineWidth = 6;
  context.strokeStyle = color;
  context.stroke();

  context.fillStyle = "#ffffff";
  context.font = "700 58px Manrope, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  const displayName =
    player.name.length > 18 ? `${player.name.slice(0, 17)}…` : player.name;
  context.fillText(displayName, 58, 79);

  context.fillStyle = color;
  context.font = "700 27px DM Mono, monospace";
  context.fillText(
    `${status}${player.isHost ? "  ·  HOST" : ""}  ·  ${player.points} PT${
      player.points === 1 ? "" : "S"
    }`,
    58,
    133,
  );

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.2, 0.8, 1);
  sprite.position.y = winner ? 3.7 : 3.22;
  return sprite;
}

function makeLetterSprite(letter) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");

  context.clearRect(0, 0, 512, 512);
  context.beginPath();
  context.arc(256, 256, 224, 0, Math.PI * 2);
  context.fillStyle = "#dfff57";
  context.fill();
  context.lineWidth = 18;
  context.strokeStyle = "#181b22";
  context.stroke();
  context.fillStyle = "#181b22";
  context.font = "800 300px Manrope, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(letter ?? "?", 256, 267);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  sprite.scale.set(2.15, 2.15, 1);
  sprite.position.y = 2.95;
  return sprite;
}

function addLimb(group, material, start, end, radius = 0.13) {
  const startVector = new THREE.Vector3(...start);
  const endVector = new THREE.Vector3(...end);
  const direction = endVector.clone().sub(startVector);
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius * 1.08,
    direction.length(),
    10,
  );
  const limb = new THREE.Mesh(geometry, material);
  limb.position.copy(startVector.clone().add(endVector).multiplyScalar(0.5));
  limb.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  limb.castShadow = true;
  group.add(limb);
}

function makeCrown() {
  const crown = new THREE.Group();
  const goldMaterial = new THREE.MeshStandardMaterial({
    color: "#ffd44f",
    emissive: "#8b5200",
    emissiveIntensity: 0.28,
    metalness: 0.72,
    roughness: 0.24,
  });
  const jewelMaterial = new THREE.MeshStandardMaterial({
    color: "#ff755f",
    emissive: "#a01818",
    emissiveIntensity: 0.35,
    metalness: 0.25,
    roughness: 0.3,
  });

  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.38, 0.19, 32, 1, false),
    goldMaterial,
  );
  band.position.y = 0.05;
  band.castShadow = true;
  crown.add(band);

  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(
      new THREE.ConeGeometry(0.115, 0.48, 10),
      goldMaterial,
    );
    spike.position.set(
      Math.cos(angle) * 0.27,
      0.34,
      Math.sin(angle) * 0.27,
    );
    spike.castShadow = true;
    crown.add(spike);
  }

  const jewel = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.09, 0),
    jewelMaterial,
  );
  jewel.position.set(0, 0.08, 0.36);
  crown.add(jewel);
  crown.position.y = 2.78;
  crown.rotation.y = Math.PI / 5;
  return crown;
}

function makePlayerModel(
  player,
  index,
  { focused = false, mode = "play", standing = null, winner = false } = {},
) {
  const color = getPlayerColor(player, index);
  const playerGroup = new THREE.Group();
  const model = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.02,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: "#171a20",
    roughness: 0.8,
  });

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.78, 30),
    new THREE.MeshBasicMaterial({
      color: "#090a0d",
      transparent: true,
      opacity: player.online ? 0.3 : 0.12,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.018;
  playerGroup.add(shadow);

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.34, 0.76, 5, 12),
    bodyMaterial,
  );
  torso.position.y = 1.37;
  torso.castShadow = true;
  model.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 20, 16),
    bodyMaterial,
  );
  head.position.y = 2.26;
  head.castShadow = true;
  model.add(head);

  addLimb(model, bodyMaterial, [-0.23, 1.62, 0], [-0.72, 1.03, 0.05], 0.12);
  addLimb(model, bodyMaterial, [0.23, 1.62, 0], [0.72, 1.03, 0.05], 0.12);
  addLimb(model, bodyMaterial, [-0.17, 0.91, 0], [-0.36, 0.12, 0.05], 0.14);
  addLimb(model, bodyMaterial, [0.17, 0.91, 0], [0.36, 0.12, 0.05], 0.14);

  for (const eyeX of [-0.15, 0.15]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 10, 8),
      darkMaterial,
    );
    eye.position.set(eyeX, 2.32, 0.39);
    model.add(eye);
  }

  if (!player.online && mode !== "results") {
    bodyMaterial.transparent = true;
    bodyMaterial.opacity = 0.32;
  }

  if (winner) {
    model.add(makeCrown());
  }

  if (focused) {
    const focusRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1.02, 48),
      new THREE.MeshBasicMaterial({
        color: "#dfff57",
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
      }),
    );
    focusRing.rotation.x = -Math.PI / 2;
    focusRing.position.y = 0.045;
    playerGroup.add(focusRing);
    playerGroup.userData.focusRing = focusRing;
  }

  playerGroup.add(model);
  playerGroup.add(
    makeLabelSprite(player, color, {
      focused,
      mode,
      standing,
      winner,
    }),
  );
  playerGroup.userData.model = model;
  playerGroup.userData.focused = focused;
  playerGroup.userData.phase = index * 0.78;
  playerGroup.userData.baseY = 0;
  return playerGroup;
}

function addArenaFloor(scene, layout) {
  const arenaRadius = layout.length
    ? Math.hypot(layout[0].position.x, layout[0].position.z)
    : 3.6;
  const floorRadius = arenaRadius + 3.4;

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(floorRadius, 96),
    new THREE.MeshStandardMaterial({
      color: "#272b35",
      roughness: 0.92,
      metalness: 0.02,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(floorRadius - 0.16, floorRadius, 96),
    new THREE.MeshBasicMaterial({ color: "#8875ff", side: THREE.DoubleSide }),
  );
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.025;
  scene.add(outerRing);

  if (layout.length > 1) {
    const polygonPoints = layout.map(
      (player) =>
        new THREE.Vector3(player.position.x, 0.035, player.position.z),
    );
    polygonPoints.push(polygonPoints[0]);
    const polygon = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(polygonPoints),
      new THREE.LineBasicMaterial({
        color: "#dfff57",
        transparent: true,
        opacity: 0.48,
      }),
    );
    scene.add(polygon);
  }

  const grid = new THREE.GridHelper(
    floorRadius * 1.64,
    Math.max(12, Math.round(floorRadius * 2)),
    "#4c5262",
    "#353a47",
  );
  grid.position.y = 0.03;
  grid.material.transparent = true;
  grid.material.opacity = 0.42;
  scene.add(grid);

  const centerDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.12, 1.34, 0.32, 48),
    new THREE.MeshStandardMaterial({
      color: "#16191f",
      roughness: 0.55,
      metalness: 0.18,
    }),
  );
  centerDisc.position.y = 0.16;
  centerDisc.castShadow = true;
  centerDisc.receiveShadow = true;
  scene.add(centerDisc);

  const beaconRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.02, 0.07, 12, 64),
    new THREE.MeshBasicMaterial({ color: "#dfff57" }),
  );
  beaconRing.rotation.x = Math.PI / 2;
  beaconRing.position.y = 0.4;
  scene.add(beaconRing);

  return beaconRing;
}

function disposeScene(scene) {
  scene.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
      }
      material.dispose();
    }
  });
}

export function PlayerArena({
  focusedPlayerId = null,
  letter,
  mode = "play",
  players,
  standings = [],
  viewerId,
}) {
  const hostRef = useRef(null);
  const [renderError, setRenderError] = useState(false);
  const playerSignature = players
    .map(
      (player) =>
        `${player.id}:${player.name}:${player.online}:${player.isHost}:${player.points}`,
    )
    .join("|");
  const standingsSignature = standings
    .map(
      (standing) =>
        `${standing.playerId}:${standing.roundScore}:${standing.points}:${standing.isWinner}`,
    )
    .join("|");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const layout = getArenaLayout(players, viewerId);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      setRenderError(true);
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#111319", 0.035);

    const radius = layout.length
      ? Math.hypot(layout[0].position.x, layout[0].position.z)
      : 3.6;
    const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 80);
    camera.position.set(0, Math.max(5.8, radius * 0.82), radius + 7.1);
    const cameraTarget = new THREE.Vector3(0, 1.05, -radius * 0.12);
    camera.lookAt(cameraTarget);

    scene.add(new THREE.HemisphereLight("#cfdbff", "#2d2439", 2.1));
    const keyLight = new THREE.DirectionalLight("#fff4df", 4.2);
    keyLight.position.set(-5, 11, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 12;
    keyLight.shadow.camera.bottom = -12;
    scene.add(keyLight);

    const purpleLight = new THREE.PointLight("#8b78ff", 16, 24, 2);
    purpleLight.position.set(5, 4, -4);
    scene.add(purpleLight);
    const limeLight = new THREE.PointLight("#dfff57", 12, 18, 2);
    limeLight.position.set(-4, 2.5, 3);
    scene.add(limeLight);

    const beaconRing = addArenaFloor(scene, layout);
    const letterSprite = makeLetterSprite(letter);
    scene.add(letterSprite);

    const characterGroups = layout.map((player, index) => {
      const standing = standings.find(
        (candidate) => candidate.playerId === player.id,
      );
      const character = makePlayerModel(player, index, {
        focused: player.id === focusedPlayerId,
        mode,
        standing,
        winner: standing?.isWinner ?? false,
      });
      character.position.set(player.position.x, 0, player.position.z);
      const directionToCenter = new THREE.Vector3(
        -player.position.x,
        0,
        -player.position.z,
      ).normalize();
      character.rotation.y = Math.atan2(directionToCenter.x, directionToCenter.z);
      scene.add(character);
      return character;
    });

    if (focusedPlayerId) {
      const focusedPlayer = layout.find(
        (player) => player.id === focusedPlayerId,
      );
      if (focusedPlayer) {
        const focusLight = new THREE.PointLight("#dfff57", 20, 10, 1.8);
        focusLight.position.set(
          focusedPlayer.position.x,
          4.5,
          focusedPlayer.position.z,
        );
        scene.add(focusLight);
      }
    }

    let pointerX = 0;
    let pointerY = 0;
    const handlePointerMove = (event) => {
      const bounds = host.getBoundingClientRect();
      pointerX = (event.clientX - bounds.left) / bounds.width - 0.5;
      pointerY = (event.clientY - bounds.top) / bounds.height - 0.5;
    };
    host.addEventListener("pointermove", handlePointerMove);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.z = width < 680 ? radius + 11.3 : radius + 7.1;
      camera.fov = width < 680 ? 50 : 39;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const animationStartedAt = window.performance.now();
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frameId;
    const render = (timestamp) => {
      const elapsed = (timestamp - animationStartedAt) / 1000;
      if (!reduceMotion) {
        characterGroups.forEach((character) => {
          const bobAmount = character.userData.focused ? 0.075 : 0.035;
          const bob =
            Math.sin(elapsed * 1.45 + character.userData.phase) * bobAmount;
          character.position.y = character.userData.baseY + bob;
          character.userData.model.rotation.z =
            Math.sin(elapsed * 1.15 + character.userData.phase) * 0.018;
          if (character.userData.focusRing) {
            const pulse = 1 + Math.sin(elapsed * 3) * 0.08;
            character.userData.focusRing.scale.setScalar(pulse);
          }
        });
        letterSprite.position.y = 2.95 + Math.sin(elapsed * 1.8) * 0.1;
        beaconRing.scale.setScalar(1 + Math.sin(elapsed * 2.1) * 0.035);
      }

      camera.position.x += (pointerX * 0.55 - camera.position.x) * 0.025;
      const targetY = Math.max(5.8, radius * 0.82) - pointerY * 0.22;
      camera.position.y += (targetY - camera.position.y) * 0.025;
      camera.lookAt(cameraTarget);
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(render);
    };
    frameId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      host.removeEventListener("pointermove", handlePointerMove);
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [
    focusedPlayerId,
    letter,
    mode,
    playerSignature,
    standingsSignature,
    viewerId,
  ]);

  return (
    <div className="player-arena-canvas" ref={hostRef}>
      {renderError && (
        <p className="arena-render-error">
          The 3D arena could not start on this device. Your answer board still
          works normally.
        </p>
      )}
      <ul className="visually-hidden">
        {getArenaLayout(players, viewerId).map((player) => (
          <li key={player.id}>
            {player.name}
            {player.isViewer ? ", you" : ""}
            {player.isHost ? ", host" : ""}
            {player.online ? ", online" : ", offline"}
          </li>
        ))}
      </ul>
    </div>
  );
}
