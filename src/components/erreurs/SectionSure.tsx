import * as React from "react";

import i18n from "@/locales/index";

/**
 * 6/11 : une section qui plante n'emporte plus la page (plus de page
 * blanche). Le reste de la page s'affiche ; à la place de la section, le
 * message d'erreur (à copier pour corriger) et un bouton pour réessayer.
 * Un module de page introuvable après un déploiement (ancien onglet) recharge
 * la page une fois.
 */
interface Props {
  /** Le nom de la section, affiché dans le message (« À décider maintenant »). */
  nom?: string;
  children: React.ReactNode;
}

interface Etat {
  erreur: Error | null;
}

const CLE_RECHARGE = "section-sure-recharge";

export function estModuleIntrouvable(e: unknown): boolean {
  const m = String((e as Error | undefined)?.message ?? e ?? "");
  return /dynamically imported module|Importing a module script failed|Loading chunk .* failed|error loading dynamically/i.test(m);
}

export class SectionSure extends React.Component<Props, Etat> {
  state: Etat = { erreur: null };

  static getDerivedStateFromError(erreur: Error): Etat {
    return { erreur };
  }

  componentDidCatch(erreur: Error, info: React.ErrorInfo) {
    console.error(`[SectionSure] ${this.props.nom ?? "section"}`, erreur, info.componentStack);
    // Après un déploiement, un ancien onglet ne trouve plus ses modules : on recharge une fois.
    try {
      if (estModuleIntrouvable(erreur) && !sessionStorage.getItem(CLE_RECHARGE)) {
        sessionStorage.setItem(CLE_RECHARGE, "1");
        window.location.reload();
      }
    } catch {
      // sessionStorage indisponible : pas de rechargement automatique.
    }
  }

  render() {
    const { erreur } = this.state;
    if (!erreur) return this.props.children;
    const t = i18n.t.bind(i18n);
    return (
      <div role="alert" data-testid="section-erreur" className="space-y-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
        <p className="font-medium text-destructive">
          {t("erreurs.section", { nom: this.props.nom ?? t("erreurs.cetteSection") })}
        </p>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{erreur.message}</pre>
        <button type="button" className="rounded-md border px-2 py-1 text-xs hover:bg-muted" onClick={() => this.setState({ erreur: null })}>
          {t("erreurs.reessayer")}
        </button>
      </div>
    );
  }
}
