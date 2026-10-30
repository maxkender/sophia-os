import {
  circuitServiceApplication,
  CIRCUITS,
  commanderCta,
  lireSourceContenu,
  type SourceContenu,
} from "../_shared/ab_circuits.ts";
import type { SlideDeck } from "../_shared/deck_langue.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * A/B de la traduction et du placement (migration 0620), côté Tests.
 *
 *   { action: "circuits" }
 *       → { circuits: [{ id, version, nom, applications }] }
 *   { action: "duel_preparer", langue, candidat }
 *       → { ok: true, duel_id } ou { ok: false, raison }
 *     Prend UN slideshow déjà publié dans cette langue (30 derniers jours, appli
 *     que le candidat sait placer, contenu pas encore mis en duel pour cette
 *     version), fait écrire son deck par le candidat à partir du deck source, et
 *     range le duel : le deck parti contre celui du candidat, gauche ou droite
 *     tiré au sort. Un appel par duel : le candidat fait 2 à 4 appels modèle.
 *
 * Le vote s'écrit depuis la page (table `ab_traduction_duels`, RLS admin).
 * Rien ne part en production.
 */

const JOURS = 30;
const CANDIDATS_LUS = 300;

interface PassagePublie {
  id: string;
  post_id: string | null;
  contenu_id: string;
  application_id: string;
  slides: SlideDeck[] | null;
  hashtags: string | null;
  vues: number | null;
}

Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;
  const supabase = serviceClient();

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    if (action === "circuits") {
      return json({
        ok: true,
        circuits: Object.values(CIRCUITS).map((c) => ({
          id: c.id,
          version: c.version,
          nom: c.nom,
          applications: c.applications,
        })),
      });
    }

    if (action !== "duel_preparer") return json({ error: `action inconnue : ${action || "aucune"}` }, 400);

    const langue = String(body?.langue ?? "").trim();
    const circuit = CIRCUITS[String(body?.candidat ?? "")];
    if (!langue) return json({ error: "langue manquante" }, 400);
    if (!circuit) return json({ error: `candidat inconnu : ${body?.candidat ?? "aucun"}` }, 400);

    const { data: apps, error: errApps } = await supabase.from("applications").select("id, slug, nom");
    if (errApps) throw errApps;
    const servies = (apps ?? []).filter((a) => circuitServiceApplication(circuit, a.slug as string));
    if (!servies.length) return json({ ok: false, raison: "le candidat ne sait placer aucune appli" });

    const depuis = new Date(Date.now() - JOURS * 86_400_000).toISOString().slice(0, 10);
    const { data: lus, error: errP } = await supabase
      .from("passages")
      .select("id, post_id, contenu_id, application_id, slides, hashtags, vues")
      .eq("langue", langue)
      .eq("statut", "publie")
      .not("est_rappel", "is", true)
      .gte("date_publication_prevue", depuis)
      .in("application_id", servies.map((a) => a.id))
      .order("date_publication_prevue", { ascending: false })
      .limit(CANDIDATS_LUS);
    if (errP) throw errP;

    const { data: deja, error: errD } = await supabase
      .from("ab_traduction_duels")
      .select("contenu_id")
      .eq("langue", langue)
      .eq("candidat", circuit.id)
      .eq("version", circuit.version);
    if (errD) throw errD;
    const exclus = new Set((deja ?? []).map((d) => d.contenu_id as string));

    const vus = new Set<string>();
    const candidats = ((lus ?? []) as PassagePublie[]).filter((p) => {
      if (exclus.has(p.contenu_id) || vus.has(p.contenu_id)) return false;
      if (!(p.slides ?? []).some((s) => s.position_sophia)) return false;
      vus.add(p.contenu_id);
      return true;
    });
    const testes = await postsDeTest(supabase, candidats.map((p) => p.post_id).filter((id): id is string => !!id));
    const ordre = melanger(candidats.filter((p) => !p.post_id || !testes.has(p.post_id)));

    // Le premier slideshow réécrivable (les contenus livrés par un podz n'ont
    // rien à traduire) ; au plus 10 lectures de source par appel.
    let choisi: { passage: PassagePublie; source: SourceContenu } | null = null;
    for (const p of ordre.slice(0, 10)) {
      const source = await lireSourceContenu(supabase, p.contenu_id);
      if ("raison" in source) continue;
      choisi = { passage: p, source };
      break;
    }
    if (!choisi) {
      return json({ ok: false, raison: `plus de slideshow ${langue} publié à mettre en duel pour ${circuit.version}` });
    }

    const { passage, source } = choisi;
    const app = servies.find((a) => a.id === passage.application_id)!;
    const ligne = {
      passage_id: passage.id,
      post_id: passage.post_id,
      contenu_id: passage.contenu_id,
      langue,
      application_id: passage.application_id,
      candidat: circuit.id,
      version: circuit.version,
      slides_source: source.deckSource,
      slides_actuel: passage.slides ?? [],
      hashtags_actuel: passage.hashtags,
      vues_actuel: passage.vues,
      gauche: Math.random() < 0.5 ? "actuel" : "candidat",
    };

    const application = { id: app.id as string, slug: app.slug as string, nom: app.nom as string };
    try {
      // Le CTA est commandé par l'OS, comme il le sera en production.
      const cta = await commanderCta(supabase, {
        contenuId: source.contenuId,
        langue,
        application,
        deckSource: source.deckSource,
      });
      const sortie = await circuit.ecrire({
        supabase,
        contenuId: source.contenuId,
        titre: source.titre,
        langueSource: source.langueSource,
        langue,
        application,
        deckSource: source.deckSource,
        cta,
      });
      const { data: duel, error } = await supabase
        .from("ab_traduction_duels")
        .insert({
          ...ligne,
          slides_candidat: sortie.slides,
          hashtags_candidat: sortie.hashtags,
          voie_cta: sortie.cta?.voie ?? null,
          forme_cta: sortie.cta?.forme ?? null,
          cta_refus: sortie.cta?.refus ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return json({ ok: true, duel_id: duel.id });
    } catch (e) {
      // L'échec est rangé aussi : le taux d'échec du candidat compte.
      const erreur = messageErreur(e);
      await supabase.from("ab_traduction_duels").insert({ ...ligne, statut: "echec", erreur });
      return json({ ok: false, raison: `le candidat a échoué : ${erreur}` });
    }
  } catch (e) {
    return json({ error: messageErreur(e) }, 500);
  }
});

async function postsDeTest(supabase: ReturnType<typeof serviceClient>, ids: string[]): Promise<Set<string>> {
  const testes = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from("posts").select("id").in("id", ids.slice(i, i + 100)).eq("est_test", true);
    if (error) throw error;
    for (const p of data ?? []) testes.add(p.id as string);
  }
  return testes;
}

function melanger<T>(liste: T[]): T[] {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}
