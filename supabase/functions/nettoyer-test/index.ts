import type { CheminNettoyage } from "../_shared/chemins_nettoyage.ts";
import { cleanImage, type EvenementEtape, fetchImageAsInline, texteRestant } from "../_shared/gemini.ts";
import { reponseNdjson, veutStream } from "../_shared/nettoyage_etapes.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

const BUCKET = "medias";

/**
 * Nettoyage de TEST, non destructif.
 *
 *   { url, stream?: true, chemins?: ["replicate" | "fal" | "effaceur", …], upscale?: true }
 *     → JSON { ok, url, moteur, etapes, duree_ms }
 *     → ou NDJSON si stream=true (une ligne / étape, puis ready + url)
 *
 * `chemins` (24/11) : impose les moteurs, dans l'ordre, pour comparer un moteur à un autre sur la même image.
 * `upscale` : passe aussi par SeedVR, comme l'import.
 *
 *   { verifier: [url, …] }  (24/11, 30 au plus)
 *     → JSON { verdicts: [{ url, reste, extrait }] } : reste-t-il du texte sur ces images déjà nettoyées ?
 *       Ne nettoie rien ; `reste: null` = pas de réponse lisible.
 */
const CHEMINS: CheminNettoyage[] = ["replicate", "fal", "effaceur"];
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  let corps: { url?: string; stream?: boolean; chemins?: unknown; upscale?: boolean; verifier?: unknown } = {};
  try {
    corps = await request.json();
  } catch {
    // corps vide
  }
  if (Array.isArray(corps.verifier)) {
    const urls = corps.verifier.filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u)).slice(0, 30);
    const verdicts: { url: string; reste: boolean | null; extrait: string; erreur?: string }[] = [];
    // Par 5 : assez pour aller vite, pas assez pour saturer la mémoire de la fonction.
    for (let i = 0; i < urls.length; i += 5) {
      verdicts.push(...await Promise.all(urls.slice(i, i + 5).map(async (u) => {
        try {
          const image = await fetchImageAsInline(u);
          const data = image.inline_data?.data ?? "";
          const v = await texteRestant(data, image.inline_data?.mime_type ?? "image/jpeg");
          return { url: u, reste: v ? v.reste : null, extrait: v?.extrait ?? "" };
        } catch (error) {
          return { url: u, reste: null, extrait: "", erreur: messageErreur(error) };
        }
      })));
    }
    return json({ ok: true, verdicts });
  }

  const url = corps.url ?? null;
  if (!url) return json({ error: "url requise" }, 400);
  const chemins = Array.isArray(corps.chemins)
    ? corps.chemins.filter((c): c is CheminNettoyage => CHEMINS.includes(c as CheminNettoyage))
    : [];
  if (Array.isArray(corps.chemins) && chemins.length !== corps.chemins.length) {
    return json({ error: `chemins : ${CHEMINS.join(", ")}` }, 400);
  }
  const debut = Date.now();

  const stream = veutStream(request, corps);

  const executer = async (
    emit?: (e: Record<string, unknown>) => void,
  ) => {
    const onEtape = emit ? (e: EvenementEtape) => emit(e) : undefined;
    const propre = await cleanImage(url, onEtape, {
      ...(chemins.length ? { chemins } : {}),
      ...(corps.upscale ? { upscaleAvantStrip: true } : {}),
    });
    if (!propre) {
      emit?.({ etape: "ready", statut: "echec", detail: "aucune image renvoyée" });
      return { ok: false as const, motif: "aucune image renvoyée", etapes: [] };
    }

    const supabase = serviceClient();
    const ext = propre.mime === "image/jpeg" ? "jpg" : "png";
    const chemin = `test/${crypto.randomUUID()}.${ext}`;
    const bytes = Uint8Array.from(atob(propre.base64), (c) => c.charCodeAt(0));
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(chemin, bytes, { contentType: propre.mime, upsert: true });
    if (error) throw error;

    const publique = supabase.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl;
    emit?.({
      etape: "ready",
      statut: "ok",
      url: publique,
      moteur: propre.moteur,
      ok: true,
    });
    return {
      ok: true as const,
      url: publique,
      moteur: propre.moteur,
      etapes: propre.etapes,
      duree_ms: Date.now() - debut,
    };
  };

  if (stream) {
    return reponseNdjson(async (emit) => {
      await executer(emit);
    });
  }

  try {
    const res = await executer();
    if (!res.ok) return json(res);
    return json(res);
  } catch (error) {
    return json({ ok: false, erreur: messageErreur(error) }, 500);
  }
});
