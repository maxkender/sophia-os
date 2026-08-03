import { avatarPourCompte } from "../_shared/avatar.ts";
import {
  appliquerIdentiteInstantanee,
  genererIdentite,
  genreDuLabel,
  type Genre,
} from "../_shared/persona.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Identité d'un compte de publication : @ selon LANGUE + LABEL (thème) + genre,
 * nom, bio, avatar filtré par label. 100 % déterministe et instantané.
 *
 *   { compteId }              → proposition (aperçu, sans appliquer)
 *   { compteId, appliquer }   → applique l'identité sur le compte
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  let compteId: string | null = null;
  let appliquer = false;
  try {
    const body = await request.json();
    compteId = body?.compteId ?? null;
    appliquer = Boolean(body?.appliquer);
  } catch {
    return json({ error: "corps JSON attendu" }, 400);
  }

  if (!compteId) return json({ error: "compteId requis" }, 400);

  try {
    if (appliquer) {
      const { handle } = await appliquerIdentiteInstantanee(supabase, compteId);
      const { data: c } = await supabase
        .from("comptes")
        .select("handle_tiktok, persona_nom, persona_bio, avatar_url")
        .eq("id", compteId)
        .single();
      return json({
        ok: true,
        pseudos: c?.handle_tiktok ? [c.handle_tiktok] : [],
        nom: c?.persona_nom ?? null,
        bio: c?.persona_bio ?? "",
        avatarUrl: c?.avatar_url ?? null,
        handle: handle ?? c?.handle_tiktok ?? null,
        applique: true,
      });
    }

    const { data: compte, error } = await supabase
      .from("comptes")
      .select("langue, compte_reference_id, comptes_reference(genre)")
      .eq("id", compteId)
      .single();
    if (error || !compte) return json({ error: "Compte introuvable" }, 404);

    const { data: cl } = await supabase
      .from("compte_labels")
      .select("label_id, labels(nom, slug)")
      .eq("compte_id", compteId)
      .limit(1)
      .maybeSingle();
    // deno-lint-ignore no-explicit-any
    const labelRow = cl as any;
    const labelNom: string | null = labelRow?.labels?.nom ?? labelRow?.labels?.slug ?? null;
    const labelId: string | null = (labelRow?.label_id as string | undefined) ?? null;

    // deno-lint-ignore no-explicit-any
    const genreSource: Genre =
      (compte as any).comptes_reference?.genre === "homme" ? "homme" : "femme";
    const genre = genreDuLabel(labelNom) ?? genreSource;

    const identite = await genererIdentite(supabase, compte.langue, genre, labelNom);
    const avatar = await avatarPourCompte(supabase, {
      compteReferenceId: compte.compte_reference_id,
      labelId,
    });

    return json({
      ok: true,
      pseudos: [identite.handle],
      nom: identite.nom,
      bio: identite.bio,
      avatarUrl: avatar?.url ?? null,
      handle: null,
      applique: false,
    });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
