/**
 * pod-labo — animation des réactions du pod 3 (Kling 2.6 motion control, fal).
 *
 * L'agent du pod envoie une image de départ (son persona synthétique dans le
 * décor de la réaction, sans texte) et la vidéo de la réaction : Kling anime
 * l'image avec les mouvements de la vidéo. Seuls les MOUVEMENTS de la vidéo
 * source sont repris, jamais l'image d'une vraie personne.
 *
 * La clé fal reste dans les secrets de l'OS ; l'agent ne la voit jamais.
 * Accès : en-tête x-pod-jeton du pod `reactions_ugc` (empreinte SHA-256 dans pods).
 *
 *   { action: "soumettre", qualite: "pro"|"standard", image_url, video_url, prompt? }
 *   { action: "etat", qualite, request_id }   → { status, video_url? }
 */

import { json } from "../_shared/supabase.ts";
import { sha256Hex } from "../_shared/pods.ts";

const MODELES: Record<string, string> = {
  pro: "fal-ai/kling-video/v2.6/pro/motion-control",
  standard: "fal-ai/kling-video/v2.6/standard/motion-control",
};
const POD = "reactions_ugc";

async function jetonValide(jeton: string): Promise<boolean> {
  if (!jeton) return false;
  const url = Deno.env.get("SUPABASE_URL");
  const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !cle) return false;
  const r = await fetch(`${url}/rest/v1/pods?slug=eq.${POD}&actif=eq.true&select=jeton_hash`, {
    headers: { apikey: cle, Authorization: `Bearer ${cle}` },
  });
  const lignes = (await r.json().catch(() => [])) as { jeton_hash: string | null }[];
  return Array.isArray(lignes) && !!lignes[0]?.jeton_hash && lignes[0].jeton_hash === (await sha256Hex(jeton));
}

Deno.serve(async (req) => {
  const jeton = req.headers.get("x-pod-jeton") ?? "";
  if (!jeton || !(await jetonValide(jeton))) return json({ ok: false, error: "unauthorized" }, 401);
  const falKey = Deno.env.get("FAL_KEY") ?? Deno.env.get("FAL_API_KEY");
  if (!falKey) return json({ ok: false, error: "FAL_KEY absent" }, 500);

  // deno-lint-ignore no-explicit-any
  let b: any = {};
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, error: "corps JSON requis" }, 400);
  }
  const modele = MODELES[String(b.qualite ?? "pro")];
  if (!modele) return json({ ok: false, error: "qualite : pro | standard" }, 400);
  const auth = { Authorization: `Key ${falKey}` };

  if (b.action === "soumettre") {
    const image_url = String(b.image_url ?? "");
    const video_url = String(b.video_url ?? "");
    if (!/^https:\/\//.test(image_url) || !/^https:\/\//.test(video_url)) {
      return json({ ok: false, error: "image_url et video_url https requis" }, 400);
    }
    const corps: Record<string, unknown> = {
      image_url,
      video_url,
      character_orientation: "video",
      keep_original_sound: false,
    };
    if (b.prompt) corps.prompt = String(b.prompt).slice(0, 1500);
    const r = await fetch(`https://queue.fal.run/${modele}`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify(corps),
    });
    const d = await r.json().catch(() => ({}));
    return json({ ok: r.ok, status: r.status, request_id: d.request_id ?? null, detail: r.ok ? undefined : d }, r.ok ? 200 : 502);
  }

  if (b.action === "etat") {
    const id = String(b.request_id ?? "");
    if (!/^[0-9a-f-]{20,}$/i.test(id)) return json({ ok: false, error: "request_id requis" }, 400);
    const base = `https://queue.fal.run/${modele.split("/").slice(0, 2).join("/")}/requests/${id}`;
    const s = await fetch(`${base}/status`, { headers: auth });
    const etat = await s.json().catch(() => ({}));
    if (etat.status !== "COMPLETED") return json({ ok: true, status: etat.status ?? s.status, detail: etat });
    const r = await fetch(base, { headers: auth });
    const res = await r.json().catch(() => ({}));
    return json({ ok: r.ok, status: "COMPLETED", video_url: res?.video?.url ?? null, detail: r.ok ? undefined : res });
  }

  return json({ ok: false, error: "action : soumettre | etat" }, 400);
});
