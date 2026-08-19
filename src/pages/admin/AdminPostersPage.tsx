import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, HelpCircle, Plus, UserPlus, UserSquare, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { badgeManager, estRoleManager, useAuth } from "@/features/auth/AuthContext";
import { CompteursPhases, ListeCreateursSuivi } from "@/features/hiring/SuiviCreateurs";
import { equipesParDm, hmsDuDm, hmsSansDm, nomProfil, resumeHm } from "@/features/hiring/suiviEquipe";
import { CompteEditor, PostsParJourCompte } from "@/features/moteur/CompteEditor";
import {
  assurerComptePoster,
  creerPoster,
  creerRecruteur,
  definirRole,
  demarrerWarmup,
  skipWarmup,
  labelsDesComptes,
  labelsDuHmUgcVideo,
  listerComptes,
  listerLabels,
  listerLanguesReference,
  listerPosters,
  majCompte,
  majLanguesRecruteur,
  majPoster,
  majUpwork,
  setLabelsCompte,
  setLabelsHmUgcVideo,
  supprimerPoster,
} from "@/features/moteur/api";
import { LabelPicker } from "@/features/moteur/LabelPicker";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { WarmupBadge } from "@/features/moteur/WarmupBadge";
import { phaseCreateur, type PhaseCreateur } from "@/features/moteur/warmup";
import type { CompteAvecDetails, Label as LabelType, PosterProfil } from "@/features/moteur/types";

const filtreLabelUgcVideoThematique = (lab: {
  slug: string;
  ugc_ai_video: boolean;
}) => Boolean(lab.ugc_ai_video) && lab.slug !== "ugc-ai-video";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const MOT_DE_PASSE_INITIAL = "12345678";

function nomAffiche(p: PosterProfil): string {
  return [p.prenom, p.nom].filter(Boolean).join(" ") || p.email || "—";
}

/** Handle TikTok normalisé (`@foo`) + URL profil, ou null si absent. */
function lienTikTokHandle(handle: string | null | undefined): {
  at: string;
  url: string;
} | null {
  const raw = (handle ?? "").trim().replace(/^@+/, "");
  if (!raw) return null;
  return {
    at: `@${raw}`,
    url: `https://www.tiktok.com/@${raw}`,
  };
}

/** Petits drapeaux en haut à droite des cartes grille (aperçu rapide des langues). */
function DrapeauxLangues({ codes }: { codes: string[] }) {
  const uniques = [...new Set(codes.filter(Boolean))];
  if (uniques.length === 0) return null;
  return (
    <span
      className="flex shrink-0 flex-wrap items-center justify-end gap-0.5 text-[15px] leading-none"
      aria-label={uniques.map((code) => nomLangue(code)).join(", ")}
    >
      {uniques.map((code) => (
        <span key={code} title={nomLangue(code)} className="select-none">
          {drapeauLangue(code)}
        </span>
      ))}
    </span>
  );
}

function AidePosters() {
  const { t } = useTranslation();
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={t("posters.aideTitre")}
      >
        <HelpCircle className="size-4" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-72 rounded-md border bg-card p-3 text-left text-xs leading-relaxed text-muted-foreground shadow-lifted group-hover:block group-focus-within:block"
      >
        <span className="mb-1.5 block font-medium text-foreground">{t("posters.aideTitre")}</span>
        <span className="mb-2 block">{t("posters.aideAcces")}</span>
        <span className="mb-2 block">{t("posters.labelsAide")}</span>
        <span className="mb-1.5 block">{t("warmup.phasesLegende")}</span>
        <span className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{t("warmup.phasePasCree")}</Badge>
          <Badge variant="warning">{t("warmup.phaseWarmupAttente")}</Badge>
          <Badge variant="success">{t("warmup.phaseActif")}</Badge>
        </span>
      </span>
    </span>
  );
}

function ModalFiche({
  titre,
  onClose,
  children,
}: {
  titre: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-card p-5 shadow-lifted"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">{titre}</h2>
          <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Fermer">
            <X className="size-4" />
          </Button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}

/** Upwork seulement (plus de compte référence / publications). */
function CreateurUpwork({
  poster,
  onSave,
}: {
  poster: PosterProfil;
  onSave: (url: string) => void;
}) {
  const { t } = useTranslation();
  const [edit, setEdit] = React.useState(false);
  const [url, setUrl] = React.useState(poster.upwork_url ?? "");
  const tiktok = lienTikTokHandle(poster.handle_tiktok);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {tiktok && (
        <a
          href={tiktok.url}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {tiktok.at}
        </a>
      )}
      {!edit && poster.upwork_url && (
        <a
          href={poster.upwork_url}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          Upwork ↗
        </a>
      )}
      {!edit && (
        <button
          type="button"
          onClick={() => {
            setUrl(poster.upwork_url ?? "");
            setEdit(true);
          }}
          className="text-muted-foreground underline underline-offset-2"
        >
          {poster.upwork_url ? t("posters.upworkModifier") : t("posters.upworkAjouter")}
        </button>
      )}
      {edit && (
        <span className="inline-flex items-center gap-1">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.upwork.com/…"
            className="h-7 w-56 text-xs"
          />
          <Button
            size="sm"
            className="h-7"
            onClick={() => {
              onSave(url);
              setEdit(false);
            }}
          >
            {t("common.save")}
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setEdit(false)}>
            {t("common.cancel")}
          </Button>
        </span>
      )}
    </div>
  );
}

/** Dropdown langues gérées (multi : choisir une langue la bascule). */
function LangueRecruteurDropdown({ recruteur }: { recruteur: PosterProfil }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });
  const maj = useMutation({
    mutationFn: (l: string[]) => majLanguesRecruteur(recruteur.id, l),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posters"] }),
  });

  const actives = recruteur.langues ?? [];
  const libelle = (l: string) => nomLangue(l, i18n.language);
  const resume = actives.length > 0 ? actives.map(libelle).join(", ") : t("posters.aucuneLangue");

  return (
    <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
      <select
        className={selectClass}
        value=""
        disabled={maj.isPending}
        title={resume}
        onChange={(e) => {
          const l = e.target.value;
          if (!l) return;
          const s = new Set(actives);
          if (s.has(l)) s.delete(l);
          else s.add(l);
          maj.mutate([...s]);
        }}
      >
        <option value="">{resume}</option>
        {(langues.data ?? []).map((l) => (
          <option key={l} value={l}>
            {actives.includes(l) ? `✓ ${libelle(l)}` : libelle(l)}
          </option>
        ))}
      </select>
    </div>
  );
}

function LangueCompteSelect({ compte }: { compte: CompteAvecDetails }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });
  const maj = useMutation({
    mutationFn: (langue: string) => majCompte(compte.id, { langue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comptes"] });
      queryClient.invalidateQueries({ queryKey: ["posters"] });
    },
  });

  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {t("hiring.langue")}
      </Label>
      <select
        className={selectClass}
        value={compte.langue}
        disabled={maj.isPending}
        onChange={(e) => maj.mutate(e.target.value)}
      >
        {(langues.data ?? []).map((l) => (
          <option key={l} value={l}>
            {nomLangue(l)}
          </option>
        ))}
      </select>
    </div>
  );
}

function LabelsCompteSelect({
  compteId,
  actifs,
}: {
  compteId: string;
  actifs: LabelType[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const labels = useQuery({ queryKey: ["labels"], queryFn: listerLabels });
  const ids = actifs.map((l) => l.id);
  const maj = useMutation({
    mutationFn: (next: string[]) => setLabelsCompte(compteId, next),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["compte-labels-all"] });
      await queryClient.invalidateQueries({ queryKey: ["compte-labels", compteId] });
    },
  });

  const disponibles = (labels.data ?? []).filter((l) => !ids.includes(l.id));

  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {t("labels.title")}
      </Label>
      <select
        className={selectClass}
        value=""
        disabled={maj.isPending || disponibles.length === 0}
        onChange={(e) => {
          const id = e.target.value;
          if (!id) return;
          maj.mutate([...ids, id]);
        }}
      >
        <option value="">
          {actifs.length === 0 ? t("posters.choisirLabel") : t("posters.ajouterLabel")}
        </option>
        {disponibles.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nom}
          </option>
        ))}
      </select>
      {actifs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {actifs.map((lab) => (
            <button
              key={lab.id}
              type="button"
              disabled={maj.isPending}
              onClick={() => maj.mutate(ids.filter((id) => id !== lab.id))}
              className="rounded-md border px-1.5 py-0.5 text-[11px] hover:bg-muted"
              title={t("common.delete")}
            >
              {lab.nom} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HmUgcVideoLabelsEditeur({ profileId }: { profileId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["hm-ugc-video-labels", profileId],
    queryFn: () => labelsDuHmUgcVideo(profileId),
  });
  const [local, setLocal] = React.useState<string[] | null>(null);
  const ids = local ?? q.data ?? [];

  const maj = useMutation({
    mutationFn: (next: string[]) => setLabelsHmUgcVideo(profileId, next),
    onSuccess: () => {
      setLocal(null);
      void queryClient.invalidateQueries({ queryKey: ["hm-ugc-video-labels", profileId] });
    },
  });

  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {t("posters.hmUgcAiVideoLabels")}
      </Label>
      <LabelPicker
        selected={ids}
        disabled={maj.isPending || q.isPending}
        filter={filtreLabelUgcVideoThematique}
        onChange={(next) => {
          setLocal(next);
          maj.mutate(next);
        }}
      />
    </div>
  );
}

function BadgeUgc({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary"
      title={label}
    >
      <Check className="size-3.5" strokeWidth={2.5} />
      {label}
    </span>
  );
}

export function AdminPostersPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const posters = useQuery({ queryKey: ["posters"], queryFn: listerPosters });
  const comptes = useQuery({ queryKey: ["comptes"], queryFn: listerComptes });
  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });
  const labels = useQuery({ queryKey: ["labels"], queryFn: listerLabels });
  const labelsComptes = useQuery({
    queryKey: ["compte-labels-all", (comptes.data ?? []).map((c) => c.id).join(",")],
    queryFn: () => labelsDesComptes((comptes.data ?? []).map((c) => c.id)),
    enabled: (comptes.data?.length ?? 0) > 0,
  });

  // Défaut « tous » : les nouveaux (warmup pas démarré) restent visibles.
  const [filtrePhase, setFiltrePhase] = React.useState<"tous" | PhaseCreateur>("tous");
  const [filtreLangue, setFiltreLangue] = React.useState("");
  const [filtreLabel, setFiltreLabel] = React.useState("");

  const compteDe = React.useMemo(() => {
    const m = new Map<string, CompteAvecDetails>();
    for (const c of comptes.data ?? []) if (!m.has(c.poster_id)) m.set(c.poster_id, c);
    return m;
  }, [comptes.data]);

  const [ficheId, setFicheId] = React.useState<string | null>(null);
  const [gererCompteOuvert, setGererCompteOuvert] = React.useState(false);

  const creerCompteVide = useMutation({
    mutationFn: (p: PosterProfil) =>
      assurerComptePoster({
        userId: p.id,
        langue: p.langues[0] ?? "fr",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["comptes"] });
      void queryClient.invalidateQueries({ queryKey: ["posters"] });
      void queryClient.invalidateQueries({ queryKey: ["reglages"] });
      void queryClient.invalidateQueries({ queryKey: ["compte-labels-all"] });
    },
  });

  const [ajout, setAjout] = React.useState<"ferme" | "poster" | "recruteur">("ferme");

  const [prenom, setPrenom] = React.useState("");
  const [nom, setNom] = React.useState("");
  const [langue, setLangue] = React.useState("");
  const [password, setPassword] = React.useState(MOT_DE_PASSE_INITIAL);
  const [cree, setCree] = React.useState<{ email: string; password: string } | null>(null);

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["posters"] });

  const creer = useMutation({
    mutationFn: () => creerPoster({ prenom, nom, password, langue: langue || undefined }),
    onSuccess: (r) => {
      setCree({ email: r.email, password });
      setPrenom("");
      setNom("");
      setPassword(MOT_DE_PASSE_INITIAL);
      rafraichir();
      void queryClient.invalidateQueries({ queryKey: ["comptes"] });
      void queryClient.invalidateQueries({ queryKey: ["reglages"] });
      void queryClient.invalidateQueries({ queryKey: ["compte-labels-all"] });
    },
  });

  const [recPrenom, setRecPrenom] = React.useState("");
  const [recNom, setRecNom] = React.useState("");
  const [recLangues, setRecLangues] = React.useState<string[]>([]);
  const [recUgcAiVideo, setRecUgcAiVideo] = React.useState(false);
  const [recUgcLabels, setRecUgcLabels] = React.useState<string[]>([]);
  const [recCree, setRecCree] = React.useState<{ email: string } | null>(null);
  const basculerRecLangue = (l: string) =>
    setRecLangues((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));
  const creerRec = useMutation({
    mutationFn: () =>
      creerRecruteur({
        prenom: recPrenom,
        nom: recNom,
        langues: recLangues,
        ugc_ai_video: recUgcAiVideo,
        ugc_ai_video_label_ids: recUgcAiVideo ? recUgcLabels : undefined,
      }),
    onSuccess: (r) => {
      setRecCree({ email: r.email });
      setRecPrenom("");
      setRecNom("");
      setRecLangues([]);
      setRecUgcAiVideo(false);
      setRecUgcLabels([]);
      rafraichir();
    },
  });

  const [promoId, setPromoId] = React.useState<string | null>(null);
  const [promoLangues, setPromoLangues] = React.useState<string[]>([]);
  const basculerPromoLangue = (l: string) =>
    setPromoLangues((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));
  const changerRole = useMutation({
    mutationFn: (input: {
      id: string;
      role: "poster" | "hiring_manager" | "directing_manager";
      nationalite?: string;
      langues?: string[];
    }) => definirRole(input.id, input.role, input.nationalite, input.langues),
    onSuccess: () => {
      setPromoId(null);
      setPromoLangues([]);
      setFicheId(null);
      rafraichir();
    },
  });
  const basculer = useMutation({
    mutationFn: (input: { id: string; actif: boolean }) =>
      majPoster(input.id, { is_active: input.actif }),
    onSuccess: rafraichir,
  });
  const warmupStart = useMutation({
    mutationFn: (compteId: string) => demarrerWarmup(compteId),
    onSuccess: () => {
      rafraichir();
      queryClient.invalidateQueries({ queryKey: ["comptes"] });
    },
  });
  const warmupSkip = useMutation({
    mutationFn: (compteId: string) => skipWarmup(compteId),
    onSuccess: () => {
      rafraichir();
      queryClient.invalidateQueries({ queryKey: ["comptes"] });
      queryClient.invalidateQueries({ queryKey: ["suivi-minuit"] });
    },
  });
  const retirer = useMutation({
    mutationFn: supprimerPoster,
    onSuccess: () => {
      setFicheId(null);
      rafraichir();
    },
  });
  const enregistrerUpwork = useMutation({
    mutationFn: (input: { id: string; url: string }) => majUpwork(input.id, input.url),
    onSuccess: rafraichir,
  });

  const ouvrirFiche = (id: string) => {
    setFicheId(id);
    setGererCompteOuvert(false);
    setPromoId(null);
    setPromoLangues([]);
  };

  const formulairePoster = (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="size-4" />
          {t("posters.title")}
        </CardTitle>
        <CardDescription>{t("posters.creerPosterDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setCree(null);
            creer.mutate();
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="space-y-2">
            <Label htmlFor="prenom">{t("posters.prenom")}</Label>
            <Input
              id="prenom"
              required
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nom">{t("posters.nom")}</Label>
            <Input id="nom" value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="langue">{t("hiring.langue")}</Label>
            <select
              id="langue"
              className={selectClass}
              value={langue}
              onChange={(e) => setLangue(e.target.value)}
            >
              <option value="">{t("posters.sansCompte")}</option>
              {langues.data?.map((l) => (
                <option key={l} value={l}>
                  {nomLangue(l)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{t("posters.langueAide")}</p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="mdp">{t("posters.password")}</Label>
            <div className="flex gap-2">
              <Input
                id="mdp"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setPassword(MOT_DE_PASSE_INITIAL)}
              >
                {t("posters.regenerate")}
              </Button>
            </div>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={creer.isPending}>
              {creer.isPending ? t("common.saving") : t("posters.create")}
            </Button>
            {creer.isError && (
              <p className="mt-2 text-sm text-destructive">
                {(creer.error as Error).message === "NO_LABELS"
                  ? t("warmup.aucunLabel")
                  : (creer.error as Error).message === "NO_UGC_PERSONA"
                    ? t("warmup.plusDePersonaUgc")
                    : (creer.error as Error).message === "NO_UGC_LABEL"
                      ? t("warmup.labelUgcIntrouvable")
                      : (creer.error as Error).message === "NO_FREE_REFERENCE"
                        ? t("posters.creationRefusee")
                        : (creer.error as Error).message}
              </p>
            )}
          </div>
        </form>

        {cree && (
          <div className="space-y-1 rounded-lg border border-success/40 bg-success/5 p-4">
            <p className="text-sm font-medium text-success">{t("posters.done")}</p>
            <p className="text-sm">
              <span className="text-muted-foreground">{t("posters.emailGenere")} : </span>
              <code className="rounded bg-muted px-1">{cree.email}</code>
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">{t("posters.password")} : </span>
              <code className="rounded bg-muted px-1">{cree.password}</code>
            </p>
            <p className="pt-1 text-xs text-muted-foreground">{t("posters.transmit")}</p>
            <p className="text-xs text-muted-foreground">{t("warmup.apresCreation")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const formulaireRecruteur = (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="size-4" />
          {t("posters.creerRecruteur")}
        </CardTitle>
        <CardDescription>{t("posters.creerRecruteurDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setRecCree(null);
            creerRec.mutate();
          }}
          className="grid gap-4 sm:grid-cols-3"
        >
          <div className="space-y-2">
            <Label htmlFor="recPrenom">{t("posters.prenom")}</Label>
            <Input
              id="recPrenom"
              required
              value={recPrenom}
              onChange={(e) => setRecPrenom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recNom">{t("posters.nom")}</Label>
            <Input id="recNom" value={recNom} onChange={(e) => setRecNom(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-3">
            <Label>{t("posters.languesRecruteur")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {(langues.data ?? []).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => basculerRecLangue(l)}
                  className={
                    recLangues.includes(l)
                      ? "rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                      : "rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
                  }
                >
                  {nomLangue(l, i18n.language)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("posters.languesRecruteurAide")}</p>
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={recUgcAiVideo}
                onChange={(e) => {
                  setRecUgcAiVideo(e.target.checked);
                  if (!e.target.checked) setRecUgcLabels([]);
                }}
              />
              <span>
                <span className="font-medium">{t("posters.hmUgcAiVideo")}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t("posters.hmUgcAiVideoAide")}
                </span>
              </span>
            </label>
            {recUgcAiVideo && (
              <div className="space-y-1.5 rounded-md border border-dashed p-3">
                <Label>{t("posters.hmUgcAiVideoLabels")}</Label>
                <LabelPicker
                  selected={recUgcLabels}
                  onChange={setRecUgcLabels}
                  filter={filtreLabelUgcVideoThematique}
                />
                <p className="text-xs text-muted-foreground">{t("posters.hmUgcAiVideoLabelsAide")}</p>
              </div>
            )}
          </div>
          <div className="sm:col-span-3">
            <Button
              type="submit"
              disabled={
                creerRec.isPending ||
                !recPrenom.trim() ||
                recLangues.length === 0 ||
                (recUgcAiVideo && recUgcLabels.length === 0)
              }
            >
              {creerRec.isPending ? t("common.saving") : t("posters.creerRecruteur")}
            </Button>
            {creerRec.isError && (
              <p className="mt-2 text-sm text-destructive">
                {(creerRec.error as Error).message}
              </p>
            )}
            {recCree && (
              <p className="mt-2 text-sm text-success">
                {t("posters.done")} — <code className="rounded bg-muted px-1">{recCree.email}</code> ·{" "}
                <code className="rounded bg-muted px-1">12345678</code>
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );

  const ordrePhase: Record<PhaseCreateur, number> = {
    pas_cree: 0,
    warmup: 1,
    actif: 2,
  };

  const matchCreateur = (p: PosterProfil) => {
    const phase = phaseCreateur({
      compteId: p.compte_id,
      warmup_started_at: p.warmup_started_at,
      warmup_ends_at: p.warmup_ends_at,
    });
    if (filtrePhase !== "tous" && phase !== filtrePhase) return false;
    const compte = compteDe.get(p.id);
    if (filtreLangue && compte?.langue !== filtreLangue) return false;
    if (filtreLabel) {
      const labs = compte ? (labelsComptes.data?.get(compte.id) ?? []) : [];
      if (!labs.some((l) => l.id === filtreLabel)) return false;
    }
    return true;
  };

  const trierCreateurs = (liste: PosterProfil[]) =>
    [...liste].sort((a, b) => {
      const pa = phaseCreateur({
        compteId: a.compte_id,
        warmup_started_at: a.warmup_started_at,
        warmup_ends_at: a.warmup_ends_at,
      });
      const pb = phaseCreateur({
        compteId: b.compte_id,
        warmup_started_at: b.warmup_started_at,
        warmup_ends_at: b.warmup_ends_at,
      });
      const d = ordrePhase[pa] - ordrePhase[pb];
      if (d !== 0) return d;
      return nomAffiche(a).localeCompare(nomAffiche(b), "fr");
    });

  const filtresActifs = Boolean(filtreLangue) || Boolean(filtreLabel);

  const barreFiltres = (
    <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-3">
      <div className="space-y-1">
        <Label htmlFor="filtrePhase">{t("posters.filtrePhase")}</Label>
        <select
          id="filtrePhase"
          className={selectClass}
          value={filtrePhase}
          onChange={(e) => setFiltrePhase(e.target.value as "tous" | PhaseCreateur)}
        >
          <option value="tous">{t("posters.filtreTous")}</option>
          <option value="pas_cree">{t("warmup.phasePasCree")}</option>
          <option value="warmup">{t("posters.filtreWarmup")}</option>
          <option value="actif">{t("warmup.phaseActif")}</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="filtreLangue">{t("posters.filtreLangue")}</Label>
        <select
          id="filtreLangue"
          className={selectClass}
          value={filtreLangue}
          onChange={(e) => setFiltreLangue(e.target.value)}
        >
          <option value="">{t("posters.filtreTous")}</option>
          {(langues.data ?? []).map((l) => (
            <option key={l} value={l}>
              {nomLangue(l)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="filtreLabel">{t("posters.filtreLabel")}</Label>
        <select
          id="filtreLabel"
          className={selectClass}
          value={filtreLabel}
          onChange={(e) => setFiltreLabel(e.target.value)}
        >
          <option value="">{t("posters.filtreTous")}</option>
          {(labels.data ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.nom}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const tous = posters.data ?? [];
  const creators = trierCreateurs(tous.filter((p) => p.role === "poster").filter(matchCreateur));
  const admins = tous.filter((p) => p.role === "admin");
  const tousCreateurs = tous.filter((p) => p.role === "poster");
  const parManager = new Map<string, PosterProfil[]>();
  for (const c of creators) {
    const k = c.manager_id ?? "__none__";
    parManager.set(k, [...(parManager.get(k) ?? []), c]);
  }

  const eloMoyenRecruteur = (recId: string): number | null => {
    const scores = tousCreateurs
      .filter((c) => c.manager_id === recId && c.score != null)
      .map((c) => Number(c.score));
    if (scores.length === 0) return null;
    return scores.reduce((s, n) => s + n, 0) / scores.length;
  };

  const carteRecruteur = (poster: PosterProfil) => {
    const langues =
      poster.langues?.length > 0
        ? poster.langues
        : poster.nationalite
          ? [poster.nationalite]
          : [];
    return (
      <article
        key={poster.id}
        role="button"
        tabIndex={0}
        onClick={() => ouvrirFiche(poster.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            ouvrirFiche(poster.id);
          }
        }}
        className="flex h-full cursor-pointer flex-col gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">{nomAffiche(poster)}</span>
            {badgeManager(poster.role) && (
              <Badge variant="outline">{badgeManager(poster.role)}</Badge>
            )}
            {poster.hm_ugc_ai_video && <BadgeUgc label={t("posters.ugcAiVideoBadge")} />}
            {!poster.is_active && <Badge variant="secondary">{t("posters.disabled")}</Badge>}
          </div>
          <DrapeauxLangues codes={langues} />
        </div>
        {poster.role === "hiring_manager" && poster.manager_nom && (
          <p className="text-[11px] text-violet-700">{t("posters.dmDe", { nom: poster.manager_nom })}</p>
        )}
        <LangueRecruteurDropdown recruteur={poster} />
      </article>
    );
  };

  const carteCreateur = (poster: PosterProfil) => {
    const compte = compteDe.get(poster.id);
    // Préfère le handle du compte TikTok (source de vérité), sinon profil.
    const tiktok = lienTikTokHandle(compte?.handle_tiktok ?? poster.handle_tiktok);
    return (
      <article
        key={poster.id}
        role="button"
        tabIndex={0}
        onClick={() => ouvrirFiche(poster.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            ouvrirFiche(poster.id);
          }
        }}
        className="flex h-full cursor-pointer flex-col gap-2.5 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">{nomAffiche(poster)}</span>
            {compte?.ugc_ai_video && <BadgeUgc label={t("posters.ugcAiVideoBadge")} />}
            {compte?.ugc_ai && !compte.ugc_ai_video && <BadgeUgc label="UGC" />}
            {!poster.is_active && <Badge variant="secondary">{t("posters.disabled")}</Badge>}
          </div>
          <DrapeauxLangues codes={compte?.langue ? [compte.langue] : []} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {poster.score != null && (
            <span title={t("posters.eloCompteAide")}>
              {t("posters.eloCompte", { score: Number(poster.score).toFixed(1) })}
            </span>
          )}
          {tiktok && (
            <a
              href={tiktok.url}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              {tiktok.at}
            </a>
          )}
          <WarmupBadge
            compteId={poster.compte_id}
            startedAt={poster.warmup_started_at}
            endsAt={poster.warmup_ends_at}
          />
        </div>
      </article>
    );
  };

  const grille = (membres: PosterProfil[], type: "recruteur" | "createur") =>
    membres.length === 0 ? (
      <p className="text-xs text-muted-foreground">{t("posters.aucunCreateur")}</p>
    ) : (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {membres.map((p) => (type === "recruteur" ? carteRecruteur(p) : carteCreateur(p)))}
      </div>
    );

  const section = (
    titre: string,
    count: number,
    membres: PosterProfil[],
    type: "recruteur" | "createur",
    opts?: { badge?: string; sousTitre?: string; cle?: string },
  ) => (
    <section key={opts?.cle ?? titre} className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2 border-b pb-1.5">
        <h2 className="text-sm font-semibold">{titre}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
        {opts?.badge && <Badge variant="outline">{opts.badge}</Badge>}
        {opts?.sousTitre && (
          <span className="w-full text-[11px] text-muted-foreground sm:ml-auto sm:w-auto">
            {opts.sousTitre}
          </span>
        )}
      </div>
      {grille(membres, type)}
    </section>
  );

  const liste = (() => {
    if (posters.isPending) {
      return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
    }
    if (tous.length === 0) return <EmptyState title={t("posters.empty")} />;

    if (filtresActifs) {
      return (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2 border-b pb-1.5">
            <h2 className="text-sm font-semibold">{t("posters.createursFiltres")}</h2>
            <span className="text-xs tabular-nums text-muted-foreground">{creators.length}</span>
          </div>
          {grille(creators, "createur")}
        </div>
      );
    }

    const equipes = equipesParDm(tous);
    const orphelins = hmsSansDm(tous);

    return (
      <div className="space-y-8">
        {equipes.map((eq) => {
          const membresEquipe = [eq.dm, ...eq.hms.map((h) => h.hm)];
          return (
            <div key={eq.dm.id} className="space-y-6">
              {section(nomAffiche(eq.dm), eq.hms.length, membresEquipe, "recruteur", {
                cle: `dm-${eq.dm.id}`,
                badge: t("hiring.badgeDm"),
                sousTitre: t("posters.equipeDmResume", {
                  hms: eq.hms.length,
                  total: eq.compteurs.total,
                  pasCree: eq.compteurs.pasCree,
                  warmup: eq.compteurs.warmup,
                  actif: eq.compteurs.actif,
                }),
              })}
              {eq.hms.map((h) => {
                const membres = parManager.get(h.hm.id) ?? [];
                if (membres.length === 0) return null;
                return section(nomAffiche(h.hm), membres.length, membres, "createur", {
                  cle: `hm-creators-${h.hm.id}`,
                  sousTitre: t("posters.createursDuRecruteur"),
                });
              })}
            </div>
          );
        })}
        {orphelins.length > 0 &&
          section(
            t("posters.hmSansDm"),
            orphelins.length,
            orphelins.map((h) => h.hm),
            "recruteur",
            { cle: "hm-sans-dm", badge: t("hiring.badgeHm") },
          )}
        {orphelins.map((h) => {
          const membres = parManager.get(h.hm.id) ?? [];
          if (membres.length === 0) return null;
          return section(nomAffiche(h.hm), membres.length, membres, "createur", {
            cle: `orphan-creators-${h.hm.id}`,
            sousTitre: t("posters.createursDuRecruteur"),
          });
        })}
        {(parManager.get("__none__") ?? []).length > 0 &&
          section(
            t("posters.sansRecruteur"),
            (parManager.get("__none__") ?? []).length,
            parManager.get("__none__") ?? [],
            "createur",
          )}
        {filtrePhase === "tous" &&
          admins.length > 0 &&
          section(t("nav.admin"), admins.length, admins, "createur")}
      </div>
    );
  })();

  const fiche = ficheId ? tous.find((p) => p.id === ficheId) : null;
  const ficheCompte = fiche ? compteDe.get(fiche.id) : undefined;
  const ficheLabs =
    ficheCompte && labelsComptes.data ? (labelsComptes.data.get(ficheCompte.id) ?? []) : [];
  const ficheCreateurs =
    fiche && estRoleManager(fiche.role)
      ? tousCreateurs.filter((c) => c.manager_id === fiche.id)
      : [];
  const ficheHms = fiche?.role === "directing_manager" ? hmsDuDm(tous, fiche.id) : [];
  const ficheDm =
    fiche?.role === "hiring_manager" && fiche.manager_id
      ? tous.find((p) => p.id === fiche.manager_id && p.role === "directing_manager")
      : undefined;
  const ficheEloMoyen =
    fiche && estRoleManager(fiche.role) ? eloMoyenRecruteur(fiche.id) : null;
  const soiMeme = fiche?.id === user?.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">{t("posters.title")}</h1>
          <AidePosters />
        </div>
        {ajout === "ferme" ? (
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setCree(null);
                setAjout("poster");
              }}
            >
              <Plus className="size-4" />
              {t("posters.ajouterPoster")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setRecCree(null);
                setAjout("recruteur");
              }}
            >
              <Plus className="size-4" />
              {t("posters.ajouterRecruteur")}
            </Button>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setAjout("ferme")}>
            <X className="size-4" />
            {t("common.close")}
          </Button>
        )}
      </div>

      {ajout === "poster" && formulairePoster}
      {ajout === "recruteur" && formulaireRecruteur}

      {barreFiltres}
      {liste}

      {fiche && (
        <ModalFiche titre={nomAffiche(fiche)} onClose={() => setFicheId(null)}>
          <p className="text-sm text-muted-foreground">{fiche.email}</p>

          {estRoleManager(fiche.role) && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {badgeManager(fiche.role) && (
                  <Badge variant="outline">{badgeManager(fiche.role)}</Badge>
                )}
                {fiche.hm_ugc_ai_video && <BadgeUgc label={t("posters.ugcAiVideoBadge")} />}
                {!fiche.is_active && <Badge variant="secondary">{t("posters.disabled")}</Badge>}
                {ficheEloMoyen != null && (
                  <Badge variant="secondary" title={t("posters.eloMoyenAide")}>
                    {t("posters.eloMoyen", { score: ficheEloMoyen.toFixed(1) })}
                  </Badge>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t("posters.languesRecruteur")}
                </Label>
                <LangueRecruteurDropdown recruteur={fiche} />
              </div>

              {fiche.hm_ugc_ai_video && <HmUgcVideoLabelsEditeur profileId={fiche.id} />}

              {fiche.role === "hiring_manager" && (
                <p className="text-sm">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t("posters.directingManager")}
                  </span>
                  <span className="mt-0.5 block">
                    {ficheDm ? (
                      <button
                        type="button"
                        className="underline underline-offset-2"
                        onClick={() => ouvrirFiche(ficheDm.id)}
                      >
                        {nomAffiche(ficheDm)}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">{t("posters.hmSansDm")}</span>
                    )}
                  </span>
                </p>
              )}

              {fiche.role === "directing_manager" && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t("posters.hmsDuDm")}
                  </Label>
                  {ficheHms.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("hiring.aucunHm")}</p>
                  ) : (
                    <ul className="space-y-2">
                      {ficheHms.map((hm) => {
                        const resume = resumeHm(hm, tous);
                        return (
                          <li key={hm.id} className="space-y-1 rounded-md border p-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="text-sm font-medium underline underline-offset-2"
                                onClick={() => ouvrirFiche(hm.id)}
                              >
                                {nomProfil(hm)}
                              </button>
                              <Badge variant="outline">{t("hiring.badgeHm")}</Badge>
                              <CompteursPhases compteurs={resume.compteurs} />
                            </div>
                            <ListeCreateursSuivi
                              createurs={tousCreateurs.filter((c) => c.manager_id === hm.id)}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {fiche.role === "hiring_manager" && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t("posters.createursDuRecruteur")}
                  </Label>
                  {ficheCreateurs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("posters.aucunCreateur")}</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {ficheCreateurs.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            className="underline underline-offset-2"
                            onClick={() => ouvrirFiche(c.id)}
                          >
                            {nomAffiche(c)}
                          </button>
                          {c.score != null && (
                            <span className="text-xs text-muted-foreground">
                              {t("posters.eloCompte", { score: Number(c.score).toFixed(1) })}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {!soiMeme && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  {fiche.role === "hiring_manager" && (
                    <Button
                      size="sm"
                      disabled={changerRole.isPending}
                      onClick={() =>
                        changerRole.mutate({
                          id: fiche.id,
                          role: "directing_manager",
                          langues: fiche.langues,
                          nationalite: fiche.nationalite ?? fiche.langues?.[0],
                        })
                      }
                    >
                      {t("hiring.promoteDm")}
                    </Button>
                  )}
                  {fiche.role === "directing_manager" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={changerRole.isPending}
                      onClick={() =>
                        changerRole.mutate({
                          id: fiche.id,
                          role: "hiring_manager",
                          langues: fiche.langues,
                          nationalite: fiche.nationalite ?? fiche.langues?.[0],
                        })
                      }
                    >
                      {t("hiring.repasserHm")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={changerRole.isPending}
                    onClick={() => changerRole.mutate({ id: fiche.id, role: "poster" })}
                  >
                    {t("hiring.revoke")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      basculer.mutate({ id: fiche.id, actif: !fiche.is_active })
                    }
                  >
                    {fiche.is_active ? t("posters.disable") : t("posters.enable")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (window.confirm(t("posters.confirmDelete"))) retirer.mutate(fiche.id);
                    }}
                  >
                    {t("common.delete")}
                  </Button>
                </div>
              )}
            </>
          )}

          {fiche.role === "poster" && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {ficheCompte?.ugc_ai_video && <BadgeUgc label={t("posters.ugcAiVideoBadge")} />}
                {ficheCompte?.ugc_ai && !ficheCompte.ugc_ai_video && <BadgeUgc label="UGC" />}
                {!fiche.is_active && <Badge variant="secondary">{t("posters.disabled")}</Badge>}
                {fiche.score != null && (
                  <Badge variant="secondary">
                    {t("posters.eloCompte", { score: Number(fiche.score).toFixed(1) })}
                  </Badge>
                )}
                <WarmupBadge
                  compteId={fiche.compte_id}
                  startedAt={fiche.warmup_started_at}
                  endsAt={fiche.warmup_ends_at}
                  showStart={Boolean(fiche.compte_id)}
                  startPending={warmupStart.isPending}
                  onStart={
                    fiche.compte_id ? () => warmupStart.mutate(fiche.compte_id!) : undefined
                  }
                  showSkip={Boolean(fiche.compte_id)}
                  skipPending={warmupSkip.isPending}
                  onSkip={
                    fiche.compte_id ? () => warmupSkip.mutate(fiche.compte_id!) : undefined
                  }
                />
              </div>

              <CreateurUpwork
                poster={fiche}
                onSave={(url) => enregistrerUpwork.mutate({ id: fiche.id, url })}
              />

              {ficheCompte ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <LangueCompteSelect compte={ficheCompte} />
                  <LabelsCompteSelect compteId={ficheCompte.id} actifs={ficheLabs} />
                  <div className="sm:col-span-2">
                    <PostsParJourCompte compte={ficheCompte} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-3">
                  <p className="text-sm text-muted-foreground">{t("posters.sansCompteCree")}</p>
                  <Button
                    size="sm"
                    disabled={creerCompteVide.isPending}
                    onClick={() => creerCompteVide.mutate(fiche)}
                  >
                    {creerCompteVide.isPending ? t("common.saving") : t("posters.creerCompte")}
                  </Button>
                </div>
              )}

              {gererCompteOuvert && ficheCompte && (
                <div className="rounded-md border p-3">
                  <CompteEditor compte={ficheCompte} />
                </div>
              )}

              {promoId === fiche.id && (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{t("posters.languesRecruteurAide")}</p>
                  <select
                    className={selectClass}
                    value=""
                    onChange={(e) => {
                      const l = e.target.value;
                      if (l) basculerPromoLangue(l);
                    }}
                  >
                    <option value="">{t("posters.choisirLangue")}</option>
                    {(langues.data ?? [])
                      .filter((l) => !promoLangues.includes(l))
                      .map((l) => (
                        <option key={l} value={l}>
                          {nomLangue(l)}
                        </option>
                      ))}
                  </select>
                  {promoLangues.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {promoLangues.map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => basculerPromoLangue(l)}
                          className="rounded-md border px-1.5 py-0.5 text-[11px]"
                        >
                          {nomLangue(l)} ×
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={changerRole.isPending || promoLangues.length === 0}
                      onClick={() =>
                        changerRole.mutate({
                          id: fiche.id,
                          role: "hiring_manager",
                          langues: promoLangues,
                          nationalite: promoLangues[0],
                        })
                      }
                    >
                      {t("hiring.valider")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPromoId(null);
                        setPromoLangues([]);
                      }}
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                </div>
              )}

              {!soiMeme && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  {promoId !== fiche.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setPromoId(fiche.id);
                        const compteLangue = ficheCompte?.langue;
                        setPromoLangues(
                          compteLangue
                            ? [compteLangue]
                            : fiche.langues?.length
                              ? [...fiche.langues]
                              : langues.data?.[0]
                                ? [langues.data[0]]
                                : [],
                        );
                      }}
                    >
                      {t("hiring.promote")}
                    </Button>
                  )}
                  {ficheCompte && (
                    <Button
                      size="sm"
                      variant={gererCompteOuvert ? "default" : "outline"}
                      onClick={() => setGererCompteOuvert((v) => !v)}
                    >
                      <UserSquare className="size-4" />
                      {t("posters.gererCompte")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      basculer.mutate({ id: fiche.id, actif: !fiche.is_active })
                    }
                  >
                    {fiche.is_active ? t("posters.disable") : t("posters.enable")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (window.confirm(t("posters.confirmDelete"))) retirer.mutate(fiche.id);
                    }}
                  >
                    {t("common.delete")}
                  </Button>
                </div>
              )}
            </>
          )}

          {fiche.role === "admin" && (
            <p className="text-sm text-muted-foreground">{t("nav.admin")}</p>
          )}
        </ModalFiche>
      )}
    </div>
  );
}
