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
import { CompteEditor } from "@/features/moteur/CompteEditor";
import { CreateurPublications } from "@/features/moteur/CreateurPublications";
import { LabelEditor } from "@/features/moteur/LabelPicker";
import {
  creerCompte,
  creerPoster,
  creerRecruteur,
  definirRole,
  labelsDesComptes,
  listerComptes,
  listerLanguesReference,
  listerPosters,
  majCoutMensuel,
  majLanguesRecruteur,
  majPoster,
  majUpwork,
  setLabelsCompte,
  labelsDuCompte,
  supprimerPoster,
} from "@/features/moteur/api";
import { nomLangue } from "@/features/moteur/langues";
import type { CompteAvecDetails, PosterProfil } from "@/features/moteur/types";

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

export function AdminPostersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const posters = useQuery({ queryKey: ["posters"], queryFn: listerPosters });
  const comptes = useQuery({ queryKey: ["comptes"], queryFn: listerComptes });
  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });
  const labelsComptes = useQuery({
    queryKey: ["compte-labels-all", (comptes.data ?? []).map((c) => c.id).join(",")],
    queryFn: () => labelsDesComptes((comptes.data ?? []).map((c) => c.id)),
    enabled: (comptes.data?.length ?? 0) > 0,
  });

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
  const creerCompteVide = useMutation({
    mutationFn: (p: PosterProfil) =>
      creerCompte({
        posterId: p.id,
        compteReferenceId: null,
        langue: p.langues[0] ?? "fr",
        personaNom: "",
        handleTiktok: "",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comptes"] }),
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
    },
  });
  // Création directe d'un recruteur (hiring manager) par son nom.
  const [recPrenom, setRecPrenom] = React.useState("");
  const [recNom, setRecNom] = React.useState("");
  const [recLangue, setRecLangue] = React.useState("");
  const [recCree, setRecCree] = React.useState<{ email: string } | null>(null);
  const creerRec = useMutation({
    mutationFn: () => creerRecruteur({ prenom: recPrenom, nom: recNom, langue: recLangue || undefined }),
    onSuccess: (r) => {
      setRecCree({ email: r.email });
      setRecPrenom("");
      setRecNom("");
      rafraichir();
    },
  });

  const [promoId, setPromoId] = React.useState<string | null>(null);
  const [promoLangue, setPromoLangue] = React.useState("");
  const changerRole = useMutation({
    mutationFn: (input: { id: string; role: "poster" | "hiring_manager"; nationalite?: string }) =>
      definirRole(input.id, input.role, input.nationalite),
    onSuccess: () => {
      setPromoId(null);
      rafraichir();
    },
  });
  const basculer = useMutation({
    mutationFn: (input: { id: string; actif: boolean }) =>
      majPoster(input.id, { is_active: input.actif }),
    onSuccess: rafraichir,
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
                  {(creer.error as Error).message === "NO_FREE_REFERENCE"
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
            <div className="space-y-2">
              <Label htmlFor="recLangue">{t("hiring.langue")}</Label>
              <select
                id="recLangue"
                className={selectClass}
                value={recLangue}
                onChange={(e) => setRecLangue(e.target.value)}
              >
                <option value="">{t("common.none")}</option>
                {langues.data?.map((l) => (
                  <option key={l} value={l}>
                    {nomLangue(l)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={creerRec.isPending || !recPrenom.trim()}>
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

  const liste = (() => {
        const tous = posters.data ?? [];
        const nomDe = (p: (typeof tous)[number]) =>
          [p.prenom, p.nom].filter(Boolean).join(" ") || p.email || "—";
        const recruteurs = tous.filter((p) => p.role === "hiring_manager");
        const creators = tous.filter((p) => p.role === "poster");
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
            <article key={poster.id} className="overflow-hidden rounded-lg border bg-card">
              <div className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1 space-y-1">
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
                    {!poster.is_active && (
                      <Badge variant="secondary">{t("posters.disabled")}</Badge>
                    )}
                    {estPoster && compte && labs.length === 0 && (
                      <Badge variant="warning">{t("posters.sansLabels")}</Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                    <span className="truncate">{poster.email}</span>
                    {estPoster && (
                      <>
                        <span aria-hidden className="text-border">
                          ·
                        </span>
                        <CreateurLiens
                          poster={poster}
                          onSave={(url) =>
                            enregistrerUpwork.mutate({ id: poster.id, url })
                          }
                        />
                      </>
                    )}
                    {poster.role !== "admin" && (
                      <>
                        <span aria-hidden className="text-border">
                          ·
                        </span>
                        <CoutMensuel poster={poster} />
                      </>
                    )}
                  </div>

                  {poster.role === "hiring_manager" && <LangueRecruteur recruteur={poster} />}
                </div>

                {!soiMeme && (
                  <div className="flex flex-wrap justify-end gap-1.5">
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
                          setPromoLangue(langues.data?.[0] ?? "");
                        }}
                      >
                        {t("hiring.promote")}
                      </Button>
                    )}
                    {poster.role === "poster" && promoId === poster.id && (
                      <div className="flex items-center gap-1">
                        <select
                          aria-label={t("hiring.langue")}
                          className={`${selectClass} h-8 w-24`}
                          value={promoLangue}
                          onChange={(e) => setPromoLangue(e.target.value)}
                        >
                          {langues.data?.map((l) => (
                            <option key={l} value={l}>
                              {nomLangue(l)}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          disabled={changerRole.isPending || !promoLangue}
                          onClick={() =>
                            changerRole.mutate({
                              id: poster.id,
                              role: "hiring_manager",
                              nationalite: promoLangue,
                            })
                          }
                        >
                          {t("hiring.valider")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setPromoId(null)}>
                          {t("common.cancel")}
                        </Button>
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

              {estPoster && compte && (
                <div className="flex items-start gap-3 border-t border-dashed bg-muted/25 px-3 py-2">
                  <span className="w-14 shrink-0 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("labels.title")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <LabelEditor
                      afficherTitre={false}
                      queryKey={["compte-labels", compte.id]}
                      load={() => labelsDuCompte(compte.id)}
                      save={async (ids) => {
                        await setLabelsCompte(compte.id, ids);
                        await queryClient.invalidateQueries({
                          queryKey: ["compte-labels-all"],
                        });
                      }}
                    />
                  </div>
                </div>
              )}

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
            <div className="space-y-2">
              {membres.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("posters.aucunCreateur")}</p>
              ) : (
                membres.map(ligne)
              )}
            </div>
          </section>
        );

        return (
          <div className="space-y-8">
            {recruteurs.length > 0 &&
              section(t("posters.recruteurs"), recruteurs.length, recruteurs, {
                badge: t("hiring.badge"),
              })}
            {recruteurs.map((rec) =>
              section(
                nomDe(rec),
                (parManager.get(rec.id) ?? []).length,
                parManager.get(rec.id) ?? [],
                { sousTitre: t("posters.createursDuRecruteur") },
              ),
            )}
            {(parManager.get("__none__") ?? []).length > 0 &&
              section(
                t("posters.sansRecruteur"),
                (parManager.get("__none__") ?? []).length,
                parManager.get("__none__") ?? [],
              )}
            {admins.length > 0 && section(t("nav.admin"), admins.length, admins)}
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

      {liste}
    </div>
  );
}
