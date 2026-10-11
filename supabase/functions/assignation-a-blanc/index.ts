import { etatInstallation } from "./installer.ts";
import {
  creerContexteABlanc,
  executerDansContexte,
  intercepteurActif,
} from "../_shared/a_blanc_intercepteur.ts";
import { envelopperDecksABlanc } from "../_shared/a_blanc_decks.ts";
import { demainParis, executerAssignationABlanc, masquerSecrets } from "../_shared/a_blanc_execution.ts";
import {
  executerContenusABlanc,
  MAX_CONTENUS_A_BLANC,
  PLAFOND_IA_PAR_CONTENU,
} from "../_shared/a_blanc_contenus.ts";
import { ID_SOPHIA } from "../_shared/multi_app.ts";
import { reponseNdjson } from "../_shared/nettoyage_etapes.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Assignation test À BLANC — un compte, ZÉRO incidence.
 *
 *   POST { compteId, jour | date (YYYY-MM-DD, défaut : demain à Paris), ia? }
 *   → flux NDJSON : les logs du vrai code de la nuit, une ligne par écriture
 *     évitée / appel bloqué, puis { etape: "ready", aBlanc: true, resultat }.
 *
 * Rejoue le VRAI code de la nuit pour ce compte (voir
 * _shared/a_blanc_execution.ts) dans un isolate où `fetch` est intercepté
 * (installer.ts, _shared/a_blanc_intercepteur.ts) :
 *  - lectures PostgREST autorisées ; toute écriture SIMULÉE (jamais envoyée,
 *    gardée en mémoire le temps du test, listée) ;
 *  - liste blanche RPC VIDE ; storage, functions, auth : refusés ;
 *  - hôtes externes (fal, TikTok…) bloqués ; l'API du modèle seulement si
 *    `ia: true` (decks fabriqués en mémoire, jamais enregistrés), plafonnée,
 *    et refusée pendant la nuit.
 * Ne kicke jamais le drain, n'écrit jamais le journal de minuit.
 * Droits : ceux de la fonction `assignation` (admin, ou secret de cron / test).
 *
 * Mode « contenus » (même isolate, même intercepteur, même contrôle d'accès) :
 *
 *   POST { mode: "contenus", applicationId, contenuIds (1 à 3), langue? }
 *   → même flux NDJSON, puis { etape: "ready", aBlanc: true, mode: "contenus", resultat }.
 *
 * Note 1 à 3 slideshows pour une application AUTRE que Sophia (le vrai calcul
 * du rattrapage de pertinence), puis fait son placement (le vrai deck
 * d'application, cache ignoré). IA obligatoire : mêmes refus la nuit, plafond
 * de PLAFOND_IA_PAR_CONTENU appels par slideshow. Voir _shared/a_blanc_contenus.ts.
 *
 * Voir docs/assignation-a-blanc.md.
 */

// Enveloppe des decks : seulement dans CET isolate (voir a_blanc_decks.ts).
envelopperDecksABlanc();

/** Un test à la fois par instance : le flux et la mémoire du calque sont lourds. */
let enCours = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve((request) => {
  // Contexte « auth » : lectures seules (le rôle admin, via user_roles), puis fermé.
  const auth = creerContexteABlanc({ nature: "auth", ia: false });
  return executerDansContexte(auth, async () => {
    const refus = await assertAuthorised(request);
    auth.etat.ferme = true;
    if (refus) return refus;
    if (request.method !== "POST") return json({ error: "POST attendu" }, 405);

    if (!etatInstallation.actif || !intercepteurActif()) {
      return json(
        { error: `intercepteur inactif : ${etatInstallation.erreur ?? "fetch remplacé"} — test refusé, rien n'a été lancé` },
        500,
      );
    }

    let compteId = "";
    let jour = "";
    let ia = false;
    let corps: Record<string, unknown> | null = null;
    try {
      const body = await request.json() as Record<string, unknown>;
      corps = body;
      compteId = typeof body?.compteId === "string" ? body.compteId : "";
      const brut = body?.jour ?? body?.date ?? demainParis();
      jour = typeof brut === "string" ? brut : "";
      // Strict : seule la valeur true active l'IA (« false » en texte ne compte pas).
      ia = body?.ia === true;
    } catch {
      return json({ error: "corps JSON attendu : { compteId, jour, ia }" }, 400);
    }
    if (corps?.mode === "contenus") return lancerModeContenus(corps);
    if (!UUID.test(compteId)) return json({ error: "compteId (uuid) requis" }, 400);
    if (!JOUR.test(jour)) return json({ error: "jour au format YYYY-MM-DD requis" }, 400);

    if (enCours) {
      return json({ error: "Un test à blanc tourne déjà sur cette instance — réessaie dans un instant." }, 409);
    }
    enCours = true;

    const ctx = creerContexteABlanc({ nature: "run", ia });
    try {
      return reponseNdjson((emit) =>
        executerDansContexte(ctx, async () => {
          // L'émetteur de reponseNdjson est typé pour les étapes du nettoyage ;
          // ce flux porte les mêmes lignes « assignation » que l'assignation test.
          const brut = emit as unknown as (e: Record<string, unknown>) => void;
          let fluxFerme = false;
          const emettre = (e: Record<string, unknown>) => {
            if (fluxFerme) return;
            try {
              brut(masquerSecrets(e));
            } catch {
              // Client parti : le test va au bout (rien n'est écrit), sans flux.
              fluxFerme = true;
            }
          };
          const log = (detail: string) =>
            emettre({ etape: "assignation", statut: "en_cours", detail, at: new Date().toISOString() });
          ctx.etat.onEvenement = (texte) =>
            emettre({ etape: "a_blanc", statut: "en_cours", detail: texte, at: new Date().toISOString() });
          const hb = setInterval(() => log("… encore en cours"), 25_000);
          try {
            log(
              `Test à BLANC · ${jour} · compte ${compteId.slice(0, 8)}` +
                (ia ? " · IA autorisée (rien n'est enregistré)" : " · sans IA"),
            );
            const r = await executerAssignationABlanc(serviceClient(), ctx, { compteId, jour, ia, onLog: log });
            const echec = Boolean(r.erreurRun) || (Boolean(r.resultat.erreur) && r.resultat.crees === 0);
            emettre({
              etape: "ready",
              statut: echec ? "echec" : "ok",
              ok: !r.erreurRun,
              aBlanc: true,
              jour,
              compteId,
              detail: r.resume,
              ...(r.erreurRun ? { error: r.erreurRun } : {}),
              resultat: r,
            });
          } catch (e) {
            emettre({
              etape: "ready",
              statut: "echec",
              ok: false,
              aBlanc: true,
              jour,
              compteId,
              detail: messageErreur(e),
              error: messageErreur(e),
            });
          } finally {
            // DANS le run (start() du flux), pas dans le handler : le handler
            // rend la Response tout de suite, le test, lui, tourne ensuite.
            clearInterval(hb);
            ctx.etat.ferme = true;
            ctx.etat.onEvenement = undefined;
            enCours = false;
          }
        })
      );
    } catch (e) {
      ctx.etat.ferme = true;
      enCours = false;
      return json({ error: messageErreur(e) }, 500);
    }
  });
});

const LANGUE = /^[a-z]{2,3}$/;

/**
 * Mode « contenus » : notation + placement d'une application autre que Sophia
 * sur 1 à 3 slideshows. Même verrou d'instance, même contexte de run, même
 * flux que le mode compte ; l'IA y est toujours demandée (refusée la nuit par
 * `executerContenusABlanc`).
 */
function lancerModeContenus(body: Record<string, unknown>): Response {
  const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
  const brut = Array.isArray(body.contenuIds) ? body.contenuIds : [];
  const contenuIds = [...new Set(brut.filter((x): x is string => typeof x === "string"))];
  const langue = typeof body.langue === "string" && body.langue.trim() ? body.langue.trim() : null;
  if (!UUID.test(applicationId)) return json({ error: "applicationId (uuid) requis" }, 400);
  if (applicationId === ID_SOPHIA) {
    return json({ error: "Mode contenus réservé aux applications autres que Sophia" }, 400);
  }
  if (
    contenuIds.length === 0 || contenuIds.length > MAX_CONTENUS_A_BLANC ||
    contenuIds.length !== brut.length || !contenuIds.every((id) => UUID.test(id))
  ) {
    return json({ error: `contenuIds : 1 à ${MAX_CONTENUS_A_BLANC} uuid distincts requis` }, 400);
  }
  if (langue !== null && !LANGUE.test(langue)) return json({ error: "langue : code à 2 ou 3 lettres attendu" }, 400);

  if (enCours) {
    return json({ error: "Un test à blanc tourne déjà sur cette instance — réessaie dans un instant." }, 409);
  }
  enCours = true;

  // L'IA est la raison d'être de ce mode : toujours demandée, plafonnée par slideshow.
  const ctx = creerContexteABlanc({ nature: "run", ia: true, plafondIA: PLAFOND_IA_PAR_CONTENU * contenuIds.length });
  try {
    return reponseNdjson((emit) =>
      executerDansContexte(ctx, async () => {
        const brutEmit = emit as unknown as (e: Record<string, unknown>) => void;
        let fluxFerme = false;
        const emettre = (e: Record<string, unknown>) => {
          if (fluxFerme) return;
          try {
            brutEmit(masquerSecrets(e));
          } catch {
            // Client parti : le test va au bout (rien n'est écrit), sans flux.
            fluxFerme = true;
          }
        };
        const log = (detail: string) =>
          emettre({ etape: "assignation", statut: "en_cours", detail, at: new Date().toISOString() });
        ctx.etat.onEvenement = (texte) =>
          emettre({ etape: "a_blanc", statut: "en_cours", detail: texte, at: new Date().toISOString() });
        const hb = setInterval(() => log("… encore en cours"), 25_000);
        try {
          log(
            `Test à BLANC · notation + placement · ${contenuIds.length} slideshow(s)` +
              `${langue ? ` · ${langue}` : ""} · IA autorisée (rien n'est enregistré)`,
          );
          const r = await executerContenusABlanc(serviceClient(), ctx, { applicationId, contenuIds, langue, onLog: log });
          emettre({
            etape: "ready",
            statut: r.erreurRun ? "echec" : "ok",
            ok: !r.erreurRun,
            aBlanc: true,
            mode: "contenus",
            detail: r.resume,
            ...(r.erreurRun ? { error: r.erreurRun } : {}),
            resultat: r,
          });
        } catch (e) {
          emettre({
            etape: "ready",
            statut: "echec",
            ok: false,
            aBlanc: true,
            mode: "contenus",
            detail: messageErreur(e),
            error: messageErreur(e),
          });
        } finally {
          clearInterval(hb);
          ctx.etat.ferme = true;
          ctx.etat.onEvenement = undefined;
          enCours = false;
        }
      })
    );
  } catch (e) {
    ctx.etat.ferme = true;
    enCours = false;
    return json({ error: messageErreur(e) }, 500);
  }
}
