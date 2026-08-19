import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Gift } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYS_OS, drapeauLangue } from "@/features/moteur/langues";
import { creerReferral, listerMesReferrals } from "@/features/referral/api";
import {
  BONUS_PAR_RECRUE_USD,
  POSTS_POUR_BONUS,
  bonusPotentielUsd,
  validerReferral,
  type ReferralPayload,
  type StatutReferral,
} from "@/features/referral/referral";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const formulaireVide: ReferralPayload = {
  prenom: "",
  nom: "",
  pays: "fr",
  contact_upwork: "",
  contact_email: "",
  contact_telephone: "",
  confirme_present: false,
  confirme_fiable: false,
  confirme_majeur: false,
};

function badgeStatut(statut: StatutReferral): "warning" | "success" | "destructive" {
  if (statut === "accepte") return "success";
  if (statut === "refuse") return "destructive";
  return "warning";
}

export function PosterReferralPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<ReferralPayload>(formulaireVide);
  const [erreur, setErreur] = React.useState<string | null>(null);

  const liste = useQuery({ queryKey: ["mes-referrals"], queryFn: listerMesReferrals });

  const envoyer = useMutation({
    mutationFn: () => creerReferral(form),
    onSuccess: () => {
      setForm(formulaireVide);
      setErreur(null);
      queryClient.invalidateQueries({ queryKey: ["mes-referrals"] });
    },
    onError: (e: Error) => {
      setErreur(e.message.startsWith("referral.") ? e.message : "referral.err.envoi");
    },
  });

  const setChamp = <K extends keyof ReferralPayload>(cle: K, valeur: ReferralPayload[K]) => {
    setForm((actuel) => ({ ...actuel, [cle]: valeur }));
    setErreur(null);
    if (envoyer.isSuccess) envoyer.reset();
  };

  const soumettre = (e: React.FormEvent) => {
    e.preventDefault();
    const cle = validerReferral(form);
    if (cle) {
      setErreur(cle);
      return;
    }
    envoyer.mutate();
  };

  const acceptees = (liste.data ?? []).filter((r) => r.statut === "accepte").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("referral.title")}</CardTitle>
          <CardDescription>{t("referral.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-semibold">{t("referral.bonusTitre")}</p>
            <p className="mt-1 text-sm">
              {t("referral.bonusCorps", {
                posts: POSTS_POUR_BONUS,
                bonus: BONUS_PAR_RECRUE_USD,
                dizaine: bonusPotentielUsd(10),
              })}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">{t("referral.conditionsTitre")}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>{t("referral.condPresent")}</li>
              <li>{t("referral.condFiable")}</li>
              <li>{t("referral.condContact")}</li>
              <li>{t("referral.condMajeur")}</li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">{t("referral.paysTitre")}</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {PAYS_OS.map((code) => (
                <li key={code} className="text-sm text-muted-foreground">
                  {drapeauLangue(code)} {t(`referral.pays.${code}`)}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("referral.formTitre")}</CardTitle>
          <CardDescription>{t("referral.formSous")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={soumettre}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ref-prenom">{t("referral.prenom")}</Label>
                <Input
                  id="ref-prenom"
                  value={form.prenom}
                  onChange={(e) => setChamp("prenom", e.target.value)}
                  autoComplete="given-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ref-nom">{t("referral.nom")}</Label>
                <Input
                  id="ref-nom"
                  value={form.nom ?? ""}
                  onChange={(e) => setChamp("nom", e.target.value)}
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ref-pays">{t("referral.paysLabel")}</Label>
              <select
                id="ref-pays"
                className={selectClass}
                value={form.pays}
                onChange={(e) => setChamp("pays", e.target.value)}
              >
                {PAYS_OS.map((code) => (
                  <option key={code} value={code}>
                    {drapeauLangue(code)} {t(`referral.pays.${code}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ref-email">{t("referral.email")}</Label>
              <Input
                id="ref-email"
                type="email"
                required
                value={form.contact_email ?? ""}
                onChange={(e) => setChamp("contact_email", e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ref-upwork">{t("referral.upwork")}</Label>
                <Input
                  id="ref-upwork"
                  value={form.contact_upwork ?? ""}
                  onChange={(e) => setChamp("contact_upwork", e.target.value)}
                  placeholder="https://www.upwork.com/freelancers/…"
                  inputMode="url"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ref-tel">{t("referral.telephone")}</Label>
                <Input
                  id="ref-tel"
                  type="tel"
                  value={form.contact_telephone ?? ""}
                  onChange={(e) => setChamp("contact_telephone", e.target.value)}
                  autoComplete="tel"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("referral.contactAide")}</p>

            <div className="space-y-2 rounded-md border p-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={form.confirme_present}
                  onChange={(e) => setChamp("confirme_present", e.target.checked)}
                />
                <span>{t("referral.checkPresent")}</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={form.confirme_fiable}
                  onChange={(e) => setChamp("confirme_fiable", e.target.checked)}
                />
                <span>{t("referral.checkFiable")}</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={form.confirme_majeur}
                  onChange={(e) => setChamp("confirme_majeur", e.target.checked)}
                />
                <span>{t("referral.checkMajeur")}</span>
              </label>
            </div>

            {erreur && <p className="text-sm text-destructive">{t(erreur)}</p>}
            {envoyer.isSuccess && (
              <p className="text-sm text-success">{t("referral.envoye")}</p>
            )}

            <Button type="submit" disabled={envoyer.isPending}>
              {envoyer.isPending ? t("common.saving") : t("referral.envoyer")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("referral.mesTitre")}</CardTitle>
          <CardDescription>
            {t("referral.mesSous", {
              n: acceptees,
              bonus: bonusPotentielUsd(acceptees),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {liste.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (liste.data ?? []).length === 0 ? (
            <EmptyState icon={<Gift className="size-5" />} title={t("referral.mesVide")} />
          ) : (
            <ul className="space-y-3">
              {(liste.data ?? []).map((r) => (
                <li key={r.id} className="space-y-1 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {[r.prenom, r.nom].filter(Boolean).join(" ")}
                    </span>
                    <Badge variant={badgeStatut(r.statut)}>{t(`referral.statut.${r.statut}`)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {drapeauLangue(r.pays)} {t(`referral.pays.${r.pays}`)} ·{" "}
                    {new Date(r.created_at).toLocaleDateString(i18n.language)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
