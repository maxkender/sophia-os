/**
 * Synchro de la table Notion « Relecteurs natifs » (page « Relecteurs natifs
 * par pays », sous « Révolution placement/traduction »).
 *
 * Une ligne par langue, retrouvée par sa colonne Code. L'OS n'écrit QUE ses
 * colonnes : Statut (dès qu'un relecteur est accepté pour la langue),
 * Relecteur, Posteurs, Posts 30 j et Maj OS. Le questionnaire et le kit ont
 * été retirés (0608), leurs colonnes avec. Vague,
 * Candidats Slack et Notes sont tenues à la main par Adrien : on ne les écrit
 * jamais, même à la création d'une ligne.
 */

const NOTION_VERSION = "2022-06-28";
const NOTION_API = "https://api.notion.com/v1";

/** Base « Relecteurs natifs ». Surchargeable par secret. */
export function baseRelecteurs(): string {
  return Deno.env.get("NOTION_DB_RELECTEURS") ?? "355b39de-a362-46dc-8103-e76ae970ce65";
}

/** Une langue n'a sa ligne qu'à partir de ce volume, ou dès qu'elle a un relecteur. */
export const SEUIL_POSTS_30J = 10;

export type StatutRelecteur = "invite" | "actif" | "pause" | "retire";

export interface RelecteurOs {
  langue: string;
  nom: string;
  statut: StatutRelecteur;
}

export interface LangueOs {
  code: string;
  posteurs: number;
  posts30j: number;
}

export interface LigneNotionRelecteurs {
  pageId: string;
  code: string;
  statut: string | null;
  candidats: string;
  relecteur: string;
  posteurs: number | null;
  posts30j: number | null;
}

/** Les colonnes que l'OS écrit. */
export interface ColonnesOs {
  statut: string | null;
  relecteur: string;
  posteurs: number;
  posts30j: number;
}

export interface Plan {
  creations: Array<{ code: string; titre: string; colonnes: ColonnesOs }>;
  majs: Array<{ pageId: string; code: string; colonnes: ColonnesOs }>;
  inchangees: number;
  /** Codes présents sur plusieurs lignes : laissés tels quels. */
  doublons: string[];
}

const STATUT_NOTION: Record<StatutRelecteur, string> = {
  actif: "Actif",
  invite: "Invité",
  pause: "En pause",
  retire: "Retiré",
};
const STATUT_COURT: Record<StatutRelecteur, string> = {
  actif: "actif",
  invite: "invité",
  pause: "en pause",
  retire: "retiré",
};
/** Le statut d'une langue est celui de son meilleur relecteur. */
const ORDRE_STATUT: StatutRelecteur[] = ["actif", "invite", "pause", "retire"];
/** Les statuts que l'OS pose : les autres (Candidats Slack, Aucun candidat) sont à la main. */
const STATUTS_DE_L_OS = new Set(Object.values(STATUT_NOTION));

const LANGUES: Record<string, [string, string]> = {
  fr: ["🇫🇷", "Français"],
  en: ["🇬🇧", "Anglais"],
  de: ["🇩🇪", "Allemand"],
  it: ["🇮🇹", "Italien"],
  es: ["🇪🇸", "Espagnol (Espagne)"],
  "es-419": ["🌎", "Espagnol (Amérique latine)"],
  pt: ["🇵🇹", "Portugais (Portugal)"],
  "pt-BR": ["🇧🇷", "Portugais (Brésil)"],
  cs: ["🇨🇿", "Tchèque"],
  nl: ["🇳🇱", "Néerlandais"],
  el: ["🇬🇷", "Grec"],
  hu: ["🇭🇺", "Hongrois"],
  pl: ["🇵🇱", "Polonais"],
  ro: ["🇷🇴", "Roumain"],
  sv: ["🇸🇪", "Suédois"],
  tr: ["🇹🇷", "Turc"],
  da: ["🇩🇰", "Danois"],
  no: ["🇳🇴", "Norvégien"],
  ru: ["🇷🇺", "Russe"],
  hr: ["🇭🇷", "Croate"],
  sl: ["🇸🇮", "Slovène"],
  sk: ["🇸🇰", "Slovaque"],
  sr: ["🇷🇸", "Serbe"],
  ar: ["🇪🇬", "Arabe"],
  he: ["🇮🇱", "Hébreu"],
  fi: ["🇫🇮", "Finnois"],
  et: ["🇪🇪", "Estonien"],
  bg: ["🇧🇬", "Bulgare"],
  lt: ["🇱🇹", "Lituanien"],
  lv: ["🇱🇻", "Letton"],
  ja: ["🇯🇵", "Japonais"],
};

export function titreLangue(code: string): string {
  const [drapeau, nom] = LANGUES[code] ?? ["", code.toUpperCase()];
  return drapeau ? `${drapeau} ${nom}` : nom;
}

/** Ce que l'OS veut voir sur la ligne d'une langue, la ligne actuelle en main. */
export function colonnesVoulues(
  code: string,
  langue: LangueOs | undefined,
  relecteurs: RelecteurOs[],
  actuelle: Pick<LigneNotionRelecteurs, "statut" | "candidats"> | null,
): ColonnesOs {
  const chiffres = { posteurs: langue?.posteurs ?? 0, posts30j: langue?.posts30j ?? 0 };
  const siens = relecteurs
    .filter((r) => r.langue === code)
    .sort((a, b) => ORDRE_STATUT.indexOf(a.statut) - ORDRE_STATUT.indexOf(b.statut) || a.nom.localeCompare(b.nom));

  if (siens.length === 0) {
    // Plus personne dans l'OS : un statut posé par l'OS retombe sur le statut
    // « à la main » qui va avec la colonne Candidats Slack. Un statut posé à la
    // main reste.
    const statut =
      actuelle === null || actuelle.statut === null || STATUTS_DE_L_OS.has(actuelle.statut)
        ? actuelle?.candidats.trim()
          ? "Candidats Slack"
          : "Aucun candidat"
        : actuelle.statut;
    return { statut, relecteur: "", ...chiffres };
  }

  return {
    statut: STATUT_NOTION[siens[0].statut],
    relecteur: siens.map((r) => `${r.nom} (${STATUT_COURT[r.statut]})`).join(", "),
    ...chiffres,
  };
}

function egales(a: ColonnesOs, b: ColonnesOs): boolean {
  return (
    a.statut === b.statut &&
    a.relecteur === b.relecteur &&
    a.posteurs === b.posteurs &&
    a.posts30j === b.posts30j
  );
}

/**
 * Ce qu'il faut écrire : les lignes qui changent, et une ligne neuve pour une
 * langue qui passe le seuil (ou reçoit un relecteur) sans en avoir. Une ligne
 * qui ne change pas n'est pas réécrite : Notion plafonne à ~3 requêtes/s.
 */
export function planifierRelecteurs(
  langues: LangueOs[],
  relecteurs: RelecteurOs[],
  lignes: LigneNotionRelecteurs[],
): Plan {
  const parCode = new Map(langues.map((l) => [l.code, l]));

  const compte = new Map<string, number>();
  for (const l of lignes) if (l.code) compte.set(l.code, (compte.get(l.code) ?? 0) + 1);
  const doublons = [...compte.entries()].filter(([, n]) => n > 1).map(([c]) => c).sort();

  const majs: Plan["majs"] = [];
  let inchangees = 0;
  for (const l of lignes) {
    if (!l.code || doublons.includes(l.code)) continue;
    const voulu = colonnesVoulues(l.code, parCode.get(l.code), relecteurs, l);
    const actuel: ColonnesOs = {
      statut: l.statut,
      relecteur: l.relecteur,
      posteurs: l.posteurs ?? 0,
      posts30j: l.posts30j ?? 0,
    };
    if (egales(voulu, actuel) && l.posteurs !== null && l.posts30j !== null) inchangees += 1;
    else majs.push({ pageId: l.pageId, code: l.code, colonnes: voulu });
  }

  const presents = new Set(compte.keys());
  const codes = new Set([
    ...langues.filter((l) => l.posts30j >= SEUIL_POSTS_30J).map((l) => l.code),
    ...relecteurs.map((r) => r.langue),
  ]);
  const creations = [...codes]
    .filter((c) => !presents.has(c))
    .sort()
    .map((code) => ({
      code,
      titre: titreLangue(code),
      colonnes: colonnesVoulues(code, parCode.get(code), relecteurs, null),
    }));

  return { creations, majs, inchangees, doublons };
}

// ---------------------------------------------------------------------------
// API Notion
// ---------------------------------------------------------------------------

/** La table n'est pas partagée avec l'intégration de l'OS (Notion répond 404). */
export class TableNonPartagee extends Error {}

async function appelNotion(chemin: string, cle: string, init: RequestInit = {}): Promise<Response> {
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

async function verifier(reponse: Response, quoi: string): Promise<void> {
  if (reponse.ok) return;
  const texte = (await reponse.text()).slice(0, 300);
  if (reponse.status === 404) throw new TableNonPartagee(`Notion ${quoi} 404 : ${texte}`);
  throw new Error(`Notion ${quoi} ${reponse.status} : ${texte}`);
}

type Prop = Record<string, unknown> | undefined;

function texteRiche(prop: Prop, cle: "title" | "rich_text"): string {
  const morceaux = (prop?.[cle] ?? []) as Array<{ plain_text?: string }>;
  return morceaux.map((m) => m.plain_text ?? "").join("").trim();
}
function selection(prop: Prop): string | null {
  return ((prop?.select ?? null) as { name?: string } | null)?.name ?? null;
}
function nombre(prop: Prop): number | null {
  const n = prop?.number;
  return typeof n === "number" ? n : null;
}

/** Lit toutes les lignes de la base, en suivant la pagination. */
export async function lireLignesRelecteurs(cle: string, baseId: string): Promise<LigneNotionRelecteurs[]> {
  const lignes: LigneNotionRelecteurs[] = [];
  let curseur: string | undefined;
  do {
    const reponse = await appelNotion(`/databases/${baseId}/query`, cle, {
      method: "POST",
      body: JSON.stringify({ page_size: 100, ...(curseur ? { start_cursor: curseur } : {}) }),
    });
    await verifier(reponse, "query");
    const page = (await reponse.json()) as {
      results?: Array<{ id: string; properties?: Record<string, Prop> }>;
      has_more?: boolean;
      next_cursor?: string | null;
    };
    for (const r of page.results ?? []) {
      const p = r.properties ?? {};
      lignes.push({
        pageId: r.id,
        code: texteRiche(p["Code"], "rich_text"),
        statut: selection(p["Statut"]),
        candidats: texteRiche(p["Candidats Slack"], "rich_text"),
        relecteur: texteRiche(p["Relecteur"], "rich_text"),
        posteurs: nombre(p["Posteurs"]),
        posts30j: nombre(p["Posts 30 j"]),
      });
    }
    curseur = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (curseur);
  return lignes;
}

function texte(contenu: string) {
  return contenu ? [{ type: "text", text: { content: contenu.slice(0, 1900) } }] : [];
}

/** Les propriétés Notion des colonnes de l'OS. */
export function proprietesOs(c: ColonnesOs, maintenant: string): Record<string, unknown> {
  return {
    Statut: { select: c.statut ? { name: c.statut } : null },
    Relecteur: { rich_text: texte(c.relecteur) },
    Posteurs: { number: c.posteurs },
    "Posts 30 j": { number: c.posts30j },
    "Maj OS": { date: { start: maintenant } },
  };
}

export async function creerLigne(
  cle: string,
  baseId: string,
  ligne: Plan["creations"][number],
  maintenant: string,
): Promise<void> {
  const reponse = await appelNotion("/pages", cle, {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: baseId },
      properties: {
        Langue: { title: texte(ligne.titre) },
        Code: { rich_text: texte(ligne.code) },
        ...proprietesOs(ligne.colonnes, maintenant),
      },
    }),
  });
  await verifier(reponse, "création");
}

export async function majLigne(cle: string, pageId: string, colonnes: ColonnesOs, maintenant: string): Promise<void> {
  const reponse = await appelNotion(`/pages/${pageId}`, cle, {
    method: "PATCH",
    body: JSON.stringify({ properties: proprietesOs(colonnes, maintenant) }),
  });
  await verifier(reponse, "mise à jour");
}
