import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FlaskConical, Languages, Link2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarreChargement } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { assignerTikTok, listerComptes, listerPostsTest, testerTraduction } from "@/features/moteur/api";
import { LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import { SimulerMinuitCard } from "@/features/moteur/SimulerMinuitCard";
import { SimulerMinuitCompteCard } from "@/features/moteur/SimulerMinuitCompteCard";
import { SimulerUgcVideoAssignationCard } from "@/features/moteur/SimulerUgcVideoAssignationCard";
import { TestBrulerTexteCard } from "@/features/moteur/TestBrulerTexteCard";
import { TestCompletCard } from "@/features/moteur/TestCompletCard";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Tester UN TikTok précis, de bout en bout, sans l'assigner à personne :
 * import → nettoyage → Sophia → un post « test » (invisible sur les calendriers)
 * qu'on ouvre pour le QR et le téléchargement.
 */
function TesterUnTikTok() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const comptes = useQuery({ queryKey: ["comptes"], queryFn: listerComptes });

  const [lien, setLien] = React.useState("");
  const [langue, setLangue] = React.useState("");
  const [compteId, setCompteId] = React.useState("");

  // On choisit d'abord la LANGUE (celle dans laquelle le test est traduit), puis
  // le STYLE — chaque compte porte une voix/persona propre. Le compte reste ce
  // qu'on envoie au moteur, mais on le présente comme « langue » puis « style »
  // au lieu d'un opaque « via un compte ».
  const langues = React.useMemo(
    () => [...new Set((comptes.data ?? []).map((c) => c.langue))].sort(),
    [comptes.data],
  );
  const stylesDispo = (comptes.data ?? []).filter((c) => c.langue === langue);
  // Le style est OPTIONNEL : pour un test « pour moi » (le poster, c'est toi), il
  // suffit de choisir la langue ; on prend alors le premier compte de la langue
  // comme véhicule. Le post produit est un post de test, à télécharger et poster
  // où tu veux (il n'apparaît sur aucun calendrier de créateur).
  const compteEffectif = compteId || stylesDispo[0]?.id || "";

  // Dès l'import réussi, on FILE sur la page du post : elle montre le nettoyage
  // photo par photo, laisse remplacer une image qui rate, intègre Sophia, puis
  // affiche le QR — et reprend toute seule si l'onglet a dormi.
  const tester = useMutation({
    mutationFn: () => assignerTikTok({ url: lien, compteId: compteEffectif, estTest: true }),
    onSuccess: (r) => {
      setLien("");
      navigate(`/admin/posts/${r.postId}`);
    },
  });

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4 text-primary" />
          {t("tests.tiktokTitre")}
        </CardTitle>
        <CardDescription>{t("tests.tiktokDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="tLien">{t("posts.lienTikTok")}</Label>
          <Input
            id="tLien"
            placeholder="https://www.tiktok.com/@compte/photo/…"
            value={lien}
            onChange={(e) => setLien(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tLangue">{t("tests.langue")}</Label>
            <select
              id="tLangue"
              className={selectClass}
              value={langue}
              onChange={(e) => {
                setLangue(e.target.value);
                setCompteId("");
              }}
            >
              <option value="">{t("common.none")}</option>
              {langues.map((l) => (
                <option key={l} value={l}>
                  {nomLangue(l)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tStyle">{t("tests.styleOptionnel")}</Label>
            <select
              id="tStyle"
              className={selectClass}
              value={compteId}
              disabled={!langue}
              onChange={(e) => setCompteId(e.target.value)}
            >
              <option value="">{langue ? t("tests.styleChoisir") : t("tests.styleLangueDabord")}</option>
              {stylesDispo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.persona_nom ?? c.handle_tiktok ?? c.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("tests.styleAidePourMoi")}</p>

        <Button
          disabled={tester.isPending || !lien.trim() || !compteEffectif}
          onClick={() => tester.mutate()}
        >
          <Sparkles className="size-4" />
          {tester.isPending ? t("tests.enCours") : t("tests.tiktokLancer")}
        </Button>

        <BarreChargement actif={tester.isPending} dureeMs={6_000} label={t("tests.enCours")} />

        {tester.isError && (
          <p className="text-sm text-destructive">{(tester.error as Error).message}</p>
        )}
        {tester.isSuccess && tester.data?.postId && (
          <p className="text-sm text-success">
            {t("tests.tiktokOk")}{" "}
            <Link
              to={`/admin/posts/${tester.data.postId}`}
              className="font-medium underline underline-offset-2"
            >
              {t("posts.voirLePost")}
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Teste la traduction d'un texte vers une langue, avec le même prompt que le
 *  moteur — pour régler les prompts de traduction sans fabriquer un post. */
function TestTraduction() {
  const { t } = useTranslation();
  const [texte, setTexte] = React.useState("");
  const [langue, setLangue] = React.useState("en");

  const traduire = useMutation({ mutationFn: () => testerTraduction(texte, langue) });

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="size-4 text-primary" />
          {t("tests.tradTitre")}
        </CardTitle>
        <CardDescription>{t("tests.tradDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="tradTexte">{t("tests.tradTexte")}</Label>
          <Textarea
            id="tradTexte"
            rows={3}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder={t("tests.tradPlaceholder")}
          />
        </div>
        <div className="space-y-2 sm:max-w-xs">
          <Label htmlFor="tradLangue">{t("tests.langue")}</Label>
          <select
            id="tradLangue"
            className={selectClass}
            value={langue}
            onChange={(e) => setLangue(e.target.value)}
          >
            {LANGUES_CIBLES.map((l) => (
              <option key={l} value={l}>
                {nomLangue(l)}
              </option>
            ))}
          </select>
        </div>
        <Button disabled={traduire.isPending || !texte.trim()} onClick={() => traduire.mutate()}>
          <Languages className="size-4" />
          {traduire.isPending ? t("tests.enCours") : t("tests.tradLancer")}
        </Button>
        {traduire.isError && (
          <p className="text-sm text-destructive">{(traduire.error as Error).message}</p>
        )}
        {traduire.data?.traduction && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t("tests.tradResultat")}</p>
            <p className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm">
              {traduire.data.traduction}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Les posts de test récents, pour les retrouver (ils n'apparaissent sur aucun
 *  calendrier). Statut « done » = prêt à ouvrir (QR, téléchargement). */
function TestsRecents() {
  const { t } = useTranslation();
  const tests = useQuery({ queryKey: ["posts-test"], queryFn: listerPostsTest });
  if (!tests.data || tests.data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("tests.recentsTitre")}</CardTitle>
        <CardDescription>{t("tests.recentsDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {tests.data.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{p.titre?.slice(0, 60) || p.id.slice(0, 8)}</p>
              <p className="text-xs text-muted-foreground">
                {p.persona ?? "—"} · {t(`statut.${p.pipeline_statut}`, p.pipeline_statut)}
              </p>
            </div>
            <Button size="sm" variant="outline" asChild>
              {/* Vue admin complète : détails du slideshow, renettoyer par slide,
                  et un bouton QR/ZIP vers la vue poster. */}
              <Link to={`/admin/posts/${p.id}`}>{t("posts.ouvrir")}</Link>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Catalogue des tests : on choisit d'abord ici (chacun est expliqué), puis le
// test choisi s'affiche seul en dessous — plus de mur de cartes empilées.
const TESTS = [
  { value: "minuit", titreKey: "simMinuit.title", descKey: "simMinuit.subtitle", render: () => <SimulerMinuitCard /> },
  {
    value: "minuit-compte",
    titreKey: "simMinuitCompte.title",
    descKey: "simMinuitCompte.subtitle",
    render: () => <SimulerMinuitCompteCard />,
  },
  {
    value: "ugc-video",
    titreKey: "simUgcVideo.title",
    descKey: "simUgcVideo.subtitle",
    render: () => <SimulerUgcVideoAssignationCard />,
  },
  {
    value: "ugc-video-face",
    titreKey: "simUgcVideoFace.title",
    descKey: "simUgcVideoFace.subtitle",
    render: () => <SimulerUgcVideoAssignationCard mode="face_ref" />,
  },
  { value: "tiktok", titreKey: "tests.tiktokTitre", descKey: "tests.tiktokDesc", render: () => <TesterUnTikTok /> },
  { value: "traduction", titreKey: "tests.tradTitre", descKey: "tests.tradDesc", render: () => <TestTraduction /> },
  {
    value: "bruler-texte",
    titreKey: "tests.brulerTitre",
    descKey: "tests.brulerDesc",
    render: () => <TestBrulerTexteCard />,
  },
  { value: "complet", titreKey: "tests.completTitre", descKey: "tests.completDesc", render: () => <TestCompletCard /> },
] as const;

export function AdminTestsPage() {
  const { t } = useTranslation();
  const [choix, setChoix] = React.useState<string>("");
  const actif = TESTS.find((x) => x.value === choix);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="size-4 text-primary" />
            {t("tests.title")}
          </CardTitle>
          <CardDescription>{t("tests.choisir")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            aria-label={t("tests.choisir")}
            className={selectClass}
            value={choix}
            onChange={(e) => setChoix(e.target.value)}
          >
            <option value="">{t("tests.choisirPlaceholder")}</option>
            {TESTS.map((x) => (
              <option key={x.value} value={x.value}>
                {t(x.titreKey)}
              </option>
            ))}
          </select>
          {actif && <p className="text-sm text-muted-foreground">{t(actif.descKey)}</p>}
        </CardContent>
      </Card>

      {actif ? actif.render() : null}

      <TestsRecents />
    </div>
  );
}
