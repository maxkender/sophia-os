import { assertEquals } from "jsr:@std/assert@1";

import { emailAB, prochaineEtapeRuul, remplirRuul, rendreEmailRuul, semaineCourte } from "./ruul.ts";

Deno.test("Ruul : invitation, relances J+1 et J+3, Problems à J+5, rien après STOP ou prêt", () => {
  const ajoute = "2026-11-09T10:00:00Z";
  const a = (h: number) => new Date(new Date(ajoute).getTime() + h * 3_600_000);
  const e = (relances: number, o: Record<string, unknown> = {}) => ({ statut: "invite", ajoute_at: ajoute, relances, stop_at: null, ...o });
  assertEquals(prochaineEtapeRuul(e(0), a(0)), "invite");
  assertEquals(prochaineEtapeRuul(e(1), a(23)), null);
  assertEquals(prochaineEtapeRuul(e(1), a(24)), "relance1");
  assertEquals(prochaineEtapeRuul(e(2), a(71)), null);
  assertEquals(prochaineEtapeRuul(e(2), a(72)), "relance3");
  assertEquals(prochaineEtapeRuul(e(3), a(120)), "problems");
  assertEquals(prochaineEtapeRuul(e(4), a(500)), null);
  assertEquals(prochaineEtapeRuul(e(0, { stop_at: ajoute }), a(1)), null);
  assertEquals(prochaineEtapeRuul(e(0, { statut: "pret" }), a(1)), null);
});

Deno.test("0681 : email A une fois (Invited), B une fois (Active), jamais A après B, rien si prêt ou STOP", () => {
  const base = { compte: null as string | null, a_at: null as string | null, b_at: null as string | null, statut: "invite", stop_at: null as string | null };
  assertEquals(emailAB(base), null);
  assertEquals(emailAB({ ...base, compte: "invited" }), "A");
  assertEquals(emailAB({ ...base, compte: "invited", a_at: "2026-11-12" }), null);
  assertEquals(emailAB({ ...base, compte: "active" }), "B");
  assertEquals(emailAB({ ...base, compte: "active", a_at: "2026-11-12" }), "B");
  assertEquals(emailAB({ ...base, compte: "active", b_at: "2026-11-12" }), null);
  assertEquals(emailAB({ ...base, compte: "invited", b_at: "2026-11-12" }), null);
  assertEquals(emailAB({ ...base, compte: "active", statut: "pret" }), null);
  assertEquals(emailAB({ ...base, compte: "invited", stop_at: "2026-11-12" }), null);
});

Deno.test("Ruul : textes, email (bouton, Unsubscribe), semaine", () => {
  assertEquals(remplirRuul("Hi {prenom}, ${montant} for {semaine} {x}", { prenom: "Ana", montant: 14, semaine: "26 Oct" }), "Hi Ana, $14 for 26 Oct {x}");
  const r = rendreEmailRuul({ objet: "O", corps: "A\n\nB", bouton: { texte: "It's done", lien: "https://x/?pret=1" }, lienStop: "https://x/?stop=1" });
  assertEquals(r.texte.includes("It's done: https://x/?pret=1"), true);
  assertEquals(r.html.includes("Unsubscribe"), true);
  assertEquals(/\bbots?\b|automat/i.test(r.html + r.texte), false);
  assertEquals(semaineCourte("2026-10-26"), "26 Oct");
});

Deno.test("Ruul : acceptation automatique, lundi de cohorte, relances de signature", async () => {
  const { manquesCandidature, lundiSuivant, etapeSignature } = await import("./ruul.ts");
  const ok = {
    adulte: true, pays: "IT", deux_telephones: true, a_telephone: true, nom: "Ana", email: "a@b.cc", desinscrit_at: null,
    reponses: { pays_actuel: "Italy", heures: "1", tiktok: "yes", contenu: "no" },
  };
  const ouverts = new Set(["IT", "FR"]);
  assertEquals(manquesCandidature(ok, ouverts), []);
  assertEquals(manquesCandidature({ ...ok, adulte: false, pays: "PT", deux_telephones: false }, ouverts),
    ["majorité non confirmée", "pays fermé (PT)", "pas 2 téléphones"]);
  assertEquals(manquesCandidature({ ...ok, reponses: { ...ok.reponses, contenu: " " } }, ouverts), ["réponses incomplètes"]);
  assertEquals(lundiSuivant("2026-11-09"), "2026-11-16");
  assertEquals(lundiSuivant("2026-11-15"), "2026-11-16");
  const a = "2026-11-09T10:00:00Z";
  const j = (n: number) => new Date(new Date(a).getTime() + n * 86_400_000);
  assertEquals(etapeSignature(a, 0, j(0.5)), null);
  assertEquals(etapeSignature(a, 0, j(1)), 1);
  assertEquals(etapeSignature(a, 1, j(3)), 3);
  assertEquals(etapeSignature(a, 2, j(6)), 6);
  assertEquals(etapeSignature(a, 3, j(6.5)), null);
  assertEquals(etapeSignature(a, 3, j(7)), "expirer");
  assertEquals(etapeSignature(a, 0, j(9)), "expirer");
});

Deno.test("Ruul : un texte Slack lisible par email", async () => {
  const { texteSansSlack } = await import("./ruul.ts");
  assertEquals(texteSansSlack("Hi *Ana*, open <https://x.y/a|your dashboard> or <https://x.y/b>."), "Hi Ana, open your dashboard: https://x.y/a or https://x.y/b.");
});

Deno.test("Ruul (0592) : l'email du soir (nouveaux depuis hier + reste)", async () => {
  const { emailListeSoir } = await import("./ruul.ts");
  const m = emailListeSoir([
    { poster_id: "1", nom: "Ana Test", ruul_email: "ana@test.cc", pays: "ES", zone: "B", tarif: 10 },
    { poster_id: "2", nom: "Bo <Test>", ruul_email: "bo@test.cc", pays: null, zone: null, tarif: null },
  ], 3);
  assertEquals(m.objet, "Ruul : 2 nouveaux posteurs à ajouter");
  assertEquals(m.texte.split("\n")[1], "- Ana Test — ana@test.cc — ES — 10 $ / semaine");
  assertEquals(m.texte.split("\n")[2], "- Bo <Test> — bo@test.cc — ? — ?");
  assertEquals(m.texte.split("\n")[3], "Encore à ajouter : 3 des jours précédents.");
  assertEquals(m.html.includes("Bo &lt;Test&gt;"), true);
  const un = emailListeSoir([{ poster_id: "1", nom: "A", ruul_email: "a@b.cc", pays: "IT", zone: "A", tarif: 12 }], 0);
  assertEquals(un.objet, "Ruul : 1 nouveau posteur à ajouter");
  assertEquals(un.texte.includes("Encore"), false);
});
