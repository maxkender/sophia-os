import { describe, expect, it } from "vitest";

import type { DemandeCm } from "./api";
import { csvDemandes, delaiLisible, parCommentMaster, totaux } from "./logique";
import { lundiBonus, periodeDe, periodesChoix } from "./periodes";

function demande(o: Partial<DemandeCm>): DemandeCm {
  return {
    id: "d",
    langue: "pt-BR",
    region: "Brésil",
    canal: "#cm-br",
    slack_channel_id: "C1",
    slack_ts: "1761300000.000100",
    publie_url: "https://tiktok.com/x",
    envoye_at: "2026-10-26T10:00:00Z",
    fait_at: null,
    fait_par: null,
    fait_source: null,
    fait_mode: null,
    verifie: false,
    cm_profile_id: "day",
    cm_nom: "Daywson Freires",
    cm_slack_connu: true,
    autre_personne: false,
    autre_valide_at: null,
    compte: false,
    ...o,
  };
}

const fait = (o: Partial<DemandeCm>) =>
  demande({ fait_at: "2026-10-26T11:30:00Z", fait_par: "daywson", compte: true, ...o });

describe("le compteur par Comment Master", () => {
  it("un Done par bouton, par réponse dans le fil, par réaction : chacun compte une fois", () => {
    const [l] = parCommentMaster([
      fait({ id: "1", fait_source: "bouton", fait_mode: "bouton" }),
      fait({ id: "2", fait_source: "slack_sync", fait_mode: "fil" }),
      fait({ id: "3", fait_source: "slack_sync", fait_mode: "reaction", verifie: true }),
      demande({ id: "4" }),
    ]);
    expect(l).toMatchObject({ recues: 4, done: 3, pctDone: 75, verifies: 1, delaiMinutes: 90 });
  });

  it("un Done fait par quelqu'un d'autre est signalé et ne compte pas tant qu'il n'est pas validé", () => {
    const [l] = parCommentMaster([
      fait({ id: "1" }),
      fait({ id: "2", fait_par: "autre", autre_personne: true, compte: false }),
    ]);
    expect(l).toMatchObject({ done: 1, aValider: 1 });
    const [v] = parCommentMaster([
      fait({ id: "2", fait_par: "autre", autre_personne: true, autre_valide_at: "2026-10-27T08:00:00Z", compte: true }),
    ]);
    expect(v).toMatchObject({ done: 1, aValider: 0 });
  });

  it("changement de Comment Master en cours de période : chaque demande va à son mandat (pt-BR, Larissa puis Daywson le 25/10)", () => {
    const lignes = parCommentMaster([
      fait({ id: "1", envoye_at: "2026-10-24T10:00:00Z", cm_profile_id: "lar", cm_nom: "Larissa Taques" }),
      fait({ id: "2", envoye_at: "2026-10-26T10:00:00Z" }),
      fait({ id: "3", envoye_at: "2026-10-27T10:00:00Z" }),
    ]);
    expect(lignes.map((l) => [l.nom, l.done])).toEqual([
      ["Daywson Freires", 2],
      ["Larissa Taques", 1],
    ]);
  });

  it("le total et le bonus prévu : Done × montant par commentaire", () => {
    const lignes = parCommentMaster([fait({ id: "1", verifie: true }), fait({ id: "2" }), demande({ id: "3" })]);
    expect(totaux(lignes, 0.5)).toEqual({ recues: 3, done: 2, verifies: 1, aValider: 0, bonus: 1 });
  });
});

describe("les périodes de 4 semaines (alignées sur le premier lundi bonus)", () => {
  it("la période en cours et le lundi qui la paie", () => {
    expect(periodeDe("2026-10-27", "2026-11-30")).toEqual({ debut: "2026-10-05", fin: "2026-11-01" });
    expect(periodeDe("2026-11-29", "2026-11-30")).toEqual({ debut: "2026-11-02", fin: "2026-11-29" });
    expect(lundiBonus({ fin: "2026-11-29" })).toBe("2026-11-30");
    expect(periodeDe("2026-12-05", "2026-11-30")).toEqual({ debut: "2026-11-30", fin: "2026-12-27" });
  });

  it("le sélecteur : aujourd'hui, 7 jours, la période en cours, les précédentes", () => {
    const p = periodesChoix("2026-11-10", "2026-11-30", 2);
    expect(p.map((x) => [x.type, x.debut, x.fin])).toEqual([
      ["aujourdhui", "2026-11-10", "2026-11-10"],
      ["sept_jours", "2026-11-04", "2026-11-10"],
      ["en_cours", "2026-11-02", "2026-11-29"],
      ["precedente", "2026-10-05", "2026-11-01"],
      ["precedente", "2026-09-07", "2026-10-04"],
    ]);
  });
});

it("délai lisible et CSV de la période", () => {
  expect([delaiLisible(35), delaiLisible(85), delaiLisible(3000), delaiLisible(null)]).toEqual(["35 min", "1 h 25", "2 j 2 h", "—"]);
  const csv = csvDemandes([fait({ id: "1" })]);
  expect(csv.split("\r\n")[0]).toBe(
    "﻿comment_master,language,region,sent_at,tiktok_url,slack_url,done,done_at,done_by,done_source,done_by_someone_else,validated,counted,verified_on_tiktok",
  );
  expect(csv).toContain("https://slack.com/archives/C1/p1761300000000100,yes");
});
