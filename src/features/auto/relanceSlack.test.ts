import { describe, expect, it } from "vitest";

import { DELAIS_ACCUEIL_DEFAUT, etatsAccueil, type RecrueAccueil } from "../../../supabase/functions/_shared/etapes";
import { planRelance } from "../../../supabase/functions/_shared/relance_jour";

const base = {
  poster_id: "p1", prenom: "Ana", fuseau: "Europe/Paris", bienvenue_at: "2026-10-26T10:00:00Z", cohorte_lundi: "2026-11-02",
  premiere_connexion_at: null, slack_user_id: null, contrat_id: "C1", compte_id: "c1", handle: "ana.books1", warmup_started_at: null,
  tiktok_existe: false, tiktok_vu_at: null, abonnements: null, videos: null, messages: [], prevues: [], repondu_at: null, kill: null,
  email: "anaa@sophia.com",
} as unknown as RecrueAccueil;
const plan = (x: RecrueAccueil) =>
  planRelance(x, etatsAccueil(x, DELAIS_ACCUEIL_DEFAUT), new Date("2026-10-27T11:00:00Z"), DELAIS_ACCUEIL_DEFAUT, { slack: true }).elements;

describe("6/11 : Slack relié mais vu comme non relié → plus de fausse relance", () => {
  it("pas de « join our Slack » quand Slack est connu sans id sur le profil", () => {
    expect(plan(base)).toEqual(["connexion", "slack"]);
    expect(plan({ ...base, slack_connu: true })).toEqual(["connexion"]);
  });
});
