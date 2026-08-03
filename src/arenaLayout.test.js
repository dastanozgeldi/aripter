import { describe, expect, it } from "vitest";
import { getArenaLayout } from "./arenaLayout";

function makePlayers(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `Player ${index + 1}`,
  }));
}

function distance(first, second) {
  return Math.hypot(
    first.position.x - second.position.x,
    first.position.z - second.position.z,
  );
}

describe("getArenaLayout", () => {
  it.each([3, 4, 5, 8])(
    "places %i players at equal intervals around a regular polygon",
    (playerCount) => {
      const layout = getArenaLayout(makePlayers(playerCount), "player-1");
      const edgeLengths = layout.map((player, index) =>
        distance(player, layout[(index + 1) % layout.length]),
      );

      for (const edgeLength of edgeLengths) {
        expect(edgeLength).toBeCloseTo(edgeLengths[0], 8);
      }
    },
  );

  it("anchors the viewer at the near vertex regardless of join order", () => {
    const players = makePlayers(4);
    const layout = getArenaLayout(players, "player-3");

    expect(layout[0].id).toBe("player-3");
    expect(layout[0].position.x).toBeCloseTo(0, 8);
    expect(layout[0].position.z).toBeGreaterThan(0);
    expect(layout[0].isViewer).toBe(true);
  });

  it("orders seats clockwise from the viewer's near position", () => {
    const layout = getArenaLayout(makePlayers(4), "player-1");

    expect(layout[0].position.z).toBeGreaterThan(0);
    expect(layout[1].position.x).toBeLessThan(0);
    expect(layout[2].position.z).toBeLessThan(0);
    expect(layout[3].position.x).toBeGreaterThan(0);
  });
});
