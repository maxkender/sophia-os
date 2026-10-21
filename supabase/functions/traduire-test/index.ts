import { translateSlideshow } from "../_shared/gemini.ts";
import { regleLocalisationScolaire } from "../_shared/localisation_scolaire.ts";
import { assertAuthorised, chargerPrompt, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Test de traduction : traduit un texte donné vers une langue, avec le MÊME
 * prompt que le moteur (traduction_<langue>, ou le prompt « traduction » pour le
 * français, sinon règles neutres), localisation scolaire comprise. Sert à
 * régler les prompts de traduction sans fabriquer un post entier. Ne crée rien.
 *
 *   { texte, langue }  → { ok, traduction }
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  try {
    const body = await request.json();
    const texte = (body?.texte ?? "").toString();
    // Langue telle que les comptes la portent : `pt-BR`, pas `pt-br`.
    const langue = (body?.langue ?? "fr").toString().trim()
      .replace(/^([a-z]+)(?:-([a-z0-9]+))?$/i, (_: string, l: string, r?: string) =>
        r ? `${l.toLowerCase()}-${r.length === 2 ? r.toUpperCase() : r}` : l.toLowerCase());
    if (!texte.trim()) return json({ error: "Texte vide" }, 400);

    const dedie = await chargerPrompt(supabase, `traduction_${langue}`);
    const base = dedie ?? (langue === "fr" ? await chargerPrompt(supabase, "traduction") : undefined);
    const scolaire = await regleLocalisationScolaire(supabase, langue);
    const regles = [base, scolaire].filter(Boolean).join("\n\n");

    const out = await translateSlideshow({
      slides: [{ position: 1, original: texte }],
      sourceTitle: "",
      rules: regles || undefined,
      langue,
    });

    return json({ ok: true, traduction: out.slides[0]?.translated ?? "", hashtags: out.hashtags });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
