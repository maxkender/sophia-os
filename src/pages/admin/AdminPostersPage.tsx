import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { HelpCircle, MapPin, Plus, Search, UserPlus, X } from "lucide-react";

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
import { messageErreur } from "@/lib/utils";
import { badgeManager, estRoleManager, useAuth } from "@/features/auth/AuthContext";
import { CompteursPhases, ListeCreateursSuivi } from "@/features/hiring/SuiviCreateurs";
import { AvatarProfil } from "@/features/hiring/AvatarProfil";
import type { ZoneCarte } from "@/features/hiring/carteZones";
import { equipesParDm, hmsDuDm, nomProfil, resumeHm, type EquipeDm } from "@/features/hiring/suiviEquipe";
import {
  CLE_SANS_ZONE,
  ZONE_LONGUEUR_MAX,
  cleZone,
  normaliserZone,
  regrouperParZone,
  zoneDuCreateur,
  zonesConnues,
  type BlocRecruteur,
  type GroupeZone,
} from "@/features/hiring/zones";
import { CompteEditor, PostsParJourCompte } from "@/features/moteur/CompteEditor";
import { estCompteCm } from "@/features/moteur/comptesCm";
import { paysAEnvoyer, paysRequis } from "@/features/moteur/paysCompte";
import { ChampsPremierCompte, type PremierCompte } from "@/features/moteur/ChampsPremierCompte";
import { DeplacerCompte } from "@/features/moteur/DeplacerCompte";
import { FormulaireAjouterCompte } from "@/features/moteur/FormulaireAjouterCompte";
import { BadgeClassement } from "@/features/moteur/BadgeClassement";
import {
  aujourdhuiParis,
  cohortePosteur,
  COHORTE_PAS_DEMARRE,
  comparerCohortes,
  lundiDepartCompte,
  optionsCohortes,
  semaineDansCohorte,
  semaineIso,
  TRIS_POSTERS,
  type TriPosters,
} from "@/features/moteur/cohortes";
import { EnteteCompte } from "@/features/moteur/VignetteCompte";
import {
  assurerComptePoster,
  activerPoster,
  creerCompteUgcVideo,
  creerPoster,
  creerRecruteur,
  listerApplications,
  definirRole,
  demarrerWarmup,
  skipWarmup,
  labelsDesComptes,
  listerComptesAvecDormants,
  listerLabels,
  listerLanguesReference,
  listerPosters,
  lireZonesCohorteRuul,
  majCompte,
  premiersJoursComptes,
  majLanguesRecruteur,
  majRecruteur,
  majUpwork,
  majZoneRecruteur,
  setLabelsCompte,
  supprimerPoster,
} from "@/features/moteur/api";
import { estLabelFileSlideshow } from "@/features/moteur/fileLabelsSlideshow";
import { ApplicationsDuLabel } from "@/features/moteur/repartition/ApplicationsDuLabel";
import { ChoixApplicationsCreation } from "@/features/moteur/repartition/ChoixApplicationsCreation";
import {
  cleErreurChoixCompte,
  peutChoisirApplicationsCompte,
} from "@/features/moteur/repartition/choixCreation";
import { useChoixApplicationsCreation } from "@/features/moteur/repartition/useChoixApplicationsCreation";
import {
  applicationsAfficheesCompte,
  posterPromeutApplication,
} from "@/features/moteur/repartition/logique";
import { PartsApplicationsCompte } from "@/features/moteur/repartition/PartsApplicationsCompte";
import { useLiensLabels } from "@/features/moteur/repartition/useMultiApp";
import { SelectApplication } from "@/features/moteur/SelectApplication";
import { drapeauLangue, langueInitiale, nomLangue } from "@/features/moteur/langues";
import { drapeauPays, estCodePays, nomPaysIso, paysTries } from "@/features/moteur/pays";
import { WarmupBadge } from "@/features/moteur/WarmupBadge";
import { phaseCreateur, type PhaseCreateur } from "@/features/moteur/warmup";
import type {
  Classement,
  CompteAvecDetails,
  Label as LabelType,
  PosterProfil,
} from "@/features/moteur/types";
import { localeDate } from "@/locales/localeDate";

// Carte des zones : d3-geo et le fond de carte dans un morceau à part.
const CarteZones = React.lazy(() => import("@/features/hiring/CarteZones"));

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const MOT_DE_PASSE_INITIAL = "12345678";

/**
 * Recherche insensible à la casse et aux accents (« elodie » trouve « Élodie »).
 * ł, ı, ø, đ, æ, œ, ß n'ont pas de décomposition NFD : convertis à la main
 * (« michal » trouve « Michał », « isil » trouve « Işıl »).
 */
function sansAccents(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/ł/g, "l")
    .replace(/ı/g, "i")
    .replace(/ø/g, "o")
    .replace(/đ/g, "d")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/ß/g, "ss");
}

function nomAffiche(p: PosterProfil): string {
  return [p.prenom, p.nom].filter(Boolean).join(" ") || p.email || "—";
}

/** Valeur du filtre « pays à renseigner » : un `comptes.pays` encore NULL. */
const CLE_SANS_PAYS = "__sans_pays__";

/** Petits drapeaux en haut à droite des cartes grille (aperçu rapide des langues). */
function DrapeauxLangues({ codes }: { codes: string[] }) {
  const uniques = [...new Set(codes.filter(Boolean))];
  if (uniques.length === 0) return null;
  return (
    <span
      className="flex shrink-0 flex-wrap items-center justify-end gap-0.5 text-[15px] leading-none"
      aria-label={uniques.map(nomLangue).join(", ")}
    >
      {uniques.map((code) => (
        <span key={code} title={nomLangue(code)} className="select-none">
          {drapeauLangue(code)}
        </span>
      ))}
    </span>
  );
}

/**
 * Drapeaux des PAYS où l'équipe d'un recruteur poste réellement. Les langues
 * gérées ne disent pas le pays : « ru » sortait 🇷🇺 alors que la Russie n'est
 * pas un de nos marchés et que les comptes russophones sont kazakhs.
 */
function DrapeauxPays({ codes }: { codes: string[] }) {
  const uniques = [...new Set(codes.filter((c) => estCodePays(c)))].sort();
  if (uniques.length === 0) return null;
  return (
    <span
      className="flex shrink-0 flex-wrap items-center justify-end gap-0.5 text-[15px] leading-none"
      aria-label={uniques.map((c) => nomPaysIso(c)).join(", ")}
    >
      {uniques.map((code) => (
        <span key={code} title={nomPaysIso(code)} className="select-none">
          {drapeauPays(code)}
        </span>
      ))}
    </span>
  );
}

/** Compte en sommeil (`is_active = false`) : visible ici, ni assigné ni mesuré. */
function BadgeDormant() {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" title={t("posters.compteDormantAide")}>
      {t("posters.compteDormant")}
    </Badge>
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
        <span className="mb-2 block">{t("posters.aideZones")}</span>
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
  large,
  children,
}: {
  titre: string;
  onClose: () => void;
  large?: boolean;
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
        className={
          large
            ? "max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-card p-5 shadow-lifted"
            : "max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-card p-5 shadow-lifted"
        }
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
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });
  const maj = useMutation({
    mutationFn: (l: string[]) => majLanguesRecruteur(recruteur.id, l),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posters"] }),
  });

  const actives = recruteur.langues ?? [];
  const resume = actives.length > 0 ? actives.map(nomLangue).join(", ") : t("posters.aucuneLangue");

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
            {actives.includes(l) ? `✓ ${nomLangue(l)}` : nomLangue(l)}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Zone d'un recruteur : texte libre, avec les zones déjà utilisées en
 * suggestion pour ne pas créer « Turquie + Israël » à côté de « Turkey + Israel ».
 * Vide = sans zone. Ses créateurs suivent : aucun autre champ à toucher.
 */
function EditeurZoneRecruteur({
  recruteur,
  zones,
  idPrefixe,
}: {
  recruteur: PosterProfil;
  zones: string[];
  idPrefixe: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const enregistree = normaliserZone(recruteur.zone_recrutement);
  const [valeur, setValeur] = React.useState(enregistree ?? "");
  React.useEffect(() => {
    setValeur(enregistree ?? "");
  }, [enregistree, recruteur.id]);
  const maj = useMutation({
    mutationFn: (zone: string | null) => majZoneRecruteur(recruteur.id, zone),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posters"] }),
  });
  const nouvelle = normaliserZone(valeur);
  const inchangee = nouvelle === enregistree;

  return (
    <form
      className="space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (!inchangee) maj.mutate(nouvelle);
      }}
    >
      <div className="flex gap-2">
        <Input
          id={`${idPrefixe}-zone`}
          list={`${idPrefixe}-zones`}
          value={valeur}
          maxLength={ZONE_LONGUEUR_MAX}
          placeholder={t("posters.zonePlaceholder")}
          onChange={(e) => {
            maj.reset();
            setValeur(e.target.value);
          }}
        />
        <datalist id={`${idPrefixe}-zones`}>
          {zones.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
        <Button type="submit" size="sm" variant="outline" disabled={inchangee || maj.isPending}>
          {maj.isPending ? t("common.saving") : t("posters.zoneEnregistrer")}
        </Button>
      </div>
      {maj.isError && <p className="text-xs text-destructive">{messageErreur(maj.error)}</p>}
      {maj.isSuccess && inchangee && (
        <p className="text-xs text-success">{t("posters.zoneEnregistree")}</p>
      )}
      <p className="text-[11px] text-muted-foreground">{t("posters.zoneAide")}</p>
    </form>
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

/**
 * Pays du compte. Séparé de la langue exprès : cinq marchés anglophones
 * partagent `en`, et tant que le drapeau suivait la langue ils étaient tous
 * 🇬🇧. Le moteur ne lit pas ce champ, le changer ne touche ni l'assignation
 * ni la traduction.
 */
function PaysCompteSelect({ compte }: { compte: CompteAvecDetails }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const options = React.useMemo(() => paysTries(), []);
  const maj = useMutation({
    mutationFn: (pays: string) => majCompte(compte.id, { pays: pays || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comptes"] });
      queryClient.invalidateQueries({ queryKey: ["posters"] });
    },
  });

  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {t("posters.pays")}
      </Label>
      <select
        className={selectClass}
        value={compte.pays ?? ""}
        disabled={maj.isPending}
        onChange={(e) => maj.mutate(e.target.value)}
      >
        <option value="">{t("posters.paysARenseigner")}</option>
        {options.map((p) => (
          <option key={p.code} value={p.code}>
            {drapeauPays(p.code)} {p.nom}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Recruteur d'un créateur. Un poster créé par l'admin ou le Head of Ops leur
 * est rattaché : ils le passent ici au HM de sa zone (ticket Aram, 18/10).
 */
function ChoixRecruteur({
  poster,
  recruteurs,
}: {
  poster: PosterProfil;
  recruteurs: PosterProfil[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const maj = useMutation({
    mutationFn: (managerId: string) => majRecruteur(poster.id, managerId || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posters"] });
    },
  });

  return (
    <div className="max-w-sm space-y-1">
      <Label
        htmlFor={`recruteur-${poster.id}`}
        className="text-[10px] uppercase tracking-wide text-muted-foreground"
      >
        {t("posters.changerRecruteur")}
      </Label>
      <select
        id={`recruteur-${poster.id}`}
        className={selectClass}
        value={poster.manager_id ?? ""}
        disabled={maj.isPending}
        onChange={(e) => maj.mutate(e.target.value)}
      >
        <option value="">{t("posters.sansRecruteur")}</option>
        {recruteurs.map((r) => (
          <option key={r.id} value={r.id}>
            {nomAffiche(r)}
            {r.zone_recrutement ? ` · ${r.zone_recrutement}` : ""}
          </option>
        ))}
      </select>
      {maj.isError && <p className="text-xs text-destructive">{messageErreur(maj.error)}</p>}
    </div>
  );
}

/**
 * Labels d'un compte. Tous les labels sont proposés (plus de cloison par
 * application) ; chaque pastille dit quelles applications le label sert, donc
 * ce que le compte pourra promouvoir.
 */
function LabelsCompteSelect({
  compteId,
  actifs,
}: {
  compteId: string;
  actifs: LabelType[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const labels = useQuery({
    queryKey: ["labels"],
    queryFn: () => listerLabels(),
  });
  const ids = actifs.map((l) => l.id);
  const maj = useMutation({
    mutationFn: (next: string[]) => setLabelsCompte(compteId, next),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["compte-labels-all"] });
      await queryClient.invalidateQueries({ queryKey: ["compte-labels", compteId] });
    },
  });

  const disponibles = (labels.data ?? [])
    .filter((l) => estLabelFileSlideshow(l))
    .filter((l) => !ids.includes(l.id));

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
              className="inline-flex items-baseline gap-1 rounded-md border px-1.5 py-0.5 text-[11px] hover:bg-muted"
              title={t("common.delete")}
            >
              <span>{lab.nom}</span>
              <ApplicationsDuLabel labelId={lab.id} />
              <span>×</span>
            </button>
          ))}
        </div>
      )}
      {maj.error && <p className="text-xs text-destructive">{messageErreur(maj.error)}</p>}
    </div>
  );
}


export function AdminPostersPage() {
  const { t, i18n } = useTranslation();
  const { user, role } = useAuth();
  // Choix de l'application du compte à la création (admin, Head of Ops, DM,
  // HM). Vérifié quand même ici : manage-users refuse tout autre rôle.
  const peutChoisirApps = peutChoisirApplicationsCompte(role);
  const queryClient = useQueryClient();
  const posters = useQuery({ queryKey: ["posters"], queryFn: listerPosters });
  // Cohorte Ruul (posters venus du site) → HM de la zone de leur pays.
  const cohorteRuul = useQuery({ queryKey: ["posters", "cohorte-ruul"], queryFn: lireZonesCohorteRuul });
  const zonesCohorteRuul = cohorteRuul.data;
  // Zones déjà données aux recruteurs : filtre de la page et suggestions de saisie.
  const zonesExistantes = React.useMemo(() => zonesConnues(posters.data ?? []), [posters.data]);
  // Email du recruteur d'un créateur : chercher « hugo@… » garde ses créateurs,
  // comme chercher son nom (manager_nom).
  const emailParId = React.useMemo(
    () => new Map((posters.data ?? []).map((p) => [p.id, p.email])),
    [posters.data],
  );
  // Comptes en sommeil compris (badge « Dormant ») : sous la clé ["comptes"],
  // les invalidations de la page les rechargent aussi.
  const comptes = useQuery({ queryKey: ["comptes", "avec-dormants"], queryFn: listerComptesAvecDormants });
  // TOUS les pays, avec le nombre de comptes de chacun. Une première version
  // ne listait que les marchés déjà ouverts : l'Australie, la Nouvelle-Zélande
  // et l'Irlande manquaient donc à l'appel, précisément les pays où l'on veut
  // recruter. Un pays à zéro n'est pas du bruit ici, c'est la cible.
  const paysOptions = React.useMemo(() => {
    const compte = new Map<string, number>();
    for (const c of comptes.data ?? []) {
      if (c.pays) compte.set(c.pays, (compte.get(c.pays) ?? 0) + 1);
    }
    return paysTries().map((p) => ({ ...p, n: compte.get(p.code) ?? 0 }));
  }, [comptes.data]);
  const comptesSansPays = React.useMemo(
    () => (comptes.data ?? []).filter((c) => !c.pays).length,
    [comptes.data],
  );
  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });
  const applications = useQuery({ queryKey: ["applications"], queryFn: listerApplications });
  // Liens label → application : pour le filtre « application » (comptes dont
  // les labels servent l'application). En erreur (avant 0256), le filtre
  // retombe sur Sophia (`applicationsServies` sans lien).
  const liensLabels = useLiensLabels();
  const labelsComptes = useQuery({
    queryKey: ["compte-labels-all", (comptes.data ?? []).map((c) => c.id).join(",")],
    queryFn: () => labelsDesComptes((comptes.data ?? []).map((c) => c.id)),
    enabled: (comptes.data?.length ?? 0) > 0,
  });

  // Défaut « tous » : les nouveaux (warmup pas démarré) restent visibles.
  const [filtrePhase, setFiltrePhase] = React.useState<"tous" | PhaseCreateur>("tous");
  const [filtreLangue, setFiltreLangue] = React.useState("");
  // Pays du compte (ISO-3166), ou CLE_SANS_PAYS pour « à renseigner ».
  const [filtrePays, setFiltrePays] = React.useState("");
  const [filtreLabel, setFiltreLabel] = React.useState("");
  const [filtreApp, setFiltreApp] = React.useState("tous");
  // Seulement la cohorte Ruul (posters venus du site, payés par Ruul).
  const [filtreRuul, setFiltreRuul] = React.useState(false);
  // Zone de recrutement (clé `cleZone`, ou CLE_SANS_ZONE) ; "" = toutes.
  const [filtreZone, setFiltreZone] = React.useState("");
  // Zone survolée sur la carte ou sur sa puce : les deux se répondent.
  const [zoneSurvolee, setZoneSurvolee] = React.useState<string | null>(null);
  // Une zone renommée, vidée ou sans plus aucun recruteur ne doit pas laisser
  // la page vide derrière un filtre qui s'affiche « Toutes » : un filtre qui
  // ne désigne plus aucune zone connue ne filtre plus rien.
  const filtreZoneEffectif =
    filtreZone === CLE_SANS_ZONE || zonesExistantes.some((z) => cleZone(z) === filtreZone)
      ? filtreZone
      : "";
  const [recherche, setRecherche] = React.useState("");
  // Cohorte et tri dans l'adresse : un lien partagé ouvre la même cohorte.
  const [params, setParams] = useSearchParams();
  const filtreCohorte = params.get("cohorte") ?? "";
  const triParam = params.get("tri") as TriPosters | null;
  const tri: TriPosters = triParam && TRIS_POSTERS.includes(triParam) ? triParam : "phase";
  const majParam = (cle: string, valeur: string) =>
    setParams(
      (avant) => {
        const suite = new URLSearchParams(avant);
        if (valeur) suite.set(cle, valeur);
        else suite.delete(cle);
        return suite;
      },
      { replace: true },
    );
  const labels = useQuery({
    queryKey: ["labels"],
    queryFn: () => listerLabels(),
  });

  // Badge d'application d'un compte : sa répartition, sinon ses labels
  // (`comptes.application_id` vaut Sophia pour tous les comptes). Le filtre
  // « application » lit la même règle.
  const slugParId = (id: string) => (applications.data ?? []).find((a) => a.id === id)?.slug;
  const applicationsCompte = (c: CompteAvecDetails) =>
    applicationsAfficheesCompte({
      parts: c.parts_applications,
      labels: labelsComptes.data ? (labelsComptes.data.get(c.id) ?? []) : null,
      liens: liensLabels.data ?? [],
      slugParId,
    });

  const comptesParPoster = React.useMemo(() => {
    const m = new Map<string, CompteAvecDetails[]>();
    for (const c of comptes.data ?? []) {
      const liste = m.get(c.poster_id) ?? [];
      liste.push(c);
      m.set(c.poster_id, liste);
    }
    return m;
  }, [comptes.data]);

  // Cohortes du lundi : le lundi de départ de chaque compte (premier post
  // prévu, sinon fin du warm-up), et pour le posteur le plus ancien de ses
  // comptes, sommeil compris (un posteur recréé ou doublé garde sa cohorte).
  const premiersJours = useQuery({ queryKey: ["comptes-premier-jour"], queryFn: premiersJoursComptes });
  const lundiParCompte = React.useMemo(() => {
    const m = new Map<string, string | null>();
    for (const c of comptes.data ?? []) {
      m.set(c.id, lundiDepartCompte(premiersJours.data?.get(c.id), c.warmup_ends_at));
    }
    return m;
  }, [comptes.data, premiersJours.data]);
  const cohorteDe = React.useCallback(
    (posterId: string) =>
      cohortePosteur((comptesParPoster.get(posterId) ?? []).map((c) => lundiParCompte.get(c.id) ?? null)),
    [comptesParPoster, lundiParCompte],
  );
  const aujourdhui = aujourdhuiParis();
  const dateCourte = (jour: string) =>
    new Intl.DateTimeFormat(localeDate(i18n.language), { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${jour}T12:00:00Z`),
    );

  const [ficheId, setFicheId] = React.useState<string | null>(null);
  const [ficheCompteId, setFicheCompteId] = React.useState<string | null>(null);

  // « Créer le premier compte » d'une fiche sans compte : même choix de
  // l'application, à refaire (rien de coché) à chaque fiche ouverte.
  const choixAppsPremier = useChoixApplicationsCreation(
    peutChoisirApps && ficheId !== null,
    (posters.data ?? []).find((p) => p.id === ficheId)?.langues[0] ?? "fr",
  );
  const reinitialiserChoixPremier = choixAppsPremier.reinitialiser;
  React.useEffect(() => {
    reinitialiserChoixPremier();
  }, [ficheId, reinitialiserChoixPremier]);

  const creerCompteVide = useMutation({
    mutationFn: (p: PosterProfil) =>
      assurerComptePoster({
        userId: p.id,
        langue: p.langues[0] ?? "fr",
        ...choixAppsPremier.options,
      }),
    onSuccess: () => {
      reinitialiserChoixPremier();
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
  React.useEffect(() => {
    const liste = langues.data ?? [];
    if (!liste.length) return;
    setLangue((actuel) => langueInitiale(liste, actuel));
  }, [langues.data]);
  const [premierCompte, setPremierCompte] = React.useState<PremierCompte>("perso");
  const [paysCompte, setPaysCompte] = React.useState("");
  // Un pays choisi pour l'anglais n'a plus de sens une fois passé au suédois.
  React.useEffect(() => {
    setPaysCompte("");
  }, [langue]);
  const [postsParJour, setPostsParJour] = React.useState<1 | 2 | 3>(2);
  const [handleTiktok, setHandleTiktok] = React.useState("");
  // Compte UGC vidéo (pod 3) : login seul côté manage-users, puis le compte
  // vidéos uniquement créé ici — ni label ni persona de la file.
  const [ugcVideo, setUgcVideo] = React.useState(false);
  const [handleInstagram, setHandleInstagram] = React.useState("");
  const [password, setPassword] = React.useState(MOT_DE_PASSE_INITIAL);
  // Application du premier compte : seulement quand manage-users crée un
  // compte slideshow (ni « aucun compte », ni UGC vidéo — celui-là n'a pas de
  // label), formulaire ouvert. Inactif ou Sophia : options vides, corps inchangé.
  const choixAppsPoster = useChoixApplicationsCreation(
    peutChoisirApps && ajout === "poster" && !ugcVideo && premierCompte === "perso",
    langue,
  );
  const [cree, setCree] = React.useState<{
    email: string;
    password: string;
    type: PremierCompte | "ugc_video";
  } | null>(null);

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["posters"] });

  const creer = useMutation({
    mutationFn: async () => {
      if (ugcVideo) {
        const r = await creerPoster({ prenom, nom, password, type_compte: "aucun" });
        await creerCompteUgcVideo({
          posterId: r.userId,
          langue,
          ...(paysAEnvoyer(langue, paysCompte)
            ? { pays: paysAEnvoyer(langue, paysCompte)! }
            : {}),
          personaNom: prenom,
          handleTiktok,
          handleInstagram,
        });
        return r;
      }
      return creerPoster({
        prenom,
        nom,
        password,
        langue: premierCompte === "aucun" ? undefined : langue || undefined,
        type_compte: premierCompte,
        posts_par_jour: premierCompte === "perso" ? postsParJour : undefined,
        handle_tiktok: premierCompte === "perso" ? handleTiktok : undefined,
        ...(paysAEnvoyer(langue, paysCompte)
          ? { pays: paysAEnvoyer(langue, paysCompte)! }
          : {}),
        ...choixAppsPoster.options,
      });
    },
    onSuccess: (r) => {
      setCree({ email: r.email, password, type: ugcVideo ? "ugc_video" : premierCompte });
      choixAppsPoster.reinitialiser();
      setPrenom("");
      setNom("");
      setHandleTiktok("");
      setHandleInstagram("");
      setPaysCompte("");
      setPostsParJour(2);
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
  const [recZone, setRecZone] = React.useState("");
  const [recCree, setRecCree] = React.useState<{
    email: string;
    erreurZone: string | null;
  } | null>(null);
  const basculerRecLangue = (l: string) =>
    setRecLangues((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));
  const creerRec = useMutation({
    mutationFn: async () => {
      const r = await creerRecruteur({
        prenom: recPrenom,
        nom: recNom,
        langues: recLangues,
      });
      // Le login existe déjà : un échec de la zone ne doit pas faire croire
      // que la création a échoué (et pousser à recréer un doublon).
      const zone = normaliserZone(recZone);
      if (!zone) return { ...r, erreurZone: null };
      try {
        await majZoneRecruteur(r.userId, zone);
        return { ...r, erreurZone: null };
      } catch (e) {
        return { ...r, erreurZone: messageErreur(e) };
      }
    },
    onSuccess: (r) => {
      setRecCree({ email: r.email, erreurZone: r.erreurZone });
      setRecPrenom("");
      setRecNom("");
      setRecLangues([]);
      setRecZone("");
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
      activerPoster(input.id, input.actif),
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

  const ouvrirFiche = (id: string, compteId?: string) => {
    setFicheId(id);
    setFicheCompteId(compteId ?? comptesParPoster.get(id)?.[0]?.id ?? null);
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
            // Application du compte non choisie : le bloc le dit, rien ne part.
            if (!choixAppsPoster.verifier()) return;
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
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={ugcVideo}
              onChange={(e) => {
                setUgcVideo(e.target.checked);
                if (e.target.checked) {
                  setPremierCompte("perso");
                  setLangue(langueInitiale(langues.data ?? [], langue));
                }
              }}
            />
            <span>
              <span className="font-medium">{t("posters.ugcVideo")}</span>
              <span className="block text-xs text-muted-foreground">{t("posters.ugcVideoAide")}</span>
            </span>
          </label>
          <ChampsPremierCompte
            allowAucun={!ugcVideo}
            typeCompte={ugcVideo ? "perso" : premierCompte}
            onType={(type) => {
              setPremierCompte(type);
              if (type !== "aucun") setLangue(langueInitiale(langues.data ?? [], langue));
            }}
            langues={langues.data ?? []}
            langue={langue}
            onLangue={setLangue}
            pays={paysCompte}
            onPays={setPaysCompte}
            postsParJour={ugcVideo ? undefined : postsParJour}
            onPostsParJour={ugcVideo ? undefined : setPostsParJour}
            handle={handleTiktok}
            onHandle={setHandleTiktok}
          />
          <ChoixApplicationsCreation etat={choixAppsPoster} idPrefixe="poster-apps" />
          {ugcVideo && (
            <div className="space-y-1">
              <Label htmlFor="premier-handle-instagram">{t("comptes.pseudoInstagram")}</Label>
              <Input
                id="premier-handle-instagram"
                value={handleInstagram}
                placeholder={t("comptes.pseudoPlaceholder")}
                onChange={(e) => setHandleInstagram(e.target.value)}
              />
            </div>
          )}
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
            <Button
              type="submit"
              disabled={
                creer.isPending ||
                ((ugcVideo || premierCompte !== "aucun") && !langue) ||
                ((ugcVideo || premierCompte !== "aucun") &&
                  paysRequis(langue) &&
                  !paysCompte) ||
                choixAppsPoster.bloque
              }
            >
              {creer.isPending ? t("common.saving") : t("posters.create")}
            </Button>
            {choixAppsPoster.signalerManquant && (
              <p className="mt-2 text-sm text-destructive">{t("choixCompteCreation.choisirAvant")}</p>
            )}
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
                        : cleErreurChoixCompte(creer.error)
                          ? t(cleErreurChoixCompte(creer.error)!)
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
            <p className="text-xs text-muted-foreground">
              {cree.type === "ugc_video"
                ? t("posters.creeUgcVideo")
                : cree.type === "cm"
                ? t("posters.creeCm")
                : cree.type === "aucun"
                  ? t("posters.creeAucun")
                  : t("warmup.apresCreation")}
            </p>
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
                  {nomLangue(l)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("posters.languesRecruteurAide")}</p>
          </div>
          <div className="space-y-2 sm:col-span-3">
            <Label htmlFor="recZone">{t("posters.zone")}</Label>
            <Input
              id="recZone"
              list="recZone-zones"
              value={recZone}
              maxLength={ZONE_LONGUEUR_MAX}
              placeholder={t("posters.zonePlaceholder")}
              onChange={(e) => setRecZone(e.target.value)}
            />
            <datalist id="recZone-zones">
              {zonesExistantes.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">{t("posters.zoneAide")}</p>
          </div>
          <div className="sm:col-span-3">
            <Button
              type="submit"
              disabled={creerRec.isPending || !recPrenom.trim() || recLangues.length === 0}
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
            {recCree?.erreurZone && (
              <p className="mt-1 text-sm text-destructive">
                {t("posters.zoneCreationErreur", { msg: recCree.erreurZone })}
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

  const rechercheNormalisee = sansAccents(recherche.trim());
  const matchCreateur = (p: PosterProfil) => {
    const phase = phaseCreateur({
      compteId: p.compte_id,
      warmup_started_at: p.warmup_started_at,
      warmup_ends_at: p.warmup_ends_at,
    });
    if (filtrePhase !== "tous" && phase !== filtrePhase) return false;
    if (filtreRuul && !zonesCohorteRuul?.has(p.id)) return false;
    if (filtreCohorte && (cohorteDe(p.id) ?? COHORTE_PAS_DEMARRE) !== filtreCohorte) return false;
    const liste = comptesParPoster.get(p.id) ?? [];
    if (filtreLangue && !liste.some((c) => c.langue === filtreLangue)) return false;
    if (filtrePays) {
      const correspond =
        filtrePays === CLE_SANS_PAYS
          ? liste.some((c) => !c.pays)
          : liste.some((c) => c.pays === filtrePays);
      if (!correspond) return false;
    }
    if (filtreLabel) {
      const labs = liste.flatMap((c) => labelsComptes.data?.get(c.id) ?? []);
      if (!labs.some((l) => l.id === filtreLabel)) return false;
    }
    if (filtreApp && filtreApp !== "tous") {
      // Ce que ses comptes PROMEUVENT (leur badge), pas ce que leurs labels
      // permettraient : un label Sophia + Unswipe sur un compte à la
      // répartition par défaut ne publie que Sophia.
      const comptesApp = liste.map((c) => ({
        parts: c.parts_applications,
        labels: labelsComptes.data ? (labelsComptes.data.get(c.id) ?? []) : null,
      }));
      if (!posterPromeutApplication(comptesApp, liensLabels.data ?? [], filtreApp, slugParId)) return false;
    }
    if (rechercheNormalisee) {
      const champs = [
        nomAffiche(p),
        p.email,
        p.manager_nom,
        p.manager_id ? emailParId.get(p.manager_id) : null,
        ...liste.flatMap((c) => {
          // Les @ sont stockés sans « @ » : « @maya » doit trouver « maya ».
          const handle = (c.handle_tiktok ?? "").replace(/^@+/, "");
          return [handle, handle ? `@${handle}` : null, c.persona_nom];
        }),
      ];
      if (!champs.some((v) => v && sansAccents(v).includes(rechercheNormalisee))) return false;
    }
    return true;
  };

  const trierCreateurs = (liste: PosterProfil[]) =>
    [...liste].sort((a, b) => {
      const parNom = () => nomAffiche(a).localeCompare(nomAffiche(b), "fr");
      if (tri === "nom") return parNom();
      if (tri === "cohorte_recente" || tri === "cohorte_ancienne") {
        return comparerCohortes(cohorteDe(a.id), cohorteDe(b.id), tri === "cohorte_recente") || parNom();
      }
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

  // Langue, label, application, recherche : la liste se réduit aux créateurs
  // retenus (les recruteurs sans créateur retenu sont masqués, sauf un
  // recruteur trouvé par son nom). La phase, comme avant les zones, ne filtre
  // que les créateurs : tous les recruteurs restent visibles et cliquables. Le
  // filtre de zone, lui, choisit des zones entières.
  const filtreListe =
    Boolean(filtreLangue) ||
    Boolean(filtrePays) ||
    Boolean(filtreLabel) ||
    (Boolean(filtreApp) && filtreApp !== "tous") ||
    filtreRuul ||
    Boolean(filtreCohorte) ||
    Boolean(rechercheNormalisee);
  const recruteurCherche = (r: PosterProfil) =>
    Boolean(rechercheNormalisee) &&
    [nomAffiche(r), r.email].some((v) => v && sansAccents(v).includes(rechercheNormalisee));

  const barreFiltres = (
    <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-6">
      <div className="space-y-1 sm:col-span-2 lg:col-span-6">
        <Label htmlFor="recherchePosters">{t("posters.recherche")}</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="recherchePosters"
            type="search"
            className="pl-8"
            value={recherche}
            placeholder={t("posters.recherchePlaceholder")}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="filtreZone">{t("posters.filtreZone")}</Label>
        <select
          id="filtreZone"
          className={selectClass}
          value={filtreZoneEffectif}
          onChange={(e) => setFiltreZone(e.target.value)}
        >
          <option value="">{t("posters.toutesZones")}</option>
          {zonesExistantes.map((z) => (
            <option key={z} value={cleZone(z)}>
              {z}
            </option>
          ))}
          <option value={CLE_SANS_ZONE}>{t("posters.sansZone")}</option>
        </select>
      </div>
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
        <Label htmlFor="filtrePays">{t("posters.filtrePays")}</Label>
        <select
          id="filtrePays"
          className={selectClass}
          value={filtrePays}
          onChange={(e) => setFiltrePays(e.target.value)}
        >
          <option value="">{t("posters.filtreTous")}</option>
          {paysOptions.map((p) => (
            <option key={p.code} value={p.code}>
              {drapeauPays(p.code)} {p.nom}
              {p.n > 0 ? ` (${p.n})` : ""}
            </option>
          ))}
          {comptesSansPays > 0 && (
            <option value={CLE_SANS_PAYS}>
              {t("posters.paysARenseigner")} ({comptesSansPays})
            </option>
          )}
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
      <div className="space-y-1">
        <Label htmlFor="filtreApp">{t("multiAppPosts.filtreApp")}</Label>
        <SelectApplication
          id="filtreApp"
          applications={applications.data ?? []}
          value={filtreApp}
          onChange={setFiltreApp}
          allowTous
        />
      </div>
      <div className="space-y-1 lg:col-span-2">
        <Label htmlFor="filtreCohorte">{t("posters.filtreCohorte")}</Label>
        <select
          id="filtreCohorte"
          className={selectClass}
          value={filtreCohorte}
          onChange={(e) => majParam("cohorte", e.target.value)}
        >
          <option value="">{t("posters.cohorteToutes")}</option>
          {optionsCohortes((posters.data ?? []).filter((p) => p.role === "poster").map((p) => cohorteDe(p.id))).map(
            (o) => (
              <option key={o.cle} value={o.cle}>
                {o.cle === COHORTE_PAS_DEMARRE
                  ? t("posters.cohortePasDemarre", { n: o.n })
                  : semaineDansCohorte(o.cle, aujourdhui) < 1
                  ? t("posters.cohorteAVenir", { date: dateCourte(o.cle), n: o.n })
                  : t("posters.cohorteOption", { date: dateCourte(o.cle), semaine: semaineIso(o.cle), n: o.n })}
              </option>
            ),
          )}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="triPosters">{t("posters.tri")}</Label>
        <select
          id="triPosters"
          className={selectClass}
          value={tri}
          onChange={(e) => majParam("tri", e.target.value === "phase" ? "" : e.target.value)}
        >
          {TRIS_POSTERS.map((x) => (
            <option key={x} value={x}>
              {t(`posters.tris.${x}`)}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-6">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-primary)]"
          checked={filtreRuul}
          onChange={(e) => setFiltreRuul(e.target.checked)}
        />
        {t("posters.filtreRuul", { n: zonesCohorteRuul?.size ?? 0 })}
      </label>
    </div>
  );

  const tous = posters.data ?? [];
  const admins = tous.filter((p) => p.role === "admin");
  const tousCreateurs = tous.filter((p) => p.role === "poster");
  // Zone → recruteur → créateurs. La zone est celle du RECRUTEUR (master list
  // Notion), dont ses créateurs héritent — pas la langue des comptes.
  const parZone = regrouperParZone(tous, {
    garderCreateur: matchCreateur,
    filtreActif: filtreListe,
    garderRecruteur: recruteurCherche,
    trierCreateurs,
    zonesCohorteRuul,
  });
  // Carte : toutes les zones, filtres ignorés — un filtre ne repeint pas la
  // carte, il ne fait que mettre sa zone en avant.
  const zonesCarte: ZoneCarte[] = regrouperParZone(tous, { zonesCohorteRuul }).zones.map((g) => ({
    cle: g.cle,
    zone: g.zone ?? "",
    compteurs: g.compteurs,
    recruteurs: g.recruteurs.map((b) => ({
      id: b.recruteur.id,
      nom: nomAffiche(b.recruteur),
      role: b.recruteur.role,
      photoUrl: b.recruteur.photo_url ?? null,
      actif: b.recruteur.is_active,
      createurs: b.compteursEquipe.total,
    })),
  }));
  // Équipe d'un DM (ses créateurs + ceux de ses HM), filtres ignorés : le
  // résumé que l'ancien arbre DM → HM donnait en tête de chaque DM.
  const equipeDm = new Map<string, EquipeDm>(equipesParDm(tous).map((e) => [e.dm.id, e]));
  const groupesZone: GroupeZone[] = [
    ...parZone.zones,
    ...(parZone.sansZone ? [parZone.sansZone] : []),
  ];

  /** Part des créateurs du recruteur en BIEN ou STAR (null s'il n'en a aucun). */
  const partBienRecruteur = (recId: string): number | null => {
    const cases = tousCreateurs
      .filter((c) => c.manager_id === recId && c.classement != null)
      .map((c) => c.classement as Classement);
    if (cases.length === 0) return null;
    const bien = cases.filter((c) => c === "bien" || c === "star").length;
    return bien / cases.length;
  };

  const languesRecruteur = (poster: PosterProfil) =>
    poster.langues?.length > 0 ? poster.langues : poster.nationalite ? [poster.nationalite] : [];

  /** Pays des comptes de ses créateurs directs ; les langues seulement s'il n'en a aucun. */
  const drapeauxRecruteur = (poster: PosterProfil) => {
    const pays = tousCreateurs
      .filter((c) => c.manager_id === poster.id)
      .flatMap((c) => (comptesParPoster.get(c.id) ?? []).map((x) => x.pays ?? ""));
    return pays.some((c) => estCodePays(c))
      ? <DrapeauxPays codes={pays} />
      : <DrapeauxLangues codes={languesRecruteur(poster)} />;
  };

  const carteRecruteur = (poster: PosterProfil) => {
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
            {!poster.is_active && <Badge variant="secondary">{t("posters.disabled")}</Badge>}
          </div>
          {drapeauxRecruteur(poster)}
        </div>
        <LangueRecruteurDropdown recruteur={poster} />
      </article>
    );
  };

  const carteCreateur = (poster: PosterProfil) => {
    const liste = comptesParPoster.get(poster.id) ?? [];
    const cohorte = cohorteDe(poster.id);
    const semaine = cohorte ? semaineDansCohorte(cohorte, aujourdhui) : null;
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
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold tracking-tight">{nomAffiche(poster)}</span>
              {!poster.is_active && <Badge variant="secondary">{t("posters.disabled")}</Badge>}
              {cohorte && semaine !== null && (
                <Badge variant="outline">
                  {semaine < 1
                    ? t("posters.badgeCohorteAVenir", { date: dateCourte(cohorte) })
                    : t("posters.badgeCohorte", { date: dateCourte(cohorte), n: semaine })}
                </Badge>
              )}
            </div>
            <p className="truncate text-[11px] text-muted-foreground">{poster.email}</p>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {t("posters.nbComptes", { n: liste.length })}
          </span>
        </div>
        {liste.length === 0 ? (
          <p className="rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
            {t("posters.aucunCompte")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {liste.map((c) => (
              <li
                key={c.id}
                className="rounded-md border bg-muted/30 px-2.5 py-2"
                onClick={(e) => {
                  e.stopPropagation();
                  ouvrirFiche(poster.id, c.id);
                }}
              >
                <EnteteCompte
                  compact
                  compte={c}
                  applications={applicationsCompte(c)}
                  extra={
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {!c.is_active && <BadgeDormant />}
                      <BadgeClassement classement={c.classement} size="sm" />
                      {liste.length > 1 && lundiParCompte.get(c.id) && (
                        <span>{t("posters.departCompte", { date: dateCourte(lundiParCompte.get(c.id)!) })}</span>
                      )}
                      {c.is_active && !estCompteCm(c) && (
                        <WarmupBadge
                          compteId={c.id}
                          startedAt={c.warmup_started_at}
                          endsAt={c.warmup_ends_at}
                        />
                      )}
                    </div>
                  }
                />
              </li>
            ))}
          </ul>
        )}
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

  /** Un recruteur et ses créateurs, dans sa zone. */
  const blocRecruteur = (bloc: BlocRecruteur) => {
    const r = bloc.recruteur;
    const badge = badgeManager(r.role);
    const equipe = r.role === "directing_manager" ? equipeDm.get(r.id) : undefined;
    // Un filtre de créateurs réduit la liste : dire combien sont affichés,
    // les compteurs restant ceux de toute l'équipe.
    const filtre = bloc.createurs.length !== bloc.compteursEquipe.total;
    return (
      <div key={r.id} className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <AvatarProfil nom={nomAffiche(r)} photoUrl={r.photo_url} />
          <button
            type="button"
            className="text-sm font-semibold tracking-tight underline-offset-2 hover:underline"
            onClick={() => ouvrirFiche(r.id)}
          >
            {nomAffiche(r)}
          </button>
          {badge && (
            <Badge variant="outline">
              {r.role === "head_of_ops" ? t("headOfOps.badge") : badge}
            </Badge>
          )}
          {!r.is_active && <Badge variant="secondary">{t("posters.disabled")}</Badge>}
          {drapeauxRecruteur(r)}
          <div className="w-48">
            <LangueRecruteurDropdown recruteur={r} />
          </div>
          <span className="flex flex-col text-[11px] tabular-nums text-muted-foreground sm:ml-auto sm:items-end">
            {equipe && (
              <span>
                {t("posters.equipeDmResume", {
                  hms: equipe.hms.length,
                  total: equipe.compteurs.total,
                  pasCree: equipe.compteurs.pasCree,
                  warmup: equipe.compteurs.warmup,
                  actif: equipe.compteurs.actif,
                })}
              </span>
            )}
            <span>
              {equipe && `${t("posters.createursDuDm")} · `}
              {t("posters.equipeHoResume", {
                total: bloc.compteursEquipe.total,
                pasCree: bloc.compteursEquipe.pasCree,
                warmup: bloc.compteursEquipe.warmup,
                actif: bloc.compteursEquipe.actif,
              })}
            </span>
            {filtre && (
              <span>{t("posters.nbAffiches", { n: bloc.createurs.length })}</span>
            )}
          </span>
        </div>
        {bloc.createurs.length === 0 && bloc.compteursEquipe.total > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("posters.aucunCreateurFiltre", { n: bloc.compteursEquipe.total })}
          </p>
        ) : (
          grille(bloc.createurs, "createur")
        )}
      </div>
    );
  };

  /** Une zone : ses recruteurs, chacun avec ses créateurs. */
  const sectionZone = (groupe: GroupeZone) => (
    <section key={groupe.cle} className="space-y-4 rounded-xl border bg-card/40 p-4">
      <div className="flex flex-wrap items-baseline gap-2 border-b pb-2">
        <MapPin className="size-4 shrink-0 self-center text-primary" />
        <h2 className="text-base font-semibold">{groupe.zone ?? t("posters.sansZone")}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t("posters.zoneResume", {
            recruteurs: groupe.recruteurs.length,
            total: groupe.compteurs.total,
            pasCree: groupe.compteurs.pasCree,
            warmup: groupe.compteurs.warmup,
            actif: groupe.compteurs.actif,
          })}
        </span>
      </div>
      {groupe.zone === null && (
        <p className="text-xs text-muted-foreground">{t("posters.sansZoneAide")}</p>
      )}
      <div className="space-y-6">{groupe.recruteurs.map(blocRecruteur)}</div>
    </section>
  );

  const liste = (() => {
    if (posters.isPending) {
      return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
    }
    if (tous.length === 0) return <EmptyState title={t("posters.empty")} />;

    const zonesVisibles = groupesZone.filter(
      (g) => !filtreZoneEffectif || g.cle === filtreZoneEffectif,
    );
    // Les créateurs sans recruteur n'ont pas de zone : rangés avec « Sans zone ».
    const sansRecruteurVisible =
      parZone.sansRecruteur.length > 0 &&
      (!filtreZoneEffectif || filtreZoneEffectif === CLE_SANS_ZONE);
    // Recruteurs désactivés sans créateur : repliés à part, mais jamais hors
    // d'atteinte — filtrés par zone comme les autres (leur zone, ou « Sans zone »).
    const inactifsVisibles = filtreListe
      ? []
      : parZone.recruteursInactifs.filter(
          (r) => !filtreZoneEffectif || cleZone(r.zone_recrutement) === filtreZoneEffectif,
        );
    // Admins : mêmes règles qu'avant les zones (masqués par un filtre de phase,
    // de langue ou de label), et hors de toute zone.
    const adminsVisibles =
      filtrePhase === "tous" && !filtreListe && !filtreZoneEffectif && admins.length > 0;

    // Puces : une par zone, plus « Sans zone » qui compte aussi les créateurs
    // sans recruteur (le clic les montre). La zone filtrée garde sa puce même
    // vide, pour pouvoir la désélectionner.
    const puces: { cle: string; libelle: string; n: number }[] = parZone.zones.map((g) => ({
      cle: g.cle,
      libelle: g.zone ?? "",
      n: g.compteurs.total,
    }));
    const nSansZone = (parZone.sansZone?.compteurs.total ?? 0) + parZone.sansRecruteur.length;
    if (parZone.sansZone || parZone.sansRecruteur.length > 0) {
      puces.push({ cle: CLE_SANS_ZONE, libelle: t("posters.sansZone"), n: nSansZone });
    }
    if (filtreZoneEffectif && !puces.some((p) => p.cle === filtreZoneEffectif)) {
      puces.push({
        cle: filtreZoneEffectif,
        libelle:
          filtreZoneEffectif === CLE_SANS_ZONE
            ? t("posters.sansZone")
            : (zonesExistantes.find((z) => cleZone(z) === filtreZoneEffectif) ?? filtreZoneEffectif),
        n: 0,
      });
    }

    const rien =
      zonesVisibles.length === 0 && !sansRecruteurVisible && inactifsVisibles.length === 0;

    return (
      <div className="space-y-6">
        {zonesCarte.length > 0 && (
          <React.Suspense
            fallback={<div className="aspect-[2/1] w-full animate-pulse rounded-xl bg-muted/50" />}
          >
            <CarteZones
              zones={zonesCarte}
              selection={filtreZoneEffectif}
              survol={zoneSurvolee}
              onSurvol={setZoneSurvolee}
              onSelection={(cle) => setFiltreZone(filtreZoneEffectif === cle ? "" : cle)}
            />
          </React.Suspense>
        )}
        {(puces.length > 1 || filtreZoneEffectif) && (
          <div role="group" aria-label={t("posters.filtreZone")} className="flex flex-wrap gap-1.5">
            {puces.map((puce) => {
              const actif = filtreZoneEffectif === puce.cle;
              return (
                <button
                  key={puce.cle}
                  type="button"
                  aria-pressed={actif}
                  onClick={() => setFiltreZone(actif ? "" : puce.cle)}
                  onMouseEnter={() => setZoneSurvolee(puce.cle)}
                  onMouseLeave={() => setZoneSurvolee(null)}
                  onFocus={() => setZoneSurvolee(puce.cle)}
                  onBlur={() => setZoneSurvolee(null)}
                  className={
                    actif
                      ? "rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                      : "rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
                  }
                >
                  {puce.libelle}{" "}
                  <span className="ml-1 tabular-nums opacity-70">{puce.n}</span>
                </button>
              );
            })}
          </div>
        )}
        {rien && <EmptyState title={t("posters.aucunResultat")} />}
        {zonesVisibles.map(sectionZone)}
        {sansRecruteurVisible &&
          section(
            t("posters.sansRecruteur"),
            parZone.sansRecruteur.length,
            parZone.sansRecruteur,
            "createur",
            { cle: "sans-recruteur" },
          )}
        {inactifsVisibles.length > 0 && (
          <details className="space-y-3" open={Boolean(filtreZoneEffectif) || undefined}>
            <summary className="cursor-pointer text-sm font-semibold">
              {t("posters.recruteursDesactives", { n: inactifsVisibles.length })}
            </summary>
            <div className="pt-3">{grille(inactifsVisibles, "recruteur")}</div>
          </details>
        )}
        {adminsVisibles && section(t("nav.admin"), admins.length, admins, "createur")}
      </div>
    );
  })();

  const fiche = ficheId ? tous.find((p) => p.id === ficheId) : null;
  const ficheComptes = fiche ? (comptesParPoster.get(fiche.id) ?? []) : [];
  const ficheCompte = ficheComptes.find((c) => c.id === ficheCompteId);
  const ficheCreateurs =
    fiche && estRoleManager(fiche.role)
      ? tousCreateurs.filter((c) => c.manager_id === fiche.id)
      : [];
  const ficheHms = fiche?.role === "directing_manager" ? hmsDuDm(tous, fiche.id) : [];
  const ficheEquipeDm = fiche?.role === "directing_manager" ? equipeDm.get(fiche.id) : undefined;
  const fichePartBien =
    fiche && estRoleManager(fiche.role) ? partBienRecruteur(fiche.id) : null;
  const soiMeme = fiche?.id === user?.id;
  const ficheRecruteur =
    fiche?.role === "poster" && fiche.manager_id
      ? tous.find((p) => p.id === fiche.manager_id && estRoleManager(p.role))
      : undefined;
  // Changer le recruteur d'un créateur : admin et Head of Ops (RLS `is_admin`).
  const peutChangerRecruteur = role === "admin" || role === "head_of_ops";
  const recruteursPossibles = tous
    .filter((p) => estRoleManager(p.role) && (p.is_active || p.id === fiche?.manager_id))
    .sort((a, b) => nomAffiche(a).localeCompare(nomAffiche(b)));

  // Une requête en erreur ne doit pas se lire comme « ce créateur n'a aucun
  // compte » : sans ce bandeau, un 300/400 sur `comptes` affichait 0 compte
  // partout et ressemblait à une perte de données.
  const erreurChargement = comptes.error ?? posters.error;

  return (
    <div className="space-y-6">
      {erreurChargement && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <span>{t("posters.erreurChargement", { msg: messageErreur(erreurChargement) })}</span>
          {/* `refetchOnWindowFocus` est désactivé pour toute l'app : sans ce
              bouton, une requête tombée en erreur y reste jusqu'à un
              rechargement complet du navigateur, même en changeant de page. */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void comptes.refetch();
              void posters.refetch();
            }}
          >
            {t("posters.reessayer")}
          </Button>
        </div>
      )}
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
        <ModalFiche
          titre={nomAffiche(fiche)}
          large={fiche.role === "poster"}
          onClose={() => setFicheId(null)}
        >
          <p className="text-sm text-muted-foreground">{fiche.email}</p>

          {estRoleManager(fiche.role) && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <AvatarProfil nom={nomAffiche(fiche)} photoUrl={fiche.photo_url} className="size-10" />
                {badgeManager(fiche.role) && (
                  <Badge variant="outline">{badgeManager(fiche.role)}</Badge>
                )}
                {!fiche.is_active && <Badge variant="secondary">{t("posters.disabled")}</Badge>}
                {fichePartBien != null && (
                  <Badge variant="secondary" title={t("posters.partBienAide")}>
                    {t("posters.partBien", { pct: Math.round(fichePartBien * 100) })}
                  </Badge>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t("posters.languesRecruteur")}
                </Label>
                <LangueRecruteurDropdown recruteur={fiche} />
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor={`fiche-${fiche.id}-zone`}
                  className="text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  {t("posters.zone")}
                </Label>
                <EditeurZoneRecruteur
                  key={fiche.id}
                  recruteur={fiche}
                  zones={zonesExistantes}
                  idPrefixe={`fiche-${fiche.id}`}
                />
              </div>

              {fiche.role === "directing_manager" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t("posters.hmsDuDm")}
                    </Label>
                    {ficheEquipeDm && (
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {t("posters.equipeDmResume", {
                          hms: ficheEquipeDm.hms.length,
                          total: ficheEquipeDm.compteurs.total,
                          pasCree: ficheEquipeDm.compteurs.pasCree,
                          warmup: ficheEquipeDm.compteurs.warmup,
                          actif: ficheEquipeDm.compteurs.actif,
                        })}
                      </p>
                    )}
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
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t("posters.createursDuDm")}
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
                            {c.classement && (
                              <BadgeClassement classement={c.classement} size="sm" />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
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
                          {c.classement && (
                            <BadgeClassement classement={c.classement} size="sm" />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {!soiMeme && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
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
                {!fiche.is_active && <Badge variant="secondary">{t("posters.disabled")}</Badge>}
              </div>

              <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                <span>{t("posters.recruteur")} :</span>
                {ficheRecruteur ? (
                  <button
                    type="button"
                    className="text-foreground underline underline-offset-2"
                    onClick={() => ouvrirFiche(ficheRecruteur.id)}
                  >
                    {nomAffiche(ficheRecruteur)}
                  </button>
                ) : (
                  <span>{t("posters.sansRecruteur")}</span>
                )}
                <span aria-hidden>·</span>
                <MapPin className="size-3" />
                <span>{zoneDuCreateur(fiche, tous, zonesCohorteRuul) ?? t("posters.sansZone")}</span>
              </p>
              {fiche.role === "poster" && peutChangerRecruteur && (
                <ChoixRecruteur poster={fiche} recruteurs={recruteursPossibles} />
              )}

              <CreateurUpwork
                poster={fiche}
                onSave={(url) => enregistrerUpwork.mutate({ id: fiche.id, url })}
              />

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("posters.ficheComptes")}
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    {t("posters.nbComptes", { n: ficheComptes.length })}
                  </span>
                </div>

                {ficheComptes.length === 0 ? (
                  <div className="space-y-3 rounded-md border border-dashed p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">{t("posters.aucunCompte")}</p>
                      <Button
                        size="sm"
                        disabled={creerCompteVide.isPending || choixAppsPremier.bloque}
                        onClick={() => {
                          if (!choixAppsPremier.verifier()) return;
                          creerCompteVide.mutate(fiche);
                        }}
                      >
                        {creerCompteVide.isPending ? t("common.saving") : t("posters.creerCompte")}
                      </Button>
                    </div>
                    <ChoixApplicationsCreation
                      etat={choixAppsPremier}
                      idPrefixe={`premier-apps-${fiche.id}`}
                    />
                    {creerCompteVide.isError && cleErreurChoixCompte(creerCompteVide.error) && (
                      <p className="text-xs text-destructive">
                        {t(cleErreurChoixCompte(creerCompteVide.error)!)}
                      </p>
                    )}
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {ficheComptes.map((c) => {
                      const ouvert = ficheCompte?.id === c.id;
                      const labs = labelsComptes.data?.get(c.id) ?? [];
                      return (
                        <li
                          key={c.id}
                          className={
                            ouvert
                              ? "space-y-3 rounded-lg border border-primary/40 bg-muted/20 p-3"
                              : "space-y-2 rounded-lg border p-3"
                          }
                        >
                          <div
                            className="cursor-pointer"
                            onClick={() => setFicheCompteId(ouvert ? null : c.id)}
                          >
                            <EnteteCompte
                              compte={c}
                              applications={applicationsCompte(c)}
                              extra={
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                  {!c.is_active && <BadgeDormant />}
                                  <BadgeClassement classement={c.classement} />
                                  {c.is_active && !estCompteCm(c) && (
                                    <span onClick={(e) => e.stopPropagation()}>
                                      <WarmupBadge
                                        compteId={c.id}
                                        startedAt={c.warmup_started_at}
                                        endsAt={c.warmup_ends_at}
                                        showStart={ouvert}
                                        startPending={warmupStart.isPending}
                                        onStart={() => warmupStart.mutate(c.id)}
                                        showSkip={ouvert}
                                        skipPending={warmupSkip.isPending}
                                        onSkip={() => warmupSkip.mutate(c.id)}
                                      />
                                    </span>
                                  )}
                                </div>
                              }
                            />
                          </div>
                          {ouvert && (
                            <div className="space-y-3 border-t pt-3">
                              {!estCompteCm(c) && (
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <LangueCompteSelect compte={c} />
                                  <PaysCompteSelect compte={c} />
                                  <LabelsCompteSelect compteId={c.id} actifs={labs} />
                                  <div className="sm:col-span-2">
                                    <PostsParJourCompte compte={c} />
                                  </div>
                                  {/* Un compte UGC AI VIDEO n'a pas de label : rien à répartir. */}
                                  {!c.ugc_ai_video && (
                                    <div className="sm:col-span-2">
                                      <PartsApplicationsCompte compte={c} labels={labs} />
                                    </div>
                                  )}
                                </div>
                              )}
                              <CompteEditor compte={c} />
                              <DeplacerCompte
                                compte={c}
                                source={fiche}
                                createurs={tousCreateurs}
                                queryKeys={[["posters"], ["comptes"]]}
                              />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                <FormulaireAjouterCompte
                  posterId={fiche.id}
                  languesProposees={langues.data ?? []}
                  choixApplications={peutChoisirApps}
                />
              </div>

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
