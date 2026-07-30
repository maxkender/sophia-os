/**
 * Réponse NDJSON générique (une ligne JSON par événement) — sans dépendre
 * du pipeline nettoyage/gemini (évite de gonfler les bundles Edge).
 */

import { corsHeaders } from "./supabase.ts";

export type EmetteurNdjson = (e: Record<string, unknown>) => void;

export function reponseNdjson(
  run: (emit: EmetteurNdjson) => Promise<void>,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const emit: EmetteurNdjson = (e) => {
        controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      };
      try {
        await run(emit);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        emit({ etape: "ready", statut: "echec", detail });
      } finally {
        try {
          controller.close();
        } catch {
          // déjà fermé
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache",
      ...corsHeaders,
    },
  });
}

export function veutStream(request: Request, corps: { stream?: unknown }): boolean {
  if (corps.stream === true || corps.stream === "true") return true;
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("application/x-ndjson");
}
