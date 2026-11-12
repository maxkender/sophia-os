import { ajouterAuSalon, inviterDansSalon } from "../_shared/slack_cohorte.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

// Salon privé de la cohorte Ruul (#ruul-questions). Un renommage dans Slack
// garde l'id ; un autre salon se règle par le secret, sans redéploiement.
const SALON_DEFAUT = "C0CA5SH59N0";
// Au-delà, le poster a sans doute rejoint Slack avec une autre adresse que
// celle du formulaire : le point du matin le signale, on arrête de chercher.
const FENETRE_JOURS = 30;
// 0676 : au plus 40 invitations par passage, une toutes les 1,2 s (limite de Slack).
const MAX_INVITATIONS = 40;
const PAUSE_MS = 1200;
// #ruul-posters, #upwork-posters, #posting-help.
const SALONS_A_COMPTER = ["C0CA5SH59N0", "C0CG13NM2HM", "C0CGA81NTDH"];

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
 *   0592 : aussi, chaque posteur Ruul au Slack relié rejoint #ruul-posters et
 *   #posting-help (ruul_slack_salons_a_faire / ruul_slack_salon_noter).
 *   0676 : et chaque posteur Upwork au Slack relié rejoint #upwork-posters
 *   (slack_salons_a_faire ; 40 invitations au plus par passage).
 *
 *   {}                → le passage
 *   { apercu: true }  → qui serait cherché, sans appeler Slack ni rien écrire
 *   { compter: true } → le nombre de membres des salons des posteurs (lecture seule)
 *   { max: 60 }       → au plus 60 invitations dans ce passage
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  let apercu = false;
  let compter = false;
  let max = MAX_INVITATIONS;
  try {
    const corps = await request.json();
    apercu = Boolean(corps?.apercu);
    compter = Boolean(corps?.compter);
    if (Number.isFinite(Number(corps?.max)) && Number(corps.max) > 0) max = Math.min(200, Number(corps.max));
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
    // 0592 / 0676 : chaque posteur actif au Slack relié dans le salon de sa plateforme
    // (Ruul : #ruul-posters et #posting-help ; Upwork : #upwork-posters).
    const { data: salonsAFaire, error: errSalons } = await supabase.rpc("slack_salons_a_faire");
    if (errSalons) throw errSalons;
    const aFaire = (salonsAFaire ?? []) as { poster_id: string; slack_user_id: string; salon: string }[];
    if (apercu) {
      const parSalon: Record<string, number> = {};
      for (const a of aFaire) parSalon[a.salon] = (parSalon[a.salon] ?? 0) + 1;
      return json({ ok: true, a_chercher: (posteurs ?? []).map((p) => p.email_perso), salons: parSalon });
    }

    const token = Deno.env.get("SLACK_BOT_TOKEN2");
    if (!token) return json({ ok: false, error: "SLACK_BOT_TOKEN2 manquant" }, 500);
    if (compter) return json({ ok: true, salons: await compterSalons(supabase, token) });
    const salonsRuul = await ajouterSalonsRuul(supabase, token, aFaire.slice(0, max));
    if (!posteurs?.length) return json({ ok: true, ajoutes: 0, deja: 0, absents: 0, erreurs: [], salons_ruul: salonsRuul });
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
    return json({ ok: true, ajoutes, deja, absents, erreurs, salons_ruul: salonsRuul });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

/**
 * 0592 : un posteur Ruul dont le compte Slack est relié rejoint #ruul-posters
 * et #posting-help (jamais #upwork-posters ni les salons de zone). Chaque essai
 * est noté (ruul_slack_salons) ; 5 essais au plus par salon.
 */
// deno-lint-ignore no-explicit-any
async function ajouterSalonsRuul(supabase: any, token: string, aFaire: { poster_id: string; slack_user_id: string; salon: string }[]) {
  let ajoutes = 0;
  let traites = 0;
  const erreurs: string[] = [];
  for (const [i, a] of aFaire.entries()) {
    // conversations.invite : environ 50 appels par minute (Slack, palier 3).
    if (i > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
    const issue = await inviterDansSalon(token, a.salon, a.slack_user_id);
    // Slack demande d'attendre : on s'arrête là, sans compter d'essai ; le passage suivant reprend.
    if (issue.cas === "erreur" && /ratelimited/.test(issue.erreur)) {
      erreurs.push(`arrêt : ${issue.erreur}`);
      break;
    }
    traites++;
    const ok = issue.cas === "ajoute" || issue.cas === "deja_dedans";
    if (issue.cas === "ajoute") ajoutes++;
    if (issue.cas === "erreur") erreurs.push(`${a.poster_id} ${a.salon} : ${issue.erreur}`);
    const { error } = await supabase.rpc("ruul_slack_salon_noter", {
      p_poster: a.poster_id, p_salon: a.salon, p_ok: ok, p_erreur: issue.cas === "erreur" ? issue.erreur : null,
    });
    if (error) erreurs.push(`${a.poster_id} ${a.salon} : noter : ${error.message}`);
  }
  return { a_faire: aFaire.length, traites, ajoutes, erreurs };
}

/** 0676 : le nombre de membres de chaque salon des posteurs, et combien de posteurs actifs reliés y sont. */
// deno-lint-ignore no-explicit-any
async function compterSalons(supabase: any, token: string) {
  const { data: profils } = await supabase.from("profiles").select("slack_user_id, canal_paie").eq("is_active", true).not("slack_user_id", "is", null);
  const parId = new Map<string, string>((profils ?? []).map((p: { slack_user_id: string; canal_paie: string }) => [p.slack_user_id, p.canal_paie]));
  const res: Record<string, unknown> = {};
  for (const salon of SALONS_A_COMPTER) {
    const membres: string[] = [];
    let curseur = "";
    let erreur: string | null = null;
    for (let page = 0; page < 20; page++) {
      const r = await fetch(`https://slack.com/api/conversations.members?channel=${salon}&limit=1000${curseur ? `&cursor=${encodeURIComponent(curseur)}` : ""}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const j = await r.json().catch(() => ({ ok: false, error: `http_${r.status}` }));
      if (!j.ok) {
        erreur = String(j.error);
        break;
      }
      membres.push(...(j.members ?? []));
      curseur = j.response_metadata?.next_cursor ?? "";
      if (!curseur) break;
    }
    const posteurs = membres.filter((m) => parId.has(m));
    res[salon] = erreur ? { erreur } : {
      membres: membres.length,
      posteurs_actifs: posteurs.length,
      upwork: posteurs.filter((m) => parId.get(m) === "upwork").length,
      ruul: posteurs.filter((m) => parId.get(m) === "ruul").length,
    };
  }
  return res;
}
