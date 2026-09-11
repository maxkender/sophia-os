import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ajouterCompte,
  envoyerContratPapier,
  lireIdentifiantsCm,
  majIdentifiantsCm,
} from "@/features/moteur/api";
import { ApercuIdentitePapier } from "@/features/moteur/ApercuIdentitePapier";
import { languesDisponiblesPourCm, languesPourNouveauCompte } from "@/features/moteur/comptesCm";
import { identifiantsCmDepuisLangue } from "@/features/moteur/papierCmCompte";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication, type ApplicationOs } from "@/features/moteur/applications";
import { nomLangue } from "@/features/moteur/langues";
import type { TypeCompte } from "@/features/moteur/types";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function FormulaireAjouterCompte({
  posterId,
  languesProposees,
  languesPrisesCm,
  applications,
  onCree,
}: {
  posterId: string;
  languesProposees: string[];
  languesPrisesCm: string[];
  applications?: ApplicationOs[];
  onCree?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const libresCm = languesDisponiblesPourCm(languesProposees, languesPrisesCm);
  const [ouvert, setOuvert] = React.useState(false);
  const [typeCompte, setTypeCompte] = React.useState<TypeCompte>("perso");
  const languesType = languesPourNouveauCompte(typeCompte, languesProposees, languesPrisesCm);
  const [langue, setLangue] = React.useState(languesType[0] ?? "");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [deuxFa, setDeuxFa] = React.useState("");
  const [handle, setHandle] = React.useState("");
  const [postsParJour, setPostsParJour] = React.useState<1 | 2 | 3>(2);
  const { slug: slugContexte } = useApplication();
  const [applicationSlug, setApplicationSlug] = React.useState(
    slugContexte || applications?.[0]?.slug || "sophia",
  );

  React.useEffect(() => {
    if (slugContexte && (!applications?.length || applications.some((a) => a.slug === slugContexte))) {
      setApplicationSlug(slugContexte);
      return;
    }
    if (!applications?.length) return;
    if (applicationSlug && applications.some((a) => a.slug === applicationSlug)) return;
    setApplicationSlug(applications[0]!.slug);
  }, [applications, applicationSlug, slugContexte]);

  React.useEffect(() => {
    if (langue && languesType.includes(langue)) return;
    setLangue(languesType[0] ?? "");
  }, [languesType, langue]);

  const creer = useMutation({
    mutationFn: async () => {
      const cm = typeCompte === "cm" ? identifiantsCmDepuisLangue(langue) : null;
      const r = await ajouterCompte({
        posterId,
        type_compte: typeCompte,
        langue,
        application_slug: applicationSlug,
        posts_par_jour: typeCompte === "perso" ? postsParJour : 1,
        handle_tiktok: cm?.handle_tiktok ?? handle,
        tiktok_email: cm?.tiktok_email ?? email,
        tiktok_password: cm?.tiktok_password ?? password,
        tiktok_2fa_note: deuxFa,
      });
      if (typeCompte === "cm") {
        try {
          await envoyerContratPapier({
            posterId,
            langue,
            compteId: r.compteId ?? r.compte?.id,
          });
        } catch (e) {
          if (!(e instanceof Error && e.message === "CONTRAT_DEJA_ENVOYE")) throw e;
        }
      }
      return r;
    },
    onSuccess: () => {
      setEmail("");
      setPassword("");
      setDeuxFa("");
      setHandle("");
      setPostsParJour(2);
      setOuvert(false);
      void queryClient.invalidateQueries({ queryKey: ["comptes"] });
      void queryClient.invalidateQueries({ queryKey: ["posters"] });
      void queryClient.invalidateQueries({ queryKey: ["papier-cm-contrats"] });
      onCree?.();
    },
  });

  if (!ouvert) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOuvert(true)}>
        {t("cm.ajouterCompte")}
      </Button>
    );
  }

  const cmBloque = typeCompte === "cm" && libresCm.length === 0;

  return (
    <form
      className="space-y-3 rounded-md border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (cmBloque) return;
        creer.mutate();
      }}
    >
      <p className="text-sm font-medium">{t("cm.ajouterCompte")}</p>
      <p className="text-xs text-muted-foreground">{t("cm.ajouterCompteAide")}</p>
      <div className="inline-flex rounded-md border p-0.5">
        {(["perso", "cm"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setTypeCompte(type)}
            className={
              typeCompte === type
                ? "rounded px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground"
                : "rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            }
          >
            {type === "cm" ? t("cm.badge") : t("cm.perso")}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {typeCompte === "cm" ? t("cm.ajouterAide") : t("cm.ajouterPersoAide")}
      </p>
      {cmBloque ? (
        <p className="text-xs text-muted-foreground">{t("cm.toutesLanguesPrises")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(applications ?? []).length > 0 && (
            <div className="space-y-1">
              <Label htmlFor={`compte-app-${posterId}`}>{t("applications.compte")}</Label>
              <select
                id={`compte-app-${posterId}`}
                className={selectClass}
                value={applicationSlug}
                onChange={(e) => setApplicationSlug(e.target.value)}
                required
              >
                {(applications ?? []).map((app) => (
                  <option key={app.id} value={app.slug}>
                    {nomApplication(app)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor={`compte-langue-${posterId}`}>{t("cm.langueCompte")}</Label>
            <select
              id={`compte-langue-${posterId}`}
              className={selectClass}
              value={langue}
              onChange={(e) => setLangue(e.target.value)}
              required
            >
              {languesType.map((l) => (
                <option key={l} value={l}>
                  {nomLangue(l)}
                </option>
              ))}
            </select>
          </div>
          {typeCompte === "perso" && (
            <div className="space-y-1">
              <Label htmlFor={`compte-handle-${posterId}`}>{t("comptes.pseudo")}</Label>
              <Input
                id={`compte-handle-${posterId}`}
                value={handle}
                placeholder={t("comptes.pseudoPlaceholder")}
                onChange={(e) => setHandle(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("comptes.pseudoFacultatif")}</p>
            </div>
          )}
          {typeCompte === "perso" && (
            <div className="space-y-1 sm:col-span-2">
              <Label>{t("hiring.postsParJour")}</Label>
              <div className="inline-flex rounded-md border p-0.5">
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPostsParJour(n)}
                    className={
                      postsParJour === n
                        ? "rounded px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground"
                        : "rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
          {typeCompte === "cm" && <ApercuIdentitePapier langue={langue} />}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={creer.isPending || !langue || cmBloque}>
          {creer.isPending ? t("common.saving") : t("cm.creerCompte")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>
          {t("common.cancel")}
        </Button>
      </div>
      {creer.isError && (
        <p className="text-xs text-destructive">
          {(creer.error as Error).message === "CM_LANGUE_PRISE"
            ? t("cm.languePrise")
            : (creer.error as Error).message}
        </p>
      )}
    </form>
  );
}

/** @deprecated préfère FormulaireAjouterCompte */
export function FormulaireCompteCm(props: {
  posterId: string;
  languesProposees: string[];
  languesPrises: string[];
  onCree?: () => void;
}) {
  return (
    <FormulaireAjouterCompte
      posterId={props.posterId}
      languesProposees={props.languesProposees}
      languesPrisesCm={props.languesPrises}
      onCree={props.onCree}
    />
  );
}

export function IdentifiantsCm({
  compteId,
  editable,
}: {
  compteId: string;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["identifiants-cm", compteId],
    queryFn: () => lireIdentifiantsCm(compteId),
  });
  const [edit, setEdit] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [deuxFa, setDeuxFa] = React.useState("");

  const copier = (texte: string) => void navigator.clipboard?.writeText(texte);

  const maj = useMutation({
    mutationFn: () =>
      majIdentifiantsCm({
        compteId,
        tiktok_email: email,
        tiktok_password: password,
        tiktok_2fa_note: deuxFa,
      }),
    onSuccess: () => {
      setEdit(false);
      void queryClient.invalidateQueries({ queryKey: ["identifiants-cm", compteId] });
    },
  });

  if (q.isPending) {
    return <p className="text-xs text-muted-foreground">{t("common.loading")}</p>;
  }
  if (!q.data) {
    return <p className="text-xs text-destructive">{t("cm.identifiantsAbsents")}</p>;
  }

  if (edit && editable) {
    return (
      <form
        className="space-y-2 rounded-md border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          maj.mutate();
        }}
      >
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {t("cm.identifiants")}
        </Label>
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          type="text"
          required
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input value={deuxFa} onChange={(e) => setDeuxFa(e.target.value)} />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={maj.isPending}>
            {t("common.save")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEdit(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    );
  }

  const d = q.data;
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("papierContrat.gmail")}
        </p>
        {editable && (
          <button
            type="button"
            className="text-xs text-primary underline underline-offset-2"
            onClick={() => {
              setEmail(d.tiktok_email);
              setPassword(d.tiktok_password);
              setDeuxFa(d.tiktok_2fa_note ?? "");
              setEdit(true);
            }}
          >
            {t("common.edit")}
          </button>
        )}
      </div>
      <LigneSecret label={t("papierContrat.gmail")} valeur={d.tiktok_email} onCopy={() => copier(d.tiktok_email)} />
      <LigneSecret
        label={t("papierContrat.gmailMdp")}
        valeur={d.tiktok_password}
        onCopy={() => copier(d.tiktok_password)}
      />
      {d.tiktok_2fa_note && (
        <LigneSecret
          label={t("cm.deuxFa")}
          valeur={d.tiktok_2fa_note}
          onCopy={() => copier(d.tiktok_2fa_note!)}
        />
      )}
    </div>
  );
}

function LigneSecret({
  label,
  valeur,
  onCopy,
}: {
  label: string;
  valeur: string;
  onCopy: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <button
        type="button"
        className="min-w-0 truncate font-mono text-xs underline underline-offset-2"
        title={t("cm.copier")}
        onClick={onCopy}
      >
        {valeur}
      </button>
    </div>
  );
}
