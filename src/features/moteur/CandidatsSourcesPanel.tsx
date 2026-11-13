import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segments } from "@/components/ui/segments";
import {
  candidatsVisibles,
  compterOnglets,
  deciderCandidatSource,
  languesDeLOnglet,
  listerCandidatsSources,
  noterCandidatSource,
  validerCandidatSource,
  vuesCourtes,
  type CandidatSource,
  type OngletCandidats,
  type SorteCandidat,
} from "@/features/moteur/candidatsSources";
import { drapeauLangue, LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import type { Label as NicheLabel } from "@/features/moteur/types";

const selectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Les propositions de sources (0684) : les comptes TikTok que l'agent
 * éclaireur a trouvés. L'admin valide (la source est créée et part dans la
 * file des mises à jour, une à la fois) ou refuse, avec la raison : c'est ce
 * que l'agent relit pour mieux chercher.
 */
export function CandidatsSourcesPanel({ niches }: { niches: NicheLabel[] }) {
  const { t } = useTranslation();
  const candidats = useQuery({ queryKey: ["sources-candidats"], queryFn: listerCandidatsSources });
  const [onglet, setOnglet] = React.useState<OngletCandidats>("a_decider");
  const [langue, setLangue] = React.useState("");
  const [sorte, setSorte] = React.useState<SorteCandidat | "">("");
  const [message, setMessage] = React.useState<string | null>(null);

  if (candidats.isPending || candidats.isError) return null;
  const tous = candidats.data;
  // Tant que l'agent n'a rien déposé, le panneau ne prend pas de place.
  if (tous.length === 0) return null;

  const comptes = compterOnglets(tous);
  const langues = languesDeLOnglet(tous, onglet);
  const langueActive = langues.includes(langue) ? langue : "";
  const visibles = candidatsVisibles(tous, { onglet, langue: langueActive, sorte });

  return (
    <Card data-testid="candidats-sources">
      <CardHeader>
        <CardTitle>{t("sources.candidats.titre")}</CardTitle>
        <CardDescription>{t("sources.candidats.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Segments
            libelle={t("sources.candidats.titre")}
            actif={onglet}
            onChange={setOnglet}
            options={(["a_decider", "plus_tard", "decides"] as const).map((o) => ({
              cle: o,
              contenu: `${t(`sources.candidats.onglet.${o}`)} · ${comptes[o]}`,
            }))}
          />
          <Segments
            libelle={t("sources.candidats.sorteLibelle")}
            actif={sorte || "tout"}
            onChange={(s) => setSorte(s === "tout" ? "" : s)}
            options={[
              { cle: "tout", contenu: t("sources.candidats.sorte.tout") },
              { cle: "label", contenu: t("sources.candidats.sorte.label") },
              { cle: "concept", contenu: t("sources.candidats.sorte.concept") },
            ]}
          />
          {langues.length > 1 && (
            <select
              className={selectClass}
              value={langueActive}
              onChange={(e) => setLangue(e.target.value)}
              aria-label={t("sources.candidats.langueFiltre")}
            >
              <option value="">{t("sources.candidats.toutesLangues")}</option>
              {langues.map((l) => (
                <option key={l} value={l}>
                  {nomLangue(l)}
                </option>
              ))}
            </select>
          )}
        </div>

        {message && (
          <p className="text-sm text-muted-foreground" role="status">
            {message}
          </p>
        )}

        {visibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t(`sources.candidats.vide.${onglet}`)}</p>
        ) : (
          <ul className="space-y-3">
            {visibles.map((c) => (
              <CarteCandidat key={c.id} candidat={c} niches={niches} onMessage={setMessage} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CarteCandidat({
  candidat: c,
  niches,
  onMessage,
}: {
  candidat: CandidatSource;
  niches: NicheLabel[];
  onMessage: (m: string | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [labelId, setLabelId] = React.useState(c.labelId ?? "");
  const [langue, setLangue] = React.useState(c.langue);
  const [refus, setRefus] = React.useState(false);
  const [raison, setRaison] = React.useState("");
  const [noteOuverte, setNoteOuverte] = React.useState(false);
  const [note, setNote] = React.useState(c.note ?? "");

  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ["sources-candidats"] });
    queryClient.invalidateQueries({ queryKey: ["sources"] });
    queryClient.invalidateQueries({ queryKey: ["sources-file"] });
  };
  const valider = useMutation({
    mutationFn: () => validerCandidatSource(c.id, labelId, langue),
    onSuccess: (r) => {
      const date = r.prevuLe
        ? new Date(`${r.prevuLe}T12:00:00`).toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "long" })
        : null;
      onMessage(
        r.essaiMax === null || (r.file === "attente" && !date)
          ? t("sources.candidats.valideSansDate", { handle: r.handle })
          : t(r.file === "lancee" ? "sources.candidats.valideLancee" : "sources.candidats.valideAttente", {
              handle: r.handle,
              n: r.essaiMax,
              date,
            }),
      );
      rafraichir();
    },
  });
  const decider = useMutation({
    mutationFn: (v: { statut: "refuse" | "plus_tard" | "propose"; raison?: string }) =>
      deciderCandidatSource(c.id, v.statut, v.raison),
    onSuccess: () => {
      onMessage(null);
      rafraichir();
    },
  });
  // La note s'écrit en mettant la carte de côté, ou se corrige ensuite sur place.
  const noter = useMutation({
    mutationFn: async (v: { deCote: boolean }) => {
      if (note.trim() !== (c.note ?? "")) await noterCandidatSource(c.id, note);
      if (v.deCote) await deciderCandidatSource(c.id, "plus_tard");
    },
    onSuccess: () => {
      setNoteOuverte(false);
      onMessage(null);
      rafraichir();
    },
  });
  const occupe = valider.isPending || decider.isPending || noter.isPending;
  const erreur = (valider.error ?? decider.error ?? noter.error) as Error | null;
  const label = niches.find((n) => n.id === c.labelId)?.nom ?? null;
  const ch = c.chiffres;
  const jour = (d: string | null) =>
    d ? new Date(`${d}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "long" }) : null;
  const entier = (n: number) => n.toLocaleString(i18n.language);
  // Le compte en une ligne : seulement ce que le relevé a donné.
  const compte = [
    ch.abonnes !== null && t("sources.candidats.abonnes", { n: entier(ch.abonnes) }),
    ch.postsTotal !== null && t("sources.candidats.postsTotal", { count: ch.postsTotal }),
    ch.dernierSlideshow && t("sources.candidats.dernierSlideshow", { date: jour(ch.dernierSlideshow) }),
    ch.releveLe && t("sources.candidats.releve", { date: jour(ch.releveLe) }),
  ].filter(Boolean);
  const decide = c.statut === "valide" || c.statut === "refuse";

  return (
    <li className="space-y-2 rounded-lg border p-3" data-testid="candidat-source">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          href={`https://www.tiktok.com/@${c.handle}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          @{c.handle}
          <ExternalLink className="size-3 opacity-60" aria-hidden />
        </a>
        <span className="text-xs text-muted-foreground">
          {drapeauLangue(c.langue)} {nomLangue(c.langue)}
        </span>
        {c.sorte === "concept" ? (
          <Badge variant="info">{t("sources.candidats.conceptNouveau")}</Badge>
        ) : (
          label && <Badge variant="outline">{label}</Badge>
        )}
        {c.concept && <span className="text-xs text-muted-foreground">{c.concept}</span>}
        {c.statut === "valide" && <Badge variant="success">{t("sources.candidats.statut.valide")}</Badge>}
        {c.statut === "refuse" && <Badge variant="error">{t("sources.candidats.statut.refuse")}</Badge>}
      </div>

      {ch.slideshows !== null && (
        <div className="space-y-0.5 text-xs tabular-nums text-muted-foreground" data-testid="candidat-chiffres">
          <p>
            {t("sources.candidats.chiffres", {
              count: ch.slideshows,
              posts: ch.posts ?? ch.slideshows,
              mediane: vuesCourtes(ch.vuesMediane),
              max: vuesCourtes(ch.vuesMax),
              n100k: ch.posts100k ?? 0,
            })}
            {ch.posts10k !== null && ` · ${t("sources.candidats.posts10k", { n: ch.posts10k })}`}
          </p>
          {compte.length > 0 && <p>{compte.join(" · ")}</p>}
        </div>
      )}

      <p className="text-sm">{c.pourquoi}</p>
      {c.risques && (
        <p className="text-sm text-warning-foreground">
          <span className="font-medium">{t("sources.candidats.risques")}</span> {c.risques}
        </p>
      )}

      {c.exemples.length > 0 && (
        <ul className="space-y-0.5 text-xs">
          {c.exemples.map((e) => (
            <li key={e.url} className="flex gap-2">
              <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{vuesCourtes(e.vues)}</span>
              <a href={e.url} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:underline" title={e.accroche}>
                {e.accroche}
              </a>
            </li>
          ))}
        </ul>
      )}

      {c.statut === "refuse" && c.raisonRefus && (
        <p className="text-xs text-muted-foreground">{t("sources.candidats.raisonRefus", { raison: c.raisonRefus })}</p>
      )}

      {c.note && !noteOuverte && (
        <p className="text-sm" data-testid="candidat-note">
          <span className="font-medium">{t("sources.candidats.note")}</span> {c.note}
        </p>
      )}

      {!decide && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <select
            className={selectClass}
            value={labelId}
            onChange={(e) => setLabelId(e.target.value)}
            disabled={occupe}
            aria-label={t("sources.candidats.labelChoix", { handle: c.handle })}
          >
            <option value="">{t("sources.nicheChoisir")}</option>
            {niches.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nom}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={langue}
            onChange={(e) => setLangue(e.target.value)}
            disabled={occupe}
            aria-label={t("sources.candidats.langueChoix", { handle: c.handle })}
          >
            {(LANGUES_CIBLES as readonly string[]).includes(c.langue) ? null : <option value={c.langue}>{nomLangue(c.langue)}</option>}
            {LANGUES_CIBLES.map((l) => (
              <option key={l} value={l}>
                {nomLangue(l)}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={occupe || !labelId} onClick={() => valider.mutate()}>
            {valider.isPending ? t("common.saving") : t("sources.candidats.valider")}
          </Button>
          {c.statut === "propose" ? (
            <Button size="sm" variant="ghost" disabled={occupe} onClick={() => setNoteOuverte((v) => !v)} aria-expanded={noteOuverte}>
              {t("sources.candidats.plusTard")}
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" disabled={occupe} onClick={() => decider.mutate({ statut: "propose" })}>
                {t("sources.candidats.remettre")}
              </Button>
              <Button size="sm" variant="ghost" disabled={occupe} onClick={() => setNoteOuverte((v) => !v)} aria-expanded={noteOuverte}>
                {t(c.note ? "sources.candidats.noteModifier" : "sources.candidats.noteAjouter")}
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" disabled={occupe} onClick={() => setRefus((v) => !v)} aria-expanded={refus}>
            {t("sources.candidats.refuser")}
          </Button>
          {!labelId && <span className="text-xs text-muted-foreground">{t("sources.candidats.labelRequis")}</span>}
        </div>
      )}

      {!decide && noteOuverte && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            noter.mutate({ deCote: c.statut === "propose" });
          }}
        >
          <Input
            className="h-8 max-w-md flex-1 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("sources.candidats.noteAide")}
            aria-label={t("sources.candidats.noteLibelle", { handle: c.handle })}
            disabled={occupe}
            autoFocus
          />
          <Button type="submit" size="sm" disabled={occupe}>
            {t(c.statut === "propose" ? "sources.candidats.mettreDeCote" : "sources.candidats.noteEnregistrer")}
          </Button>
        </form>
      )}

      {!decide && refus && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            decider.mutate({ statut: "refuse", raison });
          }}
        >
          <Input
            className="h-8 max-w-md flex-1 text-sm"
            value={raison}
            onChange={(e) => setRaison(e.target.value)}
            placeholder={t("sources.candidats.raisonAide")}
            aria-label={t("sources.candidats.raisonLibelle", { handle: c.handle })}
            disabled={occupe}
            autoFocus
          />
          <Button type="submit" size="sm" variant="destructive" disabled={occupe}>
            {t("sources.candidats.confirmerRefus")}
          </Button>
        </form>
      )}

      {c.statut === "refuse" && (
        <Button size="sm" variant="ghost" disabled={occupe} onClick={() => decider.mutate({ statut: "propose" })}>
          {t("sources.candidats.remettre")}
        </Button>
      )}

      {erreur && <p className="text-xs text-destructive">{erreur.message}</p>}
    </li>
  );
}
