import { describe, expect, it } from "vitest";

import {
  estErreurHandleUnique,
  normaliserHandleTiktok,
} from "./sourceHandle";

describe("normaliserHandleTiktok", () => {
  it("retire @ et espaces", () => {
    expect(normaliserHandleTiktok("  @FooBar  ")).toBe("FooBar");
  });

  it("extrait le handle d'une URL profil", () => {
    expect(normaliserHandleTiktok("https://www.tiktok.com/@foo.bar/")).toBe(
      "foo.bar",
    );
  });

  it("laisse un handle nu", () => {
    expect(normaliserHandleTiktok("foo.bar")).toBe("foo.bar");
  });
});

describe("estErreurHandleUnique", () => {
  it("reconnaît le code Postgres 23505", () => {
    expect(estErreurHandleUnique({ code: "23505", message: "x" })).toBe(true);
  });

  it("reconnaît le nom de contrainte", () => {
    expect(
      estErreurHandleUnique({
        message:
          'duplicate key value violates unique constraint "comptes_reference_handle_tiktok_key"',
      }),
    ).toBe(true);
  });

  it("ignore les autres erreurs", () => {
    expect(estErreurHandleUnique({ message: "Compte introuvable" })).toBe(
      false,
    );
  });
});
