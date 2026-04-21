import { describe, expect, it } from "vitest";
import { sumInserted, thb } from "@/lib/format";

describe("format", () => {
  it("thb formats integer amounts", () => {
    expect(thb(1000)).toBe("1,000 THB");
    expect(thb(0)).toBe("0 THB");
  });

  it("sumInserted sums denomination * count", () => {
    expect(
      sumInserted([
        { denomination: 100, count: 1 },
        { denomination: 20, count: 3 },
        { denomination: 1, count: 5 },
      ]),
    ).toBe(165);
  });

  it("sumInserted returns 0 for empty", () => {
    expect(sumInserted([])).toBe(0);
  });
});
