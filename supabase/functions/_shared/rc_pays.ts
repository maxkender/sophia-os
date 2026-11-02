/**
 * Page « Pays » (2/11) : lecture des proceeds RevenueCat par pays et par
 * semaine. Ce module est pur (pas de réseau) : il transforme une réponse du
 * graphique « revenue » (segment = country) en lignes à ranger dans
 * `rc_proceeds_pays_semaine`.
 *
 * Réponse RevenueCat (Charts v2) : `segments[i].display_name` (« Germany »,
 * « Total »…), `measures[j].display_name` (« Proceeds », « Transactions »…) et
 * `values[]` = { cohort (secondes UTC, début de la période), segment, measure,
 * value, incomplete }. La semaine RevenueCat commence le dimanche (UTC) : elle
 * est rangée sous le lundi qui suit (la semaine de l'OS, du lundi au dimanche),
 * soit un jour de décalage.
 */

export interface LigneRcPays {
  pays: string | null;
  pays_nom: string;
  semaine: string;
  proceeds: number;
  transactions: number;
  incomplet: boolean;
}

/** Noms RevenueCat que Intl ne rend pas à l'identique. */
const NOMS_SPECIAUX: Record<string, string> = {
  // Intl rend aussi « France » pour FX (France métropolitaine) : FR, toujours.
  "france": "FR",
  "türkiye": "TR",
  "turkey": "TR",
  "congo, the democratic republic of the": "CD",
  "congo": "CG",
  "bosnia and herzegovina": "BA",
  "czechia": "CZ",
  "czech republic": "CZ",
  "north macedonia": "MK",
  "bahamas": "BS",
  "the bahamas": "BS",
  "taiwan": "TW",
  "réunion": "RE",
  "reunion": "RE",
  "united states": "US",
  "united kingdom": "GB",
  "korea, republic of": "KR",
  "south korea": "KR",
  "russia": "RU",
  "russian federation": "RU",
  "moldova": "MD",
  "moldova, republic of": "MD",
  "viet nam": "VN",
  "vietnam": "VN",
  "iran": "IR",
  "côte d'ivoire": "CI",
  "hong kong": "HK",
  "macao": "MO",
  "palestine": "PS",
  "kosovo": "XK",
};

/** Codes historiques ou non standard qu'Intl nomme comme un vrai pays (DD « Germany », FX « France »…). */
const CODES_HISTORIQUES = new Set(["AN", "BU", "CS", "DD", "EU", "EZ", "FX", "NT", "QO", "SU", "TP", "UN", "YD", "YU", "ZR", "ZZ"]);

let indexNoms: Map<string, string> | null = null;

function normaliser(nom: string): string {
  return nom.trim().toLowerCase();
}

/** Le code ISO 3166-1 alpha-2 d'un nom de pays RevenueCat (anglais), ou null. */
export function codePays(nom: string | null | undefined): string | null {
  if (!nom) return null;
  const n = normaliser(nom);
  if (n === "total" || n === "other" || n === "unknown") return null;
  if (NOMS_SPECIAUX[n]) return NOMS_SPECIAUX[n];
  if (!indexNoms) {
    indexNoms = new Map();
    try {
      const noms = new Intl.DisplayNames(["en"], { type: "region" });
      const A = "A".charCodeAt(0);
      for (let i = 0; i < 26; i++) {
        for (let j = 0; j < 26; j++) {
          const code = String.fromCharCode(A + i) + String.fromCharCode(A + j);
          let affiche: string | undefined;
          try {
            affiche = noms.of(code);
          } catch {
            affiche = undefined;
          }
          if (affiche && affiche !== code && !CODES_HISTORIQUES.has(code) && !indexNoms.has(normaliser(affiche))) indexNoms.set(normaliser(affiche), code);
        }
      }
    } catch {
      // Intl sans données de régions : seuls les noms spéciaux sont reconnus.
    }
  }
  return indexNoms.get(n) ?? null;
}

/** Le lundi (AAAA-MM-JJ) de la semaine OS qui correspond à une période RevenueCat. */
export function lundiDeCohorte(secondes: number): string {
  const d = new Date(secondes * 1000);
  const jour = d.getUTCDay(); // 0 = dimanche
  // Dimanche → lundi suivant ; lundi → lui-même ; sinon, le lundi de la semaine.
  const decalage = jour === 0 ? 1 : 1 - jour;
  d.setUTCDate(d.getUTCDate() + decalage);
  return d.toISOString().slice(0, 10);
}

// deno-lint-ignore no-explicit-any
type Brut = any;

/**
 * Les lignes (pays × semaine) d'une réponse « revenue » segmentée par pays :
 * Proceeds et Transactions. Le segment « Total » est gardé (pays = null,
 * pays_nom = « Total ») pour contrôler la somme.
 */
export function lireRevenuParPays(data: Brut): LigneRcPays[] {
  const segments: string[] = (Array.isArray(data?.segments) ? data.segments : []).map((s: Brut) => String(s?.display_name ?? ""));
  const mesures: string[] = (Array.isArray(data?.measures) ? data.measures : []).map((m: Brut) => String(m?.display_name ?? ""));
  const iProceeds = mesures.findIndex((m) => /proceeds|revenue/i.test(m));
  const iTransactions = mesures.findIndex((m) => /transactions/i.test(m));
  const parCle = new Map<string, LigneRcPays>();
  for (const v of Array.isArray(data?.values) ? data.values : []) {
    const nom = segments[Number(v?.segment)];
    const cohort = Number(v?.cohort);
    if (!nom || !Number.isFinite(cohort)) continue;
    const semaine = lundiDeCohorte(cohort);
    const cle = `${nom}|${semaine}`;
    let l = parCle.get(cle);
    if (!l) {
      l = { pays: codePays(nom), pays_nom: nom, semaine, proceeds: 0, transactions: 0, incomplet: false };
      parCle.set(cle, l);
    }
    const valeur = Number(v?.value ?? 0);
    if (Number(v?.measure) === iProceeds) l.proceeds = Math.round(valeur * 100) / 100;
    if (Number(v?.measure) === iTransactions) l.transactions = Math.round(valeur);
    if (v?.incomplete === true) l.incomplet = true;
  }
  return [...parCle.values()];
}

/** La devise d'une réponse (« EUR »), ou null. */
export function deviseReponse(data: Brut): string | null {
  const d = data?.yaxis_currency;
  return typeof d === "string" && d ? d : null;
}

/**
 * Le filtre « transaction type = New » trouvé dans les options du graphique
 * (GET …/charts/revenue/options), ou null. Les options listent des filtres
 * { id, display_name, values: [{ id, display_name }] } (noms défensifs : les
 * champs exacts ne sont pas documentés).
 */
export function filtreNouvelles(options: Brut): { name: string; values: string[] } | null {
  const candidats: Brut[] = [
    ...(Array.isArray(options?.filters) ? options.filters : []),
    ...(Array.isArray(options?.segments) ? options.segments : []),
  ];
  for (const f of candidats) {
    const nom = String(f?.display_name ?? f?.name ?? f?.id ?? "");
    if (!/transaction.?type/i.test(nom)) continue;
    const id = String(f?.id ?? f?.name ?? "");
    const valeurs: Brut[] = Array.isArray(f?.values) ? f.values : Array.isArray(f?.options) ? f.options : [];
    const nouvelle = valeurs.find((x: Brut) => /^new$/i.test(String(x?.display_name ?? x?.name ?? x?.id ?? x ?? "")));
    if (id && nouvelle !== undefined) {
      const valeur = typeof nouvelle === "string" ? nouvelle : String(nouvelle?.id ?? nouvelle?.value ?? nouvelle?.name ?? "");
      if (valeur) return { name: id, values: [valeur] };
    }
    if (id) return { name: id, values: ["new"] };
  }
  return null;
}
