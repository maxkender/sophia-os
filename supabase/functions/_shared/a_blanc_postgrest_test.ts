/**
 * Test à blanc — analyse et évaluation du sous-ensemble PostgREST.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  analyserUrlPostgrest,
  comparerValeurs,
  estRequeteSimple,
  formeAccept,
  ligneCorrespond,
  parserListeIn,
  preferences,
  projeter,
  reponsePostgrest,
  trierEtCouper,
} from "./a_blanc_postgrest.ts";

const u = (q: string) => new URL(`https://x.supabase.co/rest/v1/passages?${q}`);

Deno.test("analyse : colonnes nues et * sont simples ; embeds, alias et casts ne le sont pas", () => {
  assertEquals(analyserUrlPostgrest(u("select=id,contenu_id")).select, ["id", "contenu_id"]);
  assertEquals(analyserUrlPostgrest(u("select=*")).select, "*");
  assertEquals(analyserUrlPostgrest(u("")).select, "*");
  for (const sel of ["id,posts!inner(est_test)", "id,posts(est_test)", "a:id", "id::text", "data->x"]) {
    const r = analyserUrlPostgrest(u(`select=${encodeURIComponent(sel)}`));
    assertEquals(r.selectSimple, false, sel);
    assertEquals(estRequeteSimple(r), false, sel);
  }
});

Deno.test("analyse : filtres eq/neq/gt/gte/lt/lte/in/is/like, négation, répétition", () => {
  const r = analyserUrlPostgrest(
    u(
      "select=id&compte_id=eq.k1&date_publication_prevue=gte.2026-10-01&date_publication_prevue=lte.2026-10-10" +
        "&statut=in.(brouillon,assigne)&post_id=is.null&media_id=not.is.null&storage_path=like.propre%2F%25" +
        "&tier=neq.D&position=gt.1&position=lt.9",
    ),
  );
  assert(estRequeteSimple(r));
  assertEquals(r.filtres.length, 10);
  assertEquals(r.filtres[3], { colonne: "statut", op: "in", negation: false, valeur: ["brouillon", "assigne"] });
  assertEquals(r.filtres[5], { colonne: "media_id", op: "is", negation: true, valeur: "null" });
  assertEquals(r.filtres[6].valeur, "propre/%");
});

Deno.test("analyse : colonne embarquée, or=, opérateurs inconnus → non évaluables", () => {
  for (const q of ["posts.est_test=eq.false", "or=(a.eq.1,b.eq.2)", "and=(a.eq.1)", "tags=cs.{a}", "x=fts.chat", "x=eq(any).{1}"]) {
    const r = analyserUrlPostgrest(u(q));
    assertEquals(r.filtresEvaluables, false, q);
    assert(r.raisons.length > 0, q);
  }
});

Deno.test("analyse : order à plusieurs colonnes, nulls par défaut de PostgreSQL ; limit / offset", () => {
  const r = analyserUrlPostgrest(u("order=date_publication_prevue.desc,created_at.asc.nullsfirst,id&limit=10&offset=5"));
  assertEquals(r.ordre, [
    { colonne: "date_publication_prevue", asc: false, nullsFirst: true },
    { colonne: "created_at", asc: true, nullsFirst: true },
    { colonne: "id", asc: true, nullsFirst: false },
  ]);
  assertEquals([r.limite, r.offset], [10, 5]);
  assertEquals(estRequeteSimple(analyserUrlPostgrest(u("order=posts(created_at)"))), false);
});

Deno.test("in : guillemets, virgules et parenthèses dans les valeurs", () => {
  assertEquals(parserListeIn('(a,"b,c","d)e",f)'), ["a", "b,c", "d)e", "f"]);
  assertEquals(parserListeIn('("x\\"y")'), ['x"y']);
  assertEquals(parserListeIn("()"), []);
});

Deno.test("évaluation : booléens, nombres, null (logique à trois valeurs), dates ISO, uuid", () => {
  const l = {
    id: "0b1e7a4e-1111-4222-8333-444455556666",
    est_test: false,
    passages_prevus: 0,
    post_id: null,
    created_at: "2026-10-09T04:00:03.836+00:00",
    jour: "2026-10-10",
  };
  const f = (q: string) => analyserUrlPostgrest(u(q)).filtres;
  assert(ligneCorrespond(l, f("est_test=eq.false")));
  assert(!ligneCorrespond(l, f("est_test=eq.true")));
  assert(ligneCorrespond(l, f("passages_prevus=eq.0")));
  assert(ligneCorrespond(l, f("post_id=is.null")));
  assert(!ligneCorrespond(l, f("post_id=not.is.null")));
  // NULL = x et NOT (NULL = x) sont tous deux « inconnus » : la ligne ne passe pas.
  assert(!ligneCorrespond(l, f("post_id=eq.a")));
  assert(!ligneCorrespond(l, f("post_id=not.eq.a")));
  assert(!ligneCorrespond(l, f("post_id=neq.a")));
  assert(ligneCorrespond(l, f("created_at=eq.2026-10-09T04:00:03.836Z")));
  assert(ligneCorrespond(l, f("created_at=lt.2026-10-09T05:00:00Z")));
  assert(ligneCorrespond(l, f("jour=lte.2026-10-10&jour=gt.2026-10-09")));
  assert(ligneCorrespond(l, f("id=in.(x,0b1e7a4e-1111-4222-8333-444455556666)")));
  assert(ligneCorrespond(l, f("id=gt.0a")));
});

Deno.test("comparaison : numérique pour les nombres (10 après 2), texte sinon", () => {
  assert(comparerValeurs(10, "2") > 0);
  assert(comparerValeurs(2, 10) < 0);
  assert(comparerValeurs("10", "2") < 0, "deux textes : ordre texte");
  assertEquals(comparerValeurs(true, "true"), 0);
});

Deno.test("tri et coupe : stable, nulls selon l'ordre, offset puis limit", () => {
  const lignes = [
    { id: "c", position: 10 },
    { id: "a", position: 2 },
    { id: "b", position: null },
    { id: "d", position: 2 },
  ];
  const asc = analyserUrlPostgrest(u("order=position")).ordre;
  assertEquals(trierEtCouper(lignes, asc, null, null).map((l) => l.id), ["a", "d", "c", "b"]);
  const desc = analyserUrlPostgrest(u("order=position.desc")).ordre;
  assertEquals(trierEtCouper(lignes, desc, null, null).map((l) => l.id), ["b", "c", "a", "d"]);
  assertEquals(trierEtCouper(lignes, asc, 2, 1).map((l) => l.id), ["d", "c"]);
});

Deno.test("projection, préférences et Accept", () => {
  assertEquals(projeter({ id: "1", a: 2, b: { c: 3 } }, ["id", "b", "z"]), { id: "1", b: { c: 3 }, z: null });
  assertEquals([...preferences("return=representation, resolution=merge-duplicates")], [
    "return=representation",
    "resolution=merge-duplicates",
  ]);
  assertEquals(formeAccept(null), "tableau");
  assertEquals(formeAccept("application/json"), "tableau");
  assertEquals(formeAccept("application/vnd.pgrst.object+json"), "objet");
  assertEquals(formeAccept("application/vnd.pgrst.object+json;nulls=stripped"), "inconnue");
  assertEquals(formeAccept("text/csv"), "inconnue");
});

Deno.test("réponse PostgREST : objet (1 ligne), 406 PGRST116 sinon (avec « 0 rows »), tableau", async () => {
  const un = reponsePostgrest([{ id: "1" }], true, 201);
  assertEquals(un.status, 201);
  assertEquals(await un.json(), { id: "1" });
  const zero = reponsePostgrest([], true);
  assertEquals(zero.status, 406);
  const corps = await zero.json();
  assertEquals(corps.code, "PGRST116");
  assert(String(corps.details).includes("0 rows"));
  assertEquals((await reponsePostgrest([{ id: "1" }, { id: "2" }], true).json()).details, "The result contains 2 rows");
  assertEquals(await reponsePostgrest([{ id: "1" }], false).json(), [{ id: "1" }]);
});
