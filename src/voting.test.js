import { describe, expect, test } from "vitest";

import { getViewerVoteProgress } from "./voting";

describe("viewer vote progress", () => {
  test("counts only non-empty answers from other players", () => {
    const progress = getViewerVoteProgress(
      [
        { playerId: "viewer", value: "Apple", viewerVote: true },
        { playerId: "masha", value: "Apricot", viewerVote: true },
        { playerId: "sasha", value: "  ", viewerVote: null },
        { playerId: "dima", value: "Avocado", viewerVote: null },
      ],
      "viewer",
    );

    expect(progress).toEqual({
      completed: 1,
      total: 2,
      remaining: 1,
      isComplete: false,
    });
  });

  test("treats a rejection as a completed vote", () => {
    const progress = getViewerVoteProgress(
      [{ playerId: "masha", value: "Apricot", viewerVote: false }],
      "viewer",
    );

    expect(progress).toEqual({
      completed: 1,
      total: 1,
      remaining: 0,
      isComplete: true,
    });
  });
});
