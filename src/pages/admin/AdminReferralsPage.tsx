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
import { Textarea } from "@/components/ui/textarea";
import { drapeauLangue } from "@/features/moteur/langues";
import {
  deciderReferral,
  listerReferralsAdmin,
  type CreatorReferralAdmin,
} from "@/features/referral/api";
import {
  BONUS_PAR_RECRUE_USD,
  bonusPotentielUsd,
  type StatutReferral,
} from "@/features/referral/referral";

function badgeStatut(statut: StatutReferral): "warning" | "success" | "destructive" {
  if (statut === "accepte") return "success";
  if (statut === "refuse") return "destructive";
  return "warning";
}

function nomReferrer(r: CreatorReferralAdmin): string {
  const nom = [r.referrer?.prenom, r.referrer?.nom].filter(Boolean).join(" ");
  return nom || r.referrer?.email || r.referrer_id;
}

function LigneReferral({
  row,
  onDecide,
  pending,
}: {
  row: CreatorReferralAdmin;
  onDecide: (statut: "accepte" | "refuse", note: string) => void;
  pending: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [note, setNote] = React.useState(row.note_admin ?? "");

  const contacts = [
    row.contact_upwork && `${t("referral.upwork")} : ${row.contact_upwork}`,
    row.contact_email && `${t("referral.email")} : ${row.contact_email}`,
    row.contact_telephone && `${t("referral.telephone")} : ${row.contact_telephone}`,
  ].filter(Boolean);

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {[row.prenom, row.nom].filter(Boolean).join(" ")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("referral.parrain")} : {nomReferrer(row)}
          </p>
        </div>
        <Badge variant={badgeStatut(row.statut)}>{t(`referral.statut.${row.statut}`)}</Badge>
      </div>

      <p className="text-sm">
        {drapeauLangue(row.pays)} {t(`referral.pays.${row.pays}`)}
      </p>
      <ul className="space-y-0.5 text-sm text-muted-foreground">
        {contacts.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {t("referral.recuLe")} {new Date(row.created_at).toLocaleString(i18n.language)}
        {row.decide_at && (
          <>
            {" · "}
            {t("referral.decideLe")} {new Date(row.decide_at).toLocaleString(i18n.language)}
          </>
        )}
      </p>

      {row.statut === "en_attente" && (
        <>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={t("referral.notePlaceholder")}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => onDecide("accepte", note)}>
              {t("referral.accepter")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => onDecide("refuse", note)}
            >
              {t("referral.refuser")}
            </Button>
          </div>
        </>
      )}

      {row.statut !== "en_attente" && row.note_admin && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {row.note_admin}
        </p>
      )}
    </div>
  );
}

export function AdminReferralsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const liste = useQuery({ queryKey: ["admin-referrals"], queryFn: listerReferralsAdmin });

  const decide = useMutation({
    mutationFn: ({
      id,
      statut,
      note,
    }: {
      id: string;
      statut: "accepte" | "refuse";
      note: string;
    }) => deciderReferral(id, statut, note),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-referrals"] }),
  });

  const rows = React.useMemo(() => {
    const data = liste.data ?? [];
    return [...data].sort((a, b) => {
      if (a.statut === "en_attente" && b.statut !== "en_attente") return -1;
      if (a.statut !== "en_attente" && b.statut === "en_attente") return 1;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [liste.data]);

  const acceptees = (liste.data ?? []).filter((r) => r.statut === "accepte").length;
  const enAttente = (liste.data ?? []).filter((r) => r.statut === "en_attente").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("referral.adminTitle")}</CardTitle>
          <CardDescription>{t("referral.adminSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            {t("referral.adminBonus", {
              bonus: BONUS_PAR_RECRUE_USD,
            })}
          </p>
          <p>
            {t("referral.adminStats", {
              attente: enAttente,
              acceptees,
              potentiel: bonusPotentielUsd(acceptees),
            })}
          </p>
          <p>{t("referral.adminApresAccept")}</p>
        </CardContent>
      </Card>

      {liste.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Gift className="size-5" />} title={t("referral.adminVide")} />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <LigneReferral
              key={row.id}
              row={row}
              pending={decide.isPending}
              onDecide={(statut, note) => decide.mutate({ id: row.id, statut, note })}
            />
          ))}
        </div>
      )}

      {decide.isError && (
        <p className="text-sm text-destructive">{(decide.error as Error).message}</p>
      )}
    </div>
  );
}
