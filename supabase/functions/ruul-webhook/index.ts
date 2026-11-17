/**
 * ruul-webhook — Ruul nous appelle quand une ligne de paiement change de statut (17/11, Max, phase 4).
 * URL à coller dans Ruul (Settings › API keys › Webhooks) :
 *   https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul-webhook
 * Signature `Ruul-Signature` vérifiée (HMAC-SHA256, 5 minutes au plus) avec RUUL_WEBHOOK_SECRET
 * (ou RUUL_SANDBOX_WEBHOOK_SECRET). Chaque événement est noté une fois (son id), appliqué une fois
 * (ruul_webhook_recevoir) : PAID → le posteur est payé et prévenu ; FAILED / RETURNED / CANCELLED → carte pour Max.
 * Réponse en moins de 10 s ; une erreur de notre côté répond 500 pour que Ruul réessaie.
 */
import { secretWebhookRuul } from "../_shared/ruul_api.ts";
import { json, messageErreur, serviceClient } from "../_shared/supabase.ts";
import { traiter } from "./traiter.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: true });
  try {
    const brut = await request.text();
    const supabase = serviceClient();
    const r = await traiter(brut, request.headers, { prod: secretWebhookRuul("prod"), sandbox: secretWebhookRuul("sandbox") },
      async (id, env, type, corps) => {
        const { data, error } = await supabase.rpc("ruul_webhook_recevoir", { p_id: id, p_env: env, p_type: type, p_corps: corps });
        if (error) throw new Error(error.message);
        return data;
      });
    if (r.status !== 200) console.warn("[ruul-webhook]", r.status, r.corps.error);
    return json(r.corps, r.status);
  } catch (e) {
    console.error("[ruul-webhook]", messageErreur(e));
    return json({ ok: false, error: "internal error" }, 500);
  }
});
