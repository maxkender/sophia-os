import { ajouterAuSalon } from "../_shared/slack_cohorte.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

// Salon privé de la cohorte Ruul (#ruul-questions). Un renommage dans Slack
// garde l'id ; un autre salon se règle par le secret, sans redéploiement.
const SALON_DEFAUT = "C0CA5SH59N0";
// Au-delà, le poster a sans doute rejoint Slack avec une autre adresse que
// celle du formulaire : le point du matin le signale, on arrête de chercher.
const FENETRE_JOURS = 30;

/**
 * hub-slack-cohorte — appelée toutes les 15 minutes par le cron du même nom
 * (migration 0304, docs/hub-posteurs.md).
 *
 * Le lien d'invitation des emails fait entrer le poster dans le workspace
 * Slack, mais pas dans le salon privé de la cohorte. Pour chaque poster créé
 * depuis le site et pas encore placé, le bot (secret `SLACK_BOT_TOKEN2`) le
 * retrouve par son email perso et l'invite dans le salon, puis pose
 * `hub_posteurs.slack_ajoute_le`. Un poster pas encore dans Slack est
 * simplement repris au passage suivant.
 *
 *   {}                → le passage
 *   { apercu: true }  → qui serait cherché, sans appeler Slack ni rien écrire
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  let apercu = false;
  try {
    apercu = Boolean((await request.json())?.apercu);
  } catch {
    // Corps vide : passage du cron.
  }

  const supabase = serviceClient();
  try {
    const depuis = new Date(Date.now() - FENETRE_JOURS * 86_400_000).toISOString();
    const { data: posteurs, error } = await supabase
      .from("hub_posteurs")
      .select("hub_id, email_perso")
      .eq("statut", "cree")
      .is("slack_ajoute_le", null)
      .not("email_perso", "is", null)
      .gte("created_at", depuis)
      .limit(100);
    if (error) throw error;
    if (apercu) return json({ ok: true, a_chercher: (posteurs ?? []).map((p) => p.email_perso) });
    if (!posteurs?.length) return json({ ok: true, ajoutes: 0, deja: 0, absents: 0, erreurs: [] });

    const token = Deno.env.get("SLACK_BOT_TOKEN2");
    if (!token) return json({ ok: false, error: "SLACK_BOT_TOKEN2 manquant" }, 500);
    const salon = Deno.env.get("SLACK_RUUL_CHANNEL_ID") || SALON_DEFAUT;

    let ajoutes = 0, deja = 0, absents = 0;
    const erreurs: { hub_id: string; erreur: string }[] = [];
    for (const p of posteurs) {
      const issue = await ajouterAuSalon(token, salon, String(p.email_perso));
      if (issue.cas === "absent") {
        absents++;
        continue;
      }
      if (issue.cas === "erreur") {
        erreurs.push({ hub_id: p.hub_id, erreur: issue.erreur });
        continue;
      }
      if (issue.cas === "ajoute") ajoutes++;
      else deja++;
      const { error: majErreur } = await supabase
        .from("hub_posteurs")
        .update({ slack_ajoute_le: new Date().toISOString(), slack_user_id: issue.userId })
        .eq("hub_id", p.hub_id);
      if (majErreur) erreurs.push({ hub_id: p.hub_id, erreur: `maj: ${majErreur.message}` });
    }
    return json({ ok: true, ajoutes, deja, absents, erreurs });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
