/**
 * Test à blanc — le sous-ensemble de PostgREST que le calque sait relire.
 *
 * PUR : aucun import réseau, aucune base. Sert deux lecteurs :
 *  - le calque « lecture après écriture » du test à blanc (a_blanc_calque.ts),
 *    qui doit réévaluer une requête sur des lignes qu'il a lui-même fabriquées ;
 *  - le faux serveur PostgREST des tests (a_blanc_test_utils.ts).
 *
 * Formes rendues par postgrest-js 2.112.3, relevées dans son code :
 *  - `.single()` pose `Accept: application/vnd.pgrst.object+json` ; le serveur
 *    répond l'objet, ou 406 PGRST116 « The result contains N rows » ;
 *  - `.maybeSingle()` ne touche PAS à l'en-tête : il reçoit un tableau et le
 *    réduit côté client (0 → null, 1 → l'objet, plus → 406 fabriqué par le
 *    client), sur toutes les méthodes ;
 *  - sans `.select()`, une écriture n'a pas de `Prefer: return=representation`
 *    et PostgREST répond sans corps (201 / 204) — `data` vaut alors null ;
 *  - les filtres sont des paramètres `colonne=[not.]op.valeur`, répétables.
 *
 * Tout ce qui sort de ce sous-ensemble (embeds, alias, casts, `or=`, filtres
 * sur une table embarquée, opérateurs cs/cd/ov/fts…) est marqué NON SIMPLE :
 * le calque ne le réévalue pas, et le dit dans les limites du test.
 */

export type Ligne = Record<string, unknown>;

export type OperateurFiltre =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "is"
  | "like"
  | "ilike";

const OPERATEURS: ReadonlySet<string> = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "is",
  "like",
  "ilike",
]);

export interface Filtre {
  colonne: string;
  op: OperateurFiltre;
  negation: boolean;
  /** Valeur brute ; liste pour `in`. */
  valeur: string | string[];
}

export interface Ordre {
  colonne: string;
  asc: boolean;
  /** Défaut PostgreSQL : NULLS LAST en ASC, NULLS FIRST en DESC. */
  nullsFirst: boolean;
}

export interface RequetePostgrest {
  table: string;
  select: string[] | "*";
  selectSimple: boolean;
  filtres: Filtre[];
  filtresEvaluables: boolean;
  ordre: Ordre[];
  ordreSimple: boolean;
  limite: number | null;
  offset: number | null;
  /** Pourquoi la requête n'est pas simple (vide sinon). */
  raisons: string[];
}

/** Paramètres d'URL qui ne sont pas des filtres. */
export const PARAMS_RESERVES: ReadonlySet<string> = new Set([
  "select",
  "order",
  "limit",
  "offset",
  "on_conflict",
  "columns",
]);

const COLONNE = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Clés logiques de PostgREST : jamais une colonne, même si le nom en a la forme. */
const CLES_LOGIQUES: ReadonlySet<string> = new Set(["or", "and"]);

/** Découpe sur les virgules qui ne sont ni entre parenthèses ni entre guillemets. */
function decouperHorsParentheses(texte: string): string[] {
  const parts: string[] = [];
  let profondeur = 0;
  let guillemet = false;
  let courant = "";
  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];
    if (c === "\\" && guillemet && i + 1 < texte.length) {
      courant += c + texte[i + 1];
      i += 1;
      continue;
    }
    if (c === '"') guillemet = !guillemet;
    else if (!guillemet && c === "(") profondeur += 1;
    else if (!guillemet && c === ")") profondeur -= 1;
    if (c === "," && profondeur === 0 && !guillemet) {
      parts.push(courant);
      courant = "";
      continue;
    }
    courant += c;
  }
  parts.push(courant);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** `(a,"b,c",d)` → ["a", "b,c", "d"]. Guillemets et antislashs gérés. */
export function parserListeIn(brut: string): string[] {
  const texte = brut.trim();
  const interieur = texte.startsWith("(") && texte.endsWith(")") ? texte.slice(1, -1) : texte;
  const valeurs: string[] = [];
  let courant = "";
  let guillemet = false;
  let entreGuillemets = false;
  for (let i = 0; i < interieur.length; i += 1) {
    const c = interieur[i];
    if (guillemet) {
      if (c === "\\" && i + 1 < interieur.length) {
        courant += interieur[i + 1];
        i += 1;
      } else if (c === '"') {
        guillemet = false;
      } else {
        courant += c;
      }
      continue;
    }
    if (c === '"') {
      guillemet = true;
      entreGuillemets = true;
      continue;
    }
    if (c === ",") {
      valeurs.push(entreGuillemets ? courant : courant.trim());
      courant = "";
      entreGuillemets = false;
      continue;
    }
    courant += c;
  }
  if (courant.length > 0 || entreGuillemets || valeurs.length > 0) {
    valeurs.push(entreGuillemets ? courant : courant.trim());
  }
  return valeurs;
}

function analyserSelect(brut: string | null): { select: string[] | "*"; simple: boolean; raison?: string } {
  if (brut === null || brut.trim() === "" || brut.trim() === "*") return { select: "*", simple: true };
  const parts = decouperHorsParentheses(brut);
  const colonnes: string[] = [];
  for (const part of parts) {
    if (!COLONNE.test(part)) {
      return { select: "*", simple: false, raison: `select « ${part.slice(0, 60)} »` };
    }
    colonnes.push(part);
  }
  return { select: colonnes, simple: true };
}

function analyserFiltre(cle: string, brut: string): Filtre | { raison: string } {
  if (!COLONNE.test(cle) || CLES_LOGIQUES.has(cle)) return { raison: `filtre « ${cle} »` };
  let reste = brut;
  let negation = false;
  if (reste.startsWith("not.")) {
    negation = true;
    reste = reste.slice(4);
  }
  const point = reste.indexOf(".");
  if (point <= 0) return { raison: `filtre « ${cle} » illisible` };
  const op = reste.slice(0, point);
  const valeur = reste.slice(point + 1);
  if (!OPERATEURS.has(op)) return { raison: `opérateur « ${op} » sur ${cle}` };
  if (op === "in") {
    if (!/^\(.*\)$/s.test(valeur)) return { raison: `in illisible sur ${cle}` };
    return { colonne: cle, op: "in", negation, valeur: parserListeIn(valeur) };
  }
  if (op === "is" && !["null", "true", "false", "unknown"].includes(valeur.toLowerCase())) {
    return { raison: `is.${valeur} sur ${cle}` };
  }
  return { colonne: cle, op: op as OperateurFiltre, negation, valeur };
}

function analyserOrdre(brut: string | null): { ordre: Ordre[]; simple: boolean; raison?: string } {
  if (brut === null || brut.trim() === "") return { ordre: [], simple: true };
  const ordre: Ordre[] = [];
  for (const terme of decouperHorsParentheses(brut)) {
    const [colonne, ...options] = terme.split(".");
    if (!COLONNE.test(colonne)) return { ordre: [], simple: false, raison: `order « ${terme} »` };
    let asc = true;
    let nulls: boolean | null = null;
    for (const option of options) {
      if (option === "asc") asc = true;
      else if (option === "desc") asc = false;
      else if (option === "nullsfirst") nulls = true;
      else if (option === "nullslast") nulls = false;
      else return { ordre: [], simple: false, raison: `order « ${terme} »` };
    }
    ordre.push({ colonne, asc, nullsFirst: nulls ?? !asc });
  }
  return { ordre, simple: true };
}

function entier(brut: string | null): number | null | undefined {
  if (brut === null) return null;
  if (!/^\d+$/.test(brut.trim())) return undefined;
  return Number(brut.trim());
}

/**
 * Lit une URL `/rest/v1/<table>?…` telle que postgrest-js la construit.
 * Ne lève jamais : une forme inconnue rend une requête NON simple, avec sa raison.
 */
export function analyserUrlPostgrest(url: URL): RequetePostgrest {
  const morceaux = url.pathname.split("/").filter(Boolean);
  const table = morceaux[morceaux.length - 1] ?? "";
  const raisons: string[] = [];

  const sel = analyserSelect(url.searchParams.get("select"));
  if (sel.raison) raisons.push(sel.raison);
  const ord = analyserOrdre(url.searchParams.get("order"));
  if (ord.raison) raisons.push(ord.raison);

  const limite = entier(url.searchParams.get("limit"));
  const offset = entier(url.searchParams.get("offset"));
  if (limite === undefined) raisons.push("limit illisible");
  if (offset === undefined) raisons.push("offset illisible");

  const filtres: Filtre[] = [];
  let filtresEvaluables = true;
  for (const [cle, valeur] of url.searchParams.entries()) {
    if (PARAMS_RESERVES.has(cle)) continue;
    const f = analyserFiltre(cle, valeur);
    if ("raison" in f) {
      filtresEvaluables = false;
      raisons.push(f.raison);
      continue;
    }
    filtres.push(f);
  }

  return {
    table,
    select: sel.select,
    selectSimple: sel.simple,
    filtres,
    filtresEvaluables,
    ordre: ord.ordre,
    ordreSimple: ord.simple && limite !== undefined && offset !== undefined,
    limite: limite ?? null,
    offset: offset ?? null,
    raisons,
  };
}

/** La requête tient entièrement dans le sous-ensemble évaluable. */
export function estRequeteSimple(r: RequetePostgrest): boolean {
  return r.selectSimple && r.filtresEvaluables && r.ordreSimple;
}

// ---------------------------------------------------------------------------
// Évaluation
// ---------------------------------------------------------------------------

const NOMBRE = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?)?$/;

function instant(texte: string): number {
  return Date.parse(texte.replace(" ", "T"));
}

/**
 * Compare deux valeurs comme le ferait PostgreSQL sur une colonne simple :
 * nombres en nombres (sinon « 10 » passerait avant « 2 »), dates ISO en
 * instants (« …+00:00 » et « …Z » désignent le même moment), le reste en
 * texte — ce qui convient aux uuid, textes et booléens. Aucun argument nul ici.
 */
export function comparerValeurs(a: unknown, b: unknown): number {
  const na = typeof a === "number" ? a : typeof a === "string" && NOMBRE.test(a) ? Number(a) : NaN;
  const nb = typeof b === "number" ? b : typeof b === "string" && NOMBRE.test(b) ? Number(b) : NaN;
  if ((typeof a === "number" || typeof b === "number") && Number.isFinite(na) && Number.isFinite(nb)) {
    return na === nb ? 0 : na < nb ? -1 : 1;
  }
  if (typeof a === "string" && typeof b === "string" && DATE_ISO.test(a) && DATE_ISO.test(b)) {
    const ta = instant(a);
    const tb = instant(b);
    if (Number.isFinite(ta) && Number.isFinite(tb)) return ta === tb ? 0 : ta < tb ? -1 : 1;
  }
  const sa = typeof a === "object" ? JSON.stringify(a) : String(a);
  const sb = typeof b === "object" ? JSON.stringify(b) : String(b);
  if (typeof a === "boolean" || typeof b === "boolean") {
    const x = sa.toLowerCase();
    const y = sb.toLowerCase();
    return x === y ? 0 : x < y ? -1 : 1;
  }
  return sa === sb ? 0 : sa < sb ? -1 : 1;
}

function motifLike(motif: string, insensible: boolean): RegExp {
  const corps = motif
    .split("")
    .map((c) => (c === "%" || c === "*" ? ".*" : c === "_" ? "." : c.replace(/[.+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${corps}$`, insensible ? "is" : "s");
}

/**
 * Valeur de vérité SQL d'un filtre : vrai, faux, ou inconnu (null) — une
 * colonne NULL rend `eq`, `neq`, `in`, `gt`… inconnus, et `not.` ne les
 * rend pas vrais pour autant (logique à trois valeurs). Seul `is` est binaire.
 */
function evaluer(ligne: Ligne, f: Filtre): boolean | null {
  const v = ligne[f.colonne];
  const nul = v === null || v === undefined;
  let res: boolean | null;
  switch (f.op) {
    case "is": {
      const attendu = String(f.valeur).toLowerCase();
      res = attendu === "null" || attendu === "unknown"
        ? nul
        : attendu === "true"
        ? v === true
        : v === false;
      break;
    }
    case "eq":
      res = nul ? null : comparerValeurs(v, f.valeur) === 0;
      break;
    case "neq":
      res = nul ? null : comparerValeurs(v, f.valeur) !== 0;
      break;
    case "gt":
      res = nul ? null : comparerValeurs(v, f.valeur) > 0;
      break;
    case "gte":
      res = nul ? null : comparerValeurs(v, f.valeur) >= 0;
      break;
    case "lt":
      res = nul ? null : comparerValeurs(v, f.valeur) < 0;
      break;
    case "lte":
      res = nul ? null : comparerValeurs(v, f.valeur) <= 0;
      break;
    case "in":
      res = nul ? null : (f.valeur as string[]).some((x) => comparerValeurs(v, x) === 0);
      break;
    case "like":
    case "ilike":
      res = nul ? null : motifLike(String(f.valeur), f.op === "ilike").test(String(v));
      break;
    default:
      res = null;
  }
  if (res === null) return null;
  return f.negation ? !res : res;
}

/** La ligne passe-t-elle TOUS les filtres (vrai strict, pas « inconnu ») ? */
export function ligneCorrespond(ligne: Ligne, filtres: readonly Filtre[]): boolean {
  return filtres.every((f) => evaluer(ligne, f) === true);
}

/** Tri stable selon `order`, puis `offset` et `limit`. */
export function trierEtCouper(
  lignes: readonly Ligne[],
  ordre: readonly Ordre[],
  limite: number | null,
  offset: number | null,
): Ligne[] {
  let triees = [...lignes];
  if (ordre.length > 0) {
    triees = triees
      .map((l, i) => ({ l, i }))
      .sort((x, y) => {
        for (const o of ordre) {
          const a = x.l[o.colonne];
          const b = y.l[o.colonne];
          const an = a === null || a === undefined;
          const bn = b === null || b === undefined;
          let d = 0;
          if (an && bn) d = 0;
          else if (an) d = o.nullsFirst ? -1 : 1;
          else if (bn) d = o.nullsFirst ? 1 : -1;
          else d = o.asc ? comparerValeurs(a, b) : -comparerValeurs(a, b);
          if (d !== 0) return d;
        }
        return x.i - y.i;
      })
      .map((x) => x.l);
  }
  const debut = offset ?? 0;
  return limite === null ? triees.slice(debut) : triees.slice(debut, debut + limite);
}

/** Projection sur le select d'origine (colonne absente → null, comme une colonne vide). */
export function projeter(ligne: Ligne, select: string[] | "*"): Ligne {
  if (select === "*") return structuredClone(ligne);
  const out: Ligne = {};
  for (const c of select) out[c] = c in ligne ? structuredClone(ligne[c]) : null;
  return out;
}

/** Jetons d'un en-tête `Prefer` (postgrest-js les ajoute avec `append`). */
export function preferences(entete: string | null): Set<string> {
  return new Set(
    (entete ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
  );
}

export const ACCEPT_OBJET = "application/vnd.pgrst.object+json";

/**
 * Forme de réponse demandée. Seules les formes CONNUES sont superposées par le
 * calque ; une autre (`;nulls=stripped`, csv, plan…) passe sans superposition
 * en lecture, et le test le dit.
 */
export function formeAccept(accept: string | null): "tableau" | "objet" | "inconnue" {
  const a = (accept ?? "").trim();
  if (a === "" || a === "*/*" || a === "application/json") return "tableau";
  if (a === ACCEPT_OBJET) return "objet";
  return "inconnue";
}

export function veutObjet(accept: string | null): boolean {
  return formeAccept(accept) === "objet";
}

const ENTETES_JSON = { "content-type": "application/json; charset=utf-8" };

/** Réponse au format PostgREST : objet (ou 406 PGRST116) ou tableau. */
export function reponsePostgrest(lignes: readonly Ligne[], objet: boolean, statut = 200): Response {
  if (objet) {
    if (lignes.length !== 1) {
      return new Response(
        JSON.stringify({
          code: "PGRST116",
          details: `The result contains ${lignes.length} rows`,
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned",
        }),
        { status: 406, headers: ENTETES_JSON },
      );
    }
    return new Response(JSON.stringify(lignes[0]), { status: statut, headers: ENTETES_JSON });
  }
  return new Response(JSON.stringify(lignes), { status: statut, headers: ENTETES_JSON });
}

/** Filtres d'une URL, lisibles pour le journal (« id=eq.… & statut=in.(…) »). */
export function decrireFiltres(url: URL): string {
  const parts: string[] = [];
  for (const [cle, valeur] of url.searchParams.entries()) {
    if (cle === "select" || cle === "columns") continue;
    parts.push(`${cle}=${valeur}`);
  }
  const texte = parts.join(" & ");
  return texte.length > 300 ? `${texte.slice(0, 299)}…` : texte;
}
