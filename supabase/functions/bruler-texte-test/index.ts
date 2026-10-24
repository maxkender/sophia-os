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
import { canoniserLangue } from "../_shared/langues_cibles.ts";
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
  const langue = canoniserLangue(corps.langue);
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

      let fallback = false;
      if (zones.length === 0) {
        // Fallback : zone centrale (blanc, sans contour forcé).
        fallback = true;
        zones = [{
          x: 0.08,
          y: 0.38,
          w: 0.84,
          h: 0.32,
          texte: texteTraduit,
          couleur: "#FFFFFF",
          ombre: false,
          nbLignes: Math.max(3, texteTraduit.split(/\s+/).length > 20 ? 6 : 4),
          role: "corps",
        }];
      }

      // Brut Gemini (avant fusion titre/corps) — pour logs debug UI.
      emit({
        etape: "gemini",
        position: pos,
        detail: fallback
          ? "aucune zone détectée — fallback centre"
          : `Gemini brut · ${zones.length} zone(s)`,
        texteTraduit,
        zones: zones.map((z) => ({
          x: z.x,
          y: z.y,
          w: z.w,
          h: z.h,
          couleur: z.couleur,
          ombre: z.ombre,
          nbLignes: z.nbLignes,
          role: z.role,
          texte: z.texte,
          texteSource: z.texte,
        })),
      });

      const zonesNorm = normaliserZonesTitreCorps(zones);
      const lignes = repartirTexteSurZones(texteTraduit, zonesNorm);
      const zonesBurn = zonesNorm.map((z, i) => ({
        x: z.x,
        y: z.y,
        w: z.w,
        h: z.h,
        couleur: z.couleur,
        ombre: z.ombre,
        nbLignes: z.nbLignes,
        role: z.role,
        texte: lignes[i] ?? "",
        texteSource: z.texte,
      }));

      emit({
        etape: "analyse",
        position: pos,
        detail:
          `après normalisation · ${zonesBurn.length} zone(s)` +
          (zones.length !== zonesBurn.length
            ? ` (fusion ${zones.length}→${zonesBurn.length})`
            : ""),
        texteTraduit,
        zones: zonesBurn.map((z) => ({
          ...z,
          // Pour le log : montre aussi le split traduit
          texte: z.texte,
          texteSource: z.texteSource,
        })),
      });

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

function nbMots(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Fusionne les faux splits Gemini : plusieurs zones « corps » collées → une seule.
 * Garde titre + corps distincts s'ils sont clairement séparés.
 */
function normaliserZonesTitreCorps(
  zones: ZoneTexteIncruste[],
): ZoneTexteIncruste[] {
  if (zones.length <= 1) return zones;

  // Recalcule les rôles depuis le texte SOURCE (plus fiable que le flag seul).
  const withRole = zones.map((z) => {
    const mots = nbMots(z.texte);
    const lignes = Math.max(1, z.nbLignes || z.texte.split(/\n/).filter((l) => l.trim()).length);
    let role: "titre" | "corps" = z.role;
    if (mots <= 7 && lignes <= 2) role = "titre";
    else if (mots >= 10 || lignes >= 3) role = "corps";
    return { ...z, role };
  });

  const titres = withRole.filter((z) => z.role === "titre");
  const corps = withRole.filter((z) => z.role === "corps");

  // Cas typique : 1 titre + N corps → fusionne les corps
  if (titres.length === 1 && corps.length >= 1) {
    const c0 = corps[0]!;
    let x = c0.x;
    let y = c0.y;
    let x2 = c0.x + c0.w;
    let y2 = c0.y + c0.h;
    const textes: string[] = [];
    let nbLignes = 0;
    let ombre = c0.ombre;
    for (const c of corps) {
      x = Math.min(x, c.x);
      y = Math.min(y, c.y);
      x2 = Math.max(x2, c.x + c.w);
      y2 = Math.max(y2, c.y + c.h);
      textes.push(c.texte.trim());
      nbLignes += Math.max(1, c.nbLignes);
      ombre = ombre || c.ombre;
    }
    const mergeCorps: ZoneTexteIncruste = {
      ...c0,
      x,
      y,
      w: Math.min(0.95, x2 - x),
      h: Math.min(0.7, y2 - y),
      texte: textes.join("\n"),
      nbLignes: Math.max(nbLignes, textes.length),
      ombre,
      role: "corps",
    };
    return [titres[0]!, mergeCorps].sort((a, b) => a.y - b.y || a.x - b.x);
  }

  // Que des corps / que des titres mal taggés → une seule zone englobante
  if (titres.length === 0 || corps.length === 0) {
    const z0 = withRole[0]!;
    let x = z0.x;
    let y = z0.y;
    let x2 = z0.x + z0.w;
    let y2 = z0.y + z0.h;
    const textes: string[] = [];
    let nbLignes = 0;
    let ombre = false;
    for (const z of withRole) {
      x = Math.min(x, z.x);
      y = Math.min(y, z.y);
      x2 = Math.max(x2, z.x + z.w);
      y2 = Math.max(y2, z.y + z.h);
      textes.push(z.texte.trim());
      nbLignes += Math.max(1, z.nbLignes);
      ombre = ombre || z.ombre;
    }
    const totalMots = nbMots(textes.join(" "));
    return [{
      ...z0,
      x,
      y,
      w: Math.min(0.95, x2 - x),
      h: Math.min(0.7, y2 - y),
      texte: textes.join("\n"),
      nbLignes: Math.max(nbLignes, 3),
      ombre,
      role: totalMots <= 7 ? "titre" : "corps",
    }];
  }

  return withRole;
}

/**
 * Répartit le texte traduit sur les zones (titre/corps) en respectant
 * les proportions du texte SOURCE, pas un split newline naïf.
 */
function repartirTexteSurZones(
  texte: string,
  zones: ZoneTexteIncruste[],
): string[] {
  const t = texte.trim();
  if (zones.length === 0) return [];
  if (zones.length === 1) return [t];

  const lignes = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  // Titre + corps : cas le plus fréquent
  if (
    zones.length === 2 &&
    zones.some((z) => z.role === "titre") &&
    zones.some((z) => z.role === "corps")
  ) {
    const iTitre = zones.findIndex((z) => z.role === "titre");
    const iCorps = zones.findIndex((z) => z.role === "corps");
    const srcTitre = zones[iTitre]!.texte;
    const motsTitreSrc = Math.max(1, nbMots(srcTitre));

    let titre = "";
    let corps = "";

    if (lignes.length >= 2) {
      // 1ère ligne courte → titre ; sinon proportion mots source
      const l0 = lignes[0]!;
      if (nbMots(l0) <= Math.max(8, motsTitreSrc + 2)) {
        titre = l0;
        corps = lignes.slice(1).join("\n");
      } else {
        const words = t.split(/\s+/).filter(Boolean);
        const n = Math.min(words.length - 1, Math.max(1, motsTitreSrc));
        titre = words.slice(0, n).join(" ");
        corps = words.slice(n).join(" ");
      }
    } else {
      const words = t.split(/\s+/).filter(Boolean);
      const n = Math.min(words.length - 1, Math.max(1, Math.round(motsTitreSrc * 1.1)));
      if (words.length <= 3) {
        // Trop court : tout en titre, corps vide évité → tout en corps si zone corps plus grande
        if ((zones[iCorps]!.h) >= (zones[iTitre]!.h)) {
          titre = "";
          corps = t;
        } else {
          titre = t;
          corps = "";
        }
      } else {
        titre = words.slice(0, n).join(" ");
        corps = words.slice(n).join(" ");
      }
    }

    const out = ["", ""];
    out[iTitre] = titre;
    out[iCorps] = corps || (titre ? "" : t);
    // Si corps vide et titre plein alors qu'on attendait les deux → bascule
    if (!out[iCorps] && out[iTitre] && nbMots(out[iTitre]!) > 10) {
      const words = out[iTitre]!.split(/\s+/);
      const n = Math.min(words.length - 1, Math.max(1, motsTitreSrc));
      out[iTitre] = words.slice(0, n).join(" ");
      out[iCorps] = words.slice(n).join(" ");
    }
    return out;
  }

  // N zones : split proportionnel aux longueurs source
  const poids = zones.map((z) => Math.max(1, nbMots(z.texte)));
  const total = poids.reduce((a, b) => a + b, 0);
  const words = t.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cursor = 0;
  for (let i = 0; i < zones.length; i += 1) {
    if (i === zones.length - 1) {
      out.push(words.slice(cursor).join(" "));
      break;
    }
    const n = Math.max(1, Math.round((poids[i]! / total) * words.length));
    out.push(words.slice(cursor, cursor + n).join(" "));
    cursor += n;
  }
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
  if (traductions.slides.length === 0) {
    throw new Error("Traduction vide");
  }
  for (const t of traductions.slides) {
    map.set(t.position, (t.translated ?? "").trim());
  }
  args.emit({
    etape: "deck",
    statut: "ok",
    detail: `traduction OK · ${traductions.slides.length} slide(s)`,
  });
  return map;
}
