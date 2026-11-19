/**
 * Les retours des relecteurs natifs PROPRES À UNE APPLICATION (0751), tels que
 * le placement de cette application les reçoit dans une langue : la page
 * Traduction & placement les montre par langue et par application.
 *
 * `ligneRetour` et `blocRetoursApplication` sont la copie, au caractère près,
 * de celles du moteur (`supabase/functions/_shared/corrections_natives.ts`) :
 * l'aperçu doit être le texte que le modèle lit. `retoursApplication.test.ts`
 * vérifie que les deux restent identiques.
 */

/** Une correction retenue, sur une ligne : « au lieu de …, écris … » ou « évite … ». */
function ligneRetour(c: { fautif: string; corrige: string | null; explication: string | null }): string {
  const corrige = (c.corrige ?? "").trim();
  const explication = (c.explication ?? "").trim();
  return `- ${corrige ? `au lieu de « ${c.fautif.trim()} », écris « ${corrige} »` : `évite « ${c.fautif.trim()} »`}${
    explication ? ` (${explication})` : ""
  }`;
}

/** Le bloc des retours propres à une application. Pur : testé sans réseau. */
export function blocRetoursApplication(
  langue: string,
  corrections: Array<{ fautif: string; corrige: string | null; explication: string | null }>,
): string | null {
  const vues = new Set<string>();
  const lignes: string[] = [];
  for (const c of corrections) {
    const cle = c.fautif.trim().toLowerCase();
    if (!cle || vues.has(cle)) continue;
    vues.add(cle);
    lignes.push(ligneRetour(c));
  }
  if (lignes.length === 0) return null;
  return `=== RETOURS DES RELECTEURS NATIFS SUR LA SLIDE DE L'APPLI (${langue.toUpperCase()}) ===
Des natifs ont relu nos slides d'appli dans cette langue et relevé ceci. Applique ces retours, et ne refais pas ces erreurs dans des phrases voisines :
${lignes.join("\n")}`;
}

/** Le moteur ne donne au placement que les plus récentes (`chargerRetoursApplication`, `max = 40`). */
export const MAX_RETOURS_APPLICATION = 40;

/** Une correction retenue rangée sous une application. */
export interface RetourApplication {
  langue: string;
  application_id: string;
  fautif: string;
  corrige: string | null;
  explication: string | null;
  created_at: string;
}

/** Ce que le placement d'UNE application reçoit dans UNE langue. */
export interface GroupeRetours {
  langue: string;
  applicationId: string;
  /** Les retours du bloc (sans doublon). */
  n: number;
  /** Les retours retenus plus anciens que les 40 lus : le placement ne les reçoit plus. */
  horsBloc: number;
  bloc: string;
}

/**
 * Range les corrections retenues par (langue, application) et écrit, pour
 * chaque couple, le bloc ajouté au prompt de placement : les 40 plus récentes,
 * sans doublon, comme le moteur. Trié par langue puis par application.
 */
export function groupesRetours(lignes: readonly RetourApplication[]): GroupeRetours[] {
  const parCouple = new Map<string, RetourApplication[]>();
  for (const l of lignes) {
    const cle = `${l.langue.toLowerCase()}|${l.application_id}`;
    parCouple.set(cle, [...(parCouple.get(cle) ?? []), l]);
  }
  const groupes: GroupeRetours[] = [];
  for (const [cle, corrections] of parCouple) {
    const [langue, applicationId] = cle.split("|");
    const recentes = [...corrections].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const lues = recentes.slice(0, MAX_RETOURS_APPLICATION);
    const bloc = blocRetoursApplication(langue, lues);
    if (!bloc) continue;
    groupes.push({
      langue,
      applicationId,
      n: new Set(lues.map((c) => c.fautif.trim().toLowerCase()).filter(Boolean)).size,
      horsBloc: recentes.length - lues.length,
      bloc,
    });
  }
  return groupes.sort((a, b) => a.langue.localeCompare(b.langue) || a.applicationId.localeCompare(b.applicationId));
}
