import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { type Jour, type LigneJour, lireDetails, lireJour, type PosteurJour, type SectionJour, type Ton } from "./api";
import { PanneauLigne } from "./PanneauLigne";
import {
  categories, COULEUR_SECTION, compteur, deplacer, depuisCourt, FILTRES_VIDES, type FiltresJour, PASTILLE, phraseResume,
  sectionsFiltrees, tonSection,
} from "./tableau";

const LIBELLE_CATEGORIE: Record<string, string> = {
  paie: "Paie", paiement: "Paiement", bonus: "Bonus", doublement: "Doublement", arret: "Arrêt", contenu: "Contenu",
  email: "Emails", technique: "Technique", ticket: "Tickets", posting: "Posts", lien_post: "Liens de posts", tiktok: "TikTok",
  warmup: "Warm-up", ruul: "Ruul", login: "Connexion", bug: "Bug", parrainage: "Parrainage", statut: "Statut", autre: "Autres",
};

const TEXTE_TON: Record<Ton, string> = { rouge: "text-red-600 dark:text-red-400", orange: "text-amber-700 dark:text-amber-400", gris: "text-muted-foreground" };

const estSaisie = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

/**
 * 21/11 (Max, points 7 et 10) : « Aujourd'hui », la page d'arrivée de l'admin. Une phrase en haut, puis 6 sections
 * repliables (À valider, Argent, Posteurs, Contenu et posts, Technique, Chiffres du jour), une ligne par problème
 * (pas par posteur), rouge / orange / gris avec « depuis ». Un clic ouvre le panneau de droite (posteurs, fil,
 * réponse proposée). Recherche (nom, @, email), filtres, raccourcis J / K / Entrée / E.
 */
export function PageAujourdhui() {
  const jour = useQuery({ queryKey: ["aujourdhui", "jour"], queryFn: lireJour, refetchInterval: 60_000 });
  return <VueAujourdhui jour={jour.data ?? null} erreur={jour.error as Error | null} />;
}

/** La vue seule (données en entrée) : la page et l'aperçu (src/apercu) l'utilisent. */
export function VueAujourdhui({ jour, erreur, posteursInitiaux }: { jour: Jour | null; erreur?: Error | null; posteursInitiaux?: PosteurJour[] }) {
  const [filtres, setFiltres] = React.useState<FiltresJour>(FILTRES_VIDES);
  const [fermees, setFermees] = React.useState<Set<string>>(new Set());
  const [selection, setSelection] = React.useState<string | null>(null);
  const [ouverte, setOuverte] = React.useState<LigneJour | null>(null);
  const refEdition = React.useRef<HTMLTextAreaElement>(null);
  const refRecherche = React.useRef<HTMLInputElement>(null);

  // La recherche par nom, @ ou email : les posteurs de toutes les lignes, lus une fois.
  const tousLesPosteurs = React.useMemo(
    () => [...new Set((jour?.sections ?? []).flatMap((s) => s.lignes.flatMap((l) => l.posteurs)))].sort(),
    [jour],
  );
  const index = useQuery({
    queryKey: ["aujourdhui", "posteurs", tousLesPosteurs.length, tousLesPosteurs[0]],
    queryFn: () => lireDetails(tousLesPosteurs, []),
    enabled: !posteursInitiaux && filtres.recherche.trim().length > 0 && tousLesPosteurs.length > 0,
    staleTime: 5 * 60_000,
  });
  const posteurs = React.useMemo(
    () => new Map((posteursInitiaux ?? index.data?.posteurs ?? []).map((p) => [p.id, p])),
    [posteursInitiaux, index.data],
  );

  const sections = React.useMemo(() => sectionsFiltrees(jour?.sections ?? [], filtres, posteurs), [jour, filtres, posteurs]);
  const ids = sections.filter((s) => !fermees.has(s.cle)).flatMap((s) => s.lignes.map((l) => l.id));
  const lignes = new Map(sections.flatMap((s) => s.lignes.map((l) => [l.id, l] as const)));
  const cats = categories(jour?.sections ?? []);

  React.useEffect(() => {
    const touche = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (estSaisie(ev.target)) {
        if (ev.key === "Escape") (ev.target as HTMLElement).blur();
        return;
      }
      const k = ev.key.toLowerCase();
      if (k === "j" || k === "k") {
        ev.preventDefault();
        const suivant = deplacer(ids, selection, k === "j" ? 1 : -1);
        setSelection(suivant);
        if (suivant) document.getElementById(`ligne-${suivant}`)?.scrollIntoView?.({ block: "nearest" });
      } else if (ev.key === "Enter" && selection && !ouverte) {
        ev.preventDefault();
        setOuverte(lignes.get(selection) ?? null);
      } else if (k === "e") {
        ev.preventDefault();
        if (!ouverte && selection) setOuverte(lignes.get(selection) ?? null);
        // Le panneau s'ouvre puis la réponse du 1er posteur prend le focus.
        window.setTimeout(() => refEdition.current?.focus(), ouverte ? 0 : 400);
      } else if (ev.key === "/") {
        ev.preventDefault();
        refRecherche.current?.focus();
      }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  });

  const basculer = (cle: string) => setFermees((f) => {
    const n = new Set(f);
    if (n.has(cle)) n.delete(cle);
    else n.add(cle);
    return n;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-3" data-testid="page-aujourdhui">
      {erreur && <p className="text-sm text-destructive">{erreur.message}</p>}
      {!jour && !erreur && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {jour && (
        <p className="rounded-lg border bg-muted/30 px-4 py-3 text-base font-medium" data-testid="resume-jour">
          {phraseResume(jour.resume)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2" data-testid="filtres-jour">
        <Input
          ref={refRecherche}
          value={filtres.recherche}
          onChange={(e) => setFiltres({ ...filtres, recherche: e.target.value })}
          placeholder="Nom, @tiktok ou email  ( / )"
          className="h-8 min-w-0 flex-1 basis-48"
          aria-label="Rechercher un posteur"
        />
        <Choix valeur={filtres.categorie} vide="Catégorie" options={cats.map((c) => [c, LIBELLE_CATEGORIE[c] ?? c])}
          onChange={(v) => setFiltres({ ...filtres, categorie: v })} />
        <Choix valeur={filtres.plateforme} vide="Plateforme" options={[["upwork", "Upwork"], ["ruul", "Ruul"]]}
          onChange={(v) => setFiltres({ ...filtres, plateforme: v as FiltresJour["plateforme"] })} />
        <Choix valeur={filtres.urgence} vide="Urgence" options={[["rouge", "🔴 Rouge"], ["orange", "🟠 Orange"], ["gris", "⚪ Gris"]]}
          onChange={(v) => setFiltres({ ...filtres, urgence: v as Ton | null })} />
      </div>
      <p className="hidden text-xs text-muted-foreground sm:block">J / K : ligne suivante / précédente · Entrée : ouvrir · E : modifier la réponse · / : chercher</p>

      {sections.map((s, i) => (
        <Section key={s.cle} numero={i + 1} section={s} fermee={fermees.has(s.cle)} onBasculer={() => basculer(s.cle)}>
          {s.lignes.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Rien ici ✅</p>
          ) : (
            s.lignes.map((l) => (
              <Ligne key={l.id} ligne={l} active={selection === l.id} onOuvrir={() => { setSelection(l.id); setOuverte(l); }} />
            ))
          )}
        </Section>
      ))}

      {jour && (
        <Section numero={6} section={{ cle: "chiffres" as SectionJour["cle"], titre: "Chiffres du jour", lignes: [] }} couleur="border-l-emerald-500" fermee={fermees.has("chiffres")}
          onBasculer={() => basculer("chiffres")} sansCompteur>
          <dl className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-3" data-testid="chiffres-jour">
            <Chiffre label="Comptes actifs" valeur={jour.chiffres.comptes_actifs} />
            <Chiffre label="Posts aujourd'hui" valeur={jour.chiffres.posts_jour} />
            <Chiffre label="Upwork / Ruul" valeur={`${jour.chiffres.upwork} / ${jour.chiffres.ruul}`} />
            <Chiffre label="Support sans humain (24 h)" valeur={jour.chiffres.support_sans_humain === null ? "—" : `${jour.chiffres.support_sans_humain} %`} />
            <Chiffre label="Demandes (24 h)" valeur={jour.chiffres.demandes_24h} />
            <div className="flex items-end">
              <Link to="/admin/auto/qualite" className="text-primary underline-offset-2 hover:underline">Rapport qualité →</Link>
            </div>
          </dl>
        </Section>
      )}

      <PanneauLigne ligne={ouverte} onFermer={() => setOuverte(null)} refEdition={refEdition} />
    </div>
  );
}

function Section({ numero, section, fermee, onBasculer, children, couleur, sansCompteur }: {
  numero: number; section: SectionJour; fermee: boolean; onBasculer: () => void; children: React.ReactNode; couleur?: string; sansCompteur?: boolean;
}) {
  const n = compteur(section);
  const ton = tonSection(section);
  return (
    <section className={cn("overflow-hidden rounded-lg border border-l-4 bg-card", couleur ?? COULEUR_SECTION[section.cle])} data-testid="section-jour" data-cle={section.cle}>
      <button type="button" onClick={onBasculer} className="flex w-full items-center gap-2 px-4 py-2.5 text-left" aria-expanded={!fermee}>
        <span className="text-xs text-muted-foreground">{numero}</span>
        <span className="flex-1 text-sm font-semibold uppercase tracking-wide">{section.titre}</span>
        {!sansCompteur && (
          <Badge variant="outline" className={cn("tabular-nums", n > 0 && TEXTE_TON[ton])} data-testid="compteur-section">{n}</Badge>
        )}
        <span className="text-xs text-muted-foreground">{fermee ? "▸" : "▾"}</span>
      </button>
      {!fermee && <div className="divide-y border-t">{children}</div>}
    </section>
  );
}

function Ligne({ ligne, active, onOuvrir }: { ligne: LigneJour; active: boolean; onOuvrir: () => void }) {
  const depuis = depuisCourt(ligne.depuis);
  return (
    <div
      id={`ligne-${ligne.id}`}
      role="button"
      tabIndex={0}
      onClick={onOuvrir}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget === e.target && onOuvrir()}
      className={cn("flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-muted/40", active && "bg-muted/60 ring-1 ring-inset ring-primary/40")}
      data-testid="ligne-jour"
      data-ton={ligne.ton}
    >
      <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", PASTILLE[ligne.ton])} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{ligne.titre}</div>
        {ligne.detail && <div className="truncate text-xs text-muted-foreground">{ligne.detail}</div>}
      </div>
      {depuis && <span className={cn("shrink-0 text-xs tabular-nums", TEXTE_TON[ligne.ton])}>depuis {depuis}</span>}
      {ligne.lien && (
        <Link to={ligne.lien} onClick={(e) => e.stopPropagation()} className={cn(buttonVariants({ size: "sm", variant: "outline" }), "hidden shrink-0 sm:inline-flex")}>
          {ligne.lien_label ?? "Ouvrir"}
        </Link>
      )}
    </div>
  );
}

function Choix({ valeur, vide, options, onChange }: { valeur: string | null; vide: string; options: [string, string][]; onChange: (v: string | null) => void }) {
  return (
    <select
      className="h-8 rounded-md border bg-background px-2 text-sm"
      value={valeur ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label={vide}
    >
      <option value="">{vide}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function Chiffre({ label, valeur }: { label: string; valeur: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{valeur}</dd>
    </div>
  );
}
