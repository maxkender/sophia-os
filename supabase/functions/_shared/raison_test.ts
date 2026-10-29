/** Prompt 25 MAJ, point 1 : la raison de chaque message, en clair. */
import { assertEquals } from "jsr:@std/assert@1";

import { familleMessage, jourCourt, raisonLisible } from "./raison.ts";

Deno.test("jourCourt : la date à Paris, vide si absente", () => {
  assertEquals(jourCourt("2026-10-29T23:30:00Z"), "30/10");
  assertEquals(jourCourt("2026-10-29"), "29/10");
  assertEquals(jourCourt(null), "");
});

Deno.test("une relance : chaque chose qui manque, avec ses données", () => {
  assertEquals(
    raisonLisible("relance", { elements: ["slack", "connexion"], bienvenue: "2026-10-29T10:00:00Z" }),
    "pas sur Slack · pas connectée depuis le 29/10",
  );
  assertEquals(
    raisonLisible("relance", { elements: ["follows"], abonnements: 3, releve_at: "2026-10-30T07:00:00Z" }),
    "3 abonnements sur 5 (relevé TikTok du 30/10)",
  );
});

Deno.test("le @ introuvable, la bienvenue, le lundi 20 h", () => {
  assertEquals(
    raisonLisible("handle", { handle: "sara.studie746", introuvable_depuis: "2026-10-28T19:00:00Z", start_warmup: "2026-10-28T05:07:00Z" }),
    "@sara.studie746 introuvable aux 2 derniers relevés depuis le 28/10, Start warmup cliqué le 28/10",
  );
  assertEquals(raisonLisible("accueil", { offre: "2026-10-29T09:00:00Z", contrat: "44784407" }), "offre acceptée le 29/10, contrat 44784407");
  assertEquals(
    raisonLisible("lundi_soir", { cohorte: "2026-11-02", posts_avec_lien_lundi: 0, heure_locale: "20:00 (Europe/Oslo)" }),
    "1er jour de posts (02/11) : warm-up fini, 0 post avec lien à 20:00 (Europe/Oslo)",
  );
});

Deno.test("familles : relances et @ ensemble, le reste à part", () => {
  assertEquals(familleMessage("handle_upwork"), "relance");
  assertEquals(familleMessage("lundi_soir"), "lundi_soir");
});
