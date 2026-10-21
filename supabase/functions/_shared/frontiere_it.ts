/**
 * La frontière entre la FAQ automatique et l'IT guy, écrite UNE seule fois.
 *
 * Deux agents lisent le même canal #questions : la FAQ (fonction `slack-faq`,
 * en direct) et l'IT guy (tâche planifiée, toutes les 30 min, it-guy/AGENT.md).
 * Pour qu'ils ne répondent jamais tous les deux au même message, ils partagent
 * CE texte : le cerveau FAQ l'a dans son prompt, et l'AGENT.md de l'IT guy y
 * renvoie. Le modifier ici déplace la frontière pour les deux.
 *
 * Règle d'or : ce qui est cassé est à l'IT guy, « comment faire / est-ce que je
 * dois » est à la FAQ. Dans le doute, c'est cassé : mieux vaut passer par le
 * circuit validé à la main que répondre à côté.
 */

export const DEFINITION_PROBLEME_TECHNIQUE =
  `Problème technique (pour l'IT guy) : quelque chose de l'OS (le dashboard Sophia) qui ne marche pas ou affiche faux. Page vide ou qui ne charge pas, connexion impossible, posts absents, en double ou en trop, calendrier faux ou vide, image fausse, manquante ou avec un vieux texte, téléchargement impossible, bouton sans effet, warm-up qui ne se lance pas, erreur affichée, retour (review) qui ne s'affiche pas, notifications, mauvaise langue dans les textes fournis. C'est un problème technique même quand le guide donne une consigne générale pour ce symptôme. Un message qui mêle une question et un problème technique est un problème technique. Dans le doute, c'est un problème technique.`;

export const DEFINITION_QUESTION =
  `Question (pour la FAQ) : comment faire, quoi faire, est-ce que je dois, où trouver. Les règles du poste, la publication sur TikTok, le warm-up, les sons, les textes à copier, les commentaires, le lien de l'appli, les horaires, le paiement et les milestones (la règle : on en parle à son manager en message privé), le recrutement. Un souci côté TikTok (son introuvable, pas de vues, post retiré, compte perdu) n'est pas un problème de l'OS : c'est une question.`;
