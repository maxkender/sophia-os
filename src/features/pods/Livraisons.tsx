// Les livraisons d'un podz : aperçu des decks, validation à la main, validation automatique.
// Déplacé tel quel depuis la page Podz (20/11) : le comportement ne change pas.
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink } from "lucide-react";

import { EtiquetteApplication } from "@/components/brand/LogoApplication";
import { abrege } from "@/components/charts/echelle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segments } from "@/components/ui/segments";
import { Switch } from "@/components/ui/switch";
import { drapeauLangue } from "@/features/moteur/langues";
import { Aide } from "@/features/moteur/repartition/graphes";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

import {
  echeanceAutoValidation,
  itemsVideo,
  languesOrdonnees,
  majAutoValidation,
  nomsComptes,
  rejeterLivraison,
  validerLivraison,
  variantesDeck,
  type Livraison,
  type Pod,
  type PreuveOriginal,
  type StatutLivraison,
} from "./api";

/** La couleur dit l'état ; le texte reste neutre. */
const POINT_STATUT: Record<StatutLivraison, string> = {
  a_valider: "bg-warning",
  validee: "bg-success",
  rejetee: "bg-destructive",
  ecartee_note: "bg-muted-foreground",
};

export function PastilleStatut({ statut }: { statut: StatutLivraison }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium">
      <span className={cn("size-1.5 rounded-full", POINT_STATUT[statut])} aria-hidden />
      {t(`pods.statut.${statut}`)}
    </span>
  );
}

function Deck({ livraison }: { livraison: Livraison }) {
  const { t } = useTranslation();
  const langues = languesOrdonnees(livraison);
  const [langue, setLangue] = React.useState(langues[0]);
  // Sophia et/ou les applications livrées (pod 6 : UnSwipe seul).
  const variantes = variantesDeck(livraison, langue);
  const [cle, setCle] = React.useState<string | null>(null);
  const deck = variantes.find((v) => v.cle === cle) ?? variantes[0];
  const choixApplis = variantes.length > 1 || (deck && deck.cle !== "sophia");
  return (
    <div className="space-y-2">
      {(langues.length > 1 || choixApplis) && (
        <div className="flex flex-wrap items-center gap-2">
          {langues.length > 1 && (
            <Segments
              libelle={t("pods.ongletsLangues")}
              actif={langue}
              onChange={setLangue}
              options={langues.map((l) => ({ cle: l, contenu: `${drapeauLangue(l)} ${l}` }))}
            />
          )}
          {choixApplis && (
            <Segments
              libelle={t("pods.ongletsApplis")}
              actif={deck?.cle}
              onChange={setCle}
              options={variantes.map((v) => ({ cle: v.cle, contenu: <EtiquetteApplication slug={v.cle} taille="xs" /> }))}
            />
          )}
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {deck?.slides.map((s) => (
          <div key={s.position} className="w-32 shrink-0 space-y-1">
            <a href={s.url} target="_blank" rel="noreferrer" className="relative block">
              {s.texte_overlay !== undefined && (
                <span className="absolute inset-x-1 top-1/2 -translate-y-1/2 whitespace-pre-line rounded bg-black/50 p-1 text-center text-[9px] leading-tight text-white">
                  {s.texte_sophia ?? s.texte_overlay}
                </span>
              )}
              <img
                src={s.url}
                alt={`slide ${s.position}`}
                loading="lazy"
                className={`h-56 w-full rounded-md border object-cover ${s.position_sophia ? "ring-2 ring-primary" : ""}`}
              />
            </a>
            {s.position_sophia && <p className="text-center text-xs text-primary">{t("pods.appli")}</p>}
            {s.reference_url && (
              <a href={s.reference_url} target="_blank" rel="noreferrer" className="block" title={t("pods.inspiration")}>
                <img src={s.reference_url} alt="" loading="lazy" className="h-16 w-auto rounded border opacity-80" />
                <span className="text-[10px] text-muted-foreground">{t("pods.inspiration")}</span>
              </a>
            )}
          </div>
        ))}
      </div>
      {deck?.hashtags && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t("pods.legende")} :</span> {deck.hashtags}
        </p>
      )}
    </div>
  );
}

/** Pod 4 : le schéma d'accroche et ce qui prouve qu'il fait des vues aujourd'hui. */
function Preuve({ preuve }: { preuve: PreuveOriginal }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
      <p>
        <span className="font-medium">{t("pods.preuve")} :</span> {t("pods.preuveSchema", { schema: preuve.schema })}
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
        {preuve.references.map((r) =>
          r.type === "tiktok" ? (
            <li key={r.url}>
              <a className="inline-flex items-center gap-1 underline-offset-2 hover:underline" href={r.url} target="_blank" rel="noreferrer">
                {t("pods.preuveTiktok", {
                  vues: abrege(r.vues, i18n.language),
                  date: new Date(`${r.publie_le}T12:00:00Z`).toLocaleDateString(localeDate()),
                })}
                <ExternalLink className="size-3" />
              </a>
              {r.enregistrements != null &&
                ` · ${t("pods.preuveEnregistrements", { n: abrege(r.enregistrements, i18n.language) })}`}
            </li>
          ) : (
            <li key={r.contenu_id}>
              {t("pods.preuveOs", {
                r: r.r_median?.toLocaleString() ?? "—",
                n: r.publies,
                contenu: r.contenu_id.slice(0, 8),
              })}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

export function LigneLivraison({ livraison, pod }: { livraison: Livraison; pod?: Pod }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [motif, setMotif] = React.useState("");
  // Podz sûr : la livraison sera validée toute seule au bout du délai.
  const echeance =
    pod?.auto_validation && livraison.type !== "video"
      ? echeanceAutoValidation(livraison.depose_le, pod.auto_validation_heures)
      : null;
  const rafraichir = () => qc.invalidateQueries({ queryKey: ["pods", "livraisons"] });
  const valider = useMutation({ mutationFn: () => validerLivraison(livraison.id), onSuccess: rafraichir });
  const rejeter = useMutation({ mutationFn: () => rejeterLivraison(livraison.id, motif), onSuccess: rafraichir });
  const occupe = valider.isPending || rejeter.isPending;
  const erreur = (valider.error ?? rejeter.error) as Error | null;

  // Ce qu'est la livraison, d'où elle vient : une ligne, séparée par des points.
  const contexte: React.ReactNode[] = [
    <span key="type" className="inline-flex items-center gap-1 font-medium text-foreground">
      {livraison.type === "langues"
        ? t("pods.types.langues", { langues: Object.keys(livraison.decks ?? {}).join(", ") })
        : t(`pods.types.${livraison.type}`)}
      {livraison.type === "original" && <Aide libelle={t("pods.types.original")}>{t("pods.original")}</Aide>}
    </span>,
  ];
  if (livraison.source_vues != null) contexte.push(t("pods.vues", { n: livraison.source_vues.toLocaleString() }));
  if (livraison.musique_titre) {
    contexte.push(
      <span key="musique">
        ♪{" "}
        {livraison.musique_url ? (
          <a className="underline-offset-2 hover:underline" href={livraison.musique_url} target="_blank" rel="noreferrer">
            {livraison.musique_titre}
          </a>
        ) : (
          livraison.musique_titre
        )}
      </span>,
    );
  }
  if (livraison.source_url) {
    contexte.push(
      <a key="source" className="inline-flex items-center gap-1 underline-offset-2 hover:underline" href={livraison.source_url} target="_blank" rel="noreferrer">
        {t("pods.source")} <ExternalLink className="size-3" />
      </a>,
    );
  }

  return (
    <div className="space-y-3 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium break-words">{livraison.titre ?? livraison.id}</p>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            {contexte.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span aria-hidden>·</span>}
                {c}
              </React.Fragment>
            ))}
          </p>
        </div>
        <PastilleStatut statut={livraison.statut} />
      </div>

      {livraison.preuve && <Preuve preuve={livraison.preuve} />}

      {livraison.type === "video" ? <DeckVideo livraison={livraison} /> : <Deck livraison={livraison} />}

      {livraison.statut === "a_valider" ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          {livraison.auto_erreur ? (
            <p className="text-xs font-medium text-destructive">{t("pods.autoErreur", { erreur: livraison.auto_erreur })}</p>
          ) : (
            echeance && (
              <p className="text-xs text-muted-foreground">
                {t("pods.autoEcheance", {
                  heure: echeance.toLocaleString(localeDate(), { weekday: "short", hour: "2-digit", minute: "2-digit" }),
                })}
              </p>
            )
          )}
          <div className="flex flex-wrap items-start gap-2">
            <Input
              className="min-w-0 flex-1 basis-60"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder={t("pods.motif")}
              aria-label={t("pods.motif")}
            />
            <Button disabled={occupe} onClick={() => valider.mutate()}>
              {t("pods.valider")}
            </Button>
            <Button disabled={occupe} variant="outline" onClick={() => rejeter.mutate()}>
              {t("pods.rejeter")}
            </Button>
          </div>
          {erreur && <p className="text-sm text-destructive">{erreur.message}</p>}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {livraison.statut === "validee" && <Check className="size-3.5 text-foreground" aria-hidden />}
          <span>
            {livraison.statut === "validee" &&
              (livraison.type === "video"
                ? t("pods.videoValidee")
                : t("pods.valide", { tier: livraison.tier, note: livraison.note_import }))}
            {livraison.statut === "validee" && livraison.decide_auto && ` · ${t("pods.autoFaite")}`}
            {livraison.statut === "ecartee_note" && t("pods.ecartee", { note: livraison.note_import })}
            {livraison.statut === "rejetee" && `${t("pods.rejete")}${livraison.motif ? ` — ${livraison.motif}` : ""}`}
          </span>
        </p>
      )}
    </div>
  );
}

/** Livraison vidéo (pod 3) : une réaction refaite par compte, avec ses textes. */
function DeckVideo({ livraison }: { livraison: Livraison }) {
  const { t } = useTranslation();
  const items = itemsVideo(livraison);
  const noms = useQuery({
    queryKey: ["pods", "noms", livraison.id],
    queryFn: () => nomsComptes(items.map(([id]) => id)),
  });
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {items.map(([compteId, item]) => (
        <div key={compteId} className="w-44 shrink-0 space-y-1 text-xs">
          <video src={item.reaction_url} controls muted playsInline preload="metadata" className="h-72 w-full rounded-md border bg-black object-cover" />
          <p className="font-medium">
            {drapeauLangue(item.langue)} {noms.data?.get(compteId) ?? compteId.slice(0, 8)}
          </p>
          <p>
            <span className="text-muted-foreground">{t("pods.texteEcran")} :</span> {item.texte_ecran}
          </p>
          <p className="text-muted-foreground">{item.legende}</p>
        </div>
      ))}
    </div>
  );
}

/** Podz sûr : ses livraisons en attente sont validées en B toutes seules, après son délai. */
export function InterrupteurAuto({ pod }: { pod: Pod }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const basculer = useMutation({
    mutationFn: (actif: boolean) => majAutoValidation(pod.slug, actif),
    onSettled: () => qc.invalidateQueries({ queryKey: ["pods"] }),
  });
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={pod.auto_validation}
          disabled={basculer.isPending}
          onCheckedChange={(v) => basculer.mutate(v === true)}
          aria-label={t("pods.autoInterrupteurAria", { pod: pod.nom })}
        />
        <span>{t("pods.autoInterrupteur", { heures: pod.auto_validation_heures })}</span>
      </label>
      {basculer.error && <p className="text-xs text-destructive">{(basculer.error as Error).message}</p>}
    </div>
  );
}

/** Valide une file de livraisons au rang B, une livraison après l'autre. `tous` : toute la file de la page, tous podz confondus. */
export function ToutValiderEnB({ livraisons, tous = false }: { livraisons: Livraison[]; tous?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [fait, setFait] = React.useState(0);
  const [erreurs, setErreurs] = React.useState<string[]>([]);
  const tout = useMutation({
    mutationFn: async () => {
      setFait(0);
      setErreurs([]);
      for (const l of livraisons) {
        try {
          await validerLivraison(l.id, "B");
        } catch (e) {
          setErreurs((x) => [...x, `${l.titre ?? l.id} : ${(e as Error).message}`]);
        }
        setFait((n) => n + 1);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["pods", "livraisons"] }),
  });
  if (!livraisons.length) return null;
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant={tous ? "default" : "outline"}
        disabled={tout.isPending}
        onClick={() =>
          window.confirm(t(tous ? "pods.toutValiderTousConfirm" : "pods.toutValiderBConfirm", { n: livraisons.length })) && tout.mutate()
        }
      >
        {tout.isPending
          ? t("pods.toutValiderBEnCours", { fait, n: livraisons.length })
          : t(tous ? "pods.toutValiderTous" : "pods.toutValiderB", { n: livraisons.length })}
      </Button>
      {erreurs.map((e) => (
        <p key={e} className="text-sm text-destructive">
          {e}
        </p>
      ))}
    </div>
  );
}

