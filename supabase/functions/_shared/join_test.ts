import { langueTraduite } from "./traduction_email.ts";
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";

import {
  codesVerifies,
  codeWhatsappActif,
  langueEmailJoin,
  type CandidatureJoin,
  CONTRAT_AJOUTS_V4,
  CONTRAT_RESUME_V5,
  CONTRAT_RESUME,
  CONTRAT_TEXTE,
  cohorteASignature,
  cohorteDe,
  dateLimiteSignature,
  decider,
  deciderAvecReglage,
  deciderJoin,
  type EtatChecklist,
  etatChecklist,
  type EtatOS,
  lireJoinReel,
  raisonSimulation,
  rappelsDus,
  separerDoublons,
  signatureVendrediDue,
  texteRappel,
  typeWhatsappRappel,
  decisionsAdminPossibles,
  emailAutorise,
  estEtapeJoin,
  etapeAdmin,
  etapeRelanceSignature,
  etapesRestantes,
  etatCode,
  genererCode,
  genererJeton,
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
  profilTiktokOS,
  relanceCodeDue,
  reponsesOS,
  sha256Hex,
  SOCIETE,
  texteContratComplet,
  texteMessage,
  TYPES_MESSAGE_JOIN,
  validerCandidature,
  versCandidatureRuul,
  whatsappsBienvenue,
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
  // 25/11 (Max) : la question « deux téléphones » n'est plus posée (facultative, null quand absente).
  assertEquals(erreurs({ deux_telephones: undefined }), []);
  assertEquals(erreurs({ deux_telephones: "oui" }), ["deux_telephones"]);
  const sansTel = validerCandidature({ ...saisie, deux_telephones: undefined });
  assert(sansTel.ok && sansTel.valeurs.deux_telephones === null);
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
  // 25/11 (Max) : Join n'exige plus de deuxième téléphone (la règle de l'OS reste dans ruul.ts, pour l'OS et le Hub).
  assertEquals(decider(cand({ deux_telephones: false }), ouverts).decision, "auto");
  assertEquals(decider(cand({ deux_telephones: null }), ouverts).decision, "auto");
  assertEquals(versCandidatureRuul(cand({ deux_telephones: null })).deux_telephones, true);
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

Deno.test("handle saisi : « @ » retiré, minuscules, caractères de TikTok", () => {
  assertEquals(nettoyerHandle("@Lea.Reads_01"), "lea.reads_01");
  assertEquals(nettoyerHandle("a b"), null);
});

Deno.test("profil TikTok : SEULEMENT celui du compte de l'OS, jamais inventé (26/11)", () => {
  // Pas de compte de l'OS : tout est null, pas prêt (aucun prénom, aucune bio par défaut).
  const vide = { pret: false, handle: null, nom: null, bio: null, photo_url: null };
  assertEquals(profilTiktokOS(null), vide);
  assertEquals(profilTiktokOS([]), vide);
  // Un compte sans pseudo : pas prêt, rien n'est montré.
  assertEquals(profilTiktokOS([{ handle_tiktok: " ", persona_nom: "Léa", persona_bio: "x", avatar_url: "https://a/b.jpg" }]), vide);
  // Le compte perso le plus ancien (comme join_etat_os et le dashboard de l'OS), valeurs telles quelles.
  const p = profilTiktokOS([
    { handle_tiktok: "cm.compte", persona_nom: "CM", persona_bio: "cm", avatar_url: null, type_compte: "cm", created_at: "2026-11-01" },
    { handle_tiktok: "@lea.recent", persona_nom: "Récent", persona_bio: "r", avatar_url: null, type_compte: "perso", created_at: "2026-11-20" },
    { handle_tiktok: "@Lea.Study", persona_nom: " Léa M ", persona_bio: "Books & coffee", avatar_url: "https://x/a.jpg", type_compte: null, created_at: "2026-11-10" },
  ]);
  assertEquals(p, { pret: true, handle: "Lea.Study", nom: "Léa M", bio: "Books & coffee", photo_url: "https://x/a.jpg" });
  assertEquals(profilTiktokOS([{ handle_tiktok: "lea", persona_nom: null, persona_bio: "", avatar_url: null }]),
    { pret: true, handle: "lea", nom: null, bio: null, photo_url: null });
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

Deno.test("contrat v5 = v4 + 1re ligne du résumé (compte TikTok créé par le posteur), le reste identique", async () => {
  assert(CONTRAT_TEXTE.includes("join-v5"));
  assert(CONTRAT_TEXTE.includes("given at signature. Ruul fees are paid by the Company. The Company's payment obligation"));
  assert(CONTRAT_TEXTE.includes("uses their own devices. This agreement is not exclusive.\n"));
  assertEquals(CONTRAT_RESUME[0], CONTRAT_RESUME_V5.apres);
  // join-v4 reconstitué (version remise, ancienne 1re ligne) : exactement les empreintes publiées de join-v4.
  const v4Texte = CONTRAT_TEXTE.replace("(version join-v5)", "(version join-v4)");
  const v4Resume = [CONTRAT_RESUME_V5.avant, ...CONTRAT_RESUME.slice(1)];
  assertEquals(await sha256Hex(v4Texte), "aed5196c671b136d0faeb1733a2eda71c1da6f5a0e4a57b6340c0369e9c2afee");
  assertEquals(await sha256Hex(JSON.stringify(v4Resume)), "0d649acca27b58fe95843a0482c1454cd88503ee946837fcb6c6b7f62bbbee98");
  assertEquals(
    await sha256Hex(`${v4Resume.map((l) => `- ${l}`).join("\n")}\n\n${v4Texte}`),
    "890876acdbd36ef0d4587f6cf82ba3aab68571b6af895c3b6ba1852c30afbe96",
  );
  // Et join-v3 sous join-v4 (frais Ruul et non-exclusivité retirés).
  const v3 = v4Texte.replace(` ${CONTRAT_AJOUTS_V4.frais_ruul}`, "").replace(` ${CONTRAT_AJOUTS_V4.exclusivite}`, "")
    .replace("(version join-v4)", "(version join-v3)");
  assertEquals(await sha256Hex(v3), "3b26b134a70966d251b8485e772c0c5d475493d2623ead6e72567b39d06bd8ff");
  assert(texteContratComplet().startsWith(`- ${CONTRAT_RESUME_V5.apres}\n`));
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
  assertEquals(etapesRestantes([]), ["compte_os", "slack", "acces", "ruul"]);
  assertEquals(etapesRestantes(["compte_os", "slack"]), ["acces", "ruul"]);
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
  // 26/11 : le login et le lien « Set my password » en clair ; le bouton « Set my password » (message() lui donne ce lien).
  assert(m.corps.includes("- Login: lea.martin@sophia.com"));
  assert(m.corps.includes("- Set my password: https://os.example/set-password?t=abc"));
});

Deno.test("bienvenue : sans @ de l'OS, aucun pseudo, les infos TikTok sont sur le dashboard (26/11)", () => {
  const v = { prenom: "Léa", lien: "https://os.example/set-password?t=abc", lundi: "Monday 30 November", limite: "Sunday 29 November",
    login: "lea.martin@sophia.com", handle: null, ruulEmail: "lea@example.com", compteCree: true };
  const m = texteMessage("acces", v);
  assert(!m.corps.includes("@lea"), "aucun @ inventé");
  assert(!m.corps.includes("exact name above"));
  assert(m.corps.includes("your TikTok details are on your dashboard"));
  assert(m.corps.includes("username, name, photo and bio shown on your dashboard"));
  assert(m.corps.includes("- Login: lea.martin@sophia.com") && m.corps.includes("- Set my password: https://os.example/set-password?t=abc"));
  assert(!/\b(bot|AI|automatic|automated)\b/i.test(m.corps));
  const avec = texteMessage("acces", { ...v, handle: "lea.study" });
  assert(avec.corps.includes("- Your TikTok account, with this exact name: @lea.study"));
  assert(avec.corps.includes("exact name above"));
});

Deno.test("bienvenue WhatsApp : lien « Set my password » puis welcome_start avec le @ de l'OS (26/11)", () => {
  const base = {
    candidatureId: "cand-1", profileId: "post-1", prenom: "Léa Marie", lundi: "2026-11-30", lien: "https://os.example/set-password?t=abc",
    handle: "lea.study" as string | null, lienPersonnel: true, approuves: new Set(["welcome_start", "account_ready"]),
  };
  // Compte OS réel + lien personnel : 2 WhatsApp, dans l'ordre.
  const deux = whatsappsBienvenue(base);
  assertEquals(deux.map((w) => [w.nom, w.cle, w.motif]), [
    ["account_ready", "join_acces_lien:cand-1", "join_acces"],
    ["welcome_start", "welcome:post-1", "relance:welcome_start"],
  ]);
  assertEquals(deux[0].variables, ["Léa", "https://os.example/set-password?t=abc"]);
  assertEquals(deux[1].variables[0], "Léa");
  assertEquals(deux[1].variables[3], "lea.study");
  assertEquals(deux[1].variables[4], VIDEO_GUIDE_URL);
  // Sans @ de l'OS, ou welcome_start pas APPROVED : le lien seulement.
  assertEquals(whatsappsBienvenue({ ...base, handle: null }).map((w) => w.nom), ["account_ready"]);
  assertEquals(whatsappsBienvenue({ ...base, approuves: new Set(["account_ready"]) }).map((w) => w.cle), ["join_acces_lien:cand-1"]);
  // Sans compte OS réel (pas de lien personnel) : comme avant, un seul message.
  const avant = whatsappsBienvenue({ ...base, lienPersonnel: false, lien: "https://join.example" });
  assertEquals(avant.map((w) => [w.nom, w.cle]), [["welcome_start", "welcome:post-1"]]);
  const sansFiche = whatsappsBienvenue({ ...base, profileId: null, handle: null, lienPersonnel: false, lien: "https://join.example" });
  assertEquals(sansFiche, [{ nom: "account_ready", cle: "join_acces:cand-1", motif: "relance:welcome_start", variables: ["Léa", "https://join.example"] }]);
  // Un lien « personnel » sans fiche OS n'existe pas : jamais deux messages sans posteur.
  assertEquals(whatsappsBienvenue({ ...base, profileId: null, handle: null }).length, 1);
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

// ---------------------------------------------------------------------------------------------------------------
// 0858 (25/11, Max) : join_reel, décision, checklist et rappels
// ---------------------------------------------------------------------------------------------------------------

Deno.test("join_reel : tout simulé par défaut ; seul true rend une étape réelle ; une candidature de test ne crée rien", () => {
  const rien = lireJoinReel(null);
  assertEquals(rien, { compte_os: false, acces: false, ruul: false, rappels: false, whatsapp: false });
  assertEquals(lireJoinReel({ compte_os: "true", rappels: 1 }).compte_os, false);
  const tout = lireJoinReel({ compte_os: true, acces: true, ruul: true, rappels: true, whatsapp: true });
  assertEquals(raisonSimulation("acces", rien, { test: false }), "drapeau join_reel.acces à false");
  assertEquals(raisonSimulation("acces", tout, { test: false }), null);
  assertEquals(raisonSimulation("acces", tout, { test: false, simuler: true }), "simulation (horloge simulée)");
  assert(raisonSimulation("compte_os", tout, { test: true })?.startsWith("candidature de test"));
  assertEquals(raisonSimulation("compte_os", tout, { test: false }), null);
  assertEquals(raisonSimulation("ruul", tout, { test: false, profil: false }), "pas de fiche OS (compte OS simulé)");
  assertEquals(raisonSimulation("ruul", tout, { test: false, profil: true }), null);
});

Deno.test("décision : langue gérée par l'OS et doublons, en clair", () => {
  const ouverts = new Set(["FR", "ES"]);
  const ok = { langue: { geree: true, code: "fr" }, doublons: [] };
  assertEquals(deciderJoin(cand(), ouverts, true, ok), { decision: "auto", manques: [], alertes: [] });
  assertEquals(deciderJoin(cand(), ouverts, true, { ...ok, langue: { geree: false, code: "ca" } }).manques, ["langue non gérée par l'OS (ca)"]);
  assertEquals(deciderJoin(cand(), ouverts, true, { ...ok, langue: { geree: null, code: null } }).manques, ["langue non vérifiée (OS injoignable)"]);
  const d = deciderJoin(cand(), ouverts, true, { ...ok, doublons: ["doublon : email déjà sur une fiche de l'OS"] });
  assertEquals(d, { decision: "a_traiter", manques: ["doublon : email déjà sur une fiche de l'OS"], alertes: [] });
  // Pays fermé : la langue n'est pas ajoutée (un seul manque, le vrai).
  assertEquals(deciderJoin(cand({ pays: "PT" }), ouverts, true, { ...ok, langue: { geree: false, code: "pt" } }).manques, ["pays fermé (PT)"]);
  // 18 ans ou plus : toujours la règle de l'OS.
  assertEquals(deciderJoin(cand({ age: null, majeur: false }), ouverts, true, ok).decision, "a_traiter");
  // Avec l'interrupteur OFF : éligible, mais l'admin décide.
  assertEquals(deciderAvecReglage(deciderJoin(cand(), ouverts, true, ok), false), { decision: "a_traiter", manques: [], eligible: true });
});

Deno.test("décision : un même nom est une alerte, jamais bloquante ; email ou téléphone connu reste un manque (26/11, 0863)", () => {
  const ouverts = new Set(["FR", "ES"]);
  const ok = { langue: { geree: true, code: "fr" }, doublons: [] as string[] };
  const noms = ["alerte : même nom qu'une autre candidature Join", "alerte : même nom qu'un posteur de l'OS", "alerte : même nom qu'une candidature du site"];
  const d = deciderJoin(cand(), ouverts, true, { ...ok, doublons: noms });
  assertEquals(d, { decision: "auto", manques: [], alertes: noms });
  // ON : acceptée seule malgré l'alerte (elle reste notée pour la fiche /admin).
  assertEquals(deciderAvecReglage(d, true), { decision: "auto", manques: [], eligible: true });
  // L'ancien libellé (« doublon : même nom… », avant 0863) est lu comme une alerte.
  assertEquals(separerDoublons(["doublon : même nom qu'un posteur de l'OS"]), { manques: [], alertes: ["alerte : même nom qu'un posteur de l'OS"] });
  // Email ou téléphone déjà connu : toujours « a_traiter », l'alerte à part.
  const mixte = deciderJoin(cand(), ouverts, true, {
    ...ok, doublons: ["doublon : téléphone déjà dans une autre candidature Join", noms[1], "doublon : email déjà dans le Hub"],
  });
  assertEquals(mixte.decision, "a_traiter");
  assertEquals(mixte.manques, ["doublon : téléphone déjà dans une autre candidature Join", "doublon : email déjà dans le Hub"]);
  assertEquals(mixte.alertes, [noms[1]]);
  assertEquals(separerDoublons(["", " ", "doublons non vérifiés (base injoignable)"]), { manques: ["doublons non vérifiés (base injoignable)"], alertes: [] });
});

const osVide = (o: Partial<EtatOS> = {}): EtatOS => ({
  profile_id: "p", is_active: true, relances_stop_at: null, cohorte_lundi: "2026-11-30", premiere_connexion_at: null, ruul_email: null,
  ruul_onboarding: null, ruul_ready_at: null, ruul_retire_at: null, ruul_jeton: null, handle: "max.daily123", tiktok: false,
  warmup_started_at: null, slack: false, premier_post_at: null, posts_prevus: false, arrete: false, desinscrit: false,
  paie_reportee: false, email_jour: false, ...o,
});

Deno.test("checklist : cochée par ce que l'OS voit (Ruul READY, TikTok, warm-up, Slack, premier post), et ce que Join a noté", () => {
  assertEquals(etatChecklist({ signee: true, etapes: [] }, null), {
    contrat: true, ruul: false, tiktok: false, warmup: false, slack: false, premier_post: false,
  });
  assertEquals(etatChecklist({ signee: true, etapes: [{ etape: "tiktok", statut: "ok" }] }, null).tiktok, true);
  const os = osVide({ ruul_onboarding: "READY", warmup_started_at: "2026-11-27T10:00:00Z", slack: true, premier_post_at: "2026-11-30T10:00:00Z" });
  assertEquals(etatChecklist({ signee: true, etapes: [] }, os), { contrat: true, ruul: true, tiktok: true, warmup: true, slack: true, premier_post: true });
  assertEquals(etatChecklist({ signee: true, etapes: [] }, osVide({ ruul_ready_at: "2026-11-28T10:00:00Z" })).ruul, true);
  assertEquals(etatChecklist({ signee: true, etapes: [] }, osVide({ tiktok: true })).tiktok, true);
  // Une étape cochée le reste.
  assertEquals(etatChecklist({ signee: true, etapes: [{ etape: "slack", statut: "fait" }] }, osVide()).slack, true);
});

Deno.test("rappels : J+1, J+3, vendredi avant le lundi, premier post (lundi, J+1, J+3), Ruul le jeudi", () => {
  // Signé le mercredi 25/11 à 19 h (Paris), départ le lundi 30/11, France.
  const base = { signeAt: "2026-11-25T18:00:00Z", lundi: "2026-11-30", pays: "FR" };
  const rien: EtatChecklist = { contrat: true, ruul: false, tiktok: false, warmup: false, slack: false, premier_post: false };
  const a = (jour: string) => new Date(`${jour}T09:00:00Z`); // 10 h à Paris
  const cles = (jour: string, deja: string[] = [], faites = rien, o: Record<string, unknown> = {}) =>
    rappelsDus({ ...base, faites, deja, maintenant: a(jour), ...o }).map((d) => d.cle);
  assertEquals(cles("2026-11-25"), []); // le jour de la signature
  assertEquals(cles("2026-11-26"), ["rappel:tiktok:j1", "rappel:warmup:j1", "rappel:ruul:j1", "rappel:slack:j1"]);
  const j1 = cles("2026-11-26");
  assertEquals(cles("2026-11-27", j1), ["rappel:tiktok:vendredi:2026-11-30", "rappel:warmup:vendredi:2026-11-30", "rappel:ruul:vendredi:2026-11-30", "rappel:slack:vendredi:2026-11-30"]);
  const ven = [...j1, ...cles("2026-11-27", j1)];
  assertEquals(cles("2026-11-28", ven), ["rappel:tiktok:j3", "rappel:warmup:j3", "rappel:ruul:j3", "rappel:slack:j3"]);
  const j3 = [...ven, ...cles("2026-11-28", ven)];
  assertEquals(cles("2026-11-29", j3), []);
  // Une étape faite n'est plus rappelée.
  assertEquals(cles("2026-11-26", [], { ...rien, tiktok: true, warmup: true, slack: true }), ["rappel:ruul:j1"]);
  // Premier post : seulement warm-up lancé (sinon l'OS reporte le départ) et des posts prévus.
  const prets = { ...rien, tiktok: true, warmup: true, slack: true, ruul: true };
  assertEquals(cles("2026-11-30", j3), []);
  assertEquals(cles("2026-11-30", j3, prets), ["rappel:premier_post:lundi:2026-11-30"]);
  assertEquals(cles("2026-11-30", j3, prets, { postsPrevus: false }), []);
  assertEquals(cles("2026-12-01", j3, prets), ["rappel:premier_post:j1:2026-11-30"]);
  assertEquals(cles("2026-12-03", j3, prets), ["rappel:premier_post:j3:2026-11-30"]);
  assertEquals(cles("2026-12-03", j3, { ...prets, premier_post: true }), []);
  // Ruul pas READY après le départ : le jeudi (4 au plus), pas si la paie est reportée (l'OS en parle), et 3 jours après le 1er post.
  const ruulKo = { ...prets, ruul: false, premier_post: true };
  assertEquals(cles("2026-12-03", j3, ruulKo), ["rappel:ruul:jeudi:2026-12-03"]);
  assertEquals(cles("2026-12-03", j3, ruulKo, { paieReportee: true }), []);
  const quatre = [...j3, "rappel:ruul:jeudi:a", "rappel:ruul:jeudi:b", "rappel:ruul:jeudi:c", "rappel:ruul:jeudi:d"];
  assertEquals(cles("2026-12-03", quatre, ruulKo), []);
  assertEquals(cles("2026-12-04", j3, ruulKo, { premierPostAt: "2026-11-30T12:00:00Z" }), ["rappel:ruul:apres_post"]);
  // Départ reporté par l'OS (nouveau lundi) : un nouveau vendredi.
  assertEquals(rappelsDus({ ...base, lundi: "2026-12-07", faites: rien, deja: j3, maintenant: a("2026-12-04") }).map((d) => d.rang),
    ["vendredi:2026-12-07", "vendredi:2026-12-07", "vendredi:2026-12-07", "vendredi:2026-12-07"]);
});

Deno.test("rappels : le vendredi saute après un rappel la veille, jamais 3 rappels de suite (26/11)", () => {
  // Signé le mercredi 25/11, départ le lundi 30/11 : J+1 le jeudi 26.
  const base = { signeAt: "2026-11-25T18:00:00Z", lundi: "2026-11-30", pays: "FR" };
  const rien: EtatChecklist = { contrat: true, ruul: false, tiktok: false, warmup: false, slack: false, premier_post: false };
  const a = (jour: string) => new Date(`${jour}T09:00:00Z`);
  const cles = (jour: string, deja: string[], joursRappels: string[]) =>
    rappelsDus({ ...base, faites: rien, deja, joursRappels, maintenant: a(jour) }).map((d) => d.cle);
  const j1 = ["rappel:tiktok:j1", "rappel:warmup:j1", "rappel:ruul:j1", "rappel:slack:j1"];
  // Vendredi 27 : un rappel est parti jeudi 26 → rien.
  assertEquals(cles("2026-11-27", j1, ["2026-11-26"]), []);
  // Samedi 28 : J+3 et le rappel du vendredi, dans le même email (un seul rappel ce jour-là).
  const sam = cles("2026-11-28", j1, ["2026-11-26"]);
  assertEquals(sam.filter((c) => c.endsWith(":j3")).length, 4);
  assertEquals(sam.filter((c) => c.includes(":vendredi:2026-11-30")).length, 4);
  // Dimanche 29 : plus rien (tout est fait), même avec un rappel samedi.
  assertEquals(cles("2026-11-29", [...j1, ...sam], ["2026-11-26", "2026-11-28"]), []);
  // Pas de rappel la veille : le vendredi part comme avant.
  assertEquals(cles("2026-11-27", j1, ["2026-11-25"]).length, 4);
  // Un rappel l'avant-veille ne compte pas.
  assertEquals(cles("2026-11-27", j1, []).length, 4);
});

Deno.test("rappels : un email par jour (toutes les étapes), WhatsApp des relances de l'OS, jamais de mot interdit", () => {
  const dus = rappelsDus({
    signeAt: "2026-11-25T18:00:00Z", lundi: "2026-11-30", pays: "FR", deja: [], maintenant: new Date("2026-11-26T09:00:00Z"),
    faites: { contrat: true, ruul: false, tiktok: false, warmup: false, slack: false, premier_post: false },
  });
  const m = texteRappel(dus, { prenom: "Max", lundi: "Monday 30 November", limite: "Sunday 29 November", avantDepart: true, handle: "max.daily123", ruulEmail: "x@example.invalid" });
  assertEquals(m.objet, "Next step: create your TikTok account");
  for (const x of ["@max.daily123", "Start warmup", "x@example.invalid", LIEN_SLACK, "Sunday 29 November", "Monday 30 November"]) assert(m.corps.includes(x), x);
  assert(!/\b(bot|AI|automatic|automated)\b/i.test(`${m.objet} ${m.corps} ${m.bouton}`));
  assertEquals(typeWhatsappRappel(dus[0]), "warmup_start");
  assertEquals(typeWhatsappRappel({ etape: "ruul", rang: "j1", cle: "" }), "ruul_payment_setup");
  assertEquals(typeWhatsappRappel({ etape: "slack", rang: "j1", cle: "" }), null);
  assertEquals(typeWhatsappRappel({ etape: "premier_post", rang: "lundi:2026-11-30", cle: "" }), "start_posting_today");
  assertEquals(typeWhatsappRappel({ etape: "premier_post", rang: "j1:2026-11-30", cle: "" }), null);
  assertEquals(typeWhatsappRappel({ etape: "premier_post", rang: "j3:2026-11-30", cle: "" }), "no_posts_week");
  // 26/11 : sans @ de l'OS, aucun pseudo : les infos du compte sont sur le dashboard.
  const sans = texteRappel(dus, { prenom: "Max", lundi: "Monday 30 November", limite: "Sunday 29 November", avantDepart: true, handle: null });
  assert(!sans.corps.includes("@") || !/@[a-z0-9._]{2,}/.test(sans.corps.replace(/https?:\/\/\S+/g, "")), "aucun @ inventé");
  assert(sans.corps.includes("your TikTok details (username, name, photo and bio) are on your dashboard"));
  const debut = texteRappel([{ etape: "premier_post", rang: "lundi:2026-11-30", cle: "" }], { prenom: "Max", lundi: "", limite: "", avantDepart: false });
  assertEquals(debut.objet, "You start posting today");
  assert(!debut.corps.includes("Here's what's left"));
});

Deno.test("contrat : rappel du vendredi avant le lundi offert, une fois, pas le jour de l'acceptation", () => {
  const o = { decisionAt: "2026-11-25T10:00:00Z", lundi: "2026-11-30", faites: [] as string[], pays: "FR", dejaAujourdhui: false };
  assert(signatureVendrediDue({ ...o, maintenant: new Date("2026-11-27T10:00:00Z") }));
  assert(!signatureVendrediDue({ ...o, maintenant: new Date("2026-11-26T10:00:00Z") }));
  assert(!signatureVendrediDue({ ...o, faites: ["signature_vendredi"], maintenant: new Date("2026-11-27T10:00:00Z") }));
  assert(!signatureVendrediDue({ ...o, decisionAt: "2026-11-27T08:00:00Z", maintenant: new Date("2026-11-27T10:00:00Z") }));
  assert(texteMessage("signature_vendredi", { prenom: "A", lien: "x", lundi: "Monday 30 November", limite: "Sunday 29 November" }).corps.includes("Monday 30 November"));
});

Deno.test("bienvenue : avec l'invitation Ruul à part, une ligne courte à la place du guide", () => {
  const v = { prenom: "Léa", lien: "https://join.example", lundi: "Monday 30 November", limite: "Sunday 29 November", ruulEmail: "lea@example.com" };
  const avec = texteMessage("acces", { ...v, ruulParEmail: true });
  assert(avec.corps.includes("separate email") && avec.corps.includes("lea@example.com"));
  assert(!avec.corps.includes("app.ruul.io/register"));
  assert(texteMessage("acces", v).corps.includes("app.ruul.io/register"));
});
