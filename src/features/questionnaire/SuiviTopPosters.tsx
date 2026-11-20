import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { lienCapture, type LigneReponse, lireSuivi, type StatutSuivi } from "./api";
import { SECTIONS } from "./questions";

/**
 * 20/11 (Max) : l'onglet « Top posters » de la page Questionnaires : le statut de chaque posteur ciblé, la fiche
 * complète d'une réponse (captures en grand, textes traduits en français) et la comparaison question par question.
 */

export const LIBELLE_STATUT: Record<StatutSuivi, string> = {
  pas_vu: "pas vu",
  vu: "vu",
  plus_tard: "plus tard",
  en_cours: "en cours",
  repondu: "répondu",
  bonus_ajoute: "bonus ajouté",
  bonus_paye: "bonus payé",
};

const COULEUR: Record<StatutSuivi, string> = {
  pas_vu: "text-muted-foreground",
  vu: "",
  plus_tard: "text-amber-700 dark:text-amber-300",
  en_cours: "text-sky-700 dark:text-sky-300",
  repondu: "text-emerald-700 dark:text-emerald-300",
  bonus_ajoute: "text-emerald-700 dark:text-emerald-300",
  bonus_paye: "text-emerald-700 dark:text-emerald-300",
};

const jjmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
const texte = (v: unknown) => (Array.isArray(v) ? v.join(" ; ") : typeof v === "string" ? v : "");

export function SuiviPosteurs({ slug }: { slug: string }) {
  const q = useQuery({ queryKey: ["questionnaire", slug, "suivi"], queryFn: () => lireSuivi(slug), refetchInterval: 60_000 });
  const liste = q.data ?? [];
  const compte = (s: StatutSuivi[]) => liste.filter((l) => s.includes(l.statut)).length;
  return (
    <Card data-testid="suivi-top-posters">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Posteurs ciblés ({liste.length})</CardTitle>
        <CardDescription>
          Pas vu {compte(["pas_vu"])} · vu {compte(["vu"])} · plus tard {compte(["plus_tard"])} · en cours {compte(["en_cours"])} · répondu{" "}
          {compte(["repondu", "bonus_ajoute", "bonus_paye"])} · bonus ajoutés {compte(["bonus_ajoute", "bonus_paye"])} (
          {liste.reduce((s, l) => s + Number(l.bonus_montant ?? 0), 0)} $ / 150 $) · payés {compte(["bonus_paye"])}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {q.error && <p className="text-destructive text-sm">{(q.error as Error).message}</p>}
        {q.data && !liste.length && <p className="text-muted-foreground text-sm">Pop-up pas encore envoyé.</p>}
        {liste.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1.5 pr-2">Posteur</th>
                <th className="py-1.5 pr-2">Comptes</th>
                <th className="py-1.5 pr-2">Paie</th>
                <th className="py-1.5 pr-2">Langue</th>
                <th className="py-1.5 pr-2">Statut</th>
                <th className="py-1.5 pr-2">Vu le</th>
                <th className="py-1.5 pr-2">« Plus tard »</th>
                <th className="py-1.5 pr-2">Terminé le</th>
                <th className="py-1.5 pr-2">Bonus</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((l) => (
                <tr key={l.poster_id} className="border-b last:border-0" data-testid="suivi-ligne">
                  <td className="py-1.5 pr-2 font-medium">{l.nom}</td>
                  <td className="py-1.5 pr-2">{l.comptes ?? "—"}</td>
                  <td className="py-1.5 pr-2">{l.canal_paie === "ruul" ? "Ruul" : "Upwork"}</td>
                  <td className="py-1.5 pr-2">{l.langue}</td>
                  <td className={cn("py-1.5 pr-2 font-medium", COULEUR[l.statut])} data-testid="suivi-statut">{LIBELLE_STATUT[l.statut]}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{jjmm(l.vu_at)}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{l.plus_tard_n ? `${l.plus_tard_n}/3` : "—"}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{jjmm(l.termine_at)}</td>
                  <td className="py-1.5 pr-2">
                    {l.bonus_statut ? `${l.bonus_montant} $ · lundi ${jjmm(l.bonus_lundi)} · ${l.bonus_statut === "paye" ? "payé" : "à payer"}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

/** Les captures d'une question, en grand (liens signés valables 1 h). */
function Captures({ chemins }: { chemins: string[] }) {
  const q = useQuery({
    queryKey: ["questionnaire", "captures", ...chemins],
    queryFn: async () => Promise.all(chemins.map((c) => lienCapture(c))),
    enabled: chemins.length > 0,
    staleTime: 30 * 60_000,
  });
  if (!chemins.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-3">
      {(q.data ?? []).map((u, i) => u && (
        <a key={chemins[i]} href={u} target="_blank" rel="noreferrer">
          <img src={u} alt={`capture ${i + 1}`} className="max-h-[480px] w-auto max-w-full rounded-md border" data-testid="capture-grande" />
        </a>
      ))}
      {q.isLoading && <span className="text-muted-foreground">Chargement des captures…</span>}
    </div>
  );
}

/** La fiche complète d'une réponse : chaque question, la réponse d'origine et sa traduction française. */
export function FicheReponse({ l }: { l: LigneReponse }) {
  return (
    <div className="space-y-4" data-testid="fiche-reponse">
      {SECTIONS.map((s) => (
        <div key={s.id} className="space-y-2">
          <p className="border-b pb-1 font-semibold text-sm">{s.titre}</p>
          {s.questions.map((q) => {
            if (q.type === "capture") {
              return (
                <div key={q.id} className="space-y-1 text-xs">
                  <p className="text-muted-foreground">{q.n}. {q.texte}</p>
                  <Captures chemins={l.captures?.[q.id] ?? []} />
                </div>
              );
            }
            const v = texte(l.reponses[q.id]);
            const d = q.detail ? texte(l.reponses[q.detail.id]) : "";
            if (!v && !d && q.si) return null;
            const fr = l.reponses_fr?.[q.id];
            const frD = q.detail ? l.reponses_fr?.[q.detail.id] : undefined;
            return (
              <div key={q.id} className="text-xs">
                <p className="text-muted-foreground">{q.n}. {q.texte}</p>
                <p className="whitespace-pre-wrap">{v || "—"}{d ? ` · ${q.detail!.libelle} : ${d}` : ""}</p>
                {(fr && fr !== v) || (frD && frD !== d) ? (
                  <p className="whitespace-pre-wrap text-emerald-700 dark:text-emerald-300" data-testid="traduction-fr">
                    FR : {fr && fr !== v ? fr : v}{frD && frD !== d ? ` · ${q.detail!.libelle} : ${frD}` : ""}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** La comparaison : une question, la réponse de chacun (traduite en français), et le décompte des choix. */
export function Comparaison({ lignes }: { lignes: readonly LigneReponse[] }) {
  const questions = SECTIONS.flatMap((s) => s.questions.filter((q) => q.type !== "capture"));
  const [id, setId] = React.useState(questions.find((q) => q.id === "routine")?.id ?? questions[0]!.id);
  const q = questions.find((x) => x.id === id)!;
  const terminees = lignes.filter((l) => l.termine_at);
  const decompte = new Map<string, number>();
  if (q.type === "choix" || q.type === "multi") {
    for (const l of terminees) {
      const v = l.reponses[q.id];
      for (const o of Array.isArray(v) ? v : v ? [v] : []) decompte.set(o, (decompte.get(o) ?? 0) + 1);
    }
  }
  return (
    <Card data-testid="comparaison">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Comparaison question par question</CardTitle>
        <CardDescription>Les réponses terminées ({terminees.length}), traduites en français pour les réponses écrites.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <select className="h-9 w-full max-w-xl rounded-md border bg-background px-2 text-sm" value={id} onChange={(e) => setId(e.target.value)}
          aria-label="Question à comparer" data-testid="comparaison-question">
          {questions.map((x) => <option key={x.id} value={x.id}>{x.n}. {x.texte}</option>)}
        </select>
        {decompte.size > 0 && (
          <div className="flex flex-wrap gap-2" data-testid="comparaison-decompte">
            {[...decompte.entries()].sort((a, b) => b[1] - a[1]).map(([o, n]) => <Badge key={o} variant="outline">{o} : {n}</Badge>)}
          </div>
        )}
        <div className="divide-y rounded-md border">
          {terminees.map((l) => {
            const v = texte(l.reponses[q.id]);
            const fr = l.reponses_fr?.[q.id];
            return (
              <div key={l.id} className="grid gap-1 p-2 text-xs sm:grid-cols-[180px_1fr]" data-testid="comparaison-ligne">
                <span className="font-medium">{l.os?.nom_os ?? l.nom ?? "?"}{l.langue ? <span className="text-muted-foreground"> · {l.langue}</span> : null}</span>
                <span className="whitespace-pre-wrap">
                  {v || "—"}
                  {fr && fr !== v ? <span className="block text-emerald-700 dark:text-emerald-300">FR : {fr}</span> : null}
                </span>
              </div>
            );
          })}
          {!terminees.length && <p className="p-2 text-muted-foreground text-xs">Pas encore de réponse terminée.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
