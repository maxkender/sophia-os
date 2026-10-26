import { afterEach, describe, expect, it } from "vitest";

import { CLE_SESSION_VUE, entrerVueHm, lireVueHm, resteVueHm, sortirVueHm } from "./session";

describe("vue HM : état de l'onglet", () => {
  afterEach(() => sessionStorage.clear());

  it("hors vue : rien", () => {
    expect(lireVueHm()).toBeNull();
  });

  it("entrer puis sortir : session et infos posées puis effacées, localStorage intact", () => {
    localStorage.setItem("sb-admin", "jeton-admin");
    entrerVueHm({ prenom: "Sara", expireAt: "2026-10-26T12:00:00Z" }, { access_token: "a" });
    expect(lireVueHm()).toEqual({ prenom: "Sara", expireAt: "2026-10-26T12:00:00Z" });
    expect(JSON.parse(sessionStorage.getItem(CLE_SESSION_VUE) ?? "{}")).toEqual({ access_token: "a" });

    sortirVueHm();
    expect(lireVueHm()).toBeNull();
    expect(sessionStorage.getItem(CLE_SESSION_VUE)).toBeNull();
    expect(localStorage.getItem("sb-admin")).toBe("jeton-admin");
    localStorage.clear();
  });

  it("infos illisibles : pas de vue", () => {
    sessionStorage.setItem("vue-hm", "{pas du json");
    expect(lireVueHm()).toBeNull();
    sessionStorage.setItem("vue-hm", JSON.stringify({ prenom: "Sara" }));
    expect(lireVueHm()).toBeNull();
  });

  it("temps restant avant l'échéance d'1 h", () => {
    const vue = { prenom: "Sara", expireAt: "2026-10-26T12:00:00Z" };
    expect(resteVueHm(vue, Date.parse("2026-10-26T11:30:00Z"))).toBe(30 * 60_000);
    expect(resteVueHm(vue, Date.parse("2026-10-26T12:01:00Z"))).toBeLessThan(0);
  });
});
