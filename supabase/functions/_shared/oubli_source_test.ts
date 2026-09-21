/**
 * L'oubli d'une source : tout lire AVANT de détruire quoi que ce soit.
 *
 * `supprimerContenus` inventoriait les médias APRÈS avoir supprimé les posts.
 * Cette lecture-là n'avait pas été paginée quand `apercuOubli` l'a été, alors
 * qu'elle porte sur les mêmes lignes et avec le même chiffre au tableau : « un
 * slideshow porte 8 à 20 images », donc un paquet de 60 slideshows ramène 480 à
 * 1200 lignes `media_library`.
 *
 * Deux façons d'en mourir, selon l'époque :
 *   - avant le garde-fou, la lecture tronquée laissait des médias orphelins,
 *     dont le `storage_path` (unique) bloque ensuite le ré-import de la source ;
 *   - depuis, elle LÈVE — et elle levait après la suppression irréversible des
 *     posts, c'est-à-dire au pire moment possible.
 *
 * D'où l'invariant testé ici, plus fort que « la lecture est paginée » : aucune
 * destruction n'est émise tant que l'inventaire n'est pas complet.
 */

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";

import { PLAFOND_LIGNES } from "./lots.ts";
import { supprimerContenus } from "./oubli_source.ts";

interface Ligne {
  id: string;
  [k: string]: unknown;
}

/** Une destruction émise : c'est la liste que les tests inspectent. */
interface Destruction {
  table: string;
  combien: number;
}

function ids(prefixe: string, combien: number): string[] {
  return Array.from(
    { length: combien },
    (_, i) => `${prefixe}${String(i).padStart(5, "0")}`,
  );
}

function fauxClient(
  tables: Record<string, Ligne[]>,
  destructions: Destruction[],
  opts: { erreurs?: Record<string, string> } = {},
) {
  const from = (table: string) => {
    const etat = {
      supprime: false,
      apres: null as string | null,
      limite: null as number | null,
      filtreIn: null as string[] | null,
      colonneIn: null as string | null,
    };

    const maillon = {
      select: (_c: string) => maillon,
      delete: () => {
        etat.supprime = true;
        return maillon;
      },
      eq: (_c: string, _v: unknown) => maillon,
      not: (_c: string, _op: string, _v: unknown) => maillon,
      in: (colonne: string, valeurs: string[]) => {
        etat.colonneIn = colonne;
        etat.filtreIn = valeurs;
        return maillon;
      },
      gt: (_c: string, valeur: string) => {
        etat.apres = valeur;
        return maillon;
      },
      order: (_c: string, _o?: unknown) => maillon,
      limit: (n: number) => {
        etat.limite = n;
        return maillon;
      },
      then: (
        onfulfilled?: (v: { data: Ligne[] | null; error: { message: string } | null }) => unknown,
        _onrejected?: (r: unknown) => unknown,
      ) => {
        if (etat.supprime) {
          destructions.push({ table, combien: etat.filtreIn?.length ?? 0 });
          return Promise.resolve(onfulfilled?.({ data: null, error: null }));
        }

        const erreur = opts.erreurs?.[`${table}:${etat.colonneIn}`];
        if (erreur) {
          return Promise.resolve(onfulfilled?.({ data: null, error: { message: erreur } }));
        }

        let lignes = (tables[table] ?? []).filter((l) =>
          etat.filtreIn === null || etat.filtreIn.includes(String(l[etat.colonneIn!]))
        );
        lignes = [...lignes].sort((a, b) => (a.id < b.id ? -1 : 1));
        if (etat.apres !== null) lignes = lignes.filter((l) => l.id > etat.apres!);

        // max-rows PAR-DESSUS le limit demandé, en 200 sans erreur.
        const coupe = Math.min(etat.limite ?? PLAFOND_LIGNES, PLAFOND_LIGNES);
        return Promise.resolve(onfulfilled?.({ data: lignes.slice(0, coupe), error: null }));
      },
    };
    return maillon;
  };

  const storage = {
    from: (_bucket: string) => ({
      remove: (chemins: string[]) => {
        destructions.push({ table: "storage", combien: chemins.length });
        return Promise.resolve({ error: null });
      },
      list: (_prefixe: string, _o?: unknown) => Promise.resolve({ data: [], error: null }),
    }),
  };

  // deno-lint-ignore no-explicit-any
  return { from, storage } as any;
}

/** 60 slideshows — le plafond du lot côté Edge Function — et leurs médias. */
function monde(mediasParContenu: number) {
  const contenuIds = ids("c", 60);
  const contenus: Ligne[] = contenuIds.map((id) => ({
    id,
    source_url: null,
    structure_slides: [],
  }));
  const passages: Ligne[] = contenuIds.flatMap((cid, i) =>
    Array.from({ length: 20 }, (_, k) => ({
      id: `p${String(i * 20 + k).padStart(5, "0")}`,
      contenu_id: cid,
      post_id: `post${String(i * 20 + k).padStart(5, "0")}`,
    }))
  );
  const media_library: Ligne[] = contenuIds.flatMap((cid, i) =>
    Array.from({ length: mediasParContenu }, (_, k) => ({
      id: `m${String(i * mediasParContenu + k).padStart(6, "0")}`,
      contenu_id: cid,
      compte_reference_id: "src1",
      storage_path: `propre/${cid}/${k}.jpg`,
    }))
  );
  return { contenuIds, tables: { contenus, passages, media_library } };
}

const silence = () => {};

Deno.test("inventaire des médias illisible : AUCUNE destruction n'est émise", async () => {
  const { contenuIds, tables } = monde(20);
  const destructions: Destruction[] = [];
  const supabase = fauxClient(tables, destructions, {
    // La lecture qui manquait : `media_library` filtré sur `contenu_id`.
    erreurs: { "media_library:contenu_id": "statement timeout" },
  });

  await assertRejects(
    () => supprimerContenus(supabase, "src1", contenuIds, silence),
    Error,
    "Lecture des images liées",
  );

  assertEquals(
    destructions,
    [],
    "les posts étaient détruits AVANT cet inventaire : leur suppression est " +
      "irréversible, l'inventaire ne l'est pas — il passe donc devant",
  );
});

Deno.test("1200 médias sur 60 slideshows : tous inventoriés, tous supprimés", async () => {
  // 60 × 20 = 1200 lignes, soit au-dessus du plafond PostgREST. Sans pagination
  // la lecture s'arrêtait à 1000 : 200 médias restaient en base, leurs fichiers
  // dans le bucket, et `media_library.storage_path` étant unique, le ré-import
  // de la source butait dessus.
  const { contenuIds, tables } = monde(20);
  const destructions: Destruction[] = [];
  const supabase = fauxClient(tables, destructions);

  const compteurs = await supprimerContenus(supabase, "src1", contenuIds, silence);

  assertEquals(compteurs.medias, 1200, "les 1200 médias doivent être inventoriés, pas 1000");
  assertEquals(compteurs.contenus, 60);

  const total = (t: string) =>
    destructions.filter((d) => d.table === t).reduce((n, d) => n + d.combien, 0);
  assertEquals(total("media_library"), 1200, "et supprimés en base");
  assertEquals(total("storage"), 1200, "et retirés du bucket");
  assertEquals(total("contenus"), 60);
});

Deno.test("l'ordre des destructions reste celui qu'imposent les FK", async () => {
  const { contenuIds, tables } = monde(3);
  const destructions: Destruction[] = [];
  const supabase = fauxClient(tables, destructions);

  await supprimerContenus(supabase, "src1", contenuIds, silence);

  const ordre = destructions.map((d) => d.table).filter((t, i, a) => t !== a[i - 1]);
  assertEquals(
    ordre,
    ["posts", "storage", "media_library", "contenus"],
    "hisser les lectures ne devait pas réordonner les suppressions : les posts " +
      "référencent les médias, qui référencent les slideshows",
  );
});

Deno.test("les posts assignés sont lus en entier avant d'être détruits", async () => {
  // 60 × 20 = 1200 passages porteurs d'un post : même dépassement de plafond
  // que les médias, sur une lecture qui n'avait jamais été signalée.
  const { contenuIds, tables } = monde(1);
  const destructions: Destruction[] = [];
  const supabase = fauxClient(tables, destructions);

  const compteurs = await supprimerContenus(supabase, "src1", contenuIds, silence);

  assertEquals(compteurs.posts, 1200, "1200 posts à détruire, pas 1000");
  const posts = destructions.filter((d) => d.table === "posts");
  assertEquals(posts.reduce((n, d) => n + d.combien, 0), 1200);
  assert(posts.length > 1, "le in(...) reste découpé : 1200 ids ne tiennent pas dans une URL");
});
