/**
 * Le rattrapage de captions lu EN ENTIER.
 *
 * `listerMediasARattraper` était l'un des deux seuls paginateurs du dépôt, et
 * il paginait par `.range(offset, offset + 999)` trié sur `created_at` seul.
 * Deux défauts, un seul symptôme : des médias jamais captionnés, et invisibles
 * au rattrapage suivant puisqu'il refaisait le même saut.
 *
 * Le faux PostgREST ci-dessous reproduit les deux causes réelles plutôt que de
 * les supposer :
 *   - `max-rows` s'applique PAR-DESSUS le `limit` demandé, en répondant 200 ;
 *   - les ex aequo sur `created_at` ne sortent PAS dans un ordre stable d'une
 *     requête à l'autre (Postgres n'en promet aucun), ce qu'on modélise en les
 *     faisant tourner à chaque appel.
 */

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";

import { PLAFOND_LIGNES } from "./lots.ts";
import {
  assurerHookMedia,
  idLabelHook,
  listerMediasARattraper,
  oublierIdLabelHook,
} from "./media_caption.ts";

interface Media {
  id: string;
  url: string;
  created_at: string;
  caption_statut: string | null;
  storage_path: string;
}

/** Ce qu'une requête a demandé — pour prouver la FORME des pages, pas seulement leur contenu. */
interface Trace {
  table: string;
  limite: number | null;
  offset: [number, number] | null;
  or: string | null;
  colonnesOrdre: string[];
}

function idMedia(n: number): string {
  return `m${String(n).padStart(5, "0")}`;
}

/**
 * Stock de test : `parGroupe` médias partagent exactement le même `created_at`.
 * C'est le cas nominal, pas un cas tordu — un import écrit des dizaines de
 * lignes dans la même milliseconde.
 */
function stock(combien: number, parGroupe = 500): Media[] {
  return Array.from({ length: combien }, (_, i) => ({
    id: idMedia(i),
    url: `https://exemple/${i}.jpg`,
    created_at: `2025-09-0${1 + Math.floor(i / parGroupe)}T00:00:00.000Z`,
    caption_statut: null,
    storage_path: `propre/c${i}/1.jpg`,
  }));
}

function fauxClient(
  medias: Media[],
  traces: Trace[],
  opts: { erreurs?: Array<string | null>; exAequoInstables?: boolean } = {},
) {
  const erreurs = [...(opts.erreurs ?? [])];
  let tour = 0;

  const from = (table: string) => {
    const etat: Trace = { table, limite: null, offset: null, or: null, colonnesOrdre: [] };

    const maillon = {
      select: (_c: string) => maillon,
      like: (_c: string, _v: string) => maillon,
      is: (_c: string, _v: unknown) => maillon,
      eq: (_c: string, _v: unknown) => maillon,
      in: (_c: string, _v: unknown[]) => maillon,
      gt: (_c: string, _v: unknown) => maillon,
      or: (filtre: string) => {
        etat.or = filtre;
        return maillon;
      },
      order: (colonne: string, _opts?: unknown) => {
        etat.colonnesOrdre.push(colonne);
        return maillon;
      },
      range: (a: number, b: number) => {
        etat.offset = [a, b];
        return maillon;
      },
      limit: (n: number) => {
        etat.limite = n;
        return maillon;
      },
      then: (
        onfulfilled?: (v: { data: unknown[] | null; error: { message: string } | null }) => unknown,
        _onrejected?: (r: unknown) => unknown,
      ) => {
        traces.push({ ...etat, colonnesOrdre: [...etat.colonnesOrdre] });
        tour += 1;

        const erreur = erreurs.shift() ?? null;
        if (erreur) {
          return Promise.resolve(onfulfilled?.({ data: null, error: { message: erreur } }));
        }
        // Le second volet (hooks) n'est pas le sujet de ces tests : stock vide.
        if (table !== "media_library" || etat.colonnesOrdre.length === 0) {
          return Promise.resolve(onfulfilled?.({ data: [], error: null }));
        }

        let lignes = medias.filter((m) => m.caption_statut === null);

        // Tri : `created_at` d'abord, puis les colonnes suivantes si la requête
        // en demande. Sans second critère, les ex aequo tournent — c'est le
        // point précis que l'ancienne pagination supposait impossible.
        lignes = [...lignes].sort((a, b) => {
          if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
          if (etat.colonnesOrdre.includes("id")) return a.id < b.id ? -1 : 1;
          return 0;
        });
        if (opts.exAequoInstables && !etat.colonnesOrdre.includes("id")) {
          const groupes = new Map<string, Media[]>();
          for (const m of lignes) {
            const g = groupes.get(m.created_at) ?? [];
            g.push(m);
            groupes.set(m.created_at, g);
          }
          lignes = [...groupes.values()].flatMap((g) => {
            const d = tour % g.length;
            return [...g.slice(d), ...g.slice(0, d)];
          });
        }

        if (etat.or) {
          // `created_at.gt.X,and(created_at.eq.X,id.gt.Y)`
          const m = etat.or.match(
            /created_at\.gt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.gt\.([^)]+)\)/,
          );
          assert(m, `filtre keyset illisible : ${etat.or}`);
          const [, borneDate, memeDate, borneId] = m!;
          lignes = lignes.filter((l) =>
            l.created_at > borneDate || (l.created_at === memeDate && l.id > borneId)
          );
        }

        if (etat.offset) lignes = lignes.slice(etat.offset[0], etat.offset[1] + 1);

        // max-rows PAR-DESSUS le limit demandé, réponse 200 sans error.
        const coupe = Math.min(etat.limite ?? PLAFOND_LIGNES, PLAFOND_LIGNES);
        return Promise.resolve(onfulfilled?.({ data: lignes.slice(0, coupe), error: null }));
      },
    };
    return maillon;
  };

  // deno-lint-ignore no-explicit-any
  return { from } as any;
}

const PAR_GROUPE = 700; // ne divise PAS la page de 1000 de l'ancien offset

Deno.test("2500 médias sans caption : tous lus, aucun doublon, malgré les ex aequo", async () => {
  const medias = stock(2500, PAR_GROUPE);
  const traces: Trace[] = [];
  const supabase = fauxClient(medias, traces, { exAequoInstables: true });

  const out = await listerMediasARattraper(supabase, { limit: 20_000 });

  assertEquals(out.length, 2500, "le stock entier doit être rendu");
  assertEquals(new Set(out.map((m) => m.id)).size, 2500, "aucun média lu deux fois");
  assertEquals(
    new Set(out.map((m) => m.id)),
    new Set(medias.map((m) => m.id)),
    "aucun média sauté",
  );
});

Deno.test("l'ordre de page est TOTAL : created_at départagé par la clé primaire", async () => {
  const traces: Trace[] = [];
  const supabase = fauxClient(stock(1200), traces);

  await listerMediasARattraper(supabase, { limit: 20_000 });

  const pages = traces.filter((t) => t.table === "media_library" && t.colonnesOrdre.length > 0);
  assert(pages.length >= 2, "il faut plusieurs pages pour que la question se pose");
  for (const p of pages) {
    assertEquals(
      p.colonnesOrdre,
      ["created_at", "id"],
      "created_at seul n'est pas unique : sans second critère, deux pages peuvent " +
        "se recouvrir ou laisser un trou entre elles",
    );
    assertEquals(p.offset, null, "plus aucun offset : la reprise se fait sur la dernière ligne VUE");
  }
});

Deno.test("la page demandée reste STRICTEMENT sous le plafond PostgREST", async () => {
  const traces: Trace[] = [];
  const supabase = fauxClient(stock(1200), traces);

  await listerMediasARattraper(supabase, { limit: 20_000 });

  for (const p of traces.filter((t) => t.table === "media_library" && t.colonnesOrdre.length > 0)) {
    assert(p.limite !== null, "chaque page déclare sa borne");
    assert(
      p.limite! < PLAFOND_LIGNES,
      `page de ${p.limite} lignes : à 1000 pile, un max-rows abaissé rognerait la ` +
        `première page et la boucle s'arrêterait en se croyant complète`,
    );
  }
});

Deno.test("l'ancienne pagination par offset, elle, sautait des médias", async () => {
  // Reconstitution de la version d'avant, sur le MÊME faux serveur : offset +
  // tri sur `created_at` seul. Le test échouerait si le faux serveur était
  // complaisant — c'est lui qui prouve que le correctif porte sur du réel.
  const medias = stock(2500, PAR_GROUPE);
  const traces: Trace[] = [];
  const supabase = fauxClient(medias, traces, { exAequoInstables: true });

  const vus = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await supabase
      .from("media_library")
      .select("id, url")
      .like("storage_path", "propre/%")
      .is("caption_statut", null)
      .order("created_at", { ascending: true })
      .range(offset, offset + 999);
    if (!data?.length) break;
    for (const m of data as Media[]) vus.add(m.id);
    if (data.length < 1000) break;
  }

  assert(
    vus.size < 2500,
    `l'offset aurait dû laisser des médias derrière lui (vus : ${vus.size}/2500)`,
  );
});

Deno.test("le quota de l'appelant est respecté sans lire tout le stock", async () => {
  const traces: Trace[] = [];
  const supabase = fauxClient(stock(2500), traces);

  const out = await listerMediasARattraper(supabase, { limit: 10 });

  assertEquals(out.length, 10);
  const pages = traces.filter((t) => t.table === "media_library" && t.colonnesOrdre.length > 0);
  assertEquals(pages.length, 1, "un quota de 10 ne doit pas déclencher un balayage complet");
  assertEquals(pages[0].limite, 10, "la page est rognée au quota, pas l'inverse");
});

Deno.test("une lecture ratée est REMONTÉE, pas confondue avec un stock vide", async () => {
  const traces: Trace[] = [];
  const supabase = fauxClient(stock(50), traces, { erreurs: ["statement timeout"] });

  // Rendre `[]` ici ferait conclure « plus rien à captionner » : le drain
  // s'arrêterait et le stock resterait sans caption, silencieusement.
  await assertRejects(
    () => listerMediasARattraper(supabase, { limit: 100 }),
    Error,
    "statement timeout",
  );
});

// ─── Label Hook ────────────────────────────────────────────────────────────
//
// Depuis 0211, le slug `hook` existait DEUX fois (Sophia + copie micabo).
// L'ancien `.eq("slug","hook").maybeSingle()` recevait une erreur PostgREST
// (plusieurs lignes), rendait `null`… et le mettait en cache pour la vie de
// l'isolate : 948 médias `est_hook` sans label Hook. Le faux serveur ci-dessous
// reproduit ce refus de `maybeSingle` sur 2 lignes, pour que le test échoue si
// quelqu'un y revient.

interface Label {
  id: string;
  slug: string;
  created_at: string;
}

interface Appels {
  lecturesLabels: number;
  ordres: string[][];
  limites: Array<number | null>;
  upserts: Array<{ media_id: string; label_id: string }>;
  flags: string[];
}

function fauxClientLabels(
  labels: Label[],
  opts: { erreurs?: Array<string | null> } = {},
) {
  const erreurs = [...(opts.erreurs ?? [])];
  const appels: Appels = { lecturesLabels: 0, ordres: [], limites: [], upserts: [], flags: [] };

  const from = (table: string) => {
    const filtres: Array<[string, unknown]> = [];
    const ordre: string[] = [];
    let limite: number | null = null;
    let maj = false;

    const champ = (l: Label, c: string) => String((l as unknown as Record<string, unknown>)[c]);

    const resoudre = (): { data: unknown; error: { message: string } | null } => {
      if (table === "labels") {
        appels.lecturesLabels += 1;
        appels.ordres.push([...ordre]);
        appels.limites.push(limite);
        const erreur = erreurs.shift() ?? null;
        if (erreur) return { data: null, error: { message: erreur } };
        let lignes = labels.filter((l) => filtres.every(([c, v]) => champ(l, c) === v));
        // Sans ORDER BY, Postgres ne promet rien : on rend l'ordre d'insertion
        // INVERSÉ, pour qu'un code qui oublierait le tri prenne la mauvaise.
        if (ordre.length === 0) {
          lignes = [...lignes].reverse();
        } else {
          lignes = [...lignes].sort((a, b) => {
            for (const c of ordre) {
              if (champ(a, c) !== champ(b, c)) return champ(a, c) < champ(b, c) ? -1 : 1;
            }
            return 0;
          });
        }
        if (limite !== null) lignes = lignes.slice(0, limite);
        return { data: lignes.map((l) => ({ id: l.id })), error: null };
      }
      if (table === "media_library" && maj) {
        appels.flags.push(String(filtres.find(([c]) => c === "id")?.[1]));
      }
      return { data: null, error: null };
    };

    const maillon = {
      // Les arguments ignorés (colonnes, options) sont simplement omis.
      select: () => maillon,
      eq: (c: string, v: unknown) => {
        filtres.push([c, v]);
        return maillon;
      },
      order: (c: string) => {
        ordre.push(c);
        return maillon;
      },
      limit: (n: number) => {
        limite = n;
        return maillon;
      },
      update: () => {
        maj = true;
        return maillon;
      },
      upsert: (ligne: { media_id: string; label_id: string }) => {
        appels.upserts.push(ligne);
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle: () => {
        const r = resoudre();
        const lignes = (r.data as unknown[] | null) ?? [];
        if (!r.error && lignes.length > 1) {
          return Promise.resolve({
            data: null,
            error: { message: "JSON object requested, multiple (or no) rows returned" },
          });
        }
        return Promise.resolve({ data: lignes[0] ?? null, error: r.error });
      },
      then: (
        onfulfilled?: (v: { data: unknown; error: { message: string } | null }) => unknown,
      ) => Promise.resolve(onfulfilled?.(resoudre())),
    };
    return maillon;
  };

  return { supabase: { from } as unknown as Parameters<typeof idLabelHook>[0], appels };
}

const HOOK_SOPHIA: Label = { id: "lab-hook-sophia", slug: "hook", created_at: "2025-06-01T00:00:00Z" };
const HOOK_COPIE: Label = { id: "lab-hook-copie", slug: "hook", created_at: "2026-03-10T00:00:00Z" };
const NICHE: Label = { id: "lab-niche", slug: "clean-girl", created_at: "2025-01-01T00:00:00Z" };

Deno.test("Hook en double : le plus ancien est rendu, jamais une erreur maybeSingle", async () => {
  oublierIdLabelHook();
  // Ordre d'insertion choisi pour que, sans tri, le faux serveur rende la copie.
  const { supabase, appels } = fauxClientLabels([NICHE, HOOK_SOPHIA, HOOK_COPIE]);

  assertEquals(await idLabelHook(supabase), HOOK_SOPHIA.id);
  assertEquals(appels.ordres[0], ["created_at", "id"], "tri déterministe, même règle que 0257");
  assertEquals(appels.limites[0], 1);
});

Deno.test("Hook à created_at égal : l'id départage", async () => {
  oublierIdLabelHook();
  const a: Label = { id: "lab-a", slug: "hook", created_at: "2025-06-01T00:00:00Z" };
  const b: Label = { id: "lab-b", slug: "hook", created_at: "2025-06-01T00:00:00Z" };
  const { supabase } = fauxClientLabels([a, b]);

  assertEquals(await idLabelHook(supabase), "lab-a");
});

Deno.test("Hook trouvé : mémorisé, la base n'est plus relue", async () => {
  oublierIdLabelHook();
  const { supabase, appels } = fauxClientLabels([HOOK_SOPHIA]);

  assertEquals(await idLabelHook(supabase), HOOK_SOPHIA.id);
  assertEquals(await idLabelHook(supabase), HOOK_SOPHIA.id);
  assertEquals(appels.lecturesLabels, 1);
});

Deno.test("lecture du Hook en erreur : null pour CET appel, l'appel suivant relit", async () => {
  oublierIdLabelHook();
  const { supabase, appels } = fauxClientLabels([HOOK_SOPHIA], { erreurs: ["fetch failed"] });

  assertEquals(await idLabelHook(supabase), null);
  // L'ancien cache figeait ce null jusqu'au recyclage de l'isolate.
  assertEquals(await idLabelHook(supabase), HOOK_SOPHIA.id);
  assertEquals(appels.lecturesLabels, 2);
});

Deno.test("Hook absent : null non mémorisé (le label peut être créé entre-temps)", async () => {
  oublierIdLabelHook();
  const labels: Label[] = [NICHE];
  const { supabase, appels } = fauxClientLabels(labels);

  assertEquals(await idLabelHook(supabase), null);
  labels.push(HOOK_SOPHIA);
  assertEquals(await idLabelHook(supabase), HOOK_SOPHIA.id);
  assertEquals(appels.lecturesLabels, 2);
});

Deno.test("assurerHookMedia pose le flag ET le label Hook malgré un slug en double", async () => {
  oublierIdLabelHook();
  const { supabase, appels } = fauxClientLabels([HOOK_COPIE, HOOK_SOPHIA]);

  assertEquals(await assurerHookMedia(supabase, "media-1"), true);
  assertEquals(appels.flags, ["media-1"]);
  assertEquals(appels.upserts, [{ media_id: "media-1", label_id: HOOK_SOPHIA.id }]);
});

Deno.test("garde-fou du faux serveur : maybeSingle échoue sur deux Hook, comme PostgREST", async () => {
  const { supabase } = fauxClientLabels([HOOK_SOPHIA, HOOK_COPIE]);
  const { data, error } = await supabase
    .from("labels")
    .select("id")
    .eq("slug", "hook")
    .maybeSingle();
  assertEquals(data, null);
  assert(error, "l'ancienne requête doit échouer sur deux lignes");
});
