/**
 * Prompt 27 : la colonne Context de la masterlist. Les 10 derniers messages
 * d'une conversation Upwork, des deux côtés, du plus récent au plus ancien
 * (`roomStories` ne promet aucun ordre).
 */
export interface MessageSalon {
  id: string;
  at: string;
  texte: string;
  de: "posteur" | "nous";
}

/** Upwork rend parfois le texte encodé en HTML (« I&#39;m »). */
export function decoderHtml(t: string): string {
  return t.replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// deno-lint-ignore no-explicit-any
export function derniersMessagesSalon(noeuds: any[], freelance: string, n = 10): MessageSalon[] {
  return noeuds
    .filter((x) => x?.id && String(x.message ?? "").trim() && !Number.isNaN(new Date(x.createdDateTime).getTime()))
    .map((x) => ({
      id: String(x.id),
      at: new Date(x.createdDateTime).toISOString(),
      texte: decoderHtml(String(x.message).trim()).slice(0, 2000),
      de: x.user?.id === freelance ? "posteur" as const : "nous" as const,
    }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, n);
}
