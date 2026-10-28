/**
 * Prompt 17, partie A : une seule relance par étape. Sans réseau ni base.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  choisirCanal,
  composerTexte,
  dansFenetre,
  decider,
  DELAIS_DEFAUT,
  etapeMercredi,
  etapesRecrue,
  FIN_UPWORK,
  instantLocal,
  lireDelais,
  lireMode,
  type PosteurMercredi,
  type Recrue,
} from "./relances.ts";

const D = DELAIS_DEFAUT;

function recrue(o: Partial<Recrue>): Recrue {
  return {
    poster_id: "p1",
    prenom: "Ana",
    hm_prenom: "Sara",
    fuseau: "Europe/Paris",
    offre_at: "2026-10-26T09:00:00Z",
    cohorte_lundi: "2026-11-02",
    premiere_connexion_at: null,
    slack_user_id: null,
    contrat_id: "c1",
    compte_id: "k1",
    handle: "ana.posts",
    warmup_started_at: null,
    warmup_reposts_at: null,
    tiktok_existe: null,
    abonnements: null,
    nudges: [],
    rouges: [],
    ...o,
  };
}

const etape = (r: Recrue, e: string) => etapesRecrue(r, D).find((x) => x.etape === e)!;

Deno.test("heures locales : instantLocal et la fenêtre 10 h-20 h", () => {
  // 12 h à Paris le samedi 31 oct. (heure d'hiver depuis le 25) = 11 h UTC.
  assertEquals(instantLocal("2026-10-31", 12, "Europe/Paris").toISOString(), "2026-10-31T11:00:00.000Z");
  assertEquals(instantLocal("2026-11-02", 0, "America/New_York").toISOString(), "2026-11-02T05:00:00.000Z");
  assert(dansFenetre(new Date("2026-10-27T09:30:00Z"), "Europe/Paris", D)); // 10 h 30
  assert(!dansFenetre(new Date("2026-10-27T19:30:00Z"), "Europe/Paris", D)); // 20 h 30
  assert(!dansFenetre(new Date("2026-10-27T08:30:00Z"), "Europe/Paris", D)); // 9 h 30
});

Deno.test("accès : message 24 h après l'offre, sur Upwork, seulement ce qui manque", () => {
  const r = recrue({ premiere_connexion_at: "2026-10-26T18:00:00Z" });
  const e = etape(r, "acces");
  assertEquals(e.manque, ["slack"]);
  const avant = decider(e, new Date("2026-10-27T08:00:00Z"), r.fuseau, D);
  assert(!avant.envoyer);
  const apres = decider(e, new Date("2026-10-27T10:00:00Z"), r.fuseau, D);
  assert(apres.envoyer && !apres.rouge);
  assertEquals(choisirCanal("acces", r), { canal: "upwork" });
  const texte = composerTexte("Hi {prenom}, do this today: {manque}.", e, {
    prenom: r.prenom, handle: r.handle, url: "https://os", slack: "https://slack/join", canal: "upwork",
  });
  assertEquals(texte, `Hi Ana, do this today: join our Slack with your full name (as on Upwork): https://slack/join.\n\n${FIN_UPWORK}`);
});

Deno.test("une seule relance : déjà envoyée → plus jamais, même au passage suivant", () => {
  const r = recrue({ nudges: [{ type: "acces", periode: "2026-11-02", envoye_at: "2026-10-27T10:10:00Z", canal: "upwork", resolu_at: null }] });
  const d = decider(etape(r, "acces"), new Date("2026-10-27T11:10:00Z"), r.fuseau, D);
  assert(!d.envoyer);
});

Deno.test("étape faite → pas de message, et la relance envoyée est résolue", () => {
  const faite = recrue({ premiere_connexion_at: "2026-10-26T18:00:00Z", slack_user_id: "U1" });
  const d = decider(etape(faite, "acces"), new Date("2026-10-27T11:00:00Z"), faite.fuseau, D);
  assert(!d.envoyer && !d.rouge && !d.resoudre);
  const envoyee = recrue({
    premiere_connexion_at: "2026-10-26T18:00:00Z",
    slack_user_id: "U1",
    nudges: [{ type: "acces", periode: "2026-11-02", envoye_at: "2026-10-27T10:10:00Z", canal: "upwork", resolu_at: null }],
  });
  assert(decider(etape(envoyee, "acces"), new Date("2026-10-27T12:00:00Z"), envoyee.fuseau, D).resoudre);
});

Deno.test("hors 10 h-20 h → décalé à 10 h", () => {
  const r = recrue({ offre_at: "2026-10-26T20:00:00Z" });
  // Dû à 21 h (Paris) le 27 : hors fenêtre ; part le 28 à 10 h.
  const soir = decider(etape(r, "acces"), new Date("2026-10-27T20:10:00Z"), r.fuseau, D);
  assert(!soir.envoyer && soir.horsFenetre);
  const matin = decider(etape(r, "acces"), new Date("2026-10-28T09:10:00Z"), r.fuseau, D);
  assert(matin.envoyer);
});

Deno.test("rouge : à la fin du délai, une fois, et plus de message après le rouge", () => {
  const r = recrue({});
  const d = decider(etape(r, "acces"), new Date("2026-10-28T10:00:00Z"), r.fuseau, D);
  assert(d.rouge && !d.envoyer);
  const deja = recrue({ rouges: [{ etape: "acces", periode: "2026-11-02", decision: null }] });
  assert(!decider(etape(deja, "acces"), new Date("2026-10-28T11:00:00Z"), deja.fuseau, D).rouge);
});

Deno.test("Reporter → pas de nouvelle relance, et jusqu'au début de la nouvelle cohorte", () => {
  const r = recrue({
    cohorte_lundi: "2026-11-09",
    nudges: [{ type: "acces", periode: "2026-11-02", envoye_at: "2026-10-27T10:10:00Z", canal: "upwork", resolu_at: null }],
    rouges: [{ etape: "acces", periode: "2026-11-02", decision: "reporter" }],
  });
  const e = etape(r, "acces");
  const d = decider(e, new Date("2026-11-03T10:10:00Z"), r.fuseau, D);
  assert(!d.envoyer);
  assert(!d.rouge);
  assertEquals(e.rougeAt.toISOString(), "2026-11-08T23:00:00.000Z");
});

Deno.test("TikTok : 48 h après la 1re connexion, Slack s'il est relié, rouge 24 h après le message", () => {
  const r = recrue({ premiere_connexion_at: "2026-10-26T10:00:00Z", slack_user_id: "U1" });
  const e = etape(r, "tiktok");
  assertEquals(e.messageAt.toISOString(), "2026-10-28T10:00:00.000Z");
  assert(decider(e, new Date("2026-10-28T10:10:00Z"), r.fuseau, D).envoyer);
  assertEquals(choisirCanal("tiktok", r), { canal: "slack" });
  const vu = recrue({ premiere_connexion_at: "2026-10-26T10:00:00Z", tiktok_existe: true });
  assert(etape(vu, "tiktok").fait);
});

Deno.test("warm-up : samedi 12 h, rouge dimanche minuit, ce qui manque seulement", () => {
  const r = recrue({ warmup_started_at: "2026-10-28T10:00:00Z", abonnements: 3, slack_user_id: "U1" });
  const e = etape(r, "warmup");
  assertEquals(e.messageAt.toISOString(), "2026-10-31T11:00:00.000Z");
  assertEquals(e.rougeAt.toISOString(), "2026-11-01T23:00:00.000Z");
  assertEquals(e.manque, ["follows", "reposts"]);
  const texte = composerTexte("Hi {prenom}: {manque}. Monday {date}.", e, {
    prenom: "Ana", handle: null, url: "u", slack: "", canal: "slack",
  });
  assertEquals(texte, 'Hi Ana: follow 2 more accounts, tick "I did 2 reposts". Monday 2 November.');
});

Deno.test("contrat non relié et pas de Slack → rien ne part", () => {
  assertEquals(choisirCanal("warmup", { slack_user_id: null, contrat_id: null }), { canal: null, raison: "contrat_non_relie" });
  assertEquals(choisirCanal("acces", { slack_user_id: "U1", contrat_id: null }), { canal: null, raison: "contrat_non_relie" });
  assertEquals(choisirCanal("mercredi", { slack_user_id: "U1", contrat_id: "c" }), { canal: "upwork" });
});

Deno.test("mercredi : message mercredi 12 h ; rouge vendredi 20 h sans aucun post (→ inactif, Kill samedi)", () => {
  const p: PosteurMercredi = {
    poster_id: "p", prenom: "Ana", fuseau: "Europe/Paris", slack_user_id: null, contrat_id: "c",
    prevus_lun_mar: 4, publies_lun_mar: 0, publies_semaine: 0, nudge_envoye_at: null, rouge: false,
  };
  const e = etapeMercredi(p, "2026-10-26", D);
  assert(decider(e, new Date("2026-10-28T11:10:00Z"), p.fuseau, D, false).envoyer);
  const envoye = etapeMercredi({ ...p, nudge_envoye_at: "2026-10-28T11:10:00Z" }, "2026-10-26", D);
  assert(decider(envoye, new Date("2026-10-30T19:10:00Z"), p.fuseau, D, false).rouge);
  // A publié jeudi : pas de rouge, la relance est résolue.
  const repris = decider(envoye, new Date("2026-10-30T19:10:00Z"), p.fuseau, D, true);
  assert(!repris.rouge && repris.resoudre);
  // A publié lundi : rien à envoyer.
  assert(!decider(etapeMercredi({ ...p, publies_lun_mar: 1 }, "2026-10-26", D), new Date("2026-10-28T11:10:00Z"), p.fuseau, D).envoyer);
});

Deno.test("réglages : mode et délais lus avec des valeurs par défaut", () => {
  assertEquals(lireMode("on"), "on");
  assertEquals(lireMode(undefined), "simulation");
  assertEquals(lireDelais({ acces_message_h: 12 }).acces_message_h, 12);
  assertEquals(lireDelais(null).acces_rouge_h, 48);
});
