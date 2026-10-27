/**
 * Guichet du site → OS : à qui va le poster, dans quelle langue il publie.
 *
 * Les zones sont celles de la master list telles qu'elles sont en base au
 * 12/10/2026 : si l'une d'elles cesse d'être comprise, un poster du site
 * tombe en « zone non ouverte » alors qu'un HM l'attend.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  carteDesZones,
  codePays,
  codesDeZone,
  dateIso,
  idCohorteRuul,
  MOT_DE_PASSE_INITIAL,
  partsPourApplications,
  paysAEnvoyer,
  type Recruteur,
  reservationPerimee,
  hmDuPays,
  resoudreAffectation,
  secretValide,
} from "./hub_posteurs.ts";

function hm(email: string, zone: string, langues: string[], posters_actifs = 0): Recruteur {
  return { id: email, prenom: email.split("@")[0], nom: null, email, zone_recrutement: zone, langues, posters_actifs };
}

const HMS: Recruteur[] = [
  hm("heemas@sophia.com", "Australia + NZ + Ireland", ["en"]),
  hm("laibat@sophia.com", "Czechia + Bulgaria", ["cs", "bg"], 8),
  hm("erlam@sophia.com", "Estonia + Finland + Russian-speaking", ["hu", "cs", "it", "fi", "ru", "et"], 4),
  hm("sarab@sophia.com", "France", ["fr"], 14),
  hm("reginan@sophia.com", "Germany + Norway", ["de", "pt", "no", "fr"], 24),
  hm("margheritap@sophia.com", "Greece + Denmark", ["el"], 8),
  hm("nanab@sophia.com", "Hungary + Serbia", ["hu", "sr"], 13),
  hm("luciad1@sophia.com", "Italy + Croatia + Slovenia", ["it", "sl", "hr"], 17),
  hm("pelinsue@sophia.com", "Poland + Netherlands", ["nl", "pl", "bg"], 10),
  hm("waqass@sophia.com", "Romania + Sweden", ["ro", "sv", "ru"], 10),
  hm("krisa@sophia.com", "Spain + Portugal", ["es", "pt", "fr"], 22),
  hm("amandac@sophia.com", "Turkey + Israel", ["hu", "tr", "cs", "sr", "sk"], 19),
  hm("afafw@sophia.com", "UAE + Slovakia", ["ar", "sk"], 3),
  hm("ranab@sophia.com", "US + UK", ["en"], 5),
];

Deno.test("chaque zone de la master list est entièrement comprise", () => {
  for (const r of HMS) {
    const { codes, inconnus } = codesDeZone(r.zone_recrutement);
    assertEquals(inconnus, [], r.zone_recrutement ?? "");
    assert(codes.length >= 1, r.zone_recrutement ?? "");
  }
  assertEquals(codesDeZone("US + UK").codes, ["US", "GB"]);
  assertEquals(codesDeZone("UAE + Slovakia").codes, ["AE", "SK"]);
  assertEquals(codesDeZone("Australia + NZ + Ireland").codes, ["AU", "NZ", "IE"]);
  assertEquals(codesDeZone("Estonia + Finland + Russian-speaking").codes, ["EE", "FI", "RU", "BY", "KZ"]);
  assertEquals(codesDeZone("Turkey + Israel").codes, ["TR", "IL"]);
  const latam = codesDeZone("Spain + Romania + Kazakhstan + Latin America + Portugal");
  assertEquals(latam.inconnus, []);
  assertEquals(latam.codes.length, 22);
  assert(latam.codes.includes("MX") && latam.codes.includes("AR") && !latam.codes.includes("BR"));
});

Deno.test("un morceau inconnu est rendu, pas avalé", () => {
  assertEquals(codesDeZone("France + Atlantide"), { codes: ["FR"], inconnus: ["Atlantide"] });
  assertEquals(codesDeZone(null), { codes: [], inconnus: [] });
});

Deno.test("le pays du site : code ISO d'abord, nom (anglais ou français) en repli", () => {
  assertEquals(codePays("it", "Italy"), "IT");
  assertEquals(codePays(null, "Italy"), "IT");
  assertEquals(codePays("", "Pologne"), "PL");
  assertEquals(codePays("ZZ", "Atlantide"), null);
});

Deno.test("le poster va au HM de son pays et publie dans la langue du pays", () => {
  const it = resoudreAffectation("IT", HMS);
  assert(it.ok);
  assertEquals([it.hm.email, it.langue], ["luciad1@sophia.com", "it"]);

  // Langue des emails anglaise sur le formulaire, publication en polonais.
  const pl = resoudreAffectation("PL", HMS);
  assert(pl.ok);
  assertEquals([pl.hm.email, pl.langue], ["pelinsue@sophia.com", "pl"]);

  const by = resoudreAffectation("BY", HMS);
  assert(by.ok);
  assertEquals([by.hm.email, by.langue], ["erlam@sophia.com", "ru"]);

  const gb = resoudreAffectation("GB", HMS);
  assert(gb.ok);
  assertEquals([gb.hm.email, gb.langue], ["ranab@sophia.com", "en"]);
});

Deno.test("pas de HM pour le pays = zone pas encore ouverte dans l'OS", () => {
  for (const code of ["CO", "EC", "CR", "SN", "AT", "CA"]) {
    assertEquals(resoudreAffectation(code, HMS), { ok: false, raison: "zone_non_ouverte" }, code);
  }
});

Deno.test("un HM qui ne gère pas la langue du pays : refus explicite, pas de compte dans la mauvaise langue", () => {
  const dk = resoudreAffectation("DK", HMS);
  assertEquals(dk.ok, false);
  if (!dk.ok && dk.raison === "langue_non_geree") {
    assertEquals([dk.langue, dk.hm.email], ["da", "margheritap@sophia.com"]);
  } else {
    throw new Error("langue_non_geree attendu");
  }
  const il = resoudreAffectation("IL", HMS);
  assert(!il.ok && il.raison === "langue_non_geree");
});

Deno.test("deux HM pour un pays : celui qui gère la langue, puis le moins chargé, ordre stable", () => {
  const charge = hm("b@sophia.com", "Spain", ["es"], 30);
  const leger = hm("a@sophia.com", "Spain + Mexico", ["es"], 2);
  const sansLangue = hm("c@sophia.com", "Spain", ["en"], 0);
  const r = resoudreAffectation("ES", [charge, sansLangue, leger]);
  assert(r.ok);
  assertEquals(r.hm.email, "a@sophia.com");
  const egalite = resoudreAffectation("ES", [hm("z@sophia.com", "Spain", ["es"], 1), hm("y@sophia.com", "Spain", ["es"], 1)]);
  assert(egalite.ok);
  assertEquals(egalite.hm.email, "y@sophia.com");
});

Deno.test("carte des zones : ouverts et fermés, pour griser « Accepter » côté site", () => {
  const carte = carteDesZones(HMS);
  const ouverts = carte.ouverts.map((o) => o.pays_code);
  for (const code of ["FR", "IT", "ES", "PT", "PL", "SE", "US", "GB"]) assert(ouverts.includes(code), code);
  assertEquals(carte.fermes.find((f) => f.pays_code === "DK"), { pays_code: "DK", raison: "langue_non_geree", langue: "da" });
  assertEquals(carte.inconnus, []);
  assert(!ouverts.includes("CO"));
});

Deno.test("applications : Sophia seule garde le chemin historique de création", () => {
  assertEquals(partsPourApplications(["sophia"]), null);
  assertEquals(partsPourApplications([]), null);
  assertEquals(partsPourApplications(undefined), null);
  assertEquals(partsPourApplications(["unswipe"]), { unswipe: 100 });
  assertEquals(partsPourApplications(["UnSwipe", "sophia", "sophia"]), { sophia: 50, unswipe: 50 });
  // Une application inconnue n'ouvre rien : seule Sophia reste.
  assertEquals(partsPourApplications(["micabo", "sophia"]), null);
});

Deno.test("pays du compte : envoyé seulement quand la langue ne suffit pas, comme le front", () => {
  assertEquals(paysAEnvoyer("fr", "FR"), undefined);
  assertEquals(paysAEnvoyer("pl", "PL"), undefined);
  assertEquals(paysAEnvoyer("en", "GB"), "GB");
  assertEquals(paysAEnvoyer("en", "IE"), "IE");
  assertEquals(paysAEnvoyer("ru", "BY"), "BY");
  assertEquals(paysAEnvoyer("ar", "AE"), "AE");
});

Deno.test("mot de passe de départ : celui de tous les comptes OS", () => {
  // Le même que MDP_OS_INITIAL côté front : les HM le donnent aux posters.
  assertEquals(MOT_DE_PASSE_INITIAL, "12345678");
});

Deno.test("secret : bon secret accepté, tout le reste refusé", async () => {
  assertEquals(await secretValide("s3cret-long", "s3cret-long"), true);
  assertEquals(await secretValide("s3cret-lonG", "s3cret-long"), false);
  assertEquals(await secretValide("", "s3cret-long"), false);
  assertEquals(await secretValide(null, "s3cret-long"), false);
  assertEquals(await secretValide("x", ""), false);
});

Deno.test("dates et réservations", () => {
  assertEquals(dateIso("2026-10-19"), "2026-10-19");
  assertEquals(dateIso("2026-02-30"), null);
  assertEquals(dateIso("19/10/2026"), null);
  const t = Date.parse("2026-10-12T10:00:00Z");
  assertEquals(reservationPerimee("2026-10-12T09:58:00Z", t), false);
  assertEquals(reservationPerimee("2026-10-12T09:50:00Z", t), true);
  assertEquals(reservationPerimee(null, t), true);
});

Deno.test("cohorte Ruul : l'id vient du réglage, sinon retour au HM de la zone", () => {
  const id = "0f0e0d0c-0b0a-4908-8706-050403020100";
  assertEquals(idCohorteRuul({ cohorte_ruul_id: id }), id);
  assertEquals(idCohorteRuul({ cohorte_ruul_id: id.toUpperCase() }), id);
  assertEquals(idCohorteRuul({ cohorte_ruul_id: "pas-un-uuid" }), null);
  assertEquals(idCohorteRuul({}), null);
  assertEquals(idCohorteRuul(null), null);
});

Deno.test("« À recruter » du samedi : la HM du pays, même si sa langue n'est pas encore gérée (0364)", () => {
  const it = resoudreAffectation("IT", HMS);
  assert(it.ok);
  assertEquals(hmDuPays("IT", HMS), it.hm.id);
  assertEquals(hmDuPays("CO", HMS), null);
  for (const code of ["IT", "PL", "BY", "GB", "AT"]) {
    const a = resoudreAffectation(code, HMS);
    const attendu = a.ok || a.raison === "langue_non_geree" ? a.hm.id : null;
    assertEquals(hmDuPays(code, HMS), attendu, code);
  }
});
