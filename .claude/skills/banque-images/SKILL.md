---
name: banque-images
description: Banque d'images de l'OS venues de Pinterest. À utiliser pour remplir la banque d'un label (Atala d'abord — male_run, classic_girl_run, clean_girl_run) avant ou pendant ses podz — chercher des images sur Pinterest par mots-clés ou depuis un tableau rempli à la main (scraper Apify), les trier à l'œil sur planches, les recadrer en 9:16 et les verser sous un ou plusieurs labels, ou faire le point sur ce que la banque contient.
---

Lis `banque/AGENT.md` en entier avant d'agir : ce qu'est une image de la banque
(9:16, sans texte ni logo, légende en anglais), le tour en quatre commandes
(`npm run chercher | planche | verser | etat` dans `banque/`), les règles du
tri (ce qu'on écarte, `visage`, `cadrage`, les doublons) et les accès (Apify
par le proxy de la session, `i.pinimg.com`, `BANQUE_JETON` pour la fonction
Edge `banque`). Les images versées entrent dans la banque propre des labels :
leurs podz les voient avec `images`. Rien n'est diffusé par cet outil.
