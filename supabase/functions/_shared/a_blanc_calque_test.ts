/**
 * Test à blanc — le calque « lecture après écriture », sans réseau : les
 * lectures réelles sont servies par le faux PostgREST en lecture seule.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

import { analyserUrlPostgrest, type Ligne } from "./a_blanc_postgrest.ts";
import { Calque, type Lecteur, ligneEnConflit, lignesCiblees, lireSuperpose } from "./a_blanc_calque.ts";
import { fauxServeurPostgrest, instantane, URL_TEST } from "./a_blanc_test_utils.ts";

function lecteurDe(tables: Record<string, Ligne[]>): { lecteur: Lecteur; lus: string[] } {
  const serveur = fauxServeurPostgrest(tables);
  const lus: string[] = [];
  const lecteur: Lecteur = async (url) => {
    lus.push(`${url.pathname}?${url.searchParams.toString()}`);
    const rep = await serveur.fetch(url.toString(), { headers: { accept: "application/json" } });
    if (!rep.ok) return { reponse: rep, lignes: null };
    return { reponse: rep, lignes: await rep.json() };
  };
  return { lecteur, lus };
}

const url = (table: string, q: string) => new URL(`${URL_TEST}/rest/v1/${table}?${q}`);

async function lire(calque: Calque, lecteur: Lecteur, table: string, q: string): Promise<Ligne[]> {
  const u = url(table, q);
  const r = await lireSuperpose(calque, u, analyserUrlPostgrest(u), lecteur);
  if ("reponse" in r) throw new Error(`lecture en erreur ${r.reponse.status}`);
  return r.lignes;
}

Deno.test("calque : une ligne insérée est relue par eq id, projetée sur le select", async () => {
  const tables = { passages: [{ id: "p-reel", compte_id: "k1", statut: "assigne" }] };
  const avant = instantane(tables);
  const { lecteur } = lecteurDe(tables);
  const calque = new Calque();
  const [l] = calque.inserer("passages", [{ compte_id: "k1", contenu_id: "c1", statut: "assigne" }]);
  assert(typeof l.id === "string" && l.id.length === 36);
  assertEquals(l.tier_cycle, 0, "défaut de colonne");
  assertEquals(l.est_rappel, false);
  const relue = await lire(calque, lecteur, "passages", `select=id,contenu_id&id=eq.${l.id}`);
  assertEquals(relue, [{ id: l.id, contenu_id: "c1" }]);
  const toutes = await lire(calque, lecteur, "passages", "select=id&compte_id=eq.k1&order=id");
  assertEquals(toutes.length, 2);
  assertEquals(tables, avant, "la base n'a pas bougé");
});

Deno.test("calque : ligne réelle patchée — un select partiel rend les valeurs patchées", async () => {
  const tables = { contenu_langues: [{ id: "cl1", contenu_id: "c1", langue: "en", slides: [], hashtags: null }] };
  const { lecteur } = lecteurDe(tables);
  const calque = new Calque();
  calque.patcher("contenu_langues", tables.contenu_langues[0], { slides: [{ position: 1 }], hashtags: "#a" });
  const relue = await lire(calque, lecteur, "contenu_langues", "select=slides,hashtags&id=eq.cl1");
  assertEquals(relue, [{ slides: [{ position: 1 }], hashtags: "#a" }]);
  assertEquals(tables.contenu_langues[0].hashtags, null);
});

Deno.test("calque : une suppression masque la ligne réelle", async () => {
  const tables = { passages: [{ id: "p1", compte_id: "k1" }, { id: "p2", compte_id: "k1" }] };
  const { lecteur } = lecteurDe(tables);
  const calque = new Calque();
  calque.supprimer("passages", tables.passages[0]);
  assertEquals(await lire(calque, lecteur, "passages", "select=id&compte_id=eq.k1"), [{ id: "p2" }]);
});

Deno.test("calque : un patch fait SORTIR une ligne du filtre (repêchage eq passages_prevus=0)", async () => {
  const tables = { contenus: [{ id: "c1", passages_prevus: 0, tier: "D" }] };
  const { lecteur } = lecteurDe(tables);
  const calque = new Calque();
  calque.patcher("contenus", tables.contenus[0], { passages_prevus: 1 });
  assertEquals(await lire(calque, lecteur, "contenus", "select=id&id=eq.c1&passages_prevus=eq.0"), []);
});

Deno.test("calque : un patch fait ENTRER une ligne (relue par sa clé)", async () => {
  const tables = { posts: [{ id: "x1", statut: "brouillon" }, { id: "x2", statut: "assigne" }] };
  const { lecteur, lus } = lecteurDe(tables);
  const calque = new Calque();
  calque.patcher("posts", tables.posts[0], { statut: "assigne" });
  const relues = await lire(calque, lecteur, "posts", "select=id&statut=eq.assigne&order=id");
  assertEquals(relues, [{ id: "x1" }, { id: "x2" }]);
  assert(lus.some((l) => l.includes("id=in.")), "relecture par clé");
});

Deno.test("calque : pagination keyset (gt id + order + limit) avec une ligne insérée — ni perte ni doublon", async () => {
  const reelles = ["10", "20", "30", "40", "50"].map((n) => ({
    id: `00000000-0000-4000-8000-0000000000${n}`,
    compte_id: "k1",
  }));
  const tables = { passages: reelles };
  const { lecteur } = lecteurDe(tables);
  const calque = new Calque();
  calque.inserer("passages", [{ id: "00000000-0000-4000-8000-000000000025", compte_id: "k1" }]);
  calque.supprimer("passages", reelles[3]);
  const vus: string[] = [];
  let curseur: string | null = null;
  for (let page = 0; page < 10; page += 1) {
    const q = `select=id&compte_id=eq.k1${curseur ? `&id=gt.${curseur}` : ""}&order=id.asc&limit=2`;
    const lignes = await lire(calque, lecteur, "passages", q);
    vus.push(...lignes.map((l) => String(l.id).slice(-2)));
    if (lignes.length < 2) break;
    curseur = String(lignes[lignes.length - 1].id);
  }
  assertEquals(vus, ["10", "20", "25", "30", "50"]);
});

Deno.test("calque : limit sur une table où le test a supprimé — la ligne suivante remonte", async () => {
  const tables = { passages: [{ id: "a", k: 1 }, { id: "b", k: 1 }, { id: "c", k: 1 }] };
  const { lecteur } = lecteurDe(tables);
  const calque = new Calque();
  calque.supprimer("passages", tables.passages[0]);
  assertEquals(await lire(calque, lecteur, "passages", "select=id&k=eq.1&order=id&limit=1"), [{ id: "b" }]);
});

Deno.test("calque : clé composée contenu_tiers_application", async () => {
  const tables = {
    contenu_tiers_application: [
      { contenu_id: "c1", application_id: "a1", passages_prevus: 0, tier: "D", tier_cycle: 2 },
      { contenu_id: "c1", application_id: "a2", passages_prevus: 0, tier: "D", tier_cycle: 3 },
    ],
  };
  const { lecteur } = lecteurDe(tables);
  const calque = new Calque();
  const u = url("contenu_tiers_application", "contenu_id=eq.c1&application_id=eq.a1&passages_prevus=eq.0");
  const cibles = await lignesCiblees(calque, u, analyserUrlPostgrest(u), lecteur);
  assert(cibles && "lignes" in cibles);
  assertEquals(cibles.lignes.length, 1);
  calque.patcher("contenu_tiers_application", cibles.lignes[0], { passages_prevus: 1 });
  const relues = await lire(calque, lecteur, "contenu_tiers_application", "select=application_id,passages_prevus&contenu_id=eq.c1&order=application_id");
  assertEquals(relues, [
    { application_id: "a1", passages_prevus: 1 },
    { application_id: "a2", passages_prevus: 0 },
  ]);
});

Deno.test("calque : upsert — ligne en conflit trouvée en base réelle, puis dans le calque", async () => {
  const tables = { assignation_journal: [{ compte_id: "k1", jour: "2026-10-10", crees: 3, raison: null }] };
  const { lecteur } = lecteurDe(tables);
  const calque = new Calque();
  const u = url("assignation_journal", "on_conflict=compte_id,jour");
  const reel = await ligneEnConflit(calque, u, "assignation_journal", ["compte_id", "jour"], { compte_id: "k1", jour: "2026-10-10" }, lecteur);
  assert("ligne" in reel && reel.ligne?.crees === 3, "merge : la ligne réelle est la cible");
  calque.patcher("assignation_journal", reel.ligne!, { crees: 1 });
  const absent = await ligneEnConflit(calque, u, "assignation_journal", ["compte_id", "jour"], { compte_id: "k2", jour: "2026-10-10" }, lecteur);
  assert("ligne" in absent && absent.ligne === null);
  calque.inserer("assignation_journal", [{ compte_id: "k2", jour: "2026-10-10", crees: 0 }]);
  const insere = await ligneEnConflit(calque, u, "assignation_journal", ["compte_id", "jour"], { compte_id: "k2", jour: "2026-10-10" }, lecteur);
  assert("ligne" in insere && insere.ligne !== null, "la ligne du calque est vue");
  const nulle = await ligneEnConflit(calque, u, "assignation_journal", ["compte_id", "jour"], { compte_id: null, jour: "x" }, lecteur);
  assert("ligne" in nulle && nulle.ligne === null, "NULL ne heurte rien");
  assertEquals(tables.assignation_journal[0].crees, 3);
});

Deno.test("calque : update / delete sans filtre → non résolu (null)", async () => {
  const { lecteur, lus } = lecteurDe({ passages: [] });
  const calque = new Calque();
  const u = url("passages", "");
  assertEquals(await lignesCiblees(calque, u, analyserUrlPostgrest(u), lecteur), null);
  assertEquals(lus, [], "aucune lecture");
});

Deno.test("calque : défauts d'insertion de contenu_langues et d'assignation_journal", () => {
  const calque = new Calque();
  const [l] = calque.inserer("contenu_langues", [{ contenu_id: "c1", langue: "en", slides: [], nb_passages: 0 }]);
  assertEquals([l.slides, l.nb_passages, l.score, l.slides_base, l.hashtags], [[], 0, 50, null, null]);
  const [j] = calque.inserer("assignation_journal", [{ compte_id: "k1", jour: "2026-10-10" }]);
  assertEquals(j.crees, 0);
  assert(!("id" in j), "pas d'id fabriqué sur une clé composée");
  const [p] = calque.inserer("posts", [{ compte_id: "k1" }]);
  assertEquals(p.application_id, "00000000-0000-4000-8000-000000000001", "application_id_sophia()");
});

Deno.test("calque : insert en tableau avec `columns` — colonne absente = NULL (sauf missing=default)", () => {
  const calque = new Calque();
  const [a, b] = calque.inserer("post_slides", [{ post_id: "x", position: 1 }, { post_id: "x" }], {
    colonnes: ["post_id", "position"],
  });
  assertEquals([a.position, b.position], [1, null]);
  const [c] = calque.inserer("post_slides", [{ post_id: "y" }], { colonnes: ["post_id", "position_sophia"], manquantsParDefaut: true });
  assertEquals(c.position_sophia, false);
});

Deno.test("calque : le patch d'une ligne insérée la modifie elle-même", async () => {
  const { lecteur } = lecteurDe({ passages: [] });
  const calque = new Calque();
  const [l] = calque.inserer("passages", [{ compte_id: "k1" }]);
  calque.patcher("passages", l, { post_id: "post-fictif" });
  assertEquals(calque.inseree("passages", String(l.id))?.post_id, "post-fictif");
  assertEquals(await lire(calque, lecteur, "passages", "select=post_id&post_id=not.is.null"), [{ post_id: "post-fictif" }]);
});
