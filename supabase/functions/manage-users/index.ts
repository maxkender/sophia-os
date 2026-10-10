import { applicationSophia, type ApplicationRow } from "../_shared/applications.ts";
import {
  consommerFileSlideshow,
  estLabelFileSlideshow,
  estLabelInterditCompte,
  estLabelSysteme,
} from "../_shared/labels_file.ts";
import { retirerContentCredentialsBytes } from "../_shared/c2pa.ts";
import {
  applicationsRequises,
  type ChoixCompte,
  choixApplicableAuCompte,
  labelChoisiCompatible,
  lireChoixCompte,
  validerParts,
} from "../_shared/creation_compte_apps.ts";
import { filtrerPoolParApplication } from "../_shared/labels_repli.ts";
import { lireTout } from "../_shared/lots.ts";
import type { PartsApplications } from "../_shared/multi_app.ts";
import { appliquerIdentiteInstantanee } from "../_shared/persona.ts";
import { cibleComptePapier, motDePasseComptePapier } from "../_shared/papier_cm_compte.ts";
import { estRoleManager, rattachementNouvelHm, roleACreer } from "../_shared/roles.ts";
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

/** Entrée consommée depuis une file admin — à restaurer au même endroit si échec. */
interface FileLabelQueued {
  item: FileLabelItem;
  /** `"general"` ou code langue (`fr`, `de`, …). */
  queueKey: string;
  applicationSlug?: string;
}

interface FileLabelsSlice {
  items: FileLabelItem[];
  par_langue: Record<string, FileLabelItem[]>;
}

interface FileLabelsValeur {
  items: FileLabelItem[];
  par_langue: Record<string, FileLabelItem[]>;
  par_application?: Record<string, FileLabelsSlice>;
}

interface PersonaUgcLibre {
  id: string;
  nom: string;
  image_face_url: string;
  image_profile_url: string | null;
}

/** Aligné sur `resoudrePremierCompte` (src/features/moteur/comptesCm.ts). */
function resoudrePremierCompte(
  type: unknown,
  langue: string,
): "perso" | "cm" | "aucun" {
  const t = String(type ?? "").trim().toLowerCase();
  if (t === "aucun" || t === "none") return "aucun";
  if (!langue) return "aucun";
  if (t === "cm") return "cm";
  return "perso";
}

/**
 * Gestion des posters / recruteurs.
 *
 *   { action: "create", prenom, nom, password, langue?, type_compte?, … }
 *     type_compte: perso (défaut si langue) | cm | aucun
 *   { action: "ensure_compte", userId, langue, posts_par_jour? } — 1er compte perso (idempotent)
 *   { action: "ajouter_compte", userId, type_compte, langue, … } — compte supplémentaire perso ou CM
 *   { action: "ajouter_compte_cm", userId, langue, … } — Instagram + Gmail via le contrat
 *   { action: "maj_identifiants_cm", compteId, tiktok_email, tiktok_password, … }
 *   { action: "deplacer_compte", compteId, destPosterId } — rattache le compte à un autre créateur (même id)
 *   { action: "start_warmup", compteId }  — créateur (son compte perso) ou admin
 *   { action: "skip_warmup", compteId }   — admin : compte actif immédiat
 *   { action: "delete", userId }
 *
 * Création poster : premier compte perso, CM, ou aucun (login seul).
 * File FIFO `file_labels_comptes` :
 *   { items: [...], par_langue: { fr: [...], de: [...] } }
 * Priorité : file de la langue du poster → file générale (`items`) → least-used.
 * Labels UGC AI VIDEO (ex. `test`) exclus de la file et du fallback — réservés
 * aux créateurs nés d'un HM `hm_ugc_ai_video`.
 * Hook et la marque `ugc-ai-video` ne sont JAMAIS posés sur un créateur.
 * UGC slideshow → persona libre, nom + avatar (profil 1:1 si dispo, sinon face)
 * sans métadonnées ; label forcé parmi ceux qui ont des slideshows ugc_compatible.
 * HM `hm_ugc_ai_video` → comptes ugc_ai_video, persona unique (pool partagé),
 * labels = labels HM (`hm_ugc_video_labels`) ; marque = checkmark `comptes.ugc_ai_video`.
 *
 * Choix du recruteur (admin, head_of_ops, DM, HM) à la création d'un compte
 * perso slideshow
 * (create, ensure_compte, ajouter_compte) : `label_id` et/ou
 * `parts_applications` (cf. `_shared/creation_compte_apps.ts`). Fournis, ils
 * court-circuitent la File des créateurs, qui n'est NI consommée NI retirée ;
 * absents ou `null`, rien ne change (mêmes requêtes, même insert).
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
      .select("id, poster_id, type_compte, warmup_started_at, warmup_ends_at")
      .eq("id", compteId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 400);
    if (!compte) return json({ error: "compte introuvable" }, 404);
    if (compte.type_compte === "cm") {
      return json({ error: "Un compte CM n'a pas de warmup" }, 400);
    }

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
      .select("id, type_compte, warmup_started_at, warmup_ends_at")
      .eq("id", compteId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 400);
    if (!compte) return json({ error: "compte introuvable" }, 404);
    if (compte.type_compte === "cm") {
      return json({ error: "Un compte CM n'a pas de warmup" }, 400);
    }

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

  const acces = await assertRole(request, [
    "admin",
    "hiring_manager",
    "directing_manager",
    // Oublié quand le rôle a été créé : sans lui, le Head of Ops voyait les
    // boutons « Créer un poster » et « Créer un recruteur » et récoltait un 403.
    "head_of_ops",
  ]);
  if (acces instanceof Response) return acces;

  if (body.action === "create") {
    const prenom = String(body.prenom ?? "").trim();
    const nom = String(body.nom ?? "").trim();
    const password = String(body.password ?? "");
    const langue = String(body.langue ?? "").trim().toLowerCase();
    const typePremier = resoudrePremierCompte(body.type_compte, langue);
    const languesRecues = Array.isArray(body.langues)
      ? (body.langues as unknown[])
        .map((l) => String(l ?? "").trim().toLowerCase())
        .filter(Boolean)
      : [];
    // Un recruteur peut désormais en recruter un autre, comme l'admin. Le
    // plafond vit dans `roleACreer` (testé) : personne ne se fabrique un admin,
    // un DM ou un Head of Ops par ce chemin, quoi qu'il envoie.
    const roleVoulu = roleACreer(body.role, acces.role);
    const creerCm = roleVoulu === "poster" && typePremier === "cm";
    const creerPerso = roleVoulu === "poster" && typePremier === "perso";

    if (!prenom || password.length < 8) {
      return json({ error: "Prénom requis et mot de passe d'au moins 8 caractères" }, 400);
    }

    // Label / répartition imposés par le recruteur. `null` = chemin historique.
    const lecture = lireChoixCompte(body, acces.role);
    if (!lecture.ok) return json({ error: lecture.erreur }, lecture.statut);
    const choix = lecture.choix;

    // HM UGC AI VIDEO : ses créateurs naissent sans file labels / sans labels.
    const hmUgcAiVideo = await estHmUgcAiVideo(supabase, acces);
    // Tout refus tombe AVANT createUser : un choix rejeté ne laisse ni login
    // orphelin ni entrée de File consommée.
    if (
      choix &&
      !choixApplicableAuCompte({
        typeCompte: creerPerso ? "perso" : creerCm ? "cm" : "aucun",
        ugcAiVideo: hmUgcAiVideo,
      })
    ) {
      return json({ error: "CHOIX_COMPTE_INCOMPATIBLE" }, 400);
    }
    // Tout compte naît Sophia (identité, file labels, référence), quoi que dise
    // body.application_id / application_slug : un compte porte des LABELS, et
    // ce sont eux qui décident des applications qu'il promeut
    // (docs/multi-applications.md). L'ancien front pouvait encore envoyer
    // micabo, supprimé en 0257 — on l'ignore.
    const application = await applicationSophia(supabase);

    // File admin uniquement pour un premier compte perso (pas CM, pas login seul).
    let fileItem: FileLabelItem | null = null;
    let fileItemQueue: FileLabelQueued | null = null;
    let personaUgc: PersonaUgcLibre | null = null;
    let modeUgcAiVideo = false;
    let partsApplications: PartsApplications | null = null;
    if (creerPerso) {
      if (hmUgcAiVideo) {
        modeUgcAiVideo = true;
        personaUgc = await personaUgcLibre(supabase, application.id);
        if (!personaUgc) return json({ error: "NO_UGC_PERSONA" }, 409);
      } else if (choix) {
        // Choix admin : la File n'est pas touchée, pas de persona UGC.
        const res = await resoudreChoixCompte(supabase, choix, langue);
        if (!res.ok) return res.reponse;
        fileItem = res.fileItem;
        partsApplications = res.parts;
      } else {
        const prep = await preparerFileEtPersona(supabase, langue, application);
        if (!prep.ok) return json({ error: prep.error }, 409);
        fileItem = prep.fileItem;
        fileItemQueue = prep.fileItemQueue;
        personaUgc = prep.personaUgc;
      }
    }

    // Référence source : best-effort (plus bloquant).
    let referenceId: string | null = null;
    if (creerPerso) {
      referenceId = await referenceLibre(supabase, langue, application.id);
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
        const hmVideo =
          Boolean(body.ugc_ai_video) &&
          (acces.role === "admin" || acces.role === "directing_manager");
        const patchHm: Record<string, unknown> = { hm_ugc_ai_video: hmVideo };
        if (ensemble.length > 0) {
          patchHm.nationalite = ensemble[0];
          patchHm.langues = ensemble;
        }
        const rattachement = rattachementNouvelHm(
          acces.role,
          acces.userId,
          await managerDe(supabase, acces),
        );
        if (rattachement !== undefined) patchHm.manager_id = rattachement;
        await supabase.from("profiles").update(patchHm).eq("id", data.user.id);
        if (hmVideo) {
          const labelIds = normaliserIds(body.ugc_ai_video_label_ids);
          await remplacerHmUgcVideoLabels(supabase, data.user.id, labelIds);
        }
      } else if (estRoleManager(acces.role) && acces.userId !== "cron") {
        await supabase
          .from("profiles")
          .update({ manager_id: acces.userId })
          .eq("id", data.user.id);
      }
    }

    let compte: {
      id: string;
      type_compte?: string;
      reference: string | null;
      persona: boolean;
      labelId: string | null;
      ugc: boolean;
      ugc_ai_video: boolean;
    } | null = null;
    if (data.user && creerPerso) {
      const postsParJour = normaliserPostsParJour(body.posts_par_jour);
      compte = {
        ...(await preparerCompte(
          supabase,
          data.user.id,
          langue,
          referenceId,
          fileItem,
          postsParJour,
          personaUgc,
          fileItemQueue,
          { ugcAiVideo: modeUgcAiVideo, application, partsApplications },
        )),
        type_compte: "perso",
      };
      if (compte.id) await ajouterLangueProfil(supabase, data.user.id, langue);
      const handlePerso = String(body.handle_tiktok ?? "").trim().replace(/^@+/, "");
      if (compte.id && handlePerso) {
        await supabase.from("comptes").update({ handle_tiktok: handlePerso }).eq("id", compte.id);
      }
    } else if (data.user && creerCm) {
      const cm = await creerCompteCmPourPoster(supabase, acces, data.user.id, langue, body);
      if (!cm.ok) return cm;
      try {
        const payload = await cm.clone().json() as { compteId?: string };
        compte = {
          id: payload.compteId ?? "",
          type_compte: "cm",
          reference: null,
          persona: false,
          labelId: null,
          ugc: false,
          ugc_ai_video: false,
        };
      } catch {
        compte = {
          id: "",
          type_compte: "cm",
          reference: null,
          persona: false,
          labelId: null,
          ugc: false,
          ugc_ai_video: false,
        };
      }
    } else if (fileItemQueue) {
      await unshiftLabelFile(supabase, fileItemQueue);
    }

    if (roleVoulu === "poster" && langue) {
      await etendreLanguesManager(supabase, acces, langue);
    }

    return json({
      ok: true,
      userId: data.user?.id,
      email,
      compte,
      type_compte: creerCm ? "cm" : creerPerso ? "perso" : null,
      role: roleVoulu,
    });
  }

  // Poster existant sans compte : consomme la file admin (label + UGC) comme à la création.
  if (body.action === "ensure_compte") {
    const userId = String(body.userId ?? "").trim();
    const langue = String(body.langue ?? "").trim().toLowerCase();
    if (!userId || !langue) {
      return json({ error: "userId et langue requis" }, 400);
    }
    if (estRoleManager(acces.role) && acces.userId !== "cron") {
      const { data: cible } = await supabase
        .from("profiles")
        .select("manager_id")
        .eq("id", userId)
        .maybeSingle();
      if (!cible || cible.manager_id !== acces.userId) {
        return json({ error: "forbidden" }, 403);
      }
    }
    const lecture = lireChoixCompte(body, acces.role);
    if (!lecture.ok) return json({ error: lecture.erreur }, lecture.statut);

    const { data: deja } = await supabase
      .from("comptes")
      .select("id")
      .eq("poster_id", userId)
      .eq("type_compte", "perso")
      .limit(1)
      .maybeSingle();
    if (deja?.id) {
      return json({ ok: true, deja: true, compteId: deja.id });
    }

    const application = await applicationSophia(supabase);
    await etendreLanguesManager(supabase, acces, langue);
    return await creerComptePersoPourPoster(
      supabase,
      acces,
      userId,
      langue,
      body.posts_par_jour,
      "",
      application,
      lecture.choix,
    );
  }

  if (body.action === "ajouter_compte" || body.action === "ajouter_compte_perso") {
    const userId = String(body.userId ?? "").trim();
    const langue = String(body.langue ?? "").trim().toLowerCase();
    const typeCompte = body.action === "ajouter_compte_perso"
      ? "perso"
      : (String(body.type_compte ?? "perso") === "cm" ? "cm" : "perso");
    if (!userId || !langue) return json({ error: "userId et langue requis" }, 400);

    const interdit = await refuserSiHorsEquipe(supabase, acces, userId);
    if (interdit) return interdit;
    const lecture = lireChoixCompte(body, acces.role);
    if (!lecture.ok) return json({ error: lecture.erreur }, lecture.statut);
    if (lecture.choix && !choixApplicableAuCompte({ typeCompte, ugcAiVideo: false })) {
      return json({ error: "CHOIX_COMPTE_INCOMPATIBLE" }, 400);
    }
    await etendreLanguesManager(supabase, acces, langue);

    if (typeCompte === "cm") {
      return await creerCompteCmPourPoster(supabase, acces, userId, langue, body);
    }

    const application = await applicationSophia(supabase);
    return await creerComptePersoPourPoster(
      supabase,
      acces,
      userId,
      langue,
      body.posts_par_jour,
      String(body.handle_tiktok ?? "").trim().replace(/^@+/, ""),
      application,
      lecture.choix,
    );
  }

  if (body.action === "ajouter_compte_cm") {
    const userId = String(body.userId ?? "").trim();
    const langue = String(body.langue ?? "").trim().toLowerCase();
    if (!userId || !langue) return json({ error: "userId et langue requis" }, 400);

    const interdit = await refuserSiHorsEquipe(supabase, acces, userId);
    if (interdit) return interdit;
    const lecture = lireChoixCompte(body, acces.role);
    if (!lecture.ok) return json({ error: lecture.erreur }, lecture.statut);
    // Un compte CM n'a pas de moteur : ni label slideshow ni répartition.
    if (lecture.choix) return json({ error: "CHOIX_COMPTE_INCOMPATIBLE" }, 400);
    await etendreLanguesManager(supabase, acces, langue);

    return await creerCompteCmPourPoster(supabase, acces, userId, langue, body);
  }

  if (body.action === "maj_identifiants_cm") {
    const compteId = String(body.compteId ?? "").trim();
    const emailTiktok = String(body.tiktok_email ?? "").trim();
    const passwordTiktok = String(body.tiktok_password ?? "");
    const deuxFa = String(body.tiktok_2fa_note ?? "").trim();
    const notesHm = String(body.notes_hm ?? "").trim();
    if (!compteId) return json({ error: "compteId requis" }, 400);
    if (!emailTiktok || passwordTiktok.length < 1) {
      return json({ error: "Identifiants TikTok (email + mot de passe) requis" }, 400);
    }

    const { data: compte } = await supabase
      .from("comptes")
      .select("id, poster_id, type_compte")
      .eq("id", compteId)
      .maybeSingle();
    if (!compte) return json({ error: "compte introuvable" }, 404);
    if (compte.type_compte !== "cm") {
      return json({ error: "Identifiants réservés aux comptes CM" }, 400);
    }

    const interdit = await refuserSiHorsEquipe(supabase, acces, compte.poster_id);
    if (interdit) return interdit;

    const { error } = await supabase.from("compte_identifiants").upsert(
      {
        compte_id: compteId,
        tiktok_email: emailTiktok,
        tiktok_password: passwordTiktok,
        tiktok_2fa_note: deuxFa || null,
        notes_hm: notesHm || null,
        renseigne_par: acces.userId === "cron" ? null : acces.userId,
        renseigne_at: new Date().toISOString(),
      },
      { onConflict: "compte_id" },
    );
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (body.action === "deplacer_compte") {
    const compteId = String(body.compteId ?? "").trim();
    const destPosterId = String(body.destPosterId ?? "").trim();
    if (!compteId || !destPosterId) {
      return json({ error: "compteId et destPosterId requis" }, 400);
    }

    const { data: compte } = await supabase
      .from("comptes")
      .select("id, poster_id, type_compte, langue")
      .eq("id", compteId)
      .maybeSingle();
    if (!compte) return json({ error: "compte introuvable" }, 404);

    if (compte.poster_id === destPosterId) {
      return json({ ok: true, deja: true, compteId: compte.id, poster_id: destPosterId });
    }

    const interditSource = await refuserSiHorsEquipe(supabase, acces, compte.poster_id);
    if (interditSource) return interditSource;
    const interditDest = await refuserSiHorsEquipe(supabase, acces, destPosterId);
    if (interditDest) return interditDest;

    const { data: roleDest } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", destPosterId)
      .maybeSingle();
    if (roleDest?.role !== "poster") {
      return json({ error: "DEST_PAS_CREATEUR" }, 403);
    }

    if (compte.type_compte === "cm") {
      const { data: conflit } = await supabase
        .from("comptes")
        .select("id")
        .eq("poster_id", destPosterId)
        .eq("type_compte", "cm")
        .eq("langue", compte.langue)
        .eq("is_active", true)
        .maybeSingle();
      if (conflit?.id) return json({ error: "CM_LANGUE_PRISE" }, 409);
    }

    // UPDATE du rattachement seulement — on ne recrée pas le compte.
    const { error: updErr } = await supabase
      .from("comptes")
      .update({ poster_id: destPosterId })
      .eq("id", compteId);
    if (updErr) {
      if (/comptes_cm_un_par_langue/.test(updErr.message)) {
        return json({ error: "CM_LANGUE_PRISE" }, 409);
      }
      return json({ error: updErr.message }, 400);
    }

    const { data: postsCompte } = await supabase
      .from("posts")
      .select("id")
      .eq("compte_id", compteId);
    const postIds = (postsCompte ?? []).map((p) => p.id as string).filter(Boolean);
    if (postIds.length > 0) {
      await supabase.from("reviews").update({ poster_id: destPosterId }).in("post_id", postIds);
    }

    if (compte.langue) await ajouterLangueProfil(supabase, destPosterId, compte.langue);

    return json({
      ok: true,
      compteId: compte.id,
      poster_id: destPosterId,
      depuis: compte.poster_id,
    });
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


/** Recruteur qui embauche dans une langue nouvelle : on l'ajoute à ses
 *  langues gérées + à la fiche Recrutements (carte pays). */
async function etendreLanguesManager(
  supabase: Supabase,
  acces: { userId: string; role: string },
  langue: string,
): Promise<void> {
  if (!estRoleManager(acces.role) || acces.userId === "cron") return;
  const code = langue.trim().toLowerCase();
  if (!code) return;

  const { data: hm } = await supabase
    .from("profiles")
    .select("langues")
    .eq("id", acces.userId)
    .maybeSingle();
  const actuelles = ((hm?.langues as string[] | null) ?? []).map((l) => l.toLowerCase());
  if (!actuelles.includes(code)) {
    await supabase
      .from("profiles")
      .update({ langues: [...actuelles, code] })
      .eq("id", acces.userId);
  }

  const { data: fiche } = await supabase
    .from("recrutement_hms")
    .select("id, pays")
    .eq("profile_id", acces.userId)
    .maybeSingle();
  if (!fiche) return;
  const pays = ((fiche.pays as string[] | null) ?? []).map((p) => p.toLowerCase());
  if (pays.includes(code)) return;
  await supabase
    .from("recrutement_hms")
    .update({ pays: [...pays, code] })
    .eq("id", fiche.id);
}

async function ajouterLangueProfil(
  supabase: Supabase,
  userId: string,
  langue: string,
): Promise<void> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("langues")
    .eq("id", userId)
    .maybeSingle();
  const actuelles = ((prof?.langues as string[] | null) ?? []).map((l) => l.toLowerCase());
  if (actuelles.includes(langue)) return;
  await supabase
    .from("profiles")
    .update({ langues: [...actuelles, langue] })
    .eq("id", userId);
}

async function modeUgcAiVideoPourPoster(
  supabase: Supabase,
  acces: { userId: string; role: string },
  userId: string,
): Promise<boolean> {
  if (estRoleManager(acces.role) && acces.userId !== "cron") {
    return estHmUgcAiVideo(supabase, acces);
  }
  if (acces.role === "admin") {
    const { data: cible } = await supabase
      .from("profiles")
      .select("manager_id")
      .eq("id", userId)
      .maybeSingle();
    if (!cible?.manager_id) return false;
    const { data: hm } = await supabase
      .from("profiles")
      .select("hm_ugc_ai_video")
      .eq("id", cible.manager_id)
      .maybeSingle();
    return Boolean(hm?.hm_ugc_ai_video);
  }
  return false;
}

async function creerComptePersoPourPoster(
  supabase: Supabase,
  acces: { userId: string; role: string },
  userId: string,
  langue: string,
  postsParJourBrut: unknown,
  handleTiktok = "",
  application?: ApplicationRow | null,
  /** Label / répartition imposés par l'admin ; `null` = File puis repli, comme avant. */
  choix: ChoixCompte | null = null,
): Promise<Response> {
  const modeUgcAiVideo = await modeUgcAiVideoPourPoster(supabase, acces, userId);
  if (choix && !choixApplicableAuCompte({ typeCompte: "perso", ugcAiVideo: modeUgcAiVideo })) {
    return json({ error: "CHOIX_COMPTE_INCOMPATIBLE" }, 400);
  }
  let fileItem: FileLabelItem | null = null;
  let fileItemQueue: FileLabelQueued | null = null;
  let personaUgc: PersonaUgcLibre | null = null;
  let partsApplications: PartsApplications | null = null;

  if (modeUgcAiVideo) {
    personaUgc = await personaUgcLibre(supabase, application?.id ?? null);
    if (!personaUgc) return json({ error: "NO_UGC_PERSONA" }, 409);
  } else if (choix) {
    // Choix admin : la File n'est pas touchée, pas de persona UGC.
    const res = await resoudreChoixCompte(supabase, choix, langue);
    if (!res.ok) return res.reponse;
    fileItem = res.fileItem;
    partsApplications = res.parts;
  } else {
    const prep = await preparerFileEtPersona(supabase, langue, application);
    if (!prep.ok) return json({ error: prep.error }, 409);
    fileItem = prep.fileItem;
    fileItemQueue = prep.fileItemQueue;
    personaUgc = prep.personaUgc;
  }

  const referenceId = await referenceLibre(supabase, langue, application?.id ?? null);
  const postsParJour = normaliserPostsParJour(postsParJourBrut);
  const compte = await preparerCompte(
    supabase,
    userId,
    langue,
    referenceId,
    fileItem,
    postsParJour,
    personaUgc,
    fileItemQueue,
    { ugcAiVideo: modeUgcAiVideo, application, partsApplications },
  );
  if (!compte.id) return json({ error: "CREATION_COMPTE_ECHOUEE" }, 500);
  if (handleTiktok) {
    await supabase.from("comptes").update({ handle_tiktok: handleTiktok }).eq("id", compte.id);
  }
  await ajouterLangueProfil(supabase, userId, langue);
  return json({ ok: true, compte });
}

async function creerCompteCmPourPoster(
  supabase: Supabase,
  acces: { userId: string; role: string },
  userId: string,
  langue: string,
  // deno-lint-ignore no-explicit-any
  body: any,
): Promise<Response> {
  const cible = cibleComptePapier(langue);
  const emailTiktok = String(body.tiktok_email ?? "").trim() || cible.email;
  const passwordTiktok = String(body.tiktok_password ?? "") || motDePasseComptePapier();
  const deuxFa = String(body.tiktok_2fa_note ?? "").trim();
  const notesHm = String(body.notes_hm ?? "").trim();
  const handle = String(body.handle_tiktok ?? "").trim().replace(/^@+/, "") || cible.instagram;
  const personaNom = String(body.persona_nom ?? "").trim();

  const { data: deja } = await supabase
    .from("comptes")
    .select("id")
    .eq("poster_id", userId)
    .eq("type_compte", "cm")
    .eq("langue", langue)
    .eq("is_active", true)
    .maybeSingle();
  if (deja?.id) {
    return json({ error: "CM_LANGUE_PRISE", message: `Un compte CM ${langue} existe déjà` }, 409);
  }

  const { data: compte, error } = await supabase
    .from("comptes")
    .insert({
      poster_id: userId,
      type_compte: "cm",
      langue,
      application_id: (await applicationSophia(supabase)).id,
      posts_par_jour: 1,
      warmup_started_at: null,
      warmup_ends_at: null,
      is_active: true,
      ugc_ai: false,
      ugc_ai_video: false,
      ugc_persona_id: null,
      handle_tiktok: handle || null,
      persona_nom: personaNom || null,
    })
    .select("id")
    .single();
  if (error || !compte) {
    const msg = error?.message ?? "CREATION_COMPTE_CM_ECHOUEE";
    if (/comptes_cm_un_par_langue/.test(msg)) {
      return json({ error: "CM_LANGUE_PRISE" }, 409);
    }
    return json({ error: msg }, 400);
  }

  const { error: idErr } = await supabase.from("compte_identifiants").insert({
    compte_id: compte.id,
    tiktok_email: emailTiktok,
    tiktok_password: passwordTiktok,
    tiktok_2fa_note: deuxFa || null,
    notes_hm: notesHm || null,
    renseigne_par: acces.userId === "cron" ? null : acces.userId,
  });
  if (idErr) {
    await supabase.from("comptes").delete().eq("id", compte.id);
    return json({ error: idErr.message }, 400);
  }

  await ajouterLangueProfil(supabase, userId, langue);
  return json({ ok: true, compteId: compte.id });
}

/** Admin : tout. HM : ses créateurs. DM : créateurs des HM de son équipe. */
async function refuserSiHorsEquipe(
  supabase: Supabase,
  acces: { userId: string; role: string },
  posterId: string,
): Promise<Response | null> {
  if (acces.role === "admin" || acces.userId === "cron") return null;

  const { data: cible } = await supabase
    .from("profiles")
    .select("manager_id")
    .eq("id", posterId)
    .maybeSingle();
  if (!cible) return json({ error: "forbidden" }, 403);

  if (cible.manager_id === acces.userId) return null;

  if (acces.role === "directing_manager" && cible.manager_id) {
    const { data: hm } = await supabase
      .from("profiles")
      .select("manager_id")
      .eq("id", cible.manager_id)
      .maybeSingle();
    if (hm?.manager_id === acces.userId) return null;
  }

  return json({ error: "forbidden" }, 403);
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

function normaliserFileLabelItemList(raw: unknown): FileLabelItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it) => {
      const o = (it ?? {}) as { label_id?: string; ugc?: boolean };
      return {
        label_id: String(o.label_id ?? "").trim(),
        ugc: Boolean(o.ugc),
      };
    })
    .filter((it) => it.label_id);
}

/** Normalise `{ items, par_langue }` (+ legacy `label_ids`). */
function normaliserFileLabelsValeur(valeur: unknown): FileLabelsValeur {
  const v = (valeur ?? {}) as {
    items?: Array<{ label_id?: string; ugc?: boolean }>;
    label_ids?: string[];
    par_langue?: Record<string, unknown>;
  };

  let items = normaliserFileLabelItemList(v.items);
  if (items.length === 0) {
    items = (v.label_ids ?? [])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean)
      .map((label_id) => ({ label_id, ugc: false }));
  }

  const par_langue: Record<string, FileLabelItem[]> = {};
  if (v.par_langue && typeof v.par_langue === "object" && !Array.isArray(v.par_langue)) {
    for (const [code, arr] of Object.entries(v.par_langue)) {
      const lang = String(code ?? "").trim().toLowerCase();
      if (!lang) continue;
      const liste = normaliserFileLabelItemList(arr);
      if (liste.length > 0) par_langue[lang] = liste;
    }
  }

  return { items, par_langue };
}

function sliceFileLabels(file: FileLabelsValeur, slug: string): FileLabelsSlice {
  const inner = file.par_application?.[slug];
  if (inner) return { items: inner.items ?? [], par_langue: inner.par_langue ?? {} };
  if (slug === "sophia") return { items: file.items, par_langue: file.par_langue };
  return { items: [], par_langue: {} };
}

function avecSliceApplication(
  file: FileLabelsValeur,
  slug: string,
  slice: FileLabelsSlice,
): FileLabelsValeur {
  const par_application = { ...(file.par_application ?? {}) };
  par_application[slug] = slice;
  if (slug === "sophia") {
    return { items: slice.items, par_langue: slice.par_langue, par_application };
  }
  return { items: file.items, par_langue: file.par_langue, par_application };
}

async function ecrireFileLabels(
  supabase: Supabase,
  file: FileLabelsValeur,
): Promise<void> {
  const par_langue: Record<string, FileLabelItem[]> = {};
  for (const [code, liste] of Object.entries(file.par_langue)) {
    if (liste.length > 0) par_langue[code] = liste;
  }
  const par_application: Record<string, FileLabelsSlice> = {};
  for (const [slug, slice] of Object.entries(file.par_application ?? {})) {
    par_application[slug] = {
      items: slice.items ?? [],
      par_langue: slice.par_langue ?? {},
    };
  }
  await supabase.from("reglages").upsert(
    {
      cle: "file_labels_comptes",
      valeur: { items: file.items, par_langue, par_application },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cle" },
  );
}

/**
 * Labels slideshow (ni système ni UGC AI VIDEO), filtrés par la colonne
 * historique `labels.application_id` quand `applicationId` est fourni.
 *
 * Une lecture ratée LÈVE. Elle rendait un ensemble vide, que `popLabelFile`
 * passait à `consommerFileSlideshow` : toute entrée absente de l'ensemble y
 * est sautée, donc RETIRÉE de la File — une erreur réseau vidait la File des
 * créateurs en silence. Lue avant toute écriture de la File : rien n'est perdu.
 */
async function idsLabelsFileSlideshow(
  supabase: Supabase,
  applicationId?: string | null,
): Promise<Set<string>> {
  let q = supabase.from("labels").select("id, slug, nom, ugc_ai_video");
  if (applicationId) q = q.eq("application_id", applicationId);
  const { data, error } = await q;
  if (error) throw new Error(`Labels slideshow : ${error.message}`);
  return new Set(
    (data ?? [])
      .filter((l) => estLabelFileSlideshow(l))
      .map((l) => l.id as string)
      .filter(Boolean),
  );
}

/** Rejette Hook / marque UGC AI VIDEO (et, hors compte vidéo, tout label ugc_ai_video). */
async function filtrerLabelsCompte(
  supabase: Supabase,
  labelIds: string[],
  opts: { ugcAiVideo?: boolean } = {},
): Promise<string[]> {
  const ids = [...new Set(labelIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("labels")
    .select("id, slug, nom, ugc_ai_video")
    .in("id", ids);
  const byId = new Map((data ?? []).map((l) => [l.id as string, l]));
  const out: string[] = [];
  for (const id of ids) {
    const lab = byId.get(id);
    if (!lab || estLabelInterditCompte(lab)) continue;
    if (!opts.ugcAiVideo && !estLabelFileSlideshow(lab)) continue;
    out.push(id);
  }
  return out;
}

/**
 * Tire la première entrée slideshow (FIFO) :
 *   1) file de la langue (surpasse la générale)
 *   2) sinon file générale
 *   3) sinon label classique le moins utilisé (ne consomme pas les files)
 * Les labels UGC AI VIDEO / système en tête sont sautés (retirés, pas assignés).
 */
async function popLabelFile(
  supabase: Supabase,
  langue: string,
  application?: ApplicationRow | null,
): Promise<
  | { ok: true; item: FileLabelItem; fromQueue: false }
  | { ok: true; item: FileLabelItem; fromQueue: true; queueKey: string }
  | { ok: false; error: string }
> {
  const { data } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "file_labels_comptes")
    .maybeSingle();
  const file = normaliserFileLabelsValeur(data?.valeur);
  const slug = application?.slug ?? "sophia";
  const slice = sliceFileLabels(file, slug);
  const lang = String(langue ?? "").trim().toLowerCase();
  const eligible = await idsLabelsFileSlideshow(supabase, application?.id ?? null);

  let parLangueActuel = { ...slice.par_langue };
  const fileLangue = lang ? (parLangueActuel[lang] ?? []) : [];
  const languePop = consommerFileSlideshow(fileLangue, eligible);
  if (languePop.skipped.length > 0 || languePop.item) {
    parLangueActuel = { ...parLangueActuel, [lang]: languePop.rest };
    if (languePop.rest.length === 0) delete parLangueActuel[lang];
    await ecrireFileLabels(
      supabase,
      avecSliceApplication(file, slug, { items: slice.items, par_langue: parLangueActuel }),
    );
  }
  if (languePop.item) {
    const ok = await filtrerLabelsCompte(supabase, [languePop.item.label_id]);
    if (ok[0]) {
      return { ok: true, item: languePop.item, fromQueue: true, queueKey: lang };
    }
  }

  const generalPop = consommerFileSlideshow(slice.items, eligible);
  if (generalPop.skipped.length > 0 || generalPop.item) {
    await ecrireFileLabels(
      supabase,
      avecSliceApplication(file, slug, {
        items: generalPop.rest,
        par_langue: parLangueActuel,
      }),
    );
  }
  if (generalPop.item) {
    const ok = await filtrerLabelsCompte(supabase, [generalPop.item.label_id]);
    if (ok[0]) {
      return { ok: true, item: generalPop.item, fromQueue: true, queueKey: "general" };
    }
  }

  const labelId = await labelMoinsUtiliseParLangue(supabase, langue, {
    ugcOnly: false,
    applicationId: application?.id ?? null,
  });
  if (!labelId) return { ok: false, error: "NO_LABELS" };
  const ok = await filtrerLabelsCompte(supabase, [labelId]);
  if (!ok[0]) return { ok: false, error: "NO_LABELS" };
  return { ok: true, item: { label_id: ok[0], ugc: false }, fromQueue: false };
}

/**
 * Le DM du créateur, quand il en faut un pour rattacher le recruteur créé.
 *
 * Lecture évitée pour les rôles qui n'en ont pas l'usage : `rattachementNouvelHm`
 * ignore cette valeur pour l'admin (aucun rattachement) et pour le DM (qui se
 * rattache lui-même), inutile de payer une requête pour la jeter.
 */
async function managerDe(
  supabase: ReturnType<typeof serviceClient>,
  acces: { userId: string; role: string },
): Promise<string | null> {
  if (acces.userId === "cron") return null;
  if (acces.role !== "hiring_manager" && acces.role !== "head_of_ops") return null;
  const { data } = await supabase
    .from("profiles")
    .select("manager_id")
    .eq("id", acces.userId)
    .maybeSingle();
  return (data?.manager_id as string | null) ?? null;
}

/** Hiring manager marqué UGC AI VIDEO (ses créateurs = marque vidéo + labels HM). */
async function estHmUgcAiVideo(
  supabase: Supabase,
  acces: { role: string; userId: string },
): Promise<boolean> {
  if (!estRoleManager(acces.role) || acces.userId === "cron") return false;
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
  // Ne garder que les labels du pool UGC AI VIDEO, hors Hook / marque système.
  const { data: ok } = await supabase
    .from("labels")
    .select("id, slug, nom, ugc_ai_video")
    .in("id", labelIds)
    .eq("ugc_ai_video", true);
  const valides = (ok ?? [])
    .filter((r) => !estLabelSysteme(r))
    .map((r) => r.id as string);
  if (valides.length === 0) return;
  await supabase.from("hm_ugc_video_labels").insert(
    valides.map((label_id) => ({ profile_id: profileId, label_id })),
  );
}

/** Labels thématiques du HM (pas la marque système — c’est un checkmark compte). */
async function labelsPourCreateurUgcVideo(
  supabase: Supabase,
  posterId: string,
): Promise<string[]> {
  const ids = new Set<string>();

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

  return filtrerLabelsCompte(supabase, [...ids], { ugcAiVideo: true });
}

/**
 * Consomme la file admin (langue > générale) + persona UGC si besoin.
 * `fileItemQueue` = entrée exacte à remettre dans LA MÊME file en cas d'échec.
 */
async function preparerFileEtPersona(
  supabase: Supabase,
  langue: string,
  application?: ApplicationRow | null,
): Promise<
  | {
    ok: true;
    fileItem: FileLabelItem;
    fileItemQueue: FileLabelQueued | null;
    personaUgc: PersonaUgcLibre | null;
  }
  | { ok: false; error: string }
> {
  const popped = await popLabelFile(supabase, langue, application);
  if (!popped.ok) return { ok: false, error: popped.error };

  let fileItem = popped.item;
  const fileItemQueue: FileLabelQueued | null = popped.fromQueue
    ? {
      item: { ...popped.item },
      queueKey: popped.queueKey,
      applicationSlug: application?.slug,
    }
    : null;
  const autorises = await filtrerLabelsCompte(supabase, [fileItem.label_id]);
  if (!autorises[0]) {
    return { ok: false, error: "NO_LABELS" };
  }
  fileItem = { ...fileItem, label_id: autorises[0] };
  let personaUgc: PersonaUgcLibre | null = null;

  if (fileItem.ugc) {
    const labelOk = await labelADesContenusUgc(supabase, fileItem.label_id);
    if (!labelOk) {
      let fallback: string | null;
      try {
        fallback = await labelMoinsUtiliseParLangue(supabase, langue, {
          ugcOnly: true,
          applicationId: application?.id ?? null,
        });
      } catch (error) {
        // Lecture ratée : l'entrée tirée de la file y retourne avant l'erreur.
        if (fileItemQueue) await unshiftLabelFile(supabase, fileItemQueue);
        throw error;
      }
      if (!fallback) {
        if (fileItemQueue) await unshiftLabelFile(supabase, fileItemQueue);
        return { ok: false, error: "NO_UGC_LABEL" };
      }
      const okFallback = await filtrerLabelsCompte(supabase, [fallback]);
      if (!okFallback[0]) {
        if (fileItemQueue) await unshiftLabelFile(supabase, fileItemQueue);
        return { ok: false, error: "NO_UGC_LABEL" };
      }
      fileItem = { label_id: okFallback[0], ugc: true };
    }
    personaUgc = await personaUgcLibre(supabase, application?.id ?? null);
    if (!personaUgc) {
      if (fileItemQueue) await unshiftLabelFile(supabase, fileItemQueue);
      return { ok: false, error: "NO_UGC_PERSONA" };
    }
  }

  return { ok: true, fileItem, fileItemQueue, personaUgc };
}

/**
 * Choix admin (label et/ou répartition) → entrée de label du compte, SANS
 * toucher à la File des créateurs. Tout est lu et vérifié avant la moindre
 * écriture ; une lecture ratée lève (500), un refus rend la réponse à renvoyer.
 *
 *   - `label_id` fourni : ce label, s'il est slideshow et sert toutes les
 *     applications à part > 0 (sinon LABEL_INCOMPATIBLE) ;
 *   - sinon : le moins utilisé dans la langue parmi les labels slideshow qui
 *     servent toutes ces applications (aucun → NO_LABELS_APPLICATION).
 *
 * `ugc: false` dans les deux cas : pas de persona UGC, l'identité (genre,
 * thème, avatar) suit le label comme pour tout compte classique.
 */
async function resoudreChoixCompte(
  supabase: Supabase,
  choix: ChoixCompte,
  langue: string,
): Promise<
  | { ok: true; fileItem: FileLabelItem; parts: PartsApplications | null }
  | { ok: false; reponse: Response }
> {
  let parts: PartsApplications | null = null;
  let requises: string[] = [];
  if (choix.partsBrutes !== null) {
    const { data: apps, error } = await supabase.from("applications").select("id, slug");
    if (error) throw new Error(`Applications : ${error.message}`);
    const liste = (apps ?? []) as { id: string; slug: string }[];
    parts = validerParts(choix.partsBrutes, liste.map((a) => a.slug));
    if (!parts) return { ok: false, reponse: json({ error: "REPARTITION_INVALIDE" }, 400) };
    requises = applicationsRequises(parts, liste);
  }

  if (choix.labelId) {
    const { data: label, error } = await supabase
      .from("labels")
      .select("id, slug, nom, ugc_ai_video")
      .eq("id", choix.labelId)
      .maybeSingle();
    if (error) throw new Error(`Label choisi : ${error.message}`);
    const { data: liens, error: errLiens } = await supabase
      .from("label_applications")
      .select("label_id, application_id")
      .eq("label_id", choix.labelId);
    if (errLiens) throw new Error(`Applications du label choisi : ${errLiens.message}`);
    if (!label || !labelChoisiCompatible(label, liens ?? [], requises)) {
      return { ok: false, reponse: json({ error: "LABEL_INCOMPATIBLE" }, 400) };
    }
    return { ok: true, fileItem: { label_id: label.id as string, ugc: false }, parts };
  }

  const labelId = await labelMoinsUtiliseParLangue(supabase, langue, {
    ugcOnly: false,
    applicationsRequises: requises,
  });
  const autorise = labelId ? (await filtrerLabelsCompte(supabase, [labelId]))[0] : undefined;
  if (!autorise) return { ok: false, reponse: json({ error: "NO_LABELS_APPLICATION" }, 409) };
  return { ok: true, fileItem: { label_id: autorise, ugc: false }, parts };
}

/**
 * Label avec le moins de comptes actifs dans la langue (ou global si langue
 * vide), parmi ceux qui servent l'application (`label_applications`).
 *
 * `applicationsRequises` (répartition choisie par l'admin) : le label doit
 * servir TOUTES ces applications, et seul `label_applications` en décide — la
 * colonne historique `labels.application_id` n'est alors plus lue. Absent ou
 * vide : comportement historique, à l'identique.
 */
async function labelMoinsUtiliseParLangue(
  supabase: Supabase,
  langue: string,
  opts: {
    ugcOnly: boolean;
    applicationId?: string | null;
    applicationsRequises?: readonly string[];
  },
): Promise<string | null> {
  const requises = opts.applicationsRequises?.length ? opts.applicationsRequises : null;
  let pool: string[] = [];
  if (opts.ugcOnly) {
    const ugc = await labelIdsAvecContenusUgc(supabase, opts.applicationId);
    const slideshow = await idsLabelsFileSlideshow(supabase, opts.applicationId);
    pool = ugc.filter((id) => slideshow.has(id));
  } else {
    pool = [...await idsLabelsFileSlideshow(supabase, requises ? null : opts.applicationId)];
  }
  if (requises) {
    // Une application après l'autre : le pool rétrécit à chaque passe et ne
    // garde que les labels qui les servent toutes (héritage Sophia compris).
    for (const app of requises) {
      pool = await filtrerPoolParApplication(supabase, pool, app);
    }
  } else {
    // `labels.application_id` vaut Sophia pour tout label créé depuis l'OS, même
    // « Unswipe seul » : seul `label_applications` dit qui le label sert.
    pool = await filtrerPoolParApplication(supabase, pool, opts.applicationId);
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

/**
 * Labels qui ont au moins un slideshow UGC.
 *
 * On ne lit plus toute la table de liaison pour n'en garder qu'un ensemble de
 * `label_id`. `contenu_labels` compte 3369 liens et la part UGC peut franchir
 * le plafond PostgREST : tronquée, la lecture aurait fait DISPARAÎTRE de la
 * file d'assignation UGC un label peu fourni, dominé dans les 1000 premières
 * lignes par alpha_male et smart_girl. Un label absent ne produit pas d'erreur,
 * il produit des créateurs qui ne reçoivent plus rien — une absence, donc
 * invisible.
 *
 * La sortie n'est pas une pagination mais une reformulation : la question
 * posée est « ce label a-t-il au moins un contenu UGC ? », et elle se répond
 * label par label avec un `.limit(1)`, sans jamais rapatrier l'inventaire.
 * Les labels sont une poignée. Même forme que `labelADesContenusUgc` juste
 * en dessous, qui la posait déjà correctement.
 *
 * L'erreur est désormais RELUE : elle était ignorée, et une requête ratée
 * rendait « aucun label UGC », c'est-à-dire le pool vide du 20/08.
 */
async function labelIdsAvecContenusUgc(
  supabase: Supabase,
  applicationId?: string | null,
): Promise<string[]> {
  const labels = await lireTout<{ id: string }>(
    "Labels",
    (curseur, taille) => {
      let q = supabase.from("labels").select("id");
      if (curseur) q = q.gt("id", curseur.id);
      return q.order("id", { ascending: true }).limit(taille);
    },
    { ancre: (l) => l.id },
  );

  const out: string[] = [];
  for (const label of labels) {
    let q = supabase
      .from("contenu_labels")
      .select("contenu_id, contenus!inner(ugc_compatible, application_id)")
      .eq("label_id", label.id)
      .eq("contenus.ugc_compatible", true);
    if (applicationId) q = q.eq("contenus.application_id", applicationId);
    const { data, error } = await q.limit(1);
    if (error) throw new Error(`Labels avec contenus UGC (${label.id}) : ${error.message}`);
    if ((data?.length ?? 0) > 0) out.push(label.id);
  }
  return out;
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

/** Remet une entrée en tête de la file d’où elle a été tirée (langue ou générale). */
async function unshiftLabelFile(
  supabase: Supabase,
  queued: FileLabelQueued,
): Promise<void> {
  const { data } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "file_labels_comptes")
    .maybeSingle();
  const file = normaliserFileLabelsValeur(data?.valeur);
  const slug = queued.applicationSlug ?? "sophia";
  const slice = sliceFileLabels(file, slug);
  const key = String(queued.queueKey ?? "general").trim().toLowerCase() || "general";

  const next: FileLabelsSlice = key === "general"
    ? { items: [queued.item, ...slice.items], par_langue: slice.par_langue }
    : {
      items: slice.items,
      par_langue: { ...slice.par_langue, [key]: [queued.item, ...(slice.par_langue[key] ?? [])] },
    };
  await ecrireFileLabels(supabase, avecSliceApplication(file, slug, next));
}

async function personaUgcLibre(
  supabase: Supabase,
  applicationId?: string | null,
): Promise<PersonaUgcLibre | null> {
  let q = supabase.from("ugc_personas").select("id, nom, image_face_url, image_profile_url");
  if (applicationId) q = q.eq("application_id", applicationId);
  const { data: personas } = await q;
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
 * UGC AI VIDEO : ugc_ai_video + persona + labels HM (thématiques).
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
  fileItemQueue: FileLabelQueued | null = null,
  opts: {
    ugcAiVideo?: boolean;
    application?: ApplicationRow | null;
    /** Répartition choisie par l'admin ; absente = clé omise de l'insert (NULL en base). */
    partsApplications?: PartsApplications | null;
  } = {},
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
  const labelIdSlideshow = !ugcAiVideo && fileItem?.label_id
    ? (await filtrerLabelsCompte(supabase, [fileItem.label_id]))[0] ?? null
    : null;
  const labelId = ugcAiVideo
    ? (labelIdsVideo[0] ?? null)
    : labelIdSlideshow;
  const aRestaurer = ugcAiVideo ? null : fileItemQueue;

  const { data: compte, error } = await supabase
    .from("comptes")
    .insert({
      poster_id: posterId,
      type_compte: "perso",
      compte_reference_id: referenceId,
      langue,
      application_id: opts.application?.id ?? (await applicationSophia(supabase)).id,
      posts_par_jour: postsParJour,
      warmup_started_at: null,
      warmup_ends_at: null,
      is_active: true,
      ugc_ai: ugc,
      ugc_ai_video: ugcAiVideo,
      ugc_persona_id: avecPersona ? personaUgc!.id : null,
      persona_nom: avecPersona ? personaUgc!.nom.trim() : null,
      ...(opts.partsApplications ? { parts_applications: opts.partsApplications } : {}),
    })
    .select("id")
    .single();
  if (error || !compte) {
    if (aRestaurer) await unshiftLabelFile(supabase, aRestaurer);
    return {
      id: "",
      reference: referenceId,
      persona: false,
      labelId,
      ugc,
      ugc_ai_video: ugcAiVideo,
    };
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
  applicationId?: string | null,
): Promise<string | null> {
  let q = supabase
    .from("comptes_reference")
    .select("id, langue, ordre_assignation, ordre_par_langue, created_at")
    .eq("is_active", true)
    .is("parent_id", null);
  if (applicationId) q = q.eq("application_id", applicationId);
  const { data: refs } = await q;
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
