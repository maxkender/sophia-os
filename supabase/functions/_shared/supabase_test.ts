import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";

import { IN_MAX_VALEURS, PLAFOND_LIGNES } from "./lots.ts";
import { surveillerBuilder } from "./supabase.ts";

/**
 * Double du chaînage PostgREST — aucun réseau.
 *
 * Il imite les deux traits qui font tout le problème : les filtres et les
 * modificateurs font `return this` (c'est ce qui faisait perdre le Proxy dès le
 * premier maillon), et la borne de l'appelant finit dans `url.searchParams`,
 * seule source de vérité au moment du `then`.
 */
class FauxFiltre {
  url = new URL("https://exemple.supabase.co/rest/v1/contenu_labels");
  appelsThen = 0;

  constructor(private reponse: { data: unknown; error: unknown }, table = "contenu_labels") {
    this.url = new URL(`https://exemple.supabase.co/rest/v1/${table}`);
  }

  eq(colonne: string, valeur: unknown) {
    this.url.searchParams.set(colonne, `eq.${valeur}`);
    return this;
  }
  gt(colonne: string, valeur: unknown) {
    this.url.searchParams.set(colonne, `gt.${valeur}`);
    return this;
  }
  in(colonne: string, _valeurs: unknown[]) {
    this.url.searchParams.set(colonne, "in.(…)");
    return this;
  }
  order(colonne: string) {
    this.url.searchParams.set("order", colonne);
    return this;
  }
  limit(n: number) {
    this.url.searchParams.set("limit", String(n));
    return this;
  }
  range(de: number, a: number) {
    this.url.searchParams.set("offset", String(de));
    this.url.searchParams.set("limit", String(a - de + 1));
    return this;
  }
  then(onf?: (v: unknown) => unknown, onr?: (r: unknown) => unknown) {
    this.appelsThen += 1;
    return Promise.resolve(this.reponse).then(onf, onr);
  }
}

/** Le `from()` : son `select()` construit un NOUVEAU builder, comme postgrest-js. */
class FauxTable {
  constructor(private reponse: { data: unknown; error: unknown }, private table = "contenu_labels") {}
  select(_colonnes?: string) {
    return new FauxFiltre(this.reponse, this.table);
  }
}

const lignes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${i}` }));
const proxifier = (reponse: { data: unknown; error: unknown }, table = "contenu_labels") =>
  surveillerBuilder(new FauxTable(reponse, table) as object, { table }) as unknown as {
    select(c?: string): FauxFiltre;
  };

Deno.test("garde-fou — une lecture non bornée qui rend pile le plafond lève", async () => {
  // La panne : PostgREST coupe à max-rows et répond 200. Rien à relire, donc
  // l'inventaire amputé passe pour l'inventaire complet.
  const e = await assertRejects(
    () => proxifier({ data: lignes(PLAFOND_LIGNES), error: null }, "contenu_tier_etat")
      .select("contenu_id").gt("passages_prevus", 0),
    Error,
    "contenu_tier_etat",
  );
  assertEquals(e.message.includes("1000"), true);
  assertEquals(e.message.includes("lireTout()"), true);
});

Deno.test("garde-fou — 999 lignes ne lèvent pas : seule la longueur au plafond est suspecte", async () => {
  const res = await proxifier({ data: lignes(PLAFOND_LIGNES - 1), error: null }).select("contenu_id");
  assertEquals((res as { data: unknown[] }).data.length, 999);
});

Deno.test("garde-fou — un .limit() sous le plafond déclare l'intention et fait taire l'alerte", async () => {
  const res = await proxifier({ data: lignes(PLAFOND_LIGNES), error: null }).select("id").limit(800);
  assertEquals((res as { data: unknown[] }).data.length, 1000);
});

Deno.test("garde-fou — un .limit(5000) n'est pas une borne : PostgREST plafonne quand même", async () => {
  // Les neuf .limit(5000) d'oubli_source.ts sont déjà tronqués aujourd'hui tout
  // en ayant l'air délibérés. La règle est « limit sous le plafond », pas
  // « limit présent ».
  await assertRejects(
    () => proxifier({ data: lignes(PLAFOND_LIGNES), error: null }, "contenus").select("id").limit(5000),
    Error,
    "Lecture tronquée",
  );
});

Deno.test("garde-fou — un .range() est une pagination assumée, il ne lève pas", async () => {
  // Sans cette issue, les deux seuls paginateurs corrects du dépôt
  // (import_contenu.ts, media_caption.ts) exploseraient à chaque page pleine.
  const res = await proxifier({ data: lignes(PLAFOND_LIGNES), error: null })
    .select("id").range(0, 999);
  assertEquals((res as { data: unknown[] }).data.length, 1000);
});

Deno.test("garde-fou — muet sur un objet seul (.single) et sur un comptage head:true", async () => {
  const unique = await proxifier({ data: { id: "x" }, error: null }).select("id");
  assertEquals((unique as { data: { id: string } }).data.id, "x");
  const compte = await proxifier({ data: null, error: null }).select("id");
  assertEquals((compte as { data: unknown }).data, null);
});

Deno.test("garde-fou — muet quand la réponse porte déjà une erreur : on ne double pas le diagnostic", async () => {
  const res = await proxifier({ data: null, error: { message: "Bad Request" } }).select("id");
  assertEquals((res as { error: { message: string } }).error.message, "Bad Request");
});

Deno.test("le Proxy survit au chaînage : un in(...) trop long lève même après un filtre", async () => {
  // Régression mesurée : toutes les méthodes de postgrest-js font `return this`,
  // donc l'ancienne garde `suite !== cible` rendait la cible BRUTE et le Proxy
  // était perdu au premier .eq(). verifierTailleIn ne voyait plus rien.
  const b = proxifier({ data: [], error: null }).select("id");
  assertThrows(
    () => b.eq("statut", "valide").order("id").in("id", lignes(IN_MAX_VALEURS + 1).map((l) => l.id)),
    Error,
    "lireParLots",
  );
});

Deno.test("le Proxy survit à la réaffectation `q = q.eq(...)`, le pire cas du dépôt", async () => {
  let q = proxifier({ data: lignes(PLAFOND_LIGNES), error: null }, "passages").select("id");
  q = q.eq("statut", "publie");
  q = q.order("date_publication_prevue");
  await assertRejects(() => q, Error, "passages");
});

Deno.test("le Proxy laisse passer await répété et Promise.all sans dupliquer la requête", async () => {
  const brut = new FauxFiltre({ data: lignes(3), error: null });
  const b = surveillerBuilder(brut as object) as unknown as PromiseLike<{ data: unknown[] }>;
  const [a, c] = await Promise.all([b, b]);
  assertEquals(a.data.length, 3);
  assertEquals(c.data.length, 3);
  // Comportement d'origine conservé : un builder n'est pas mémoïsé, deux await
  // = deux requêtes. Le garde-fou n'en ajoute aucune.
  assertEquals(brut.appelsThen, 2);
  const encore = await b;
  assertEquals(encore.data.length, 3);
  assertEquals(brut.appelsThen, 3);
});
