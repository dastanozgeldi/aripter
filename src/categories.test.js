import { describe, expect, test } from "vitest";

import {
  CATEGORY_POOL,
  getRandomCategoryCount,
  pickRandomCategories,
} from "./categories";

describe("category randomization", () => {
  test("starts with twenty translated sample categories", () => {
    expect(CATEGORY_POOL).toHaveLength(20);
    expect(CATEGORY_POOL[0]).toEqual({
      Animal: {
        Russian: "Животное",
        Kazakh: "Жануар",
        Japanese: "動物",
      },
    });
  });

  test.each([
    [5, 6],
    [60, 6],
    [65, 8],
    [85, 8],
    [90, 10],
    [95, 10],
    [120, 10],
  ])("picks %i-second rounds at the right size", (seconds, expected) => {
    expect(getRandomCategoryCount(seconds)).toBe(expected);
  });

  test("returns unique categories in the selected language", () => {
    const categories = pickRandomCategories("Kazakh", 120, () => 0.5);

    expect(categories).toHaveLength(10);
    expect(new Set(categories)).toHaveLength(10);
    expect(categories.every((category) => typeof category === "string")).toBe(true);
  });
});
