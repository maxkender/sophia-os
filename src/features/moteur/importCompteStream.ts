/** Parsing du stream NDJSON d'import-compte (listing + enqueue). */

export type ImportCompteResultat = {
  ok: boolean;
  handle: string;
  total: number;
  connus: number;
  source: string;
  batchId: string;
  enqueued: number;
  skipped: number;
  langue?: string | null;
};

export type ImportCompteLogLevel = "info" | "ok" | "warn" | "error";

export function niveauLogImportCompte(
  ev: Record<string, unknown>,
): ImportCompteLogLevel {
  const statut = typeof ev.statut === "string" ? ev.statut : "";
  const detail = typeof ev.detail === "string" ? ev.detail : "";
  if (statut === "echec" || ev.ok === false) return "error";
  if (statut === "ok" && ev.etape === "ready") return "ok";
  if (/échec|echec|erreur|ÉCHEC|ATTENTION/i.test(detail)) return "warn";
  return "info";
}

export function extraireResultatImportCompte(
  ev: Record<string, unknown>,
): ImportCompteResultat | null {
  if (ev.etape !== "ready" || ev.ok !== true) return null;
  if (typeof ev.batchId !== "string" || ev.batchId.length === 0) return null;
  return {
    ok: true,
    handle: String(ev.handle ?? ""),
    total: Number(ev.total ?? 0),
    connus: Number(ev.connus ?? 0),
    source: String(ev.source ?? ""),
    batchId: ev.batchId,
    enqueued: Number(ev.enqueued ?? 0),
    skipped: Number(ev.skipped ?? 0),
    langue: typeof ev.langue === "string" ? ev.langue : null,
  };
}

export function messageErreurImportCompte(raw: string): string {
  if (/idle timeout|150s/i.test(raw)) {
    return (
      "Timeout Edge (150s) pendant listing/enqueue — plus aucun byte reçu. " +
      "Les logs d'étapes (page TikTok / Apify / table contenus) doivent streamer en live : " +
      "si tu ne vois que « Listing + enqueue », relance après déploiement de import-contenu."
    );
  }
  return raw;
}
