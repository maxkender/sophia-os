import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { dansFenetre, echeance, emailParcours, type EtatParcours, jourLundi, lignesPointSoirRuul, prochainEnvoi } from "./parcours_ruul.ts";

const base = (x: Partial<EtatParcours> = {}): EtatParcours => ({
  poster_id: "p", prenom: "Eduarda", login: "eduardas@sophia.com", email: "e@gmail.com", cohorte_lundi: "2026-11-16",
  cree_at: "2026-11-11T08:20:00Z", premiere_connexion_at: null, handle: "miguel.disciplina984", tiktok_existe: null,
  warmup_started_at: null, abonnements: null, slack_user_id: null, ruul_statut: "invite", ruul_compte: null,
  ruul_email_a_at: null, ruul_email_b_at: null, relances_stop_at: null, ruul_jeton: "j", posts: 0, envois: [], ...x,
});
const jeudi = new Date("2026-11-12T10:00:00Z");

Deno.test("parcours : bienvenue d'abord (si l'interrupteur est allumé), une seule fois", () => {
  assertEquals(prochainEnvoi(base(), jeudi, { bienvenue: true, bienvenueDepuis: "2026-11-10T00:00:00Z" })?.type, "bienvenue");
  // Jamais aux posteurs déjà en place quand la bienvenue est allumée.
  assertEquals(prochainEnvoi(base(), jeudi, { bienvenue: true, bienvenueDepuis: "2026-11-12T00:00:00Z" })?.type, "jamais_connecte");
  assertEquals(prochainEnvoi(base(), jeudi, { bienvenue: true })?.type, "jamais_connecte");
  assertEquals(prochainEnvoi(base(), jeudi, { bienvenue: false })?.type, "jamais_connecte");
  const deja = base({ envois: [{ cle: "bienvenue", type: "bienvenue", at: "2026-11-10T10:00:00Z", ok: true }] });
  assertEquals(prochainEnvoi(deja, jeudi, { bienvenue: true, bienvenueDepuis: "2026-11-10T00:00:00Z" })?.type, "jamais_connecte");
});

Deno.test("parcours : jamais 2 emails le même jour, STOP respecté", () => {
  const ajd = base({ envois: [{ cle: "bienvenue", type: "bienvenue", at: "2026-11-12T07:00:00Z", ok: true }] });
  assertEquals(prochainEnvoi(ajd, jeudi, { bienvenue: true }), null);
  assertEquals(prochainEnvoi(base({ ruul_email_a_at: "2026-11-12T08:00:00Z" }), jeudi, { bienvenue: false }), null);
  assertEquals(prochainEnvoi(base({ relances_stop_at: "2026-11-12T00:00:00Z" }), jeudi, { bienvenue: true }), null);
});

Deno.test("parcours : une relance par étape (TikTok, warm-up, Slack)", () => {
  const co = { premiere_connexion_at: "2026-11-10T10:00:00Z" };
  assertEquals(prochainEnvoi(base(co), jeudi, { bienvenue: false })?.type, "tiktok");
  const tk = { ...co, tiktok_existe: true, envois: [{ cle: "tiktok", type: "tiktok", at: "2026-11-11T09:00:00Z", ok: true }] };
  assertEquals(prochainEnvoi(base(tk), jeudi, { bienvenue: false })?.type, "warmup");
  const wu = { ...tk, warmup_started_at: "2026-11-11T10:00:00Z", abonnements: 6 };
  assertEquals(prochainEnvoi(base(wu), jeudi, { bienvenue: false })?.type, "slack");
  const tout = { ...wu, slack_user_id: "U1", ruul_statut: "pret" };
  assertEquals(prochainEnvoi(base(tout), jeudi, { bienvenue: false }), null);
});

Deno.test("parcours : Ruul pas prêt tous les 2 jours, 6 au plus, puis une carte", () => {
  const ruul = { premiere_connexion_at: "2026-11-01T10:00:00Z", tiktok_existe: true, warmup_started_at: "2026-11-01T11:00:00Z", abonnements: 5, slack_user_id: "U", ruul_email_a_at: "2026-11-09T10:00:00Z" };
  assertEquals(prochainEnvoi(base(ruul), jeudi, { bienvenue: false })?.cle, "ruul_1");
  const r1 = { ...ruul, envois: [{ cle: "ruul_1", type: "ruul", at: "2026-11-11T10:00:00Z", ok: true }] };
  assertEquals(prochainEnvoi(base(r1), jeudi, { bienvenue: false }), null);
  const six = { ...ruul, envois: [1, 2, 3, 4, 5, 6].map((i) => ({ cle: `ruul_${i}`, type: "ruul", at: `2026-11-0${i}T09:00:00Z`, ok: true })) };
  assertEquals(prochainEnvoi(base(six), jeudi, { bienvenue: false })?.type, "carte_ruul");
});

Deno.test("parcours : dimanche 20 h « you start tomorrow » si prêt ; lundi, pas prêt → report d'une semaine", () => {
  const pret = { premiere_connexion_at: "2026-11-12T10:00:00Z", tiktok_existe: true, warmup_started_at: "2026-11-12T11:00:00Z", abonnements: 5, slack_user_id: "U", ruul_statut: "pret" };
  assertEquals(prochainEnvoi(base(pret), new Date("2026-11-15T19:30:00Z"), { bienvenue: false })?.cle, "demain:2026-11-16");
  assertEquals(prochainEnvoi(base(pret), new Date("2026-11-15T17:00:00Z"), { bienvenue: false }), null);
  const r = prochainEnvoi(base({ premiere_connexion_at: "2026-11-12T10:00:00Z" }), new Date("2026-11-16T05:00:00Z"), { bienvenue: false });
  assertEquals(r?.type, "report");
  assertEquals(r?.lundi, "2026-11-23");
});

Deno.test("parcours : sans lundi de début, pas de relance d'étape (mais la désactivation et Ruul restent)", () => {
  const ancien = base({ cohorte_lundi: null, cree_at: "2026-11-05T08:00:00Z", premiere_connexion_at: "2026-11-05T09:00:00Z" });
  assertEquals(prochainEnvoi(ancien, jeudi, { bienvenue: false }), null);
  assertEquals(prochainEnvoi(base({ cohorte_lundi: null, cree_at: "2026-10-18T08:00:00Z" }), jeudi, { bienvenue: false })?.type, "desactivation");
});

Deno.test("parcours : 14 jours sans aucune activité → désactivation", () => {
  assertEquals(prochainEnvoi(base({ cree_at: "2026-10-28T08:00:00Z", cohorte_lundi: "2026-11-23" }), jeudi, { bienvenue: false })?.type, "desactivation");
  assertEquals(prochainEnvoi(base({ cree_at: "2026-10-28T08:00:00Z", cohorte_lundi: "2026-11-23", premiere_connexion_at: "2026-10-29T08:00:00Z" }), jeudi, { bienvenue: false })?.type, "tiktok");
});

Deno.test("emails : anglais, sans « bot », mot de passe 12345678, dates de Paris", () => {
  const d = { prenom: "Eduarda", login: "eduardas@sophia.com", motDePasse: "12345678", dashboard: "https://os", handle: "miguel.x", slack: "https://slack", cohorte_lundi: "2026-11-16", ruul_email: "e@gmail.com", abonnements: 2 };
  const b = emailParcours("bienvenue", d, "https://pret");
  assertStringIncludes(b.corps, "Password: 12345678");
  assertStringIncludes(b.corps, "You start on Monday, 16 November.");
  assertStringIncludes(b.corps, "Before Sunday, 15 November at midnight (Paris time)");
  assertEquals(jourLundi("2026-11-16"), "Monday, 16 November");
  assertEquals(echeance("2026-11-16"), "Sunday, 15 November at midnight (Paris time)");
  for (const t of ["bienvenue", "jamais_connecte", "tiktok", "warmup", "slack", "ruul", "report", "demain", "desactivation"] as const) {
    const e = emailParcours(t, { ...d, lundi: "2026-11-23" }, "https://pret");
    assert(!/\b(bot|AI|automatic|automated|STOP)\b/i.test(`${e.objet} ${e.corps}`), t);
  }
  assertEquals(emailParcours("ruul", { ...d, ruul_compte: "active" }, "https://pret").bouton?.texte, "It's done");
  // 13/11 (Max) : « Invited » : il s'inscrit lui-même sur app.ruul.io avec l'email exact.
  const inv = emailParcours("ruul", { ...d, ruul_compte: "invited" }, "https://pret");
  assertEquals(inv.bouton, { texte: "Open Ruul", lien: "https://app.ruul.io/register" });
  // 13/11 (Max) : le guide Ruul pas à pas, avec l'email Ruul exact et la date limite.
  assertStringIncludes(inv.corps, "Set up Ruul — required to get paid (5 minutes)");
  assertStringIncludes(inv.corps, "Do it before your first post: before Sunday, 15 November at midnight (Paris time).");
  assertStringIncludes(inv.corps, "1. Go to app.ruul.io/register\n2. Choose « Contractor » (not Business).");
  assertStringIncludes(inv.corps, "   Email: use exactly e@gmail.com (the one in your dashboard).");
  assertStringIncludes(inv.corps, "7. Once inside Ruul: go to « Payment accounts » → « Add my ID » → follow the steps (ID + bank details).");
  assertStringIncludes(inv.corps, "Problem with Ruul? Click Help in your dashboard.");
  // La bienvenue porte le même guide et le bouton Open Ruul.
  const bv = emailParcours("bienvenue", d, "https://pret");
  assertStringIncludes(bv.corps, "Set up Ruul — required to get paid (5 minutes)");
  assertEquals(bv.bouton, { texte: "Open Ruul", lien: "https://app.ruul.io/register" });
  assert(!bv.corps.includes("within 24 hours you'll receive an invitation"));
});

Deno.test("point du soir Ruul : 5 lignes (prêts, emails par type, désactivés, erreurs, à faire)", () => {
  const pret = base({ premiere_connexion_at: "2026-11-10T10:00:00Z", tiktok_existe: true, warmup_started_at: "2026-11-10T11:00:00Z", abonnements: 6 });
  const l = lignesPointSoirRuul({
    etats: [pret, base()],
    envois: [{ type: "tiktok", ok: true }, { type: "tiktok", ok: true }, { type: "desactivation", ok: true }, { type: "ruul", ok: false }, { type: "carte_ruul", ok: true }],
    arrets: [{ source: "manuel" }, { source: "je_ne_veux_plus" }],
  });
  assertEquals(l.length, 5);
  assertEquals(l[0], "Ruul : 1 prêts · 1 pas prêts (dont 2 sans Ruul fini)");
  assertEquals(l[1], "• Emails envoyés : TikTok 2 · désactivation 1");
  assertEquals(l[2], "• Désactivés : 1 14 jours inactifs · 1 arrêtés par le posteur");
  assertEquals(l[3], "• Erreurs : 1");
  assertStringIncludes(l[4], "1 carte « Ruul jamais fini »");
  assertStringIncludes(l[4], "1 envoi en erreur");
  assertEquals(lignesPointSoirRuul({ etats: [], envois: [], arrets: [] })[4], "• À faire : rien");
});

Deno.test("13/11 : emails entre 9 h et 20 h (Paris), sauf « you start tomorrow » et la carte", () => {
  const nuit = new Date("2026-11-12T23:07:00Z"); // 0 h 07 à Paris
  const matin = new Date("2026-11-13T08:07:00Z"); // 9 h 07
  const soir = new Date("2026-11-13T19:07:00Z"); // 20 h 07
  assertEquals(dansFenetre(nuit, "jamais_connecte"), false);
  assertEquals(dansFenetre(matin, "jamais_connecte"), true);
  assertEquals(dansFenetre(soir, "tiktok"), false);
  assertEquals(dansFenetre(soir, "demain"), true);
  assertEquals(dansFenetre(nuit, "carte_ruul"), true);
});

Deno.test("v2 : A (Invited) puis B (Active) par le même moteur, une fois chacun ; jamais si Ruul est fini", () => {
  const invite = base({ ruul_compte: "invited", premiere_connexion_at: "2026-11-11T09:00:00Z" });
  assertEquals(prochainEnvoi(invite, jeudi, { bienvenue: false, v2: true })?.type, "invite_a");
  assertEquals(prochainEnvoi(invite, jeudi, { bienvenue: false })?.type, "tiktok");
  const actif = base({ ruul_compte: "active", ruul_email_a_at: "2026-11-10T09:00:00Z", premiere_connexion_at: "2026-11-11T09:00:00Z" });
  assertEquals(prochainEnvoi(actif, jeudi, { bienvenue: false, v2: true })?.type, "invite_b");
  assertEquals(prochainEnvoi(base({ ruul_compte: "active", ruul_statut: "pret" }), jeudi, { bienvenue: false, v2: true })?.type === "invite_b", false);
});

Deno.test("v2 : report avec sa checklist personnelle ; A, B, arrêt sans mot interdit", () => {
  const d = { prenom: "Ana", login: "anas@sophia.com", motDePasse: "x", dashboard: "https://os", handle: "ana.x", slack: "https://slack", cohorte_lundi: "2026-11-16", ruul_email: "a@b.c", abonnements: 2, lundi: "2026-11-23",
    faites: { connexion: true, tiktok: true, warmup: false, slack: false } };
  const r = emailParcours("report", d, "https://pret");
  assert(!r.corps.includes("Log in to your dashboard"));
  assertStringIncludes(r.corps, "1. Click « Start warmup »");
  assertStringIncludes(r.corps, "2. Join Slack: https://slack");
  for (const t of ["invite_a", "invite_b", "arret"] as const) {
    const e = emailParcours(t, d, "https://pret");
    assert(!/\b(bot|AI|automatic|automated|STOP)\b/i.test(`${e.objet} ${e.corps}`), t);
  }
  const a = emailParcours("invite_a", d, "https://pret");
  assertEquals(a.bouton, { texte: "Open Ruul", lien: "https://app.ruul.io/register" });
  assertStringIncludes(a.corps, "Email: use exactly a@b.c (the one in your dashboard).");
  assert(!a.corps.includes("Open the email from Ruul"));
});

Deno.test("13/11 : le samedi, « Invited » qui a posté → « Finish your Ruul account before Monday », une fois par samedi", () => {
  const samedi = new Date("2026-11-14T10:07:00Z"); // 11 h 07 à Paris
  const inv = base({ ruul_compte: "invited", ruul_email_a_at: "2026-11-10T09:00:00Z", premiere_connexion_at: "2026-11-11T09:00:00Z", posts: 4 });
  assertEquals(prochainEnvoi(inv, samedi, { bienvenue: false, v2: true }), { type: "samedi_ruul", cle: "samedi_ruul:2026-11-14" });
  // Pas sans v2, pas sans post, pas un « Active », pas deux fois le même samedi, pas un autre jour.
  assertEquals(prochainEnvoi(inv, samedi, { bienvenue: false })?.type === "samedi_ruul", false);
  assertEquals(prochainEnvoi({ ...inv, posts: 0 }, samedi, { bienvenue: false, v2: true })?.type === "samedi_ruul", false);
  assertEquals(prochainEnvoi({ ...inv, ruul_compte: "active", ruul_email_b_at: "2026-11-10T09:00:00Z" }, samedi, { bienvenue: false, v2: true })?.type === "samedi_ruul", false);
  const fait = { ...inv, envois: [{ cle: "samedi_ruul:2026-11-14", type: "samedi_ruul", at: "2026-11-13T10:00:00Z", ok: true }] };
  assertEquals(prochainEnvoi(fait, samedi, { bienvenue: false, v2: true })?.type === "samedi_ruul", false);
  assertEquals(prochainEnvoi(inv, jeudi, { bienvenue: false, v2: true })?.type === "samedi_ruul", false);
  const d = { prenom: "Ana", login: null, motDePasse: "x", dashboard: "https://os", handle: null, slack: "https://slack", cohorte_lundi: null, ruul_email: "a@b.c", abonnements: null };
  const e = emailParcours("samedi_ruul", d, "https://pret");
  assertEquals(e.objet, "Finish your Ruul account before Monday to be paid this week");
  assertStringIncludes(e.corps, "Finish your Ruul account before Monday to be paid this week.");
  assertStringIncludes(e.corps, "Email: use exactly a@b.c (the one in your dashboard).");
  assert(!e.corps.includes("Do it before your first post"));
  assertEquals(e.bouton?.texte, "Open Ruul");
  assert(!/\b(bot|AI|automatic|automated|STOP)\b/i.test(`${e.objet} ${e.corps}`));
});

Deno.test("0698 : identité refusée une fois → refaire ; deux fois → fin de collaboration (v2 seulement)", () => {
  const un = base({ identite: "declined", identite_refus: 1, ruul_compte: "active", ruul_email_b_at: "2026-11-10T09:00:00Z" });
  assertEquals(prochainEnvoi(un, jeudi, { bienvenue: false, v2: true })?.type, "identite_refusee");
  assertEquals(prochainEnvoi(un, jeudi, { bienvenue: false })?.type === "identite_refusee", false);
  const deux = base({ identite: "declined", identite_refus: 2, envois: [{ cle: "identite_refus_1", type: "identite_refusee", at: "2026-11-05T09:00:00Z", ok: true }] });
  assertEquals(prochainEnvoi(deux, jeudi, { bienvenue: false, v2: true })?.type, "identite_fin");
  const d = { prenom: "Ana", login: "x", motDePasse: "x", dashboard: "https://os", handle: null, slack: "s", cohorte_lundi: null, ruul_email: null, abonnements: null };
  for (const t of ["identite_refusee", "identite_fin"] as const) {
    const e = emailParcours(t, d, "https://pret");
    assert(!/\b(bot|AI|automatic|automated|STOP)\b/i.test(`${e.objet} ${e.corps}`), t);
  }
});
