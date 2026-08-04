import { retirerContentCredentialsBytes } from "../_shared/c2pa.ts";
import { appliquerIdentiteInstantanee } from "../_shared/persona.ts";
import {
  assertRole,
  corsHeaders,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;
const DOMAINE = "sophia.com";
const BUCKET = "medias";

interface FileLabelItem {
  label_id: string;
  ugc: boolean;
}

interface PersonaUgcLibre {
  id: string;
  nom: string;
  image_face_url: string;
  image_profile_url: string | null;
}

/**
 * Gestion des posters / recruteurs.
 *
 *   { action: "create", prenom, nom, password, langue?, langues?, role?, posts_par_jour? }
 *   { action: "ensure_compte", userId, langue, posts_par_jour? } — file admin → compte
 *   { action: "start_warmup", compteId }  — créateur (son compte) ou admin
 *   { action: "skip_warmup", compteId }   — admin : compte actif immédiat
 *   { action: "delete", userId }
 *
 * Création poster : compte créé immédiatement (warmup non démarré).
 * File FIFO `file_labels_comptes` : { items: [{ label_id, ugc }] }.
 * UGC slideshow → persona libre, nom + avatar (profil 1:1 si dispo, sinon face)
 * sans métadonnées ; label forcé parmi ceux qui ont des slideshows ugc_compatible.
 * File vide → label classique le moins utilisé pour la LANGUE.
 * HM `hm_ugc_ai_video` → comptes ugc_ai_video, persona unique (pool partagé),
 * labels = labels HM (`hm_ugc_video_labels`) + marque système `ugc-ai-video`.
 */
Deno.serve(async (request) => {
  // Préflight CORS : doit répondre 2xx AVANT tout parse JSON, sinon le
  // navigateur bloque avec « Failed to send a request to the Edge Function ».
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  try {
    return await gererRequete(request);
  } catch (error) {
    return json({ error: messageErreur(error) }, 500);
  }
});

async function gererRequete(request: Request): Promise<Response> {
  const supabase = serviceClient();

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "corps JSON attendu" }, 400);
  }

  // Start warmup : le créateur lui-même (ou admin). Plus le HM.
  if (body.action === "start_warmup") {
    const acces = await assertRole(request, ["admin", "poster"]);
    if (acces instanceof Response) return acces;

    const compteId = String(body.compteId ?? "").trim();
    if (!compteId) return json({ error: "compteId requis" }, 400);

    const { data: compte, error } = await supabase
      .from("comptes")
      .select("id, poster_id, warmup_started_at, warmup_ends_at")
      .eq("id", compteId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 400);
    if (!compte) return json({ error: "compte introuvable" }, 404);

    if (acces.role === "poster" && acces.userId !== "cron") {
      if (compte.poster_id !== acces.userId) {
        return json({ error: "forbidden" }, 403);
      }
    }

    if (compte.warmup_started_at && compte.warmup_ends_at) {
      return json({
        ok: true,
        deja: true,
        warmup_started_at: compte.warmup_started_at,
        warmup_ends_at: compte.warmup_ends_at,
      });
    }

    const heures = await lireWarmupHeures(supabase);
    const start = new Date();
    const end = new Date(start.getTime() + heures * 3600_000);
    const { error: updErr } = await supabase
      .from("comptes")
      .update({
        warmup_started_at: start.toISOString(),
        warmup_ends_at: end.toISOString(),
      })
      .eq("id", compteId);
    if (updErr) return json({ error: updErr.message }, 400);

    return json({
      ok: true,
      warmup_started_at: start.toISOString(),
      warmup_ends_at: end.toISOString(),
      heures,
    });
  }

  // Admin : coupe le timer warmup → compte immédiatement actif (en process).
  if (body.action === "skip_warmup") {
    const acces = await assertRole(request, ["admin"]);
    if (acces instanceof Response) return acces;

    const compteId = String(body.compteId ?? "").trim();
    if (!compteId) return json({ error: "compteId requis" }, 400);

    const { data: compte, error } = await supabase
      .from("comptes")
      .select("id, warmup_started_at, warmup_ends_at")
      .eq("id", compteId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 400);
    if (!compte) return json({ error: "compte introuvable" }, 404);

    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("comptes")
      .update({
        warmup_started_at: compte.warmup_started_at ?? now,
        warmup_ends_at: now,
      })
      .eq("id", compteId);
    if (updErr) return json({ error: updErr.message }, 400);

    return json({
      ok: true,
      warmup_started_at: compte.warmup_started_at ?? now,
      warmup_ends_at: now,
    });
  }

  const acces = await assertRole(request, ["admin", "hiring_manager"]);
  if (acces instanceof Response) return acces;

  if (body.action === "create") {
    const prenom = String(body.prenom ?? "").trim();
    const nom = String(body.nom ?? "").trim();
    const password = String(body.password ?? "");
    const langue = String(body.langue ?? "").trim().toLowerCase();
    const languesRecues = Array.isArray(body.langues)
      ? (body.langues as unknown[])
        .map((l) => String(l ?? "").trim().toLowerCase())
        .filter(Boolean)
      : [];
    const roleVoulu =
      body.role === "hiring_manager" && acces.role === "admin" ? "hiring_manager" : "poster";

    if (!prenom || password.length < 8) {
      return json({ error: "Prénom requis et mot de passe d'au moins 8 caractères" }, 400);
    }

    if (roleVoulu === "poster" && acces.role === "hiring_manager" && acces.userId !== "cron") {
      const { data: hm } = await supabase
        .from("profiles")
        .select("langues")
        .eq("id", acces.userId)
        .maybeSingle();
      const gerees = ((hm?.langues as string[] | null) ?? [])
        .map((l) => l.toLowerCase())
        .filter(Boolean);
      if (gerees.length > 0 && langue && !gerees.includes(langue)) {
        return json(
          { error: `Langue « ${langue} » hors des langues gérées (${gerees.join(", ")})` },
          400,
        );
      }
    }

    // HM UGC AI VIDEO : ses créateurs naissent sans file labels / sans labels.
    const hmUgcAiVideo = await estHmUgcAiVideo(supabase, acces);

    // File admin (label + UGC) : uniquement si on VA créer un compte (= langue)
    // et que ce n'est PAS un créateur UGC AI VIDEO.
    // Sinon on ne consomme pas la file (prévaut toujours sur l'auto least-used).
    let fileItem: FileLabelItem | null = null;
    let fileItemQueue: FileLabelItem | null = null;
    let personaUgc: PersonaUgcLibre | null = null;
    let modeUgcAiVideo = false;
    if (roleVoulu === "poster" && langue) {
      if (hmUgcAiVideo) {
        modeUgcAiVideo = true;
        personaUgc = await personaUgcLibre(supabase);
        if (!personaUgc) return json({ error: "NO_UGC_PERSONA" }, 409);
      } else {
        const prep = await preparerFileEtPersona(supabase, langue);
        if (!prep.ok) return json({ error: prep.error }, 409);
        fileItem = prep.fileItem;
        fileItemQueue = prep.fileItemQueue;
        personaUgc = prep.personaUgc;
      }
    }

    // Référence source : best-effort (plus bloquant).
    let referenceId: string | null = null;
    if (roleVoulu === "poster" && langue) {
      referenceId = await referenceLibre(supabase, langue);
    }

    const email = await emailDisponible(supabase, prenom, nom);

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { prenom },
    });

    if (error) {
      if (fileItemQueue) await unshiftLabelFile(supabase, fileItemQueue);
      const detail = [error.message, error.code, error.status].filter(Boolean).join(" · ");
      return json({ error: detail || `Création refusée pour ${email}` }, 400);
    }

    if (data.user) {
      const { error: errProfil } = await supabase
        .from("profiles")
        .update({ prenom, nom: nom || null, is_active: true, must_change_password: false })
        .eq("id", data.user.id);
      if (errProfil) {
        if (fileItemQueue) await unshiftLabelFile(supabase, fileItemQueue);
        return json(
          { error: `Profil non activé: ${errProfil.message}` },
          500,
        );
      }

      if (roleVoulu === "hiring_manager") {
        await supabase.from("user_roles").delete().eq("user_id", data.user.id);
        await supabase.from("user_roles").insert({ user_id: data.user.id, role: "hiring_manager" });
        const ensemble = [
          ...new Set(languesRecues.length > 0 ? languesRecues : (langue ? [langue] : [])),
        ];
        const hmVideo = Boolean(body.ugc_ai_video) && acces.role === "admin";
        const patchHm: Record<string, unknown> = { hm_ugc_ai_video: hmVideo };
        if (ensemble.length > 0) {
          patchHm.nationalite = ensemble[0];
          patchHm.langues = ensemble;
        }
        const { error: errHm } = await supabase
          .from("profiles")
          .update(patchHm)
          .eq("id", data.user.id);
        if (errHm) {
          return json({ error: `Profil HM: ${errHm.message}` }, 500);
        }
        if (hmVideo) {
          const labelIds = normaliserIds(body.ugc_ai_video_label_ids);
          await remplacerHmUgcVideoLabels(supabase, data.user.id, labelIds);
        }
      } else if (acces.role === "hiring_manager" && acces.userId !== "cron") {
        const { error: errMgr } = await supabase
          .from("profiles")
          .update({ manager_id: acces.userId })
          .eq("id", data.user.id);
        if (errMgr) {
          if (fileItemQueue) await unshiftLabelFile(supabase, fileItemQueue);
          return json(
            { error: `Rattachement recruteur: ${errMgr.message}` },
            500,
          );
        }
      }
    }

    let compte: {
      id: string;
      reference: string | null;
      persona: boolean;
      labelId: string | null;
      ugc: boolean;
      ugc_ai_video: boolean;
    } | null = null;
    if (data.user && roleVoulu === "poster" && langue) {
      const postsParJour = normaliserPostsParJour(body.posts_par_jour);
      compte = await preparerCompte(
        supabase,
        data.user.id,
        langue,
        referenceId,
        fileItem,
        postsParJour,
        personaUgc,
        fileItemQueue,
        { ugcAiVideo: modeUgcAiVideo },
      );
    } else if (fileItemQueue) {
      await unshiftLabelFile(supabase, fileItemQueue);
    }

    return json({ ok: true, userId: data.user?.id, email, compte, role: roleVoulu });
  }

  // Poster existant sans compte : consomme la file admin (label + UGC) comme à la création.
  if (body.action === "ensure_compte") {
    const userId = String(body.userId ?? "").trim();
    const langue = String(body.langue ?? "").trim().toLowerCase();
    if (!userId || !langue) {
      return json({ error: "userId et langue requis" }, 400);
    }
    if (acces.role === "hiring_manager" && acces.userId !== "cron") {
      const { data: cible } = await supabase
        .from("profiles")
        .select("manager_id")
        .eq("id", userId)
        .maybeSingle();
      if (!cible || cible.manager_id !== acces.userId) {
        return json({ error: "forbidden" }, 403);
      }
    }

    const { data: deja } = await supabase
      .from("comptes")
      .select("id")
      .eq("poster_id", userId)
      .maybeSingle();
    if (deja?.id) {
      return json({ ok: true, deja: true, compteId: deja.id });
    }

    // Créateur sous HM UGC AI VIDEO → marque + labels HM (pas de file admin).
    let modeUgcAiVideo = false;
    if (acces.role === "hiring_manager" && acces.userId !== "cron") {
      modeUgcAiVideo = await estHmUgcAiVideo(supabase, acces);
    } else if (acces.role === "admin") {
      const { data: cible } = await supabase
        .from("profiles")
        .select("manager_id")
        .eq("id", userId)
        .maybeSingle();
      if (cible?.manager_id) {
        const { data: hm } = await supabase
          .from("profiles")
          .select("hm_ugc_ai_video")
          .eq("id", cible.manager_id)
          .maybeSingle();
        modeUgcAiVideo = Boolean(hm?.hm_ugc_ai_video);
      }
    }

    let fileItem: FileLabelItem | null = null;
    let fileItemQueue: FileLabelItem | null = null;
    let personaUgc: PersonaUgcLibre | null = null;

    if (modeUgcAiVideo) {
      personaUgc = await personaUgcLibre(supabase);
      if (!personaUgc) return json({ error: "NO_UGC_PERSONA" }, 409);
    } else {
      const prep = await preparerFileEtPersona(supabase, langue);
      if (!prep.ok) return json({ error: prep.error }, 409);
      fileItem = prep.fileItem;
      fileItemQueue = prep.fileItemQueue;
      personaUgc = prep.personaUgc;
    }

    const referenceId = await referenceLibre(supabase, langue);
    const postsParJour = normaliserPostsParJour(body.posts_par_jour);
    const compte = await preparerCompte(
      supabase,
      userId,
      langue,
      referenceId,
      fileItem,
      postsParJour,
      personaUgc,
      fileItemQueue,
      { ugcAiVideo: modeUgcAiVideo },
    );
    if (!compte.id) return json({ error: "CREATION_COMPTE_ECHOUEE" }, 500);
    return json({ ok: true, compte });
  }

  if (body.action === "delete") {
    if (!body.userId) return json({ error: "userId requis" }, 400);
    if (acces.role !== "admin") {
      const { data: cible } = await supabase
        .from("profiles")
        .select("manager_id")
        .eq("id", body.userId)
        .single();
      if (!cible || cible.manager_id !== acces.userId) return json({ error: "forbidden" }, 403);
    }
    await supabase
      .from("profiles")
      .update({ manager_id: null })
      .eq("manager_id", body.userId);

    const { error } = await supabase.rpc("supprimer_auth_user", { uid: body.userId });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "action inconnue" }, 400);
}


function normaliser(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function emailDisponible(
  supabase: ReturnType<typeof serviceClient>,
  prenom: string,
  nom: string,
): Promise<string> {
  const base = normaliser(prenom) + normaliser(nom).slice(0, 1);

  for (let suffixe = 0; suffixe < 50; suffixe += 1) {
    const email = `${base}${suffixe || ""}@${DOMAINE}`;
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!data) return email;
  }

  return `${base}${Date.now()}@${DOMAINE}`;
}

async function lireWarmupHeures(supabase: Supabase): Promise<number> {
  const { data } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "warmup")
    .maybeSingle();
  const h = Number((data?.valeur as { heures?: number } | null)?.heures ?? 24);
  return Number.isFinite(h) && h > 0 ? Math.min(168, h) : 24;
}

function normaliserFileItems(valeur: unknown): FileLabelItem[] {
  const v = (valeur ?? {}) as {
    items?: Array<{ label_id?: string; ugc?: boolean }>;
    label_ids?: string[];
  };
  if (Array.isArray(v.items) && v.items.length > 0) {
    return v.items
      .map((it) => ({
        label_id: String(it?.label_id ?? "").trim(),
        ugc: Boolean(it?.ugc),
      }))
      .filter((it) => it.label_id);
  }
  return (v.label_ids ?? [])
    .map((id) => String(id ?? "").trim())
    .filter(Boolean)
    .map((label_id) => ({ label_id, ugc: false }));
}

/**
 * Tire la première entrée de la file (FIFO) et persiste le reste.
 * File vide → label classique le moins utilisé (ne consomme pas la file).
 * `fromQueue` : true si l'entrée vient du classement admin (à restaurer en échec).
 */
async function popLabelFile(
  supabase: Supabase,
  langue: string,
): Promise<
  | { ok: true; item: FileLabelItem; fromQueue: boolean }
  | { ok: false; error: string }
> {
  const { data } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "file_labels_comptes")
    .maybeSingle();
  const items = normaliserFileItems(data?.valeur);
  if (items.length > 0) {
    const [first, ...rest] = items;
    await supabase.from("reglages").upsert(
      {
        cle: "file_labels_comptes",
        valeur: { items: rest },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cle" },
    );
    if (!first) return { ok: false, error: "NO_LABELS" };
    return { ok: true, item: first, fromQueue: true };
  }

  const labelId = await labelMoinsUtiliseParLangue(supabase, langue, { ugcOnly: false });
  if (!labelId) return { ok: false, error: "NO_LABELS" };
  return { ok: true, item: { label_id: labelId, ugc: false }, fromQueue: false };
}

/** Hiring manager marqué UGC AI VIDEO (ses créateurs = marque vidéo + labels HM). */
async function estHmUgcAiVideo(
  supabase: Supabase,
  acces: { role: string; userId: string },
): Promise<boolean> {
  if (acces.role !== "hiring_manager" || acces.userId === "cron") return false;
  const { data } = await supabase
    .from("profiles")
    .select("hm_ugc_ai_video")
    .eq("id", acces.userId)
    .maybeSingle();
  return Boolean(data?.hm_ugc_ai_video);
}

function normaliserIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.map((x) => String(x ?? "").trim()).filter((id) => id.length > 0),
    ),
  ];
}

/** Remplace les labels thématiques UGC AI VIDEO d’un HM. */
async function remplacerHmUgcVideoLabels(
  supabase: Supabase,
  profileId: string,
  labelIds: string[],
): Promise<void> {
  await supabase.from("hm_ugc_video_labels").delete().eq("profile_id", profileId);
  if (labelIds.length === 0) return;
  // Ne garder que les labels du pool UGC AI VIDEO, hors marque système.
  const { data: ok } = await supabase
    .from("labels")
    .select("id")
    .in("id", labelIds)
    .eq("ugc_ai_video", true)
    .neq("slug", "ugc-ai-video");
  const valides = (ok ?? []).map((r) => r.id as string);
  if (valides.length === 0) return;
  await supabase.from("hm_ugc_video_labels").insert(
    valides.map((label_id) => ({ profile_id: profileId, label_id })),
  );
}

/** Marque système + labels thématiques du HM du créateur. */
async function labelsPourCreateurUgcVideo(
  supabase: Supabase,
  posterId: string,
): Promise<string[]> {
  const ids = new Set<string>();

  const { data: marque } = await supabase
    .from("labels")
    .select("id")
    .eq("slug", "ugc-ai-video")
    .eq("ugc_ai_video", true)
    .maybeSingle();
  if (marque?.id) ids.add(marque.id as string);

  const { data: profil } = await supabase
    .from("profiles")
    .select("manager_id")
    .eq("id", posterId)
    .maybeSingle();
  const managerId = (profil?.manager_id as string | null) ?? null;
  if (managerId) {
    const { data: hmLabs } = await supabase
      .from("hm_ugc_video_labels")
      .select("label_id")
      .eq("profile_id", managerId);
    for (const r of hmLabs ?? []) {
      if (r.label_id) ids.add(r.label_id as string);
    }
  }

  return [...ids];
}

/**
 * Consomme la file admin (prévaut toujours) + persona UGC si besoin.
 * `fileItemQueue` = entrée exacte à remettre en tête en cas d'échec auth/compte.
 */
async function preparerFileEtPersona(
  supabase: Supabase,
  langue: string,
): Promise<
  | {
    ok: true;
    fileItem: FileLabelItem;
    fileItemQueue: FileLabelItem | null;
    personaUgc: PersonaUgcLibre | null;
  }
  | { ok: false; error: string }
> {
  const popped = await popLabelFile(supabase, langue);
  if (!popped.ok) return { ok: false, error: popped.error };

  let fileItem = popped.item;
  const fileItemQueue = popped.fromQueue ? { ...popped.item } : null;
  let personaUgc: PersonaUgcLibre | null = null;

  if (fileItem.ugc) {
    const labelOk = await labelADesContenusUgc(supabase, fileItem.label_id);
    if (!labelOk) {
      const fallback = await labelMoinsUtiliseParLangue(supabase, langue, {
        ugcOnly: true,
      });
      if (!fallback) {
        if (fileItemQueue) await unshiftLabelFile(supabase, fileItemQueue);
        return { ok: false, error: "NO_UGC_LABEL" };
      }
      fileItem = { label_id: fallback, ugc: true };
    }
    personaUgc = await personaUgcLibre(supabase);
    if (!personaUgc) {
      if (fileItemQueue) await unshiftLabelFile(supabase, fileItemQueue);
      return { ok: false, error: "NO_UGC_PERSONA" };
    }
  }

  return { ok: true, fileItem, fileItemQueue, personaUgc };
}

/** Label avec le moins de comptes actifs dans la langue (ou global si langue vide). */
async function labelMoinsUtiliseParLangue(
  supabase: Supabase,
  langue: string,
  opts: { ugcOnly: boolean },
): Promise<string | null> {
  let pool: string[] = [];
  if (opts.ugcOnly) {
    pool = await labelIdsAvecContenusUgc(supabase);
  } else {
    const { data: tous } = await supabase.from("labels").select("id");
    pool = (tous ?? []).map((l) => l.id as string).filter(Boolean);
  }
  if (pool.length === 0) return null;

  const counts = new Map<string, number>(pool.map((id) => [id, 0]));
  let q = supabase
    .from("compte_labels")
    .select("label_id, comptes!inner(langue, is_active)")
    .eq("comptes.is_active", true)
    .in("label_id", pool);
  if (langue) q = q.eq("comptes.langue", langue);
  const { data: usages } = await q;
  for (const u of usages ?? []) {
    const id = u.label_id as string;
    if (!counts.has(id)) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  let min = Infinity;
  const candidats: string[] = [];
  for (const [id, n] of counts) {
    if (n < min) {
      min = n;
      candidats.length = 0;
      candidats.push(id);
    } else if (n === min) {
      candidats.push(id);
    }
  }
  if (candidats.length === 0) return null;
  return candidats[Math.floor(Math.random() * candidats.length)] ?? null;
}

async function labelIdsAvecContenusUgc(supabase: Supabase): Promise<string[]> {
  const { data } = await supabase
    .from("contenu_labels")
    .select("label_id, contenus!inner(ugc_compatible)")
    .eq("contenus.ugc_compatible", true);
  return [...new Set((data ?? []).map((r) => r.label_id as string).filter(Boolean))];
}

async function labelADesContenusUgc(supabase: Supabase, labelId: string): Promise<boolean> {
  const { data } = await supabase
    .from("contenu_labels")
    .select("contenu_id, contenus!inner(ugc_compatible)")
    .eq("label_id", labelId)
    .eq("contenus.ugc_compatible", true)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function unshiftLabelFile(supabase: Supabase, item: FileLabelItem): Promise<void> {
  const { data } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "file_labels_comptes")
    .maybeSingle();
  const items = normaliserFileItems(data?.valeur);
  await supabase.from("reglages").upsert(
    {
      cle: "file_labels_comptes",
      valeur: { items: [item, ...items] },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cle" },
  );
}

async function personaUgcLibre(supabase: Supabase): Promise<PersonaUgcLibre | null> {
  const { data: personas } = await supabase
    .from("ugc_personas")
    .select("id, nom, image_face_url, image_profile_url");
  if (!personas?.length) return null;

  const { data: pris } = await supabase
    .from("comptes")
    .select("ugc_persona_id")
    .not("ugc_persona_id", "is", null);
  const used = new Set((pris ?? []).map((c) => c.ugc_persona_id as string).filter(Boolean));

  const libres = personas.filter(
    (p) =>
      !used.has(p.id as string) &&
      typeof p.image_face_url === "string" &&
      p.image_face_url.length > 0 &&
      typeof p.nom === "string" &&
      p.nom.trim().length > 0,
  ) as PersonaUgcLibre[];
  if (libres.length === 0) return null;
  return libres[Math.floor(Math.random() * libres.length)] ?? null;
}

/** Télécharge la PDP persona (profil 1:1 ou face), strip C2PA, upload avatar compte. */
async function avatarDepuisFacePersona(
  supabase: Supabase,
  compteId: string,
  faceUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(faceUrl);
    if (!res.ok) return null;
    const raw = new Uint8Array(await res.arrayBuffer());
    const strip = await retirerContentCredentialsBytes(raw);
    const mime =
      strip.mime === "application/octet-stream"
        ? (res.headers.get("content-type") || "image/png")
        : strip.mime;
    const ext = mime.includes("jpeg") || mime.includes("jpg")
      ? "jpg"
      : mime.includes("webp")
        ? "webp"
        : "png";
    const path = `avatars/ugc/${compteId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, strip.bytes, {
      contentType: mime || "image/png",
      upsert: true,
      cacheControl: "3600",
    });
    if (error) return null;
    const pub = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    return `${pub}?v=${Date.now()}`;
  } catch {
    return null;
  }
}

/**
 * Compte créé avec warmup NON démarré (started/ends null).
 * Label posé tout de suite ; identité instantanée.
 * UGC slideshow : ugc_ai + persona + nom persona + avatar face stripée.
 * UGC AI VIDEO : ugc_ai_video + persona + labels HM + marque `ugc-ai-video`.
 */
/** Quota d'assignation journalier : 1–3, défaut 2 à la création. */
function normaliserPostsParJour(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 2;
  return Math.min(3, Math.max(1, Math.round(v)));
}

async function preparerCompte(
  supabase: Supabase,
  posterId: string,
  langue: string,
  referenceId: string | null,
  fileItem: FileLabelItem | null,
  postsParJour: number,
  personaUgc: PersonaUgcLibre | null,
  /** Entrée admin à restaurer si l'insert échoue (pas le fallback label). */
  fileItemQueue: FileLabelItem | null = null,
  opts: { ugcAiVideo?: boolean } = {},
): Promise<{
  id: string;
  reference: string | null;
  persona: boolean;
  labelId: string | null;
  ugc: boolean;
  ugc_ai_video: boolean;
}> {
  const ugcAiVideo = Boolean(opts.ugcAiVideo && personaUgc);
  // Slideshow UGC et vidéo sont exclusifs.
  const ugc = !ugcAiVideo && Boolean(fileItem?.ugc && personaUgc);
  const avecPersona = Boolean((ugc || ugcAiVideo) && personaUgc);
  const labelIdsVideo = ugcAiVideo
    ? await labelsPourCreateurUgcVideo(supabase, posterId)
    : [];
  const labelId = ugcAiVideo
    ? (labelIdsVideo[0] ?? null)
    : (fileItem?.label_id ?? null);
  const aRestaurer = ugcAiVideo ? null : (fileItemQueue ?? fileItem);

  const { data: compte, error } = await supabase
    .from("comptes")
    .insert({
      poster_id: posterId,
      compte_reference_id: referenceId,
      langue,
      posts_par_jour: postsParJour,
      warmup_started_at: null,
      warmup_ends_at: null,
      is_active: true,
      ugc_ai: ugc,
      ugc_ai_video: ugcAiVideo,
      ugc_persona_id: avecPersona ? personaUgc!.id : null,
      persona_nom: avecPersona ? personaUgc!.nom.trim() : null,
    })
    .select("id")
    .single();
  if (error || !compte) {
    if (aRestaurer) await unshiftLabelFile(supabase, aRestaurer);
    throw new Error(
      `Création compte publication: ${error?.message ?? "insert vide"}`,
    );
  }

  let labelNom: string | null = null;
  if (ugcAiVideo) {
    if (labelIdsVideo.length > 0) {
      await supabase.from("compte_labels").insert(
        labelIdsVideo.map((lid) => ({ compte_id: compte.id, label_id: lid })),
      );
      const { data: lab } = await supabase
        .from("labels")
        .select("nom, slug")
        .eq("id", labelIdsVideo[0]!)
        .maybeSingle();
      labelNom = (lab?.nom as string | undefined) ?? (lab?.slug as string | undefined) ?? null;
    }
  } else if (labelId) {
    await supabase.from("compte_labels").insert({ compte_id: compte.id, label_id: labelId });
    const { data: lab } = await supabase
      .from("labels")
      .select("nom, slug")
      .eq("id", labelId)
      .maybeSingle();
    labelNom = (lab?.nom as string | undefined) ?? (lab?.slug as string | undefined) ?? null;
  }

  if (avecPersona && personaUgc) {
    const sourceAvatar =
      (typeof personaUgc.image_profile_url === "string" &&
        personaUgc.image_profile_url.length > 0
        ? personaUgc.image_profile_url
        : null) || personaUgc.image_face_url;
    const avatarUrl = await avatarDepuisFacePersona(
      supabase,
      compte.id,
      sourceAvatar,
    );
    if (avatarUrl) {
      await supabase
        .from("comptes")
        .update({
          avatar_url: avatarUrl,
          avatar_source: "ugc_persona",
          persona_nom: personaUgc.nom.trim(),
        })
        .eq("id", compte.id);
    }
  }

  const { applique } = await appliquerIdentiteInstantanee(supabase, compte.id, {
    labelId,
    labelNom,
  });

  // Sécurité : le nom UGC ne doit pas être écrasé si déjà posé (?? côté persona).
  if (avecPersona && personaUgc) {
    await supabase
      .from("comptes")
      .update({
        persona_nom: personaUgc.nom.trim(),
        ugc_ai: ugc,
        ugc_ai_video: ugcAiVideo,
        ugc_persona_id: personaUgc.id,
      })
      .eq("id", compte.id);
  }

  return {
    id: compte.id,
    reference: referenceId,
    persona: applique,
    labelId,
    ugc,
    ugc_ai_video: ugcAiVideo,
  };
}

async function referenceLibre(
  supabase: Supabase,
  langue: string,
): Promise<string | null> {
  const { data: refs } = await supabase
    .from("comptes_reference")
    .select("id, langue, ordre_assignation, ordre_par_langue, created_at")
    .eq("is_active", true)
    .is("parent_id", null);
  if (!refs || refs.length === 0) return null;

  const { data: comptes } = await supabase
    .from("comptes")
    .select("compte_reference_id")
    .eq("langue", langue)
    .not("compte_reference_id", "is", null);
  const prisDansCetteLangue = new Set((comptes ?? []).map((c) => c.compte_reference_id));

  const libres = refs.filter((r) => !prisDansCetteLangue.has(r.id));
  if (libres.length === 0) return null;

  // deno-lint-ignore no-explicit-any
  const rang = (r: any) =>
    (r.ordre_par_langue?.[langue] as number | undefined) ?? r.ordre_assignation ?? 9999;
  libres.sort(
    (a, b) => rang(a) - rang(b) || String(a.created_at).localeCompare(String(b.created_at)),
  );
  return libres[0].id;
}
