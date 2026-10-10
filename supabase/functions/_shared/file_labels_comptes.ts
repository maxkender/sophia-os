/**
 * File des créateurs (`reglages.file_labels_comptes`) : lecture, tranches par
 * application et réécriture. Décisions pures, sans I/O : manage-users lit et
 * écrit la ligne, ce module dit quoi lire et quoi écrire.
 *
 * Format en base :
 *   {
 *     items: [...], par_langue: { fr: [...] },          // tranche Sophia historique
 *     par_application: { <slug>: { items, par_langue } } // une tranche par application
 *   }
 *
 * Tranche Sophia : lue à la RACINE (`items` / `par_langue`), comme l'a toujours
 * fait manage-users (il ne lisait pas `par_application`). Le front écrit la
 * racine ET `par_application.sophia` (`avecFileLabelsApplication`), les deux
 * restent donc alignées ; lire la racine garde le résultat d'aujourd'hui à
 * l'identique, même si elles avaient divergé.
 *
 * Autres applications : `par_application[slug]`, vide si absente.
 *
 * Réécrire une tranche CONSERVE les autres. L'ancienne lecture jetait
 * `par_application`, et la réécriture qui suivait chaque création de compte ne
 * gardait que la tranche Sophia : la File Unswipe aurait été effacée par la
 * première recrue Sophia.
 *
 * Miroir de `fileLabelsDeLApplication` / `avecFileLabelsApplication`
 * (src/features/moteur/applications.ts). Module à part, importé par
 * manage-users seul : le toucher ne redéploie aucune autre fonction.
 */

export const SLUG_SOPHIA_FILE = "sophia";

export interface FileLabelItem {
  label_id: string;
  ugc: boolean;
}

export interface FileLabelsSlice {
  items: FileLabelItem[];
  par_langue: Record<string, FileLabelItem[]>;
}

export interface FileLabelsValeur {
  items: FileLabelItem[];
  par_langue: Record<string, FileLabelItem[]>;
  par_application?: Record<string, FileLabelsSlice>;
}

/** Entrée consommée depuis une File — à remettre en tête au même endroit si la création échoue. */
export interface FileLabelQueued {
  item: FileLabelItem;
  /** `"general"` ou code langue (`fr`, `de`, …). */
  queueKey: string;
  /** Tranche d'origine ; absente = Sophia. */
  applicationSlug?: string;
}

function estSophia(slug: string | null | undefined): boolean {
  return (slug ?? SLUG_SOPHIA_FILE) === SLUG_SOPHIA_FILE;
}

export function normaliserFileLabelItemList(raw: unknown): FileLabelItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it) => {
      const o = (it ?? {}) as { label_id?: string; ugc?: boolean };
      return {
        label_id: String(o.label_id ?? "").trim(),
        ugc: Boolean(o.ugc),
      };
    })
    .filter((it) => it.label_id);
}

function normaliserParLangue(raw: unknown): Record<string, FileLabelItem[]> {
  const par_langue: Record<string, FileLabelItem[]> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [code, arr] of Object.entries(raw as Record<string, unknown>)) {
      const lang = String(code ?? "").trim().toLowerCase();
      if (!lang) continue;
      const liste = normaliserFileLabelItemList(arr);
      if (liste.length > 0) par_langue[lang] = liste;
    }
  }
  return par_langue;
}

/**
 * Normalise la valeur lue en base : racine `{ items, par_langue }` (+ legacy
 * `label_ids`) et, si présentes, les tranches `par_application`.
 */
export function normaliserFileLabelsValeur(valeur: unknown): FileLabelsValeur {
  const v = (valeur ?? {}) as {
    items?: unknown;
    label_ids?: unknown;
    par_langue?: unknown;
    par_application?: unknown;
  };

  let items = normaliserFileLabelItemList(v.items);
  if (items.length === 0 && Array.isArray(v.label_ids)) {
    items = (v.label_ids as unknown[])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean)
      .map((label_id) => ({ label_id, ugc: false }));
  }
  const out: FileLabelsValeur = { items, par_langue: normaliserParLangue(v.par_langue) };

  const brut = v.par_application;
  if (brut && typeof brut === "object" && !Array.isArray(brut)) {
    const par_application: Record<string, FileLabelsSlice> = {};
    for (const [cle, tranche] of Object.entries(brut as Record<string, unknown>)) {
      const slug = String(cle ?? "").trim();
      if (!slug) continue;
      const t = (tranche ?? {}) as { items?: unknown; par_langue?: unknown };
      par_application[slug] = {
        items: normaliserFileLabelItemList(t.items),
        par_langue: normaliserParLangue(t.par_langue),
      };
    }
    out.par_application = par_application;
  }
  return out;
}

/** Tranche d'une application : racine pour Sophia, `par_application[slug]` sinon. */
export function sliceFileLabels(file: FileLabelsValeur, slug: string): FileLabelsSlice {
  if (estSophia(slug)) return { items: file.items, par_langue: file.par_langue };
  const inner = file.par_application?.[slug];
  if (inner) return { items: inner.items ?? [], par_langue: inner.par_langue ?? {} };
  return { items: [], par_langue: {} };
}

/**
 * Remplace la tranche `slug` sans toucher aux autres. Sophia : racine ET
 * `par_application.sophia`, comme le front.
 */
export function avecSliceApplication(
  file: FileLabelsValeur,
  slug: string,
  slice: FileLabelsSlice,
): FileLabelsValeur {
  const par_application = { ...(file.par_application ?? {}) };
  par_application[slug] = slice;
  if (estSophia(slug)) {
    return { items: slice.items, par_langue: slice.par_langue, par_application };
  }
  return { items: file.items, par_langue: file.par_langue, par_application };
}

function sansListesVides(
  par_langue: Record<string, FileLabelItem[]>,
): Record<string, FileLabelItem[]> {
  const out: Record<string, FileLabelItem[]> = {};
  for (const [code, liste] of Object.entries(par_langue ?? {})) {
    if (liste.length > 0) out[code] = liste;
  }
  return out;
}

/** Valeur JSON à écrire dans `reglages` (listes de langue vides retirées). */
export function valeurFileLabels(file: FileLabelsValeur): {
  items: FileLabelItem[];
  par_langue: Record<string, FileLabelItem[]>;
  par_application: Record<string, FileLabelsSlice>;
} {
  const par_application: Record<string, FileLabelsSlice> = {};
  for (const [slug, slice] of Object.entries(file.par_application ?? {})) {
    par_application[slug] = {
      items: slice.items ?? [],
      par_langue: sansListesVides(slice.par_langue ?? {}),
    };
  }
  return { items: file.items, par_langue: sansListesVides(file.par_langue), par_application };
}

/** Remet une entrée tirée en tête de SA file (langue ou générale) dans SA tranche. */
export function remettreEnTete(file: FileLabelsValeur, queued: FileLabelQueued): FileLabelsValeur {
  const slug = queued.applicationSlug || SLUG_SOPHIA_FILE;
  const slice = sliceFileLabels(file, slug);
  const key = String(queued.queueKey ?? "general").trim().toLowerCase() || "general";
  const next: FileLabelsSlice = key === "general"
    ? { items: [queued.item, ...slice.items], par_langue: slice.par_langue }
    : {
      items: slice.items,
      par_langue: { ...slice.par_langue, [key]: [queued.item, ...(slice.par_langue[key] ?? [])] },
    };
  return avecSliceApplication(file, slug, next);
}
