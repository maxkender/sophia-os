import { avatarPourCompte } from "../_shared/avatar.ts";
import {
  appliquerIdentiteInstantanee,
  genererIdentite,
  genreDuLabel,
  labelDuCompte,
  type Genre,
} from "../_shared/persona.ts";
import { assertAuthorised, corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Identité d'un compte : @ selon LANGUE + LABEL (thème + genre H/F) + PDP label.
 *
 *   { compteId }              → proposition (aperçu, sans appliquer)
 *   { compteId, appliquer }   → applique l'identité sur le compte
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

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

    const lab = await labelDuCompte(supabase, compteId);
    const labelNom = lab?.labelNom ?? null;
    const labelId = lab?.labelId ?? null;

    // deno-lint-ignore no-explicit-any
    const genreSource: Genre =
      (compte as any).comptes_reference?.genre === "homme" ? "homme" : "femme";
    const genre = genreDuLabel(labelNom) ?? genreSource;

    const identite = await genererIdentite(supabase, compte.langue, genre, labelNom);
    const avatar = await avatarPourCompte(supabase, {
      compteReferenceId: compte.compte_reference_id,
      labelId,
      labelNom,
    });

    return json({
      ok: true,
      pseudos: [identite.handle],
      nom: identite.nom,
      bio: identite.bio,
      avatarUrl: avatar?.url ?? null,
      handle: null,
      applique: false,
      genre,
      label: labelNom,
    });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
