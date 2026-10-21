import { signatureSlackValide } from "../_shared/comment_masters.ts";
import {
  ADMINS_SLACK,
  etatDepuisDecision,
  type EvenementSlack,
  type LigneSuivie,
  MESSAGE_ATTENTE_SLACK,
  type ReglagesFaq,
  type ReponseFaq,
  suiteDeFil,
  texteReponseSlack,
  type TriSlack,
  trierEvenementSlack,
} from "../_shared/faq.ts";
import {
  chargerBase,
  chargerManagersSlack,
  chargerReglagesFaq,
  demanderAuCerveau,
  jetonSlackFaq,
  nomSlack,
  posterSlack,
  secretSignatureFaq,
} from "../_shared/faq_moteur.ts";
import { json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * slack-faq — l'entrée Slack de la FAQ automatique (docs/faq-automatique.md).
 *
 * Appelée par Slack (Event Subscriptions, événement `message.channels`) à
 * chaque message des canaux publics où l'appli est. Pas de x-cron-secret ni de
 * JWT : c'est la signature Slack qui authentifie, comme `slack-interactions`.
 *
 * Slack veut son 200 en moins de 3 s, et la réponse du cerveau en prend
 * plusieurs : on accuse réception tout de suite et le travail continue en
 * arrière-plan (`EdgeRuntime.waitUntil`). Un événement renvoyé par Slack
 * (retry) ne donne pas deux réponses : un message = une ligne (index unique).
 *
 * Mode test (`reglages.faq_automatique.mode_slack`) : le cerveau tranche et
 * tout s'écrit dans `chatbot_questions`, mais rien ne part sur Slack.
 */
Deno.serve(async (request) => {
  const signature = request.headers.get("x-slack-signature");
  if (!signature) return json({ error: "unauthorized" }, 401);

  const secret = secretSignatureFaq();
  if (!secret) return json({ error: "SLACK_SIGNING_SECRET manquant" }, 500);

  const corps = await request.text();
  const valide = await signatureSlackValide(
    secret,
    request.headers.get("x-slack-request-timestamp"),
    corps,
    signature,
  );
  if (!valide) return json({ error: "signature Slack invalide" }, 401);

  let payload: {
    type?: string;
    challenge?: string;
    event?: EvenementSlack;
    authorizations?: Array<{ user_id?: string }>;
  };
  try {
    payload = JSON.parse(corps);
  } catch {
    return new Response("", { status: 200 });
  }

  // Vérification de l'URL, une fois, quand on la colle dans l'appli Slack.
  if (payload.type === "url_verification") {
    return new Response(payload.challenge ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  if (payload.type !== "event_callback" || !payload.event) return new Response("", { status: 200 });

  const travail = traiter(payload.event, payload.authorizations?.[0]?.user_id ?? null).catch((erreur) =>
    console.error("[slack-faq]", messageErreur(erreur))
  );
  const edge = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edge) edge.waitUntil(travail);
  else await travail;
  return new Response("", { status: 200 });
});

type Db = ReturnType<typeof serviceClient>;

async function traiter(ev: EvenementSlack, botUserId: string | null): Promise<void> {
  const db = serviceClient();
  const reglages = await chargerReglagesFaq(db);
  if (reglages.mode_slack === "eteint") return;

  const admins = new Set(Object.keys(ADMINS_SLACK));
  const tri = trierEvenementSlack(ev, { canaux: reglages.canaux_slack, admins, botUserId });
  if (tri.cas === "ignore") return;

  const managers = await chargerManagersSlack(db);
  const token = jetonSlackFaq();
  if (tri.cas === "suite") {
    await suivreFil(db, tri, new Set([...admins, ...managers.keys()]), token);
    return;
  }
  await repondre(db, tri, reglages, managers, token);
}

async function repondre(
  db: Db,
  q: Extract<TriSlack, { cas: "question" }>,
  reglages: ReglagesFaq,
  managers: Map<string, string>,
  token: string | null,
): Promise<void> {
  const role = managers.has(q.auteur) ? "hiring_manager" : "poster";
  const userId = managers.get(q.auteur) ?? await profilDuPoster(db, q.auteur);
  const test = reglages.mode_slack !== "actif";

  const { data: ligne, error } = await db
    .from("chatbot_questions")
    .insert({
      source: "slack",
      role,
      user_id: userId,
      question: q.texte,
      slack_canal: q.canal,
      slack_ts: q.ts,
      slack_user_id: q.auteur,
      test,
    })
    .select("id")
    .single();
  if (error) {
    // Même message déjà reçu (retry de Slack) : déjà traité ou en cours.
    if ((error as { code?: string }).code === "23505") return;
    throw new Error(`chatbot_questions : ${messageErreur(error)}`);
  }

  const erreurs: string[] = [];
  const [nom, charge] = await Promise.all([
    token ? nomSlack(token, q.auteur) : Promise.resolve(null),
    chargerBase(db, role),
  ]);
  if (!charge.pages) erreurs.push("guide Notion pas encore copié (guides-notion)");

  let r: ReponseFaq | null = null;
  try {
    r = await demanderAuCerveau({ canal: "slack", role, question: q.texte, base: charge.base });
  } catch (erreur) {
    erreurs.push(`cerveau : ${messageErreur(erreur)}`);
  }

  const patch: Record<string, unknown> = {
    etat: r ? etatDepuisDecision(r.decision) : "a_traiter",
    slack_nom: nom,
    reponse_faq: r?.reponse || null,
    section_guide: r?.section ?? null,
  };

  // Rien ne part sans guide : sans lui, le cerveau dirait « je ne sais pas » à
  // tout le monde et chaque question recevrait le message d'attente.
  if (!test && charge.pages) {
    const texte = r?.decision === "repondu"
      ? texteReponseSlack(r)
      : (!r || r.decision === "inconnu") && reglages.message_attente
      ? MESSAGE_ATTENTE_SLACK
      : null;
    if (texte && !token) erreurs.push("jeton Slack absent (SLACK_BOT_TOKEN)");
    if (texte && token) {
      const envoi = await posterSlack(token, q.canal, texte, q.ts);
      if (envoi.ok) {
        patch.reponse = texte;
        patch.envoye_at = new Date().toISOString();
        patch.slack_reponse_ts = envoi.ts ?? null;
      } else {
        erreurs.push(`Slack : ${envoi.error}`);
      }
    }
  }
  if (erreurs.length) patch.erreur = erreurs.join(" · ");

  const { error: majErreur } = await db.from("chatbot_questions").update(patch).eq("id", ligne.id);
  if (majErreur) throw new Error(`chatbot_questions (décision) : ${messageErreur(majErreur)}`);
}

async function suivreFil(
  db: Db,
  s: Extract<TriSlack, { cas: "suite" }>,
  equipe: Set<string>,
  token: string | null,
): Promise<void> {
  const { data: ligne, error } = await db
    .from("chatbot_questions")
    .select("id, etat, slack_user_id, envoye_at, reponse_humaine")
    .eq("slack_canal", s.canal)
    .eq("slack_ts", s.parentTs)
    .maybeSingle();
  if (error) throw new Error(`chatbot_questions (fil) : ${messageErreur(error)}`);
  if (!ligne) return;

  const suite = suiteDeFil(ligne as LigneSuivie, s.auteur, s.texte, equipe);
  if (!suite) return;
  const patch: Record<string, unknown> = { ...suite };
  if (patch.reponse_humaine_par) {
    patch.reponse_humaine_par = ADMINS_SLACK[s.auteur] ?? (token ? await nomSlack(token, s.auteur) : null) ?? s.auteur;
  }
  if (patch.etat === "traite_slack") patch.traite_at = new Date().toISOString();

  const { error: majErreur } = await db.from("chatbot_questions").update(patch).eq("id", ligne.id);
  if (majErreur) throw new Error(`chatbot_questions (fil) : ${messageErreur(majErreur)}`);
}

/** Les posters arrivés par le site sont les seuls dont l'OS connaît l'ID Slack. */
async function profilDuPoster(db: Db, slackUserId: string): Promise<string | null> {
  const { data } = await db
    .from("hub_posteurs")
    .select("profile_id")
    .eq("slack_user_id", slackUserId)
    .not("profile_id", "is", null)
    .limit(1)
    .maybeSingle();
  return (data?.profile_id as string | undefined) ?? null;
}
