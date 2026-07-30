import { avancerPost, creerPost } from "../_shared/composer.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Fait avancer un post en cours de fabrication d'une étape, puis rend la main.
 * L'assignation ne fait que créer les coquilles ; c'est ce drain, appelé chaque
 * minute par le cron, qui les remplit.
 *
 *   {}                       → le post le plus ancien restant à fabriquer
 *   { postId }               → ce post précis (essai admin)
 *   { compteId, sujetId }    → crée la coquille à la main, hors assignation
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  // deno-lint-ignore no-explicit-any
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    // Corps vide : on prend la file.
  }
  const postId: string | null = body?.postId ?? null;

  try {
    // Création manuelle : l'admin choisit lui-même compte, sujet et date. La
    // coquille rejoint la file, le drain la remplit comme les autres.
    if (!postId && body?.compteId && body?.sujetId) {
      const cree = await creerPost(supabase, {
        compteId: body.compteId,
        sujetId: body.sujetId,
        type: body.type ?? "nouveau",
        date: body.date ?? new Date().toISOString().slice(0, 10),
        estTest: Boolean(body.estTest),
      });
      return json({ ok: true, postId: cree, cree: true });
    }

    let query = supabase
      .from("posts")
      .select("*")
      .in("pipeline_statut", ["running", "pending"]);

    if (postId) query = query.eq("id", postId);
    // PENDING d'abord, running ensuite : un post laissé « running » par une
    // tentative qui a calé (timeout worker) ne doit JAMAIS passer devant les posts
    // en attente, sinon il bloque toute la file (c'est ce qui laissait des posters
    // sans post). Il sera repris quand il n'y a plus rien de neuf à fabriquer.
    else query = query.order("pipeline_statut", { ascending: true }).order("created_at");

    const { data: posts } = await query.limit(1);
    const post = posts?.[0];
    if (!post) return json({ ok: true, idle: true });

    const etape = await avancerPost(supabase, post);

    // Auto-chaîne tant qu'il reste de la file (cron composition souvent en pause).
    const { count } = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .in("pipeline_statut", ["running", "pending"]);
    if ((count ?? 0) > 0) kickComposition(request, 1);

    return json({ ok: true, postId: post.id, etape, more: (count ?? 0) > 0 });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

function kickComposition(request: Request, n: number): void {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) return;
  const secret = Deno.env.get("CRON_SECRET");
  const auth = request.headers.get("Authorization");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers["x-cron-secret"] = secret;
  else if (auth) headers.Authorization = auth;

  const target = `${url}/functions/v1/composition`;
  const edge = (globalThis as {
    EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void };
  }).EdgeRuntime;

  for (let i = 0; i < Math.max(1, n); i += 1) {
    const p = fetch(target, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    }).catch(() => null);
    if (edge?.waitUntil) edge.waitUntil(p);
  }
}
