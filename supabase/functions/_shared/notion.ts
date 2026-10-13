/**
 * Écriture de la colonne « Hired » dans la table Notion « Recruitment Targets ».
 *
 * Une seule colonne est touchée. Ni Total (saisi par Max et Adrien), ni
 * Started, ni Manager, ni « for Monday ». Recruit et Status sont des formules :
 * elles se recalculent toutes seules quand Hired change, il n'y a rien à y
 * écrire.
 */

const NOTION_VERSION = "2022-06-28";
const NOTION_API = "https://api.notion.com/v1";

/** Base « Recruitment Targets », page Operations. Surchargeable par secret. */
export function baseRecrutement(): string {
  return (
    Deno.env.get("NOTION_DB_RECRUTEMENT") ?? "3f724130-8d66-8155-864c-ef7ef14964c1"
  );
}

/**
 * Jeton d'intégration interne Notion. Absent = la fonction sort en no-op, elle
 * ne lève pas : c'est la convention du projet (cf. suivi-rc avec
 * REVENUECAT_SECRET_API_KEY), pour qu'un secret manquant ne fasse pas tomber un
 * cron toutes les nuits.
 */
export function cleNotion(): string | null {
  return Deno.env.get("NOTION_TOKEN") ?? null;
}

/**
 * Code ISO-3166-1 alpha-2 → libellé exact de la colonne Country.
 *
 * Écrite à la main, et elle doit l'être : `Intl.DisplayNames` ne produit PAS
 * ces libellés. Trois cas le prouvent.
 *   • AE  : la ligne s'appelle « UAE », Intl dit « United Arab Emirates ».
 *   • TR  : la ligne s'appelle « Turkey », Intl moderne dit « Türkiye ». Ça
 *           marcherait sur un runtime à vieil ICU et casserait en silence à la
 *           première mise à jour. Vérifié sur Node 22 : « Türkiye ».
 *   • KZ/UA/BY : la ligne s'appelle « Russian-Speaking (not russia) » et n'est
 *           pas un pays. Périmètre arrêté avec le référent le 13/10/2026 :
 *           Kazakhstan, Ukraine, Biélorussie. La Russie elle-même n'en fait
 *           PAS partie, le titre de la ligne le dit. Nos deux comptes
 *           russophones sont kazakhs (ils étaient rangés en RU à tort, corrigé
 *           par 0280), et `ru` n'a volontairement plus de pays par défaut
 *           (0281) : au HM de choisir.
 *
 * Un code absent de cette table n'est pas ignoré en silence : la fonction le
 * remonte dans `inconnus`, avec le nombre de comptes concernés.
 */
export const PAYS_VERS_NOTION: Readonly<Record<string, string>> = Object.freeze({
  AR: "Argentina",
  AU: "Australia",
  AT: "Austria",
  BR: "Brazil",
  BG: "Bulgaria",
  CA: "Canada",
  CL: "Chile",
  CO: "Colombia",
  HR: "Croatia",
  CZ: "Czechia",
  DK: "Denmark",
  EE: "Estonia",
  FI: "Finland",
  FR: "France",
  DE: "Germany",
  GR: "Greece",
  HU: "Hungary",
  IE: "Ireland",
  IL: "Israel",
  IT: "Italy",
  NL: "Netherlands",
  NZ: "New Zealand",
  NO: "Norway",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  RS: "Serbia",
  SK: "Slovakia",
  SI: "Slovenia",
  ES: "Spain",
  SE: "Sweden",
  CH: "Switzerland",
  TR: "Turkey",
  AE: "UAE",
  GB: "United Kingdom",
  US: "United States",
  UY: "Uruguay",
  KZ: "Russian-Speaking (not russia)",
  UA: "Russian-Speaking (not russia)",
  BY: "Russian-Speaking (not russia)",
});

/** Slug d'application en base → option exacte du select « App ». */
export const APP_VERS_NOTION: Readonly<Record<string, string>> = Object.freeze({
  sophia: "Sophia",
  unswipe: "Unswipe",
  micabo: "Micabo",
});

export interface LigneOs {
  pays: string;
  application: string | null;
  hired: number;
}

export interface LigneNotion {
  pageId: string;
  country: string;
  app: string;
  hired: number;
}

export interface Ecriture {
  pageId: string;
  country: string;
  app: string;
  avant: number;
  apres: number;
}

export interface Plan {
  ecritures: Ecriture[];
  inchangees: number;
  /** Comptes de l'OS qu'aucune ligne Notion ne peut accueillir. */
  inconnus: Array<{ pays: string; application: string; hired: number; raison: string }>;
  /** Lignes Notion en double sur (Country, App) : on n'écrit sur aucune. */
  doublons: string[];
}

function cle(country: string, app: string): string {
  return `${country}\u0000${app}`;
}

/**
 * Compare l'OS à Notion et décide quoi écrire. Fonction PURE : aucun réseau,
 * aucune base. C'est elle qu'on teste, et c'est elle qui porte les décisions.
 *
 * Une ligne Notion sans contrepartie dans l'OS retombe à 0 — c'est voulu : le
 * dernier compte d'un pays qui s'en va doit faire descendre le compteur, pas le
 * laisser figé sur son ancienne valeur.
 */
export function planifier(lignesOs: LigneOs[], lignesNotion: LigneNotion[]): Plan {
  const inconnus: Plan["inconnus"] = [];
  const voulu = new Map<string, number>();

  for (const l of lignesOs) {
    if (l.application === null) {
      // Ne devrait jamais arriver : la vue ne rend NULL que pour un compte
      // partagé entre applications. L'appelant s'arrête avant d'en arriver là.
      inconnus.push({
        pays: l.pays,
        application: "(partagé)",
        hired: l.hired,
        raison: "compte partagé entre plusieurs applications",
      });
      continue;
    }
    const country = PAYS_VERS_NOTION[l.pays];
    const app = APP_VERS_NOTION[l.application];
    if (!country || !app) {
      inconnus.push({
        pays: l.pays,
        application: l.application,
        hired: l.hired,
        raison: country ? `application inconnue « ${l.application} »` : `pays sans ligne Notion`,
      });
      continue;
    }
    voulu.set(cle(country, app), (voulu.get(cle(country, app)) ?? 0) + l.hired);
  }

  // Un doublon (Country, App) ferait écrire deux fois des valeurs qui se
  // contredisent. Aucun aujourd'hui, mais rien n'empêche un HM d'en créer un :
  // on les écarte tous les deux et on le signale.
  const vus = new Map<string, number>();
  for (const n of lignesNotion) vus.set(cle(n.country, n.app), (vus.get(cle(n.country, n.app)) ?? 0) + 1);
  const doublons = [...vus.entries()]
    .filter(([, n]) => n > 1)
    .map(([k]) => k.split("\u0000").join(" / "));
  const enDouble = new Set(doublons.map((d) => cle(...(d.split(" / ") as [string, string]))));

  const ecritures: Ecriture[] = [];
  let inchangees = 0;
  const atteintes = new Set<string>();

  for (const n of lignesNotion) {
    const k = cle(n.country, n.app);
    if (enDouble.has(k)) continue;
    atteintes.add(k);
    const apres = voulu.get(k) ?? 0;
    if (apres === n.hired) inchangees += 1;
    else ecritures.push({ pageId: n.pageId, country: n.country, app: n.app, avant: n.hired, apres });
  }

  // Des comptes réels dont (pays × app) n'existe pas du tout dans la table.
  for (const [k, hired] of voulu) {
    if (atteintes.has(k) || enDouble.has(k)) continue;
    const [country, app] = k.split("\u0000");
    inconnus.push({
      pays: country,
      application: app,
      hired,
      raison: "aucune ligne Notion pour ce couple Country × App",
    });
  }

  return { ecritures, inchangees, inconnus, doublons };
}

async function appelNotion(
  chemin: string,
  cle: string,
  init: RequestInit = {},
): Promise<Response> {
  return await fetch(`${NOTION_API}${chemin}`, {
    ...init,
    headers: {
      authorization: `Bearer ${cle}`,
      "notion-version": NOTION_VERSION,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function texteDuTitre(prop: unknown): string {
  const p = prop as { title?: Array<{ plain_text?: string }> } | undefined;
  return (p?.title ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

/** Lit toutes les lignes de la base, en suivant la pagination. */
export async function lireLignesNotion(cle: string, baseId: string): Promise<LigneNotion[]> {
  const lignes: LigneNotion[] = [];
  let curseur: string | undefined;

  do {
    const reponse = await appelNotion(`/databases/${baseId}/query`, cle, {
      method: "POST",
      body: JSON.stringify({ page_size: 100, ...(curseur ? { start_cursor: curseur } : {}) }),
    });
    if (!reponse.ok) {
      throw new Error(`Notion query ${reponse.status} : ${(await reponse.text()).slice(0, 300)}`);
    }
    const page = (await reponse.json()) as {
      results?: Array<{ id: string; properties?: Record<string, unknown> }>;
      has_more?: boolean;
      next_cursor?: string | null;
    };

    for (const r of page.results ?? []) {
      const props = r.properties ?? {};
      const country = texteDuTitre(props["Country"]);
      const app = (props["App"] as { select?: { name?: string } } | undefined)?.select?.name ?? "";
      const hired = (props["Hired"] as { number?: number | null } | undefined)?.number ?? 0;
      if (!country || !app) continue; // ligne vide ou brouillon : on l'ignore
      lignes.push({ pageId: r.id, country, app, hired });
    }

    curseur = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (curseur);

  return lignes;
}

/**
 * Écrit une valeur dans Hired. La propriété est ciblée par son NOM : l'API
 * Notion l'accepte, et c'est plus lisible qu'un identifiant court opaque. Si
 * quelqu'un renomme la colonne, le job échoue bruyamment — ce qui est le bon
 * comportement, puisque la table n'aurait alors plus de colonne Hired.
 */
export async function ecrireHired(cle: string, pageId: string, valeur: number): Promise<void> {
  const reponse = await appelNotion(`/pages/${pageId}`, cle, {
    method: "PATCH",
    body: JSON.stringify({ properties: { Hired: { number: valeur } } }),
  });
  if (!reponse.ok) {
    throw new Error(
      `Notion patch ${pageId} → ${valeur} : ${reponse.status} ${(await reponse.text()).slice(0, 300)}`,
    );
  }
}
