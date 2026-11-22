import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";

import {
  type CandidatureJoin,
  CONTRAT_RESUME,
  CONTRAT_TEXTE,
  cohorteDe,
  decider,
  emailAutorise,
  estEtapeJoin,
  etatCode,
  genererCode,
  genererJeton,
  handlePropose,
  lireModeJoin,
  lundiLisible,
  nettoyerHandle,
  normaliserWhatsapp,
  paysEtPaie,
  premierPost,
  sha256Hex,
  validerCandidature,
  versCandidatureRuul,
} from "./join.ts";

const saisie = {
  prenom: "Léa", nom: "Martin", email: "Lea@Example.com", whatsapp: "+33 6 12 34 56 78", pays: "fr", age: 22,
  deux_telephones: true, consentement: true, langue: "fr",
  reponses: { pays_actuel: "France", heures: "2", tiktok: "yes", contenu: "slides" },
};

Deno.test("mode : test par défaut, testeurs normalisés", () => {
  const m = lireModeJoin({ testeurs_emails: [" A@B.com "], testeurs_whatsapp: ["+33 6 00"] });
  assertEquals(m.mode, "test");
  assert(emailAutorise(m, "a@b.COM"));
  assert(!emailAutorise(m, "c@d.com"));
  assertEquals(lireModeJoin(null).mode, "test");
  assertEquals(lireModeJoin({ mode: "live" }).mode, "live");
});

Deno.test("WhatsApp : format international", () => {
  assertEquals(normaliserWhatsapp("+33 6 12 34 56 78"), "+33612345678");
  assertEquals(normaliserWhatsapp("0033612345678"), "+33612345678");
  assertEquals(normaliserWhatsapp("0612345678"), null);
  assertEquals(normaliserWhatsapp("+0612345678"), null);
});

Deno.test("candidature : validation et consentement obligatoire", () => {
  const v = validerCandidature(saisie);
  assert(v.ok);
  if (v.ok) {
    assertEquals(v.valeurs.email, "lea@example.com");
    assertEquals(v.valeurs.pays, "FR");
    assertEquals(v.valeurs.whatsapp_e164, "+33612345678");
  }
  const sans = validerCandidature({ ...saisie, consentement: false });
  assertEquals(sans.ok, false);
  if (!sans.ok) assert(sans.erreurs.includes("consentement"));
  const vide = validerCandidature({ ...saisie, reponses: { pays_actuel: "", heures: "1", tiktok: "x", contenu: "y" } });
  if (!vide.ok) assertEquals(vide.erreurs, ["pays_actuel"]);
  else throw new Error("aurait dû échouer");
});

const cand = (p: Partial<CandidatureJoin> = {}): CandidatureJoin => ({
  prenom: "Léa", nom: "Martin", email: "lea@example.com", pays: "FR", age: 22, deux_telephones: true,
  reponses: saisie.reponses, whatsapp_verifie_at: "2026-11-22T10:00:00Z", ...p,
});

Deno.test("décision : règles de l'OS (manquesCandidature)", () => {
  const ouverts = new Set(["FR", "ES"]);
  assertEquals(decider(cand(), ouverts), { decision: "auto", manques: [] });
  assertEquals(decider(cand({ age: 17 }), ouverts).decision, "a_traiter");
  assertEquals(decider(cand({ pays: "PT" }), ouverts).decision, "a_traiter");
  assertEquals(decider(cand({ deux_telephones: false }), ouverts).decision, "a_traiter");
  assertEquals(decider(cand({ whatsapp_verifie_at: null }), ouverts).decision, "a_traiter");
  const r = versCandidatureRuul(cand());
  assertEquals(r.adulte, true);
  assertEquals(r.a_telephone, true);
  assertEquals(r.nom, "Léa Martin");
});

Deno.test("pays et paie : zones, pays fermés exclus", () => {
  const r = paysEtPaie(
    [{ zone: "B", tarif: "10" }, { zone: "A", tarif: 14 }],
    [{ pays: "FR", zone: "A" }, { pays: "PT", zone: "B" }, { pays: "ES", zone: "B" }, { pays: "XX", zone: "A", retire_at: "2026-01-01" }],
    ["PT"],
  );
  assertEquals(r.zones, [{ zone: "A", tarif: 14 }, { zone: "B", tarif: 10 }]);
  assertEquals(r.pays, [{ pays: "ES", zone: "B", tarif: 10 }, { pays: "FR", zone: "A", tarif: 14 }]);
});

Deno.test("codes : 6 chiffres, 5 essais, 15 minutes", async () => {
  for (let i = 0; i < 50; i++) assertMatch(genererCode(), /^\d{6}$/);
  const h = await sha256Hex("123456");
  const v = { code_hash: h, essais: 0, expire_at: "2026-11-22T10:15:00Z", verifie_at: null };
  const t = new Date("2026-11-22T10:05:00Z");
  assertEquals(etatCode(v, h, t), "ok");
  assertEquals(etatCode(v, await sha256Hex("000000"), t), "faux");
  assertEquals(etatCode({ ...v, essais: 5 }, h, t), "trop_essais");
  assertEquals(etatCode(v, h, new Date("2026-11-22T10:16:00Z")), "expire");
  assertEquals(etatCode({ ...v, verifie_at: "x" }, h, t), "deja");
  assertMatch(genererJeton(), /^[A-Za-z0-9_-]{43}$/);
});

Deno.test("handle : prénom + mot + 3 chiffres, minuscules", () => {
  assertEquals(handlePropose("Léa-Marie", () => 0), "leamarie.daily000");
  assertMatch(handlePropose("Zoë"), /^zoe\.[a-z]+\d{3}$/);
  assertEquals(handlePropose("李", () => 0.5), "creator.mind500");
  assertEquals(nettoyerHandle("@Lea.Reads_01"), "lea.reads_01");
  assertEquals(nettoyerHandle("a b"), null);
});

Deno.test("premier post : lundi suivant, +7 si warm-up pas fini avant dimanche 23:59", () => {
  assertEquals(cohorteDe("2026-11-22"), "2026-11-23"); // dimanche → lendemain
  assertEquals(cohorteDe("2026-11-23"), "2026-11-30"); // lundi → lundi suivant
  assertEquals(premierPost("2026-11-30", false, "2026-11-29"), "2026-11-30");
  assertEquals(premierPost("2026-11-30", false, "2026-11-30"), "2026-12-07");
  assertEquals(premierPost("2026-11-30", true, "2026-12-01"), "2026-11-30");
  assertEquals(premierPost("2026-11-30", false, "2026-12-08"), "2026-12-14");
  assertEquals(lundiLisible("2026-11-30"), "Monday 30 November");
});

Deno.test("contrat : résumé en 5 lignes, clauses et placeholders", () => {
  assertEquals(CONTRAT_RESUME.length, 5);
  for (const m of ["[COMPANY NAME]", "[SIRET]", "[ADDRESS]", "18 years", "VPN", "French law", "four (4) paid weeks", "Confidentiality", "Personal data"]) {
    assert(CONTRAT_TEXTE.includes(m), m);
  }
  assert(estEtapeJoin("tiktok"));
  assert(!estEtapeJoin("upwork"));
});
