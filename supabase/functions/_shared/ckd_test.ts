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
  type DecisionSlack,
  maintenantParis,
  semaineDesDecisions,
  semaineIso,
  texteDecision,
  texteRappel,
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
  assert(kill.includes("Don't fund their next milestone"));
  assert(kill.includes("They keep @emma.two"));

  const recreer = texteDecision(decision({ decision: "recreer", regle: "anciens", nouveauHandle: "new.one" }), 44);
  assert(recreer.includes("*Recreate*"));
  assert(recreer.includes("*@new.one*"));
  assert(recreer.includes("before Sunday midnight"));

  const doubler = texteDecision(decision({ decision: "doubler", regle: "doubler", nouveauHandle: "second.one" }), 44);
  assert(doubler.includes('"Week 44 (2 acc)"'));

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
  assert(t.includes('fund "Week 44 (2 acc)" for @b.one (B)'));
  assert(!t.includes("c.one"));
  assertEquals(texteRappel("2026-10-24", [zone([decision({ decision: "recreer" })])]), null);
});
