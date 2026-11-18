/**
 * 18/11 : « Ajouter un compte » (un à un, tout facultatif sauf le lien du profil) et « Ajout en masse »
 * (les lignes de Max, avec un aperçu corrigeable avant d'enregistrer). Un handle déjà connu (bible ou compte
 * de référence) n'est jamais recréé : on ouvre la fiche existante.
 */
import * as React from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";

import { ajouterFiche, chercherDoublon, type Doublon, type NouvelleFiche, rafraichirMiniatures } from "./api";
import { appsAttenteConnues, useBible, useRafraichirBible } from "./donnees";
import { handleDe, type LigneLue, lireLignes, nomLabelValide } from "./parse";
import { LIBELLE_STATUT, type NicheStatut, type RegleSujet, STATUTS, type StatutBible } from "./types";

export const SELECT = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** « culture G → Sophia » : une règle par ligne. */
export function lireRegles(texte: string): RegleSujet[] {
  return texte.split(/\r?\n/).map((l) => l.split(/→|->|=>|:/).map((x) => x.trim())).filter((p) => p.length >= 2 && p[0] && p[1])
    .map(([sujet, app, label]) => ({ sujet: sujet!, app: app!, label: label || null }));
}
export function ecrireRegles(r: RegleSujet[]): string {
  return r.map((x) => [x.sujet, x.app, x.label].filter(Boolean).join(" → ")).join("\n");
}

/** Les apps (cases) + une app en attente de création (texte libre). */
export function ChoixApps({ valeur, attente, onChange, onAttente }: {
  valeur: string[]; attente: string[]; onChange: (ids: string[]) => void; onAttente: (a: string[]) => void;
}) {
  const { apps, fiches, proposes } = useBible();
  const connues = appsAttenteConnues(fiches, proposes);
  const [nouvelle, setNouvelle] = React.useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {apps.map((a) => (
          <label key={a.id} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
            <input type="checkbox" checked={valeur.includes(a.id)} onChange={(e) => onChange(e.target.checked ? [...valeur, a.id] : valeur.filter((x) => x !== a.id))} />
            {a.nom}
          </label>
        ))}
        {[...new Set([...connues, ...attente])].map((a) => (
          <label key={a} className="flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs">
            <input type="checkbox" checked={attente.includes(a)} onChange={(e) => onAttente(e.target.checked ? [...attente, a] : attente.filter((x) => x !== a))} />
            {a} <span className="text-muted-foreground">(en attente)</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={nouvelle} onChange={(e) => setNouvelle(e.target.value)} placeholder="Autre app (ex. Runvik – running)" className="h-8 text-xs" />
        <Button type="button" size="sm" variant="outline" disabled={!nouvelle.trim()} onClick={() => { onAttente([...attente, nouvelle.trim()]); setNouvelle(""); }}>
          Ajouter
        </Button>
      </div>
    </div>
  );
}

/** Le label : la liste des labels existants (filtrée par les apps choisies), ou un nouveau label proposé. */
export function ChoixLabel({ apps, labelId, propose, onLabel, onPropose }: {
  apps: string[]; labelId: string | null; propose: { nom: string; description_da: string } | null;
  onLabel: (id: string | null) => void; onPropose: (p: { nom: string; description_da: string } | null) => void;
}) {
  const { labels } = useBible();
  const liste = apps.length ? labels.filter((l) => l.apps.some((a) => apps.includes(a)) || apps.includes(l.application_id)) : labels;
  return (
    <div className="space-y-2">
      <select
        className={SELECT}
        value={propose ? "__nouveau" : labelId ?? ""}
        onChange={(e) => {
          if (e.target.value === "__nouveau") {
            onLabel(null);
            onPropose({ nom: "", description_da: "" });
          } else {
            onPropose(null);
            onLabel(e.target.value || null);
          }
        }}
      >
        <option value="">— pas encore de label —</option>
        {liste.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
        <option value="__nouveau">+ Proposer un nouveau label…</option>
      </select>
      {propose && (
        <div className="space-y-2 rounded-lg border border-dashed p-2">
          <Input
            value={propose.nom}
            onChange={(e) => onPropose({ ...propose, nom: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
            placeholder="nom_du_label (ex. anxiety_run)"
            aria-invalid={Boolean(propose.nom) && !nomLabelValide(propose.nom)}
          />
          <Textarea
            value={propose.description_da}
            onChange={(e) => onPropose({ ...propose, description_da: e.target.value })}
            placeholder="DA : type de photos, couleur et taille du texte, police, vibe"
            rows={2}
          />
        </div>
      )}
    </div>
  );
}

function Champ({ label, children, aide, large }: { label: string; children: React.ReactNode; aide?: string; large?: boolean }) {
  return (
    <div className={large ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
      <Label className="text-xs">{label}</Label>
      {children}
      {aide && <p className="text-[11px] text-muted-foreground">{aide}</p>}
    </div>
  );
}

export function MessageDoublon({ d, onOuvrir }: { d: Doublon; onOuvrir: (d: Doublon) => void }) {
  return (
    <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      @{d.handle} existe déjà {d.bible_id ? "dans la bible" : "dans les comptes de référence (déjà importé)"}.{" "}
      <button type="button" className="font-medium underline underline-offset-2" onClick={() => onOuvrir(d)}>Ouvrir la fiche</button>
    </p>
  );
}

export function FormAjoutCompte({ onFermer, onOuvrirDoublon }: { onFermer: () => void; onOuvrirDoublon: (d: Doublon) => void }) {
  const rafraichir = useRafraichirBible();
  const [profil, setProfil] = React.useState("");
  const [posts, setPosts] = React.useState(["", "", ""]);
  const [statut, setStatut] = React.useState<StatutBible>("a_trier");
  const [apps, setApps] = React.useState<string[]>([]);
  const [attente, setAttente] = React.useState<string[]>([]);
  const [labelId, setLabelId] = React.useState<string | null>(null);
  const [propose, setPropose] = React.useState<{ nom: string; description_da: string } | null>(null);
  const [note, setNote] = React.useState("");
  const [angle, setAngle] = React.useState("");
  const [nicheStatut, setNicheStatut] = React.useState<NicheStatut | "">("");
  const [niche, setNiche] = React.useState("");
  const [polyvalent, setPolyvalent] = React.useState(false);
  const [regles, setRegles] = React.useState("");
  const [langue, setLangue] = React.useState("");
  const [pays, setPays] = React.useState("");
  const [doublon, setDoublon] = React.useState<Doublon | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const handle = handleDe(profil) ?? handleDe(posts.find(Boolean) ?? "");

  const ajouter = useMutation({
    mutationFn: async () => {
      if (!handle) throw new Error("Colle le lien du profil TikTok (ou d'un de ses posts).");
      if (propose && !nomLabelValide(propose.nom)) throw new Error("Le nom du label proposé doit être en snake_case (ex. anxiety_run).");
      const f: NouvelleFiche = {
        handle, profil_url: profil.includes("tiktok.com") ? profil.trim() : null, statut, application_ids: apps, apps_attente: attente,
        label_id: labelId, label_propose: propose, note_import: note, angle, niche_statut: nicheStatut || null, niche,
        polyvalent, polyvalent_regles: polyvalent ? lireRegles(regles) : [], langue, pays, posts: posts.map((p) => p.trim()).filter(Boolean),
      };
      const r = await ajouterFiche(f);
      if (!r.cree) return r;
      await rafraichir();
      await rafraichirMiniatures(r.id).catch(() => null);
      return r;
    },
    onSuccess: (r) => {
      rafraichir();
      if (!r.cree) {
        setDoublon(r.doublon);
        return;
      }
      setMessage(`@${handle} ajouté à la bible.`);
      setProfil("");
      setPosts(["", "", ""]);
      setNote("");
      setAngle("");
      setDoublon(null);
    },
    onError: (e) => setMessage((e as Error).message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ajouter un compte</CardTitle>
        <CardDescription>Seul le lien du profil est obligatoire : stocke vite, trie plus tard.</CardDescription>
        <CardAction><Button size="sm" variant="ghost" onClick={onFermer}>Fermer</Button></CardAction>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setMessage(null);
            ajouter.mutate();
          }}
        >
          <Champ label="Lien du profil TikTok" large>
            <Input
              value={profil}
              onChange={(e) => setProfil(e.target.value)}
              onBlur={async () => {
                const h = handleDe(profil);
                if (!h) return;
                const d = await chercherDoublon(h).catch(() => null);
                setDoublon(d && (d.bible_id || d.compte_reference_id) ? d : null);
              }}
              placeholder="https://www.tiktok.com/@compte"
              required
            />
          </Champ>
          {doublon && <div className="sm:col-span-2"><MessageDoublon d={doublon} onOuvrir={onOuvrirDoublon} /></div>}
          <Champ label="3 posts de référence (facultatif)" aide="Sans lien, l'OS prend les 3 posts les plus vus des ~12 derniers." large>
            <div className="grid gap-2 sm:grid-cols-3">
              {posts.map((p, i) => (
                <Input key={i} value={p} onChange={(e) => setPosts(posts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Lien du post ${i + 1}`} />
              ))}
            </div>
          </Champ>
          <Champ label="Apps visées" large><ChoixApps valeur={apps} attente={attente} onChange={setApps} onAttente={setAttente} /></Champ>
          <Champ label="Label"><ChoixLabel apps={apps} labelId={labelId} propose={propose} onLabel={setLabelId} onPropose={setPropose} /></Champ>
          <Champ label="Statut">
            <select className={SELECT} value={statut} onChange={(e) => setStatut(e.target.value as StatutBible)}>
              {STATUTS.filter((s) => s !== "importe").map((s) => <option key={s} value={s}>{LIBELLE_STATUT[s]}</option>)}
            </select>
          </Champ>
          <Champ label="Note pour l'import" aide="Ex. refaire avec d'autres photos, vraie personne ; tout copier sur un compte.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </Champ>
          <Champ label="Angle de placement" aide="Ex. « my training plan is from Runvik » en légende, « Day X of ».">
            <Textarea value={angle} onChange={(e) => setAngle(e.target.value)} rows={2} />
          </Champ>
          <Champ label="Compte 100 % niché ?">
            <div className="flex gap-2">
              <select className={SELECT} value={nicheStatut} onChange={(e) => setNicheStatut(e.target.value as NicheStatut | "")}>
                <option value="">—</option><option value="oui">oui</option><option value="non">non</option><option value="partiel">partiel</option>
              </select>
              <Input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="niche (running, study…)" />
            </div>
          </Champ>
          <Champ label="Langue et pays du compte">
            <div className="flex gap-2">
              <select className={SELECT} value={langue} onChange={(e) => setLangue(e.target.value)}>
                <option value="">—</option>
                {LANGUES_CIBLES.map((l) => <option key={l} value={l}>{nomLangue(l)}</option>)}
              </select>
              <Input value={pays} onChange={(e) => setPays(e.target.value.toUpperCase().slice(0, 2))} placeholder="Pays (US)" className="w-24" />
            </div>
          </Champ>
          <Champ label="Polyvalent ?" large>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={polyvalent} onChange={(e) => setPolyvalent(e.target.checked)} /> Le compte sert plusieurs apps selon le sujet du post</label>
            {polyvalent && (
              <Textarea value={regles} onChange={(e) => setRegles(e.target.value)} rows={3} placeholder={"culture G → Sophia\nécole → micabo\ndéstresser → Runvik – running"} />
            )}
          </Champ>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={ajouter.isPending || !handle}>{ajouter.isPending ? "Enregistrement…" : "Ajouter à la bible"}</Button>
            {message && <p className={ajouter.isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{message}</p>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

interface LigneApercu extends LigneLue {
  doublon: Doublon | null;
  garder: boolean;
}

export const EXEMPLE_MASSE = [
  "pour sophia clean_girl : https://www.tiktok.com/@crushedethereal",
  "alpha_male, mettre running dessus : https://www.tiktok.com/@trusttheprocces1",
  "nouveau label anxiety_run : https://www.tiktok.com/@sydneysynced",
].join("\n");

export function AjoutEnMasse({ onFermer, onOuvrirDoublon }: { onFermer: () => void; onOuvrirDoublon: (d: Doublon) => void }) {
  const { apps, labels, fiches, proposes } = useBible();
  const rafraichir = useRafraichirBible();
  const [texte, setTexte] = React.useState("");
  const [lignes, setLignes] = React.useState<LigneApercu[] | null>(null);
  const [bilan, setBilan] = React.useState<string | null>(null);

  const apercu = useMutation({
    mutationFn: async () => {
      const lues = lireLignes(texte, apps, labels, appsAttenteConnues(fiches, proposes));
      return await Promise.all(lues.map(async (l) => {
        const d = l.handle ? await chercherDoublon(l.handle).catch(() => null) : null;
        const doublon = d && (d.bible_id || d.compte_reference_id) ? d : null;
        return { ...l, doublon, garder: !l.erreur && !doublon };
      }));
    },
    onSuccess: (l) => {
      setLignes(l);
      setBilan(null);
    },
  });

  const enregistrer = useMutation({
    mutationFn: async () => {
      const faites: string[] = [];
      const ids: string[] = [];
      for (const l of (lignes ?? []).filter((x) => x.garder && x.handle)) {
        const r = await ajouterFiche({
          handle: l.handle!, profil_url: l.profilUrl, application_ids: l.appIds, apps_attente: l.appsAttente,
          label_id: l.labelId, label_propose: l.labelPropose ? { nom: l.labelPropose } : null, note_import: l.note,
          polyvalent: l.autres.length > 0, polyvalent_regles: l.autres, posts: l.posts,
        });
        if (r.cree) {
          faites.push(l.handle!);
          ids.push(r.id);
        }
      }
      await rafraichir();
      for (const id of ids) await rafraichirMiniatures(id).catch(() => null);
      return faites;
    },
    onSuccess: (faites) => {
      rafraichir();
      setBilan(`${faites.length} fiche${faites.length > 1 ? "s" : ""} créée${faites.length > 1 ? "s" : ""} : ${faites.map((h) => `@${h}`).join(", ")}.`);
      setLignes(null);
      setTexte("");
    },
    onError: (e) => setBilan((e as Error).message),
  });

  const maj = (i: number, patch: Partial<LigneApercu>) => setLignes((ls) => (ls ?? []).map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ajout en masse</CardTitle>
        <CardDescription>Une ligne par compte : le lien donne le handle, l'app et le label sont reconnus, le reste va dans la note. Aperçu avant d'enregistrer.</CardDescription>
        <CardAction><Button size="sm" variant="ghost" onClick={onFermer}>Fermer</Button></CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={5} placeholder={EXEMPLE_MASSE} className="font-mono text-xs" data-testid="masse-texte" />
        <div className="flex gap-2">
          <Button onClick={() => apercu.mutate()} disabled={!texte.trim() || apercu.isPending}>{apercu.isPending ? "Lecture…" : "Aperçu"}</Button>
          {!texte && <Button variant="outline" onClick={() => setTexte(EXEMPLE_MASSE)}>Mettre l'exemple</Button>}
        </div>
        {lignes && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm" data-testid="masse-apercu">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-3">Créer</th><th className="pb-2 pr-3">Compte</th><th className="pb-2 pr-3">Apps</th>
                  <th className="pb-2 pr-3">Label</th><th className="pb-2 pr-3">Note pour l'import</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={i} className="border-t align-top">
                    <td className="py-2 pr-3"><input type="checkbox" checked={l.garder} disabled={Boolean(l.erreur || l.doublon)} onChange={(e) => maj(i, { garder: e.target.checked })} /></td>
                    <td className="py-2 pr-3">
                      {l.handle ? <span className="font-medium">@{l.handle}</span> : <span className="text-destructive">{l.erreur}</span>}
                      {l.posts.length > 0 && <p className="text-[11px] text-muted-foreground">{l.posts.length} lien(s) de post</p>}
                      {l.doublon && <MessageDoublon d={l.doublon} onOuvrir={onOuvrirDoublon} />}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {[...l.appIds.map((id) => apps.find((a) => a.id === id)?.nom ?? id), ...l.appsAttente.map((a) => `${a} (en attente)`)].join(", ") || "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      <select
                        className={SELECT}
                        value={l.labelPropose ? `__p:${l.labelPropose}` : l.labelId ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          maj(i, v.startsWith("__p:") ? { labelPropose: v.slice(4), labelId: null } : { labelId: v || null, labelPropose: null });
                        }}
                      >
                        <option value="">— aucun —</option>
                        {l.labelPropose && <option value={`__p:${l.labelPropose}`}>nouveau : {l.labelPropose}</option>}
                        {labels.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
                      </select>
                      {l.autres.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">+ {l.autres.map((a) => a.label).join(", ")} (polyvalent)</p>}
                    </td>
                    <td className="py-2 pr-3"><Input value={l.note} onChange={(e) => maj(i, { note: e.target.value })} className="h-8 text-xs" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex items-center gap-3">
              <Button onClick={() => enregistrer.mutate()} disabled={enregistrer.isPending || !lignes.some((l) => l.garder)}>
                {enregistrer.isPending ? "Enregistrement…" : `Enregistrer ${lignes.filter((l) => l.garder).length} fiche(s)`}
              </Button>
              <p className="text-xs text-muted-foreground">Les nouveaux labels sont créés « à valider » ; rien n'entre dans les vrais labels sans ton clic.</p>
            </div>
          </div>
        )}
        {bilan && <p className="text-sm text-muted-foreground">{bilan}</p>}
      </CardContent>
    </Card>
  );
}
