/**
 * questionnaire — le formulaire public par lien (15/11, Max), sans connexion.
 *
 *   POST { action: "textes", slug, langue }
 *       20/11 : les textes du questionnaire et de son pop-up dans la langue donnée (traduits une fois depuis
 *       l'anglais, puis gardés : traductions_emails). Anglais si la langue est inconnue ou si la traduction échoue.
 *   POST { action: "sauver", slug, jeton, nom, email, tiktok, langue, reponses, captures, section, termine }
 *       Sauvegarde au fil des écrans (une ligne par jeton du navigateur). Relie la réponse à la fiche du
 *       posteur (email, email Ruul, email perso, @ TikTok) ; sinon « non reliée ». Réponse terminée : son
 *       pop-up disparaît. 20/11 (Max) : terminée = toutes les questions obligatoires et au moins une capture ;
 *       le posteur ciblé reçoit alors son bonus (une fois), ajouté à sa paie du lundi suivant (à valider par
 *       Max avec le reste de la paie). Les réponses écrites sont traduites en français pour la page admin.
 *   POST { action: "televerser", slug, jeton, question, type, taille }
 *       Un lien d'envoi signé pour une capture (image, 10 Mo au plus, 3 par question), dans l'espace privé
 *       « questionnaires ». Lisible par l'admin seulement.
 *
 * Rien n'est envoyé à personne. Jamais de données d'un posteur rendues au navigateur.
 */
import { corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";
import { capturesValides, idCaptureValide, nettoyerReponses, texteCourt } from "../_shared/questionnaire.ts";
import { complet, dictionnaireAnglais, idsTextesLibres } from "../_shared/questionnaire_questions.ts";
import { langueTraduite, normaliserLangue, traduireChamps } from "../_shared/traduction_email.ts";
import { generateTextFast } from "../_shared/gemini.ts";

const JETON = /^[A-Za-z0-9-]{20,64}$/;
const SLUG = /^[a-z0-9-]{3,40}$/;
/** Les textes sont traduits par paquets (une réponse courte et vérifiable à chaque fois). */
const PAQUET = 40;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: "POST attendu" }, 405);
  const brut = await request.text();
  if (brut.length > 60_000) return json({ ok: false, error: "too large" }, 413);
  let corps: Record<string, unknown>;
  try {
    corps = JSON.parse(brut) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }
  const slug = String(corps.slug ?? "");
  if (!SLUG.test(slug)) return json({ ok: false, error: "invalid link" }, 400);
  try {
    const db = serviceClient();
    const { data: q } = await db.from("questionnaires").select("slug, actif").eq("slug", slug).maybeSingle();
    if (!q?.actif) return json({ ok: false, error: "This questionnaire is closed." }, 404);
    if (corps.action === "textes") return json(await textes(db, corps.langue));
    const jeton = String(corps.jeton ?? "");
    if (!JETON.test(jeton)) return json({ ok: false, error: "invalid link" }, 400);
    if (corps.action === "sauver") return json(await sauver(db, slug, jeton, corps));
    if (corps.action === "televerser") return json(await televerser(db, slug, jeton, corps));
    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    console.error("[questionnaire]", messageErreur(e));
    return json({ ok: false, error: "Something went wrong, please try again." }, 500);
  }
});

type Db = ReturnType<typeof serviceClient>;

/** 20/11 : les textes dans la langue du posteur (l'anglais pour une langue inconnue ou un paquet raté). */
async function textes(db: Db, langueBrute: unknown) {
  const langue = normaliserLangue(typeof langueBrute === "string" ? langueBrute.slice(0, 10) : "en");
  const en = dictionnaireAnglais();
  if (!langueTraduite(langue)) return { ok: true, langue: "en", textes: en };
  const cles = Object.keys(en);
  const sortie: Record<string, string> = { ...en };
  let traduits = 0;
  const paquets: string[][] = [];
  for (let i = 0; i < cles.length; i += PAQUET) paquets.push(cles.slice(i, i + PAQUET));
  const resultats = await Promise.all(paquets.map((p) =>
    traduireChamps(db, langue, Object.fromEntries(p.map((k) => [k, en[k]!])))
  ));
  for (const r of resultats) {
    if (!r.traduit) continue;
    traduits++;
    for (const [k, v] of Object.entries(r.champs)) if (typeof v === "string" && v.trim()) sortie[k] = v;
  }
  return { ok: true, langue: traduits ? langue : "en", textes: sortie, complet: traduits === paquets.length };
}

/** 20/11 : les réponses écrites librement, traduites en français (pour la page admin) ; null si rien à traduire. */
async function enFrancais(reponses: Record<string, string | string[]>, langue: string): Promise<Record<string, string> | null> {
  if (normaliserLangue(langue) === "fr") return null;
  const libres = Object.fromEntries(idsTextesLibres().filter((id) => typeof reponses[id] === "string").map((id) => [id, reponses[id] as string]));
  if (!Object.keys(libres).length) return null;
  try {
    const r = await generateTextFast(
      "Translate the values of this JSON object into French. Keep the same keys. If a value is already in French, copy it. " +
        "Reply with the JSON object only, no code fence.\n\n" + JSON.stringify(libres),
    );
    const t = r.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const k of Object.keys(libres)) if (typeof o[k] === "string") out[k] = String(o[k]).slice(0, 4000);
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

async function sauver(db: Db, slug: string, jeton: string, c: Record<string, unknown>) {
  const nom = texteCourt(c.nom, 120);
  const email = texteCourt(c.email, 200)?.toLowerCase() ?? null;
  const tiktok = texteCourt(c.tiktok, 60)?.replace(/^@+/, "") ?? null;
  const langue = normaliserLangue(texteCourt(c.langue, 10) ?? "en");
  const reponses = nettoyerReponses(c.reponses);
  const section = Math.max(0, Math.min(20, Number(c.section) || 0));
  const { data: ex } = await db.from("questionnaire_reponses").select("id, slug, captures, termine_at").eq("jeton", jeton).maybeSingle();
  if (ex && ex.slug !== slug) return { ok: false, error: "invalid link" };
  // Les captures : seulement les chemins de ce jeton (rendus par « televerser »).
  const captures = capturesValides(c.captures, `${slug}/${jeton}/`);
  // 20/11 (Max) : « terminé » seulement si tout ce qui est obligatoire est là (et au moins une capture).
  const termine = c.termine === true && complet(reponses, captures);
  if (c.termine === true && !termine) return { ok: false, error: "Please answer all the questions and add at least one screenshot." };
  const { data: lien } = await db.rpc("questionnaire_relier", { p_email: email, p_tiktok: tiktok });
  const l = (lien ?? {}) as { poster_id?: string | null; par?: string | null };
  const maintenant = new Date().toISOString();
  const premiereFois = termine && !ex?.termine_at;
  const ligne = {
    slug, jeton, nom, email, tiktok, langue, reponses, captures, section,
    poster_id: l.poster_id ?? null, relie_par: l.par ?? null, maj_at: maintenant,
    ...(premiereFois ? { termine_at: maintenant } : {}),
  };
  const { data: sauve, error } = await db.from("questionnaire_reponses").upsert(ligne, { onConflict: "jeton" }).select("id").single();
  if (error) throw new Error(error.message);
  if (!termine) return { ok: true };
  if (l.poster_id) {
    await db.from("questionnaire_popups").update({ repondu_at: maintenant }).eq("slug", slug).eq("poster_id", l.poster_id).is("repondu_at", null);
  }
  // Le bonus (posteur ciblé, une seule fois) : la date du lundi où il est ajouté à sa paie.
  const { data: bonus } = await db.rpc("questionnaire_bonus_creer", { p_reponse: sauve.id });
  const b = (bonus ?? {}) as { ok?: boolean; lundi?: string | null };
  if (premiereFois) {
    const fr = await enFrancais(reponses, langue);
    if (fr) await db.from("questionnaire_reponses").update({ reponses_fr: fr }).eq("id", sauve.id);
  }
  return { ok: true, bonus_lundi: b.ok ? b.lundi ?? null : null };
}

async function televerser(db: Db, slug: string, jeton: string, c: Record<string, unknown>) {
  const question = String(c.question ?? "");
  const type = String(c.type ?? "").toLowerCase();
  const taille = Number(c.taille) || 0;
  if (!idCaptureValide(question)) return { ok: false, error: "invalid question" };
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" }[type];
  if (!ext) return { ok: false, error: "Please send an image (PNG, JPG, WEBP or HEIC)." };
  if (taille <= 0 || taille > 10_000_000) return { ok: false, error: "The image must be smaller than 10 MB." };
  const { data: ex } = await db.from("questionnaire_reponses").select("captures").eq("jeton", jeton).eq("slug", slug).maybeSingle();
  const deja = ((ex?.captures ?? {}) as Record<string, string[]>)[question] ?? [];
  if (deja.length >= 3) return { ok: false, error: "3 screenshots maximum for this question." };
  const chemin = `${slug}/${jeton}/${question}-${crypto.randomUUID()}.${ext}`;
  const { data, error } = await db.storage.from("questionnaires").createSignedUploadUrl(chemin);
  if (error || !data) throw new Error(error?.message ?? "lien d'envoi non créé");
  return { ok: true, chemin, token: data.token };
}
