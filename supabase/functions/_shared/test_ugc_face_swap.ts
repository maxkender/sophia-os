/**
 * Test admin isolé — face swap vidéo (persona + reaction → Kling).
 * Aucune écriture prod : pas de comptes, labels, caption, concat, ni ugc_video_posts.
 */

export type PayloadTestFaceSwap = {
  personaId: string;
  reactionId: string;
};

export function parserPayloadTestFaceSwap(raw: unknown): PayloadTestFaceSwap {
  const o = (raw ?? {}) as Record<string, unknown>;
  const personaId = String(o.personaId ?? o.persona_id ?? "").trim();
  const reactionId = String(o.reactionId ?? o.reaction_id ?? "").trim();
  if (!personaId) throw new Error("personaId requis");
  if (!reactionId) throw new Error("reactionId requis");
  return { personaId, reactionId };
}

/** Préfixe storage isolé — hors chemins d’assignation / posts. */
export function cheminStorageTestFaceSwap(runId: string): string {
  const id = String(runId ?? "").trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("runId invalide");
  return `ugc/test-runs/${id}/swap.mp4`;
}

export function estSourceWebm(opts: {
  path?: string | null;
  url?: string | null;
  mime?: string | null;
}): boolean {
  return (
    /\.webm(\?|$)/i.test(opts.path ?? "") ||
    /\.webm(\?|$)/i.test(opts.url ?? "") ||
    (opts.mime?.includes("webm") ?? false)
  );
}
