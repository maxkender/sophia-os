import { blocsSlack, signatureSlackValide } from "../_shared/comment_masters.ts";
import { json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Point d'entrée « Interactivity » de l'appli Slack des comment masters : le
 * bouton « ✅ Done » sous chaque post à commenter.
 *
 * Appelée par Slack, pas par un cron ni par l'OS : pas de x-cron-secret ni de
 * JWT, c'est la signature Slack (SLACK_SIGNING_SECRET) qui authentifie. Slack
 * exige une réponse en moins de 3 s ; le message est mis à jour via
 * `response_url`, sans jeton bot.
 */
Deno.serve(async (request) => {
  const secret = Deno.env.get("SLACK_SIGNING_SECRET");
  if (!secret) return json({ error: "SLACK_SIGNING_SECRET manquant" }, 500);

  const corps = await request.text();
  const valide = await signatureSlackValide(
    secret,
    request.headers.get("x-slack-request-timestamp"),
    corps,
    request.headers.get("x-slack-signature"),
  );
  if (!valide) return json({ error: "signature Slack invalide" }, 401);

  try {
    const payload = JSON.parse(new URLSearchParams(corps).get("payload") ?? "{}");
    const action = payload?.actions?.[0];
    if (payload?.type !== "block_actions" || action?.action_id !== "comment_fait") {
      return new Response("", { status: 200 });
    }

    const supabase = serviceClient();
    const utilisateur = payload.user ?? {};
    // `is fait_at null` : un double clic ne réécrit pas l'heure du premier.
    await supabase
      .from("comment_master_demandes")
      .update({ fait_at: new Date().toISOString(), fait_par: utilisateur.username ?? utilisateur.name ?? utilisateur.id })
      .eq("id", action.value)
      .is("fait_at", null);

    const { data: d, error } = await supabase
      .from("comment_master_demandes")
      .select("id, langue, application, publie_url, vues_declenchement, age_minutes, commentaire, traduction_en, fait_at, comptes(handle_tiktok)")
      .eq("id", action.value)
      .single();
    if (error) throw error;

    const heure = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(d.fait_at!));
    const demande = {
      ...d,
      application: d.application ?? "",
      age_minutes: d.age_minutes ?? 0,
      handle: (d.comptes as unknown as { handle_tiktok: string | null } | null)?.handle_tiktok ?? null,
    };
    await fetch(payload.response_url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        replace_original: true,
        text: `Done: ${d.commentaire}`,
        blocks: blocsSlack(demande, { par: utilisateur.id, heure }),
      }),
    });
    return new Response("", { status: 200 });
  } catch (error) {
    // 200 quand même : sinon Slack affiche une erreur au comment master, qui
    // n'y peut rien. L'échec reste visible dans les logs de la fonction.
    console.error("slack-interactions", messageErreur(error));
    return new Response("", { status: 200 });
  }
});
