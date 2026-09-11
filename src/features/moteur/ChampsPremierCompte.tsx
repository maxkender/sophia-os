import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApercuIdentitePapier } from "@/features/moteur/ApercuIdentitePapier";
import { nomApplication, type ApplicationOs } from "@/features/moteur/applications";
import { nomLangue } from "@/features/moteur/langues";
import type { TypeCompte } from "@/features/moteur/types";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export type PremierCompte = TypeCompte | "aucun";

export function ChampsPremierCompte({
  allowAucun,
  typeCompte,
  onType,
  langues,
  langue,
  onLangue,
  postsParJour,
  onPostsParJour,
  handle,
  onHandle,
  email: _email,
  onEmail: _onEmail,
  password: _password,
  onPassword: _onPassword,
  deuxFa: _deuxFa,
  onDeuxFa: _onDeuxFa,
  applications,
  applicationSlug,
  onApplication,
}: {
  allowAucun?: boolean;
  typeCompte: PremierCompte;
  onType: (type: PremierCompte) => void;
  langues: string[];
  langue: string;
  onLangue: (langue: string) => void;
  postsParJour?: 1 | 2 | 3;
  onPostsParJour?: (n: 1 | 2 | 3) => void;
  handle: string;
  onHandle: (v: string) => void;
  email: string;
  onEmail: (v: string) => void;
  password: string;
  onPassword: (v: string) => void;
  deuxFa: string;
  onDeuxFa: (v: string) => void;
  applications?: ApplicationOs[];
  applicationSlug?: string;
  onApplication?: (slug: string) => void;
}) {
  const { t } = useTranslation();
  const types: PremierCompte[] = allowAucun ? ["perso", "cm", "aucun"] : ["perso", "cm"];

  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="space-y-1.5">
        <Label>{t("posters.premierCompte")}</Label>
        <div className="inline-flex flex-wrap rounded-md border p-0.5">
          {types.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onType(type)}
              className={
                typeCompte === type
                  ? "rounded px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground"
                  : "rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              }
            >
              {type === "cm"
                ? t("cm.badge")
                : type === "aucun"
                  ? t("posters.premierCompteAucun")
                  : t("cm.perso")}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {typeCompte === "cm"
            ? t("cm.ajouterAide")
            : typeCompte === "aucun"
              ? t("posters.premierCompteAucunAide")
              : t("cm.ajouterPersoAide")}
        </p>
      </div>

      {typeCompte !== "aucun" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {applications && onApplication && (
            <div className="space-y-1">
              <Label htmlFor="premier-app">{t("applications.compte")}</Label>
              <select
                id="premier-app"
                className={selectClass}
                value={applicationSlug ?? ""}
                onChange={(e) => onApplication(e.target.value)}
                required
              >
                {applications.map((app) => (
                  <option key={app.id} value={app.slug}>
                    {nomApplication(app)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="premier-langue">{t("cm.langueCompte")}</Label>
            <select
              id="premier-langue"
              className={selectClass}
              value={langue}
              onChange={(e) => onLangue(e.target.value)}
              required
            >
              {langues.length === 0 && <option value="">{t("hiring.aucuneLangue")}</option>}
              {langues.map((l) => (
                <option key={l} value={l}>
                  {nomLangue(l)}
                </option>
              ))}
            </select>
          </div>
          {typeCompte === "perso" && (
            <div className="space-y-1">
              <Label htmlFor="premier-handle">{t("comptes.pseudo")}</Label>
              <Input
                id="premier-handle"
                value={handle}
                placeholder={t("comptes.pseudoPlaceholder")}
                onChange={(e) => onHandle(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("comptes.pseudoFacultatif")}</p>
            </div>
          )}
          {typeCompte === "perso" && onPostsParJour && postsParJour != null && (
            <div className="space-y-1 sm:col-span-2">
              <Label>{t("hiring.postsParJour")}</Label>
              <div className="inline-flex rounded-md border p-0.5">
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onPostsParJour(n)}
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
    </div>
  );
}
