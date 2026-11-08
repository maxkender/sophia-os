/**
 * bots-banc — l'« Agent test bench » des bots (0567).
 *
 *   { action: "lancer", declencheur? }   cron secret (après un changement de
 *                                        consigne, regles_bots) ou admin
 *       Rejoue les bots sur 30 cas réels (exemples_bots tirés des corrections
 *       de Max ; complétés par les exemples de départ s'il en manque) : pour
 *       chaque cas, le modèle reçoit les consignes du bot (regles_bots), les
 *       exemples proches (sans le cas lui-même) et la situation, et choisit une
 *       décision parmi les étiquettes connues. Score = part de décisions égales
 *       à la bonne décision. Le passage est noté dans bots_banc.
 */
import { callWithFallback, TEXT_MODELS, textOf } from "../_shared/gemini.ts";
import { assertRole, corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";
import { casDuBanc, choisirExemples, etiquettes, normaliser, promptCas, type ExempleBot } from "../_shared/bots_banc.ts";

type Supabase = ReturnType<typeof serviceClient>;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const acces = await assertRole(request, ["admin", "head_of_ops"]);
    if (acces instanceof Response) return acces;
    const body = (await request.json().catch(() => ({}))) as { action?: string; declencheur?: string };
    if (body.action !== "lancer") return json({ ok: false, error: "action inconnue" }, 400);
    const declencheur = acces.userId === "cron" ? String(body.declencheur ?? "consigne") : "manuel";
    return json(await lancer(serviceClient(), declencheur));
  } catch (e) {
    return json({ ok: false, error: messageErreur(e) }, 500);
  }
});

async function lancer(supabase: Supabase, declencheur: string) {
  const { data: passage, error: e0 } = await supabase.from("bots_banc").insert({ declencheur }).select("id").single();
  if (e0) return { ok: false, error: e0.message };
  try {
    const { data: tous, error } = await supabase.from("exemples_bots")
      .select("id, cle, bot, categorie, situation, message_posteur, bonne_decision, bonne_reponse, pourquoi, source, cree_at")
      .eq("actif", true).order("cree_at", { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    const exemples = (tous ?? []) as ExempleBot[];
    const { data: regles } = await supabase.from("regles_bots").select("bot, regle, exemple").eq("active", true);
    const cas = casDuBanc(exemples, 30);
    const choix = etiquettes(cas);
    const details: Record<string, unknown>[] = [];
    for (let i = 0; i < cas.length; i += 6) {
      const lot = cas.slice(i, i + 6);
      const resultats = await Promise.all(lot.map(async (c) => {
        const consignes = ((regles ?? []) as { bot: string; regle: string; exemple: string | null }[])
          .filter((r) => r.bot === "tous" || r.bot === c.bot || !c.bot);
        const proches = choisirExemples(exemples, c, 15);
        try {
          const brut = textOf(await callWithFallback(TEXT_MODELS, [{ text: promptCas(c, consignes, proches, choix) }]));
          const m = brut.match(/"decision"\s*:\s*"([^"]+)"/);
          const obtenu = m ? m[1] : brut.trim().split(/\s+/)[0] ?? "";
          return { cle: c.cle, source: c.source, situation: c.situation.slice(0, 160), attendu: c.bonne_decision, obtenu,
                   ok: normaliser(obtenu) === normaliser(c.bonne_decision) };
        } catch (e) {
          return { cle: c.cle, source: c.source, situation: c.situation.slice(0, 160), attendu: c.bonne_decision, obtenu: null, ok: false,
                   erreur: messageErreur(e).slice(0, 200) };
        }
      }));
      details.push(...resultats);
    }
    const justes = details.filter((d) => d.ok).length;
    const score = details.length ? Math.round((justes / details.length) * 1000) / 1000 : null;
    await supabase.from("bots_banc").update({ statut: "fait", n: details.length, justes, score, details, fini_at: new Date().toISOString() })
      .eq("id", passage.id);
    return { ok: true, n: details.length, justes, score };
  } catch (e) {
    await supabase.from("bots_banc").update({ statut: "erreur", erreur: messageErreur(e).slice(0, 500), fini_at: new Date().toISOString() })
      .eq("id", passage.id);
    return { ok: false, error: messageErreur(e) };
  }
}
