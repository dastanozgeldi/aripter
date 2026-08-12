import { describe, expect, it } from "vitest";

import {
  formatRoomCodeInput,
  isCompleteRoomCode,
  ROOM_CODE_LENGTH,
} from "./roomCode";

describe("room code entry", () => {
  it("normalizes pasted and typed codes", () => {
    expect(formatRoomCodeInput(" pg-fskk ")).toBe("PGFSKK");
  });

  it("limits codes to the room code length", () => {
    expect(formatRoomCodeInput("ABCDEFGH")).toBe("ABCDEF");
    expect(ROOM_CODE_LENGTH).toBe(6);
  });

  it("only considers six-letter codes complete", () => {
    expect(isCompleteRoomCode("PGFSKK")).toBe(true);
    expect(isCompleteRoomCode("PGFSK")).toBe(false);
  });
});
