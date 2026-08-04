import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, UserPlus, UserSquare, X } from "lucide-react";

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
import { useAuth } from "@/features/auth/AuthContext";
import { CompteEditor, PostsParJourCompte } from "@/features/moteur/CompteEditor";
import { CreateurPublications } from "@/features/moteur/CreateurPublications";
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
  majCoutMensuel,
  majLanguesRecruteur,
  majPoster,
  majUpwork,
  setLabelsCompte,
  setLabelsHmUgcVideo,
  supprimerPoster,
} from "@/features/moteur/api";
import { LabelPicker } from "@/features/moteur/LabelPicker";
import { listerUgcPersonas } from "@/features/ugc/api";
import { nomLangue } from "@/features/moteur/langues";
import { WarmupBadge } from "@/features/moteur/WarmupBadge";
import { phaseCreateur, type PhaseCreateur } from "@/features/moteur/warmup";
import type { CompteAvecDetails, Label as LabelType, PosterProfil } from "@/features/moteur/types";

const filtreLabelUgcVideoThematique = (lab: {
  slug: string;
  ugc_ai_video: boolean;
}) => Boolean(lab.ugc_ai_video) && lab.slug !== "ugc-ai-video";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Liens directs pour checker vite un créateur : son compte TikTok (déduit du
 *  pseudo) et sa conversation Upwork (saisie par l'admin, éditable en ligne). */
function CreateurLiens({
  poster,
  onSave,
}: {
  poster: PosterProfil;
  onSave: (url: string) => void;
}) {
  const { t } = useTranslation();
  const [edit, setEdit] = React.useState(false);
  const [url, setUrl] = React.useState(poster.upwork_url ?? "");
  const tiktok = poster.handle_tiktok
    ? `https://www.tiktok.com/@${poster.handle_tiktok.replace(/^@/, "")}`
    : null;
  const reference = poster.reference_handle
    ? `https://www.tiktok.com/@${poster.reference_handle.replace(/^@/, "")}`
    : null;

  return (
    <>
      {tiktok && (
        <a href={tiktok} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          TikTok ↗
        </a>
      )}
      {reference && (
        <a
          href={reference}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground underline underline-offset-2"
          title={t("posters.compteReference")}
        >
          {t("posters.reference")} @{poster.reference_handle} ↗
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
    </>
  );
}

/** Coût mensuel (€) d'un créateur/recruteur, éditable en ligne. Informatif. */
function CoutMensuel({ poster }: { poster: PosterProfil }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [edit, setEdit] = React.useState(false);
  const [val, setVal] = React.useState(poster.cout_mensuel != null ? String(poster.cout_mensuel) : "");

  const save = useMutation({
    mutationFn: () => majCoutMensuel(poster.id, val.trim() === "" ? null : Number(val)),
    onSuccess: () => {
      setEdit(false);
      queryClient.invalidateQueries({ queryKey: ["posters"] });
    },
  });

  if (edit) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-muted-foreground">{t("posters.coutMensuel")}</span>
        <Input
          type="number"
          min={0}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="0"
          className="h-7 w-24 text-xs"
        />
        <span>€</span>
        <Button size="sm" className="h-7" disabled={save.isPending} onClick={() => save.mutate()}>
          {t("common.save")}
        </Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setEdit(false)}>
          {t("common.cancel")}
        </Button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setVal(poster.cout_mensuel != null ? String(poster.cout_mensuel) : "");
        setEdit(true);
      }}
      className="underline underline-offset-2"
    >
      {poster.cout_mensuel != null
        ? `${poster.cout_mensuel} €/mois`
        : t("posters.coutAjouter")}
    </button>
  );
}

/**
 * Mot de passe commun à tous les posters, simple à dicter au téléphone. Il
 * reste en place : on ne demande à personne d'en choisir un autre.
 */
const MOT_DE_PASSE_INITIAL = "12345678";

/** Langues gérées par un recruteur : il peut créer des créateurs dans CHACUNE.
 *  Multi-sélection en chips (clic = active/désactive), enregistrée en direct. */
function LangueRecruteur({ recruteur }: { recruteur: PosterProfil }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });
  const maj = useMutation({
    mutationFn: (l: string[]) => majLanguesRecruteur(recruteur.id, l),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posters"] }),
  });

  // Ses langues = profiles.langues, en ignorant le défaut « {fr} » non voulu si
  // une nationalité existe (on ne montre que ce qui a du sens).
  const actives = new Set(recruteur.langues ?? []);
  const toutes = langues.data ?? [];

  const basculer = (l: string) => {
    const s = new Set(actives);
    if (s.has(l)) s.delete(l);
    else s.add(l);
    maj.mutate([...s]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
      <span>{t("posters.languesRecruteur")} :</span>
      {toutes.map((l) => (
        <button
          key={l}
          type="button"
          disabled={maj.isPending}
          onClick={() => basculer(l)}
          className={
            actives.has(l)
              ? "rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground"
              : "rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted"
          }
        >
          {nomLangue(l)}
        </button>
      ))}
      {actives.size === 0 && <span className="text-destructive">{t("posters.aucuneLangue")}</span>}
    </div>
  );
}

/** Langue du compte publication — select simple. */
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

/** Labels du compte — dropdown d'ajout + retraits. */
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

/** Labels thématiques UGC AI VIDEO d’un HM (propagés aux futurs créateurs). */
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
    <div className="space-y-1.5 border-t border-dashed pt-2">
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
      <p className="text-[11px] text-muted-foreground">{t("posters.hmUgcAiVideoLabelsAide")}</p>
    </div>
  );
}

export function AdminPostersPage() {
  const { t } = useTranslation();
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

  /** Défaut = actifs seulement (warmup / pas créé via le filtre Phase). */
  // Défaut « tous » : sinon les créateurs fraîchement créés (warmup pas
  // démarré → phase warmup) disparaissent de la liste admin.
  const [filtrePhase, setFiltrePhase] = React.useState<"tous" | PhaseCreateur>("tous");
  const [filtreLangue, setFiltreLangue] = React.useState("");
  const [filtreLabel, setFiltreLabel] = React.useState("");

  // Un compte de publication par poster (le TikTok qu'il tient) : on l'édite
  // directement ici, dépliable — plus besoin d'une page « Comptes » à part.
  const compteDe = React.useMemo(() => {
    const m = new Map<string, CompteAvecDetails>();
    for (const c of comptes.data ?? []) if (!m.has(c.poster_id)) m.set(c.poster_id, c);
    return m;
  }, [comptes.data]);
  const [ouverts, setOuverts] = React.useState<Set<string>>(new Set());
  /** Créateur dont on affiche la liste des TikToks publiés (clic sur le nom). */
  const [pubsId, setPubsId] = React.useState<string | null>(null);
  const basculerCompte = (id: string) =>
    setOuverts((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const personasUgc = useQuery({
    queryKey: ["ugc-personas"],
    queryFn: async () => (await listerUgcPersonas()).personas,
    staleTime: 60_000,
  });
  const personaParId = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const p of personasUgc.data ?? []) m.set(p.id, p.nom);
    return m;
  }, [personasUgc.data]);

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

  // Panneau d'ajout replié par défaut : la liste reste la vedette. On choisit
  // d'abord « poster » ou « recruteur », puis le formulaire correspondant s'ouvre.
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
  // Création directe d'un recruteur (hiring manager) par son nom + langues.
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
      role: "poster" | "hiring_manager";
      nationalite?: string;
      langues?: string[];
    }) => definirRole(input.id, input.role, input.nationalite, input.langues),
    onSuccess: () => {
      setPromoId(null);
      setPromoLangues([]);
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
  const retirer = useMutation({ mutationFn: supprimerPoster, onSuccess: rafraichir });
  const enregistrerUpwork = useMutation({
    mutationFn: (input: { id: string; url: string }) => majUpwork(input.id, input.url),
    onSuccess: rafraichir,
  });

  const formulairePoster = (
    <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-4" />
            {t("posters.title")}
          </CardTitle>
          <CardDescription>{t("posters.subtitle")}</CardDescription>
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
                          ? t("posters.plusDeReference")
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
              <Input id="recPrenom" required value={recPrenom} onChange={(e) => setRecPrenom(e.target.value)} />
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
                    {nomLangue(l)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("posters.languesRecruteurAide")}</p>
            </div>
            <div className="sm:col-span-3 space-y-1.5">
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
                  <p className="text-xs text-muted-foreground">
                    {t("posters.hmUgcAiVideoLabelsAide")}
                  </p>
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
                <p className="mt-2 text-sm text-destructive">{(creerRec.error as Error).message}</p>
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
      const na = [a.prenom, a.nom].filter(Boolean).join(" ") || a.email || "";
      const nb = [b.prenom, b.nom].filter(Boolean).join(" ") || b.email || "";
      return na.localeCompare(nb, "fr");
    });

  /** Vue plate seulement pour langue/label (la phase filtre dans les groupes). */
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

  const liste = (() => {
        const tous = posters.data ?? [];
        const nomDe = (p: (typeof tous)[number]) =>
          [p.prenom, p.nom].filter(Boolean).join(" ") || p.email || "—";
        const recruteurs = tous.filter((p) => p.role === "hiring_manager");
        const creators = trierCreateurs(tous.filter((p) => p.role === "poster").filter(matchCreateur));
        const admins = tous.filter((p) => p.role === "admin");
        const parManager = new Map<string, typeof tous>();
        for (const c of creators) {
          const k = c.manager_id ?? "__none__";
          parManager.set(k, [...(parManager.get(k) ?? []), c]);
        }

        const ligne = (poster: (typeof tous)[number]) => {
          const soiMeme = poster.id === user?.id;
          const estPoster = poster.role === "poster";
          const compte = compteDe.get(poster.id);
          const ouvert = ouverts.has(poster.id);
          const pubsOuvert = pubsId === poster.id;
          const labs = compte ? (labelsComptes.data?.get(compte.id) ?? []) : [];
          const nomAffiche =
            [poster.prenom, poster.nom].filter(Boolean).join(" ") || poster.email;
          return (
            <article
              key={poster.id}
              className="flex h-full flex-col overflow-hidden rounded-lg border bg-card"
            >
              <div className="flex flex-1 flex-col gap-2 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {estPoster ? (
                    <button
                      type="button"
                      onClick={() => setPubsId(pubsOuvert ? null : poster.id)}
                      className="text-sm font-medium underline underline-offset-2"
                      title={t("posters.tiktoksPublies")}
                    >
                      {nomAffiche}
                    </button>
                  ) : (
                    <span className="text-sm font-medium">{nomAffiche}</span>
                  )}
                  {soiMeme && <Badge variant="outline">{t("posters.you")}</Badge>}
                  {poster.role === "admin" && <Badge>{t("nav.admin")}</Badge>}
                  {poster.role === "hiring_manager" && (
                    <Badge variant="secondary">{t("hiring.badge")}</Badge>
                  )}
                  {poster.role === "hiring_manager" && poster.hm_ugc_ai_video && (
                    <Badge>{t("posters.hmUgcAiVideoBadge")}</Badge>
                  )}
                  {!poster.is_active && (
                    <Badge variant="secondary">{t("posters.disabled")}</Badge>
                  )}
                  {estPoster && (
                    <WarmupBadge
                      compteId={poster.compte_id}
                      startedAt={poster.warmup_started_at}
                      endsAt={poster.warmup_ends_at}
                      showStart={Boolean(poster.compte_id)}
                      startPending={warmupStart.isPending}
                      onStart={
                        poster.compte_id
                          ? () => warmupStart.mutate(poster.compte_id!)
                          : undefined
                      }
                      showSkip={Boolean(poster.compte_id)}
                      skipPending={warmupSkip.isPending}
                      onSkip={
                        poster.compte_id
                          ? () => warmupSkip.mutate(poster.compte_id!)
                          : undefined
                      }
                    />
                  )}
                  {estPoster && compte?.ugc_ai_video && (
                    <Badge
                      title={
                        compte.ugc_persona_id
                          ? t("posters.ugcPersona", {
                              nom:
                                personaParId.get(compte.ugc_persona_id) ??
                                compte.persona_nom ??
                                "—",
                            })
                          : t("posters.ugcSansPersona")
                      }
                    >
                      {t("posters.ugcAiVideoBadge")}
                    </Badge>
                  )}
                  {estPoster && compte?.ugc_ai && !compte.ugc_ai_video && (
                    <Badge
                      title={
                        compte.ugc_persona_id
                          ? t("posters.ugcPersona", {
                              nom:
                                personaParId.get(compte.ugc_persona_id) ??
                                compte.persona_nom ??
                                "—",
                            })
                          : t("posters.ugcSansPersona")
                      }
                    >
                      UGC
                    </Badge>
                  )}
                  {estPoster &&
                    (compte?.ugc_ai || compte?.ugc_ai_video) &&
                    compte.ugc_persona_id && (
                    <Badge variant="outline" className="max-w-[10rem] truncate">
                      {personaParId.get(compte.ugc_persona_id) ??
                        compte.persona_nom ??
                        compte.ugc_persona_id.slice(0, 8)}
                    </Badge>
                  )}
                  {estPoster && compte && labs.length === 0 && !compte.ugc_ai_video && (
                    <Badge variant="warning">{t("posters.sansLabels")}</Badge>
                  )}
                  {estPoster && poster.score != null && (
                    <Badge
                      variant="secondary"
                      title={
                        t("posters.eloCompteAide") +
                        (poster.score_maj_at
                          ? ` · ${new Date(poster.score_maj_at).toLocaleString()}`
                          : "")
                      }
                    >
                      {t("posters.eloCompte", { score: Number(poster.score).toFixed(1) })}
                    </Badge>
                  )}
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="truncate">{poster.email}</p>
                  {estPoster && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <CreateurLiens
                        poster={poster}
                        onSave={(url) =>
                          enregistrerUpwork.mutate({ id: poster.id, url })
                        }
                      />
                    </div>
                  )}
                  {poster.role !== "admin" && <CoutMensuel poster={poster} />}
                </div>

                {poster.role === "hiring_manager" && <LangueRecruteur recruteur={poster} />}
                {poster.role === "hiring_manager" && poster.hm_ugc_ai_video && (
                  <HmUgcVideoLabelsEditeur profileId={poster.id} />
                )}

                {estPoster && compte && (
                  <div className="grid gap-2 border-t border-dashed pt-2 sm:grid-cols-2">
                    <LangueCompteSelect compte={compte} />
                    <LabelsCompteSelect compteId={compte.id} actifs={labs} />
                    <div className="sm:col-span-2">
                      <PostsParJourCompte compte={compte} />
                    </div>
                  </div>
                )}

                {!soiMeme && (
                  <div className="mt-auto flex flex-wrap gap-1.5 border-t pt-2">
                    {poster.role === "hiring_manager" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={changerRole.isPending}
                        onClick={() => changerRole.mutate({ id: poster.id, role: "poster" })}
                      >
                        {t("hiring.revoke")}
                      </Button>
                    )}
                    {poster.role === "poster" && promoId !== poster.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPromoId(poster.id);
                          const compteLangue = compteDe.get(poster.id)?.langue;
                          setPromoLangues(
                            compteLangue
                              ? [compteLangue]
                              : poster.langues?.length
                                ? [...poster.langues]
                                : langues.data?.[0]
                                  ? [langues.data[0]]
                                  : [],
                          );
                        }}
                      >
                        {t("hiring.promote")}
                      </Button>
                    )}
                    {poster.role === "poster" && promoId === poster.id && (
                      <div className="flex w-full flex-col gap-1.5">
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
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            disabled={changerRole.isPending || promoLangues.length === 0}
                            onClick={() =>
                              changerRole.mutate({
                                id: poster.id,
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
                    {estPoster && (
                      <Button
                        size="sm"
                        variant={ouvert ? "default" : "outline"}
                        onClick={() => basculerCompte(poster.id)}
                      >
                        <UserSquare className="size-4" />
                        {t("posters.gererCompte")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        basculer.mutate({ id: poster.id, actif: !poster.is_active })
                      }
                    >
                      {poster.is_active ? t("posters.disable") : t("posters.enable")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (window.confirm(t("posters.confirmDelete")))
                          retirer.mutate(poster.id);
                      }}
                    >
                      {t("common.delete")}
                    </Button>
                  </div>
                )}
              </div>

              {estPoster && pubsOuvert && (
                <div className="border-t px-3 py-3">
                  <CreateurPublications
                    poster={poster}
                    onClose={() => setPubsId(null)}
                  />
                </div>
              )}

              {estPoster && ouvert && (
                <div className="border-t px-3 py-3">
                  {compte ? (
                    <CompteEditor compte={compte} />
                  ) : comptes.isPending ? (
                    <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">{t("posters.sansCompteCree")}</p>
                      <Button
                        size="sm"
                        disabled={creerCompteVide.isPending}
                        onClick={() => creerCompteVide.mutate(poster)}
                      >
                        {creerCompteVide.isPending ? t("common.saving") : t("posters.creerCompte")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        };

        if (posters.isPending) {
          return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
        }
        if (tous.length === 0) return <EmptyState title={t("posters.empty")} />;

        const grille = (membres: typeof tous) =>
          membres.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("posters.aucunCreateur")}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{membres.map(ligne)}</div>
          );

        const section = (
          titre: string,
          count: number,
          membres: typeof tous,
          opts?: { badge?: string; sousTitre?: string },
        ) => (
          <section key={titre} className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-2 border-b pb-1.5">
              <h2 className="text-sm font-semibold">{titre}</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
              {opts?.badge && <Badge variant="outline">{opts.badge}</Badge>}
              {opts?.sousTitre && (
                <span className="w-full text-[11px] text-muted-foreground sm:w-auto sm:ml-auto">
                  {opts.sousTitre}
                </span>
              )}
            </div>
            {grille(membres)}
          </section>
        );

        // Filtres actifs : vue plate des créateurs matchés (plus simple à scanner).
        if (filtresActifs) {
          return (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2 border-b pb-1.5">
                <h2 className="text-sm font-semibold">{t("posters.createursFiltres")}</h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {creators.length}
                </span>
              </div>
              {grille(creators)}
            </div>
          );
        }

        return (
          <div className="space-y-8">
            {recruteurs.length > 0 &&
              section(t("posters.recruteurs"), recruteurs.length, recruteurs, {
                badge: t("hiring.badge"),
              })}
            {recruteurs.map((rec) => {
              const membres = parManager.get(rec.id) ?? [];
              if (membres.length === 0) return null;
              return section(nomDe(rec), membres.length, membres, {
                sousTitre: t("posters.createursDuRecruteur"),
              });
            })}
            {(parManager.get("__none__") ?? []).length > 0 &&
              section(
                t("posters.sansRecruteur"),
                (parManager.get("__none__") ?? []).length,
                parManager.get("__none__") ?? [],
              )}
            {filtrePhase === "tous" &&
              admins.length > 0 &&
              section(t("nav.admin"), admins.length, admins)}
          </div>
        );
  })();

  return (
    <div className="space-y-6">
      {/* Barre du haut : titre + un seul « + » pour ajouter un poster OU un
          recruteur. Le formulaire ne s'affiche que si on clique — la liste
          reste la vedette. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h1 className="text-lg font-semibold">{t("posters.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("posters.subtitle")}</p>
          <p className="text-xs text-muted-foreground">{t("posters.labelsAide")}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
            <span>{t("warmup.phasesLegende")}</span>
            <Badge variant="outline">{t("warmup.phasePasCree")}</Badge>
            <Badge variant="warning">{t("warmup.phaseWarmupAttente")}</Badge>
            <Badge variant="success">{t("warmup.phaseActif")}</Badge>
          </div>
        </div>
        {ajout === "ferme" ? (
          <div className="flex gap-2">
            <Button onClick={() => { setCree(null); setAjout("poster"); }}>
              <Plus className="size-4" />
              {t("posters.ajouterPoster")}
            </Button>
            <Button variant="outline" onClick={() => { setRecCree(null); setAjout("recruteur"); }}>
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
    </div>
  );
}
