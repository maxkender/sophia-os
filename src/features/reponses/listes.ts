/**
 * Messages received (prompt 22, partie 7) : les 4 onglets, sans rien lire en
 * base. Le compteur d'un onglet = les lignes qu'il affiche.
 */
import type { KillArrete, ReponsePosteur } from "./api";

export const ONGLETS_REPONSES = ["a_lire", "paie", "stop", "auto"] as const;
export type OngletReponses = (typeof ONGLETS_REPONSES)[number];

const cas = (r: ReponsePosteur) => r.corrige_cas ?? r.cas;

/**
 * - To read : la liste « à lire », pas encore lue ;
 * - Pay questions : la liste « paie », pas encore lue ;
 * - Stop requests : « je ne veux plus » (le bon cas s'il a été corrigé) ;
 * - Answered by the OS : une réponse automatique partie (ou prévue, en test).
 */
export function listesReponses(toutes: readonly ReponsePosteur[]): Record<OngletReponses, ReponsePosteur[]> {
  return {
    a_lire: toutes.filter((r) => r.liste === "a_lire" && !r.lu_at),
    paie: toutes.filter((r) => r.liste === "paie" && !r.lu_at),
    stop: toutes.filter((r) => cas(r) === "stop"),
    auto: toutes.filter((r) => r.reponse_statut === "envoye" || r.reponse_statut === "simule"),
  };
}

/** Le Kill qu'un message a arrêté (« réaction reçue », 0410) : annulé dans les 24 h qui suivent le message. */
export function killArretePar(kills: readonly KillArrete[], r: Pick<ReponsePosteur, "poster_id" | "recu_at">): KillArrete | null {
  const recu = Date.parse(r.recu_at);
  return (
    kills.find((k) => {
      if (k.poster_id !== r.poster_id || !k.annule_at) return false;
      const annule = Date.parse(k.annule_at);
      return annule >= recu && annule - recu <= 24 * 3_600_000;
    }) ?? null
  );
}
