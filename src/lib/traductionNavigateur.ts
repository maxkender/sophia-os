/**
 * 11/11 : la traduction automatique du navigateur ne doit plus faire planter l'app.
 *
 * L'interface poster est en anglais : beaucoup de posteurs la traduisent avec
 * leur navigateur (Chrome « Traduire cette page »). La traduction remplace chaque
 * texte de la page par des balises `<font>`, dans le dos de React. Quand React
 * retire ou déplace ensuite un de ses textes, il ne le trouve plus là où il
 * l'avait mis : `NotFoundError` sur `removeChild` / `insertBefore`, l'app se
 * démonte, la page devient blanche. Cas de Leidy (@mariana.avanza516, en
 * espagnol) les 4, 7 et 11/11 : le retour s'ouvrait, « Ver comentarios »
 * (« See the feedback » traduit) changeait les boutons, page blanche, le
 * calendrier restait inaccessible.
 *
 * Le correctif connu (facebook/react#11538) : quand le nœud n'est plus là où
 * React le croit, on ne fait rien au lieu de lever. Le texte traduit reste
 * affiché tel quel ; React reprend la main au rendu suivant.
 *
 * Interdire la traduction (`translate="no"`) n'est pas une option : c'est elle
 * qui rend l'interface lisible pour ces posteurs.
 */

const MARQUE = Symbol.for("sophia.protectionTraduction");

type NodeProto = typeof Node.prototype & { [MARQUE]?: () => void };

/**
 * Pose la protection une fois (les appels suivants ne font rien). Rend la
 * fonction qui la retire, pour les tests.
 */
export function protegerContreTraduction(): () => void {
  if (typeof Node !== "function" || !Node.prototype) return () => {};
  const proto = Node.prototype as NodeProto;
  const existante = proto[MARQUE];
  if (existante) return existante;

  const removeChildOrigine = proto.removeChild;
  const insertBeforeOrigine = proto.insertBefore;

  proto.removeChild = function removeChild<T extends Node>(this: Node, enfant: T): T {
    if (enfant.parentNode !== this) {
      console.warn("[traduction] removeChild ignoré : le nœud a été déplacé (traduction du navigateur ?)", enfant);
      return enfant;
    }
    return removeChildOrigine.call(this, enfant) as T;
  };

  proto.insertBefore = function insertBefore<T extends Node>(this: Node, nouveau: T, reference: Node | null): T {
    if (reference && reference.parentNode !== this) {
      console.warn("[traduction] insertBefore ignoré : la référence a été déplacée (traduction du navigateur ?)", reference);
      return nouveau;
    }
    return insertBeforeOrigine.call(this, nouveau, reference) as T;
  };

  const retirer = () => {
    proto.removeChild = removeChildOrigine;
    proto.insertBefore = insertBeforeOrigine;
    delete proto[MARQUE];
  };
  proto[MARQUE] = retirer;
  return retirer;
}
