import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";
import { cleRevenueCat, fetchChart, fetchOptionsChart, isoUtc, projectIdRevenueCat } from "../_shared/revenuecat.ts";
import { deviseReponse, filtreNouvelles, type LigneRcPays, lireRevenuParPays } from "../_shared/rc_pays.ts";

/**
 * Page « Pays » (2/11) : les proceeds RevenueCat par pays et par semaine,
 * rangés dans `rc_proceeds_pays_semaine`. Lecture seule côté RevenueCat ;
 * la clé n'est jamais renvoyée ni écrite.
 *
 * Une requête « revenue » (revenue_type = proceeds, semaine, segment = country,
 * 200 pays au plus : tous les pays, sans « Other ») ; une seconde avec le
 * filtre « transaction type = New » pour proceeds_new. Si RevenueCat ignore
 * ce filtre (même total que la première), proceeds_new reste vide et le
 * journal le dit.
 *
 * Corps : { depuis?: "AAAA-MM-JJ" } (défaut : 5 semaines ; l'historique depuis
 * le 1er août se lance avec depuis = "2026-08-01"), { action: "options" }
 * (diagnostic : les segments et filtres du graphique). Cron : chaque nuit.
 */

const DEBUT_HISTORIQUE = "2026-08-01";

function ilYaJours(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return isoUtc(d);
}

function totalDe(lignes: LigneRcPays[]): number {
  return Math.round(lignes.filter((l) => l.pays_nom === "Total").reduce((s, l) => s + l.proceeds, 0) * 100) / 100;
}

Deno.serve(async (request) => {
  const refus = await assertAuthorised(request);
  if (refus) return refus;
  const supabase = serviceClient();
  const corps = (await request.json().catch(() => ({}))) as { depuis?: string; action?: string };
  const cle = cleRevenueCat();
  if (!cle) return json({ ok: false, error: "secret RevenueCat manquant" }, 500);
  const projectId = projectIdRevenueCat();

  try {
    const options = await fetchOptionsChart({ key: cle, projectId, chart: "revenue" }).catch((e) => ({ erreur: messageErreur(e) }));
    if (corps.action === "options") return json({ ok: true, options });

    const depuis = /^\d{4}-\d{2}-\d{2}$/.test(String(corps.depuis ?? "")) ? String(corps.depuis) : ilYaJours(35);
    const debut = depuis < DEBUT_HISTORIQUE ? DEBUT_HISTORIQUE : depuis;
    const fin = isoUtc(new Date());
    const base = {
      key: cle, projectId, chart: "revenue", start: debut, end: fin, resolution: "1", segment: "country", limit: 200,
      selectors: { revenue_type: "proceeds" },
    };

    const brut = await fetchChart(base);
    const lignes = lireRevenuParPays(brut);
    const devise = deviseReponse(brut) ?? "EUR";

    // proceeds_new : le même graphique, filtré sur les nouvelles transactions.
    const filtre = filtreNouvelles(options) ?? { name: "transaction_type", values: ["new"] };
    let nouvelles: LigneRcPays[] | null = null;
    let noteNew: string | null = null;
    try {
      const brutNew = await fetchChart({ ...base, filters: [filtre] });
      const lu = lireRevenuParPays(brutNew);
      // deno-lint-ignore no-explicit-any
      const ignores = (brutNew as any)?.unsupported_params;
      if (ignores && JSON.stringify(ignores).includes("filter")) noteNew = `filtre ignoré par RevenueCat : ${JSON.stringify(ignores)}`;
      else if (totalDe(lu) >= totalDe(lignes) && totalDe(lignes) > 0) noteNew = "filtre sans effet (même total) : proceeds_new non rempli";
      else nouvelles = lu;
    } catch (e) {
      noteNew = `filtre « New » refusé : ${messageErreur(e)}`;
    }
    const newDe = new Map((nouvelles ?? []).map((l) => [`${l.pays_nom}|${l.semaine}`, l]));

    const maintenant = new Date().toISOString();
    const aEcrire = lignes.map((l) => {
      const n = newDe.get(`${l.pays_nom}|${l.semaine}`);
      return {
        pays: l.pays, pays_nom: l.pays_nom, semaine: l.semaine, proceeds: l.proceeds, transactions: l.transactions,
        proceeds_new: nouvelles ? (n?.proceeds ?? 0) : null,
        transactions_new: nouvelles ? (n?.transactions ?? 0) : null,
        devise, incomplet: l.incomplet, lu_at: maintenant,
      };
    });
    for (let i = 0; i < aEcrire.length; i += 500) {
      const { error } = await supabase.from("rc_proceeds_pays_semaine").upsert(aEcrire.slice(i, i + 500), { onConflict: "pays_nom,semaine" });
      if (error) throw new Error(error.message);
    }
    const sansCode = [...new Set(lignes.filter((l) => !l.pays && l.pays_nom !== "Total").map((l) => l.pays_nom))];
    const bilan = {
      ok: true, depuis: debut, fin, devise, lignes: aEcrire.length,
      pays: new Set(lignes.filter((l) => l.pays_nom !== "Total").map((l) => l.pays_nom)).size,
      semaines: new Set(lignes.map((l) => l.semaine)).size,
      total: totalDe(lignes), total_new: nouvelles ? totalDe(nouvelles) : null, filtre_new: filtre, note_new: noteNew,
      pays_sans_code: sansCode,
    };
    await supabase.from("rc_pays_lectures").insert({ ok: true, detail: bilan });
    return json(bilan);
  } catch (e) {
    const erreur = messageErreur(e);
    await supabase.from("rc_pays_lectures").insert({ ok: false, detail: { erreur } });
    return json({ ok: false, error: erreur }, 502);
  }
});
