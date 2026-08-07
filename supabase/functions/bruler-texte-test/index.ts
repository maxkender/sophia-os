/**
 * Test admin — burn-in texte traduit (preview, SANS sauvegarde).
 *
 *   { contenuId, langue, stream?: true }
 *     → NDJSON :
 *         { etape:"slide", position, statut:"encours"|"saute"|"ok"|"echec", detail? }
 *         { etape:"analyse", position, zones:[{x,y,w,h,texte,couleur,ombre}], texteTraduit }
 *         { etape:"payload", position, propreUrl, brutUrl, texteTraduit, zones:[...] }
 *         { etape:"ready", statut:"ok"|"echec", detail?, slides: number }
 *
 * Le burn Canvas se fait côté front (Edge Deno n'a pas Sharp).
 */

import {
  analyserTexteIncrusteBrut,
  translateSlideshow,
  type ZoneTexteIncruste,
} from "../_shared/gemini.ts";
import { reponseNdjson, veutStream } from "../_shared/nettoyage_etapes.ts";
import {
  assertAuthorised,
  chargerPrompt,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

type SlideStruct = {
  position: number;
  media_id: string | null;
  raw_url?: string | null;
  reference_url?: string | null;
  texte_original?: string | null;
};

type SlideLangue = {
  position: number;
  texte_overlay: string | null;
  position_sophia?: boolean;
};

Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  let corps: { contenuId?: string; langue?: string; stream?: boolean } = {};
  try {
    corps = await request.json();
  } catch {
    // vide
  }
  const contenuId = String(corps.contenuId ?? "").trim();
  const langue = String(corps.langue ?? "").trim().toLowerCase();
  if (!contenuId) return json({ error: "contenuId requis" }, 400);
  if (!langue) return json({ error: "langue requise" }, 400);

  const stream = veutStream(request, corps);

  const executer = async (
    emit: (e: Record<string, unknown>) => void,
  ) => {
    const supabase = serviceClient();
    const { data: contenu, error } = await supabase
      .from("contenus")
      .select(
        "id, titre, langue_source, compte_reference_id, structure_slides, statut",
      )
      .eq("id", contenuId)
      .maybeSingle();
    if (error) throw error;
    if (!contenu) throw new Error("Slideshow introuvable");

    const structure = ([...(contenu.structure_slides ?? [])] as SlideStruct[])
      .sort((a, b) => a.position - b.position);
    if (structure.length === 0) throw new Error("Aucune slide");

    const mediaIds = [
      ...new Set(
        structure.map((s) => s.media_id).filter((id): id is string => Boolean(id)),
      ),
    ];
    const propres = new Map<string, string>();
    if (mediaIds.length > 0) {
      const { data: medias } = await supabase
        .from("media_library")
        .select("id, url")
        .in("id", mediaIds);
      for (const m of medias ?? []) {
        if (m.url) propres.set(m.id as string, m.url as string);
      }
    }

    const textesParPos = await chargerTextesTraduits(supabase, {
      contenuId,
      langue,
      langueSource: (contenu.langue_source as string) ?? "fr",
      titre: (contenu.titre as string) ?? "",
      compteReferenceId: contenu.compte_reference_id as string | null,
      structure,
      emit,
    });

    let faits = 0;
    let sautes = 0;
    let echecs = 0;

    for (const slide of structure) {
      const pos = slide.position;
      const texteTraduit = (textesParPos.get(pos) ?? "").trim();
      const brutUrl = slide.raw_url || slide.reference_url || null;
      const propreUrl = slide.media_id ? propres.get(slide.media_id) ?? null : null;

      if (!texteTraduit) {
        sautes += 1;
        emit({
          etape: "slide",
          position: pos,
          statut: "saute",
          detail: "pas de texte — skip",
        });
        continue;
      }
      if (!brutUrl) {
        echecs += 1;
        emit({
          etape: "slide",
          position: pos,
          statut: "echec",
          detail: "pas d'URL brute pour analyser le style",
        });
        continue;
      }
      if (!propreUrl) {
        echecs += 1;
        emit({
          etape: "slide",
          position: pos,
          statut: "echec",
          detail: "pas d'image propre (nettoyage non fait ?)",
        });
        continue;
      }

      emit({
        etape: "slide",
        position: pos,
        statut: "encours",
        detail: "analyse brut (boxes + couleur)…",
      });

      let zones: ZoneTexteIncruste[] = [];
      try {
        zones = await analyserTexteIncrusteBrut(brutUrl);
      } catch (e) {
        echecs += 1;
        emit({
          etape: "slide",
          position: pos,
          statut: "echec",
          detail: `analyse: ${messageErreur(e)}`,
        });
        continue;
      }

      if (zones.length === 0) {
        // Fallback : une zone centrale avec le texte traduit (style blanc + ombre).
        zones = [{
          x: 0.08,
          y: 0.35,
          w: 0.84,
          h: 0.25,
          texte: texteTraduit,
          couleur: "#FFFFFF",
          ombre: true,
        }];
        emit({
          etape: "analyse",
          position: pos,
          detail: "aucune zone détectée — fallback centre",
          zones,
          texteTraduit,
        });
      } else {
        emit({
          etape: "analyse",
          position: pos,
          zones,
          texteTraduit,
          detail: `${zones.length} bloc(s) détecté(s)`,
        });
      }

      const lignes = repartirTexteSurZones(texteTraduit, zones.length);
      const zonesBurn = zones.map((z, i) => ({
        x: z.x,
        y: z.y,
        w: z.w,
        h: z.h,
        couleur: z.couleur,
        ombre: z.ombre,
        texte: lignes[i] ?? "",
        texteSource: z.texte,
      }));

      emit({
        etape: "payload",
        position: pos,
        statut: "ok",
        propreUrl,
        brutUrl,
        texteTraduit,
        zones: zonesBurn,
      });
      emit({
        etape: "slide",
        position: pos,
        statut: "ok",
        detail: `prêt à burn · ${zonesBurn.length} bloc(s)`,
      });
      faits += 1;
    }

    emit({
      etape: "ready",
      statut: echecs > 0 && faits === 0 ? "echec" : "ok",
      detail: `faits=${faits} · sautes=${sautes} · echecs=${echecs} (preview front, aucune sauvegarde)`,
      slides: faits,
      sautes,
      echecs,
    });
  };

  if (stream) {
    return reponseNdjson(async (emit) => {
      try {
        await executer(emit);
      } catch (e) {
        emit({
          etape: "ready",
          statut: "echec",
          detail: messageErreur(e),
        });
      }
    });
  }

  try {
    const events: Record<string, unknown>[] = [];
    await executer((e) => events.push(e));
    const last = events[events.length - 1] ?? { ok: true };
    return json({ ok: true, events, ...last });
  } catch (e) {
    return json({ ok: false, erreur: messageErreur(e) }, 500);
  }
});

/** Répartit le texte traduit sur N zones (split newlines, sinon tout dans la + grande). */
function repartirTexteSurZones(texte: string, n: number): string[] {
  if (n <= 0) return [];
  const lines = texte
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (n === 1) return [texte.trim()];
  if (lines.length === n) return lines;
  if (lines.length > n) {
    // Fusionne le surplus dans la dernière zone.
    const head = lines.slice(0, n - 1);
    const tail = lines.slice(n - 1).join("\n");
    return [...head, tail];
  }
  // Moins de lignes que de zones : remplit puis vide.
  const out = [...lines];
  while (out.length < n) out.push("");
  return out;
}

async function chargerTextesTraduits(
  supabase: ReturnType<typeof serviceClient>,
  args: {
    contenuId: string;
    langue: string;
    langueSource: string;
    titre: string;
    compteReferenceId: string | null;
    structure: SlideStruct[];
    emit: (e: Record<string, unknown>) => void;
  },
): Promise<Map<number, string>> {
  const map = new Map<number, string>();

  // 1) Deck cible déjà cuit ?
  const { data: clCible } = await supabase
    .from("contenu_langues")
    .select("slides")
    .eq("contenu_id", args.contenuId)
    .eq("langue", args.langue)
    .maybeSingle();
  const deckCible = (clCible?.slides ?? []) as SlideLangue[];
  if (deckCible.some((s) => (s.texte_overlay ?? "").trim())) {
    args.emit({
      etape: "deck",
      statut: "ok",
      detail: `deck ${args.langue} déjà présent`,
    });
    for (const s of deckCible) {
      map.set(s.position, (s.texte_overlay ?? "").trim());
    }
    return map;
  }

  // 2) Deck source (OCR) — contenu_langues ou texte_original structure
  const { data: clSource } = await supabase
    .from("contenu_langues")
    .select("slides")
    .eq("contenu_id", args.contenuId)
    .eq("langue", args.langueSource)
    .maybeSingle();
  let deckSource = (clSource?.slides ?? []) as SlideLangue[];
  if (!deckSource.some((s) => (s.texte_overlay ?? "").trim())) {
    deckSource = args.structure.map((s) => ({
      position: s.position,
      texte_overlay: (s.texte_original ?? "").trim() || null,
      position_sophia: false,
    }));
  }
  if (!deckSource.some((s) => (s.texte_overlay ?? "").trim())) {
    throw new Error("Aucun texte source (OCR) — impossible de traduire");
  }

  if (args.langue === args.langueSource) {
    args.emit({
      etape: "deck",
      statut: "ok",
      detail: `langue = source (${args.langue}) — OCR brut, pas de traduction`,
    });
    for (const s of deckSource) {
      map.set(s.position, (s.texte_overlay ?? "").trim());
    }
    return map;
  }

  args.emit({
    etape: "deck",
    statut: "encours",
    detail: `traduction éphémère → ${args.langue} (non persistée)`,
  });
  const dedie = await chargerPrompt(supabase, `traduction_${args.langue}`);
  const base =
    dedie ??
    (args.langue === "fr" ? await chargerPrompt(supabase, "traduction") : undefined);
  const traductions = await translateSlideshow({
    slides: deckSource.map((s) => ({
      position: s.position,
      original: s.texte_overlay ?? "",
    })),
    sourceTitle: args.titre,
    rules: base || undefined,
    langue: args.langue,
    variation: false,
  });
  if (traductions.length === 0) {
    throw new Error("Traduction vide");
  }
  for (const t of traductions) {
    map.set(t.position, (t.translated ?? "").trim());
  }
  args.emit({
    etape: "deck",
    statut: "ok",
    detail: `traduction OK · ${traductions.length} slide(s)`,
  });
  return map;
}
