import { describe, expect, it } from "vitest";

import { versCsv } from "./csv";

describe("versCsv", () => {
  it("BOM, virgule, en-tête, guillemets au besoin, vide si inconnu, yes/no", () => {
    expect(versCsv(["a", "b", "c", "d"], [["x,y", null, true, 'il dit "ok"']])).toBe(
      '﻿a,b,c,d\r\n"x,y",,yes,"il dit ""ok"""\r\n',
    );
  });
});
