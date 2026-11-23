import { assert, assertEquals } from "jsr:@std/assert@1";

import { estDemandePosteur, lignePaiement, raisonFixe, texteCompteArrete, texteDeuxiemeCompte, texteFin } from "./fin_collaboration.ts";
import type { EtatReel } from "./support_regles.ts";

const etat = (p: Partial<EtatReel>): EtatReel => ({
  actif: false, canal_paie: "upwork", cohorte: null, comptes: [], comptes_actifs: 0, warmup: null, posts_aujourdhui: null,
  posts_semaine: null, arret: null, contrat_upwork: null, ruul: null, paie: [], upwork_exception: null, ...p,
});

Deno.test("raisons internes en clair, jamais de code", () => {
  assertEquals(raisonFixe("ckd:absent"), "posts were missing");
  assertEquals(raisonFixe("ckd:premiere_semaine"), "the first week of posts was not completed");
  assertEquals(raisonFixe("Kill immédiat : STOP jamais posté"), "no post was ever published");
  assertEquals(raisonFixe("Arrêt Portugal 02/11"), null);
  assertEquals(raisonFixe(null), null);
});

Deno.test("arrêt demandé par le posteur", () => {
  assertEquals(estDemandePosteur("je_ne_veux_plus", null), true);
  assertEquals(estDemandePosteur("manuel", "Contract ended by freelancer on 5 Nov 2026"), true);
  assertEquals(estDemandePosteur("kill_samedi", null), false);
});

Deno.test("page de fin : kill avec la dernière semaine due (Upwork)", () => {
  const e = etat({ paie: [{ semaine: "2026-11-16", total: 14, statut: "a_payer", action: "payer", paye_at: null }] });
  const t = texteFin(e, "kill", "2026-11-21T10:00:00Z", "posts were missing");
  assertEquals(t.split("\n"), [
    "Your collaboration with Vik Studios ended on 21 Nov.",
    "Reason: Posts were missing.",
    "Payment: 14 $ for the week of 16 Nov, paid on Monday 23 Nov via Upwork.",
    "You no longer need to post. Thank you for your work.",
  ]);
});

Deno.test("page de fin : à sa demande, déjà payé (Ruul)", () => {
  const e = etat({ canal_paie: "ruul", paie: [{ semaine: "2026-11-09", total: 7, statut: "paye", paye_at: "2026-11-16T10:00:00Z" }] });
  assertEquals(texteFin(e, "demande", "2026-11-18", null).split("\n")[0], "Your contract ended at your request on 18 Nov.");
  assertEquals(lignePaiement(e), "your last week has already been paid.");
  assertEquals(lignePaiement(etat({})), "there is no payment due for your last weeks.");
});

Deno.test("bandeau : un compte désactivé, l'autre continue, tarif 1 compte", () => {
  assertEquals(
    texteCompteArrete({ handle: "run.anna", le: "2026-11-21T10:00:00Z", raison: "posts were missing", autre: "study.anna", montant: 14 }),
    "One of your accounts (@run.anna) was deactivated on 21 Nov because posts were missing. You keep posting on @study.anna as usual. From next week, your weekly payment goes back to the 1-account rate: 14 $ per week.",
  );
});

Deno.test("bandeau du 2e compte : quel compte, quel label, quand il démarre, ce qu'il gagne en plus", () => {
  assertEquals(
    texteDeuxiemeCompte({ handle: "leevi.voima242", label: "classic_study", lundi: "2026-11-23", tarif: 10 }),
    "Good news: @leevi.voima242 is doing great, so you get a 2nd TikTok account in the \"classic_study\" style. It is on your dashboard now: " +
      "create it and do its warm-up from today to Sunday. It starts posting on Monday 23 Nov. From that week you are paid for 2 accounts: +10 $ per week (20 $ per week in total).",
  );
  assertEquals(
    texteDeuxiemeCompte({ handle: null, label: null, lundi: "2026-11-23", tarif: null }).endsWith("It starts posting on Monday 23 Nov. From that week you are paid for 2 accounts."),
    true,
  );
});

Deno.test("2e compte validé le jeudi (22/11) : Ruul → payé sur le même compte Ruul", () => {
  const t = texteDeuxiemeCompte({ handle: "x", label: null, lundi: "2026-11-30", tarif: 7, canal: "ruul" });
  assert(t.endsWith("no new Ruul account or verification needed."));
  assert(!texteDeuxiemeCompte({ handle: "x", label: null, lundi: "2026-11-30", tarif: 7, canal: "upwork" }).includes("Ruul"));
});
