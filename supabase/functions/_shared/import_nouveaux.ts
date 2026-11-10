/** Aligné sur src/features/moteur/importNouveaux.ts — filtre « nouveaux depuis le dernier import ». */

export function idPostTiktok(url: string): string {
  return url.match(/\/(?:photo|video)\/(\d+)/)?.[1] ?? url;
}

export function normaliserCreateTime(raw: number | null | undefined): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  return raw > 1e12 ? Math.floor(raw / 1000) : Math.floor(raw);
}

export function maxIdTiktok(ids: Iterable<string>): bigint | null {
  let max: bigint | null = null;
  for (const id of ids) {
    if (!/^\d+$/.test(id)) continue;
    const n = BigInt(id);
    if (max === null || n > max) max = n;
  }
  return max;
}

export const MARGE_UPDATE_SEC = 2 * 3600;

/**
 * Ce que « Mettre à jour » doit enfiler : tout slideshow exposé par le profil
 * et absent du stock. Le filtre par date ne sert plus qu'à l'affichage — il
 * décidait auparavant de l'enfilage, figeant à vie un premier import tronqué.
 */
export function urlsManquantes(urlsProfil: string[], connusIds: Set<string>): string[] {
  return urlsProfil.filter((url) => !connusIds.has(idPostTiktok(url)));
}

export function estNouveauDepuisImport(opts: {
  url: string;
  createTime?: number | null;
  connusIds: Set<string>;
  dernierImportAt: Date | null;
  maxIdConnu: bigint | null;
}): boolean {
  const id = idPostTiktok(opts.url);
  if (opts.connusIds.has(id)) return false;
  if (!opts.dernierImportAt) return true;
  if (opts.connusIds.size === 0) return true;

  const createTime = normaliserCreateTime(opts.createTime ?? null);
  if (createTime !== null) {
    const seuil = Math.floor(opts.dernierImportAt.getTime() / 1000) - MARGE_UPDATE_SEC;
    return createTime >= seuil;
  }

  if (opts.maxIdConnu !== null && /^\d+$/.test(id)) {
    return BigInt(id) > opts.maxIdConnu;
  }

  return false;
}

/**
 * Instant de publication d'un post TikTok, en secondes : son `createTime`, sinon
 * les 32 bits hauts de son identifiant (TikTok y range l'heure de création).
 * `null` : inconnu.
 */
export function instantPostTiktok(url: string, createTime?: number | null): number | null {
  const ct = normaliserCreateTime(createTime ?? null);
  if (ct !== null) return ct;
  const id = idPostTiktok(url);
  if (!/^\d{10,}$/.test(id)) return null;
  const sec = Number(BigInt(id) >> 32n);
  return sec > 1_400_000_000 ? sec : null;
}

/**
 * La mise à jour des sources (0667, 10/11) n'enfile pas un slideshow publié il
 * y a moins de `ageMinJours` : ses vues ne sont pas encore faites, le score
 * d'import le refuserait, et une URL connue n'est jamais reprise (même
 * rejetée). Il reste « manquant » et part à la mise à jour suivante. Âge
 * inconnu : enfilé, comme avant.
 */
export function separerTropRecents(
  urls: readonly string[],
  createTimes: ReadonlyMap<string, number>,
  maintenantSec: number,
  ageMinJours: number,
): { murs: string[]; tropRecents: string[] } {
  const murs: string[] = [];
  const tropRecents: string[] = [];
  const limite = maintenantSec - ageMinJours * 86_400;
  for (const url of urls) {
    const instant = instantPostTiktok(url, createTimes.get(idPostTiktok(url)) ?? null);
    if (ageMinJours > 0 && instant !== null && instant > limite) tropRecents.push(url);
    else murs.push(url);
  }
  return { murs, tropRecents };
}
