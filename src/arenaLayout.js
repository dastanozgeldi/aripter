const VIEWER_ANGLE = Math.PI / 2;

export function getArenaRadius(playerCount) {
  if (playerCount <= 2) return 3.6;
  return Math.max(3.8, Math.min(7.2, playerCount * 0.72));
}

export function getArenaLayout(players, viewerId) {
  if (!players.length) return [];

  const viewer = players.find((player) => player.id === viewerId);
  const orderedPlayers = viewer
    ? [viewer, ...players.filter((player) => player.id !== viewerId)]
    : [...players];
  const radius = getArenaRadius(orderedPlayers.length);

  return orderedPlayers.map((player, index) => {
    const angle =
      VIEWER_ANGLE + (index * Math.PI * 2) / orderedPlayers.length;

    return {
      ...player,
      angle,
      isViewer: player.id === viewerId,
      position: {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
      },
    };
  });
}
