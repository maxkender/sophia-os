/**
 * Le plancher de slides à l'import.
 *
 * Ce qu'on protège : un diaporama de moins de trois slides n'a plus de corps.
 * Il ne reste qu'une accroche et le placement de l'application, et le
 * placement se retrouve seul — le 12/10/2026 un créateur allemand a reçu deux
 * photos dont la seconde s'ouvrait sur « 6. », en continuant une liste absente
 * du deck. 217 contenus étaient dans ce cas.
 *
 * Deux barrières, et les deux comptent :
 *   - la CRÉATION, pour qu'un deck trop court ne coûte pas un seul appel de
 *     modèle (OCR, pertinence, ELO, nettoyage, traduction viennent après) ;
 *   - la VALIDATION finale, parce que c'est elle qui ouvre le contenu au
 *     tirage (le pool ne lit que `statut = valide`) et qu'aucun chemin ne doit
 *     pouvoir y arriver en passant à côté de la première.
 *
 * Le test tourne SANS accès réseau : `stockerVisuelBrut` échoue alors au
 * téléchargement, rattrape, et rend l'URL source. Le NOMBRE de slides, seul
 * sujet ici, reste celui de `post.imageUrls`.
 */

import { assertEquals } from "jsr:@std/assert@1";

import {
  creerContenuDepuisPost,
  deckTropCourt,
  motifDeckTropCourt,
  SLIDES_MIN,
} from "./import_contenu.ts";
import type { ScrapedPost } from "./apify.ts";

type Ligne = Record<string, unknown>;

/** Faux PostgREST minimal : on ne regarde que ce qui est écrit dans `contenus`. */
function fauxClient(tables: Record<string, Ligne[]> = {}) {
  const from = (table: string) => {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let valeurs: unknown = null;
    let unique = false;
    const filtres: Array<[string, unknown]> = [];
    const lignes = (): Ligne[] => (tables[table] ??= []);
    const executer = () => {
      const filtrer = () => lignes().filter((l) => filtres.every(([c, v]) => l[c] === v));
      let data: Ligne[] = [];
      if (op === "select") data = filtrer();
      else if (op === "insert") {
        const v = (Array.isArray(valeurs) ? valeurs : [valeurs]) as Ligne[];
        const crees = v.map((x) => ({ id: `${table}-${lignes().length + 1}`, ...x }));
        lignes().push(...crees);
        data = crees;
      } else if (op === "update") {
        data = filtrer();
        for (const l of data) Object.assign(l, valeurs);
      } else if (op === "delete") {
        data = filtrer();
        tables[table] = lignes().filter((l) => !data.includes(l));
      }
      return { data: unique ? (data[0] ?? null) : data, error: null, status: 200 };
    };
    const maillon = {
      select: () => maillon,
      insert: (v: unknown) => ((op = "insert"), (valeurs = v), maillon),
      update: (v: unknown) => ((op = "update"), (valeurs = v), maillon),
      delete: () => ((op = "delete"), maillon),
      eq: (c: string, v: unknown) => (filtres.push([c, v]), maillon),
      in: () => maillon,
      is: () => maillon,
      // `trouverContenuParUrl` cherche aussi la variante /photo/ vs /video/ :
      // le faux client n'a rien à y faire rendre, mais doit tenir la chaîne.
      or: () => maillon,
      order: () => maillon,
      limit: () => maillon,
      maybeSingle: () => ((unique = true), maillon),
      single: () => ((unique = true), maillon),
      then: (ok?: (v: unknown) => unknown, ko?: (r: unknown) => unknown) =>
        Promise.resolve(executer()).then(ok, ko),
    };
    return maillon;
  };
  // deno-lint-ignore no-explicit-any
  return { client: { from } as any, tables };
}

function post(nbImages: number): ScrapedPost {
  return {
    postId: `tt-${nbImages}`,
    webVideoUrl: `https://www.tiktok.com/@x/video/${nbImages}`,
    text: "un titre",
    imageUrls: Array.from({ length: nbImages }, (_, i) => `https://exemple.invalid/${i + 1}.jpg`),
    musicUrl: null,
    musicTitle: null,
    createTime: null,
    stats: { vues: 1000, likes: 0, commentaires: 0, partages: 0 },
    auteur: { abonnes: null, lienBio: null },
  };
}

async function importer(nbImages: number): Promise<Ligne> {
  const { client, tables } = fauxClient();
  await creerContenuDepuisPost(client, post(nbImages), null, null, "fr");
  return (tables["contenus"] ?? [])[0] ?? {};
}

Deno.test("le plancher est à trois slides", () => {
  assertEquals(SLIDES_MIN, 3);
});

Deno.test("deckTropCourt : la frontière est entre 2 et 3", () => {
  assertEquals(deckTropCourt([1, 2]), true);
  assertEquals(deckTropCourt([1, 2, 3]), false);
  assertEquals(deckTropCourt([1, 2, 3, 4, 5, 6, 7]), false);
});

Deno.test("deckTropCourt : un deck vide ou absent est trop court, jamais une erreur", () => {
  assertEquals(deckTropCourt([]), true);
  assertEquals(deckTropCourt(null), true);
  assertEquals(deckTropCourt(undefined), true);
});

Deno.test("le motif de refus dit le compte et le seuil, au singulier comme au pluriel", () => {
  assertEquals(motifDeckTropCourt(1), "1 slide seulement, minimum 3 — TikTok non importé");
  assertEquals(motifDeckTropCourt(2), "2 slides seulement, minimum 3 — TikTok non importé");
});

Deno.test("import : un diaporama d'une seule photo est rejeté dès la création", async () => {
  const ligne = await importer(1);
  assertEquals(ligne.statut, "rejete");
  assertEquals(ligne.import_statut, "done");
  assertEquals(ligne.import_etape, "trop_court");
  assertEquals(ligne.import_erreur, motifDeckTropCourt(1));
});

Deno.test("import : deux photos, c'est encore trop court", async () => {
  const ligne = await importer(2);
  assertEquals(ligne.statut, "rejete");
  assertEquals(ligne.import_etape, "trop_court");
});

Deno.test("import : à trois photos le contenu entre normalement dans le pipeline", async () => {
  const ligne = await importer(3);
  // `brouillon` + `pending` : c'est le pipeline qui décidera de le valider ou
  // non. Le plancher ne se prononce que sur la longueur.
  assertEquals(ligne.statut, "brouillon");
  assertEquals(ligne.import_statut, "pending");
  assertEquals(ligne.import_etape, null);
  assertEquals(ligne.import_erreur, null);
});

Deno.test("import : un deck long n'est évidemment pas touché", async () => {
  const ligne = await importer(8);
  assertEquals(ligne.statut, "brouillon");
  assertEquals((ligne.structure_slides as unknown[]).length, 8);
});

Deno.test("un contenu rejeté pour longueur garde sa ligne et son URL source", async () => {
  // On ne crée pas « rien » : sans ligne, `trouverContenuParUrl` ne
  // reconnaîtrait pas le TikTok et chaque scrape le retenterait.
  const { client, tables } = fauxClient();
  const p = post(2);
  await creerContenuDepuisPost(client, p, null, null, "fr");
  const ligne = (tables["contenus"] ?? [])[0] ?? {};
  assertEquals(ligne.source_url, p.webVideoUrl);
  assertEquals((tables["contenus"] ?? []).length, 1);
});
