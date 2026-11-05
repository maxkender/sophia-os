---
name: ugc-ia
description: Page UGC IA de l'OS (/admin/ugc-ia) — réactions TikTok refaites par des personas synthétiques avec Higgsfield Genjutsu. À utiliser pour ajouter un persona (un nouveau visage) à la page, lister les personas, ou faire le point sur les sources et les vidéos générées.
---

# UGC IA : ajouter un persona et faire le point

La page `/admin/ugc-ia` (menu Production) refait une réaction TikTok (la
**source**) avec un ou plusieurs **personas** cochés, via l'API Higgsfield
Genjutsu. Tables (migrations 0656 et 0657, projet Supabase « Sophia OS
SLIDESHOW », `mbikecieskoobeizixig`) :

- `ugc_ia_personas` : `nom`, `description`, `image_url`, `image_path`, `actif` ;
- `ugc_ia_sources` : la vidéo TikTok, le passage coupé, le CTA (premier écran + texte) ;
- `ugc_ia_generations` : une vidéo Genjutsu = source + persona + qualité + prompt.

Les personas s'ajoutent **ici, par Claude**, pas dans la page.

## Règles non négociables

1. **Visage 100 % synthétique** : jamais une personne réelle ni sa
   ressemblance (créateur source, célébrité, quelqu'un de connu de l'équipe).
2. **Adulte jeune** : environ 20 ans, jamais d'apparence mineure.
3. Un refus d'un fournisseur (filtre de contenu, ressemblance) ne se
   contourne pas : tu le signales et tu changes de description.
4. Le coût de la génération du portrait s'annonce avant de lancer, sauf si
   l'humain a déjà donné un budget.

## Ajouter un persona

1. **Le portrait.** Avec le connecteur Higgsfield :
   - soit `ai_influencer_prepare` puis `ai_influencer_generate` (Soul 2), qui
     donne une fiche personnage réaliste ;
   - soit `generate_image` avec un prompt de portrait photoréaliste.

   Visée : une jeune femme d'environ 20 ans, cadrée tête et épaules, de face,
   fond clair et uni, lumière douce, style selfie naturel. C'est l'image que
   Genjutsu anime : un visage net et bien éclairé donne de meilleures vidéos.
   Une seule personne sur l'image, sans texte.
2. **Vérifie l'image** (regarde-la) : un seul visage, net, adulte, rien d'écrit.
3. **Récupère son URL publique** en https (le résultat de la génération).
4. **Insère la ligne** avec le connecteur Supabase (`execute_sql`) :

   ```sql
   insert into public.ugc_ia_personas (nom, description, image_url)
   values ('Clara', '~20 ans, française, cheveux châtains ondulés, yeux noisette, chemise à carreaux, fond clair',
           'https://…/portrait.png')
   returning id, nom;
   ```

   - `nom` : un prénom, unique parmi les personas actifs (vérifie avant).
   - `description` : une ligne, âge, origine, cheveux, yeux, tenue, décor.
   - Laisse `image_path` vide : à la prochaine ouverture de la page, la
     fonction `ugc-ia` (action `rapatrier_personas`) copie l'image dans le
     stockage de l'OS (`medias/ugc-ia/personas/<id>.<ext>`), sans ses
     métadonnées C2PA, et remplace `image_url`.
5. **Préviens l'humain** : le nom, la description et l'image. Le persona
   apparaît tout de suite dans la page, prêt à être coché.

Pour retirer un persona sans perdre ses vidéos :
`update public.ugc_ia_personas set actif = false where id = '…';`
Ne supprime pas la ligne : ses générations y sont rattachées.

## Faire le point

```sql
select p.nom, g.statut, g.resolution, count(*)
from public.ugc_ia_generations g join public.ugc_ia_personas p on p.id = g.persona_id
group by 1, 2, 3 order by 1, 2, 3;
```

Les vidéos sont dans `ugc_ia_generations.video_url`, rangées par source
(`medias/ugc-ia/<source_id>/<generation_id>.mp4`).

## Qualité des vidéos (mesurée le 5/11)

Genjutsu rend du **24 images/s** (la source est à 30) avec un **à-coup
régulier toutes les 4 images** (6 par seconde) : c'est le modèle, pas la
coupe ni le téléchargement. Une interpolation à 60 images/s ne l'efface
pas. Pour mesurer une vidéo, compare la variation image par image par
phase modulo 4 (`ffmpeg … tblend=all_mode=difference,signalstats`) : une
phase nettement au-dessus des autres trahit l'à-coup.
