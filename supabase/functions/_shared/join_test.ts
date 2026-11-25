import { langueTraduite } from "./traduction_email.ts";
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";

import {
  codesVerifies,
  codeWhatsappActif,
  langueEmailJoin,
  type CandidatureJoin,
  CONTRAT_AJOUTS_V4,
  CONTRAT_RESUME,
  CONTRAT_TEXTE,
  cohorteASignature,
  cohorteDe,
  dateLimiteSignature,
  decider,
  deciderAvecReglage,
  decisionsAdminPossibles,
  emailAutorise,
  estEtapeJoin,
  etapeAdmin,
  etapeRelanceSignature,
  etapesRestantes,
  etatCode,
  genererCode,
  genererJeton,
  handlePropose,
  jourParis,
  LIEN_SLACK,
  lireAutoAcceptation,
  VIDEO_GUIDE_URL,
  lireModeJoin,
  lundiLisible,
  minuitParis,
  nettoyerHandle,
  nettoyerSource,
  normaliserWhatsapp,
  paysEtPaie,
  premierPost,
  relanceCodeDue,
  reponsesOS,
  sha256Hex,
  SOCIETE,
  texteMessage,
  TYPES_MESSAGE_JOIN,
  validerCandidature,
  versCandidatureRuul,
} from "./join.ts";

const saisie = {
  prenom: "Léa", nom: "Martin", email: "Lea@Example.com", whatsapp: "+33 6 12 34 56 78", pays: "fr", majeur: true,
  deux_telephones: true, entendu: "ad", accord_tarif: true, engagement: true, consentement: true, whatsapp_optin: true,
  langue: "fr",
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

Deno.test("candidature : validation v2 (18+, canal, parrain, tarif, engagement, consentement, piège)", () => {
  const v = validerCandidature(saisie);
  assert(v.ok);
  if (v.ok) {
    assertEquals(v.valeurs.email, "lea@example.com");
    assertEquals(v.valeurs.pays, "FR");
    assertEquals(v.valeurs.whatsapp_e164, "+33612345678");
    assertEquals(v.valeurs.whatsapp_optin, true);
    assertEquals(v.valeurs.parrain, null);
    assertEquals(Object.keys(v.valeurs.reponses).sort(), ["contenu", "heures", "pays_actuel", "tiktok"]);
  }
  const erreurs = (p: Record<string, unknown>) => {
    const r = validerCandidature({ ...saisie, ...p });
    return r.ok ? [] : r.erreurs;
  };
  assertEquals(erreurs({ consentement: false }), ["consentement"]);
  assertEquals(erreurs({ majeur: false }), ["majeur"]);
  assertEquals(erreurs({ accord_tarif: false, engagement: false }), ["accord_tarif", "engagement"]);
  assertEquals(erreurs({ entendu: "referral" }), ["parrain"]);
  assertEquals(erreurs({ entendu: "tv" }), ["entendu"]);
  assertEquals(erreurs({ site: "http://spam" }), ["site"]);
  assertEquals(erreurs({ deux_telephones: undefined }), ["deux_telephones"]);
  const p = validerCandidature({ ...saisie, entendu: "referral", parrain: " Ana " });
  assert(p.ok && p.valeurs.parrain === "Ana" && p.valeurs.reponses.contenu.includes("Ana"));
  // Le nom du parrain n'est gardé que si le canal est « referral ».
  const q = validerCandidature({ ...saisie, entendu: "ad", parrain: "Ana" });
  assert(q.ok && q.valeurs.parrain === null);
  const sansOptin = validerCandidature({ ...saisie, whatsapp_optin: undefined });
  assert(sansOptin.ok && sansOptin.valeurs.whatsapp_optin === false);
});

Deno.test("réponses OS remplies : les 4 clés exigées par manquesCandidature, jamais vides", () => {
  const r = reponsesOS("FR", "sophia_app", null);
  for (const k of ["pays_actuel", "heures", "tiktok", "contenu"]) assert(r[k].trim().length > 0, k);
  const v = validerCandidature(saisie);
  assert(v.ok);
  if (v.ok) {
    const c: CandidatureJoin = {
      ...v.valeurs, age: null, whatsapp_verifie_at: "2026-11-22T10:00:00Z",
    };
    assertEquals(decider(c, new Set(["FR"])), { decision: "auto", manques: [] });
  }
});

Deno.test("provenance : ref, UTM, fbclid gardés, le reste ignoré", () => {
  assertEquals(nettoyerSource({
    ref: "MAX-01", utm_source: "meta", utm_campaign: "nov", fbclid: "abc", landing: "/?ref=MAX-01", at: "2026-11-22T10:00:00Z",
    email: "x@y.z", autre: 1,
  }), { ref: "MAX-01", utm_source: "meta", utm_campaign: "nov", fbclid: "abc", landing: "/?ref=MAX-01", at: "2026-11-22T10:00:00Z" });
  assertEquals(nettoyerSource({ ref: "<script>", landing: "https://evil" }), {});
  assertEquals(nettoyerSource(null), {});
});

const cand = (p: Partial<CandidatureJoin> = {}): CandidatureJoin => ({
  prenom: "Léa", nom: "Martin", email: "lea@example.com", pays: "FR", age: 22, deux_telephones: true,
  reponses: reponsesOS("FR", "ad", null), whatsapp_verifie_at: "2026-11-22T10:00:00Z", ...p,
});

Deno.test("décision : règles de l'OS (manquesCandidature)", () => {
  const ouverts = new Set(["FR", "ES"]);
  assertEquals(decider(cand(), ouverts), { decision: "auto", manques: [] });
  assertEquals(decider(cand({ age: 17 }), ouverts).decision, "a_traiter");
  assertEquals(decider(cand({ age: null, majeur: true }), ouverts).decision, "auto");
  assertEquals(decider(cand({ age: null, majeur: false }), ouverts).decision, "a_traiter");
  assertEquals(decider(cand({ age: null, majeur: null }), ouverts).decision, "a_traiter");
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

Deno.test("contrat v4 = v3 + frais Ruul + non-exclusivité, le reste identique", async () => {
  assert(CONTRAT_TEXTE.includes("join-v4"));
  assert(CONTRAT_TEXTE.includes("given at signature. Ruul fees are paid by the Company. The Company's payment obligation"));
  assert(CONTRAT_TEXTE.includes("uses their own devices. This agreement is not exclusive.\n"));
  // Les deux phrases retirées et la version remise : exactement le texte join-v3 (empreinte du texte v3 publié).
  const v3 = CONTRAT_TEXTE.replace(` ${CONTRAT_AJOUTS_V4.frais_ruul}`, "").replace(` ${CONTRAT_AJOUTS_V4.exclusivite}`, "")
    .replace("(version join-v4)", "(version join-v3)");
  assertEquals(await sha256Hex(v3), "3b26b134a70966d251b8485e772c0c5d475493d2623ead6e72567b39d06bd8ff");
  // Le résumé est inchangé.
  assertEquals(await sha256Hex(JSON.stringify(CONTRAT_RESUME)), "0d649acca27b58fe95843a0482c1454cd88503ee946837fcb6c6b7f62bbbee98");
});

Deno.test("contrat : identité complète de la société en tête, plus de cases vides, clauses gardées", () => {
  assertEquals(CONTRAT_RESUME.length, 6);
  assert(CONTRAT_TEXTE.includes("Vik Studios SAS"));
  for (const m of ["103 372 421", "103 372 421 00018", "RCS Paris", "FR30103372421", "30 boulevard de Sébastopol, 75004 Paris", "Maximilien Kender", "2 €", "support@vikstudios.com"]) {
    assert(CONTRAT_TEXTE.includes(m), m);
  }
  assert(CONTRAT_TEXTE.indexOf("103 372 421") < CONTRAT_TEXTE.indexOf("1. Purpose"));
  assert(!/IBAN|BIC|bank account number/i.test(CONTRAT_TEXTE));
  // Les clauses de join-v2 sont gardées mot pour mot (propriété, résiliation, Ruul).
  assert(CONTRAT_TEXTE.includes("All TikTok accounts created or used for this work, their usernames, followers, and all content published on them belong exclusively to the Company."));
  assert(CONTRAT_TEXTE.includes("Either party may end this agreement at any time, without notice and without compensation."));
  assertEquals(SOCIETE.siren, "103 372 421");
  for (const m of ["[COMPANY NAME]", "[SIRET]", "[ADDRESS]"]) assert(!CONTRAT_TEXTE.includes(m), m);
  for (const m of ["18 years", "VPN", "French law", "four (4) paid weeks", "Confidentiality", "Personal data", "every Monday", "legal name"]) {
    assert(CONTRAT_TEXTE.includes(m), m);
  }
  assert(estEtapeJoin("tiktok"));
  assert(!estEtapeJoin("upwork"));
});

Deno.test("date limite : dimanche minuit (Paris) avant le lundi ; signé après → lundi suivant", () => {
  // Hiver (UTC+1) : lundi 30/11 00:00 Paris = dimanche 29/11 23:00 UTC.
  assertEquals(minuitParis("2026-11-30").toISOString(), "2026-11-29T23:00:00.000Z");
  // Été (UTC+2).
  assertEquals(minuitParis("2026-07-06").toISOString(), "2026-07-05T22:00:00.000Z");
  assertEquals(dateLimiteSignature("2026-11-30").toISOString(), "2026-11-29T23:00:00.000Z");
  assertEquals(jourParis(new Date("2026-11-29T23:30:00Z")), "2026-11-30");
  assertEquals(cohorteASignature("2026-11-30", new Date("2026-11-29T22:59:00Z")), "2026-11-30");
  assertEquals(cohorteASignature("2026-11-30", new Date("2026-11-29T23:00:00Z")), "2026-12-07");
  assertEquals(cohorteASignature("2026-11-30", new Date("2026-12-02T10:00:00Z")), "2026-12-07");
  assertEquals(cohorteASignature(null, new Date("2026-11-25T10:00:00Z")), "2026-11-30");
});

Deno.test("automatisation : relances J+1 / J+3, expiration J+7, relance des codes une fois", () => {
  const acc = "2026-11-20T10:00:00Z";
  const a = (h: number) => new Date(new Date(acc).getTime() + h * 3_600_000);
  assertEquals(etapeRelanceSignature(acc, [], a(5)), null);
  assertEquals(etapeRelanceSignature(acc, [], a(25)), "signature_j1");
  assertEquals(etapeRelanceSignature(acc, ["signature_j1"], a(30)), null);
  assertEquals(etapeRelanceSignature(acc, ["signature_j1"], a(73)), "signature_j3");
  assertEquals(etapeRelanceSignature(acc, [], a(73)), "signature_j3"); // J+1 manquée : pas de double relance
  assertEquals(etapeRelanceSignature(acc, ["signature_j1", "signature_j3"], a(100)), null);
  assertEquals(etapeRelanceSignature(acc, ["signature_j1", "signature_j3"], a(24 * 7)), "expirer");
  assert(!relanceCodeDue(acc, false, false, a(0.5)));
  assert(relanceCodeDue(acc, false, false, a(2)));
  assert(!relanceCodeDue(acc, true, false, a(2)));
  assert(!relanceCodeDue(acc, false, true, a(2)));
  assert(!relanceCodeDue(acc, false, false, a(24 * 8)));
  assertEquals(etapesRestantes([]), ["compte_os", "slack", "ruul", "acces"]);
  assertEquals(etapesRestantes(["compte_os", "slack"]), ["ruul", "acces"]);
  assertEquals(etapesRestantes(["compte_os", "slack", "ruul", "acces", "code"]), []);
});

Deno.test("messages : anglais, prénom, jamais de mot interdit", () => {
  for (const t of TYPES_MESSAGE_JOIN) {
    const m = texteMessage(t, { prenom: "Léa", lien: "https://join.example", lundi: "Monday 30 November", limite: "Sunday 29 November" });
    assert(m.corps.startsWith("Hi Léa,"), t);
    assert(!/\b(bot|AI|automatic|automated)\b/i.test(`${m.objet} ${m.corps} ${m.bouton ?? ""}`), t);
  }
  assert(texteMessage("signature_j1", { prenom: "A", lien: "x", lundi: "Monday 30 November", limite: "Sunday 29 November" }).corps.includes("Monday 30 November"));
});

Deno.test("mode : modèle de code WhatsApp optionnel et validé", () => {
  assertEquals(lireModeJoin({}).modele_code, null);
  assertEquals(lireModeJoin({ modele_code: "join_code" }).modele_code, "join_code");
  assertEquals(lireModeJoin({ modele_code: "Bad Name!" }).modele_code, null);
});

Deno.test("bienvenue après signature : lien Set my password, jamais de mot de passe, étapes, Slack, Ruul", () => {
  const v = { prenom: "Léa", lien: "https://os.example/set-password?t=abc", lundi: "Monday 30 November", limite: "Sunday 29 November",
    login: "lea.martin@sophia.com", handle: "lea.daily123", ruulEmail: "lea@example.com", compteCree: true };
  const m = texteMessage("acces", v);
  assertEquals(m.bouton, "Set my password");
  for (const x of ["Set my password: https://os.example/set-password?t=abc", "lea.martin@sophia.com", "@lea.daily123", LIEN_SLACK,
    "app.ruul.io", "lea@example.com", "Monday 30 November", "Start warmup", `Watch our short video guide: ${VIDEO_GUIDE_URL}`]) {
    assert(m.corps.includes(x), x);
  }
  assert(!/password\s*[:=]\s*(?!https?:\/\/)[^\s(]/i.test(m.corps.replace("Set my password: https", "")));
  assert(!/\b(bot|AI|automatic|automated)\b/i.test(m.corps));
  // Mode test (aucun compte créé) : pas de faux lien.
  const t = texteMessage("acces", { ...v, lien: "https://join.example", compteCree: false });
  assert(!t.corps.includes("https://join.example"));
  assertEquals(t.bouton, "Open my dashboard");
});

Deno.test("acceptation automatique : OFF par défaut ; OFF → l'admin décide", () => {
  assertEquals(lireAutoAcceptation(null), false);
  assertEquals(lireAutoAcceptation({}), false);
  assertEquals(lireAutoAcceptation({ actif: "true" }), false);
  assertEquals(lireAutoAcceptation({ actif: true }), true);
  assertEquals(deciderAvecReglage({ decision: "auto", manques: [] }, false), { decision: "a_traiter", manques: [], eligible: true });
  assertEquals(deciderAvecReglage({ decision: "auto", manques: [] }, true), { decision: "auto", manques: [], eligible: true });
  assertEquals(deciderAvecReglage({ decision: "a_traiter", manques: ["x"] }, true), { decision: "a_traiter", manques: ["x"], eligible: false });
});

Deno.test("étapes de l'admin et décisions possibles", () => {
  const base = { decision: null, manques: [], email_verifie_at: null, whatsapp_verifie_at: null, expire_at: null };
  assertEquals(etapeAdmin(base, false), "codes");
  assertEquals(etapeAdmin({ ...base, manques: ["pays fermé (XX)"] }, false), "ferme");
  assertEquals(etapeAdmin({ ...base, email_verifie_at: "x", whatsapp_verifie_at: "x" }, false), "verifiee");
  assertEquals(etapeAdmin({ ...base, decision: "a_traiter" }, false), "a_traiter");
  assertEquals(etapeAdmin({ ...base, decision: "auto" }, false), "acceptee");
  assertEquals(etapeAdmin({ ...base, decision: "refusee" }, false), "refusee");
  assertEquals(etapeAdmin({ ...base, decision: "auto", expire_at: "x" }, false), "expiree");
  assertEquals(etapeAdmin({ ...base, decision: "auto" }, true), "signee");
  assertEquals(decisionsAdminPossibles("a_traiter"), { accepter: true, refuser: true });
  assertEquals(decisionsAdminPossibles("signee"), { accepter: false, refuser: false });
  assertEquals(decisionsAdminPossibles("codes"), { accepter: false, refuser: true });
  assertEquals(decisionsAdminPossibles("refusee"), { accepter: true, refuser: false });
});

Deno.test("join : les emails partent dans la langue du candidat, nouvelles langues comprises", () => {
  assertEquals(langueEmailJoin("pt"), "pt-BR");
  assertEquals(langueEmailJoin("nb"), "no");
  assertEquals(langueEmailJoin(""), "en");
  for (const l of ["he", "fi", "lv", "sv", "lt", "sl", "no", "et", "ar", "ru", "ja", "da", "ko", "hu", "pl", "fr", "es", "pt", "bg"]) {
    assert(langueTraduite(langueEmailJoin(l)), l);
  }
  assert(!langueTraduite(langueEmailJoin("en")));
});

Deno.test("25/11 : sans modèle de code WhatsApp, le code par email suffit", () => {
  const sans = lireModeJoin({ mode: "live" });
  const avec = lireModeJoin({ mode: "live", modele_code: "join_code" });
  const c = { email_verifie_at: "x", whatsapp_verifie_at: null };
  assertEquals(codeWhatsappActif(sans), false);
  assertEquals(codesVerifies(c, sans), true);
  assertEquals(codesVerifies(c, avec), false);
  assertEquals(codesVerifies({ ...c, email_verifie_at: null }, sans), false);
  const base = { decision: null, manques: [], expire_at: null, ...c };
  assertEquals(etapeAdmin(base, false, false), "verifiee");
  assertEquals(etapeAdmin(base, false, true), "codes");
});
