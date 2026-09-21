import {
  assignerTousComptes,
  kickAssignationDrain,
  programmerRappelsJ7,
  type AssignationCompteResultat,
} from "../_shared/assignation_contenu.ts";
import { scrapeStats } from "../_shared/apify.ts";
import {
  kickRattrapageElo,
  rattrapageElo,
  snapshotVuesGlobales,
} from "../_shared/rattrapage_elo.ts";
import { majScoresDepuisPassages } from "../_shared/scoring.ts";
import { requalifierClassementComptes } from "../_shared/classement_comptes.ts";
import { lireTout } from "../_shared/lots.ts";
import {
  blocRunTierlist,
  reporterBlocTierlist,
  requalifierContenus,
  type RequalificationResultat,
} from "../_shared/tierlist.ts";
import {
  kickUpscaleAssignes,
  listerMediasAssignesNonUpscales,
} from "../_shared/upscale_media_core.ts";
import { avancerVariations } from "../_shared/variations.ts";
import {
  assertAuthorised,
  aujourdhuiParis,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

const POSTS_RELEVES = 30;

/**
 * Valeur courante de `reglages.minuit_dernier_run`, ou `null` si la clé n'a
 * jamais été écrite.
 *
 * LÈVE quand la lecture échoue, au lieu de rendre `null`. C'est la même
 * confusion « échec vs vide » que celle du 20/08, transposée à une écriture
 * DESTRUCTRICE : les deux appelants ci-dessous enchaînent sur un upsert qui
 * reconstruit la valeur de zéro. Un 502 PostgREST ou un timeout rendait `null`,
 * indiscernable de « pas de run aujourd'hui » ; on repartait donc d'un objet
 * vide, et le bloc `tierlist` plus les compteurs cumulés du drain étaient
 * effacés sur la foi d'une requête ratée. Un journal qui manque se rattrape au
 * run suivant, un journal faux ne se rattrape jamais.
 */
async function lireDernierRun(
  supabase: Supabase,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "minuit_dernier_run")
    .maybeSingle();
  if (error) {
    throw new Error(
      `lecture de reglages.minuit_dernier_run : ${messageErreur(error)} — ` +
        `report abandonné plutôt qu'écrasement de la valeur du jour.`,
    );
  }
  const v = data?.valeur;
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/**
 * Compose le champ `avertissement` persisté dans `reglages.minuit_dernier_run`.
 *
 * L'admin ne lit QUE ce champ (`lireMinuitDernierRun`, src/features/moteur/api.ts) :
 * une alerte de cohérence rangée dans le bloc `tierlist` est écrite en base mais
 * n'atteint personne sans requête SQL — sur le chemin cron, la réponse HTTP qui
 * la porte part à pg_cron, qui la jette. On la recompose donc À PARTIR DES
 * SOURCES (bloc tierlist, quotas baissés, incidents d'étapes) à chaque écriture,
 * plutôt que de concaténer la chaîne déjà en base : le drain d'assignation
 * réécrit cette valeur à chaque lot, et une concaténation aveugle répéterait la
 * même alerte huit fois de suite. Recomposer depuis les sources rend l'écriture
 * idempotente ; le dédoublonnage ne couvre que le cas où deux appelants
 * fournissent le même texte dans le même run.
 *
 * Le dédoublonnage porte sur la partie ENTIÈRE, sans redécouper sur « · » : ce
 * séparateur sert aussi À L'INTÉRIEUR de la ligne quotas, et la redécouper
 * fusionnerait deux créateurs affichés à l'identique — « Lowered quota (3) »
 * suivi de deux noms seulement.
 *
 * Jumeau volontaire de celui de `assignation/index.ts` : les deux fonctions Edge
 * ne partagent que `_shared/`, et ce détail de présentation n'y a pas sa place.
 */
function composerAvertissement(
  ...parties: Array<string | null | undefined>
): string | null {
  const vus = new Set<string>();
  for (const partie of parties) {
    const texte = typeof partie === "string" ? partie.trim() : "";
    if (texte) vus.add(texte);
  }
  return vus.size > 0 ? [...vus].join(" · ") : null;
}

/**
 * Ajoute un avertissement à la réponse sans écraser ceux déjà posés.
 *
 * Substituer reviendrait à effacer la cause pour ne garder que le symptôme :
 * une lecture tronquée signalée par la tierlist explique peut-être la baisse de
 * quota que l'assignation annonce dix lignes plus bas.
 */
function ajouterAvertissement(out: Record<string, unknown>, texte: string): void {
  const compose = composerAvertissement(out.avertissement as string | undefined, texte);
  if (compose) out.avertissement = compose;
}

/** Ce que les étapes isolées rapportent au moment de choisir le statut HTTP. */
interface BilanEtapes {
  reussies: number;
  echecs: string[];
}

/**
 * Exécute une étape en l'ISOLANT des suivantes.
 *
 * C'est LA décision de ce chantier. Le garde-fou de complétude
 * (`_shared/supabase.ts`) transforme les troncatures muettes en EXCEPTIONS :
 * c'est voulu, mais dans un seul `try` global ça ne répare rien, ça déplace la
 * panne. Les étapes s'enchaînent rattrapage → tierlist → assignation → upscale
 * → variations, et `kickAssignationDrain` vit DANS l'étape assignation : une
 * exception levée par une étape d'OBSERVABILITÉ en amont emportait avec elle la
 * seule chose qui remplit la journée de 131 comptes. Résultat mesuré : 500, zéro
 * post au réveil, et le cron de 4 h qui rejoue le même scénario à l'identique.
 * On répare une famine silencieuse — hors de question d'en créer une franche.
 *
 * Une étape qui lève pose donc son erreur dans le résultat, la crie dans les
 * logs (le seul endroit que pg_cron ne jette pas), la remonte dans
 * `avertissement` (le seul champ que l'admin lit), et laisse les suivantes
 * tourner.
 */
async function executerEtape(
  out: Record<string, unknown>,
  bilan: BilanEtapes,
  nom: string,
  travail: () => Promise<void>,
): Promise<boolean> {
  try {
    await travail();
    bilan.reussies += 1;
    return true;
  } catch (error) {
    const erreur = messageErreur(error);
    // Un résultat partiel déjà posé sous cette clé est conservé : il dit
    // jusqu'où l'étape était allée avant de lever.
    const partiel = out[nom];
    out[nom] = {
      ok: false,
      erreur,
      ...(partiel !== undefined ? { partiel } : {}),
    };
    bilan.echecs.push(nom);
    console.error(`[minuit] étape ${nom} en échec — ${erreur}`);
    ajouterAvertissement(out, `étape ${nom} en échec : ${erreur}`);
    return false;
  }
}

/**
 * Persiste le résultat de la requalification dans `reglages.minuit_dernier_run`.
 *
 * POURQUOI ici et pas ailleurs : le seul upsert existant de cette clé est
 * enfermé dans la branche `if (compteId)` de l'étape assignation. Un run cron
 * complet — celui de minuit, celui qui compte — ne l'écrit donc JAMAIS : il se
 * contente de kicker le drain. Les compteurs de la tierlist ne vivaient nulle
 * part, et c'est ce silence qui a laissé la troncature tourner des semaines
 * avec un « 1000 examinés » rassurant dans une réponse HTTP que personne ne lit.
 *
 * On conserve l'existant du jour au lieu de rebâtir l'objet : le bloc écrit ici
 * arrive AVANT l'assignation, dont les écritures reconstruisent la valeur de
 * zéro. Le sens de la relation est donc symétrique — elles reportent notre bloc
 * (`reporterBlocTierlist`), nous préservons le leur.
 *
 * Un jour différent repart à neuf : `minuit_dernier_run` décrit le run du jour.
 *
 * Si la relecture échoue, `lireDernierRun` LÈVE et on n'écrit rien du tout :
 * abandonner le report vaut mieux qu'écraser. L'upsert reconstruit la valeur, et
 * repartir d'un objet vide détruirait les compteurs cumulés du drain d'un autre
 * run du même jour. L'étape est alors marquée en échec par `executerEtape` —
 * sans toucher aux étapes suivantes, assignation comprise.
 */
async function enregistrerRunTierlist(
  supabase: Supabase,
  jour: string,
  res: RequalificationResultat,
): Promise<void> {
  const ancien = await lireDernierRun(supabase);
  const memeJour = ancien?.jour === jour;
  const base = (memeJour ? ancien : null) ?? {};
  const bloc = blocRunTierlist(res);
  const { error } = await supabase.from("reglages").upsert(
    {
      cle: "minuit_dernier_run",
      valeur: {
        ...base,
        jour,
        at: new Date().toISOString(),
        tierlist: bloc,
        // L'alerte de cohérence est RECOPIÉE ici, pas seulement dans le bloc :
        // l'admin ne lit que `avertissement`. Écrite uniquement dans `tierlist`,
        // elle restait invisible sans requête SQL — exactement le silence qui a
        // laissé la troncature tourner des semaines derrière un « 1000 examinés »
        // rassurant. La ligne quotas du même jour est reprise pour ne pas être
        // effacée en chemin ; le drain la recalculera de toute façon.
        avertissement: composerAvertissement(
          bloc.alerte,
          ligneQuotasBaisses(
            (base as { quotasBaisses?: Array<{ nom: string; avant: number; apres: number }> })
              .quotasBaisses,
          ),
        ),
      },
    },
    { onConflict: "cle" },
  );
  // Une trace qu'on croit écrite et qui ne l'est pas, c'est exactement le
  // silence qui a laissé la troncature tourner des semaines. On lève.
  if (error) {
    throw new Error(
      `écriture de reglages.minuit_dernier_run (bloc tierlist) : ${messageErreur(error)}`,
    );
  }
}

/**
 * Ligne « Lowered quota » telle que l'admin l'affiche. Un seul endroit pour la
 * fabriquer, parce qu'elle est écrite par trois chemins (minuit compte isolé,
 * minuit tierlist, drain d'assignation) et qu'un libellé qui diverge ferait
 * croire à deux incidents là où il n'y en a qu'un.
 */
function ligneQuotasBaisses(
  quotas: Array<{ nom: string; avant: number; apres: number }> | null | undefined,
): string | null {
  if (!Array.isArray(quotas) || quotas.length === 0) return null;
  return (
    `Lowered quota (${quotas.length}) — pool trop mince : ` +
    quotas.map((q) => `${q.nom} ${q.avant}→${q.apres}`).join(" · ")
  );
}

/**
 * Minuit v-next (manuel ou cron — l'heure importe peu) :
 *   1) FETCH stats des passages publiés (via publie_url) — optionnel
 *   2) REQUALIFICATION tierlist des contenus dont le cycle est terminé
 *   3) ASSIGNATION labels ∩ + budget de passages du rang + tirage au hasard
 *
 * Règles d'assignation (par compte actif, jour Paris) :
 *   - quota = posts_par_jour du compte (1–3, défaut 1 ; sinon réglage global)
 *   - non-écrasement : complète jusqu'au quota sans toucher aux passages déjà là
 *   - labels compte ∩ labels contenu requis
 *   - pool = contenus valide + import done + passages tierlist restants > 0
 *   - tirage au hasard dans le pool (le rang décide de la fréquence, pas d'un score)
 *   - préfère du jamais posté sur ce compte, mais un repassage est autorisé
 *   - pool épuisé → repêchage d'un contenu en D (+1 passage), par compte
 *   - deck : traduction + Sophia à la demande (assurerDeckPourLangue)
 *   - crée passages statut=assigne (musique + hashtags) estampillés du cycle
 *
 *   {}  → kick rattrapage (async) + tierlist + assignation + upscale
 *   { etapes?: ['stats'|'scores'|'tierlist'|'assignation'|'upscale'|'variations'|'rattrapage'|'classement'], compteId?, date?, forcer? }
 *   etape `tierlist` : requalification des contenus au bout de leurs passages
 *                      (m = moyenne des vues du cycle) + rappels J+7 des
 *                      passages au-delà de 50k vues
 *   etape `rattrapage` : stats 4j + ELO langue + snapshot vues (contourne PAUSE_ELO_RUNTIME)
 *                        — kick async si tous comptes (évite timeout cron). La
 *                        requalification du classement des comptes tourne en fin
 *                        de son drain, sur les vues fraîches.
 *   etape `classement` : requalification des comptes à la main (INACTIF → STAR),
 *                        sans attendre la fin du drain — outil de test admin
 *   etape `upscale` : SeedVR Fal sur photos assignées du jour sans upscale_le
 *                     (strip C2PA en fin dans le drain — pas de double strip)
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();
  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // vide
  }

  // Avertissements produits AVANT que `out` existe (lecture des réglages).
  // Une liste, pas une variable : les deux lectures peuvent rater dans le même
  // run (c'est même le cas le plus probable, PostgREST étant indisponible pour
  // les deux), et le second message écrasait le premier.
  const avertissementsPreliminaires: string[] = [];

  try {
    const { data: flag, error: erreurFlag } = await supabase
      .from("reglages")
      .select("valeur")
      .eq("cle", "moteur_vnext")
      .maybeSingle();
    // Échec ≠ vide, et ici la confusion coûtait la nuit entière : une lecture
    // ratée rendait `data = null`, donc `actif = false`, donc un 200
    // « moteur_vnext inactif » parfaitement serein pendant que rien ne tournait.
    //
    // Mais lever ne vaut pas mieux : on est AVANT `out` et avant la première
    // `executerEtape`, donc le jet file au catch global, rend 500, et
    // `kickAssignationDrain` n'est jamais atteint — 131 comptes à 0 post, et le
    // cron de 4 h refait le même parcours à l'identique. Un timeout PostgREST
    // passager suffit : c'est la classe d'incident qui a motivé tout ce
    // chantier. On fait donc le même choix que la pause `assignation_auto`
    // quelques lignes plus bas, et pour la même raison asymétrique : un run de
    // trop se rattrape à la main, un run manquant laisse la flotte à l'arrêt.
    // Un flag illisible n'est pas un flag coupé — on avance, et on l'écrit.
    let actif = true;
    if (erreurFlag) {
      const message =
        `flag moteur_vnext illisible (${messageErreur(erreurFlag)}) — run poursuivi`;
      avertissementsPreliminaires.push(message);
      console.error(`[minuit] ${message}`);
    } else {
      actif = Boolean((flag?.valeur as { actif?: boolean } | null)?.actif);
    }
    // forcer: true contourne le flag (tests admin)
    if (!actif && !body?.forcer) {
      return json({ ok: true, saute: true, raison: "moteur_vnext inactif" });
    }

    // Pause auto (réglage Pilotage) — manuel admin passe forcer / manuel.
    if (!body?.forcer && !body?.manuel) {
      const { data: pause, error: erreurPause } = await supabase
        .from("reglages")
        .select("valeur")
        .eq("cle", "assignation_auto")
        .maybeSingle();
      if (erreurPause) {
        // Fail-open ASSUMÉ, même raisonnement que le flag ci-dessus : une pause
        // illisible n'est pas une pause. Sauter la nuit sur une lecture ratée,
        // c'est la famine qu'on répare ; un run de trop se rattrape à la main,
        // un run manquant laisse 131 comptes à 0 post. On avance, et on l'écrit.
        // Ce sont les deux seuls endroits du fichier où on avance sur une
        // information manquante, et c'est parce qu'ils gardent la nuit entière.
        const message =
          `pause assignation_auto illisible (${messageErreur(erreurPause)}) — run poursuivi`;
        avertissementsPreliminaires.push(message);
        console.error(`[minuit] ${message}`);
      } else if ((pause?.valeur as { actif?: boolean } | null)?.actif === false) {
        return json({
          ok: true,
          saute: true,
          raison: "assignation_auto en pause",
        });
      }
    }

    // Défaut : rattrapage (vues + ELO langue) en kick async — plus de scrape
    // synchrone « stats » qui faisait timeout Edge avant snapshot/assign.
    // scores runtime reste en pause (PAUSE_ELO_RUNTIME) ; le rattrapage contourne.
    const etapes: string[] = Array.isArray(body?.etapes)
      ? body.etapes
      : ["rattrapage", "tierlist", "assignation", "upscale"];
    const jour = body?.date ?? aujourdhuiParis();
    const compteId: string | null = body?.compteId ?? null;

    const out: Record<string, unknown> = { ok: true, jour };
    const bilan: BilanEtapes = { reussies: 0, echecs: [] };
    for (const message of avertissementsPreliminaires) ajouterAvertissement(out, message);

    // À partir d'ici, chaque étape est ISOLÉE (voir `executerEtape`). L'ordre ne
    // change pas — la requalification tierlist alimente en compteurs le pool que
    // l'assignation va tirer —, mais une étape qui lève ne peut plus emporter
    // les suivantes.
    if (etapes.includes("rattrapage")) {
      await executerEtape(out, bilan, "rattrapage", async () => {
        // Contourne PAUSE_ELO_RUNTIME — vues + ELO langue + snapshot Pilotage.
        if (compteId) {
          // Compte isolé (manuel) : synchrone, résultat dans la réponse.
          out.rattrapage = await rattrapageElo(supabase, {
            compteId,
            jours: typeof body?.jours === "number" ? body.jours : undefined,
            forcer: Boolean(body?.forcerElo),
            dryRun: Boolean(body?.dryRun),
          });
        } else {
          // Tous comptes (cron minuit) : enqueue + kick 1 compte.
          // Filet durable : pg_cron `rattrapage-elo-drain` (* * * * *) reprend
          // tant que elo_dernier_run.done !== true (même si waitUntil meurt).
          const jours = typeof body?.jours === "number" ? body.jours : 4;
          const source = body?.manuel || body?.forcer ? "manuel" : "cron";
          const { error: erreurFile } = await supabase.from("reglages").upsert(
            {
              cle: "elo_dernier_run",
              valeur: {
                at: new Date().toISOString(),
                kick: true,
                busy: false,
                drain: true,
                drainGen: 0,
                offset: 0,
                done: false,
                jours,
                source,
                detail: "enfilé par minuit — drain minute + kick",
              },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "cle" },
          );
          // Le filet durable du drain ELO est le cron minute, qui reprend tant
          // que `elo_dernier_run.done !== true`. Si cet upsert échoue, l'ancienne
          // valeur (done: true d'hier) reste en place : le kick partirait, ferait
          // un compte, et personne ne reprendrait la suite. Annoncer « drain
          // enfilé » serait faux — on lève, l'étape est marquée en échec et les
          // suivantes, assignation comprise, tournent quand même.
          if (erreurFile) {
            throw new Error(
              `mise en file du drain ELO (reglages.elo_dernier_run) : ${messageErreur(erreurFile)}`,
            );
          }
          kickRattrapageElo(request, {
            drain: true,
            restart: true,
            drainGen: 0,
            offset: 0,
            jours,
            forcer: Boolean(body?.forcerElo),
            dryRun: Boolean(body?.dryRun),
            source,
          });
          out.rattrapage = {
            ok: true,
            kick: true,
            drain: true,
            detail:
              "drain ELO enfilé (1 compte/tick + cron minute rattrapage-elo-drain → snapshot Pilotage)",
          };
        }
      });
    } else if (etapes.includes("stats")) {
      await executerEtape(out, bilan, "stats", async () => {
        // Chemin legacy / explicite (sans rattrapage).
        out.stats = await releverPassages(supabase, compteId);
        if (!compteId) {
          out.snapshotVues = await snapshotVuesGlobales(supabase);
        }
      });
    }
    if (etapes.includes("classement")) {
      await executerEtape(out, bilan, "classement", async () => {
        // Manuel : la voie normale est la fin du drain rattrapage (vues fraîches).
        out.classement = await requalifierClassementComptes(supabase, {
          dryRun: Boolean(body?.dryRun),
        });
      });
    }
    if (etapes.includes("scores")) {
      await executerEtape(out, bilan, "scores", async () => {
        // No-op si PAUSE_ELO_RUNTIME (voir _shared/scoring.ts).
        out.scores = await majScoresDepuisPassages(supabase, { compteId });
      });
    }
    if (etapes.includes("tierlist")) {
      await executerEtape(out, bilan, "tierlist", async () => {
        // Requalification : les contenus qui ont fini leurs passages changent de
        // rang sur la moyenne des vues du cycle, et repartent avec le compteur
        // du nouveau rang. Un S+ débloque 3 remix (file `remix_debloques`).
        // Avant l'assignation : les nouveaux compteurs alimentent le pool du jour.
        const tierlist = await requalifierContenus(supabase, {
          contenuId: body?.contenuId ?? null,
          dryRun: Boolean(body?.dryRun),
        });
        out.tierlist = tierlist;
        // Un écart de complétude est SIGNALÉ, pas jeté : la lecture est complète
        // par construction (pagination keyset) et ce contrôle n'est qu'un témoin.
        // Remonté dans `avertissement` parce que c'est le SEUL champ que l'admin
        // lit — rangée dans le bloc `tierlist`, l'alerte était écrite en base et
        // n'atteignait personne sans requête SQL.
        if (!tierlist.coherence.ok && tierlist.coherence.alerte) {
          ajouterAvertissement(out, tierlist.coherence.alerte);
          console.error(`[minuit] tierlist — ${tierlist.coherence.alerte}`);
        }
        // Trace persistée : la réponse HTTP part à pg_cron, qui la jette. Un run
        // tronqué doit rester lisible demain matin, pas seulement pendant les
        // 200 ms où la fonction répond.
        //
        // Sauf pour un dry run ou le clic admin sur UN contenu : leurs compteurs
        // (1 examiné, 1 requalifié) écraseraient ceux du run de minuit par un
        // chiffre exact et sans signification. Un tableau de bord faux est pire
        // qu'un tableau de bord vide — c'est toute la leçon de cette panne. Ces
        // deux chemins lisent leur résultat dans la réponse, qu'ils reçoivent.
        if (!body?.contenuId && !body?.dryRun) {
          await enregistrerRunTierlist(supabase, jour, tierlist);
        }
      });
      // Étape à part, et pas une sous-étape de la tierlist : le scan des rappels
      // J+7 balaie 30 jours de passages, il a ses propres raisons de lever. Une
      // requalification réussie ne doit pas être comptée en échec pour ça — ni
      // l'inverse.
      //
      // Un contenu isolé (bouton « requalifier » de l'admin) ne déclenche pas le
      // scan global : 30 jours de passages pour un seul clic.
      if (!body?.contenuId) {
        await executerEtape(out, bilan, "rappels", async () => {
          out.rappels = await programmerRappelsJ7(supabase, {
            dryRun: Boolean(body?.dryRun),
          });
          // `programmerRappels` rattrape ses propres échecs de lecture et rend
          // un résultat normal, pour sortir AVANT toute écriture plutôt que de
          // poser un demi-plan de rappels. L'étape est donc comptée réussie — et
          // sans cette remontée, la perte n'existerait que dans le JSON du run,
          // que l'admin ne déplie pas. Un échec silencieux dans l'étape censée
          // rattraper les percées, c'est exactement ce que ce chantier corrige.
          const erreurs = (out.rappels as { erreurs?: string[] } | null)?.erreurs;
          if (erreurs && erreurs.length > 0) {
            ajouterAvertissement(out, `rappels J+7 : ${erreurs.join(" · ")}`);
          }
        });
      }
    }
    // L'étape qui compte. `kickAssignationDrain` est la seule chose qui remplit
    // la journée des 131 comptes ; elle est désormais hors d'atteinte de tout ce
    // qui la précède.
    let assignationOk = true;
    if (etapes.includes("assignation")) {
      assignationOk = await executerEtape(out, bilan, "assignation", async () => {
        // Un seul compte : await synchrone. Tous les comptes : drain auto-chaîné
        // (évite timeout cron 280s qui laissait 50+ comptes sans post).
        if (compteId) {
          const resultats = await assignerTousComptes(
            supabase,
            jour,
            compteId,
            Boolean(body?.forcerAssignation),
          );
          out.assignation = resultats;
          const quotasBaisses = synthetiserQuotasBaisses(resultats);
          const ligneQuotas = ligneQuotasBaisses(quotasBaisses);
          if (ligneQuotas) {
            out.quotasBaisses = quotasBaisses;
            // Ajouté, pas substitué : une alerte de lecture tronquée posée par
            // l'étape tierlist explique peut-être la baisse de quota qu'on est en
            // train d'annoncer. L'écraser reviendrait à effacer la cause pour ne
            // garder que le symptôme.
            ajouterAvertissement(out, ligneQuotas);
          }
          // Le journal ne fait pas échouer une assignation DÉJÀ FAITE : les
          // passages sont créés en base, c'est la trace qui manque. On le dit, et
          // l'étape reste un succès — sans quoi on rendrait 500 sur un run
          // réussi, et le monitoring apprendrait le contraire de la vérité.
          try {
            await enregistrerRunAssignation(supabase, jour, quotasBaisses, resultats, out);
          } catch (error) {
            const erreur = messageErreur(error);
            console.error(`[minuit] trace du run assignation non écrite — ${erreur}`);
            ajouterAvertissement(out, `trace du run assignation non écrite : ${erreur}`);
          }
        } else {
          kickAssignationDrain(request, {
            date: jour,
            drain: true,
            drainGen: 0,
            manuel: Boolean(body?.manuel || body?.forcer),
          });
          out.assignation = {
            ok: true,
            kick: true,
            drain: true,
            detail:
              "drain assignation démarré (lots de 8 comptes, auto-chaîne jusqu'à quota rempli)",
          };
        }
      });
    }
    if (etapes.includes("upscale")) {
      await executerEtape(out, bilan, "upscale", async () => {
        // Ne bloque pas minuit : kick le drain SeedVR (1 à la fois + auto-chaîne).
        // Strip C2PA uniquement en fin d’upscale (dans upscale_media_core).
        const pending = await listerMediasAssignesNonUpscales(supabase, jour);
        if (pending.length > 0) {
          kickUpscaleAssignes(request, { date: jour });
        }
        out.upscale = {
          ok: true,
          kick: pending.length > 0,
          pending: pending.length,
          modele: "seedvr",
          detail:
            pending.length > 0
              ? `drain SeedVR démarré (${pending.length} photo(s)) — C2PA en fin`
              : "aucune photo assignée à upscaler",
        };
      });
    }
    if (etapes.includes("variations")) {
      await executerEtape(out, bilan, "variations", async () => {
        // Un candidat par passage minuit ; le drain `variations` en fait plus souvent.
        out.variations = await avancerVariations(supabase);
      });
    }

    // `ok` et le statut HTTP disent deux choses DIFFÉRENTES, et c'est le nœud de
    // la décision. `ok` dit la vérité sur le run : faux dès qu'une étape a levé.
    // Le statut, lui, sert à ne pas perdre le travail déjà fait — un run où la
    // tierlist a levé mais où le drain d'assignation est parti n'est pas un run
    // perdu, et le rendre en 500 ferait croire le contraire à qui le relit.
    //
    // 500 dans deux cas seulement :
    //   - l'ASSIGNATION a levé : la promesse du run n'est pas tenue ;
    //   - AUCUNE étape n'a abouti : il n'y a rien à protéger, et c'est le cas du
    //     clic admin mono-étape (« Relancer la requalification » n'appelle que
    //     `tierlist`). Sans cette seconde branche, l'isolation aurait rendu un
    //     200 muet là où l'admin attend une erreur à l'écran.
    //
    // Dans les deux cas `out` part en entier : le détail des étapes réussies n'a
    // aucune raison de disparaître avec le statut. Et `error` est posé pour que
    // le helper `invoke` du front en tire le message — il lit cette clé, pas la
    // nôtre.
    if (bilan.echecs.length > 0) out.etapesEnEchec = bilan.echecs;
    out.ok = bilan.echecs.length === 0;
    const rienAProteger = bilan.reussies === 0 && bilan.echecs.length > 0;
    if (assignationOk && !rienAProteger) return json(out, 200);
    out.error = `étape(s) en échec : ${bilan.echecs.join(", ")}`;
    return json(out, 500);
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

function synthetiserQuotasBaisses(
  resultats: AssignationCompteResultat[],
): Array<{ compteId: string; nom: string; avant: number; apres: number; raison: string }> {
  return resultats
    .filter((r) => r.quotaBaisse)
    .map((r) => ({
      compteId: r.compteId,
      nom: r.quotaBaisse!.nom ?? r.compteId.slice(0, 8),
      avant: r.quotaBaisse!.avant,
      apres: r.quotaBaisse!.apres,
      raison: r.quotaBaisse!.raison,
    }));
}

/**
 * Trace du run d'assignation d'UN compte dans `reglages.minuit_dernier_run`.
 *
 * Ce littéral reconstruit la valeur de zéro : toute clé non recopiée est
 * DÉTRUITE. D'où le report explicite du bloc `tierlist` écrit quelques
 * millisecondes plus tôt dans la même requête, et d'où le fait que
 * `lireDernierRun` lève plutôt que de rendre `null` — sur une lecture ratée on
 * n'écrit rien du tout, plutôt que d'effacer le journal du jour.
 */
async function enregistrerRunAssignation(
  supabase: Supabase,
  jour: string,
  quotasBaisses: Array<{ compteId: string; nom: string; avant: number; apres: number }>,
  resultats: AssignationCompteResultat[],
  out: Record<string, unknown>,
): Promise<void> {
  const ancienRun = await lireDernierRun(supabase);
  const bloc = reporterBlocTierlist(ancienRun, ancienRun?.jour === jour);
  const { error } = await supabase.from("reglages").upsert(
    {
      cle: "minuit_dernier_run",
      valeur: {
        jour,
        at: new Date().toISOString(),
        // L'alerte de cohérence est reprise du bloc REPORTÉ, et pas seulement de
        // `out.avertissement` : un appel `{ etapes: ["assignation"] }` — celui du
        // cron de 4 h — n'a pas fait tourner la tierlist, son `out` ne porte donc
        // aucune alerte, et sans ce report il effacerait celle du run de minuit.
        avertissement: composerAvertissement(
          bloc.tierlist?.alerte,
          ligneQuotasBaisses(quotasBaisses),
          out.avertissement as string | undefined,
        ),
        quotasBaisses,
        crees: resultats.reduce((n, r) => n + (r.crees ?? 0), 0),
        ...bloc,
      },
    },
    { onConflict: "cle" },
  );
  if (error) {
    throw new Error(
      `écriture de reglages.minuit_dernier_run (assignation) : ${messageErreur(error)}`,
    );
  }
}

async function releverPassages(
  supabase: Supabase,
  compteId: string | null,
): Promise<Array<{ compteId: string; releves: number; erreur?: string }>> {
  // Paginée bien que la flotte tienne largement sous le plafond : le garde-fou
  // de complétude lève à 1000 lignes PILE, et une lecture qui ne déclare pas sa
  // borne fait donc dépendre l'étape stats du nombre exact de comptes actifs.
  // On préfère une pagination inutile aujourd'hui à une exception le jour du
  // 1000e compte.
  const comptes = await lireTout<{ id: string; handle_tiktok: string | null }>(
    "Comptes actifs à relever",
    (curseur, taille) => {
      let q = supabase
        .from("comptes")
        .select("id, handle_tiktok")
        .eq("is_active", true)
        .not("handle_tiktok", "is", null);
      if (compteId) q = q.eq("id", compteId);
      if (curseur) q = q.gt("id", curseur.id);
      return q.order("id", { ascending: true }).limit(taille);
    },
    { ancre: (c) => c.id },
  );

  const resultats: Array<{ compteId: string; releves: number; erreur?: string }> = [];

  for (const compte of comptes) {
    try {
      const releves = await releverComptePassages(
        supabase,
        compte.id,
        compte.handle_tiktok!,
      );
      resultats.push({ compteId: compte.id, releves });
    } catch (e) {
      resultats.push({
        compteId: compte.id,
        releves: 0,
        erreur: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return resultats;
}

async function releverComptePassages(
  supabase: Supabase,
  compteId: string,
  handle: string,
): Promise<number> {
  const enLigne = await scrapeStats(handle, POSTS_RELEVES);

  // Total profil → compte_metrics (alimente le snapshot Pilotage j0−j1).
  if (enLigne.length > 0) {
    const somme = (f: (s: (typeof enLigne)[number]["stats"]) => number) =>
      enLigne.reduce((n, p) => n + (f(p.stats) || 0), 0);
    const { error } = await supabase.from("compte_metrics").insert({
      compte_id: compteId,
      vues: somme((s) => s.vues),
      likes: somme((s) => s.likes),
      commentaires: somme((s) => s.commentaires),
      partages: somme((s) => s.partages),
      nb_posts: enLigne.length,
    });
    // Cette ligne alimente le snapshot Pilotage j0−j1 : perdue en silence, elle
    // laisse un trou dans une série temporelle, ce qui se lit comme « le compte
    // n'a rien fait » et non comme « on n'a pas su écrire ».
    if (error) {
      throw new Error(`insert compte_metrics : ${messageErreur(error)}`);
    }
  }

  // TROISIÈME copie du même relevé, après les deux de metriques/index.ts — dont
  // le commentaire n'en annonçait que deux. Même lecture sans borne de date :
  // l'historique publié d'un compte s'accumule sans fin, et PostgREST coupait à
  // max-rows en répondant 200, donc sans rien à relire.
  //
  // Pire ici qu'ailleurs, parce que la boucle qui suit fait un UPDATE de stats
  // sur chaque ligne lue : sous MVCC une ligne mise à jour est réécrite en fin
  // de tas, donc les passages RÉCENTS — les seuls que le scrape `enLigne` peut
  // faire matcher — migraient précisément hors de la fenêtre lue. La lecture
  // s'auto-empoisonnait. L'ancre `id` est immuable, elle ne bouge pas sous les
  // UPDATE, et `lireTout` REMONTE l'erreur au lieu de la rendre en résultat vide.
  const passages = await lireTout<{ id: string; publie_url: string | null }>(
    "Passages publiés du compte",
    (curseur, taille) => {
      let q = supabase
        .from("passages")
        .select("id, publie_url")
        .eq("compte_id", compteId)
        .eq("statut", "publie")
        .not("publie_url", "is", null);
      if (curseur) q = q.gt("id", curseur.id);
      return q.order("id", { ascending: true }).limit(taille);
    },
    { ancre: (p) => p.id },
  );

  if (passages.length === 0) return 0;

  const idDuLien = (url: string) => url.match(/\/(?:photo|video)\/(\d+)/)?.[1] ?? url;
  const parId = new Map(enLigne.map((p) => [idDuLien(p.webVideoUrl), p.stats]));

  let releves = 0;
  for (const passage of passages) {
    const complet = await resoudreLien(passage.publie_url!);
    const stats = parId.get(idDuLien(complet));
    if (!stats) continue;

    const { error } = await supabase
      .from("passages")
      .update({
        vues: stats.vues,
        likes: stats.likes,
        commentaires: stats.commentaires,
        partages: stats.partages,
        stats_maj_at: new Date().toISOString(),
      })
      .eq("id", passage.id);
    // `releves` est le chiffre qu'on rend à l'admin. L'incrémenter sans relire
    // l'erreur, c'était annoncer un relevé qui n'a pas eu lieu — la même
    // confusion « échec vs vide » que le reste du chantier, côté écriture.
    // La boucle appelante isole déjà chaque compte, lever ici ne coûte que ce
    // compte-là.
    if (error) {
      throw new Error(
        `maj stats du passage ${passage.id} : ${messageErreur(error)}`,
      );
    }
    releves += 1;
  }
  return releves;
}

async function resoudreLien(url: string): Promise<string> {
  if (!/\/\/(?:vm|vt)\.tiktok\.com/i.test(url)) return url;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      },
    });
    return res.url || url;
  } catch {
    return url;
  }
}
