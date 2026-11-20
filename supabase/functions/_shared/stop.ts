/**
 * 0684 (Max, 12/11) : STOP = arrêt immédiat de toutes les relances.
 * Dès qu'un posteur a dit STOP (message Slack, Help, Upwork, bouton, lien « Unsubscribe »),
 * `profiles.relances_stop_at` est posé (triggers 0684). Avant d'écrire à un posteur, chaque
 * envoi (DM Slack, message Upwork, email) passe ici : rien ne part, sauf ce qui est permis
 * malgré le STOP — la confirmation d'arrêt, la paie de sa dernière semaine, une réponse à un
 * message qu'il vient d'écrire, un message tapé à la main par l'équipe.
 */
export const STOP_POSTEUR = "STOP demandé : plus aucune relance (relances_stop_at)";

/** Pourquoi un message part malgré le STOP (tout le reste est bloqué). 0797 : « message_fin », le seul message permis
 * à un posteur arrêté (liste « ne plus contacter »). */
export type MalgreStop = "confirmation_arret" | "paie" | "reponse" | "manuel" | "message_fin";

/**
 * 0797 (Max, 20/11) : un posteur arrêté (Kill du samedi, inactif automatique, tout arrêt non annulé) est dans la liste
 * « ne plus contacter ». Plus aucun envoi (email, Upwork, Slack, bandeau, pop-up, relance HM) : le seul message qu'il
 * reçoit est le message de fin. Plus strict que le STOP : aucune autre exception.
 */
export const NE_PLUS_CONTACTER = "posteur arrêté : plus aucun message (liste « ne plus contacter »), sauf le message de fin";

/** Le message part-il malgré la liste « ne plus contacter » ? Seulement le message de fin. */
export function permisApresArret(malgre: MalgreStop | null | undefined): boolean {
  return malgre === "message_fin";
}

async function lireBool(db: Db, fn: string, args: Record<string, unknown>): Promise<boolean> {
  try {
    const { data, error } = await db.rpc(fn, args);
    if (error) {
      console.warn(`[ne_plus_contacter] ${fn} : ${error.message}`);
      return false;
    }
    return data === true;
  } catch (e) {
    console.warn(`[ne_plus_contacter] ${fn} : ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** Le posteur est-il dans la liste « ne plus contacter » ? */
export function nePlusContacter(db: Db, posterId: string | null | undefined): Promise<boolean> {
  return posterId ? lireBool(db, "ne_plus_contacter_bloque", { p_poster: posterId }) : Promise.resolve(false);
}

/** Même chose par le contrat Upwork. */
export function nePlusContacterContrat(db: Db, contratId: string | null | undefined): Promise<boolean> {
  return contratId ? lireBool(db, "ne_plus_contacter_contrat", { p_contrat: contratId }) : Promise.resolve(false);
}

/** Même chose par l'adresse email (emails de l'OS). */
export function nePlusContacterEmail(db: Db, email: string | null | undefined): Promise<boolean> {
  return email && email.includes("@") ? lireBool(db, "ne_plus_contacter_email", { p_email: email }) : Promise.resolve(false);
}

/** Un email est-il le message de fin (étiquettes de l'envoi) ? */
export function emailMessageFin(tags: readonly string[] | null | undefined): boolean {
  return (tags ?? []).some((t) => t === "fin_collaboration" || t === "message_fin");
}

// deno-lint-ignore no-explicit-any
type Db = any;

/** Le posteur a-t-il demandé STOP ? Une lecture en échec ne bloque pas (l'erreur est notée). */
export async function stopDemande(db: Db, posterId: string | null | undefined): Promise<boolean> {
  if (!posterId) return false;
  const { data, error } = await db.from("profiles").select("relances_stop_at").eq("id", posterId).maybeSingle();
  if (error) {
    console.warn(`[stop] fiche illisible (${posterId}) : ${error.message}`);
    return false;
  }
  return !!data?.relances_stop_at;
}

/** Même chose par le contrat Upwork (les messages Upwork partent par contrat). */
export async function stopDuContrat(db: Db, contratId: string | null | undefined): Promise<boolean> {
  if (!contratId) return false;
  const { data, error } = await db.from("profiles").select("relances_stop_at").eq("upwork_contract_id", contratId).not("relances_stop_at", "is", null).limit(1);
  if (error) {
    console.warn(`[stop] contrat illisible (${contratId}) : ${error.message}`);
    return false;
  }
  return (data ?? []).length > 0;
}

/** Les posteurs d'une liste qui ont demandé STOP (pour filtrer un envoi groupé). */
export async function postersEnStop(db: Db, ids: readonly string[]): Promise<Set<string>> {
  const uniques = [...new Set(ids.filter(Boolean))];
  if (!uniques.length) return new Set();
  const { data, error } = await db.from("profiles").select("id").in("id", uniques).not("relances_stop_at", "is", null);
  if (error) {
    console.warn(`[stop] fiches illisibles : ${error.message}`);
    return new Set();
  }
  return new Set(((data ?? []) as { id: string }[]).map((p) => p.id));
}

/** Un message Upwork (par son type) part-il malgré le STOP ? */
export function typeUpworkPermisMalgreStop(type: unknown, manuel: boolean): boolean {
  const t = typeof type === "string" ? type.trim() : "";
  if (t === "stop" || t === "bot_stop" || t === "paie") return true;
  // Tapé à la main dans l'OS par l'équipe (pas un envoi programmé).
  return manuel && (t === "" || t === "manuel");
}
