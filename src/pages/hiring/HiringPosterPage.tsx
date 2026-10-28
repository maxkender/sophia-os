import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Pencil, Power, Trash2, UserPlus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarreChargement } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { compteActif, repartirArchive } from "@/features/archive/archive";
import { SectionArchive } from "@/features/archive/SectionArchive";
import { CarteCreerRecruteur } from "@/features/hiring/CarteCreerRecruteur";
import {
  activerPoster,
  contactCreationComplet,
  creerPoster,
  emailPersoValide,
  contratUpworkValide,
  listerComptesAvecDormants,
  listerLanguesReference,
  listerPosters,
  majCompte,
  majContactPosterHm,
  supprimerPoster,
} from "@/features/moteur/api";
import { MessageBienvenue } from "@/features/regles/MessageBienvenue";
import { paysAEnvoyer, paysRequis } from "@/features/moteur/paysCompte";
import { ChampsPremierCompte, type PremierCompte } from "@/features/moteur/ChampsPremierCompte";
import { ChampsContactPoster } from "@/features/moteur/ChampsContactPoster";
import { separerNomComplet } from "@/features/moteur/nomComplet";
import {
  CONTACT_POSTER_VIDE,
  valeursContactDe,
  type ValeursContactPoster,
} from "@/features/moteur/contactPoster";
import { langueInitiale } from "@/features/moteur/langues";
import { comptePrincipal, estCompteCm } from "@/features/moteur/comptesCm";
import { DeplacerCompte } from "@/features/moteur/DeplacerCompte";
import { FormulaireAjouterCompte } from "@/features/moteur/FormulaireAjouterCompte";
import { BoutonDelierSlack } from "@/features/slack/BoutonDelierSlack";
import { ChoixApplicationsCreation } from "@/features/moteur/repartition/ChoixApplicationsCreation";
import {
  cleErreurChoixCompte,
  peutChoisirApplicationsCompte,
} from "@/features/moteur/repartition/choixCreation";
import { useChoixApplicationsCreation } from "@/features/moteur/repartition/useChoixApplicationsCreation";
import { EnteteCompte } from "@/features/moteur/VignetteCompte";
import { WarmupBadge } from "@/features/moteur/WarmupBadge";
import type { PosterProfil } from "@/features/moteur/types";

/** Mot de passe commun à tous les posters (dicté de vive voix). */
const MOT_DE_PASSE = "12345678";

/**
 * Une ligne créateur côté HM : identité TikTok (avatar, @, nom, source, bio),
 * ÉDITABLE (nom, @, bio). Le HM a recruté ce créateur, il peut ajuster son
 * identité (RLS `comptes_update_hiring`). La source et les ratios restent côté
 * admin. L'affichage se met à jour dès qu'on enregistre (invalidation ["posters"]).
 */
/**
 * Prompt 15, point 7 : le lien du contrat Upwork, le profil et l'email perso
 * du posteur, modifiables par sa HM (poster_maj_contact, 0400).
 */
function ContactPosterHm({ poster }: { poster: PosterProfil }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [edit, setEdit] = React.useState(false);
  const [valeurs, setValeurs] = React.useState<ValeursContactPoster>(() => valeursContactDe(poster));
  const enregistrer = useMutation({
    mutationFn: () => majContactPosterHm(poster.id, valeurs),
    onSuccess: () => {
      setEdit(false);
      void queryClient.invalidateQueries({ queryKey: ["posters"] });
    },
  });
  if (edit) {
    return (
      <div className="mt-2 space-y-2 rounded-md border p-3" data-testid={`contact-hm-${poster.id}`}>
        <ChampsContactPoster valeurs={valeurs} onChange={setValeurs} idPrefixe={`hm-${poster.id}`} />
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7"
            disabled={enregistrer.isPending || !emailPersoValide(valeurs.email_perso) || !contratUpworkValide(valeurs.upwork_contrat_url)}
            onClick={() => enregistrer.mutate()}
          >
            {t("common.save")}
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setEdit(false)}>
            {t("common.cancel")}
          </Button>
        </div>
        {enregistrer.isError && <p className="text-xs text-destructive">{(enregistrer.error as Error).message}</p>}
      </div>
    );
  }
  const manque = !poster.upwork_contrat_url || !poster.email_perso;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs">
      {poster.upwork_contrat_url && (
        <a href={poster.upwork_contrat_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {t("posters.contact.lienContrat")}
        </a>
      )}
      {poster.email_perso && <span className="select-all text-muted-foreground">{poster.email_perso}</span>}
      {manque && <span className="font-medium text-destructive">{t("posters.contact.aCompleter")}</span>}
      <button
        type="button"
        onClick={() => {
          setValeurs(valeursContactDe(poster));
          setEdit(true);
        }}
        className="text-muted-foreground underline underline-offset-2"
      >
        {t("posters.upworkModifier")}
      </button>
    </div>
  );
}

function LignePoster({
  poster: p,
  createurs,
}: {
  poster: PosterProfil;
  createurs: PosterProfil[];
}) {
  const { t } = useTranslation();
  const { role, profil } = useAuth();
  const queryClient = useQueryClient();
  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });
  const comptes = p.comptes ?? [];
  const [compteId, setCompteId] = React.useState(
    () => comptePrincipal(comptes)?.id ?? p.compte_id ?? "",
  );
  const compteActif = comptes.find((c) => c.id === compteId) ?? comptePrincipal(comptes);
  const [edite, setEdite] = React.useState(false);
  const [nom, setNom] = React.useState(compteActif?.persona_nom ?? p.persona_nom ?? "");
  const [handle, setHandle] = React.useState(compteActif?.handle_tiktok ?? p.handle_tiktok ?? "");
  const [bio, setBio] = React.useState(compteActif?.persona_bio ?? p.persona_bio ?? "");

  React.useEffect(() => {
    if (compteId && comptes.some((c) => c.id === compteId)) return;
    setCompteId(comptePrincipal(comptes)?.id ?? p.compte_id ?? "");
  }, [comptes, compteId, p.compte_id]);

  React.useEffect(() => {
    setNom(compteActif?.persona_nom ?? "");
    setHandle(compteActif?.handle_tiktok ?? "");
    setBio(compteActif?.persona_bio ?? "");
    setEdite(false);
  }, [compteActif?.id, compteActif?.persona_nom, compteActif?.handle_tiktok, compteActif?.persona_bio]);

  const enregistrer = useMutation({
    mutationFn: () =>
      majCompte(compteActif!.id, {
        persona_nom: nom.trim() || null,
        handle_tiktok: handle.trim().replace(/^@/, "") || null,
        persona_bio: bio.trim() || null,
      }),
    onSuccess: () => {
      setEdite(false);
      queryClient.invalidateQueries({ queryKey: ["posters"] });
    },
  });
  // Désactiver et supprimer (historique compris) restent à l'admin et au Head
  // of Ops (v3 point 8 : une HM ne contrôle plus, le Kill se décide le samedi).
  const peutSupprimer = role === "admin" || role === "head_of_ops";
  const nomAffiche = [p.prenom, p.nom].filter(Boolean).join(" ") || p.email;
  const basculer = useMutation({
    mutationFn: () => activerPoster(p.id, !p.is_active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posters"] }),
  });
  const supprimer = useMutation({
    mutationFn: () => supprimerPoster(p.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posters"] }),
  });

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {[p.prenom, p.nom].filter(Boolean).join(" ") || p.email}
            </span>
            {!p.is_active && <Badge variant="secondary">{t("posters.disabled")}</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">{p.email}</p>
          <BoutonDelierSlack posterId={p.id} nom={nomAffiche ?? ""} />
          <ContactPosterHm poster={p} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            {t("posters.nbComptes", { n: comptes.length })}
          </span>
          {/* v3 point 8 : arrêter un posteur se décide le samedi (Kill), plus depuis l'espace HM. */}
          {peutSupprimer && (
            <button
              type="button"
              disabled={basculer.isPending}
              onClick={() => {
                if (!p.is_active || window.confirm(t("hiring.confirmDesactiver", { nom: nomAffiche })))
                  basculer.mutate();
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"
            >
              <Power className="size-3" />
              {p.is_active ? t("posters.disable") : t("posters.enable")}
            </button>
          )}
          {peutSupprimer && (
            <button
              type="button"
              disabled={supprimer.isPending}
              onClick={() => {
                if (window.confirm(t("hiring.confirmSuppr", { nom: nomAffiche }))) supprimer.mutate();
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-destructive"
            >
              <Trash2 className="size-3" />
              {t("common.delete")}
            </button>
          )}
        </div>
      </div>

      {comptes.length === 0 ? (
        <p className="rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
          {t("posters.aucunCompte")}
        </p>
      ) : (
        <ul className="space-y-2">
          {comptes.map((c) => {
            const ouvert = compteActif?.id === c.id;
            return (
              <li
                key={c.id}
                className={
                  ouvert
                    ? "space-y-2 rounded-md border border-primary/40 bg-muted/20 p-2.5"
                    : "space-y-2 rounded-md border p-2.5"
                }
              >
                <div className="cursor-pointer" onClick={() => setCompteId(c.id)}>
                  <EnteteCompte
                    compact
                    compte={c}
                    extra={
                      !estCompteCm(c) ? (
                        <div className="mt-1">
                          <WarmupBadge
                            compteId={c.id}
                            startedAt={c.warmup_started_at}
                            endsAt={c.warmup_ends_at}
                          />
                        </div>
                      ) : undefined
                    }
                  />
                </div>
                {ouvert && edite ? (
                  <div className="space-y-2 border-t pt-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`nom-${c.id}`} className="text-xs">
                          {t("comptes.nomAffiche")}
                        </Label>
                        <Input id={`nom-${c.id}`} value={nom} onChange={(e) => setNom(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`h-${c.id}`} className="text-xs">
                          {t("comptes.pseudo")}
                        </Label>
                        <Input id={`h-${c.id}`} value={handle} onChange={(e) => setHandle(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`bio-${c.id}`} className="text-xs">
                        {t("comptes.bioProposee")}
                      </Label>
                      <textarea
                        id={`bio-${c.id}`}
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={2}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
                        <Check className="size-4" />
                        {enregistrer.isPending ? t("common.saving") : t("common.save")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEdite(false)}>
                        <X className="size-4" />
                        {t("common.cancel")}
                      </Button>
                    </div>
                    {enregistrer.isError && (
                      <p className="text-xs text-destructive">{(enregistrer.error as Error).message}</p>
                    )}
                  </div>
                ) : ouvert ? (
                  <div className="space-y-2 border-t pt-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {c.persona_bio ||
                          (c.handle_tiktok ? "" : t("hiring.identiteEnCours"))}
                      </p>
                      <button
                        type="button"
                        onClick={() => setEdite(true)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                      >
                        <Pencil className="size-3" />
                        {t("common.edit")}
                      </button>
                    </div>
                    <DeplacerCompte compte={c} source={p} createurs={createurs} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Choix de l'application du compte du créateur, comme à la création.
          Retiré aux HMs (prompt 15, point 1) : l'admin et le Head of Ops ajoutent les comptes. */}
      {role !== "hiring_manager" && (
        <FormulaireAjouterCompte
          posterId={p.id}
          languesProposees={langues.data ?? []}
          choixApplications={peutChoisirApplicationsCompte(role) && !profil?.hm_ugc_ai_video}
        />
      )}
    </div>
  );
}

/**
 * Écran unique du hiring manager : créer un login créateur, puis le premier
 * compte TikTok (perso = identité générée, ou CM = identifiants existants).
 */
export function HiringPosterPage() {
  const { t } = useTranslation();
  const { role, profil } = useAuth();
  const queryClient = useQueryClient();

  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });
  const posters = useQuery({ queryKey: ["posters"], queryFn: listerPosters });
  const createurs = React.useMemo(
    () => (posters.data ?? []).filter((p) => p.role === "poster"),
    [posters.data],
  );
  // L'Archive (0366) : posteurs désactivés ou sans compte actif, et comptes
  // dormants, sous la liste, fermée par défaut. La RLS ne rend à une HM que
  // les comptes de ses posteurs.
  const comptesTous = useQuery({ queryKey: ["comptes", "avec-dormants"], queryFn: listerComptesAvecDormants });
  const { actifs: createursActifs, archive } = React.useMemo(
    () => repartirArchive(createurs, comptesTous.data),
    [createurs, comptesTous.data],
  );
  const lignesArchive = archive.map((e) => ({
    posteurId: e.posteur.id,
    nom: [e.posteur.prenom, e.posteur.nom].filter(Boolean).join(" ") || e.posteur.email || "",
    desactive: !e.posteur.is_active,
    comptes: e.comptes.map((c) => ({ id: c.id, handle: c.handle_tiktok, pays: c.pays, actif: compteActif(c) })),
  }));

  // Un seul champ « Full name » : premier mot = prénom, le reste = nom.
  const [nomComplet, setNomComplet] = React.useState("");
  const [contact, setContact] = React.useState<ValeursContactPoster>(CONTACT_POSTER_VIDE);
  const [langue, setLangue] = React.useState("");
  const [premierCompte, setPremierCompte] = React.useState<PremierCompte>("perso");
  const [paysCompte, setPaysCompte] = React.useState("");
  // Un pays choisi pour l'anglais n'a plus de sens une fois passé au suédois.
  React.useEffect(() => {
    setPaysCompte("");
  }, [langue]);
  const [handleTiktok, setHandleTiktok] = React.useState("");
  const [cree, setCree] = React.useState<{
    email: string;
    prenom: string;
    persona: boolean;
    type: PremierCompte;
  } | null>(null);
  // Application du premier compte : c'est le créateur qui est associé à une
  // application, son recruteur choisit pour lui (le label, lui, est tiré de la
  // File des créateurs de cette application). Seulement pour un compte perso
  // (un compte CM n'a pas de label), et pas pour un HM UGC AI vidéo (ses
  // créateurs suivent ses labels vidéo). Rien de coché d'avance : il faut
  // cliquer ; Sophia = corps d'avant.
  const choixApps = useChoixApplicationsCreation(
    peutChoisirApplicationsCompte(role) && !profil?.hm_ugc_ai_video && premierCompte === "perso",
    langue,
  );

  // Langues cibles : un créateur = une langue, choisie à l'embauche.
  // Toutes les langues OS sont proposées ; une langue nouvelle s'ajoute
  // automatiquement aux langues gérées du recruteur (côté API).
  const languesChoix = langues.data ?? [];

  React.useEffect(() => {
    if (!languesChoix.length) return;
    setLangue((actuel) => langueInitiale(languesChoix, actuel));
  }, [languesChoix]);

  const creer = useMutation({
    mutationFn: () =>
      creerPoster({
        ...separerNomComplet(nomComplet),
        password: MOT_DE_PASSE,
        contact,
        langue,
        type_compte: premierCompte,
        // Prompt 15, point 7 : toujours 2 posts par jour, plus de choix.
        posts_par_jour: premierCompte === "perso" ? 2 : undefined,
        handle_tiktok: premierCompte === "perso" ? handleTiktok : undefined,
        ...(paysAEnvoyer(langue, paysCompte)
          ? { pays: paysAEnvoyer(langue, paysCompte)! }
          : {}),
        ...choixApps.options,
      }),
    onSuccess: (r) => {
      setCree({
        email: r.email,
        prenom: separerNomComplet(nomComplet).prenom ?? "",
        persona: Boolean(r.compte?.persona),
        type: premierCompte,
      });
      setNomComplet("");
      setPaysCompte("");
      setContact(CONTACT_POSTER_VIDE);
      setHandleTiktok("");
      choixApps.reinitialiser();
      queryClient.invalidateQueries({ queryKey: ["posters"] });
    },
  });

  // Le DM a sa propre page « Suivi des HM » où la même carte vit à côté de son
  // équipe : l'afficher ici aussi lui donnerait deux formulaires identiques.
  // Créer un hiring manager : plus pour les HMs (prompt 15, point 1).
  const montrerCreerRecruteur = role === "head_of_ops";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-4" />
            {t("hiring.title")}
          </CardTitle>
          <CardDescription>
            {t("hiring.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // Application du compte non choisie : le bloc le dit, rien ne part.
              if (!choixApps.verifier()) return;
              // Prompt 15, point 7 : contrat Upwork et email perso obligatoires.
              if (!contactCreationComplet(contact)) return;
              setCree(null);
              creer.mutate();
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nom-complet">{t("posters.nomComplet")}</Label>
              <Input
                id="nom-complet"
                required
                value={nomComplet}
                placeholder={t("posters.nomCompletExemple")}
                onChange={(e) => setNomComplet(e.target.value)}
              />
            </div>
            <ChampsContactPoster valeurs={contact} onChange={setContact} idPrefixe="creation" obligatoires />
            <ChampsPremierCompte
              typeCompte={premierCompte}
              onType={setPremierCompte}
              langues={languesChoix}
              langue={langue}
              onLangue={setLangue}
              pays={paysCompte}
              onPays={setPaysCompte}
              handle={handleTiktok}
              onHandle={setHandleTiktok}
            />
            {choixApps.visible && (
              <div className="sm:col-span-2">
                <ChoixApplicationsCreation etat={choixApps} idPrefixe="embauche-apps" />
              </div>
            )}
            <div className="sm:col-span-2 space-y-3">
              <Button
                type="submit"
                disabled={
                  creer.isPending ||
                  !contactCreationComplet(contact) ||
                  !langue ||
                  (paysRequis(langue) && !paysCompte) ||
                  choixApps.bloque
                }
              >
                {creer.isPending ? t("hiring.enCours") : t("hiring.create")}
              </Button>
              {premierCompte === "perso" && (
                <BarreChargement
                  actif={creer.isPending}
                  dureeMs={13_000}
                  label={t("hiring.progressIdentite")}
                />
              )}
              {creer.isError && (
                <p className="mt-2 text-sm text-destructive">
                  {(creer.error as Error).message === "NO_FREE_REFERENCE"
                    ? t("posters.creationRefusee")
                    : (creer.error as Error).message === "NO_LABELS"
                      ? t("warmup.aucunLabel")
                      : (creer.error as Error).message === "NO_UGC_PERSONA"
                        ? t("warmup.plusDePersonaUgc")
                        : (creer.error as Error).message === "NO_UGC_LABEL"
                          ? t("warmup.labelUgcIntrouvable")
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
                <code className="rounded bg-muted px-1">{MOT_DE_PASSE}</code>
              </p>
              {cree.type === "cm" ? (
                <p className="pt-1 text-xs text-muted-foreground">{t("posters.creeCm")}</p>
              ) : (
                <>
                  <p className="pt-1 text-xs text-muted-foreground">
                    {cree.persona ? t("hiring.personaOk") : t("hiring.personaPlusTard")}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("warmup.apresCreation")}</p>
                </>
              )}
              <MessageBienvenue prenom={cree.prenom} email={cree.email} password={MOT_DE_PASSE} />
            </div>
          )}
        </CardContent>
      </Card>

      {montrerCreerRecruteur && <CarteCreerRecruteur prefixeId="hmHm" />}

      <Card>
        <CardContent className="space-y-2 pt-5">
          {posters.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {createursActifs.length === 0 && !posters.isPending && (
            <EmptyState title={t("posters.empty")} />
          )}
          {createursActifs.map((p) => (
            <LignePoster key={p.id} poster={p} createurs={createurs} />
          ))}
          <SectionArchive lignes={lignesArchive} peutReactiver={role !== "hiring_manager"} />
        </CardContent>
      </Card>
    </div>
  );
}
