import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { NettoyageEtapes } from "@/components/moteur/NettoyageEtapes";
import { executerEnLot } from "@/lib/lot";
import {
  lireReglages,
  mediasBrutsParSource,
  nettoyerTest,
  type MediaTest,
} from "@/features/moteur/api";
import {
  appliquerEvenement,
  etapesInitiales,
  type EvenementEtape,
  type ProviderNettoyage,
} from "@/features/moteur/nettoyageEtapes";

type EtatTest =
  | { statut: "repos" }
  | { statut: "encours"; etapes: EvenementEtape[] }
  | {
      statut: "ok";
      url: string;
      moteur?: "text_removal" | "replicate_text_removal";
      etapes: EvenementEtape[];
    }
  | { statut: "echec"; erreur?: string; etapes: EvenementEtape[] };

const REPOS: EtatTest = { statut: "repos" };

async function testerImage(
  media: MediaTest,
  premier: ProviderNettoyage,
  onEtapes: (etapes: EvenementEtape[]) => void,
): Promise<EtatTest> {
  let etapes = etapesInitiales(premier);
  onEtapes(etapes);
  try {
    const res = await nettoyerTest(media.url, (ev) => {
      etapes = appliquerEvenement(etapes, ev, premier);
      onEtapes(etapes);
    });
    if (res.ok && res.url) {
      return { statut: "ok", url: res.url, moteur: res.moteur, etapes };
    }
    return {
      statut: "echec",
      erreur: res.erreur ?? res.motif,
      etapes,
    };
  } catch (error) {
    return {
      statut: "echec",
      erreur: (error as Error)?.message,
      etapes,
    };
  }
}

function CarteTest({
  media,
  etat,
  onTester,
}: {
  media: MediaTest;
  etat: EtatTest;
  onTester: () => void;
}) {
  const { t } = useTranslation();
  const enCours = etat.statut === "encours";

  return (
    <div className="space-y-2 rounded-lg border p-2">
      <div className="grid grid-cols-2 gap-2">
        <figure className="space-y-1">
          <figcaption className="text-[10px] font-medium uppercase text-muted-foreground">
            {t("testNet.avant")}
          </figcaption>
          <img src={media.url} alt="" className="aspect-[3/4] w-full rounded border object-cover" />
        </figure>
        <figure className="space-y-1">
          <figcaption className="text-[10px] font-medium uppercase text-muted-foreground">
            {t("testNet.apres")}
          </figcaption>
          {enCours ? (
            <div className="flex aspect-[3/4] flex-col justify-center gap-2 rounded border bg-muted/40 p-2">
              <NettoyageEtapes etapes={etat.etapes} />
            </div>
          ) : etat.statut === "ok" ? (
            <img src={etat.url} alt="" className="aspect-[3/4] w-full rounded border object-cover" />
          ) : (
            <div className="flex aspect-[3/4] items-center justify-center rounded border border-dashed bg-muted/20 p-1 text-center text-[10px] text-muted-foreground">
              {etat.statut === "echec" ? t("testNet.echec") : t("testNet.pasEncore")}
            </div>
          )}
        </figure>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="h-7 w-full text-xs"
        disabled={enCours}
        onClick={onTester}
      >
        <Sparkles className="size-3" />
        {enCours ? t("testNet.enCours") : t("testNet.tester")}
      </Button>

      {etat.statut !== "repos" && etat.statut !== "encours" && "etapes" in etat ? (
        <NettoyageEtapes etapes={etat.etapes} />
      ) : null}

      {etat.statut === "ok" && etat.moteur ? (
        <p className="text-[10px] text-muted-foreground">
          {etat.moteur === "text_removal"
            ? t("testNet.viaTextRemoval")
            : t("testNet.viaReplicate")}
        </p>
      ) : null}
      {etat.statut === "echec" && etat.erreur ? (
        <p className="text-[10px] text-destructive">{etat.erreur}</p>
      ) : null}
    </div>
  );
}

function GroupeTest({ source, medias }: { source: string; medias: MediaTest[] }) {
  const { t } = useTranslation();
  const [etats, setEtats] = React.useState<Record<string, EtatTest>>({});
  const [lot, setLot] = React.useState<{ fait: number; total: number } | null>(null);
  const { data: reglages } = useQuery({
    queryKey: ["reglages"],
    queryFn: lireReglages,
    staleTime: 30_000,
  });
  const premier: ProviderNettoyage = reglages?.nettoyage.provider_principal ?? "fal";

  const maj = (id: string, etat: EtatTest) => setEtats((e) => ({ ...e, [id]: etat }));

  async function lancerUn(media: MediaTest) {
    maj(media.id, { statut: "encours", etapes: etapesInitiales(premier) });
    const final = await testerImage(media, premier, (etapes) => {
      maj(media.id, { statut: "encours", etapes });
    });
    maj(media.id, final);
  }

  async function lancerTout() {
    setLot({ fait: 0, total: medias.length });
    setEtats(
      Object.fromEntries(
        medias.map((m) => [
          m.id,
          { statut: "encours", etapes: etapesInitiales(premier) } as EtatTest,
        ]),
      ),
    );
    await executerEnLot(medias, lancerUn, {
      onProgres: (fait, total) => setLot({ fait, total }),
    });
    setLot(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">@{source}</h2>
          <Badge variant="secondary">{medias.length}</Badge>
        </div>
        <Button size="sm" variant="outline" disabled={lot !== null} onClick={lancerTout}>
          <Sparkles className="size-3.5" />
          {lot
            ? t("adminPost.lotEnCours", { fait: lot.fait, total: lot.total })
            : t("testNet.toutTester")}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {medias.map((media) => (
          <CarteTest
            key={media.id}
            media={media}
            etat={etats[media.id] ?? REPOS}
            onTester={() => lancerUn(media)}
          />
        ))}
      </div>
    </div>
  );
}

export function AdminTestNettoyagePage() {
  const { t } = useTranslation();
  const groupes = useQuery({ queryKey: ["medias-bruts-test"], queryFn: mediasBrutsParSource });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("testNet.title")}</CardTitle>
          <CardDescription>{t("testNet.subtitle")}</CardDescription>
        </CardHeader>
      </Card>

      {groupes.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {groupes.data?.length === 0 && <EmptyState title={t("testNet.vide")} />}

      {groupes.data?.map((groupe) => (
        <GroupeTest key={groupe.source} source={groupe.source} medias={groupe.medias} />
      ))}
    </div>
  );
}
