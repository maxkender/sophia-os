import { describe, expect, it } from "vitest";

import {
  extraireResultatImportCompte,
  messageErreurImportCompte,
  niveauLogImportCompte,
} from "./importCompteStream";

describe("niveauLogImportCompte", () => {
  it("classe un heartbeat en info", () => {
    expect(
      niveauLogImportCompte({
        etape: "heartbeat",
        statut: "en_cours",
        detail: "[+10000ms] toujours en vie · étape=listing",
      }),
    ).toBe("info");
  });

  it("classe un échec Apify en warn", () => {
    expect(
      niveauLogImportCompte({
        etape: "import-compte",
        statut: "en_cours",
        detail: "Apify ÉCHEC après 120001ms: timeout",
      }),
    ).toBe("warn");
  });

  it("classe ready ok en ok", () => {
    expect(
      niveauLogImportCompte({ etape: "ready", statut: "ok", ok: true }),
    ).toBe("ok");
  });

  it("classe ready echec en error", () => {
    expect(
      niveauLogImportCompte({ etape: "ready", statut: "echec", ok: false }),
    ).toBe("error");
  });
});

describe("extraireResultatImportCompte", () => {
  it("extrait le ready final", () => {
    expect(
      extraireResultatImportCompte({
        etape: "ready",
        statut: "ok",
        ok: true,
        handle: "foo",
        total: 12,
        connus: 3,
        source: "mixte",
        batchId: "batch-1",
        enqueued: 9,
        skipped: 0,
        langue: "fr",
      }),
    ).toEqual({
      ok: true,
      handle: "foo",
      total: 12,
      connus: 3,
      source: "mixte",
      batchId: "batch-1",
      enqueued: 9,
      skipped: 0,
      langue: "fr",
      listing: false,
    });
  });

  it("ignore les heartbeats", () => {
    expect(
      extraireResultatImportCompte({
        etape: "heartbeat",
        statut: "en_cours",
        ok: true,
        batchId: "x",
      }),
    ).toBeNull();
  });
});

describe("messageErreurImportCompte", () => {
  it("réécrit le timeout idle 150s", () => {
    const msg = messageErreurImportCompte(
      "Request idle timeout limit (150s) reached",
    );
    expect(msg).toMatch(/Timeout Edge \(150s\)/);
    expect(msg).toMatch(/page TikTok \/ Apify/);
  });

  it("laisse les autres messages intacts", () => {
    expect(messageErreurImportCompte("Compte introuvable")).toBe(
      "Compte introuvable",
    );
  });
});
