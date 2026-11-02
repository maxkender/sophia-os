/** Système du 2 nov., partie D : le lundi et le jeudi, sans réseau. */
import { assertEquals } from "jsr:@std/assert@1";

import { DELAIS_ACCUEIL_DEFAUT as D, etatsAccueil, type RecrueAccueil } from "./etapes.ts";
import {
  ceQuiManqueRecrue,
  jeudiDu,
  jeudiRecrueDu,
  lundiDu,
  type PosteurSemaine,
  texteJeudi,
  texteJeudiRecrue,
  texteLundi,
} from "./semaine.ts";

const LUNDI = "2026-11-02";
const p = (o: Partial<PosteurSemaine> = {}): PosteurSemaine => ({
  poster_id: "p1", prenom: "Ana", fuseau: "America/Sao_Paulo", slack_user_id: "U1", contrat_id: "c1", cohorte_lundi: "2026-10-26",
  attendus_lun_mer: 6, faits_lun_mer: 6, prevus_semaine: 14, envoyes: [], prevus_test: [], ...o,
});
const t = (iso: string) => new Date(iso);
const F = { debut: 10, fin: 20 };

Deno.test("lundi : 10 h-20 h heure du pays, le lundi seulement, une fois", () => {
  // São Paulo = UTC-3 : 12:00Z = 9 h → trop tôt ; 14:00Z = 11 h → dû.
  assertEquals(lundiDu(p(), LUNDI, t("2026-11-02T12:00:00Z"), F), false);
  assertEquals(lundiDu(p(), LUNDI, t("2026-11-02T14:00:00Z"), F), true);
  assertEquals(lundiDu(p({ envoyes: ["lundi"] }), LUNDI, t("2026-11-02T14:00:00Z"), F), false);
  // Mardi : trop tard, jamais rattrapé.
  assertEquals(lundiDu(p(), LUNDI, t("2026-11-03T14:00:00Z"), F), false);
  // Rien à poster cette semaine et pas de la nouvelle cohorte : pas de message.
  assertEquals(lundiDu(p({ prevus_semaine: 0 }), LUNDI, t("2026-11-02T14:00:00Z"), F), false);
  assertEquals(lundiDu(p({ prevus_semaine: 0, cohorte_lundi: LUNDI }), LUNDI, t("2026-11-02T14:00:00Z"), F), true);
});

Deno.test("lundi : la règle à tous ; nouvelle cohorte prête ou pas, jamais les deux", () => {
  const T = { tous: "Reminder {prenom}.", cohorte: "You start posting today.", warmup: "Not yet: {ce_qui_manque}." };
  assertEquals(texteLundi(T, { prenom: "Ana", nouvelleCohorte: false, ceQuiManque: null }), "Reminder Ana.");
  assertEquals(texteLundi(T, { prenom: "Ana", nouvelleCohorte: true, ceQuiManque: null }), "Reminder Ana.\n\nYou start posting today.");
  assertEquals(texteLundi(T, { prenom: "Ana", nouvelleCohorte: true, ceQuiManque: "follow 2 more accounts" }), "Reminder Ana.\n\nNot yet: follow 2 more accounts.");
});

Deno.test("ce qui manque : la 1re étape pas faite", () => {
  const r = (o: Partial<RecrueAccueil>): RecrueAccueil => ({
    poster_id: "p1", prenom: "Ana", fuseau: "Europe/Lisbon", bienvenue_at: "2026-10-26T10:00:00Z", cohorte_lundi: LUNDI,
    premiere_connexion_at: "2026-10-26T12:00:00Z", slack_user_id: null, contrat_id: "c1", compte_id: "k1", handle: "ana.pt",
    warmup_started_at: "2026-10-27T09:00:00Z", tiktok_existe: true, tiktok_vu_at: "2026-10-27T08:00:00Z", abonnements: 5, videos: 0,
    messages: [], prevues: [], repondu_at: null, kill: null, ...o,
  });
  const o = { url: "https://os", handle: "ana.pt" };
  assertEquals(ceQuiManqueRecrue(etatsAccueil(r({}), D), o), null);
  assertEquals(ceQuiManqueRecrue(etatsAccueil(r({ premiere_connexion_at: null }), D), o), "log in to your dashboard (https://os)");
  assertEquals(ceQuiManqueRecrue(etatsAccueil(r({ tiktok_existe: false, warmup_started_at: null }), D), o), "create your TikTok account @ana.pt");
  // Start warmup cliqué, @ introuvable : jamais « create your account ».
  assertEquals(
    ceQuiManqueRecrue(etatsAccueil(r({ tiktok_existe: false }), D), { ...o, warmupClique: true }),
    "check that your TikTok account is exactly @ana.pt (we can't find it); if not, reply with your exact @",
  );
  assertEquals(ceQuiManqueRecrue(etatsAccueil(r({ abonnements: 3 }), D), o), "follow 2 more accounts");
});

Deno.test("jeudi : sous 6 posts avec lien (compte par compte, aujourd'hui inclus), le jeudi, une fois", () => {
  const J = { heure: 12, fin: 20 };
  const x = p();
  // Jeudi 5 nov., São Paulo : 16:00Z = 13 h → dû ; 14:00Z = 11 h → trop tôt.
  assertEquals(jeudiDu(x, LUNDI, t("2026-11-05T16:00:00Z"), J, 4), true);
  assertEquals(jeudiDu(x, LUNDI, t("2026-11-05T14:00:00Z"), J, 4), false);
  // 6 ou plus : jamais le texte « below 6 » (même 23 posts).
  assertEquals(jeudiDu(x, LUNDI, t("2026-11-05T16:00:00Z"), J, 6), false);
  assertEquals(jeudiDu(x, LUNDI, t("2026-11-05T16:00:00Z"), J, 23), false);
  // Aucun compte cette semaine : rien.
  assertEquals(jeudiDu(x, LUNDI, t("2026-11-05T16:00:00Z"), J, null), false);
  assertEquals(jeudiDu({ ...x, envoyes: ["jeudi"] }, LUNDI, t("2026-11-05T16:00:00Z"), J, 4), false);
  assertEquals(
    texteJeudi("Hi {prenom}, ({faits} of {attendus}).", { prenom: "Ana", faits: 4, attendus: 6 }),
    "Hi Ana, (4 of 6).",
  );
});

Deno.test("lundi soir : à minuit heure de Paris, aucun post → 1 message ; un post → rien ; jamais deux", async () => {
  const { lundiSoirDu, killLundiSoir, reactionLundiSoir, texteLundiSoir } = await import("./semaine.ts");
  const p = {
    poster_id: "p1", compte_id: "k1", deuxieme: false, prenom: "Ana", fuseau: "America/New_York", contrat_id: "c1",
    publies_lundi: 0, dernier_post_at: null, message_at: null, message_id: null, message_erreur: null, prevu_at: null,
    repondu_at: null, kill_id: null, kill_statut: null,
  };
  // Paris = UTC+1 en novembre : lundi 22:59Z (23:59 Paris) trop tôt ; mardi 23:00Z (minuit Paris) dû, quel que soit le pays ;
  // mardi 05:00Z (6 h Paris) : plus jamais.
  assertEquals(lundiSoirDu(p, LUNDI, t("2026-11-02T19:30:00Z"), false), false);
  assertEquals(lundiSoirDu(p, LUNDI, t("2026-11-02T22:59:00Z"), false), false);
  assertEquals(lundiSoirDu(p, LUNDI, t("2026-11-02T23:00:00Z"), false), true);
  assertEquals(lundiSoirDu(p, LUNDI, t("2026-11-03T04:45:00Z"), false), true);
  assertEquals(lundiSoirDu(p, LUNDI, t("2026-11-03T05:00:00Z"), false), false);
  assertEquals(lundiSoirDu({ ...p, publies_lundi: 1 }, LUNDI, t("2026-11-02T23:10:00Z"), false), false);
  assertEquals(lundiSoirDu({ ...p, message_at: "2026-11-02T23:05:00Z" }, LUNDI, t("2026-11-02T23:30:00Z"), false), false);
  assertEquals(lundiSoirDu({ ...p, prevu_at: "2026-11-02T23:05:00Z" }, LUNDI, t("2026-11-02T23:30:00Z"), true), false);
  // Kill 48 h après, sauf un post ou une réponse depuis le message.
  const env = t("2026-11-02T20:10:00Z");
  assertEquals(killLundiSoir(p, env, t("2026-11-04T20:00:00Z"), 48), false);
  assertEquals(killLundiSoir(p, env, t("2026-11-04T20:11:00Z"), 48), true);
  assertEquals(killLundiSoir({ ...p, dernier_post_at: "2026-11-02T22:00:00Z" }, env, t("2026-11-05T00:00:00Z"), 48), false);
  assertEquals(reactionLundiSoir({ ...p, repondu_at: "2026-11-03T08:00:00Z" }, env), true);
  assertEquals(texteLundiSoir("Hi {prenom}, today is your first posting day.", "Ana"), "Hi Ana, today is your first posting day.");
});

Deno.test("prompt 21, C7 : le jeudi des recrues du lundi suivant pas encore prêtes", () => {
  const x = { cohorte_lundi: "2026-11-09", fuseau: "America/Sao_Paulo" };
  // Jeudi 5 nov., São Paulo 13 h (16:00Z) : dû ; 10 h (13:00Z) : trop tôt (12 h) ; mercredi : non.
  assertEquals(jeudiRecrueDu(x, LUNDI, t("2026-11-05T16:00:00Z"), { heure: 12, fin: 20 }), true);
  assertEquals(jeudiRecrueDu(x, LUNDI, t("2026-11-05T13:00:00Z"), { heure: 12, fin: 20 }), false);
  assertEquals(jeudiRecrueDu(x, LUNDI, t("2026-11-04T16:00:00Z"), { heure: 12, fin: 20 }), false);
  // Pas la cohorte du lundi suivant, ou un 2e compte : jamais.
  assertEquals(jeudiRecrueDu({ ...x, cohorte_lundi: LUNDI }, LUNDI, t("2026-11-05T16:00:00Z"), { heure: 12, fin: 20 }), false);
  assertEquals(jeudiRecrueDu({ ...x, deuxieme: true }, LUNDI, t("2026-11-05T16:00:00Z"), { heure: 12, fin: 20 }), false);
  assertEquals(
    texteJeudiRecrue(
      "Hi {prenom}, you start on Monday {date} only if your warm-up is done by Sunday midnight. Still missing: {ce_qui_manque}.",
      { prenom: "Ana", cohorte_lundi: "2026-11-09", ceQuiManque: "follow 2 more accounts" },
    ),
    "Hi Ana, you start on Monday 9 November only if your warm-up is done by Sunday midnight. Still missing: follow 2 more accounts.",
  );
});

Deno.test("prompt 21, C7 : jeudi_texte, le nombre de posts avec lien", () => {
  assertEquals(
    texteJeudi("Hi {prenom}, you have {faits} posts with link this week. Below 6 by Sunday midnight, we'll have to stop our collaboration.", { prenom: "Ana", faits: 3, attendus: 6 }),
    "Hi Ana, you have 3 posts with link this week. Below 6 by Sunday midnight, we'll have to stop our collaboration.",
  );
});
