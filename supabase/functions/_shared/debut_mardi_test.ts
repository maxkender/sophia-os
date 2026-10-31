import { assertEquals } from "jsr:@std/assert@1";

import { DELAIS_ACCUEIL_DEFAUT, etatsAccueil, type RecrueAccueil } from "./etapes.ts";
import { TEXTES_RELANCE_DEFAUT } from "./relance_jour.ts";
import { elementsManquants, momentChoixAuto, momentReportLundi, texteDebutMardi } from "./debut_mardi.ts";

const base: RecrueAccueil = {
  poster_id: "p1", prenom: "Ana", fuseau: "Europe/Paris", bienvenue_at: "2026-10-26T10:00:00Z", cohorte_lundi: "2026-11-02",
  premiere_connexion_at: null, slack_user_id: null, contrat_id: "C1", compte_id: "c1", handle: "ana.books1",
  warmup_started_at: null, tiktok_existe: false, tiktok_vu_at: null, abonnements: null, videos: null,
  messages: [], prevues: [], repondu_at: null, kill: null,
} as RecrueAccueil;
const o = { url: "https://os.example", lien_etapes: "https://guide.example", mot_de_passe: "the one in your welcome message" };

Deno.test("Start Tuesday : ce qui manque, le message et la date de mardi", () => {
  const x = { ...base, email: "ana@sophia.com" } as RecrueAccueil;
  const etats = etatsAccueil(x, DELAIS_ACCUEIL_DEFAUT);
  assertEquals(elementsManquants(x, etats), ["connexion", "tiktok"]);
  const t = texteDebutMardi(TEXTES_RELANCE_DEFAUT, x, etats, o);
  assertEquals(t.startsWith("Hi Ana, your setup isn't finished yet: log in to your dashboard: https://os.example"), true);
  assertEquals(t.includes("create your TikTok account @ana.books1"), true);
  assertEquals(t.endsWith("Finish it by Monday noon and you'll start posting on Tuesday 3 November. If it's not done by Monday night, you'll start the following Monday."), true);
  // Connectée, compte trouvé, Start warmup cliqué, 2 abonnements : il manque 3 abonnements.
  const y = { ...base, premiere_connexion_at: "2026-10-30T10:00:00Z", tiktok_existe: true, warmup_started_at: "2026-10-31T10:00:00Z", abonnements: 2 } as RecrueAccueil;
  const ey = etatsAccueil(y, DELAIS_ACCUEIL_DEFAUT);
  assertEquals(elementsManquants(y, ey), ["follows"]);
  assertEquals(texteDebutMardi(TEXTES_RELANCE_DEFAUT, y, ey, o).includes("follow 3 more accounts with @ana.books1"), true);
});

Deno.test("Start Tuesday : dimanche 22:45 → lundi 00:00 (choix auto) ; lundi 23:59 → mardi 23:59 (report)", () => {
  const lundi = "2026-11-02";
  assertEquals(momentChoixAuto(new Date("2026-11-01T21:40:00Z"), lundi), false); // 22:40 Paris
  assertEquals(momentChoixAuto(new Date("2026-11-01T21:46:00Z"), lundi), true); // 22:46 Paris
  assertEquals(momentChoixAuto(new Date("2026-11-01T23:01:00Z"), lundi), false); // lundi 00:01 Paris
  assertEquals(momentReportLundi(new Date("2026-11-02T22:50:00Z"), lundi), false); // lundi 23:50 Paris
  assertEquals(momentReportLundi(new Date("2026-11-02T23:00:00Z"), lundi), true); // mardi 00:00 Paris
  assertEquals(momentReportLundi(new Date("2026-11-03T23:00:00Z"), lundi), false); // mercredi 00:00 Paris
});
