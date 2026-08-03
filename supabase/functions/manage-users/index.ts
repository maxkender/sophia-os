import { appliquerIdentiteInstantanee } from "../_shared/persona.ts";
import { assertRole, json, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;
const DOMAINE = "sophia.com";

/**
 * Gestion des posters / recruteurs.
 *
 *   { action: "create", prenom, nom, password, langue?, langues?, role?, posts_par_jour? }
 *   { action: "start_warmup", compteId }  — créateur (son compte) ou admin
 *   { action: "delete", userId }
 *
 * Création poster : compte créé immédiatement (warmup non démarré).
 * Label : file FIFO `file_labels_comptes`, sinon label le moins utilisé
 * pour la LANGUE du créateur. Identité (@ / PDP) selon label + langue.
 * Référence source = best-effort (plus bloquant).
 */
Deno.serve(async (request) => {
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

    // Label obligatoire pour un poster : file FIFO, sinon moins utilisé dans
    // la langue du créateur.
    let labelId: string | null = null;
    if (roleVoulu === "poster") {
      labelId = await popLabelFile(supabase, langue);
      if (!labelId) return json({ error: "NO_LABELS" }, 409);
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
      // Remettre le label en tête de file si la création auth échoue.
      if (labelId) await unshiftLabelFile(supabase, labelId);
      const detail = [error.message, error.code, error.status].filter(Boolean).join(" · ");
      return json({ error: detail || `Création refusée pour ${email}` }, 400);
    }

    if (data.user) {
      await supabase
        .from("profiles")
        .update({ prenom, nom: nom || null, is_active: true, must_change_password: false })
        .eq("id", data.user.id);

      if (roleVoulu === "hiring_manager") {
        await supabase.from("user_roles").delete().eq("user_id", data.user.id);
        await supabase.from("user_roles").insert({ user_id: data.user.id, role: "hiring_manager" });
        const ensemble = [
          ...new Set(languesRecues.length > 0 ? languesRecues : (langue ? [langue] : [])),
        ];
        if (ensemble.length > 0) {
          await supabase
            .from("profiles")
            .update({ nationalite: ensemble[0], langues: ensemble })
            .eq("id", data.user.id);
        }
      } else if (acces.role === "hiring_manager" && acces.userId !== "cron") {
        await supabase
          .from("profiles")
          .update({ manager_id: acces.userId })
          .eq("id", data.user.id);
      }
    }

    let compte: {
      id: string;
      reference: string | null;
      persona: boolean;
      labelId: string | null;
    } | null = null;
    if (data.user && roleVoulu === "poster" && langue) {
      const postsParJour = normaliserPostsParJour(body.posts_par_jour);
      compte = await preparerCompte(
        supabase,
        data.user.id,
        langue,
        referenceId,
        labelId,
        postsParJour,
      );
    }

    return json({ ok: true, userId: data.user?.id, email, compte, role: roleVoulu });
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
});

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

/**
 * Tire le premier label de la file (FIFO) et persiste le reste.
 * File vide → label le moins utilisé par les comptes actifs de cette langue
 * (ex æquo : tirage parmi les minima). Ne consomme pas la file.
 */
async function popLabelFile(supabase: Supabase, langue: string): Promise<string | null> {
  const { data } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "file_labels_comptes")
    .maybeSingle();
  const ids = ((data?.valeur as { label_ids?: string[] } | null)?.label_ids ?? []).filter(
    Boolean,
  );
  if (ids.length > 0) {
    const [first, ...rest] = ids;
    await supabase.from("reglages").upsert(
      {
        cle: "file_labels_comptes",
        valeur: { label_ids: rest },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cle" },
    );
    return first ?? null;
  }

  return labelMoinsUtiliseParLangue(supabase, langue);
}

/** Label avec le moins de comptes actifs dans la langue (ou global si langue vide). */
async function labelMoinsUtiliseParLangue(
  supabase: Supabase,
  langue: string,
): Promise<string | null> {
  const { data: tous } = await supabase.from("labels").select("id");
  const pool = (tous ?? []).map((l) => l.id as string).filter(Boolean);
  if (pool.length === 0) return null;

  const counts = new Map<string, number>(pool.map((id) => [id, 0]));
  let q = supabase
    .from("compte_labels")
    .select("label_id, comptes!inner(langue, is_active)")
    .eq("comptes.is_active", true);
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

async function unshiftLabelFile(supabase: Supabase, labelId: string): Promise<void> {
  const { data } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "file_labels_comptes")
    .maybeSingle();
  const ids = ((data?.valeur as { label_ids?: string[] } | null)?.label_ids ?? []).filter(
    Boolean,
  );
  await supabase.from("reglages").upsert(
    {
      cle: "file_labels_comptes",
      valeur: { label_ids: [labelId, ...ids] },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cle" },
  );
}

/**
 * Compte créé avec warmup NON démarré (started/ends null).
 * Label posé tout de suite ; identité instantanée.
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
  labelId: string | null,
  postsParJour: number,
): Promise<{ id: string; reference: string | null; persona: boolean; labelId: string | null }> {
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
    })
    .select("id")
    .single();
  if (error || !compte) {
    if (labelId) await unshiftLabelFile(supabase, labelId);
    return { id: "", reference: referenceId, persona: false, labelId };
  }

  if (labelId) {
    await supabase.from("compte_labels").insert({ compte_id: compte.id, label_id: labelId });
  }

  const { applique } = await appliquerIdentiteInstantanee(supabase, compte.id);
  return { id: compte.id, reference: referenceId, persona: applique, labelId };
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
