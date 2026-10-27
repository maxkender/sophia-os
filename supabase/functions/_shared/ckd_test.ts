/**
 * Check, Kill or Double : semaines, heure de Paris et messages Slack. Sans réseau.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  ACTION_DONE,
  blocsRecap,
  blocsZone,
  blocsZoneJeudi,
  blocsZoneSamedi,
  consigneNudge,
  type DecisionSlack,
  lignesDiagnosticSlack,
  maintenantParis,
  semaineDesDecisions,
  semaineIso,
  texteDecision,
  texteRappel,
  texteSuiviJeudi,
  type ZoneSlack,
} from "./ckd.ts";

function decision(partiel: Partial<DecisionSlack>): DecisionSlack {
  return {
    id: "p1",
    decision: "ne_pas_renouveler",
    regle: "absent",
    handle: "emma.vyvija827",
    poster: "Emma V",
    pays: "SK",
    nouveauHandle: null,
    autresComptes: [],
    motifs: [],
    publies: 0,
    attendus: 10,
    note: null,
    texteHm: null,
    fait: null,
    ...partiel,
  };
}

const zone = (decisions: DecisionSlack[], slackId: string | null = "U0C61CLD82E"): ZoneSlack => ({
  hmId: "hm1",
  hmNom: "Afaf Waali",
  zone: "UAE + Slovakia",
  slackId,
  decisions,
});

Deno.test("semaineIso : semaines ISO, y compris aux bords de l'année", () => {
  assertEquals(semaineIso("2026-10-26"), 44);
  assertEquals(semaineIso("2026-10-25"), 43);
  assertEquals(semaineIso("2026-01-01"), 1);
  assertEquals(semaineIso("2027-01-01"), 53);
  assertEquals(semaineIso("2027-01-04"), 1);
  // Décidé le samedi 24/10 → jalons de la semaine du lundi 26/10.
  assertEquals(semaineDesDecisions("2026-10-24"), 44);
});

Deno.test("maintenantParis : heure d'été et d'hiver", () => {
  assertEquals(maintenantParis(new Date("2026-10-25T10:00:00Z")), { jour: "2026-10-25", heure: 11, isoJour: 7 });
  assertEquals(maintenantParis(new Date("2026-10-18T10:00:00Z")), { jour: "2026-10-18", heure: 12, isoJour: 7 });
  assertEquals(maintenantParis(new Date("2026-10-26T08:00:00Z")).heure, 9);
});

Deno.test("texteDecision : ce que le HM doit faire, décision par décision", () => {
  const kill = texteDecision(decision({ autresComptes: ["emma.two"] }), 44);
  assert(kill.includes("*Don't renew* @emma.vyvija827 (Emma V 🇸🇰)"));
  assert(kill.includes("Stops Sunday night: don't fund the next milestone."));
  assert(kill.includes("They keep @emma.two"));

  const recreer = texteDecision(decision({ decision: "recreer", regle: "anciens", nouveauHandle: "new.one" }), 44);
  assert(recreer.includes("*Recreate*"));
  assert(recreer.includes("*@new.one*"));
  assert(recreer.includes("before Sunday midnight"));

  const doubler = texteDecision(decision({ decision: "doubler", regle: "doubler", nouveauHandle: "second.one" }), 44);
  assert(doubler.includes('"Week 44 (2 acc)"'));

  // Double décidé le samedi 31/10 : le 2ᵉ compte démarre le lundi 9/11 (J+9), semaine 46.
  const double9 = texteDecision(decision({ decision: "doubler", regle: "doubler", nouveauHandle: "second.one" }), 45, "2026-11-09");
  assert(double9.includes("2nd account *@second.one*, starts on Monday 9 Nov"));
  assert(double9.includes('milestone "Week 46 (2 acc)", pay × 2'));

  const nudge = texteDecision(decision({ decision: "nudge", publies: 3, attendus: 10, note: "parle-lui" }), 44);
  assert(nudge.includes("*Follow up*"));
  assert(nudge.includes("Posted 3/10 this week"));
  assert(nudge.includes("Talk to them today"));
  assert(nudge.includes("_Note: parle-lui_"));
});

Deno.test("blocsZoneSamedi : mention du HM, un bouton Done par décision, puis qui l'a fait", () => {
  const z = zone([
    decision({ id: "a" }),
    decision({ id: "b", decision: "doubler", nouveauHandle: "x", fait: { par: "U1", heure: "14:05" } }),
  ]);
  const blocs = blocsZoneSamedi(z, 44);
  assert(blocs[0].text.text.startsWith("<@U0C61CLD82E> · *UAE + Slovakia*: 2 decisions for week 44"));
  const boutons = blocs.filter((b) => b.type === "actions");
  assertEquals(boutons.length, 1);
  assertEquals(boutons[0].elements[0].action_id, ACTION_DONE);
  assertEquals(boutons[0].elements[0].value, "a");
  assert(JSON.stringify(blocs).includes("✅ Done by <@U1> at 14:05"));
});

Deno.test("HM sans ID Slack : nommé, pas mentionné", () => {
  const blocs = blocsZoneSamedi(zone([decision({})], null), 44);
  assert(blocs[0].text.text.startsWith("Afaf Waali (no Slack ID) · *UAE + Slovakia*"));
});

Deno.test("blocsRecap : par zone, sans mention, avec le suivi des Done", () => {
  const z = zone([decision({ id: "a" }), decision({ id: "b", decision: "recreer", fait: { par: "U1", heure: "9:00" } })]);
  const texte = JSON.stringify(blocsRecap("samedi", "2026-10-24", [z]));
  assert(texte.includes("week 44"));
  assert(texte.includes("1 don't renew, 1 recreate · ⏳ 1/2 done"));
  assert(!texte.includes("<@U0C61CLD82E>"));
  const jeudi = JSON.stringify(blocsRecap("jeudi", "2026-10-22", [zone([decision({ decision: "nudge" })])]));
  assert(jeudi.includes("started Mon 19 Oct"));
  assert(jeudi.includes("follow up with each of them today"));
  assert(jeudi.includes("1 to follow up · ⏳ 0/1 done"));
});

Deno.test("blocsZoneJeudi : le HM relance chaque nouveau posteur, quoi vérifier, et Done", () => {
  const blocs = blocsZoneJeudi(zone([
    decision({ id: "a", decision: "nudge", regle: "jeudi", motifs: ["surveiller", "discipline"], publies: 3, attendus: 4 }),
    decision({ id: "b", decision: "nudge", regle: "jeudi", motifs: ["reveil"], fait: { par: "U1", heure: "11:20" } }),
  ]));
  assert(blocs[0].text.text.startsWith("<@U0C61CLD82E> · *UAE + Slovakia*: 2 new posters to follow up today"));
  const texte = JSON.stringify(blocs);
  assert(texte.includes("*Follow up* @emma.vyvija827"));
  assert(texte.includes("Look at that post with them"));
  assert(texte.includes("paste each link. (3/4 published)"));
  assert(texte.includes("None of their first posts took off"));
  const boutons = blocs.filter((b) => b.type === "actions");
  assertEquals(boutons.length, 1);
  assertEquals(boutons[0].elements[0].value, "a");
  assert(texte.includes("✅ Done by <@U1> at 11:20"));
  // Le Done réécrit le bon message selon le contrôle.
  assertEquals(
    blocsZone("jeudi", zone([decision({ decision: "nudge", regle: "jeudi" })]), "2026-10-22")[0].text.text,
    "<@U0C61CLD82E> · *UAE + Slovakia*: 1 new poster to follow up today",
  );
  assert(blocsZone("samedi", zone([decision({})]), "2026-10-24")[0].text.text.endsWith("1 decision for week 44"));
});

Deno.test("texteRappel : qui ne pas financer, qui passe à 2 comptes ; rien sinon", () => {
  const z = zone([
    decision({ handle: "a.one", poster: "A" }),
    decision({ decision: "doubler", handle: "b.one", poster: "B" }),
    decision({ decision: "recreer", handle: "c.one", poster: "C" }),
  ]);
  const t = texteRappel("2026-10-24", [z])!;
  assert(t.includes("<@U0C61CLD82E>"));
  assert(t.includes("don't fund @a.one (A)"));
  // Double du samedi 24/10 : 2ᵉ compte le lundi 2/11 (J+9), semaine 45.
  assert(t.includes('fund 1 account this week, then "Week 45 (2 acc)" from Monday 2 Nov for @b.one (B)'));
  assert(!t.includes("c.one"));
  assertEquals(texteRappel("2026-10-24", [zone([decision({ decision: "recreer" })])]), null);
});

Deno.test("consigne d'un nudge : par défaut, ou le message modifié sur la page (échappé)", () => {
  const jeudi = decision({ decision: "nudge", regle: "jeudi", motifs: ["reveil", "discipline"], publies: 2, attendus: 4 });
  assertEquals(
    consigneNudge(jeudi),
    "• None of their first posts took off. Go through them together: posting time, first slide, sound, " +
      "and that they post from the right account.\n" +
      "• Some posts are missing or have no link in the OS. Make sure they publish everything planned and paste " +
      "each link. (2/4 published)",
  );
  assert(texteSuiviJeudi(jeudi).includes(consigneNudge(jeudi)));

  const modifie = texteSuiviJeudi({ ...jeudi, texteHm: "  Her 2 missing posts are from Sunday <18/10> & her first day.  " });
  assert(modifie.startsWith(":eyes: *Follow up* @emma.vyvija827"));
  assert(modifie.includes("Her 2 missing posts are from Sunday &lt;18/10&gt; &amp; her first day."));
  assert(!modifie.includes("None of their first posts"));

  const absent = decision({ decision: "nudge", regle: "absent", publies: 3, attendus: 10 });
  assert(consigneNudge(absent).includes("Posted 3/10 this week."));
  const absentModifie = texteDecision({ ...absent, texteHm: "Ask if her phone is broken." }, 44);
  assert(absentModifie.includes("*Follow up*"));
  assert(absentModifie.includes("Ask if her phone is broken."));
  assert(!absentModifie.includes("Posted 3/10"));
  // Vide : la consigne par défaut.
  assert(texteDecision({ ...absent, texteHm: "   " }, 44).includes("Posted 3/10 this week."));
});

Deno.test("diagnostic Slack : 3 lignes en mots simples, badge en tête (0362)", () => {
  const d = {
    badge: "shadowban" as const,
    attendus: 10,
    publies: 4,
    liens_manquants: ["2026-10-17", "2026-10-18", "2026-10-20", "2026-10-21"],
    mediane: 0,
    mediane_ref: 1353,
    morts: 4,
    seuil_mort: 50,
    shadowban: true,
  };
  assertEquals(lignesDiagnosticSlack(d), [
    ":red_circle: Shadowban · Posts: 4 published out of 10 expected, 6 links missing (17, 18, 20, 21 Oct)",
    "Views: median 0 (country: 1,353), 4 dead posts (< 50 views)",
    "Verdict: probable shadowban → new account",
  ]);
  const ok = lignesDiagnosticSlack({ ...d, badge: "ok", publies: 10, liens_manquants: [], mediane: 1500, morts: 0, shadowban: false });
  assertEquals(ok[0], ":large_green_circle: OK · Posts: 10 published out of 10 expected");
  assertEquals(ok[1], "Views: median 1,500 (country: 1,353)");
});

Deno.test("diagnostic Slack : juste sous le titre, avant la consigne ; absent sans diagnostic", () => {
  const diagnostic = {
    badge: "posts_manquants" as const,
    attendus: 6,
    publies: 4,
    liens_manquants: ["2026-10-20", "2026-10-21"],
    mediane: 800,
    mediane_ref: 1000,
    morts: 0,
    seuil_mort: 50,
    shadowban: false,
  };
  const avec = texteSuiviJeudi(decision({ regle: "jeudi", decision: "nudge", motifs: ["discipline"], diagnostic })).split("\n");
  assert(avec[0].includes("*Follow up*"));
  assert(avec[1].startsWith("> :large_orange_circle: Missing posts"));
  assert(avec[3].startsWith("> Verdict: missing posts"));
  const sans = texteSuiviJeudi(decision({ regle: "jeudi", decision: "nudge", motifs: ["discipline"] })).split("\n");
  assert(!sans[1].startsWith(">"));
});
