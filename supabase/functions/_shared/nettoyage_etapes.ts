/**
 * Helpers pour exposer le déroulé du nettoyage (text-removal → … → C2PA → ready)
 * en NDJSON streamé vers le front.
 */

import { corsHeaders } from "./supabase.ts";

export type EmetteurEtape = (
  e: { etape: string; statut: string; detail?: string } & Record<string, unknown>,
) => void;

/** Réponse NDJSON (une ligne JSON par événement). */
export function reponseNdjson(
  run: (emit: EmetteurEtape) => Promise<void>,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const emit: EmetteurEtape = (e) => {
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
