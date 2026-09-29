/**
 * L'upscale qui se repaie en boucle.
 *
 * Le chemin d'upscale se DÉDUIT du chemin source (`<base>-upscale.<ext>`), et
 * un média upscalé PREND ce nom comme `storage_path`. Deux médias sur la même
 * position visent donc le même chemin : un re-nettoyage qui crée un nouveau
 * média, un orphelin resté en base, une ancienne version encore accrochée à
 * des `post_slides`.
 *
 * L'ordre du code faisait le reste : on payait SeedVR, on téléversait, PUIS on
 * écrivait en base. L'écriture cassait sur `media_library_storage_path_key`,
 * l'exception remontait, et `upscale_le` restait NULL. Or c'est exactement ce
 * champ qui décide des trois choses à la fois : l'entrée dans la file, le saut
 * « déjà upscalée », et la sortie de la file. Le média revenait donc en tête au
 * passage suivant, et le drain repayait un upscale PAR MINUTE, indéfiniment.
 *
 * Le 29/09 ça a coûté 352 upscales SeedVR jetés en une journée, et comme le
 * drain ne prend que `file[0]`, aucune autre photo assignée n'a été upscalée
 * pendant tout ce temps : les posters publiaient en basse définition.
 *
 * D'où les deux invariants testés ici, le premier étant le seul qui parle
 * d'argent :
 *   - chemin squatté → AUCUN appel réseau au provider ;
 *   - chemin libre   → on passe bien la garde et on appelle le provider.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

import { upscalerMediaLibrary } from "./upscale_media_core.ts";

interface Ligne {
  id: string;
  url: string;
  storage_path: string;
  upscale_le: string | null;
}

/** Faux PostgREST : juste ce que `upscalerMediaLibrary` interroge. */
function fauxClient(lignes: Ligne[]) {
  const requete = (etat: {
    eq?: [string, unknown];
    neq?: [string, unknown];
    like?: [string, string];
  }) => {
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => (etat.eq = [col, val], builder),
      neq: (col: string, val: unknown) => (etat.neq = [col, val], builder),
      like: (col: string, motif: string) => (etat.like = [col, motif], builder),
      limit: () => builder,
      maybeSingle: () => {
        let out = lignes;
        if (etat.eq) out = out.filter((l) => (l as never)[etat.eq![0]] === etat.eq![1]);
        if (etat.neq) out = out.filter((l) => (l as never)[etat.neq![0]] !== etat.neq![1]);
        if (etat.like) {
          const rx = new RegExp("^" + etat.like[1].replace(/[.]/g, "\\.").replace(/%/g, ".*") + "$");
          out = out.filter((l) => rx.test(String((l as never)[etat.like![0]])));
        }
        return Promise.resolve({ data: out[0] ?? null, error: null });
      },
    };
    return builder;
  };
  return { from: () => requete({}) } as unknown as Parameters<
    typeof upscalerMediaLibrary
  >[0];
}

/** Compte les appels réseau : c'est la facture. */
async function avecFetchCompte<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const vrai = globalThis.fetch;
  let appels = 0;
  globalThis.fetch = (() => {
    appels += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;
  try {
    return [await fn(), appels];
  } finally {
    globalThis.fetch = vrai;
  }
}

const VIVANT: Ligne = {
  id: "d765b84f",
  url: "https://exemple/medias/propre/c1/1.png",
  storage_path: "propre/c1/1.png",
  upscale_le: null,
};

/** L'orphelin qui détient déjà le nom visé — le cas réel du 29/09. */
const SQUATTEUR: Ligne = {
  id: "6a6e1675",
  url: "https://exemple/medias/propre/c1/1-upscale.jpg",
  storage_path: "propre/c1/1-upscale.jpg",
  upscale_le: "2026-09-29T12:30:25Z",
};

Deno.test("chemin d'upscale squatté : AUCUN appel payant au provider", async () => {
  Deno.env.set("FAL_KEY", "cle-de-test");
  const [r, appels] = await avecFetchCompte(() =>
    upscalerMediaLibrary(fauxClient([VIVANT, SQUATTEUR]), {
      mediaId: VIVANT.id,
      modele: "seedvr",
    })
  );

  assertEquals(appels, 0, "le provider ne doit PAS être appelé : c'est la facture");
  assertEquals(r.ok, false);
  assert(!r.ok && r.collision === true, "la collision doit être distinguable d'un échec ordinaire");
  assert(!r.ok && r.error.includes(SQUATTEUR.id), "l'erreur doit nommer le détenteur du chemin");
});

Deno.test("chemin libre : la garde laisse passer et le provider est appelé", async () => {
  Deno.env.set("FAL_KEY", "cle-de-test");
  // Le faux `fetch` ne sait pas imiter la file Fal : l'appel lève. Peu importe,
  // ce qui compte est qu'il ait EU LIEU — c'est la preuve que la garde ne
  // bloque que le cas de collision, et pas les upscales légitimes.
  const [, appels] = await avecFetchCompte(async () => {
    try {
      return await upscalerMediaLibrary(fauxClient([VIVANT]), {
        mediaId: VIVANT.id,
        modele: "seedvr",
      });
    } catch {
      return null;
    }
  });

  assert(appels > 0, "sans squatteur, l'upscale doit bien atteindre le provider");
});

Deno.test("un média DÉJÀ upscalé est sauté avant toute dépense", async () => {
  Deno.env.set("FAL_KEY", "cle-de-test");
  const deja: Ligne = { ...VIVANT, upscale_le: "2026-09-29T12:30:25Z" };
  const [r, appels] = await avecFetchCompte(() =>
    upscalerMediaLibrary(fauxClient([deja]), { mediaId: deja.id, modele: "seedvr" })
  );

  assertEquals(appels, 0);
  assert(r.ok && r.saute === true);
});
