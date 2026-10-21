/**
 * Cerveau FAQ : ce qui fait qu'il ne parle jamais à côté.
 *  - une valeur de réglage inconnue retombe en test, jamais en actif ;
 *  - un « repondu » vide n'est pas une réponse ;
 *  - Slack : seuls les vrais messages racines des canaux suivis sont des
 *    questions, les admins n'en posent pas, un bot ne se répond pas ;
 *  - un fil : l'auteur ne relance qu'après une vraie réponse, un poster de
 *    passage ne règle rien, l'équipe (l'« on it » de l'IT guy compris) oui.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  ADMINS_SLACK,
  assemblerBase,
  construirePromptFaq,
  etatDepuisDecision,
  lienSlack,
  lireReglagesFaq,
  estRemerciement,
  estMoiAussi,
  estOnIt,
  lireReponseFaq,
  reponseDansFil,
  reponseEquipeDansFil,
  suiteDeFil,
  texteReponseSlack,
  trierEvenementSlack,
} from "./faq.ts";
import { DEFINITION_PROBLEME_TECHNIQUE } from "./frontiere_it.ts";

const admins = new Set(Object.keys(ADMINS_SLACK));
const canaux = ["C0BL56RJH7T"];

Deno.test("réglages : tout en test par défaut, une faute ne passe jamais en actif", () => {
  assertEquals(lireReglagesFaq(null), {
    mode_slack: "test",
    mode_os: "test",
    canaux_slack: ["C0BL56RJH7T"],
    message_attente: true,
  });
  const r = lireReglagesFaq({ mode_slack: "ACTIF", mode_os: "on", canaux_slack: ["C0BL56RJH7T", "#questions"] });
  assertEquals(r.mode_slack, "test");
  assertEquals(r.mode_os, "test");
  assertEquals(r.canaux_slack, ["C0BL56RJH7T"]);
  assertEquals(lireReglagesFaq({ mode_slack: "actif", mode_os: "actif", message_attente: false }).mode_slack, "actif");
  assertEquals(lireReglagesFaq({ message_attente: false }).message_attente, false);
});

Deno.test("réponse du modèle : JSON entouré de texte, em dash retiré, section null", () => {
  const r = lireReponseFaq(
    'Voici : ```json\n{"decision":"repondu","reponse":"Use any sound — one that fits.","section":"Poster Guide › Quick answers › Can I use a different sound?"}\n```',
  );
  assertEquals(r, {
    decision: "repondu",
    reponse: "Use any sound, one that fits.",
    section: "Poster Guide › Quick answers › Can I use a different sound?",
  });
  assertEquals(lireReponseFaq('{"decision":"bug","reponse":"","section":"null"}'), {
    decision: "bug",
    reponse: "",
    section: null,
  });
});

Deno.test("réponse du modèle : un « repondu » vide redevient « inconnu », l'illisible vaut null", () => {
  assertEquals(lireReponseFaq('{"decision":"repondu","reponse":"  "}'), { decision: "inconnu", reponse: "", section: null });
  assertEquals(lireReponseFaq('{"decision":"peut-être","reponse":"x"}'), null);
  assertEquals(lireReponseFaq("pas de json"), null);
  assertEquals(lireReponseFaq('{"decision": "repondu", "reponse": '), null);
});

Deno.test("décision → état : seul « inconnu » part à l'admin", () => {
  assertEquals(etatDepuisDecision("inconnu"), "a_traiter");
  assertEquals(etatDepuisDecision("repondu"), "repondu");
  assertEquals(etatDepuisDecision("bug"), "bug");
  assertEquals(etatDepuisDecision("hors_sujet"), "hors_sujet");
});

Deno.test("base : le guide du rôle dans l'ordre, les notes de son audience, plafonds séparés", () => {
  const pages = [
    { guide: "manager" as const, chemin: "Manager Guide", texte: "HM rules", ordre: 0 },
    { guide: "poster" as const, chemin: "Poster Guide › Quick answers", texte: "Q&A", ordre: 1 },
    { guide: "poster" as const, chemin: "Poster Guide", texte: "Rules", ordre: 0 },
    { guide: "poster" as const, chemin: "Poster Guide › Vide", texte: "  ", ordre: 2 },
  ];
  const notes = [
    { titre: "Pour posters", contenu: "<p>Ne supprime pas</p>", audience: "poster" },
    { titre: "Pour HM", contenu: "HM only", audience: "hiring_manager" },
    { titre: "Pour tous", contenu: "Tout le monde", audience: "all" },
  ];
  const poster = assemblerBase(pages, notes, "poster");
  assertEquals(poster.guide, "### [Poster Guide]\nRules\n\n### [Poster Guide › Quick answers]\nQ&A");
  assert(poster.notes.includes("Ne supprime pas"));
  assert(!poster.notes.includes("<p>"));
  assert(!poster.notes.includes("HM only"));
  assert(poster.notes.includes("Tout le monde"));

  const hm = assemblerBase(pages, notes, "hiring_manager");
  assert(hm.guide.startsWith("### [Manager Guide]"), "le guide manager d'abord");
  assert(hm.guide.includes("Q&A"), "un manager connaît aussi les règles des posters");
  assert(hm.notes.includes("HM only"));
  assert(!hm.notes.includes("Ne supprime pas"));

  const coupe = assemblerBase(pages, notes, "poster", { guide: 10 });
  assert(coupe.guide.endsWith("[…base tronquée]"));
  assert(coupe.notes.includes("Tout le monde"), "un guide tronqué ne mange pas les notes");
});

Deno.test("prompt : la frontière de l'IT guy y est mot pour mot, la consigne dépend du canal", () => {
  const base = { guide: "### [Poster Guide]\nRules", notes: "" };
  const slack = construirePromptFaq({ canal: "slack", role: "poster", question: "Which link?", base });
  assert(slack.includes(DEFINITION_PROBLEME_TECHNIQUE));
  assert(slack.includes("tu ne réponds QUE quand la base répond"));
  assert(slack.includes("MESSAGE :\nWhich link?"));
  assert(!slack.includes("SITUATION DE LA PERSONNE"));

  const os = construirePromptFaq({
    canal: "os",
    role: "poster",
    question: "ok",
    base,
    live: "Warmup: en_cours.",
    langueRepli: "português",
  });
  assert(os.includes("SITUATION DE LA PERSONNE"));
  assert(os.includes("Warmup: en_cours."));
  assert(os.includes("réponds en português"));
  assert(os.includes("poster le problème dans #questions"));
});

Deno.test("Slack : une question = un message racine humain d'un canal suivi", () => {
  const ev = { type: "message", channel: "C0BL56RJH7T", user: "U0C8QUJCP42", text: " Which link? ", ts: "1.2" };
  assertEquals(trierEvenementSlack(ev, { canaux, admins }), {
    cas: "question",
    canal: "C0BL56RJH7T",
    ts: "1.2",
    auteur: "U0C8QUJCP42",
    texte: "Which link?",
  });
  // Une capture partagée reste un message de quelqu'un.
  assertEquals(trierEvenementSlack({ ...ev, subtype: "file_share" }, { canaux, admins }).cas, "question");
});

Deno.test("Slack : ce qui n'est jamais une question", () => {
  const ev = { type: "message", channel: "C0BL56RJH7T", user: "U0C8QUJCP42", text: "Hi", ts: "1.2" };
  const opts = { canaux, admins, botUserId: "U0CAUJ6U40H" };
  assertEquals(trierEvenementSlack({ ...ev, subtype: "message_changed" }, opts).cas, "ignore");
  assertEquals(trierEvenementSlack({ ...ev, subtype: "channel_join" }, opts).cas, "ignore");
  assertEquals(trierEvenementSlack({ ...ev, bot_id: "B1" }, opts).cas, "ignore");
  assertEquals(trierEvenementSlack({ ...ev, user: "U0CAUJ6U40H" }, opts).cas, "ignore");
  assertEquals(trierEvenementSlack({ ...ev, channel: "C0BL0084Y3F" }, opts).cas, "ignore");
  assertEquals(trierEvenementSlack({ ...ev, user: "U0BL6E14JKH" }, opts), { cas: "ignore", raison: "équipe" });
  assertEquals(trierEvenementSlack({ ...ev, text: "  " }, opts), { cas: "ignore", raison: "sans texte" });
  assertEquals(trierEvenementSlack({ ...ev, type: "reaction_added" }, opts).cas, "ignore");
  assertEquals(trierEvenementSlack(null, opts).cas, "ignore");
});

Deno.test("Slack : une réponse dans un fil est une suite, même d'un admin", () => {
  const ev = { type: "message", channel: "C0BL56RJH7T", user: "U0BL6E14JKH", text: "Yes!", ts: "2.0", thread_ts: "1.2" };
  assertEquals(trierEvenementSlack(ev, { canaux, admins }), {
    cas: "suite",
    canal: "C0BL56RJH7T",
    parentTs: "1.2",
    auteur: "U0BL6E14JKH",
    texte: "Yes!",
  });
  // Le message racine d'un fil porte thread_ts = ts : c'est une question.
  assertEquals(trierEvenementSlack({ ...ev, user: "U0C8QUJCP42", ts: "1.2" }, { canaux, admins }).cas, "question");
});

Deno.test("fil : l'auteur ne relance qu'après une vraie réponse du bot", () => {
  const equipe = new Set(["U0BL6E14JKH"]);
  const envoyee = { etat: "repondu" as const, slack_user_id: "UPOSTER", envoye_at: "2026-10-21T10:00:00Z", reponse_humaine: null };
  assertEquals(suiteDeFil(envoyee, "UPOSTER", "Still not working", equipe), { etat: "relance" });
  // Mode test : rien n'est parti, il n'y a rien à relancer.
  assertEquals(suiteDeFil({ ...envoyee, envoye_at: null }, "UPOSTER", "Still not working", equipe), null);
  assertEquals(suiteDeFil({ ...envoyee, etat: "a_traiter" }, "UPOSTER", "More details", equipe), null);
});

Deno.test("fil : l'équipe règle la question, un poster de passage non", () => {
  const equipe = new Set(["U0BL6E14JKH", "U0BMTK7BLCW"]);
  const attente = { etat: "a_traiter" as const, slack_user_id: "UPOSTER", envoye_at: null, reponse_humaine: null };
  assertEquals(suiteDeFil(attente, "U0BL6E14JKH", "No, never delete them", equipe), {
    etat: "traite_slack",
    reponse_humaine: "No, never delete them",
    reponse_humaine_par: "U0BL6E14JKH",
  });
  assertEquals(suiteDeFil({ ...attente, etat: "relance" }, "U0BMTK7BLCW", "on it", equipe)?.etat, "traite_slack");
  assertEquals(suiteDeFil(attente, "UAUTRE", "same here", equipe), null);
  assertEquals(suiteDeFil(attente, "U0BL6E14JKH", "   ", equipe), null);
});

Deno.test("fil : sur une question répondue, on garde la première réponse humaine pour comparer", () => {
  const equipe = new Set(["U0BL6E14JKH"]);
  const repondue = { etat: "repondu" as const, slack_user_id: "UPOSTER", envoye_at: null, reponse_humaine: null };
  assertEquals(suiteDeFil(repondue, "U0BL6E14JKH", "Yes, use any sound", equipe), {
    reponse_humaine: "Yes, use any sound",
    reponse_humaine_par: "U0BL6E14JKH",
  });
  assertEquals(suiteDeFil({ ...repondue, reponse_humaine: "Yes" }, "U0BL6E14JKH", "Also…", equipe), null);
});

Deno.test("fil : sur un bug, on suit l'IT guy (« on it » puis sa réponse)", () => {
  const equipe = new Set(["U0BMTK7BLCW"]);
  const bug = { etat: "bug" as const, slack_user_id: "UREGINA", envoye_at: null, reponse_humaine: null, it_statut: null };
  assertEquals(suiteDeFil(bug, "U0BMTK7BLCW", "on it\n*Sent using* Claude", equipe), { it_statut: "pris_en_charge" });
  const pris = { ...bug, it_statut: "pris_en_charge" as const };
  assertEquals(suiteDeFil(pris, "U0BMTK7BLCW", "on it", equipe), null);
  assertEquals(suiteDeFil(pris, "U0BMTK7BLCW", "Hi Regina! Yes, that's expected…", equipe), {
    it_statut: "repondu",
    reponse_humaine: "Hi Regina! Yes, that's expected…",
    reponse_humaine_par: "U0BMTK7BLCW",
  });
  assertEquals(suiteDeFil({ ...bug, it_statut: "repondu" as const }, "U0BMTK7BLCW", "Fixed", equipe), null);
  // Un poster qui passe ne dit rien de l'IT guy.
  assertEquals(suiteDeFil(bug, "UAUTRE", "on it", equipe), null);
  assert(estOnIt("On it!"));
  assert(!estOnIt("Lucia is on it"));
});

Deno.test("texte Slack : réponse, section du guide, et comment relancer", () => {
  const t = texteReponseSlack({ decision: "repondu", reponse: "Post it anyway.", section: "Poster Guide › Quick answers" });
  assert(t.startsWith("Post it anyway."));
  assert(t.includes("📖 _Poster Guide › Quick answers_"));
  assert(t.includes("Reply in this thread"));
  assert(!texteReponseSlack({ decision: "repondu", reponse: "x", section: null }).includes("📖"));
  assertEquals(
    lienSlack("C0BL56RJH7T", "1792143200.511969"),
    "https://sophia-system.slack.com/archives/C0BL56RJH7T/p1792143200511969",
  );
});

Deno.test("fil : une réponse de l'équipe déjà là bloque la nôtre, un poster ou un bot non", () => {
  const equipe = new Set(["U0BL6E14JKH"]);
  const fil = [
    { ts: "1.0", user: "UPOSTER", text: "Should we delete negative comments?" },
    { ts: "1.1", user: "UAUTRE", text: "same question here" },
    { ts: "1.2", user: "U0CAUJ6U40H", bot_id: "B1", text: "I've passed your question to the team." },
  ];
  assertEquals(reponseEquipeDansFil(fil, "1.0", equipe), null);
  assertEquals(reponseEquipeDansFil([...fil, { ts: "1.3", user: "U0BL6E14JKH", text: "No, just ignore them" }], "1.0", equipe), {
    user: "U0BL6E14JKH",
    texte: "No, just ignore them",
  });
  // Le message racine d'un admin n'est pas une réponse à lui-même.
  assertEquals(reponseEquipeDansFil([{ ts: "1.0", user: "U0BL6E14JKH", text: "x" }], "1.0", equipe), null);
});

Deno.test("fil : un merci de la personne sous la réponse du bot n'est pas une relance", () => {
  const equipe = new Set(["U0BL6E14JKH"]);
  const envoyee = { etat: "repondu" as const, slack_user_id: "UPOSTER", envoye_at: "2026-10-21T14:38:45Z", reponse_humaine: null };
  for (const merci of ["Ah okay, thanks!", "Thank you, I appreciate it :blush:", "ok", "Merci !", "Got it 👍", ":pray:", "Grazie mille"]) {
    assertEquals(suiteDeFil(envoyee, "UPOSTER", merci, equipe), null, merci);
  }
  for (const relance of ["Thanks but it still doesn't work", "ok but where is the link?", "It's not what I asked, I can't find the sound"]) {
    assertEquals(suiteDeFil(envoyee, "UPOSTER", relance, equipe), { etat: "relance" }, relance);
  }
  assert(estRemerciement("Ah okay, thanks!"));
  assert(!estRemerciement("Thanks, and what about the second post?"));
});

Deno.test("fil : avant que le bot poste, la réponse d'un autre poster l'arrête aussi, pas un « same here »", () => {
  const equipe = new Set(["U0BL6E14JKH"]);
  const fil = [
    { ts: "1.0", user: "UBARBORA", text: "Do I need to use my own photos?" },
    { ts: "1.1", user: "UAUTRE", text: "same here" },
    { ts: "1.2", user: "UBARBORA", text: "anyone?" },
  ];
  assertEquals(reponseDansFil(fil, "1.0", "UBARBORA", equipe), null);
  const kinga = { ts: "1.3", user: "UKINGA", text: "You will be provided with all the photos, text and sound" };
  assertEquals(reponseDansFil([...fil, kinga], "1.0", "UBARBORA", equipe), {
    user: "UKINGA",
    texte: "You will be provided with all the photos, text and sound",
    equipe: false,
  });
  assertEquals(
    reponseDansFil([...fil, { ts: "1.4", user: "U0BL6E14JKH", text: "Yes, all provided" }], "1.0", "UBARBORA", equipe)?.equipe,
    true,
  );
  assert(estMoiAussi("Same problem :("));
  assert(estMoiAussi("+1"));
  assert(!estMoiAussi("Same for me, I just used a sound suggested by TikTok and it was fine"));
});
