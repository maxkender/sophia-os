import { jetonLectureSlack, synchroniser } from "../_shared/slack_relier.ts";
import { assertRole, corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * slack-relier — relie chaque posteur à son compte Slack sophia-system (0381).
 *
 *   { action: "synchro" }                    admin, Head of Ops
 *       Relit le workspace (users.list) et pose les liens sûrs : email perso,
 *       email de connexion, puis nom complet unique. Rend les compteurs.
 *   { action: "synchro", simuler: true }     pareil, sans rien écrire
 *   { action: "synchro_planifiee" }          cron `slack-relier`, une fois par jour
 *
 * Les arrivées sont reliées tout de suite par `slack-faq` (événement
 * team_join). Secrets : SLACK_BOT_TOKEN2 (lecture des emails), à défaut
 * SLACK_HM_BOT_TOKEN ; CRON_SECRET.
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const acces = await assertRole(request, ["admin", "head_of_ops"]);
    if (acces instanceof Response) return acces;
    // deno-lint-ignore no-explicit-any
    const body: any = await request.json().catch(() => ({}));
    const token = jetonLectureSlack();
    if (!token) return json({ error: "SLACK_BOT_TOKEN2 et SLACK_HM_BOT_TOKEN manquants" }, 500);
    const db = serviceClient();

    if (body.action === "synchro" || body.action === "synchro_planifiee") {
      const planifiee = body.action === "synchro_planifiee";
      const resultat = await synchroniser(db, token, {
        simuler: !planifiee && Boolean(body.simuler),
        source: acces.userId === "cron" ? "cron" : "admin",
      });
      return json({ ok: true, ...resultat });
    }
    return json({ error: "action inconnue" }, 400);
  } catch (erreur) {
    console.error("[slack-relier]", messageErreur(erreur));
    return json({ error: messageErreur(erreur) }, 500);
  }
});
