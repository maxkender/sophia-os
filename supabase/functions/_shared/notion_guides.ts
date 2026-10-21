/**
 * Copie du Poster Guide et du Manager Guide (Notion) dans `guides_notion`, pour
 * le cerveau de la FAQ (docs/faq-automatique.md).
 *
 * Aram écrit le guide dans Notion ; l'OS en garde une copie texte, page par
 * page. Le cerveau lit la copie, jamais Notion en direct : lire 13 pages à
 * chaque question prendrait plusieurs secondes, et la FAQ tomberait avec Notion.
 *
 * Une page dont `last_edited_time` n'a pas bougé n'est pas relue (une requête au
 * lieu d'une vingtaine), sauf si sa copie a plus de 24 h : filet de sécurité
 * contre une modification que Notion n'aurait pas datée.
 */

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const UN_JOUR_MS = 86_400_000;

export interface BlocNotion {
  id: string;
  type: string;
  has_children?: boolean;
  enfants?: BlocNotion[];
  [cle: string]: unknown;
}

interface TexteRiche {
  plain_text?: string;
  href?: string | null;
}

/** Les ids Notion arrivent avec ou sans tirets : on les range sans. */
export function idNotion(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

export function urlPage(id: string): string {
  return `https://www.notion.so/${idNotion(id)}`;
}

/** Le texte d'un rich_text, liens compris (un lien d'appli doit rester lisible). */
export function texteRiche(rt: unknown): string {
  if (!Array.isArray(rt)) return "";
  return (rt as TexteRiche[])
    .map((r) => {
      const texte = r.plain_text ?? "";
      const href = r.href ?? "";
      if (!href || texte.includes(href) || href.startsWith("/")) return texte;
      return `${texte} (${href})`;
    })
    .join("")
    .trim();
}

function contenu(bloc: BlocNotion): Record<string, unknown> {
  const c = bloc[bloc.type];
  return c && typeof c === "object" ? (c as Record<string, unknown>) : {};
}

/** Blocs qui ne font que porter leurs enfants. */
const CONTENEURS = new Set(["column_list", "column", "synced_block", "table"]);
/** Pages et bases imbriquées : copiées à part (sous-pages) ou ignorées. */
const HORS_PAGE = new Set(["child_page", "child_database"]);

/**
 * Blocs → texte lisible par le modèle. Les questions du guide sont des toggles :
 * le titre devient une ligne « ▸ », la réponse est indentée dessous, pour que
 * le cerveau sache citer l'intitulé exact.
 */
export function blocsVersTexte(blocs: BlocNotion[]): string {
  return rendre(blocs, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Sans `trim` : il mangerait le retrait de la première ligne des enfants. */
function rendre(blocs: BlocNotion[], retrait: string): string {
  const lignes: string[] = [];
  let numero = 0;
  for (const bloc of blocs) {
    numero = bloc.type === "numbered_list_item" ? numero + 1 : 0;
    const c = contenu(bloc);
    const texte = texteRiche(c.rich_text);
    const enfants = bloc.enfants?.length ? rendre(bloc.enfants, `${retrait}  `) : "";

    switch (bloc.type) {
      case "paragraph":
      case "quote":
      case "code":
        if (texte) lignes.push(`${retrait}${bloc.type === "quote" ? "> " : ""}${texte}`);
        break;
      case "heading_1":
      case "heading_2":
      case "heading_3": {
        const niveau = Number(bloc.type.slice(-1));
        if (texte) lignes.push(`${retrait}${"#".repeat(niveau)} ${texte}`);
        break;
      }
      case "bulleted_list_item":
        if (texte) lignes.push(`${retrait}- ${texte}`);
        break;
      case "numbered_list_item":
        if (texte) lignes.push(`${retrait}${numero}. ${texte}`);
        break;
      case "to_do":
        if (texte) lignes.push(`${retrait}- [${c.checked ? "x" : " "}] ${texte}`);
        break;
      case "toggle":
        if (texte) lignes.push(`${retrait}▸ ${texte}`);
        break;
      case "callout": {
        const icone = (c.icon as { emoji?: string } | undefined)?.emoji;
        if (texte) lignes.push(`${retrait}${icone ? `${icone} ` : ""}${texte}`);
        break;
      }
      case "divider":
        lignes.push(`${retrait}---`);
        break;
      case "table_row": {
        const cellules = Array.isArray(c.cells) ? (c.cells as unknown[]).map(texteRiche) : [];
        if (cellules.some(Boolean)) lignes.push(`${retrait}| ${cellules.join(" | ")} |`);
        break;
      }
      case "child_page": {
        const titre = String(c.title ?? "").trim();
        if (titre) lignes.push(`${retrait}→ Page : ${titre}`);
        break;
      }
      case "bookmark":
      case "embed":
      case "link_preview": {
        const url = String(c.url ?? "").trim();
        if (url) lignes.push(`${retrait}${url}`);
        break;
      }
      case "image":
      case "video":
      case "file":
      case "pdf": {
        const legende = texteRiche(c.caption);
        if (legende) lignes.push(`${retrait}(${bloc.type} : ${legende})`);
        break;
      }
      default:
        break;
    }
    // Les conteneurs n'ont pas de texte à eux : leurs enfants restent au même niveau.
    if (enfants) lignes.push(CONTENEURS.has(bloc.type) ? rendre(bloc.enfants!, retrait) : enfants);
  }
  return lignes.filter(Boolean).join("\n");
}

/** Les sous-pages d'une page, dans l'ordre, y compris celles rangées en colonnes. */
export function sousPages(blocs: BlocNotion[]): Array<{ id: string; titre: string }> {
  const out: Array<{ id: string; titre: string }> = [];
  for (const bloc of blocs) {
    if (bloc.type === "child_page") {
      out.push({ id: idNotion(bloc.id), titre: String(contenu(bloc).title ?? "").trim() });
    } else if (bloc.enfants?.length) {
      out.push(...sousPages(bloc.enfants));
    }
  }
  return out;
}

/** Titre d'une page : la propriété de type « title », quel que soit son nom. */
export function titrePage(page: unknown): string {
  const props = (page as { properties?: Record<string, { type?: string; title?: unknown }> })?.properties ?? {};
  for (const p of Object.values(props)) {
    if (p?.type === "title") return texteRiche(p.title).replace(/^\p{Extended_Pictographic}\s*/u, "").trim();
  }
  return "";
}

/* -------------------------------------------------------------------------
 * Lecture de l'API Notion
 * ---------------------------------------------------------------------- */

type Fetch = typeof fetch;

export class ErreurNotion extends Error {
  constructor(public statut: number, public code: string, message: string) {
    super(message);
  }
}

export interface ClientNotion {
  get: (chemin: string) => Promise<Record<string, unknown>>;
}

/**
 * GET Notion, au rythme qu'il tolère (~3 requêtes/s), avec reprise sur 429
 * (Retry-After) et sur 5xx.
 */
export function clientNotion(
  token: string,
  fetchFn: Fetch = fetch,
  pause: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  intervalleMs = 340,
): ClientNotion {
  let dernier = 0;
  return {
    async get(chemin: string) {
      for (let essai = 0; essai < 4; essai++) {
        const attente = dernier + intervalleMs - Date.now();
        if (attente > 0) await pause(attente);
        dernier = Date.now();
        const reponse = await fetchFn(`${NOTION_API}${chemin}`, {
          headers: { authorization: `Bearer ${token}`, "notion-version": NOTION_VERSION },
        });
        if (reponse.ok) return (await reponse.json()) as Record<string, unknown>;
        if ((reponse.status === 429 || reponse.status >= 500) && essai < 3) {
          const secondes = Number(reponse.headers.get("retry-after") ?? "1");
          await pause(Math.min(10, Number.isFinite(secondes) ? secondes : 1) * 1000);
          continue;
        }
        const corps = await reponse.json().catch(() => ({})) as { code?: string; message?: string };
        throw new ErreurNotion(reponse.status, corps.code ?? "", corps.message ?? `HTTP ${reponse.status}`);
      }
      throw new ErreurNotion(429, "rate_limited", "Notion limite encore après 4 essais");
    },
  };
}

/** Tous les blocs d'une page, enfants compris (sauf les sous-pages). */
export async function lireBlocs(client: ClientNotion, id: string, profondeur = 0): Promise<BlocNotion[]> {
  const blocs: BlocNotion[] = [];
  let curseur: string | null = null;
  do {
    const page = await client.get(
      `/blocks/${id}/children?page_size=100${curseur ? `&start_cursor=${encodeURIComponent(curseur)}` : ""}`,
    );
    blocs.push(...((page.results as BlocNotion[] | undefined) ?? []));
    curseur = page.has_more ? String(page.next_cursor ?? "") || null : null;
  } while (curseur);

  if (profondeur < 6) {
    for (const bloc of blocs) {
      if (bloc.has_children && !HORS_PAGE.has(bloc.type)) {
        bloc.enfants = await lireBlocs(client, bloc.id, profondeur + 1);
      }
    }
  }
  return blocs;
}

/* -------------------------------------------------------------------------
 * Copie d'un guide
 * ---------------------------------------------------------------------- */

export interface CopieExistante {
  page_id: string;
  notion_modifie_at: string | null;
  enfants: string[] | null;
  copie_at: string;
}

export interface PageVisitee {
  page_id: string;
  guide: "poster" | "manager";
  titre: string;
  chemin: string;
  url: string;
  ordre: number;
  notion_modifie_at: string | null;
}

export interface PageRecopiee extends PageVisitee {
  texte: string;
  enfants: string[];
  copie_at: string;
}

export interface ResultatCopie {
  /** Pages relues : texte et sous-pages à jour. */
  recopiees: PageRecopiee[];
  /** Pages inchangées : seuls titre, chemin et ordre sont rafraîchis. */
  inchangees: PageVisitee[];
  erreurs: string[];
}

export async function copierGuide(opts: {
  client: ClientNotion;
  guide: "poster" | "manager";
  racine: string;
  nomGuide: string;
  existants: Map<string, CopieExistante>;
  force?: boolean;
  maintenant?: number;
  maxPages?: number;
  /**
   * Appelé après chaque page : une copie coupée en route (limite de durée de
   * la fonction) garde ce qu'elle a lu, et le passage suivant reprend là où
   * elle s'est arrêtée, puisque ces pages sont alors « inchangées ».
   */
  surPage?: (page: PageRecopiee | PageVisitee, recopiee: boolean) => Promise<void>;
  /** Au-delà (ms epoch), on s'arrête proprement et le reste attend le passage suivant. */
  echeance?: number;
}): Promise<ResultatCopie> {
  const maintenant = opts.maintenant ?? Date.now();
  const maxPages = opts.maxPages ?? 60;
  const res: ResultatCopie = { recopiees: [], inchangees: [], erreurs: [] };
  const vues = new Set<string>();
  const file: Array<{ id: string; parents: string[]; profondeur: number }> = [
    { id: idNotion(opts.racine), parents: [], profondeur: 0 },
  ];

  while (file.length && vues.size < maxPages) {
    if (opts.echeance && Date.now() > opts.echeance) {
      res.erreurs.push(`${opts.nomGuide} : copie partielle, la suite au prochain passage`);
      return res;
    }
    const { id, parents, profondeur } = file.shift()!;
    if (vues.has(id)) continue;
    vues.add(id);

    try {
      const page = await opts.client.get(`/pages/${id}`);
      const titre = titrePage(page) || "Sans titre";
      const modifie = typeof page.last_edited_time === "string" ? page.last_edited_time : null;
      const chemin = [opts.nomGuide, ...parents, ...(profondeur === 0 ? [] : [titre])].join(" › ");
      const base: PageVisitee = {
        page_id: id,
        guide: opts.guide,
        titre,
        chemin,
        url: urlPage(id),
        ordre: vues.size - 1,
        notion_modifie_at: modifie,
      };

      const avant = opts.existants.get(id);
      const aJour = !opts.force && avant && modifie && avant.notion_modifie_at &&
        new Date(avant.notion_modifie_at).getTime() === new Date(modifie).getTime() &&
        maintenant - new Date(avant.copie_at).getTime() < UN_JOUR_MS;

      let enfants: string[];
      if (aJour) {
        res.inchangees.push(base);
        enfants = avant!.enfants ?? [];
        await opts.surPage?.(base, false);
      } else {
        const blocs = await lireBlocs(opts.client, id);
        enfants = sousPages(blocs).map((p) => p.id);
        const copie: PageRecopiee = {
          ...base,
          texte: blocsVersTexte(blocs),
          enfants,
          copie_at: new Date(maintenant).toISOString(),
        };
        res.recopiees.push(copie);
        await opts.surPage?.(copie, true);
      }
      const parentsEnfants = profondeur === 0 ? [] : [...parents, titre];
      if (profondeur < 3) {
        for (const enfant of enfants) file.push({ id: enfant, parents: parentsEnfants, profondeur: profondeur + 1 });
      }
    } catch (erreur) {
      res.erreurs.push(messageCopie(erreur, id, opts.nomGuide, profondeur === 0));
    }
  }
  if (file.length) res.erreurs.push(`${opts.nomGuide} : plus de ${maxPages} pages, le reste n'est pas copié`);
  return res;
}

function messageCopie(erreur: unknown, id: string, nomGuide: string, racine: boolean): string {
  if (erreur instanceof ErreurNotion && (erreur.statut === 404 || erreur.code === "object_not_found")) {
    return racine
      ? `${nomGuide} : l'intégration Notion de l'OS n'a pas accès au guide. Dans Notion, page du guide → ••• → Connexions → ajouter l'intégration.`
      : `${nomGuide} : sous-page ${id} inaccessible à l'intégration Notion`;
  }
  if (erreur instanceof ErreurNotion && erreur.statut === 401) {
    return `${nomGuide} : NOTION_TOKEN refusé par Notion (${erreur.message})`;
  }
  return `${nomGuide} : page ${id} : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
}
