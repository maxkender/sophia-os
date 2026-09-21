import {
  annulerAssignationTest,
  assignerDrainLot,
  assignerTousComptes,
  DRAIN_MAX_CHAIN,
  kickAssignationDrain,
  type AssignationCompteResultat,
} from "../_shared/assignation_contenu.ts";
import { reponseNdjson, veutStream } from "../_shared/nettoyage_etapes.ts";
import { reporterBlocTierlist } from "../_shared/tierlist.ts";
import {
  assertAuthorised,
  aujourdhuiParis,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

/**
 * Assignation quotidienne — CUTOVER v-next.
 *
 *   {}               → tous les comptes (respecte pause assignation_auto)
 *   { compteId }     → ce seul compte
 *   { date }         → jour Paris cible
 *   { manuel: true } → contourne la pause (lancement admin Minuit)
 *   { drain: true }  → lot de comptes sous-quota + auto-chaîne (évite timeout)
 *   { forcer: true } → crée 1 passage même si quota atteint
 *   { test: true, compteId, date, manuel: true, stream? }
 *   { action: "annuler_test", compteId, date }
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  let compteId: string | null = null;
  let date: string | null = null;
  let forcer = false;
  let manuel = false;
  let test = false;
  let drain = false;
  let drainGen = 0;
  let action: string | null = null;
  // Comptes déjà tentés en échec dans cette chaîne de drain — voir le blocage
  // en tête de file documenté dans `assignerDrainLot`.
  let exclus: string[] = [];
  try {
    body = await request.json();
    compteId = body?.compteId ?? null;
    date = body?.date ?? null;
    forcer = Boolean(body?.forcer);
    manuel = Boolean(body?.manuel);
    test = Boolean(body?.test);
    drain = Boolean(body?.drain);
    drainGen = typeof body?.drainGen === "number" ? body.drainGen : 0;
    action = typeof body?.action === "string" ? body.action : null;
    exclus = Array.isArray(body?.exclus)
      ? body.exclus.filter((id: unknown): id is string => typeof id === "string")
      : [];
  } catch {
    // Corps vide : tous les comptes, aujourd'hui.
  }

  const jour = date ?? aujourdhuiParis();
  // Test = toujours stream (Face swap / deck > 150s idle sinon).
  const stream = test || veutStream(request, body);

  try {
    if (action === "annuler_test") {
      if (!compteId) return json({ error: "compteId requis" }, 400);
      const resultat = await annulerAssignationTest(supabase, compteId, jour);
      return json({ ok: true, jour, compteId, ...resultat });
    }

    if (test && !compteId) {
      return json({ error: "compteId requis pour une assignation test" }, 400);
    }

    let avertissementPause: string | null = null;
    if (!manuel && !test) {
      const { data: flag, error: erreurFlag } = await supabase
        .from("reglages")
        .select("valeur")
        .eq("cle", "assignation_auto")
        .maybeSingle();
      // Fail-open ASSUMÉ, et relu explicitement plutôt qu'avalé. Le défaut
      // `!== false` faisait déjà tourner le run sur une lecture ratée — c'est le
      // bon sens (une pause illisible n'est pas une pause, et un run manquant
      // laisse 131 comptes à 0 post), mais il le faisait sans le dire. On le dit.
      if (erreurFlag) {
        avertissementPause =
          `pause assignation_auto illisible (${messageErreur(erreurFlag)}) — run poursuivi`;
        console.error(`[assignation] ${avertissementPause}`);
      }
      const actif = (flag?.valeur as { actif?: boolean } | null)?.actif !== false;
      if (!actif) {
        return json({
          ok: true,
          saute: true,
          raison: "assignation_auto en pause",
          jour,
        });
      }
    }

    const opts = {
      forcer,
      test,
      ignorerTierlist: test,
      ignorerWarmup: test,
    };

    // Drain : petits lots + auto-chaîne (chemin minuit / gros backlog).
    if (drain && !compteId && !test) {
      const peutChainer = drainGen < DRAIN_MAX_CHAIN;
      let lot: Awaited<ReturnType<typeof assignerDrainLot>>;
      try {
        lot = await assignerDrainLot(supabase, jour, opts, exclus);
      } catch (error) {
        // MÊME MOTIF DE FAMINE QUE DANS MINUIT, et c'est ici qu'il coûte le plus
        // cher : la chaîne du drain n'a pas d'autre moteur qu'elle-même. Le lot
        // qui lève ne rendait rien, le catch global rendait 500, et la
        // génération suivante n'était jamais lancée — les ~123 comptes restants
        // passaient la nuit à 0 post pour une seule lecture ratée (502, ou
        // troncature signalée par le garde-fou de complétude). Un lot en échec
        // n'est pas une fin de drain : les comptes sous quota sont toujours là.
        //
        // On relance donc la génération suivante AVANT de rendre l'erreur. La
        // borne DRAIN_MAX_CHAIN empêche l'emballement : un incident passager est
        // rattrapé au tour d'après, un incident durable s'éteint tout seul après
        // 40 tours qui échouent en quelques millisecondes chacun.
        const erreur = messageErreur(error);
        console.error(`[assignation] drain lot ${drainGen} en échec — ${erreur}`);
        if (peutChainer) {
          kickAssignationDrain(request, {
            date: jour,
            drain: true,
            drainGen: drainGen + 1,
            manuel: true,
            // Le lot entier a levé : on ne sait pas quel compte est en cause, la
            // liste passe donc telle quelle. Seule la borne DRAIN_MAX_CHAIN
            // arrête la chaîne si l'incident dure.
            exclus,
          });
        }
        // 500 assumé : ce lot-ci n'a rien produit, le monitoring doit le voir.
        // Il ne coûte plus la nuit, puisque la relance est déjà partie.
        return json(
          { ok: false, jour, drain: true, drainGen, erreur, kick: peutChainer },
          500,
        );
      }

      const quotasBaisses = synthetiserQuotasBaisses(lot.resultats);
      const crees = lot.resultats.reduce((n, r) => n + (r.crees ?? 0), 0);

      // Le journal AVANT le kick, et pas l'inverse : `fusionnerDernierRun` est un
      // lire-modifier-écrire sur une clé unique, et lancer le lot suivant d'abord
      // ferait courir deux fusions en parallèle sur le compteur cumulé `crees`.
      // Mais il ne doit pas non plus pouvoir arrêter la chaîne — d'où le catch :
      // les passages du lot sont créés en base, seule la trace manquerait.
      let traceErreur: string | null = null;
      try {
        await fusionnerDernierRun(supabase, jour, lot.resultats, quotasBaisses, {
          drainGen,
          traites: lot.traites,
          restants: lot.restants,
        });
      } catch (error) {
        traceErreur = messageErreur(error);
        console.error(
          `[assignation] trace du drain (gen ${drainGen}) non écrite — ${traceErreur}`,
        );
      }

      const kick = lot.restants > 0 && peutChainer;
      if (kick) {
        kickAssignationDrain(request, {
          date: jour,
          drain: true,
          drainGen: drainGen + 1,
          // Contourne la pause : le run a déjà été autorisé (cron / admin).
          manuel: true,
          // Les comptes qui viennent d'échouer ne reviendront pas en tête du
          // lot suivant : sans ça, huit échecs retiennent la file entière.
          exclus: [...exclus, ...lot.echecs],
        });
      }

      const avertissement = composerAvertissement(
        avertissementPause,
        ligneQuotasBaisses(quotasBaisses),
        traceErreur ? `trace du run non écrite : ${traceErreur}` : null,
      ) ?? undefined;

      return json({
        ok: true,
        jour,
        drain: true,
        drainGen,
        traites: lot.traites,
        restants: lot.restants,
        resultats: lot.resultats,
        quotasBaisses,
        avertissement,
        crees,
        kick,
      });
    }

    if (stream) {
      return reponseNdjson(async (emit) => {
        const log = (detail: string) =>
          emit({
            etape: "assignation",
            statut: "en_cours",
            detail,
            at: new Date().toISOString(),
          });

        // Keepalive si une sous-étape reste silencieuse trop longtemps.
        const hb = setInterval(() => log("… encore en cours"), 25_000);
        try {
          log(
            test
              ? `Assignation TEST · ${jour} · compte ${String(compteId).slice(0, 8)}`
              : `Assignation · ${jour}${compteId ? ` · compte ${String(compteId).slice(0, 8)}` : ""}`,
          );
          const resultats = await assignerTousComptes(supabase, jour, compteId, {
            ...opts,
            onLog: log,
          });
          const crees = resultats.reduce((n, r) => n + (r.crees ?? 0), 0);
          const quotasBaisses = synthetiserQuotasBaisses(resultats);
          // Le journal ne fait pas échouer une assignation DÉJÀ FAITE : les
          // passages existent, c'est la trace qui manque. On le dit dans le
          // flux, le run reste un succès.
          let traceErreur: string | null = null;
          if (!test) {
            try {
              await fusionnerDernierRun(supabase, jour, resultats, quotasBaisses, {});
            } catch (error) {
              traceErreur = messageErreur(error);
              console.error(`[assignation] trace du run non écrite — ${traceErreur}`);
            }
          }
          const avertissement = composerAvertissement(
            avertissementPause,
            ligneQuotasBaisses(quotasBaisses),
            traceErreur ? `trace du run non écrite : ${traceErreur}` : null,
          ) ?? undefined;
          const detail =
            avertissement ??
            (crees > 0
              ? `Terminé — ${crees} passage(s)`
              : resultats[0]?.erreur ?? resultats[0]?.raison ?? "Aucun passage créé");
          emit({
            etape: "ready",
            statut: resultats.some((r) => r.erreur) && crees === 0 ? "echec" : "ok",
            ok: true,
            jour,
            resultats,
            test,
            detail,
            quotasBaisses,
            avertissement,
          });
        } finally {
          clearInterval(hb);
        }
      });
    }

    const resultats = await assignerTousComptes(supabase, jour, compteId, opts);
    const quotasBaisses = synthetiserQuotasBaisses(resultats);
    // Même raison que sur le chemin stream : la trace ne dégrade pas en 500 une
    // assignation dont les passages sont déjà en base.
    let traceErreur: string | null = null;
    if (!test) {
      try {
        await fusionnerDernierRun(supabase, jour, resultats, quotasBaisses, {});
      } catch (error) {
        traceErreur = messageErreur(error);
        console.error(`[assignation] trace du run non écrite — ${traceErreur}`);
      }
    }
    const avertissement = composerAvertissement(
      avertissementPause,
      ligneQuotasBaisses(quotasBaisses),
      traceErreur ? `trace du run non écrite : ${traceErreur}` : null,
    ) ?? undefined;
    return json({
      ok: true,
      jour,
      resultats,
      test,
      quotasBaisses,
      avertissement,
    });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

/**
 * Compose le champ `avertissement` — réponse HTTP et valeur persistée.
 *
 * L'admin ne lit QUE ce champ (`lireMinuitDernierRun`, src/features/moteur/api.ts) :
 * une alerte de cohérence rangée dans le bloc `tierlist` est bien écrite en base,
 * mais n'atteint personne sans requête SQL. On la recompose donc À PARTIR DES
 * SOURCES à chaque écriture, jamais par concaténation de la chaîne déjà en base :
 * ce drain réécrit la valeur à chaque lot, et une concaténation aveugle
 * répéterait la même alerte autant de fois qu'il y a de générations.
 *
 * Le dédoublonnage porte sur la partie ENTIÈRE, sans redécouper sur « · » : ce
 * séparateur sert aussi À L'INTÉRIEUR de la ligne quotas.
 *
 * Jumeau volontaire de celui de `minuit-vnext/index.ts` : les deux fonctions Edge
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
 * Ligne « Lowered quota » telle que l'admin l'affiche. Un seul endroit pour la
 * fabriquer : elle était recopiée à l'identique sur quatre chemins, et un
 * libellé qui diverge ferait croire à deux incidents là où il n'y en a qu'un.
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

/** Merge cumulatif (drain multi-lots) dans reglages.minuit_dernier_run. */
async function fusionnerDernierRun(
  supabase: ReturnType<typeof serviceClient>,
  jour: string,
  resultats: AssignationCompteResultat[],
  quotasBaisses: Array<{
    compteId: string;
    nom: string;
    avant: number;
    apres: number;
    raison: string;
  }>,
  meta: Record<string, unknown>,
): Promise<void> {
  const creesLot = resultats.reduce((n, r) => n + (r.crees ?? 0), 0);
  const { data: prev, error: erreurLecture } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "minuit_dernier_run")
    .maybeSingle();
  // Échec ≠ vide, et ici la confusion est DESTRUCTRICE. L'upsert plus bas
  // reconstruit la valeur de zéro : une lecture ratée rendait `data = null`,
  // donc `ancien = {}`, donc `memeJour = false` — le bloc `tierlist` écrit par
  // minuit quelques secondes plus tôt était effacé, et le compteur cumulé
  // `crees` des lots précédents repartait à 0 au milieu du drain. Un journal qui
  // manque se rattrape au lot suivant ; un journal faux ne se rattrape jamais.
  // On lève : l'appelant isole cette écriture et la chaîne du drain continue.
  if (erreurLecture) {
    throw new Error(
      `lecture de reglages.minuit_dernier_run : ${messageErreur(erreurLecture)} — ` +
        `fusion abandonnée plutôt qu'écrasement du journal du jour.`,
    );
  }
  const ancien = (prev?.valeur ?? {}) as {
    jour?: string;
    crees?: number;
    quotasBaisses?: Array<{
      compteId: string;
      nom: string;
      avant: number;
      apres: number;
      raison: string;
    }>;
  };
  const memeJour = ancien.jour === jour;
  const quotas = [
    ...(memeJour ? (ancien.quotasBaisses ?? []) : []),
    ...quotasBaisses,
  ];
  // Dédup par compteId (garde le dernier).
  const parId = new Map(quotas.map((q) => [q.compteId, q]));
  const quotasMerged = [...parId.values()];
  // Ce littéral reconstruit la valeur de zéro, donc toute clé non recopiée est
  // détruite. Minuit lance la requalification puis kicke ce drain : sans ce
  // report, le premier lot effacerait le bloc `tierlist` quelques secondes après
  // son écriture, et le compteur ajouté pour rendre l'étape visible n'aurait
  // jamais été lu une seule fois.
  const bloc = reporterBlocTierlist(ancien, memeJour);
  // L'alerte de cohérence de la tierlist est REPRISE du bloc reporté et remise
  // dans `avertissement`, le seul champ que l'admin lit. Sans ça, le drain
  // écrasait au premier lot l'alerte posée par minuit — par `null` quand aucun
  // quota n'avait baissé, c'est-à-dire précisément le cas le plus courant :
  // l'alerte survivait dans le JSON, mais plus là où quelqu'un la voit. On la
  // relit du bloc plutôt que de la concaténer, pour rester idempotent sur les
  // quarante générations du drain.
  const avertissement = composerAvertissement(
    bloc.tierlist?.alerte,
    ligneQuotasBaisses(quotasMerged),
  );

  const { error } = await supabase.from("reglages").upsert(
    {
      cle: "minuit_dernier_run",
      valeur: {
        jour,
        at: new Date().toISOString(),
        avertissement,
        quotasBaisses: quotasMerged,
        crees: (memeJour ? (ancien.crees ?? 0) : 0) + creesLot,
        ...bloc,
        ...meta,
      },
    },
    { onConflict: "cle" },
  );
  // Une trace qu'on croit écrite et qui ne l'est pas, c'est le silence qui a
  // laissé la troncature tourner des semaines. L'appelant isole cette erreur :
  // elle est dite, elle n'interrompt ni le run ni la chaîne du drain.
  if (error) {
    throw new Error(
      `écriture de reglages.minuit_dernier_run : ${messageErreur(error)}`,
    );
  }
}
