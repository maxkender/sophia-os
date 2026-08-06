/**
 * File d'attente Fal générique (submit → poll → result).
 * Secret : FAL_KEY | FAL_API_KEY
 */

export function falKey(): string | null {
  return Deno.env.get("FAL_KEY") ?? Deno.env.get("FAL_API_KEY") ?? null;
}

export function falAuthHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Key ${key}`,
    "Content-Type": "application/json",
  };
}

export type FalQueueProgress = (info: {
  phase: "submit" | "poll" | "result" | "download";
  requestId?: string;
  polls?: number;
  statut?: string;
  detail?: string;
}) => void | Promise<void>;

export async function falQueueSubmit(
  modelId: string,
  body: Record<string, unknown>,
  onProgress?: FalQueueProgress,
): Promise<Record<string, unknown>> {
  const key = falKey();
  if (!key) throw new Error("FAL_KEY manquant");
  const queueBase = `https://queue.fal.run/${modelId}`;
  await onProgress?.({
    phase: "submit",
    detail: `modèle=${modelId}`,
  });
  const submit = await fetch(queueBase, {
    method: "POST",
    headers: falAuthHeaders(key),
    body: JSON.stringify(body),
  });
  if (!submit.ok) {
    throw new Error(
      `Fal ${modelId} submit ${submit.status}: ${(await submit.text()).slice(0, 400)}`,
    );
  }
  return await submit.json();
}

export async function falQueueAwaitJson(
  modelId: string,
  queued: Record<string, unknown>,
  onProgress?: FalQueueProgress,
  budgetMs = 600_000,
): Promise<Record<string, unknown>> {
  const key = falKey();
  if (!key) throw new Error("FAL_KEY manquant");
  const queueBase = `https://queue.fal.run/${modelId}`;
  const requestId = queued.request_id as string | undefined;
  const statusUrl =
    (queued.status_url as string | undefined) ??
    (requestId ? `${queueBase}/requests/${requestId}/status` : null);
  const resultUrl =
    (queued.response_url as string | undefined) ??
    (requestId ? `${queueBase}/requests/${requestId}` : null);
  if (!statusUrl || !resultUrl) {
    throw new Error(`Fal ${modelId}: queue invalide ${JSON.stringify(queued).slice(0, 200)}`);
  }

  const debut = Date.now();
  let statut = queued.status as string | undefined;
  let polls = 0;

  while (Date.now() - debut < budgetMs) {
    polls += 1;
    const st = await fetch(`${statusUrl}?logs=0`, { headers: falAuthHeaders(key) });
    if (!st.ok) {
      throw new Error(`Fal ${modelId} status ${st.status}: ${(await st.text()).slice(0, 250)}`);
    }
    const body = await st.json();
    statut = body.status as string;
    await onProgress?.({
      phase: "poll",
      requestId,
      polls,
      statut,
      detail: `poll #${polls} → ${statut}`,
    });
    if (statut === "COMPLETED") break;
    if (statut === "FAILED" || statut === "CANCELLED") {
      throw new Error(
        `Fal ${modelId} ${statut}: ${JSON.stringify(body.error ?? body).slice(0, 300)}`,
      );
    }
    await new Promise((r) => setTimeout(r, 2500));
  }

  if (statut !== "COMPLETED") {
    throw new Error(
      `Fal ${modelId}: timeout (${Math.round(budgetMs / 1000)}s), dernier=${statut}, polls=${polls}`,
    );
  }

  await onProgress?.({ phase: "result", requestId, polls, statut });
  const res = await fetch(resultUrl, { headers: falAuthHeaders(key) });
  const texte = await res.text();
  if (!res.ok) {
    throw new Error(`Fal ${modelId} result ${res.status}: ${texte.slice(0, 300)}`);
  }
  try {
    return JSON.parse(texte) as Record<string, unknown>;
  } catch {
    throw new Error(`Fal ${modelId}: JSON invalide ${texte.slice(0, 200)}`);
  }
}

export async function falDownloadBytes(
  url: string,
  onProgress?: FalQueueProgress,
): Promise<{ url: string; bytes: Uint8Array; mime: string }> {
  await onProgress?.({ phase: "download", detail: "téléchargement" });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fal download ${res.status}`);
  const mime = res.headers.get("content-type") ?? "application/octet-stream";
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { url, bytes, mime };
}

/** URL sans `?v=` / query (Fal sniffe parfois mal les cache-busters). */
export function falUrlSansQuery(url: string): string {
  const u = String(url ?? "").trim();
  const i = u.indexOf("?");
  return i >= 0 ? u.slice(0, i) : u;
}

/**
 * Upload octets vers le CDN Fal (v3) — pour que les runners Fal/Replicate
 * n'aient pas à télécharger depuis Supabase (file_download_error intermittent).
 */
export async function falHebergerOctets(
  bytes: Uint8Array,
  contentType: string,
  fileName: string,
): Promise<string> {
  const key = falKey();
  if (!key) throw new Error("FAL_KEY manquant");
  const mime = (contentType || "application/octet-stream").split(";")[0]!.trim();
  const name = fileName.trim() || `file-${Date.now()}`;

  const init = await fetch(
    "https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
    {
      method: "POST",
      headers: falAuthHeaders(key),
      body: JSON.stringify({ content_type: mime, file_name: name }),
    },
  );
  if (!init.ok) {
    throw new Error(
      `Fal storage initiate ${init.status}: ${(await init.text()).slice(0, 250)}`,
    );
  }
  const issued = (await init.json()) as {
    upload_url?: string;
    file_url?: string;
  };
  if (!issued.upload_url || !issued.file_url) {
    throw new Error(
      `Fal storage initiate: réponse invalide ${JSON.stringify(issued).slice(0, 200)}`,
    );
  }

  const put = await fetch(issued.upload_url, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: bytes,
  });
  if (!put.ok) {
    throw new Error(
      `Fal storage PUT ${put.status}: ${(await put.text()).slice(0, 200)}`,
    );
  }
  return issued.file_url;
}

/**
 * Télécharge une URL (Supabase, etc.) puis la rehéberge sur le CDN Fal.
 * Retombe sur l'URL sans query si l'upload Fal échoue.
 */
export async function falRehebergerUrl(
  sourceUrl: string,
  opts?: { fileName?: string; onProgress?: FalQueueProgress },
): Promise<string> {
  const clean = falUrlSansQuery(sourceUrl);
  if (!clean) throw new Error("falRehebergerUrl: url vide");

  await opts?.onProgress?.({
    phase: "download",
    detail: `rehost Fal · fetch ${clean.slice(-48)}`,
  });
  const res = await fetch(clean);
  if (!res.ok) {
    throw new Error(`falRehebergerUrl: fetch source ${res.status}`);
  }
  const mime =
    (res.headers.get("content-type") ?? "application/octet-stream")
      .split(";")[0]!
      .trim();
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 32) {
    throw new Error(`falRehebergerUrl: fichier trop petit (${bytes.length} o)`);
  }

  const ext = mime.includes("png")
    ? "png"
    : mime.includes("webp")
      ? "webp"
      : mime.includes("jpeg") || mime.includes("jpg")
        ? "jpg"
        : mime.includes("mp4")
          ? "mp4"
          : mime.includes("webm")
            ? "webm"
            : "bin";
  const fileName = opts?.fileName?.trim() || `rehost-${Date.now()}.${ext}`;

  try {
    const falUrl = await falHebergerOctets(bytes, mime, fileName);
    await opts?.onProgress?.({
      phase: "submit",
      detail: `rehost Fal OK · ${falUrl.slice(-56)}`,
    });
    return falUrl;
  } catch (e) {
    await opts?.onProgress?.({
      phase: "submit",
      detail: `rehost Fal échec (${e instanceof Error ? e.message : String(e)}) — URL sans query`,
    });
    return clean;
  }
}
