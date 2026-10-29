/** Système du 2 nov., partie B : les 4 étapes et le Kill à 48 h, sans réseau. */
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  canalEtape,
  debutCohorte,
  DELAIS_ACCUEIL_DEFAUT as D,
  deciderEtape,
  envoiEtape,
  etapeRouge,
  etatsAccueil,
  joursAvantLundi,
  killEnCours,
  nuitDuRouge,
  type RecrueAccueil,
  texteCeQuiManque,
  texteEtape,
} from "./etapes.ts";

const r = (o: Partial<RecrueAccueil> = {}): RecrueAccueil => ({
  poster_id: "p1", prenom: "Ana", fuseau: "Europe/Lisbon", bienvenue_at: "2026-10-26T10:00:00Z", cohorte_lundi: "2026-11-02",
  premiere_connexion_at: null, slack_user_id: null, contrat_id: "c1", compte_id: "k1", handle: "ana.pt",
  warmup_started_at: null, tiktok_existe: null, tiktok_vu_at: null, abonnements: null, videos: null,
  messages: [], prevues: [], repondu_at: null, kill: null, ...o,
});
const etat = (x: RecrueAccueil, e: string) => etatsAccueil(x, D).find((y) => y.etape === e)!;
const t = (iso: string) => new Date(iso);

Deno.test("connexion : message 24 h après la bienvenue, entre 10 h et 20 h (heure du pays)", () => {
  const e = etat(r(), "connexion");
  assertEquals(e.messageAt?.toISOString(), "2026-10-27T10:00:00.000Z");
  // Lisbonne = UTC (heure d'hiver) : dû, mais 21 h → hors fenêtre ; 11 h → envoi.
  assertEquals(deciderEtape(e, t("2026-10-27T21:00:00Z"), "Europe/Lisbon", D, { envoyeAt: null, reponduAt: null }).horsFenetre, true);
  assertEquals(deciderEtape(e, t("2026-10-27T11:00:00Z"), "Europe/Lisbon", D, { envoyeAt: null, reponduAt: null }).envoyer, true);
  // Faite : rien.
  assertEquals(deciderEtape(etat(r({ premiere_connexion_at: "2026-10-26T12:00:00Z" }), "connexion"), t("2026-10-28T11:00:00Z"), "Europe/Lisbon", D, { envoyeAt: null, reponduAt: null }), { envoyer: false, horsFenetre: false, kill: false });
});

Deno.test("un seul message par étape : déjà envoyé → jamais renvoyé", () => {
  const e = etat(r(), "connexion");
  const d = deciderEtape(e, t("2026-10-28T11:00:00Z"), "Europe/Lisbon", D, { envoyeAt: t("2026-10-27T11:00:00Z"), reponduAt: null });
  assertEquals(d.envoyer, false);
});

Deno.test("Kill à 48 h : sans étape faite ni réponse ; une réponse ou l'étape faite l'évitent", () => {
  const e = etat(r(), "connexion");
  const envoyeAt = t("2026-10-27T11:00:00Z");
  assertEquals(deciderEtape(e, t("2026-10-29T10:59:00Z"), "Europe/Lisbon", D, { envoyeAt, reponduAt: null }).kill, false);
  assertEquals(deciderEtape(e, t("2026-10-29T11:00:00Z"), "Europe/Lisbon", D, { envoyeAt, reponduAt: null }).kill, true);
  assertEquals(deciderEtape(e, t("2026-10-29T12:00:00Z"), "Europe/Lisbon", D, { envoyeAt, reponduAt: t("2026-10-28T08:00:00Z") }).kill, false);
  const faite = etat(r({ premiere_connexion_at: "2026-10-28T09:00:00Z" }), "connexion");
  assertEquals(deciderEtape(faite, t("2026-10-30T12:00:00Z"), "Europe/Lisbon", D, { envoyeAt, reponduAt: null }).kill, false);
  // Une réponse d'avant le message ne compte pas.
  assertEquals(deciderEtape(e, t("2026-10-29T12:00:00Z"), "Europe/Lisbon", D, { envoyeAt, reponduAt: t("2026-10-26T12:00:00Z") }).kill, true);
});

Deno.test("tiktok 48 h après la connexion ; warmup lancé 24 h après la création du compte", () => {
  const x = r({ premiere_connexion_at: "2026-10-26T12:00:00Z" });
  assertEquals(etat(x, "tiktok").messageAt?.toISOString(), "2026-10-28T12:00:00.000Z");
  assertEquals(etat(r(), "tiktok").messageAt, null);
  const y = r({ premiere_connexion_at: "2026-10-26T12:00:00Z", tiktok_existe: true, tiktok_vu_at: "2026-10-27T08:00:00Z" });
  assertEquals(etat(y, "tiktok").fait, true);
  assertEquals(etat(y, "warmup_lance").messageAt?.toISOString(), "2026-10-28T08:00:00.000Z");
});

Deno.test("warm-up bien fait : samedi 12 h ; 5 follows et aucun post", () => {
  const base = { premiere_connexion_at: "2026-10-26T12:00:00Z", tiktok_existe: true, tiktok_vu_at: "2026-10-27T08:00:00Z", warmup_started_at: "2026-10-27T09:00:00Z" };
  const e = etat(r({ ...base, abonnements: 3, videos: 1 }), "warmup_bien_fait");
  assertEquals(e.messageAt?.toISOString(), "2026-10-31T12:00:00.000Z");
  assertEquals(e.fait, false);
  assertEquals(texteCeQuiManque(e.manque, e.followsManquants), "follow 2 more accounts, delete any post on your account (don't post before Monday)");
  assertEquals(etat(r({ ...base, abonnements: 7, videos: 0 }), "warmup_bien_fait").fait, true);
});

Deno.test("texte et canal : Slack si relié, sinon Upwork", () => {
  const e = etat(r({ abonnements: 0 }), "warmup_bien_fait");
  const m = texteEtape("Hi {prenom}, @{handle}: {ce_qui_manque}. Monday {date}. {lien_etapes} {url} {x}", e, {
    prenom: "Ana", handle: "@ana.pt", url: "https://os", lien_etapes: "https://guide", cohorte_lundi: "2026-11-02",
  });
  assert(m.startsWith("Hi Ana, @ana.pt: click \"Start warmup\""));
  assert(m.includes("Monday 2 November. https://guide https://os {x}"));
  assertEquals(canalEtape({ slack_user_id: "U1", contrat_id: "c1" }), "slack");
  assertEquals(canalEtape({ slack_user_id: null, contrat_id: "c1" }), "upwork");
  assertEquals(canalEtape({ slack_user_id: null, contrat_id: null }), null);
});

Deno.test("envoi pour le Kill : vrai message, ou prévu en test ; un échec d'envoi ne tue jamais", () => {
  const prevue = { type: "connexion", premier_at: "2026-10-27T10:00:00Z", statut: "prevu" as const, raison: "simulation" };
  const x = r({ prevues: [prevue] });
  assertEquals(envoiEtape(x, "connexion", true), { envoyeAt: t("2026-10-27T10:00:00Z"), reel: false, nudgeId: null });
  assertEquals(envoiEtape(x, "connexion", false).envoyeAt, null);
  assertEquals(envoiEtape(r({ prevues: [{ ...prevue, raison: "hors_fenetre" }] }), "connexion", true).envoyeAt, null);
  const y = r({ messages: [{ id: "n1", type: "connexion", envoye_at: "2026-10-27T11:00:00Z", reponse_at: null }] });
  assertEquals(envoiEtape(y, "connexion", false), { envoyeAt: t("2026-10-27T11:00:00Z"), reel: true, nudgeId: "n1" });
  const z = r({ messages: [{ id: "n1", type: "connexion", envoye_at: "2026-10-27T11:00:00Z", reponse_at: null, erreur: "x" }] });
  assertEquals(envoiEtape(z, "connexion", false).reel, false);
});

Deno.test("Kill en cours : plus de message ; rouge de dimanche = 1re étape pas faite", () => {
  assertEquals(killEnCours(r({ kill: [{ id: "k", etape: "connexion", statut: "simule", prevu_at: "" }] })), false);
  assertEquals(killEnCours(r({ kill: [{ id: "k", etape: "connexion", statut: "en_attente", prevu_at: "" }] })), true);
  assertEquals(etapeRouge(r(), D), "acces");
  assertEquals(etapeRouge(r({ premiere_connexion_at: "2026-10-26T12:00:00Z" }), D), "tiktok");
  const ok = { premiere_connexion_at: "2026-10-26T12:00:00Z", tiktok_existe: true, tiktok_vu_at: "2026-10-27T08:00:00Z", warmup_started_at: "2026-10-27T09:00:00Z" };
  assertEquals(etapeRouge(r({ ...ok, abonnements: 2 }), D), "warmup");
  // Ses posts de la semaine 1 ne le remettent pas en rouge.
  assertEquals(etapeRouge(r({ ...ok, abonnements: 5, videos: 4 }), D), null);
  // Lisbonne : lundi 2 nov. 0 h = 00:00Z ; le rouge seulement dans les 24 h qui suivent.
  assertEquals(nuitDuRouge(r(), t("2026-11-01T23:30:00Z")), false);
  assertEquals(nuitDuRouge(r(), t("2026-11-02T00:30:00Z")), true);
  assertEquals(nuitDuRouge(r(), t("2026-11-04T10:00:00Z")), false);
});

Deno.test("cohorte commencée : plus de message d'étape, le Kill d'un message parti continue", () => {
  const e = etat(r(), "connexion");
  const debut = debutCohorte(r());
  assertEquals(deciderEtape(e, t("2026-11-02T11:00:00Z"), "Europe/Lisbon", D, { envoyeAt: null, reponduAt: null, debut }).envoyer, false);
  assertEquals(deciderEtape(e, t("2026-11-02T11:00:00Z"), "Europe/Lisbon", D, { envoyeAt: t("2026-10-31T10:00:00Z"), reponduAt: null, debut }).kill, true);
});

Deno.test("étape 4 : le jour du réglage (samedi par défaut, vendredi, dimanche), à l'heure du réglage", () => {
  const x = r({ warmup_started_at: "2026-10-27T10:00:00Z" });
  // Lisbonne = UTC en hiver ; cohorte du lundi 2 nov.
  assertEquals(etatsAccueil(x, D).find((y) => y.etape === "warmup_bien_fait")!.messageAt?.toISOString(), "2026-10-31T12:00:00.000Z");
  const vendredi = { ...D, warmup_bien_fait_jour: 5, warmup_bien_fait_heure: 18 };
  assertEquals(etatsAccueil(x, vendredi).find((y) => y.etape === "warmup_bien_fait")!.messageAt?.toISOString(), "2026-10-30T18:00:00.000Z");
  assertEquals(joursAvantLundi(7), 1);
  assertEquals(joursAvantLundi(6), 2);
  assertEquals(joursAvantLundi(0), 2);
  assertEquals(joursAvantLundi(9.5), 2);
});

Deno.test("prompt 21, C3 : « Ready » vient de la base quand elle le donne (compte_pret)", () => {
  const pret = { premiere_connexion_at: "2026-10-26T12:00:00Z", tiktok_existe: true, tiktok_vu_at: "2026-10-27T08:00:00Z", warmup_started_at: "2026-10-27T09:00:00Z", abonnements: 5, videos: 0 };
  // La base dit non (par ex. une vidéo relevée avant le lundi) : l'étape 4 n'est pas faite.
  assertEquals(etat(r({ ...pret, pret: false }), "warmup_bien_fait").fait, false);
  assertEquals(etat(r({ ...pret, abonnements: 2, pret: true }), "warmup_bien_fait").fait, true);
  // Sans la base (ancienne fonction) : le calcul d'ici.
  assertEquals(etat(r(pret), "warmup_bien_fait").fait, true);
  assertEquals(etapeRouge(r({ ...pret, pret: false }), D), "warmup");
  assertEquals(etapeRouge(r({ ...pret, pret: true }), D), null);
});

Deno.test("prompt 21, C4 : le 2e compte d'un Double n'a que les étapes 3 et 4", () => {
  const x = r({ deuxieme: true, cohorte_lundi: "2026-11-09", premiere_connexion_at: "2026-10-01T10:00:00Z", compte_cree_at: "2026-11-01T10:00:00Z" });
  const etats = etatsAccueil(x, D);
  assertEquals(etats.map((e) => e.etape), ["warmup_lance", "warmup_bien_fait"]);
  // Pas encore vu sur TikTok : l'étape 3 compte depuis la création du compte (+ 24 h).
  assertEquals(etats[0]!.messageAt?.toISOString(), "2026-11-02T10:00:00.000Z");
  // Vu sur TikTok : depuis le relevé.
  const vu = etatsAccueil({ ...x, tiktok_existe: true, tiktok_vu_at: "2026-11-03T08:00:00Z" }, D)[0]!;
  assertEquals(vu.messageAt?.toISOString(), "2026-11-04T08:00:00.000Z");
  // Le 1er compte garde ses 4 étapes, et l'étape 3 attend le compte TikTok.
  assertEquals(etatsAccueil(r(), D).length, 4);
  assertEquals(etat(r({ compte_cree_at: "2026-11-01T10:00:00Z" }), "warmup_lance").messageAt, null);
});
