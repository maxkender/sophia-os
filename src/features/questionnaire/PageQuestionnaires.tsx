import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { envoyerPopup, lienQuestionnaire, type LigneReponse, lirePosteursChoix, lireReponsesAdmin } from "./api";
import { Comparaison, FicheReponse, SuiviPosteurs } from "./SuiviTopPosters";
import { colonnes, SECTIONS, SLUG_TOP_POSTERS } from "./questions";

const COLONNES_OS: { id: string; libelle: string; valeur: (l: LigneReponse) => string }[] = [
  { id: "classement", libelle: "Classement", valeur: (l) => l.os?.classement ?? "" },
  { id: "mediane", libelle: "Médiane vues 30 j", valeur: (l) => (l.os?.vues_mediane_30j ?? "") + "" },
  { id: "moyenne", libelle: "Moyenne vues 30 j", valeur: (l) => (l.os?.vues_moyenne_30j ?? "") + "" },
  { id: "posts", libelle: "Posts 30 j", valeur: (l) => (l.os?.posts_30j ?? "") + "" },
  { id: "labels", libelle: "Label", valeur: (l) => l.os?.labels ?? "" },
  { id: "langue", libelle: "Langue", valeur: (l) => l.os?.langue ?? "" },
  { id: "warmup", libelle: "Start warmup", valeur: (l) => (l.os?.warmup_start ?? "").slice(0, 10) },
  { id: "abonnements", libelle: "Abonnements relevés", valeur: (l) => (l.os?.abonnements ?? "") + "" },
  { id: "premier_post", libelle: "1er post", valeur: (l) => l.os?.premier_post ?? "" },
];

const texte = (v: unknown) => (Array.isArray(v) ? v.join(" ; ") : typeof v === "string" ? v : "");

/** Le CSV : une ligne par personne, identité, données OS, puis toutes les réponses. */
export function versCsv(lignes: readonly LigneReponse[]): string {
  const cols = colonnes();
  const tete = ["Nom", "Email", "TikTok", "Reliée", "Terminé le", ...COLONNES_OS.map((c) => c.libelle), ...cols.map((c) => c.libelle),
    "Captures (nombre)"];
  const echap = (x: string) => (/[",;\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
  const corps = lignes.map((l) => [
    l.nom ?? "", l.email ?? "", l.tiktok ?? "", l.poster_id ? (l.relie_par ?? "oui") : "non reliée", (l.termine_at ?? "").slice(0, 16).replace("T", " "),
    ...COLONNES_OS.map((c) => c.valeur(l)), ...cols.map((c) => texte(l.reponses[c.id])),
    String(Object.values(l.captures ?? {}).reduce((t, x) => t + x.length, 0)),
  ].map(echap).join(","));
  return [tete.map(echap).join(","), ...corps].join("\n");
}

/**
 * 15/11 (Max) : page « Questionnaires ». Le lien à copier, les réponses (une ligne par personne, toutes les
 * réponses et captures, et ses données OS), l'export CSV, et « Envoyer un pop-up » à des posteurs choisis.
 */
export function PageQuestionnaires() {
  const slug = SLUG_TOP_POSTERS;
  const q = useQuery({ queryKey: ["questionnaire", slug, "reponses"], queryFn: () => lireReponsesAdmin(slug), refetchInterval: 60_000 });
  const [copie, setCopie] = React.useState(false);
  const [ouverte, setOuverte] = React.useState<string | null>(null);
  const lien = lienQuestionnaire(slug);
  const lignes = q.data ?? [];
  const terminees = lignes.filter((l) => l.termine_at).length;
  const [onglet, setOnglet] = React.useState<"top" | "lien">("top");
  return (
    <div className="space-y-4" data-testid="page-questionnaires">
      <div>
        <h1 className="font-semibold text-xl">Questionnaires</h1>
        <p className="text-muted-foreground text-sm">Un formulaire par lien, sans connexion. Rien n'apparaît sur le dashboard des posteurs, sauf pour ceux à qui tu envoies le pop-up.</p>
      </div>
      <div className="flex gap-1 border-b text-sm" role="tablist">
        {([["top", "Top posters"], ["lien", "Lien et pop-up"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={onglet === k} onClick={() => setOnglet(k)} data-testid={`onglet-${k}`}
            className={onglet === k ? "border-primary border-b-2 px-3 py-1.5 font-medium" : "px-3 py-1.5 text-muted-foreground"}>
            {l}
          </button>
        ))}
      </div>
      {onglet === "lien" && <>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Top posters</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Input readOnly value={lien} className="max-w-md font-mono text-xs" aria-label="Lien du questionnaire" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => { void navigator.clipboard?.writeText(lien); setCopie(true); setTimeout(() => setCopie(false), 2000); }}
            data-testid="copier-lien"
          >
            {copie ? "Copié ✓" : "Copier le lien"}
          </Button>
          <a href={lien} target="_blank" rel="noreferrer" className="text-sm underline">Ouvrir</a>
          <Button size="sm" variant="secondary" render={<a href={`${lien}?test=1`} target="_blank" rel="noreferrer" />} data-testid="faire-en-test">
            Do the star survey (test)
          </Button>
          <span className="ml-auto text-muted-foreground text-sm">{terminees} terminée{terminees > 1 ? "s" : ""} · {lignes.length - terminees} en cours</span>
        </CardContent>
      </Card>

      <EnvoyerPopup slug={slug} />
      </>}

      {onglet === "top" && <>
      <SuiviPosteurs slug={slug} />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center gap-2 pb-2">
          <CardTitle className="flex-1 text-base">Réponses ({lignes.length})</CardTitle>
          <Button
            size="sm"
            variant="outline"
            disabled={!lignes.length}
            data-testid="export-csv"
            onClick={() => {
              const blob = new Blob([String.fromCharCode(0xfeff), versCsv(lignes)], { type: "text/csv;charset=utf-8" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `questionnaire-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
            }}
          >
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {q.error && <p className="text-destructive text-sm">{(q.error as Error).message}</p>}
          {!q.data && !q.error && <p className="text-muted-foreground text-sm">Chargement…</p>}
          {q.data && lignes.length === 0 && <p className="text-muted-foreground text-sm">Pas encore de réponse.</p>}
          {lignes.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-2">Personne</th>
                  <th className="py-1.5 pr-2">Statut</th>
                  {COLONNES_OS.map((c) => <th key={c.id} className="whitespace-nowrap py-1.5 pr-2">{c.libelle}</th>)}
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <React.Fragment key={l.id}>
                    <tr className="cursor-pointer border-border/40 border-b hover:bg-muted/40" onClick={() => setOuverte(ouverte === l.id ? null : l.id)} data-testid="ligne-reponse">
                      <td className="py-1.5 pr-2">
                        <b>{l.nom ?? "?"}</b>
                        <span className="block text-muted-foreground">{l.email} · @{l.tiktok}</span>
                      </td>
                      <td className="py-1.5 pr-2">
                        {l.termine_at ? <Badge variant="outline">terminé</Badge> : <Badge variant="outline">écran {l.section}/{SECTIONS.length + 1}</Badge>}{" "}
                        {l.poster_id ? <Badge variant="outline">reliée ({l.relie_par})</Badge> : <Badge variant="destructive">non reliée</Badge>}
                        {l.langue && l.langue !== "en" ? <> <Badge variant="outline">{l.langue}</Badge></> : null}
                        {l.bonus ? <> <Badge variant="outline">bonus {l.bonus.montant} $ · {l.bonus.lundi.slice(8, 10)}/{l.bonus.lundi.slice(5, 7)} · {l.bonus.statut}</Badge></> : null}
                      </td>
                      {COLONNES_OS.map((c) => <td key={c.id} className="whitespace-nowrap py-1.5 pr-2">{c.valeur(l) || "—"}</td>)}
                    </tr>
                    {ouverte === l.id && (
                      <tr className="border-b bg-muted/20">
                        <td colSpan={2 + COLONNES_OS.length} className="p-3"><FicheReponse l={l} /></td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Comparaison lignes={lignes} />
      </>}
    </div>
  );
}

function EnvoyerPopup({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const [filtre, setFiltre] = React.useState("");
  const [choisis, setChoisis] = React.useState<Set<string>>(new Set());
  const posteurs = useQuery({ queryKey: ["questionnaire", slug, "posteurs"], queryFn: () => lirePosteursChoix(slug), enabled: ouvert });
  const m = useMutation({
    mutationFn: () => envoyerPopup(slug, [...choisis]),
    onSuccess: () => { setChoisis(new Set()); void qc.invalidateQueries({ queryKey: ["questionnaire", slug] }); },
  });
  const liste = (posteurs.data ?? []).filter((p) => `${p.nom ?? ""} ${p.handle ?? ""}`.toLowerCase().includes(filtre.trim().toLowerCase()));
  return (
    <Card data-testid="envoyer-popup">
      <CardHeader className="flex-row flex-wrap items-center gap-2 pb-2">
        <div className="flex-1">
          <CardTitle className="text-base">Envoyer un pop-up</CardTitle>
          <p className="text-muted-foreground text-xs">Seuls les posteurs choisis voient un pop-up avec le lien sur leur dashboard. Il disparaît quand ils ont répondu ou cliqué « Later ».</p>
        </div>
        {!ouvert && <Button size="sm" onClick={() => setOuvert(true)}>Choisir des posteurs</Button>}
      </CardHeader>
      {ouvert && (
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Nom ou @…" className="max-w-xs" aria-label="Chercher un posteur" />
            <span className="text-muted-foreground text-xs">{choisis.size} choisi{choisis.size > 1 ? "s" : ""}</span>
            <Button size="sm" className="ml-auto" disabled={!choisis.size || m.isPending} onClick={() => m.mutate()} data-testid="envoyer-popup-bouton">
              Envoyer le pop-up ({choisis.size})
            </Button>
          </div>
          {m.isSuccess && <p className="text-success text-xs">Pop-up envoyé à {m.data} posteur{m.data > 1 ? "s" : ""}.</p>}
          {m.error && <p className="text-destructive text-xs">{(m.error as Error).message}</p>}
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {posteurs.isLoading && <p className="p-2 text-muted-foreground text-sm">Chargement…</p>}
            {liste.map((p) => (
              <label key={p.id} className="flex items-center gap-2 border-b px-3 py-1.5 text-sm last:border-0 hover:bg-muted/40">
                <input
                  type="checkbox"
                  checked={choisis.has(p.id)}
                  onChange={(e) => {
                    const s = new Set(choisis);
                    if (e.target.checked) s.add(p.id); else s.delete(p.id);
                    setChoisis(s);
                  }}
                  aria-label={`Choisir ${p.nom ?? p.id}`}
                />
                <span className="min-w-0 flex-1 truncate">{p.nom ?? "?"} <span className="text-muted-foreground">{p.handle ? `@${p.handle}` : ""}</span></span>
                {p.classement && <Badge variant="outline">{p.classement}</Badge>}
                {p.repondu ? <Badge variant="outline">a répondu</Badge> : p.popup === "envoye" ? <Badge variant="outline">pop-up envoyé</Badge>
                  : p.popup === "plus_tard" ? <Badge variant="outline">« Later »</Badge> : null}
              </label>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
