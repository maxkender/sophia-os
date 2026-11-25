import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  avecPiedWhatsApp, banniereActive, dateLocale, deciderRelance, echeanceTexte, type FaitsRelance, jourSemaineLocal, joursEntre,
  NICHE_GENERIQUE, PHRASE_WHATSAPP_EMAIL, relancesDues, VIDEO_GUIDE_WA,
} from "./whatsapp_relances.ts";
import { VIDEO_GUIDE_URL } from "./join.ts";

// Jeudi 26/11/2026, 13 h à Paris.
const JEUDI = new Date("2026-11-26T12:00:00Z");
// Mardi 24/11/2026, 13 h à Paris.
const MARDI = new Date("2026-11-24T12:00:00Z");

function faits(o: Partial<FaitsRelance> = {}): FaitsRelance {
  return {
    contact_id: "c1", poster_id: "p1", site_id: null, e164: "+33612345678", optin_at: "2026-11-01T10:00:00Z", optout_at: null,
    prenom: "Ana Maria", pays: "FR", accepte_at: null, signe_at: null, desinscrit_at: null, expire_at: null, statut_site: null,
    is_active: true, premiere_connexion_at: "2026-11-10T10:00:00Z", cohorte_lundi: null, canal_paie: "ruul",
    ruul_onboarding: "READY", ruul_ready_at: "2026-11-10T10:00:00Z", warmup_started_at: "2026-11-10T10:00:00Z", premier_post_at: null,
    prevus_a_date: 0, publies_semaine: 0, arrete: false, absent: false, panne: false, envois_jour: 0, envois_semaine: 0, deja: [],
    ...o,
  };
}

Deno.test("dates locales", () => {
  assertEquals(dateLocale("FR", JEUDI), "2026-11-26");
  assertEquals(jourSemaineLocal("FR", JEUDI), 4);
  assertEquals(jourSemaineLocal("FR", MARDI), 2);
  assertEquals(joursEntre("2026-11-26", "2026-11-30"), 4);
  // 23 h 30 UTC le mercredi = jeudi à Paris.
  assertEquals(jourSemaineLocal("FR", new Date("2026-11-25T23:30:00Z")), 4);
});

Deno.test("rien à relancer : posteur à jour", () => {
  assertEquals(relancesDues(faits(), JEUDI), []);
  assertEquals(deciderRelance(faits(), { modeAutorise: true, maintenant: JEUDI }), null);
});

Deno.test("contrat pas signé : J+1 et J+3 seulement", () => {
  const cand = (accepte: string) => faits({ poster_id: null, site_id: "s1", accepte_at: accepte, premiere_connexion_at: null });
  assertEquals(relancesDues(cand("2026-11-23T18:00:00Z"), MARDI), ["contract_to_sign"]); // J+1
  assertEquals(relancesDues(cand("2026-11-21T08:00:00Z"), MARDI), ["contract_to_sign"]); // J+3
  assertEquals(relancesDues(cand("2026-11-22T08:00:00Z"), MARDI), []); // J+2
  assertEquals(relancesDues(cand("2026-11-24T06:00:00Z"), MARDI), []); // J+0
  assertEquals(relancesDues({ ...cand("2026-11-23T18:00:00Z"), signe_at: "2026-11-24T08:00:00Z" }, MARDI), []);
  assertEquals(relancesDues({ ...cand("2026-11-23T18:00:00Z"), desinscrit_at: "2026-11-24T08:00:00Z" }, MARDI), []);
  assertEquals(relancesDues({ ...cand("2026-11-23T18:00:00Z"), expire_at: "2026-11-24T08:00:00Z" }, MARDI), []);
  const d = deciderRelance(cand("2026-11-23T18:00:00Z"), { modeAutorise: true, maintenant: MARDI });
  assertEquals(d?.cle, "relance:contract_to_sign:site-s1:2026-11-24");
  assertEquals(d?.modele, { nom: "contract_to_sign", langue: "en", variables: ["Ana", "https://vik-studios-creators.com"] });
  assertEquals(d?.refus, null);
});

Deno.test("jamais connecté 24 h après la signature : une fois", () => {
  const f = faits({ signe_at: "2026-11-23T10:00:00Z", premiere_connexion_at: null });
  assertEquals(relancesDues(f, MARDI), ["account_ready"]);
  assertEquals(relancesDues({ ...f, signe_at: "2026-11-24T08:00:00Z" }, MARDI), []); // moins de 24 h
  assertEquals(relancesDues({ ...f, deja: ["relance:account_ready"] }, MARDI), []);
  assertEquals(relancesDues({ ...f, signe_at: "2026-11-01T08:00:00Z" }, MARDI), []); // trop ancien
});

Deno.test("warm-up pas lancé le jeudi avant la cohorte", () => {
  const f = faits({ cohorte_lundi: "2026-11-30", warmup_started_at: null });
  assertEquals(relancesDues(f, JEUDI), ["warmup_start"]);
  assertEquals(relancesDues(f, MARDI), []);
  assertEquals(relancesDues({ ...f, cohorte_lundi: "2026-12-07" }, JEUDI), []);
  assertEquals(relancesDues({ ...f, warmup_started_at: "2026-11-25T10:00:00Z" }, JEUDI), []);
});

Deno.test("nudge du jeudi : 0 post ou moins de la moitié", () => {
  const f = faits({ cohorte_lundi: "2026-11-23", prevus_a_date: 8, publies_semaine: 0 });
  assertEquals(relancesDues(f, JEUDI), ["no_posts_week"]);
  assertEquals(relancesDues({ ...f, publies_semaine: 3 }, JEUDI), ["no_posts_week"]);
  assertEquals(relancesDues({ ...f, publies_semaine: 4 }, JEUDI), []);
  assertEquals(relancesDues({ ...f, prevus_a_date: 0 }, JEUDI), []);
  assertEquals(relancesDues(f, MARDI), []);
  assertEquals(relancesDues({ ...f, cohorte_lundi: "2026-11-30" }, JEUDI), []); // cohorte pas commencée
});

Deno.test("Ruul pas READY 3 jours après le premier post", () => {
  const f = faits({ premier_post_at: "2026-11-20T10:00:00Z", ruul_onboarding: "PENDING_KYC", ruul_ready_at: null });
  assertEquals(relancesDues(f, MARDI), ["ruul_payment_setup"]);
  assertEquals(relancesDues({ ...f, premier_post_at: "2026-11-23T10:00:00Z" }, MARDI), []);
  assertEquals(relancesDues({ ...f, canal_paie: "upwork" }, MARDI), []);
  assertEquals(relancesDues({ ...f, deja: ["relance:ruul_setup"] }, MARDI), []);
  assertEquals(deciderRelance(f, { modeAutorise: true, maintenant: MARDI })?.modele, { nom: "ruul_payment_setup", langue: "en", variables: ["Ana"] });
  assertEquals(relancesDues({ ...f, deja: ["relance:ruul_payment_setup"] }, MARDI), []);
  // Repli sur l'ancien modèle s'il n'est pas approuvé.
  assertEquals(
    deciderRelance(f, { modeAutorise: true, maintenant: MARDI, approuves: new Set(["ruul_setup"]) })?.modele?.variables[1],
    "https://sophia-marketing-orga.vercel.app/ruul",
  );
});

Deno.test("une seule relance par jour, dans l'ordre de priorité", () => {
  const f = faits({
    cohorte_lundi: "2026-11-23", prevus_a_date: 4, publies_semaine: 0,
    premier_post_at: "2026-11-20T10:00:00Z", ruul_onboarding: "PENDING_KYC", ruul_ready_at: null,
  });
  assertEquals(relancesDues(f, JEUDI), ["ruul_payment_setup", "no_posts_week"]);
  assertEquals(deciderRelance(f, { modeAutorise: true, maintenant: JEUDI })?.type, "ruul_payment_setup");
});

Deno.test("garde-fous", () => {
  const f = faits({ signe_at: "2026-11-23T10:00:00Z", premiere_connexion_at: null });
  const refus = (o: Partial<FaitsRelance>, modeAutorise = true, maintenant = MARDI) =>
    deciderRelance({ ...f, ...o }, { modeAutorise, maintenant })?.refus;
  assertEquals(refus({}), null);
  assertEquals(refus({}, false), "mode test : numéro non autorisé");
  assertEquals(refus({ optin_at: null }), "pas d'accord WhatsApp");
  assertEquals(refus({ optout_at: "2026-11-20T10:00:00Z" }), "pas d'accord WhatsApp");
  assertEquals(refus({ arrete: true }), "posteur arrêté ou killé");
  assertEquals(refus({ absent: true }), "absence déclarée");
  assertEquals(refus({ panne: true }), "jour de panne de notre côté");
  assertEquals(refus({ envois_jour: 1 }), "déjà 1 message WhatsApp aujourd'hui");
  assertEquals(refus({ envois_semaine: 4 }), "déjà 4 messages WhatsApp cette semaine");
  // 22 h à Paris.
  assertEquals(refus({}, true, new Date("2026-11-24T21:00:00Z")), "hors 9 h – 21 h (heure du posteur)");
  // Pays inconnu de la fiche : l'indicatif du numéro (+381 → Belgrade).
  assert(deciderRelance({ ...f, pays: null, e164: "+381641234567" }, { modeAutorise: true, maintenant: MARDI }));
});

Deno.test("la vidéo guide est la même que celle de Join", () => assertEquals(VIDEO_GUIDE_WA, VIDEO_GUIDE_URL));

Deno.test("warm-up : la niche, ou un texte générique", () => {
  const f = faits({ cohorte_lundi: "2026-11-30", warmup_started_at: null });
  const d = deciderRelance(f, { modeAutorise: true, maintenant: JEUDI });
  assertEquals(d?.modele?.variables, ["Ana", "Monday 30 November", NICHE_GENERIQUE, "Sunday 29 November at midnight (Paris time)"]);
  assertEquals(deciderRelance({ ...f, niche: "studying" }, { modeAutorise: true, maintenant: JEUDI })?.modele?.variables[2], "studying");
  assertEquals(
    deciderRelance(f, { modeAutorise: true, maintenant: JEUDI, approuves: new Set(["warmup_reminder"]) })?.modele?.nom, "warmup_reminder",
  );
  assertEquals(relancesDues({ ...f, deja: ["relance:warmup_reminder"] }, JEUDI), []);
  assertEquals(echeanceTexte("2026-11-30"), "Sunday 29 November at midnight (Paris time)");
});

Deno.test("bienvenue hors Join : une fois, avant le lundi, jamais pour Join", () => {
  const f = faits({ cohorte_lundi: "2026-11-30", warmup_started_at: null, handle: "ana.study" });
  const d = deciderRelance(f, { modeAutorise: true, maintenant: MARDI });
  assertEquals(d?.type, "welcome_start");
  assertEquals(d?.cle, "welcome:p1");
  assertEquals(d?.modele?.variables, ["Ana", "Monday 30 November", "Sunday 29 November at midnight (Paris time)", "ana.study", VIDEO_GUIDE_WA]);
  assertEquals(relancesDues({ ...f, statut_site: "join_signed" }, MARDI), []);
  assertEquals(relancesDues({ ...f, deja: ["relance:welcome_start"] }, MARDI), []);
  assertEquals(relancesDues({ ...f, handle: null }, MARDI), []);
  assertEquals(relancesDues({ ...f, cohorte_lundi: "2026-11-23" }, MARDI), []);
  assertEquals(deciderRelance(f, { modeAutorise: true, maintenant: MARDI, approuves: new Set(["account_ready"]) })?.modele?.nom, "account_ready");
});

Deno.test("le lundi de début : prêt, des posts du jour, une fois", () => {
  const LUNDI = new Date("2026-11-30T09:00:00Z");
  const f = faits({ cohorte_lundi: "2026-11-30", prevus_a_date: 2, warmup_fini: true, handle: "ana.study" });
  assertEquals(relancesDues(f, LUNDI), ["start_posting_today"]);
  assertEquals(deciderRelance(f, { modeAutorise: true, maintenant: LUNDI })?.modele?.variables, ["Ana", VIDEO_GUIDE_WA]);
  assertEquals(relancesDues({ ...f, warmup_fini: false }, LUNDI), []);
  assertEquals(relancesDues({ ...f, prevus_a_date: 0 }, LUNDI), []);
  assertEquals(relancesDues({ ...f, premier_post_at: "2026-11-30T08:00:00Z" }, LUNDI), []);
  assertEquals(relancesDues({ ...f, deja: ["relance:start_posting_today"] }, LUNDI), []);
  assertEquals(relancesDues(f, MARDI), []);
  // Pas approuvé et pas de repli : refusé, rien ne part.
  assertEquals(deciderRelance(f, { modeAutorise: true, maintenant: LUNDI, approuves: new Set() })?.refus, "modèle pas approuvé chez Meta");
});

Deno.test("pied des emails : rien ne change tant que le réglage est éteint", () => {
  assertEquals(avecPiedWhatsApp("Hello", false), "Hello");
  assertEquals(avecPiedWhatsApp("Hello", true), `Hello\n\n${PHRASE_WHATSAPP_EMAIL}`);
  assertEquals(avecPiedWhatsApp(`Hello\n\n${PHRASE_WHATSAPP_EMAIL}`, true), `Hello\n\n${PHRASE_WHATSAPP_EMAIL}`);
  assertEquals(banniereActive(false), false);
  assertEquals(banniereActive(null), false);
  assertEquals(banniereActive(true), true);
  assertEquals(banniereActive({ actif: true }), true);
});

Deno.test("25/11 : la décision porte la langue du posteur ; le modèle et ses variables restent ceux de l'anglais", () => {
  const f = faits({ premier_post_at: "2026-11-20T10:00:00Z", ruul_onboarding: "PENDING_KYC", ruul_ready_at: null });
  assertEquals(deciderRelance(f, { modeAutorise: true, maintenant: MARDI })?.langueCible, null);
  const d = deciderRelance({ ...f, langue: "pt-BR" }, { modeAutorise: true, maintenant: MARDI });
  assertEquals(d?.langueCible, "pt-BR");
  assertEquals(d?.modele, { nom: "ruul_payment_setup", langue: "en", variables: ["Ana"] });
  assertEquals(deciderRelance({ ...f, langue: "  " }, { modeAutorise: true, maintenant: MARDI })?.langueCible, null);
});

Deno.test("25/11 une seule voix : un posteur créé par Join n'a pas les relances de la checklist de Join", () => {
  const LUNDI = new Date("2026-11-30T09:00:00Z");
  const join = (o: Partial<FaitsRelance>) => faits({ statut_site: "join_signed", ...o });
  // warm-up pas lancé le jeudi avant le lundi
  assertEquals(relancesDues(faits({ cohorte_lundi: "2026-11-30", warmup_started_at: null }), JEUDI), ["warmup_start"]);
  assertEquals(relancesDues(join({ cohorte_lundi: "2026-11-30", warmup_started_at: null }), JEUDI), []);
  // le lundi de début
  const debut = { cohorte_lundi: "2026-11-30", prevus_a_date: 2, warmup_fini: true, handle: "ana.study" };
  assertEquals(relancesDues(faits(debut), LUNDI), ["start_posting_today"]);
  assertEquals(relancesDues(join(debut), LUNDI), []);
  // Ruul pas READY 3 jours après le premier post
  const ruul = { ruul_onboarding: "PENDING_KYC", ruul_ready_at: null, premier_post_at: "2026-11-22T10:00:00Z" };
  assertEquals(relancesDues(faits(ruul), JEUDI), ["ruul_payment_setup"]);
  assertEquals(relancesDues(join(ruul), JEUDI), []);
  // no_posts_week : à Join tant qu'il n'a jamais posté, à l'OS ensuite
  const semaine = { cohorte_lundi: "2026-11-23", prevus_a_date: 6, publies_semaine: 0 };
  assertEquals(relancesDues(join(semaine), JEUDI), []);
  assertEquals(relancesDues(join({ ...semaine, premier_post_at: "2026-11-23T10:00:00Z" }), JEUDI), ["no_posts_week"]);
  // ce qui n'est pas la checklist ne change pas (jamais connecté)
  assertEquals(relancesDues(join({ signe_at: "2026-11-23T10:00:00Z", premiere_connexion_at: null }), MARDI), ["account_ready"]);
});
