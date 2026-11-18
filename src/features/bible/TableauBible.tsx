/**
 * 18/11 : la vue tableau de la Bible : les mêmes comptes en lignes, triables, éditables sur place (statut,
 * label, note, angle), et l'import en lot (mêmes appels que le formulaire d'import existant, sans rien changer
 * à sa logique : création de la source, ses labels, la file des mises à jour).
 */
import * as React from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ajouterSourceALaFile, creerSource, setLabelsSource } from "@/features/moteur/api";

import { SELECT } from "./AjoutComptes";
import { majFiche } from "./api";
import { useBible, useRafraichirBible } from "./donnees";
import { type Carte, nombreCourt } from "./modele";
import { LIBELLE_STATUT, STATUTS, type StatutBible } from "./types";

type Tri = "handle" | "statut" | "label" | "abonnes" | "vues" | "ajout";

function ChampTexte({ valeur, onSave, placeholder }: { valeur: string | null; onSave: (v: string) => void; placeholder?: string }) {
  const [v, setV] = React.useState(valeur ?? "");
  React.useEffect(() => setV(valeur ?? ""), [valeur]);
  return <Input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (valeur ?? "") && onSave(v)} placeholder={placeholder} className="h-8 min-w-40 text-xs" />;
}

export function TableauBible({ liste, onOuvrir }: { liste: Carte[]; onOuvrir: (c: Carte) => void }) {
  const { labels, fiches, apps } = useBible();
  const rafraichir = useRafraichirBible();
  const [tri, setTri] = React.useState<Tri>("ajout");
  const [sens, setSens] = React.useState<1 | -1>(-1);
  const [choix, setChoix] = React.useState<Set<string>>(new Set());
  const [message, setMessage] = React.useState<string | null>(null);

  const valeur = (c: Carte): string | number => ({
    handle: c.handle, statut: c.statut, label: c.labelNom ?? "~", abonnes: c.abonnes ?? -1, vues: c.vuesMediane ?? -1, ajout: c.ajouteAt,
  })[tri];
  const lignes = [...liste].sort((a, b) => {
    const x = valeur(a);
    const y = valeur(b);
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sens;
  });
  const trier = (t: Tri) => {
    if (t === tri) setSens((s) => (s === 1 ? -1 : 1));
    else {
      setTri(t);
      setSens(1);
    }
  };

  const enregistrer = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof majFiche>[1] }) => majFiche(id, patch),
    onSuccess: () => rafraichir(),
    onError: (e) => setMessage((e as Error).message),
  });

  const importerLot = useMutation({
    mutationFn: async () => {
      const faits: string[] = [];
      const sautes: string[] = [];
      for (const c of lignes.filter((x) => x.bibleId && choix.has(x.bibleId))) {
        const f = fiches.find((x) => x.id === c.bibleId)!;
        const label = labels.find((l) => l.id === f.label_id);
        if (!label) {
          sautes.push(`@${f.handle} (${f.label_propose_id ? "valide d'abord le label" : "pas de label"})`);
          continue;
        }
        if (!f.langue) {
          sautes.push(`@${f.handle} (langue manquante)`);
          continue;
        }
        const cree = await creerSource({ handle: f.handle, niche: label.nom, langue: f.langue });
        await setLabelsSource(cree.id, [label.id]);
        await ajouterSourceALaFile(cree.id);
        faits.push(`@${f.handle}`);
      }
      return { faits, sautes };
    },
    onSuccess: ({ faits, sautes }) => {
      setMessage([faits.length ? `Importés : ${faits.join(", ")}.` : "", sautes.length ? `Pas importés : ${sautes.join(", ")}.` : ""].filter(Boolean).join(" "));
      setChoix(new Set());
      rafraichir();
    },
    onError: (e) => setMessage((e as Error).message),
  });

  const Th = ({ t, children }: { t?: Tri; children: React.ReactNode }) => (
    <th className="pb-2 pr-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {t ? <button type="button" onClick={() => trier(t)} className="uppercase hover:text-foreground">{children}{tri === t ? (sens === 1 ? " ↑" : " ↓") : ""}</button> : children}
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={!choix.size || importerLot.isPending} onClick={() => importerLot.mutate()}>
          {importerLot.isPending ? "Import en cours…" : `Importer la sélection (${choix.size})`}
        </Button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[1000px] text-sm" data-testid="tableau-bible">
          <thead className="border-b">
            <tr className="[&>th]:px-3 [&>th]:pt-3">
              <Th>{""}</Th><Th t="handle">Compte</Th><Th t="statut">Statut</Th><Th>Apps</Th><Th t="label">Label</Th>
              <Th>Note pour l'import</Th><Th>Angle</Th><Th t="abonnes">Abonnés</Th><Th t="vues">Vues méd.</Th><Th t="ajout">Ajouté</Th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((c) => {
              const f = c.bibleId ? fiches.find((x) => x.id === c.bibleId) : null;
              return (
                <tr key={c.cle} className="border-t align-top [&>td]:px-3 [&>td]:py-2">
                  <td>
                    {f && !f.compte_reference_id && (
                      <input type="checkbox" aria-label={`Choisir @${c.handle}`} checked={choix.has(f.id)} onChange={(e) => setChoix((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(f.id);
                        else n.delete(f.id);
                        return n;
                      })} />
                    )}
                  </td>
                  <td><button type="button" className="font-medium hover:underline" onClick={() => onOuvrir(c)}>@{c.handle}</button></td>
                  <td>
                    {f ? (
                      <select className={`${SELECT} h-8 min-w-28 text-xs`} value={f.statut} onChange={(e) => enregistrer.mutate({ id: f.id, patch: { statut: e.target.value as StatutBible } })}>
                        {STATUTS.map((s) => <option key={s} value={s}>{LIBELLE_STATUT[s]}</option>)}
                      </select>
                    ) : LIBELLE_STATUT[c.statut]}
                  </td>
                  <td className="text-xs">{[...c.appIds.map((id) => apps.find((a) => a.id === id)?.nom ?? "?"), ...c.appsAttente].join(", ") || "—"}</td>
                  <td>
                    {f && !f.label_propose_id ? (
                      <select className={`${SELECT} h-8 min-w-36 text-xs`} value={f.label_id ?? ""} onChange={(e) => enregistrer.mutate({ id: f.id, patch: { label_id: e.target.value || null } })}>
                        <option value="">—</option>
                        {labels.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs">{c.labelNom ?? "—"}{c.labelProposeId ? " (proposé)" : ""}</span>
                    )}
                  </td>
                  <td>{f ? <ChampTexte valeur={f.note_import} onSave={(v) => enregistrer.mutate({ id: f.id, patch: { note_import: v || null } })} /> : <span className="text-xs">{c.note ?? "—"}</span>}</td>
                  <td>{f ? <ChampTexte valeur={f.angle} onSave={(v) => enregistrer.mutate({ id: f.id, patch: { angle: v || null } })} /> : <span className="text-xs">{c.angle ?? "—"}</span>}</td>
                  <td className="text-xs tabular-nums">{nombreCourt(c.abonnes)}</td>
                  <td className="text-xs tabular-nums">{nombreCourt(c.vuesMediane)}</td>
                  <td className="text-xs text-muted-foreground">{new Date(c.ajouteAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
