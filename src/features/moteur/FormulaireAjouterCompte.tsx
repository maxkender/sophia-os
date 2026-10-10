import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ajouterCompte,
  lireIdentifiantsCm,
  majIdentifiantsCm,
} from "@/features/moteur/api";
import { nomLangue } from "@/features/moteur/langues";
import { ChoixApplicationsCreation } from "@/features/moteur/repartition/ChoixApplicationsCreation";
import { cleErreurChoixCompte } from "@/features/moteur/repartition/choixCreation";
import { useChoixApplicationsCreation } from "@/features/moteur/repartition/useChoixApplicationsCreation";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function FormulaireAjouterCompte({
  posterId,
  languesProposees,
  onCree,
  choixApplications = false,
}: {
  posterId: string;
  languesProposees: string[];
  onCree?: () => void;
  /**
   * Choix du label et de la répartition du compte (deux niveaux), pour les
   * rôles qui recrutent. Faux (défaut) : mêmes champs, mêmes lectures et même
   * requête qu'avant.
   */
  choixApplications?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const languesType = languesProposees;
  const [langue, setLangue] = React.useState(languesType[0] ?? "");
  const [handle, setHandle] = React.useState("");
  const [postsParJour, setPostsParJour] = React.useState<1 | 2 | 3>(2);
  React.useEffect(() => {
    if (langue && languesType.includes(langue)) return;
    setLangue(languesType[0] ?? "");
  }, [languesType, langue]);
  // Lectures (applications, labels) seulement formulaire ouvert et choix permis.
  const choixApps = useChoixApplicationsCreation(choixApplications && ouvert, langue);

  const creer = useMutation({
    mutationFn: () =>
      ajouterCompte({
        posterId,
        type_compte: "perso",
        langue,
        posts_par_jour: postsParJour,
        handle_tiktok: handle,
        ...choixApps.options,
      }),
    onSuccess: () => {
      setHandle("");
      setPostsParJour(2);
      choixApps.reinitialiser();
      setOuvert(false);
      void queryClient.invalidateQueries({ queryKey: ["comptes"] });
      void queryClient.invalidateQueries({ queryKey: ["posters"] });
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

  return (
    <form
      className="space-y-3 rounded-md border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        creer.mutate();
      }}
    >
      <p className="text-sm font-medium">{t("cm.ajouterCompte")}</p>
      <p className="text-xs text-muted-foreground">{t("cm.ajouterCompteAide")}</p>
      <p className="text-xs text-muted-foreground">{t("cm.ajouterPersoAide")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
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
        <ChoixApplicationsCreation etat={choixApps} idPrefixe={`compte-apps-${posterId}`} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={creer.isPending || !langue || choixApps.bloque}
        >
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
            : cleErreurChoixCompte(creer.error)
              ? t(cleErreurChoixCompte(creer.error)!)
              : (creer.error as Error).message}
        </p>
      )}
    </form>
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
          {t("cm.identifiants")}
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
      <LigneSecret label={t("cm.email")} valeur={d.tiktok_email} onCopy={() => copier(d.tiktok_email)} />
      <LigneSecret
        label={t("cm.password")}
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
