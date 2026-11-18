/**
 * 18/11 : la fiche d'un compte de la Bible : tout le détail éditable, les 3 posts (« Rafraîchir les
 * miniatures »), l'historique des modifications et « Importer » (le flux d'import existant, pré-rempli).
 */
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ExternalLink, RefreshCw, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import { supabase } from "@/lib/supabase/client";

import { ChoixApps, ChoixLabel, ecrireRegles, lireRegles, SELECT } from "./AjoutComptes";
import { lireHistorique, majFiche, proposerLabel, rafraichirMiniatures } from "./api";
import { COULEUR_STATUT, HandleLien, Miniatures, Pastille } from "./CarteCompte";
import { useBible, useRafraichirBible } from "./donnees";
import { nombreCourt } from "./modele";
import { nomLabelValide } from "./parse";
import { type FicheBible, LIBELLE_STATUT, type NicheStatut, STATUTS, type StatutBible } from "./types";

export type Ouverture = { bibleId: string | null; refId: string | null } | null;

const LIBELLE_CHAMP: Record<string, string> = {
  statut: "statut", label_id: "label", label_propose_id: "label proposé", note_import: "note pour l'import", angle: "angle",
  application_ids: "apps", apps_attente: "apps en attente", niche_statut: "niché", niche: "niche", polyvalent: "polyvalent",
  polyvalent_regles: "règles polyvalent", langue: "langue", pays: "pays", posts: "posts", compte_reference_id: "compte de référence",
  abonnes: "abonnés", vues_mediane: "vues médianes", miniatures_statut: "miniatures", autre_app: "idée d'app",
};

function resume(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.length ? `${v.length} élément(s)` : "—";
  if (typeof v === "object") return "…";
  return String(v).slice(0, 60);
}

export function FicheCompte({ ouverture, onFermer }: { ouverture: Ouverture; onFermer: () => void }) {
  const { fiches, importes, labels, proposes, apps, noms } = useBible();
  const fiche = ouverture?.bibleId ? fiches.find((f) => f.id === ouverture.bibleId) ?? null : null;
  const ref = importes.find((r) => r.compte_reference_id === (ouverture?.refId ?? fiche?.compte_reference_id)) ?? null;
  return (
    <Sheet open={Boolean(ouverture)} onOpenChange={(o) => !o && onFermer()}>
      <SheetPopup side="right" className="w-full sm:max-w-xl" data-testid="fiche-bible">
        {ouverture && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <HandleLien handle={(fiche?.handle ?? ref?.handle)!} />
                {fiche && <Pastille className={COULEUR_STATUT[fiche.statut]}>{LIBELLE_STATUT[fiche.statut]}</Pastille>}
                {!fiche && ref && <Pastille className={COULEUR_STATUT.importe}>importé</Pastille>}
              </SheetTitle>
            </SheetHeader>
            <SheetPanel className="space-y-5">
              {fiche ? (
                <Edition key={fiche.id + fiche.modifie_at} fiche={fiche} />
              ) : ref ? (
                <div className="space-y-3 text-sm">
                  <Miniatures urls={ref.slides} liens={ref.slides_posts} handle={ref.handle} />
                  <p>Labels : {ref.labels.map((l) => l.nom).join(", ") || "—"} · langue {ref.langue ?? "—"} · {ref.posts} posts importés · vues médianes {nombreCourt(ref.vues_mediane)}</p>
                  <p className="text-muted-foreground">Compte de référence importé avant la bible : pas encore de fiche.</p>
                  <CreerFicheImporte refId={ref.compte_reference_id} handle={ref.handle} langue={ref.langue} labelId={ref.labels[0]?.id ?? null} appIds={[...new Set(ref.labels.flatMap((l) => labels.find((x) => x.id === l.id)?.apps ?? []))]} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Fiche introuvable.</p>
              )}
              {fiche && <HistoriqueFiche id={fiche.id} noms={noms} />}
              {fiche && fiche.ajoute_par && <p className="text-[11px] text-muted-foreground">Ajouté par {noms[fiche.ajoute_par] ?? "admin"} le {new Date(fiche.ajoute_at).toLocaleDateString("fr-FR")}{proposes.length && apps.length ? "" : ""}.</p>}
            </SheetPanel>
          </>
        )}
      </SheetPopup>
    </Sheet>
  );
}

function CreerFicheImporte(p: { refId: string; handle: string; langue: string | null; labelId: string | null; appIds: string[] }) {
  const rafraichir = useRafraichirBible();
  const creer = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bible_comptes").insert({
        handle: p.handle, profil_url: `https://www.tiktok.com/@${p.handle}`, statut: "importe", compte_reference_id: p.refId,
        langue: p.langue, label_id: p.labelId, application_ids: p.appIds,
      });
      if (error) throw error;
    },
    onSuccess: () => rafraichir(),
  });
  return <Button size="sm" variant="outline" onClick={() => creer.mutate()} disabled={creer.isPending}>Créer sa fiche (note, angle, niche…)</Button>;
}

function Edition({ fiche }: { fiche: FicheBible }) {
  const navigate = useNavigate();
  const { labels, proposes } = useBible();
  const rafraichir = useRafraichirBible();
  const [f, setF] = React.useState<FicheBible>(fiche);
  const [propose, setPropose] = React.useState<{ nom: string; description_da: string } | null>(null);
  const [regles, setRegles] = React.useState(ecrireRegles(fiche.polyvalent_regles ?? []));
  const [liens, setLiens] = React.useState([0, 1, 2].map((i) => fiche.posts?.[i]?.url ?? ""));
  const [message, setMessage] = React.useState<string | null>(null);
  const maj = (patch: Partial<FicheBible>) => setF((x) => ({ ...x, ...patch }));
  const proposeActuel = f.label_propose_id ? proposes.find((p) => p.id === f.label_propose_id) ?? null : null;
  const labelBloque = !f.label_id && Boolean(proposeActuel && proposeActuel.statut !== "valide");

  const enregistrer = useMutation({
    mutationFn: async () => {
      let labelProposeId = f.label_propose_id;
      if (propose) {
        if (!nomLabelValide(propose.nom)) throw new Error("Le nom du label proposé doit être en snake_case (ex. anxiety_run).");
        labelProposeId = await proposerLabel({ nom: propose.nom, description_da: propose.description_da, application_ids: f.application_ids, apps_attente: f.apps_attente });
      }
      const anciensPosts = fiche.posts ?? [];
      const posts = liens.map((u) => u.trim()).filter(Boolean).slice(0, 3).map((url) => anciensPosts.find((p) => p.url === url) ?? { url });
      const postsChanges = JSON.stringify(posts.map((p) => p.url)) !== JSON.stringify(anciensPosts.map((p) => p.url));
      await majFiche(f.id, {
        statut: f.statut, application_ids: f.application_ids, apps_attente: f.apps_attente,
        label_id: propose ? null : f.label_id, label_propose_id: propose ? labelProposeId : f.label_id ? null : f.label_propose_id,
        note_import: f.note_import || null, angle: f.angle || null, niche_statut: f.niche_statut, niche: f.niche || null,
        polyvalent: f.polyvalent, polyvalent_regles: f.polyvalent ? lireRegles(regles) : [], langue: f.langue || null, pays: f.pays || null,
        autre_app: f.autre_app?.trim() || null,
        abonnes: f.abonnes, vues_mediane: f.vues_mediane, meilleur_post_url: f.meilleur_post_url || null,
        stats_source: f.abonnes !== fiche.abonnes || f.vues_mediane !== fiche.vues_mediane ? "manuel" : fiche.stats_source,
        posts, ...(postsChanges ? { miniatures_statut: "a_faire" as const } : {}),
      });
      if (postsChanges) await rafraichirMiniatures(f.id).catch(() => null);
    },
    onSuccess: () => {
      setMessage("Enregistré.");
      rafraichir();
    },
    onError: (e) => setMessage((e as Error).message),
  });

  const miniatures = useMutation({
    mutationFn: () => rafraichirMiniatures(f.id),
    onSuccess: (r) => {
      setMessage(r.statut === "sans_liens" ? "Ajoute 3 liens de posts (le profil n'a pas pu être lu)." : `Miniatures : ${r.statut}.`);
      rafraichir();
    },
    onError: (e) => setMessage((e as Error).message),
  });

  const importer = () => {
    if (labelBloque) {
      setMessage("Valide d'abord le label.");
      return;
    }
    navigate(`/admin/sources?bible=${f.id}`);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Miniatures
          urls={(fiche.posts ?? []).filter((p) => p.miniature_url).map((p) => p.miniature_url!)}
          liens={(fiche.posts ?? []).filter((p) => p.miniature_url).map((p) => p.url)}
          handle={fiche.handle}
          manquantes
        />
        {fiche.miniatures_erreur && <p className="text-[11px] text-amber-700 dark:text-amber-300">{fiche.miniatures_erreur}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => miniatures.mutate()} disabled={miniatures.isPending}>
            <RefreshCw className="size-3.5" /> {miniatures.isPending ? "Copie en cours…" : "Rafraîchir les miniatures"}
          </Button>
          {fiche.compte_reference_id ? (
            <Button size="sm" variant="outline" onClick={() => navigate("/admin/sources")}><ExternalLink className="size-3.5" /> Compte de référence</Button>
          ) : (
            <Button size="sm" onClick={importer} data-testid="bouton-importer"><Upload className="size-3.5" /> Importer</Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">3 posts de référence</Label>
          {liens.map((u, i) => <Input key={i} value={u} onChange={(e) => setLiens(liens.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Lien du post ${i + 1}`} className="h-8 text-xs" />)}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Statut</Label>
          <select className={SELECT} value={f.statut} onChange={(e) => maj({ statut: e.target.value as StatutBible })}>
            {STATUTS.map((s) => <option key={s} value={s}>{LIBELLE_STATUT[s]}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Langue · pays</Label>
          <div className="flex gap-2">
            <select className={SELECT} value={f.langue ?? ""} onChange={(e) => maj({ langue: e.target.value || null })}>
              <option value="">—</option>
              {LANGUES_CIBLES.map((l) => <option key={l} value={l}>{nomLangue(l)}</option>)}
            </select>
            <Input value={f.pays ?? ""} onChange={(e) => maj({ pays: e.target.value.toUpperCase().slice(0, 2) || null })} className="w-20" placeholder="US" />
          </div>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Apps visées</Label>
          <ChoixApps valeur={f.application_ids} attente={f.apps_attente} onChange={(ids) => maj({ application_ids: ids })} onAttente={(a) => maj({ apps_attente: a })} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Autre app / idée (si le compte ne va dans aucune app actuelle)</Label>
          <Input value={f.autre_app ?? ""} onChange={(e) => maj({ autre_app: e.target.value })} placeholder="app habits / style, app langues…" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Label</Label>
          {proposeActuel && !f.label_id && !propose ? (
            <p className="text-sm">Label proposé : <b>{proposeActuel.nom}</b> ({proposeActuel.statut === "a_valider" ? "à valider" : proposeActuel.statut}){" "}
              <button type="button" className="text-xs underline" onClick={() => maj({ label_propose_id: null })}>changer</button>
            </p>
          ) : (
            <ChoixLabel apps={f.application_ids} labelId={f.label_id} propose={propose} onLabel={(id) => maj({ label_id: id, label_propose_id: null })} onPropose={setPropose} />
          )}
          {f.label_id && <p className="text-[11px] text-muted-foreground">{labels.find((l) => l.id === f.label_id)?.style_theme}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Note pour l'import</Label>
          <Textarea value={f.note_import ?? ""} onChange={(e) => maj({ note_import: e.target.value })} rows={3} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Angle de placement</Label>
          <Textarea value={f.angle ?? ""} onChange={(e) => maj({ angle: e.target.value })} rows={3} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">100 % niché ?</Label>
          <div className="flex gap-2">
            <select className={SELECT} value={f.niche_statut ?? ""} onChange={(e) => maj({ niche_statut: (e.target.value || null) as NicheStatut | null })}>
              <option value="">—</option><option value="oui">oui</option><option value="non">non</option><option value="partiel">partiel</option>
            </select>
            <Input value={f.niche ?? ""} onChange={(e) => maj({ niche: e.target.value })} placeholder="niche" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Stats {f.stats_source === "auto" ? "(auto)" : f.stats_source === "manuel" ? "(à la main)" : ""}</Label>
          <div className="flex gap-2">
            <Input type="number" value={f.abonnes ?? ""} onChange={(e) => maj({ abonnes: e.target.value ? Number(e.target.value) : null })} placeholder="abonnés" />
            <Input type="number" value={f.vues_mediane ?? ""} onChange={(e) => maj({ vues_mediane: e.target.value ? Number(e.target.value) : null })} placeholder="vues méd." />
          </div>
          {f.meilleur_post_url && <a href={f.meilleur_post_url} target="_blank" rel="noreferrer" className="text-[11px] underline">Meilleur post ({nombreCourt(f.meilleur_post_vues)} vues)</a>}
          {f.dernier_post_le && <p className="text-[11px] text-muted-foreground">Dernier post le {new Date(f.dernier_post_le).toLocaleDateString("fr-FR")}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.polyvalent} onChange={(e) => maj({ polyvalent: e.target.checked })} /> Polyvalent (l'app dépend du sujet du post)</label>
          {f.polyvalent && <Textarea value={regles} onChange={(e) => setRegles(e.target.value)} rows={3} placeholder={"culture G → Sophia\nécole → micabo"} />}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={() => enregistrer.mutate()} disabled={enregistrer.isPending}>{enregistrer.isPending ? "Enregistrement…" : "Enregistrer"}</Button>
        {message && <p className={/Valide|snake|erreur|error/i.test(message) ? "text-sm text-destructive" : "text-sm text-muted-foreground"} data-testid="fiche-message">{message}</p>}
      </div>
    </div>
  );
}

function HistoriqueFiche({ id, noms }: { id: string; noms: Record<string, string> }) {
  const h = useQuery({ queryKey: ["bible", "historique", id], queryFn: () => lireHistorique(id) });
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Historique</p>
      <ul className="space-y-1.5 text-xs">
        {(h.data ?? []).map((e) => (
          <li key={e.id} className="rounded-md bg-muted/50 px-2 py-1.5">
            <span className="text-muted-foreground">{new Date(e.at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {e.par ? noms[e.par] ?? "admin" : "OS"} · </span>
            {e.quoi === "ajout" ? "fiche créée" : Object.keys(e.apres ?? {}).map((k) => `${LIBELLE_CHAMP[k] ?? k} : ${resume(e.avant?.[k])} → ${resume(e.apres?.[k])}`).join(" ; ")}
          </li>
        ))}
        {h.data?.length === 0 && <li className="text-muted-foreground">Rien encore.</li>}
      </ul>
    </div>
  );
}
