import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Copy, FileSignature } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/AuthContext";
import { ContratPapierDocument } from "@/features/moteur/ContratPapierDocument";
import { listerContratsPapier, signerContratPapier, type PapierCmContrat } from "@/features/moteur/api";
import {
  cibleComptePapier,
  contratPapierSigne,
  validerSignatureContrat,
} from "@/features/moteur/papierCmCompte";

function copier(texte: string) {
  void navigator.clipboard?.writeText(texte);
}

function LigneCompte({ label, valeur }: { label: string; valeur: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-xs">{valeur}</p>
      </div>
      <Button type="button" size="icon" variant="ghost" title={t("cm.copier")} onClick={() => copier(valeur)}>
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

function KitCompte({ row }: { row: PapierCmContrat }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <Alert>
        <Check className="h-4 w-4" />
        <AlertTitle>{t("papierContrat.signeTitre")}</AlertTitle>
        <AlertDescription>{t("papierContrat.signeAide")}</AlertDescription>
      </Alert>
      <div className="grid gap-2 sm:grid-cols-2">
        <LigneCompte label={t("papierContrat.gmail")} valeur={row.gmail_adresse} />
        {row.gmail_password ? (
          <LigneCompte label={t("papierContrat.gmailMdp")} valeur={row.gmail_password} />
        ) : null}
        <LigneCompte label={t("papierContrat.instagram")} valeur={row.instagram_handle} />
        {row.instagram_password ? (
          <LigneCompte label={t("papierContrat.instagramMdp")} valeur={row.instagram_password} />
        ) : null}
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>{t("papierContrat.etape1")}</li>
        <li>{t("papierContrat.etape2")}</li>
        <li>{t("papierContrat.etape3")}</li>
        <li>{t("papierContrat.etape4")}</li>
      </ol>
      <p className="text-xs text-muted-foreground">
        {t("papierContrat.preuve", {
          nom: row.nom_legal,
          pays: row.pays_residence,
          date: row.signe_at ? new Date(row.signe_at).toLocaleString() : "—",
          ip: row.signature_ip || "—",
        })}
      </p>
    </div>
  );
}

function FormulaireSignature({ row }: { row: PapierCmContrat }) {
  const { t } = useTranslation();
  const { profil } = useAuth();
  const queryClient = useQueryClient();
  const [nom, setNom] = React.useState(
    [profil?.prenom, profil?.nom].filter(Boolean).join(" "),
  );
  const [pays, setPays] = React.useState(cibleComptePapier(row.langue).paysEn);
  const [signature, setSignature] = React.useState("");
  const [lu, setLu] = React.useState(false);
  const [accepte, setAccepte] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const signer = useMutation({
    mutationFn: () =>
      signerContratPapier({
        id: row.id,
        nomLegal: nom,
        pays,
        signature,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["papier-cm-contrats"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const cle = validerSignatureContrat({
          nomLegal: nom,
          pays,
          signature,
          lu,
          accepte,
        });
        if (cle) {
          setErr(cle);
          return;
        }
        setErr(null);
        signer.mutate();
      }}
    >
      <p className="text-sm font-medium">{t("papierContrat.signerTitre")}</p>
      <p className="text-xs text-muted-foreground">{t("papierContrat.signerAide")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <LigneCompte label={t("papierContrat.gmail")} valeur={row.gmail_adresse} />
        <LigneCompte label={t("papierContrat.instagram")} valeur={row.instagram_handle} />
      </div>
      <p className="text-xs text-muted-foreground">{t("papierContrat.handlesAvant")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="nom-legal">{t("papierContrat.nomLegal")}</Label>
          <Input id="nom-legal" required value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pays-legal">{t("papierContrat.pays")}</Label>
          <Input id="pays-legal" required value={pays} onChange={(e) => setPays(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="signature-legal">{t("papierContrat.signature")}</Label>
        <Input
          id="signature-legal"
          required
          className="font-serif text-lg italic"
          placeholder={nom || t("papierContrat.signaturePh")}
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("papierContrat.signatureAide")}</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={lu} onCheckedChange={(v) => setLu(v === true)} className="mt-0.5" />
        <span>{t("papierContrat.caseLu")}</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={accepte} onCheckedChange={(v) => setAccepte(v === true)} className="mt-0.5" />
        <span>{t("papierContrat.caseAccepte")}</span>
      </label>
      {err ? (
        <p className="text-xs text-destructive">{err.startsWith("papierContrat.") ? t(err) : err}</p>
      ) : null}
      <Button type="submit" disabled={signer.isPending}>
        {signer.isPending ? t("common.saving") : t("papierContrat.signer")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("papierContrat.societe")}</p>
    </form>
  );
}

export function PosterContratPapierPage() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["papier-cm-contrats"],
    queryFn: () => listerContratsPapier(),
  });
  const rows = q.data ?? [];

  if (q.isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title={t("papierContrat.videTitre")}
        description={t("papierContrat.videAide")}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {rows.map((row) => {
        const cible = cibleComptePapier(row.langue);
        const signe = contratPapierSigne(row.statut);
        return (
          <div key={row.id} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <FileSignature className="h-5 w-5" />
                  {t("papierContrat.titre")}
                </CardTitle>
                <CardDescription>{t("papierContrat.sous")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {signe ? <KitCompte row={row} /> : <FormulaireSignature row={row} />}
              </CardContent>
            </Card>
            <ContratPapierDocument
              email={row.gmail_adresse}
              instagram={row.instagram_handle}
              paysEn={cible.paysEn}
            />
          </div>
        );
      })}
    </div>
  );
}
