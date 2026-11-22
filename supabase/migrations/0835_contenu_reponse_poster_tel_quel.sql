-- 0835 (22/11, Max) : contenu faux (images répétées, texte trop long, images sans rapport, image cassée) :
-- d'abord poster le texte et les images donnés ; s'il y a vraiment un problème, corriger le texte pour qu'il ait
-- du sens, ou reposter un ancien post qui a bien marché. Remplace la réponse officielle posée par 0833 (même ligne).
update public.reponses_officielles
   set reponse = 'Please always post the text and images you are given. If there is really an issue with the post, edit the text so it makes sense, or post an old post that performed well.'
 where question like 'Content: text far too long%'
   and reponse = 'Please post an old TikTok you already posted. Today counts as done.';

update public.support_consignes
   set texte = replace(texte, 'poster un ancien TikTok, le jour compte',
                'poster quand même le texte et les images donnés ; s''il y a vraiment un problème, corriger le texte pour qu''il ait du sens, ou reposter un ancien post qui a bien marché')
 where texte like 'Problèmes de contenu : réponds tout de suite%'
   and texte like '%poster un ancien TikTok, le jour compte%';

update public.reponses_officielles
   set formulations = formulations || array['the same image is repeated twice']
 where question like 'Content: text far too long%'
   and not ('the same image is repeated twice' = any(formulations));
