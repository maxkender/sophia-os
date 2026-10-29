import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { lienTiktok } from "@/features/ckd/logique";
import { drapeauPays } from "@/features/moteur/pays";
import { cn } from "@/lib/utils";

/**
 * Le @handle d'un compte : ouvre son profil TikTok dans un nouvel onglet.
 * Utilisé partout où un handle s'affiche (décisions, nudges, Pipeline…).
 */
export function HandleTiktok({
  handle,
  pays = null,
  className,
}: {
  handle: string | null;
  pays?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const propre = handle?.replace(/^@/, "") ?? null;
  const lien = lienTiktok(propre);
  const drapeau = drapeauPays(pays);
  const texte = (
    <>
      {drapeau ? `${drapeau} ` : ""}@{propre}
    </>
  );
  if (!lien) return <span className={cn("truncate font-medium", className)}>{texte}</span>;
  return (
    <a
      href={lien}
      target="_blank"
      rel="noreferrer"
      title={t("ckd.cohorte.ouvrirTiktok", { handle: propre })}
      className={cn("truncate font-medium underline-offset-2 hover:underline", className)}
    >
      {texte}
    </a>
  );
}

/** Le nom du posteur : mène à sa page dans l'OS. Rien sans nom. */
export function LienPosteur({ compteId, nom }: { compteId: string; nom: string }) {
  if (!nom) return null;
  return (
    <Link to={`/admin/createurs/${compteId}`} className="underline-offset-2 hover:text-foreground hover:underline">
      {nom}
    </Link>
  );
}
