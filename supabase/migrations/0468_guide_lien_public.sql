-- 0468 — Le Poster Guide en lien public.
--
-- Les posteurs n'ont pas accès à app.notion.com : le réglage lien_etapes_tiktok
-- (lien des relances « étapes TikTok ») pointait vers app.notion.com. Il passe au
-- site public. Le code réécrit aussi tout lien app.notion.com / notion.so du guide
-- vers ce site (bienvenue, relances, bot FAQ, dashboard, onboarding).
--
-- Une seule valeur de réglage changée (si elle pointe encore vers app.notion.com).

update public.reglages
   set valeur = to_jsonb('https://star-water-a0e.notion.site/Vik-Studios-TikTok-Poster-Guide-3f4241308d6681f8ad41dc507f2c8505'::text)
 where cle = 'lien_etapes_tiktok' and valeur::text ~ 'app\.notion\.com';
