import { appliquerIdentiteInstantanee } from "../_shared/persona.ts";
import { assertRole, json, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;
const DOMAINE = "sophia.com";

/**
 * Gestion des posters. Créer un compte avec mot de passe exige le service_role,
 * donc ça vit ici et jamais dans le navigateur.
 *
 * Deux appelants : l'admin, et le HIRING MANAGER (dont c'est le seul pouvoir).
 * Le hiring manager peut créer un poster mais pas en supprimer.
 *
 *   { action: "create", prenom, nom, password, langue?, langues?, role? }
 *   { action: "delete", userId }        (admin uniquement)
 *
 * - Poster : si `langue` est fournie, rattache un compte de référence libre
 *   de cette langue + identité instantanée.
 * - Hiring manager : `langues` (tableau) = langues dans lesquelles il peut
 *   recruter (plusieurs OK). `langue` seule reste acceptée (rétrocompat).
 */
Deno.serve(async (request) => {
  const acces = await assertRole(request, ["admin", "hiring_manager"]);
  if (acces instanceof Response) return acces;

  const supabase = serviceClient();

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "corps JSON attendu" }, 400);
  }

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
    // Rôle voulu : "poster" (défaut) ou "hiring_manager". Seul l'admin peut
    // créer un recruteur ; un recruteur ne crée que des posters.
    const roleVoulu =
      body.role === "hiring_manager" && acces.role === "admin" ? "hiring_manager" : "poster";

    if (!prenom || password.length < 8) {
      return json({ error: "Prénom requis et mot de passe d'au moins 8 caractères" }, 400);
    }

    // HM qui crée un poster : la langue doit être dans SES langues gérées.
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

    // Un poster occupe UN compte de référence LIBRE de sa langue (1 poster =
    // 1 source). S'il n'y en a plus, on n'ouvre aucun accès et on le dit tout de
    // suite — AVANT de créer quoi que ce soit. Le front affiche « plus de
    // créateurs possibles dans cette langue ».
    let referenceId: string | null = null;
    if (roleVoulu === "poster" && langue) {
      referenceId = await referenceLibre(supabase, langue);
      if (!referenceId) return json({ error: "NO_FREE_REFERENCE" }, 409);
    }

    const email = await emailDisponible(supabase, prenom, nom);

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { prenom },
    });

    if (error) {
      // `error.message` remonte parfois vide sur l'API admin : sans le code ni
      // le statut, le message affiché à l'admin est inexploitable.
      const detail = [error.message, error.code, error.status].filter(Boolean).join(" · ");
      return json({ error: detail || `Création refusée pour ${email}` }, 400);
    }

    // Le trigger a posé le profil et le rôle poster. On complète l'état civil
    // et on active le compte : c'est un accès validé de vive voix.
    if (data.user) {
      await supabase
        .from("profiles")
        // Pas de changement de mot de passe imposé : le mot de passe reste
        // 12345678 pour tout le monde, c'est un choix assumé sur un outil
        // interne où l'admin dicte les accès de vive voix.
        .update({ prenom, nom: nom || null, is_active: true, must_change_password: false })
        .eq("id", data.user.id);

      if (roleVoulu === "hiring_manager") {
        // Recruteur : rôle hiring_manager + ensemble de langues gérées
        // (plusieurs OK → créateurs de langues différentes sous le même HM).
        await supabase.from("user_roles").delete().eq("user_id", data.user.id);
        await supabase.from("user_roles").insert({ user_id: data.user.id, role: "hiring_manager" });
        const ensemble = [...new Set(languesRecues.length > 0 ? languesRecues : (langue ? [langue] : []))];
        if (ensemble.length > 0) {
          await supabase
            .from("profiles")
            .update({ nationalite: ensemble[0], langues: ensemble })
            .eq("id", data.user.id);
        }
      } else if (acces.role === "hiring_manager" && acces.userId !== "cron") {
        // Poster créé par un recruteur : on mémorise qui le gère, pour le grouper
        // sous son recruteur dans la vue admin.
        await supabase
          .from("profiles")
          .update({ manager_id: acces.userId })
          .eq("id", data.user.id);
      }
    }

    // Compte de publication (posters seulement, avec langue) : identité posée
    // INSTANTANÉMENT et de façon déterministe (pseudo + nom + bio + avatar), sans
    // aucun appel Gemini. La création reste sous la seconde et l'identité est
    // TOUJOURS remplie — fini le « identité en cours » qui traîne.
    let compte: { id: string; reference: string | null; persona: boolean } | null = null;
    if (data.user && roleVoulu === "poster" && langue) {
      compte = await preparerCompte(supabase, data.user.id, langue, referenceId);
    }

    return json({ ok: true, userId: data.user?.id, email, compte, role: roleVoulu });
  }

  if (body.action === "delete") {
    if (!body.userId) return json({ error: "userId requis" }, 400);
    // L'admin supprime n'importe qui ; le hiring manager, SEULEMENT ses propres
    // créateurs (profiles.manager_id = lui). La suppression de l'utilisateur
    // casacade sur profil → compte → et LIBÈRE ainsi son compte de référence
    // (referenceLibre ne le voit plus pris) : il redevient dispo pour un futur poster.
    if (acces.role !== "admin") {
      const { data: cible } = await supabase
        .from("profiles")
        .select("manager_id")
        .eq("id", body.userId)
        .single();
      if (!cible || cible.manager_id !== acces.userId) return json({ error: "forbidden" }, 403);
    }
    // Supprimer un RECRUTEUR ne doit JAMAIS supprimer ses créateurs : on les
    // détache d'abord (manager_id → null) pour qu'ils rejoignent « Sans recruteur ».
    // (Le FK est déjà `on delete set null`, mais on l'explicite pour être sûr.)
    await supabase
      .from("profiles")
      .update({ manager_id: null })
      .eq("manager_id", body.userId);

    // On NE passe PAS par auth.admin.deleteUser : depuis la migration du projet
    // vers des clés JWT ES256, GoTrue rejette la suppression d'un utilisateur
    // réel (« unrecognized JWT kid <nil> »). On supprime la ligne auth.users en
    // SQL (RPC SECURITY DEFINER), ce qui cascade sur profiles → comptes et libère
    // le compte de référence.
    const { error } = await supabase.rpc("supprimer_auth_user", { uid: body.userId });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "action inconnue" }, 400);
});

/** Retire accents et caractères parasites : un email doit rester saisissable. */
function normaliser(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * `prenom` collé à la première lettre du nom, puis `@domaine` — sans aucun
 * séparateur : `Test Poster` donne `testp@sophia.com`. `normaliser` retire
 * accents et ponctuation, un `+` ou un point ne peut donc pas s'y glisser.
 *
 * Suffixé d'un numéro si l'adresse est déjà prise : deux homonymes ne doivent
 * pas se bloquer mutuellement.
 */
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

/**
 * Prépare le compte de publication d'un poster tout juste créé : rattache un
 * compte de référence de la bonne langue et génère la persona via l'IA.
 *
 * Best-effort : si aucun compte de référence n'existe pour la langue, on crée
 * quand même le compte (référence nulle) ; si la persona échoue, le compte
 * existe et l'admin pourra la (re)générer. On ne bloque jamais la création du
 * poster pour un aléa d'automatisation.
 */
async function preparerCompte(
  supabase: Supabase,
  posterId: string,
  langue: string,
  referenceId: string | null,
): Promise<{ id: string; reference: string | null; persona: boolean }> {
  const { data: compte, error } = await supabase
    .from("comptes")
    .insert({ poster_id: posterId, compte_reference_id: referenceId, langue })
    .select("id")
    .single();
  if (error || !compte) {
    return { id: "", reference: referenceId, persona: false };
  }

  // Identité posée immédiatement, sans Gemini : sous la seconde, et toujours
  // remplie. Un enrichissement IA (bio/pseudo plus travaillés) reste possible à
  // la demande via la fonction `persona`, mais il ne bloque pas la création.
  const { applique } = await appliquerIdentiteInstantanee(supabase, compte.id);
  return { id: compte.id, reference: referenceId, persona: applique };
}

/**
 * Choisit une source de référence pour un poster de la langue demandée.
 *
 * Une même source est REPIOCHABLE une fois PAR LANGUE : son contenu est traduit
 * vers la langue du poster, donc une source anglaise peut nourrir à la fois un
 * poster EN, un poster DE, un poster FR… mais UN SEUL par langue. On exclut donc
 * uniquement les sources déjà prises par un compte de CETTE langue ; la langue
 * propre de la source n'entre pas en compte (sauf comme préférence : à qualité
 * égale on prend une source native pour éviter une traduction). Renvoie null
 * seulement si TOUTES les sources sont déjà prises dans cette langue.
 */
async function referenceLibre(
  supabase: Supabase,
  langue: string,
): Promise<string | null> {
  // Seuls les comptes PRINCIPAUX (parent_id null) sont assignables à un poster ;
  // les conjoints ne font qu'élargir la matière de leur principal. Triés par
  // ORDRE D'ASSIGNATION (défini par l'admin) : c'est lui qui décide qui vient
  // ensuite, par langue.
  const { data: refs } = await supabase
    .from("comptes_reference")
    .select("id, langue, ordre_assignation, ordre_par_langue, created_at")
    .eq("is_active", true)
    .is("parent_id", null);
  if (!refs || refs.length === 0) return null;

  // Sources déjà attribuées à un poster DE LA MÊME LANGUE (les seules à exclure).
  const { data: comptes } = await supabase
    .from("comptes")
    .select("compte_reference_id")
    .eq("langue", langue)
    .not("compte_reference_id", "is", null);
  const prisDansCetteLangue = new Set((comptes ?? []).map((c) => c.compte_reference_id));

  const libres = refs.filter((r) => !prisDansCetteLangue.has(r.id));
  if (libres.length === 0) return null;

  // Ordre PROPRE À CETTE LANGUE (l'admin range chaque langue à part), repli sur
  // l'ordre global puis la date. On prend la première libre.
  // deno-lint-ignore no-explicit-any
  const rang = (r: any) =>
    (r.ordre_par_langue?.[langue] as number | undefined) ?? r.ordre_assignation ?? 9999;
  libres.sort((a, b) => rang(a) - rang(b) || String(a.created_at).localeCompare(String(b.created_at)));
  return libres[0].id;
}

