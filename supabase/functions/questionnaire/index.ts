/**
 * questionnaire — le formulaire public par lien (15/11, Max), sans connexion.
 *
 *   POST { action: "sauver", slug, jeton, nom, email, tiktok, reponses, captures, section, termine }
 *       Sauvegarde au fil des écrans (une ligne par jeton du navigateur). Relie la réponse à la fiche du
 *       posteur (email, email Ruul, email perso, @ TikTok) ; sinon « non reliée ». Réponse terminée : son
 *       pop-up disparaît.
 *   POST { action: "televerser", slug, jeton, question, type, taille }
 *       Un lien d'envoi signé pour une capture (image, 10 Mo au plus, 3 par question), dans l'espace privé
 *       « questionnaires ». Lisible par l'admin seulement.
 *
 * Rien n'est envoyé à personne. Jamais de données d'un posteur rendues au navigateur.
 */
import { corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";
import { capturesValides, idCaptureValide, nettoyerReponses, texteCourt } from "../_shared/questionnaire.ts";

const JETON = /^[A-Za-z0-9-]{20,64}$/;
const SLUG = /^[a-z0-9-]{3,40}$/;

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
  const jeton = String(corps.jeton ?? "");
  if (!SLUG.test(slug) || !JETON.test(jeton)) return json({ ok: false, error: "invalid link" }, 400);
  try {
    const db = serviceClient();
    const { data: q } = await db.from("questionnaires").select("slug, actif").eq("slug", slug).maybeSingle();
    if (!q?.actif) return json({ ok: false, error: "This questionnaire is closed." }, 404);
    if (corps.action === "sauver") return json(await sauver(db, slug, jeton, corps));
    if (corps.action === "televerser") return json(await televerser(db, slug, jeton, corps));
    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    console.error("[questionnaire]", messageErreur(e));
    return json({ ok: false, error: "Something went wrong, please try again." }, 500);
  }
});

type Db = ReturnType<typeof serviceClient>;

async function sauver(db: Db, slug: string, jeton: string, c: Record<string, unknown>) {
  const nom = texteCourt(c.nom, 120);
  const email = texteCourt(c.email, 200)?.toLowerCase() ?? null;
  const tiktok = texteCourt(c.tiktok, 60)?.replace(/^@+/, "") ?? null;
  const reponses = nettoyerReponses(c.reponses);
  const termine = c.termine === true;
  const section = Math.max(0, Math.min(20, Number(c.section) || 0));
  const { data: ex } = await db.from("questionnaire_reponses").select("id, slug, captures, termine_at").eq("jeton", jeton).maybeSingle();
  if (ex && ex.slug !== slug) return { ok: false, error: "invalid link" };
  // Les captures : seulement les chemins de ce jeton (rendus par « televerser »).
  const captures = capturesValides(c.captures, `${slug}/${jeton}/`);
  const { data: lien } = await db.rpc("questionnaire_relier", { p_email: email, p_tiktok: tiktok });
  const l = (lien ?? {}) as { poster_id?: string | null; par?: string | null };
  const maintenant = new Date().toISOString();
  const ligne = {
    slug, jeton, nom, email, tiktok, reponses, captures, section,
    poster_id: l.poster_id ?? null, relie_par: l.par ?? null, maj_at: maintenant,
    ...(termine && !ex?.termine_at ? { termine_at: maintenant } : {}),
  };
  const { error } = await db.from("questionnaire_reponses").upsert(ligne, { onConflict: "jeton" });
  if (error) throw new Error(error.message);
  if (termine && l.poster_id) {
    await db.from("questionnaire_popups").update({ repondu_at: maintenant }).eq("slug", slug).eq("poster_id", l.poster_id).is("repondu_at", null);
  }
  return { ok: true };
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
