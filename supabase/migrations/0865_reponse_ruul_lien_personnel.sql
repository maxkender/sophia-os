-- 0865 : la réponse officielle « How do I set up my Ruul account? » alignée sur le nouveau parcours Ruul (26/11, Max :
-- « fais en sorte que ça soit cohérent avec Ruul »). Ruul n'envoie plus d'invitation : nous envoyons un lien personnel
-- d'inscription (API Ruul POST /connect, ruul_connect.lienRuul) par email, et le même lien est sur le dashboard (et sur la
-- page Join pour ses posteurs) ; l'OS voit seul quand le compte est prêt (plus de « It's done »). Ruul peut se faire plus tard, avant la
-- première paie. Un seul `update` du texte de cette réponse (id de 0702, réécrite par 0804). Rien d'autre.
--
-- Retour arrière (le texte d'avant, mis par 0804) :
--   update public.reponses_officielles set reponse = $t$Within 24 hours you receive an invitation email from Ruul. Create your account FROM that email, with the email address shown on your dashboard. Then verify your ID, add your bank account and click It's done on your dashboard. Already have a Ruul account with another email? Reply with that email: we update it on our side and Ruul sends you a new invitation. The code is sent by Ruul (click "Resend code", check your spam folder).$t$, maj_at = now()
--    where id = 'b3a63f77-819f-4ee4-9bc4-ecf01d3a2b2a';

update public.reponses_officielles set reponse = $t$You don't need to wait for an email from Ruul: we send you your personal Ruul link by email, and the same link is on your dashboard (button « Open my Ruul setup »). Open it, create your account with the email address shown on your dashboard, verify your ID (ID + selfie) and add your bank account. We see it on our side as soon as your account is ready: nothing else to click. Ruul isn't required to start posting, only to get paid: do it before your first pay. Already have a Ruul account with another email? Reply with that email: we update it on our side. The code is sent by Ruul (click "Resend code", check your spam folder).$t$, maj_at = now()
 where id = 'b3a63f77-819f-4ee4-9bc4-ecf01d3a2b2a';
