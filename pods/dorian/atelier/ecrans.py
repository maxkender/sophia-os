# Usage : python3 atelier/ecrans.py de it pt-BR   (en : écrit des *-test.jpg pour caler)
# Traduit les écrans Sophia du podz 16 (accueil, quiz, cours) : efface le texte anglais et le réécrit en Plus Jakarta Sans.
import sys
from PIL import Image, ImageDraw, ImageFont
import os
R=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
D=os.path.join(R,'assets','sophia')+'/'
F={w:os.path.join(R,'polices',f'PlusJakartaSans-{w}.ttf') for w in (400,500,600,700)}
def font(w,s): return ImageFont.truetype(F[w],s)
def fit(en,w,width):
    # taille dont la largeur d'encre de `en` vaut `width`
    best=None
    for s10 in range(100,500):
        s=s10/10; f=font(w,s); b=f.getbbox(en)
        if b[2]-b[0]>=width: return s
    return 50
class E:
    def __init__(s,f): s.im=Image.open(D+f).convert('RGB'); s.d=ImageDraw.Draw(s.im)
    def efface(s,box,c=(255,255,255)): s.d.rectangle(box,fill=c)
    def texte(s,t,w,size,xy,c,ancre='l',top=None):
        f=font(w,size); b=f.getbbox(t)  # b relatif à l'origine 'la'
        x,y=xy
        if ancre=='c': x=x-(b[2]-b[0])/2-b[0]
        else: x=x-b[0]
        # y = haut de la capitale : aligne sur le haut de 'H'
        hb=f.getbbox('H'); xx=x; esp=f.getlength(' ')+size*0.09
        for i,m in enumerate(t.split(' ')):
            s.d.text((xx,y-hb[1]),m,font=f,fill=c); xx+=f.getlength(m)+esp
        return x+b[0], x+b[0]+s.largeur(t,w,size)
    def largeur(s,t,w,size):
        f=font(w,size); ms=t.split(' ')
        return sum(f.getlength(m) for m in ms)+(len(ms)-1)*(f.getlength(' ')+size*0.09)-f.getbbox(t)[0]

T={
 'en':dict(foryou='For you',following='Following',science='Science',titre='Why do we dream?',sous=['You spend about six years of your life','dreaming. And you forget nearly all of it.'],team='The Sophia team',
   cat='SCIENCE · QUESTION 6 OF 8',q=['Which element, building up in','the core of a massive star,','signals its collapse?'],opts=['Carbon','Hydrogen','Helium','Iron'],
   fini='Course complete!',sci='Science',xp='· 62 to LVL 5',earned='+10 XP earned',like='Like this course',follow='Follow Muhamm...'),
 'de':dict(foryou='Für dich',following='Folge ich',science='Wissenschaft',titre='Warum träumen wir?',sous='Du träumst etwa sechs Jahre deines Lebens. Und vergisst fast alles davon.',team='Das Sophia-Team',
   cat='WISSENSCHAFT · FRAGE 6 VON 8',q=['Welches Element im Kern eines','massereichen Sterns kündigt','seinen Kollaps an?'],opts=['Kohlenstoff','Wasserstoff','Helium','Eisen'],
   fini='Kurs abgeschlossen!',sci='Wissenschaft',xp='· 62 bis LVL 5',earned='+10 XP verdient',like='Gefällt mir',follow='Muhamm... folgen'),
 'it':dict(foryou='Per te',following='Seguiti',science='Scienze',titre='Perché sogniamo?',sous='Passi circa sei anni della tua vita a sognare. E dimentichi quasi tutto.',team='Il team di Sophia',
   cat='SCIENZE · DOMANDA 6 DI 8',q=['Quale elemento, accumulandosi','nel nucleo di una stella massiccia,','ne annuncia il collasso?'],opts=['Carbonio','Idrogeno','Elio','Ferro'],
   fini='Corso completato!',sci='Scienze',xp='· 62 al LVL 5',earned='+10 XP guadagnati',like='Mi piace',follow='Segui Muhamm...'),
 'pt-BR':dict(foryou='Para você',following='Seguindo',science='Ciência',titre='Por que sonhamos?',sous='Você passa uns seis anos da vida sonhando. E esquece quase tudo.',team='Equipe Sophia',
   cat='CIÊNCIA · PERGUNTA 6 DE 8',q=['Qual elemento, acumulado no','núcleo de uma estrela massiva,','anuncia o seu colapso?'],opts=['Carbono','Hidrogênio','Hélio','Ferro'],
   fini='Curso concluído!',sci='Ciência',xp='· 62 para o LVL 5',earned='+10 XP ganhos',like='Curtir curso',follow='Seguir Muhamm...'),
'tr':dict(foryou='Senin için',following='Takip',science='Bilim',titre='Neden rüya görürüz?',sous='Ömrünün yaklaşık altı yılı rüyada geçer. Ve neredeyse hepsini unutursun.',team='Sophia ekibi',
   cat='BİLİM · SORU 6 / 8',q=['Büyük kütleli bir yıldızın','çekirdeğinde biriken hangi element','çöküşünü haber verir?'],opts=['Karbon','Hidrojen','Helyum','Demir'],
   fini='Kurs tamamlandı!',sci='Bilim',xp='· LVL 5 için 62',earned='+10 XP kazanıldı',like='Kursu beğen',follow='Muhamm... takip et'),
 'sv':dict(foryou='För dig',following='Följer',science='Vetenskap',titre='Varför drömmer vi?',sous='Du drömmer bort ungefär sex år av ditt liv. Och glömmer nästan allt.',team='Sophia-teamet',
   cat='VETENSKAP · FRÅGA 6 AV 8',q=['Vilket grundämne, som byggs upp','i kärnan av en massiv stjärna,','varslar om dess kollaps?'],opts=['Kol','Väte','Helium','Järn'],
   fini='Kursen klar!',sci='Vetenskap',xp='· 62 till LVL 5',earned='+10 XP intjänat',like='Gilla kursen',follow='Följ Muhamm...'),
 'nl':dict(foryou='Voor jou',following='Volgend',science='Wetenschap',titre='Waarom dromen we?',sous='Je droomt ongeveer zes jaar van je leven. En je vergeet bijna alles.',team='Het Sophia-team',
   cat='WETENSCHAP · VRAAG 6 VAN 8',q=['Welk element, opgehoopt in','de kern van een zware ster,','kondigt zijn ineenstorting aan?'],opts=['Koolstof','Waterstof','Helium','IJzer'],
   fini='Cursus voltooid!',sci='Wetenschap',xp='· 62 tot LVL 5',earned='+10 XP verdiend',like='Vind ik leuk',follow='Volg Muhamm...'),
'hu':dict(foryou='Neked',following='Követett',science='Tudomány',titre='Miért álmodunk?',sous='Életedből nagyjából hat évet álmodással töltesz. És szinte mindet elfelejted.',team='A Sophia csapata',
   cat='TUDOMÁNY · 6. KÉRDÉS / 8',q=['Melyik elem jelzi egy nagy','tömegű csillag magjában','az összeomlást?'],opts=['Szén','Hidrogén','Hélium','Vas'],
   fini='Kurzus teljesítve!',sci='Tudomány',xp='· 62 a LVL 5-ig',earned='+10 XP megszerezve',like='Tetszik',follow='Muhamm... követése'),
}
EN=T['en']
def accueil(l):
    t=T[l]; e=E('telephone-accueil.jpg')
    # onglets
    s=fit(EN['foryou'],600,73); e.efface((100,172,215,207)); e.efface((105,212,200,218))
    x0,x1=e.texte(t['foryou'],600,s,(151,181),(19,23,24),'c')
    e.d.rounded_rectangle((x0-2,213,x1+2,217),2,fill=(52,98,214))
    e.efface((350,172,500,207))
    s2=fit(EN['following'],500,97); a,b=e.texte(t['following'],500,s2,(414,181),(110,116,128),'c')
    e.d.ellipse((b+9,186,b+16,193),fill=(52,98,214))
    # pastille Science
    s3=fit(EN['science'],600,65)
    w=e.largeur(t['science'],600,s3)
    pill=e.im.crop((64,250,178,285))
    e.d.rounded_rectangle((64,250,max(178,64+48+w+15),285),17,fill=(255,255,255),outline=(232,234,238))
    e.d.ellipse((79,262,90,273),fill=(46,184,124))
    e.texte(t['science'],600,s3,(98,260),(16,17,19))
    # titre et sous-titre
    st=fit(EN['titre'],600,255); e.efface((60,732,520,775)); e.texte(t['titre'],600,st,(69,741),(12,11,17))
    ss=fit(EN['sous'][0],400,360); e.efface((60,782,525,848))
    sous=t['sous'] if isinstance(t['sous'],list) else coupe(e,t['sous'],400,ss,440)
    assert len(sous)<=2, (l,sous)
    for i,li in enumerate(sous): e.texte(li,400,ss,(70,788+31*i),(96,97,99))
    sm=fit(EN['team'],400,131); e.efface((125,880,320,906)); e.texte(t['team'],400,sm,(131,886),(110,112,118))
    return e.im
def quiz(l):
    t=T[l]; e=E('telephone-quiz.jpg')
    icone=e.im.crop((136,195,171,228))
    sc=fit(EN['cat'],700,433-176); e.efface((130,193,460,230))
    w=e.largeur(t['cat'],700,sc); x=287-(36+6+w)/2
    e.im.paste(icone,(int(x),195)); e.texte(t['cat'],700,sc,(x+42,205),(52,98,214))
    sq=fit(EN['q'][1],400,480-92); e.efface((30,245,545,385))
    for i,li in enumerate(t['q']):
        while e.largeur(li,400,sq)>470: sq-=0.5
    for i,li in enumerate(t['q']): e.texte(li,400,sq,(287,253+46.5*i),(13,13,15),'c')
    so=fit(EN['opts'][0],500,74)
    for i,o in enumerate(t['opts']):
        y=444+90.3*i; e.efface((66,y-8,300,y+26)); e.texte(o,500,so,(70,y),(21,20,25))
    return e.im
def cours(l):
    t=T[l]; e=E('telephone-cours.jpg')
    sf=fit(EN['fini'],500,314); e.efface((60,552,515,602))
    while e.largeur(t['fini'],500,sf)>440: sf-=0.5
    e.texte(t['fini'],500,sf,(287,560),(5,8,13),'c')
    ss=fit(EN['sci'],600,86); e.efface((130,655,330,685)); e.texte(t['sci'],600,ss,(135,661),(16,17,21))
    # « · 62 to LVL 5 » : garder « 98 XP »
    sx=fit('98 XP',700,52); e.efface((126,708,330,736))
    e.texte(t['xp'],400,ss*0.92,(130,715),(110,114,122))
    se=fit(EN['earned'],700,126); w=e.largeur(t['earned'],700,se)
    e.efface((60,768,330,818))
    e.d.rounded_rectangle((70,776,70+17+w+18,811),17,fill=(250,238,197))
    e.texte(t['earned'],700,se,(87,787),(76,59,3))
    sl=fit(EN['like'],600,155); e.efface((100,880,272,914)); e.texte(t['like'],600,sl,(106,888),(10,11,16))
    sw=fit(EN['follow'],600,144); e.efface((355,882,518,912))
    while e.largeur(t['follow'],600,sw)>150: sw-=0.5
    e.texte(t['follow'],600,sw,(361,889),(13,14,18))
    return e.im
def coupe(e,t,w,s,larg):
    li=[];cur=''
    for m in t.split():
        x=(cur+' '+m).strip()
        if e.largeur(x,w,s)<=larg or not cur: cur=x
        else: li.append(cur); cur=m
    return li+[cur]
import os
for l in sys.argv[1:]:
    out=D+('' if l=='en' else l+'/'); os.makedirs(out,exist_ok=True)
    suf='-test' if l=='en' else ''
    for n,fn in [('accueil',accueil),('quiz',quiz),('cours',cours)]:
        fn(l).save(out+f'telephone-{n}{suf}.jpg',quality=95)
