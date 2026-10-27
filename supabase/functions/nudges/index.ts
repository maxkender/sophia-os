import { ecrireAuPosteur } from "../_shared/slack_posteur.ts";
import { assertRole, corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

/** Le titre de la pop-up de l'OS quand le posteur n'est pas joignable sur Slack. En anglais, comme le texte. */
const TITRE_OS = "Message from the team";

/**
 * nudges — « Nudge all » (v3, 0384).
 *
 *   { action: "envoyer", cible, hm?, comptes: [compte_id] }        admin
 *       Recalcule l'aperçu (`nudge_cibles`) et relance les comptes cochés :
 *       DM Slack (bot « Sophia OS »), sinon pop-up dans l'OS (`compte_nudges`).
 *       Chaque envoi est noté dans `nudges`.
 *   { action: "resolus" }                                          admin, cron
 *       Marque résolus les nudges dont le blocage a disparu.
 *   { action: "agent_matin", force? }        cron `agent-inactifs`, 7 h (Paris)
 *       Les nudges résolus, puis les inactifs (`inactifs_marquer`, 0385).
 *
 * Secrets : SLACK_HM_BOT_TOKEN (et SLACK_BOT_TOKEN2 pour retrouver un
 * posteur par email), CRON_SECRET.
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const acces = await assertRole(request, ["admin", "head_of_ops"]);
    if (acces instanceof Response) return acces;
    // deno-lint-ignore no-explicit-any
    const body: any = await request.json().catch(() => ({}));
    const supabase = serviceClient();
    switch (body.action) {
      case "envoyer":
        return json(await envoyer(supabase, body, acces.userId === "cron" ? null : acces.userId));
      case "agent_matin": {
        // L'agent de 7 h (cron `agent-inactifs`, 0385) : nudges résolus, puis inactifs.
        const heure = Number(
          new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" }).format(new Date()),
        );
        if (!body.force && heure !== 7) return json({ ok: true, ignore: "pas 7 h" });
        const { data: resolus, error: errResolus } = await supabase.rpc("nudges_maj_resolus");
        if (errResolus) throw errResolus;
        const { data: inactifs, error: errInactifs } = await supabase.rpc("inactifs_marquer");
        if (errInactifs) throw errInactifs;
        return json({ ok: true, resolus, inactifs });
      }
      case "resolus": {
        const { data, error } = await supabase.rpc("nudges_maj_resolus");
        if (error) throw error;
        return json({ ok: true, resolus: data });
      }
      default:
        return json({ ok: false, error: "action inconnue" }, 400);
    }
  } catch (erreur) {
    console.error("[nudges]", messageErreur(erreur));
    return json({ ok: false, error: messageErreur(erreur) }, 500);
  }
});

interface Cible {
  poster_id: string;
  compte_id: string;
  type: string;
  texte: string;
}

// deno-lint-ignore no-explicit-any
async function envoyer(supabase: Supabase, body: any, par: string | null) {
  const cible = String(body.cible ?? "");
  const comptes = new Set<string>(Array.isArray(body.comptes) ? body.comptes.map(String) : []);
  if (!cible || comptes.size === 0) throw new Error("cible et comptes requis");
  await supabase.rpc("nudges_maj_resolus");
  const { data, error } = await supabase.rpc("nudge_cibles", { p_cible: cible, p_hm: body.hm || null });
  if (error) throw error;
  // Seulement ce que l'aperçu montre encore : un compte débloqué entre-temps n'est pas relancé.
  const lignes = ((data ?? []) as Cible[]).filter((l) => comptes.has(l.compte_id) && l.texte.trim());

  const bilan = { envoyes: 0, slack: 0, os: 0, erreurs: [] as string[] };
  for (const l of lignes) {
    const issue = await ecrireAuPosteur(supabase, l.poster_id, l.texte);
    let canal: "slack" | "os" = "slack";
    if (issue.statut !== "envoye") {
      canal = "os";
      const { error: errOs } = await supabase.from("compte_nudges").insert({
        compte_id: l.compte_id,
        modele_id: `nudge_all:${l.type}`,
        titre: TITRE_OS,
        corps: l.texte,
        envoye_par: par,
      });
      if (errOs) {
        bilan.erreurs.push(`${l.compte_id} : ${errOs.message}`);
        continue;
      }
    }
    const { error: errNudge } = await supabase.from("nudges").insert({
      poster_id: l.poster_id,
      compte_id: l.compte_id,
      type: l.type,
      cible,
      canal,
      texte: l.texte,
      envoye_par: par,
      slack_erreur: issue.statut === "envoye" ? null : issue.statut === "erreur" ? issue.erreur : "introuvable",
    });
    if (errNudge) bilan.erreurs.push(`${l.compte_id} : ${errNudge.message}`);
    bilan.envoyes++;
    if (canal === "slack") bilan.slack++;
    else bilan.os++;
  }
  return { ok: bilan.erreurs.length === 0, ...bilan };
}
