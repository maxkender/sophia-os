import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";
import {
  type LigneOs,
  baseRecrutement,
  cleNotion,
  ecrireHired,
  lireLignesNotion,
  planifier,
} from "../_shared/notion.ts";

/**
 * Met à jour la colonne « Hired » de la table Notion « Recruitment Targets »,
 * une fois par nuit, à minuit heure de Paris.
 *
 * Demandé par Aram le 13/10/2026, et strictement borné à ça : « Only the Hired
 * column needs it […] This is just Recruit, nothing else. » Aucune autre
 * colonne n'est touchée.
 *
 * Corps accepté :
 *   {}                  appel normal (cron)
 *   {"blanc": true}     calcule et renvoie le plan SANS rien écrire
 *   {"force": true}     ignore le garde-fou d'heure, pour un rattrapage manuel
 *
 * POURQUOI UN GARDE-FOU D'HEURE. pg_cron tourne en UTC et n'a pas de fuseau par
 * job (version 1.6.4 vérifiée ; le réglage `cron.timezone` est global aux 37
 * jobs du projet, donc inutilisable). « Minuit à Paris » vaut 22:00 UTC l'été
 * et 23:00 UTC l'hiver. Deux schedules figés obligeraient à les permuter à la
 * main deux fois par an — une dette que le projet porte déjà ailleurs et qui
 * n'a jamais été payée : `minuit-vnext` est à '0 22 * * *' et passera
 * mécaniquement à 23 h Paris au changement d'heure du dimanche 25 octobre 2026.
 * On n'en ajoute pas une seconde : le cron tire à 22:05 ET 23:05 UTC, et la
 * fonction ne travaille que s'il est réellement minuit à Paris. Un des deux
 * passages est donc toujours un no-op, été comme hiver, sans intervention.
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  let blanc = false;
  let force = false;
  try {
    const body = (await request.json()) as { blanc?: boolean; force?: boolean };
    blanc = Boolean(body?.blanc);
    force = Boolean(body?.force);
  } catch {
    // corps vide : appel cron normal
  }

  const heureParis = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date());

  if (heureParis !== "00" && !force && !blanc) {
    return json({ ok: true, ignore: "pas minuit à Paris", heure_paris: heureParis });
  }

  const cle = cleNotion();
  if (!cle) {
    // Pas de throw : un secret absent ne doit pas faire tomber un cron chaque
    // nuit. On le dit, et on sort.
    return json({ ok: true, secret_manquant: "NOTION_TOKEN", ecrites: 0 });
  }

  try {
    const supabase = serviceClient();

    const { data, error } = await supabase
      .from("hired_pays_application")
      .select("pays, application, hired")
      .limit(500);
    if (error) return json({ error: error.message }, 500);
    const lignesOs = (data ?? []) as LigneOs[];

    // Garde-fou : un compte servant plusieurs applications rend le comptage
    // ambigu. Le référent tient le cas pour impossible, et il ne s'est jamais
    // produit — mais rien ne l'interdit en base. On s'arrête plutôt que
    // d'écrire un chiffre qu'on ne sait pas justifier.
    const partages = lignesOs.filter((l) => l.application === null);
    if (partages.length > 0) {
      return json(
        {
          error: "compte partagé entre plusieurs applications : comptage ambigu, rien n'a été écrit",
          pays_concernes: partages.map((p) => p.pays),
        },
        409,
      );
    }

    const baseId = baseRecrutement();
    const lignesNotion = await lireLignesNotion(cle, baseId);
    const plan = planifier(lignesOs, lignesNotion);

    const resume = {
      ok: true,
      heure_paris: heureParis,
      lignes_notion: lignesNotion.length,
      couples_os: lignesOs.length,
      total_comptes: lignesOs.reduce((n, l) => n + l.hired, 0),
      inchangees: plan.inchangees,
      a_ecrire: plan.ecritures.length,
      ecritures: plan.ecritures,
      // Remontés et jamais tus : ce sont des comptes réels que la table ne
      // peut pas accueillir, donc des posteurs invisibles côté recrutement.
      inconnus: plan.inconnus,
      doublons: plan.doublons,
    };

    if (blanc) return json({ ...resume, blanc: true, ecrites: 0 });

    let ecrites = 0;
    for (const e of plan.ecritures) {
      await ecrireHired(cle, e.pageId, e.apres);
      ecrites += 1;
      // Notion plafonne à ~3 requêtes/seconde. On n'écrit que les lignes qui
      // changent (3 sur 56 au premier passage), la pause ne coûte donc rien.
      if (ecrites < plan.ecritures.length) await new Promise((r) => setTimeout(r, 350));
    }

    return json({ ...resume, ecrites });
  } catch (erreur) {
    return json({ error: messageErreur(erreur) }, 500);
  }
});
