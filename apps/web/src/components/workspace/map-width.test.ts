import { describe, expect, it } from "vitest";
import {
  clampMapWidth,
  MAP_WIDTH_DEFAULT,
  MAP_WIDTH_MAX,
  MAP_WIDTH_MIN,
  MAP_WIDTH_STORAGE_KEY,
  nextWidthFromDrag,
  readStoredMapWidth,
  writeStoredMapWidth,
} from "./map-width";

describe("clampMapWidth", () => {
  it("passes through in-band values, rounded to whole pixels", () => {
    expect(clampMapWidth(460)).toBe(460);
    expect(clampMapWidth(460.4)).toBe(460);
    expect(clampMapWidth(460.6)).toBe(461);
  });

  it("clamps below the minimum and above the maximum", () => {
    expect(clampMapWidth(0)).toBe(MAP_WIDTH_MIN);
    expect(clampMapWidth(MAP_WIDTH_MIN - 1)).toBe(MAP_WIDTH_MIN);
    expect(clampMapWidth(MAP_WIDTH_MAX + 1)).toBe(MAP_WIDTH_MAX);
    expect(clampMapWidth(10_000)).toBe(MAP_WIDTH_MAX);
    expect(clampMapWidth(-500)).toBe(MAP_WIDTH_MIN);
  });

  it("falls back to the default for non-finite input", () => {
    expect(clampMapWidth(Number.NaN)).toBe(MAP_WIDTH_DEFAULT);
    expect(clampMapWidth(Number.POSITIVE_INFINITY)).toBe(MAP_WIDTH_DEFAULT);
    expect(clampMapWidth(Number.NEGATIVE_INFINITY)).toBe(MAP_WIDTH_DEFAULT);
  });
});

describe("nextWidthFromDrag", () => {
  it("widens the map when the pointer moves left (handle sits left of the map)", () => {
    expect(nextWidthFromDrag(460, 1000, 900)).toBe(560);
  });

  it("narrows the map when the pointer moves right", () => {
    expect(nextWidthFromDrag(460, 1000, 1100)).toBe(360);
  });

  it("returns the start width when the pointer has not moved", () => {
    expect(nextWidthFromDrag(460, 1000, 1000)).toBe(460);
  });

  it("clamps the dragged result to the band", () => {
    expect(nextWidthFromDrag(460, 1000, 200)).toBe(MAP_WIDTH_MAX);
    expect(nextWidthFromDrag(460, 1000, 1900)).toBe(MAP_WIDTH_MIN);
  });
});

describe("readStoredMapWidth", () => {
  const storageWith = (value: string | null): Pick<Storage, "getItem"> => ({
    getItem: (key: string) => (key === MAP_WIDTH_STORAGE_KEY ? value : null),
  });

  it("returns the default when no storage is available", () => {
    expect(readStoredMapWidth(undefined)).toBe(MAP_WIDTH_DEFAULT);
  });

  it("returns the default when the key is missing", () => {
    expect(readStoredMapWidth(storageWith(null))).toBe(MAP_WIDTH_DEFAULT);
  });

  it("reads a stored width back, clamped to the band", () => {
    expect(readStoredMapWidth(storageWith("560"))).toBe(560);
    expect(readStoredMapWidth(storageWith("99999"))).toBe(MAP_WIDTH_MAX);
    expect(readStoredMapWidth(storageWith("1"))).toBe(MAP_WIDTH_MIN);
  });

  it("returns the default for garbage values", () => {
    expect(readStoredMapWidth(storageWith("not-a-number"))).toBe(MAP_WIDTH_DEFAULT);
    expect(readStoredMapWidth(storageWith(""))).toBe(MAP_WIDTH_DEFAULT);
  });

  it("returns the default when storage access throws (private mode)", () => {
    const throwing: Pick<Storage, "getItem"> = {
      getItem: () => {
        throw new Error("denied");
      },
    };
    expect(readStoredMapWidth(throwing)).toBe(MAP_WIDTH_DEFAULT);
  });
});

describe("writeStoredMapWidth", () => {
  it("writes the clamped width under the storage key", () => {
    const writes: Array<[string, string]> = [];
    writeStoredMapWidth({ setItem: (k, v) => writes.push([k, v]) }, 560);
    expect(writes).toEqual([[MAP_WIDTH_STORAGE_KEY, "560"]]);
  });

  it("clamps out-of-band values before writing", () => {
    const writes: Array<[string, string]> = [];
    writeStoredMapWidth({ setItem: (k, v) => writes.push([k, v]) }, 10_000);
    expect(writes).toEqual([[MAP_WIDTH_STORAGE_KEY, String(MAP_WIDTH_MAX)]]);
  });

  it("is a no-op without storage and swallows setItem throws (quota)", () => {
    expect(() => writeStoredMapWidth(undefined, 500)).not.toThrow();
    const throwing: Pick<Storage, "setItem"> = {
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => writeStoredMapWidth(throwing, 500)).not.toThrow();
  });
});
