import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  avecPiedWhatsApp, banniereActive, dateLocale, deciderRelance, type FaitsRelance, jourSemaineLocal, joursEntre, PHRASE_WHATSAPP_EMAIL,
  relancesDues,
} from "./whatsapp_relances.ts";

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
  assertEquals(relancesDues(f, JEUDI), ["warmup_reminder"]);
  assertEquals(relancesDues(f, MARDI), []);
  assertEquals(relancesDues({ ...f, cohorte_lundi: "2026-12-07" }, JEUDI), []);
  assertEquals(relancesDues({ ...f, warmup_started_at: "2026-11-25T10:00:00Z" }, JEUDI), []);
});

Deno.test("nudge du jeudi : 0 post ou moins de la moitié", () => {
  const f = faits({ cohorte_lundi: "2026-11-23", prevus_a_date: 8, publies_semaine: 0 });
  assertEquals(relancesDues(f, JEUDI), ["no_posts_this_week"]);
  assertEquals(relancesDues({ ...f, publies_semaine: 3 }, JEUDI), ["no_posts_this_week"]);
  assertEquals(relancesDues({ ...f, publies_semaine: 4 }, JEUDI), []);
  assertEquals(relancesDues({ ...f, prevus_a_date: 0 }, JEUDI), []);
  assertEquals(relancesDues(f, MARDI), []);
  assertEquals(relancesDues({ ...f, cohorte_lundi: "2026-11-30" }, JEUDI), []); // cohorte pas commencée
});

Deno.test("Ruul pas READY 3 jours après le premier post", () => {
  const f = faits({ premier_post_at: "2026-11-20T10:00:00Z", ruul_onboarding: "PENDING_KYC", ruul_ready_at: null });
  assertEquals(relancesDues(f, MARDI), ["ruul_setup"]);
  assertEquals(relancesDues({ ...f, premier_post_at: "2026-11-23T10:00:00Z" }, MARDI), []);
  assertEquals(relancesDues({ ...f, canal_paie: "upwork" }, MARDI), []);
  assertEquals(relancesDues({ ...f, deja: ["relance:ruul_setup"] }, MARDI), []);
  assertEquals(deciderRelance(f, { modeAutorise: true, maintenant: MARDI })?.modele.variables[1], "https://sophia-marketing-orga.vercel.app/ruul");
});

Deno.test("une seule relance par jour, dans l'ordre de priorité", () => {
  const f = faits({
    cohorte_lundi: "2026-11-23", prevus_a_date: 4, publies_semaine: 0,
    premier_post_at: "2026-11-20T10:00:00Z", ruul_onboarding: "PENDING_KYC", ruul_ready_at: null,
  });
  assertEquals(relancesDues(f, JEUDI), ["ruul_setup", "no_posts_this_week"]);
  assertEquals(deciderRelance(f, { modeAutorise: true, maintenant: JEUDI })?.type, "ruul_setup");
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

Deno.test("pied des emails : rien ne change tant que le réglage est éteint", () => {
  assertEquals(avecPiedWhatsApp("Hello", false), "Hello");
  assertEquals(avecPiedWhatsApp("Hello", true), `Hello\n\n${PHRASE_WHATSAPP_EMAIL}`);
  assertEquals(avecPiedWhatsApp(`Hello\n\n${PHRASE_WHATSAPP_EMAIL}`, true), `Hello\n\n${PHRASE_WHATSAPP_EMAIL}`);
  assertEquals(banniereActive(false), false);
  assertEquals(banniereActive(null), false);
  assertEquals(banniereActive(true), true);
  assertEquals(banniereActive({ actif: true }), true);
});
