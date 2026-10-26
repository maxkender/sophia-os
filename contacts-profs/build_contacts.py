#!/usr/bin/env python3
"""Compile public faculty directories into a categorized Excel workbook."""

from __future__ import annotations

import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import unquote, urljoin

import requests
from bs4 import BeautifulSoup
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.formatting.rule import FormulaRule
from openpyxl.chart import PieChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.series import DataPoint
from openpyxl.drawing.fill import PatternFillProperties, ColorChoice
from openpyxl.chart.shapes import GraphicalProperties
from openpyxl.drawing.line import LineProperties
from openpyxl.chart.marker import DataPoint as ChartDataPoint

OUT_DIR = Path("/workspace/contacts-profs")
XLSX = OUT_DIR / "contacts_profs_universite.xlsx"
UA = {
    "User-Agent": "Mozilla/5.0 (compatible; FacultyDirectoryResearch/1.0; +https://example.local)"
}
SESSION = requests.Session()
SESSION.headers.update(UA)

MATIERES = [
    "MONDE ACTUEL",
    "HISTOIRE",
    "ART",
    "MYTHOLOGIE",
    "SCIENCES",
    "LITTERATURE",
]

COLORS = {
    "MONDE ACTUEL": "1F4E79",
    "HISTOIRE": "833C0C",
    "ART": "7030A0",
    "MYTHOLOGIE": "C45911",
    "SCIENCES": "375623",
    "LITTERATURE": "9C0006",
}

HEADER_FILL = PatternFill("solid", fgColor="1B1B1B")
HEADER_FONT = Font(bold=True, color="FFFFFF", name="Calibri", size=11)
THIN = Border(
    left=Side(style="thin", color="D9D9D9"),
    right=Side(style="thin", color="D9D9D9"),
    top=Side(style="thin", color="D9D9D9"),
    bottom=Side(style="thin", color="D9D9D9"),
)
ZEBRA = PatternFill("solid", fgColor="F7F7F7")


def fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def clean(s: str | None) -> str:
    if not s:
        return ""
    s = unquote(s)
    s = s.replace("\xa0", " ").replace("\u200b", "")
    s = re.sub(r"\s+", " ", s).strip(" ,;.-")
    return s


def clean_email(raw: str | None) -> str:
    if not raw:
        return ""
    e = unquote(raw).strip().lower()
    e = e.replace("mailto:", "").split("?")[0].strip()
    e = e.strip(" ()[]<>\"'")
    e = re.sub(r"\s+", "", e)
    if e.startswith("%20"):
        e = e[3:]
    if not re.match(r"^[\w.+-]+@[\w.-]+\.[a-z]{2,}$", e):
        return ""
    if e.endswith(".f") and not e.endswith(".fr"):
        e = e + "r"
    junk = {"gaxie@univ-paris1.fr", "valluy@univ-paris1.fr"}
    return e


def ephe_email(prenom: str, nom: str) -> str:
    p = fold(prenom).replace("'", "-").replace(" ", "-")
    n = fold(nom).replace("'", "-").replace(" ", "-")
    p = re.sub(r"[^a-z0-9-]", "", p)
    n = re.sub(r"[^a-z0-9-]", "", n)
    if not p or not n:
        return ""
    return f"{p}.{n}@ephe.psl.eu"


def get(url: str, timeout: int = 25) -> requests.Response | None:
    try:
        r = SESSION.get(url, timeout=timeout, allow_redirects=True)
        return r
    except Exception:
        return None


def add(
    rows: list[dict],
    *,
    matiere: str,
    nom: str,
    prenom: str = "",
    titre: str = "",
    specialite: str = "",
    email: str = "",
    institution: str = "",
    source: str = "",
    statut: str = "Enseignant-chercheur",
    pays: str = "France",
):
    nom = clean(nom).upper()
    prenom = clean(prenom).title() if prenom else ""
    if not nom:
        return
    if nom in {"CV", "NODE"} or nom.startswith("HTTP"):
        return
    email = clean_email(email)
    rows.append(
        {
            "Matière": matiere,
            "Nom": nom,
            "Prénom": prenom,
            "Titre / fonction": clean(titre),
            "Spécialité": clean(specialite),
            "Email": email,
            "Institution": clean(institution),
            "Statut": clean(statut),
            "Pays": pays,
            "Source": source,
        }
    )


def split_name(full: str) -> tuple[str, str]:
    full = clean(full)
    full = re.sub(r"^(M\.|Mme|Monsieur|Madame|Mlle)\s+", "", full, flags=re.I)
    parts = full.replace(",", " ").split()
    if not parts:
        return "", ""
    # LAST FIRST (Dauphine style)
    if len(parts) >= 2 and parts[0].isupper() and parts[0] not in {"DE", "DU", "DES", "LE", "LA"}:
        # could be LAST FIRST or First LAST
        if all(p[0].isupper() for p in parts if p):
            # mixed
            pass
    # Default: last token(s) after particles
    particles = {"de", "du", "des", "le", "la", "van", "von", "d'", "di", "da"}
    if len(parts) == 1:
        return parts[0], ""
    # If first word is ALL CAPS and later words look like first names
    if parts[0].isupper() and len(parts[0]) > 1 and not parts[-1].isupper():
        return parts[0], " ".join(parts[1:])
    if parts[0].isupper() and parts[1].isupper() and len(parts) == 2:
        return parts[0], parts[1].title()
    # First ... Last
    last = [parts[-1]]
    i = len(parts) - 2
    while i >= 1 and fold(parts[i]) in particles:
        last.insert(0, parts[i])
        i -= 1
    prenom = " ".join(parts[: i + 1])
    return " ".join(last), prenom


# ---------------------------------------------------------------------------
# Hardcoded contacts extracted from official faculty pages (Apify + HTML)
# ---------------------------------------------------------------------------

def science_politique() -> list[dict]:
    src = "https://sciencepolitique.pantheonsorbonne.fr/personnel-enseignant"
    inst = "Université Paris 1 Panthéon-Sorbonne — École de Science politique"
    data = [
        ("BAUDOT", "Pierre-Yves", "PR, HdR", "Science politique", "clementine.berjaud@univ-paris1.fr", "Permanent", True),
        ("BERJAUD", "Clémentine", "MCF", "Science politique", "clementine.berjaud@univ-paris1.fr", "Permanent", False),
        ("BLONDIAUX", "Loïc", "PR, HdR", "Science politique / démocratie participative", "loic.blondiaux@univ-paris1.fr", "Permanent", False),
        ("BOUTALEB", "Assia", "PR, HdR", "Science politique", "Assia.Boutaleb@univ-paris1.fr", "Permanent", False),
        ("BRISSET-FOUCAULT", "Florence", "MCF", "Science politique", "Florence.Brisset-Foucault@univ-paris1.fr", "Permanent", False),
        ("BUCHET DE NEUILLY", "Yves", "PR, HdR", "Science politique", "yves.buchet-de-neuilly@univ-paris1.fr", "Permanent", False),
        ("DAHO", "Grégory", "MCF", "Science politique", "gregory.daho@univ-paris1.fr", "Permanent", False),
        ("DOLEZ", "Bernard", "PR, HdR", "Science politique", "bernard.dolez@univ-paris1.fr", "Permanent", False),
        ("DORRONSORO", "Gilles", "PR, HdR", "Science politique", "gilles.dorronsoro@univ-paris1.fr", "Permanent", False),
        ("DULONG", "Delphine", "PR, HdR", "Science politique", "delphine.dulong@univ-paris1.fr", "Permanent", False),
        ("FRANCOIS", "Bastien", "PR, HdR", "Science politique", "bastien.francois@univ-paris1.fr", "Permanent", False),
        ("FRETEL", "Julien", "PR, HdR", "Science politique", "julien.fretel@univ-paris1.fr", "Permanent", False),
        ("GAITI", "Brigitte", "PR, HdR", "Science politique", "brigitte.gaiti@univ-paris1.fr", "Permanent", False),
        ("GEAY", "Kevin", "", "Science politique", "Kevin.Geay@univ-paris1.fr", "Permanent", False),
        ("GEORGAKAKIS", "Didier", "PR, HdR", "Science politique européenne", "didier.georgakakis@univ-paris1.fr", "Permanent", False),
        ("GERVAIS", "Julie", "MCF", "Science politique", "julie.gervais@univ-paris1.fr", "Permanent", False),
        ("GRAJALES-LOPEZ", "Jacobo", "PR, HdR", "Science politique", "jacobo.grajales@univ-paris1.fr", "Permanent", False),
        ("GROJEAN", "Olivier", "MCF", "Science politique", "olivier.grojean@univ-paris1.fr", "Permanent", False),
        ("GUIMONT", "Clémence", "MCF", "Science politique", "Clemence.Guimont@univ-paris1.fr", "Permanent", False),
        ("JEANPIERRE", "Laurent", "PR, HdR", "Science politique", "Laurent.Jeanpierre@univ-paris1.fr", "Permanent", False),
        ("KOLOPP", "Sarah", "MCF", "Science politique", "Sarah.Kolopp@univ-paris1.fr", "Permanent", False),
        ("LE PAPE", "Loïc", "MCF", "Science politique", "Loic.Le-Pape@univ-paris1.fr", "Permanent", False),
        ("MARCHESIN", "Philippe", "MCF, HdR", "Science politique", "Philippe.Marchesin@univ-paris1.fr", "Permanent", False),
        ("NAY", "Olivier", "PR, HdR", "Science politique", "olivier.nay@univ-paris1.fr", "Permanent", False),
        ("NEIHOUSER", "Marie", "MCF", "Science politique", "Marie.Neihouser@univ-paris1.fr", "Permanent", False),
        ("POMMEROLLE", "Marie-Emmanuelle", "MCF", "Science politique", "Marie-Emmanuelle.Pommerolle@univ-paris1.fr", "Permanent", False),
        ("QUERE", "Lucile", "MCF", "Science politique", "Lucile.Quere@univ-paris1.fr", "Permanent", False),
        ("ROA BASTOS", "Francisco", "MCF", "Science politique", "Francisco.Roa-Bastos@univ-paris1.fr", "Permanent", False),
        ("SACRISTE", "Guillaume", "MCF", "Science politique", "guillaume.sacriste@univ-paris1.fr", "Permanent", False),
        ("SAWICKI", "Frédéric", "PR, HdR", "Science politique", "Frederic.Sawicki@univ-paris1.fr", "Permanent", False),
        ("SOMMIER", "Isabelle", "PR, HdR", "Science politique / mouvements sociaux", "sommier@univ-paris1.fr", "Permanent", False),
        ("TAICLET", "Anne-France", "MCF", "Science politique", "anne-france.taiclet@univ-paris1.fr", "Permanent", False),
        ("VALLUY", "Jérôme", "MCF, HdR", "Science politique", "jerome.valluy@univ-paris1.fr", "Permanent", False),
        ("ZAWADZKI", "Paul", "MCF, HdR", "Science politique", "zawadzki@univ-paris1.fr", "Permanent", False),
        ("BIRNBAUM", "Pierre", "PR émérite, DrE, HdR", "Science politique", "Pierre.Birnbaum@univ-paris1.fr", "Émérite", False),
        ("DOBRY", "Michel", "PR émérite, DrE, HdR", "Science politique", "Michel.Dobry@univ-paris1.fr", "Émérite", False),
        ("DREYFUS", "Françoise", "PR émérite, DrE, HdR", "Science politique", "Francoise.Dreyfus@univ-paris1.fr", "Émérite", False),
        ("GERSTLE", "Jacques", "PR émérite, DrE, HdR", "Science politique", "Jacques.Gerstle@univ-paris1.fr", "Émérite", False),
        ("GAXIE", "Daniel", "PR émérite, DrE, HdR", "Science politique", "gaxie@univ-paris1.fr", "Émérite", False),
        ("MATONTI", "Frédérique", "PR émérite, DrE, HdR", "Science politique", "frederique.matonti@univ-paris1.fr", "Émérite", False),
        ("SIMON", "Bertrand", "PRAG, Dr", "Science politique", "bsimon@univ-paris1.fr", "PRAG", False),
        ("FERRANDO Y PUIG", "Judith", "PAST", "Science politique", "Judith.Ferrando-y-Puig@univ-paris1.fr", "PAST", False),
        ("BOURMEAU", "Sylvain", "PAST", "Science politique / journalisme", "Sylvain.Bourmeau@univ-paris1.fr", "PAST", False),
        ("TCHIOMBIANO", "Stéphanie", "MAST", "Science politique", "stephanie.tchiombiano@univ-paris1.fr", "MAST", False),
        ("ATHAYDE SAUANDAJ", "Antonio", "ATER", "Science politique", "", "ATER 2025-2026", False),
        ("DE ANDREIS", "Emma", "ATER", "Science politique", "", "ATER 2025-2026", False),
        ("SOULIE", "Floriane", "ATER", "Science politique", "", "ATER 2025-2026", False),
        ("VAUCHEZ", "Ysé", "ATER", "Science politique", "", "ATER 2025-2026", False),
        ("YU", "Shinhee", "ATER", "Science politique", "", "ATER 2025-2026", False),
        ("BUDER", "Claudia", "Doctorante contractuelle", "Science politique", "", "Doctorant·e avec mission d'enseignement", False),
        ("CHAUVOT", "Antoine", "Doctorant contractuel", "Science politique", "", "Doctorant·e avec mission d'enseignement", False),
        ("FIOLEAU", "Héloïse", "Doctorante contractuelle", "Science politique", "", "Doctorant·e avec mission d'enseignement", False),
        ("GOGNIAT", "Léa", "Doctorante contractuelle", "Science politique", "", "Doctorant·e avec mission d'enseignement", False),
        ("GRINDARD", "Robin", "Doctorant contractuel", "Science politique", "", "Doctorant·e avec mission d'enseignement", False),
        ("LIETAERT", "Solenn", "Doctorante contractuelle", "Science politique", "", "Doctorant·e avec mission d'enseignement", False),
        ("SHARAF", "Youssef", "Doctorant contractuel", "Science politique", "", "Doctorant·e avec mission d'enseignement", False),
    ]
    rows = []
    for nom, prenom, titre, spec, email, statut, skip_bad in data:
        # Baudot listing reused Berjaud's mailto on the page; keep name, leave email blank if mismatched
        if skip_bad:
            email = ""
        add(rows, matiere="MONDE ACTUEL", nom=nom, prenom=prenom, titre=titre,
            specialite=spec, email=email, institution=inst, source=src, statut=statut)
    return rows


def aphec() -> list[dict]:
    src = "https://aphec.fr/conseil-administration/"
    inst = "APHEC — Association des professeurs des classes préparatoires économiques et commerciales"
    bureau = [
        ("JOYEUX", "Alain", "Président", "alain.joyeux@aphec.fr"),
        ("BONNET", "Véronique", "Vice-présidente", "veronique.bonnet@aphec.fr"),
        ("PIRES", "Christine", "Vice-présidente", "christine.pires@aphec.fr"),
        ("KOHLER", "Philippe", "Trésorier", "philippe.kohler@aphec.fr"),
        ("DESIDERI BRACCO", "Anne", "Vice-trésorière", "anne.desideribracco@aphec.fr"),
        ("CAPOBIANCO", "Marie-Christine", "Secrétaire générale", "mariechristine.capobianco@aphec.fr"),
    ]
    ca = [
        ("BARBARO", "Sophie", "sophie.barbaro@aphec.fr"),
        ("BAYLE", "Cécile", "cecile.bayle@aphec.fr"),
        ("BRETECHER", "Frédéric", "frederic.bretecher@aphec.fr"),
        ("ENSELME", "Xavier", "xavier.enselme@aphec.fr"),
        ("GENDULPHE", "Matthieu", "matthieu.gendulphe@aphec.fr"),
        ("LASSERRE", "Mélanie", "melanie.lasserre@aphec.fr"),
        ("LUCCHINI", "Nathalie", "nathalie.lucchini@aphec.fr"),
        ("MUNIER", "Frédéric", "frederic.munier@aphec.fr"),
        ("NEYMANN", "Anne", "anne.neymann@aphec.fr"),
        ("PEHAUT", "Gérard", "gerard.pehaut@aphec.fr"),
        ("VIRET LANGE", "Séverine", "severine.viretlange@aphec.fr"),
        ("VISCOGLIOSI", "Christophe", "christophe.viscogliosi@aphec.fr"),
        ("SPRIET", "Jean-Philippe", "jeanphilippe.spriet@aphec.fr"),
        ("BAILLY-DELAMARE", "Anaïs", "anais.baillydelamare@aphec.fr"),
        ("GUERIN", "Clément", "clement.guerin@aphec.fr"),
        ("PIERROT", "Katia", "katia.pierrot@aphec.fr"),
        ("SIMON-DOUTRELUINGNE", "Pascal", "pascal.simon.d@aphec.fr"),
    ]
    rows = []
    for nom, prenom, titre, email in bureau:
        add(rows, matiere="MONDE ACTUEL", nom=nom, prenom=prenom, titre=titre,
            specialite="Classes préparatoires économiques et commerciales",
            email=email, institution=inst, source=src, statut="Bureau APHEC")
    for nom, prenom, email in ca:
        add(rows, matiere="MONDE ACTUEL", nom=nom, prenom=prenom,
            titre="Membre du conseil d'administration",
            specialite="Classes préparatoires économiques et commerciales",
            email=email, institution=inst, source=src, statut="CA APHEC")
    add(rows, matiere="MONDE ACTUEL", nom="HATAT", prenom="Florian",
        titre="Chargé de mission", specialite="Classes préparatoires économiques et commerciales",
        email="florian.hatat@aphec.fr", institution=inst, source=src, statut="Chargé de mission")
    return rows


def paris_cite() -> list[dict]:
    rows = []
    # UFR direction — enseignants parmi les contacts
    src = "https://u-paris.fr/ghes/contacts/"
    inst = "Université Paris Cité — UFR GHES"
    add(rows, matiere="MONDE ACTUEL", nom="DAHECH", prenom="Salem",
        titre="Directeur de l'UFR", specialite="Géographie",
        email="salem.dahech@u.paris.fr", institution=inst, source=src, statut="Direction UFR")
    add(rows, matiere="HISTOIRE", nom="GILLOT", prenom="Laurence",
        titre="Directrice-adjointe de l'UFR (Histoire)", specialite="Histoire",
        email="laurence.gillot@u-paris.fr", institution=inst, source=src, statut="Direction UFR")
    add(rows, matiere="MONDE ACTUEL", nom="BERTA", prenom="Nathalie",
        titre="Directrice-adjointe de l'UFR (Économie)", specialite="Économie",
        email="nathalie.berta@u-paris.fr", institution=inst, source=src, statut="Direction UFR")
    add(rows, matiere="MONDE ACTUEL", nom="GROUIEZ", prenom="Pascal",
        titre="Président du Conseil scientifique de l'UFR", specialite="Économie",
        email="pascal.grouiez@u-paris.fr", institution=inst, source=src, statut="Conseil scientifique")

    src_h = "https://u-paris.fr/ghes/contacts-du-departement-dhistoire/"
    inst_h = "Université Paris Cité — Département d'Histoire"
    for nom, prenom, titre, email in [
        ("MONTLAHUC", "Pascal", "Directeur du département", "dir.dep.hist@univ-paris-diderot.fr"),
        ("ZANETTI", "François", "Directeur des études de Licence", "francois.zanetti@u-paris.fr"),
        ("GILLOT", "Laurence", "Responsable de la L1", "laurence.gillot@u-paris.fr"),
        ("DELZANT", "Jean-Baptiste", "Responsable de la L2", "jean-baptiste.delzant@u-paris.fr"),
        ("HOUBRE", "Gabrielle", "Responsable de la L3", "gabrielle.houbre@u-paris.fr"),
        ("CLAUSTRE", "Julie", "Directrice du Master Histoire, civilisations, patrimoine", ""),
    ]:
        add(rows, matiere="HISTOIRE", nom=nom, prenom=prenom, titre=titre,
            specialite="Histoire", email=email, institution=inst_h, source=src_h)

    src_g = "https://u-paris.fr/ghes/contacts-departement-geographie/"
    inst_g = "Université Paris Cité — Département de Géographie"
    for nom, prenom, titre, email, spec in [
        ("GIGOT", "Mathieu", "Co-directeur du département", "departement.geo.ghes@u-pariscite.fr", "Géographie"),
        ("VACCHIANI-MARCUZZO", "Céline", "Co-directrice du département", "departement.geo.ghes@u-pariscite.fr", "Géographie"),
        ("GRASLAND", "Claude", "Responsable des études de Licence", "claude.grasland@parisgeo.cnrs.fr", "Géographie"),
        ("DE MILLEVILLE", "Lucile", "Responsable de la L1", "lucile.de-milleville@u-pariscite.fr", "Géographie"),
        ("DORON", "Adrien", "Responsable de la L2", "adrien.doron@u-pariscite.fr", "Géographie"),
        ("MADELIN", "Malika", "Responsable de la L3", "malika.madelin@u-pariscite.fr", "Géographie"),
        ("DELBART", "Nicolas", "Directeur du Master GAED", "nicolas.delbart@u-pariscite.fr", "Géographie, aménagement, environnement"),
        ("MAGNIN", "Éric", "Directeur du Master MÉCI", "eric.magnin@u-pariscite.fr", "Études, conseil et intervention"),
    ]:
        add(rows, matiere="MONDE ACTUEL", nom=nom, prenom=prenom, titre=titre,
            specialite=spec, email=email, institution=inst_g, source=src_g)

    src_e = "https://u-paris.fr/ghes/contacts-du-departement-deconomie/"
    inst_e = "Université Paris Cité — Département d'Économie"
    for nom, prenom, titre, email in [
        ("BERTHE", "Alexandre", "Directeur du département", "alexandre.berthe@u-paricite.fr"),
        ("SIGNORETTO", "Camille", "Directrice des études de Licence", "camille.signoretto@u-pariscite.fr"),
        ("HENNEGUELLE", "Anaïs", "Responsable de la L1", "anais.henneguelle@u-pariscite.fr"),
        ("METEREAU", "Renaud", "Responsable de la L2", "renaud.meterau@u-pariscite.fr"),
        ("REBERIOUX", "Antoine", "Responsable de la L3", "antoine.reberioux@u-pariscite.fr"),
    ]:
        add(rows, matiere="MONDE ACTUEL", nom=nom, prenom=prenom, titre=titre,
            specialite="Économie", email=email, institution=inst_e, source=src_e)
    return rows


def histoire_sorbonne() -> list[dict]:
    src = "https://lettres.sorbonne-universite.fr/faculte-des-lettres/ufr/ufr-histoire/personnels-enseignement-et-de-recherche-ufr-histoire"
    inst = "Sorbonne Université — UFR Histoire"
    rows = []
    pr = [
        ("ABAD", "Reynald", "PR", "Histoire moderne", "reynald.abad@sorbonne-universite.fr"),
        ("BELY", "Lucien", "PR", "Histoire moderne", ""),
        ("BODI", "Daniel", "PR", "Histoire ancienne", "Danielbodi@gmail.com"),
        ("BOUDON", "Jacques-Olivier", "PR", "Histoire contemporaine", ""),
        ("CABY", "Cécile", "PR", "Histoire médiévale", "cecile.caby@sorbonne-universite.fr"),
        ("CASEAU", "Béatrice", "PR", "Histoire byzantine", "bacaseau@yahoo.fr"),
        ("CHALINE", "Olivier", "PR", "Histoire moderne de l'Europe centrale", "olivier.chaline@sorbonne-universite.fr"),
        ("CHAPOUTOT", "Johann", "PR", "Histoire contemporaine", "johann.chapoutot@sorbonne-universite.fr"),
        ("COLTELLONI-TRANNOY", "Michèle", "PR", "Histoire de l'Antiquité romaine", ""),
        ("DARD", "Olivier", "PR", "Histoire contemporaine", "olivierdard@orange.fr"),
        ("DE CASTELNAU L'ESTOILE", "Charlotte", "PR", "Histoire moderne", "charlotte.de_castelnau_lestoile@sorbonne-universite.fr"),
        ("DUMEZIL", "Bruno", "PR", "Histoire médiévale", "bruno.dumezil@sorbonne-universite.fr"),
        ("FORCADE", "Olivier", "PR", "Histoire contemporaine", "olivier.forcade@sorbonne-universite.fr"),
        ("GRISET", "Pascal", "PR", "Histoire contemporaine", "pascalgriset@yahoo.fr"),
        ("HELARY", "Xavier", "PR", "Histoire médiévale", ""),
        ("HOUTE", "Arnaud-Dominique", "PR", "Histoire contemporaine", "arnaud.houte@sorbonne-universite.fr"),
        ("LACHAUD", "Frédérique", "PR", "Histoire médiévale", "frederique.lachaud@sorbonne-universite.fr"),
        ("LEFEVRE", "François", "PR", "Histoire grecque", "francois.lefevre@sorbonne-universite.fr"),
        ("LE ROUX", "Nicolas", "PR", "Histoire moderne", "nicolas.le_roux@sorbonne-universite.fr"),
        ("LEROUXEL", "François", "PR", "Histoire ancienne", "francois.lerouxel@sorbonne-universite.fr"),
        ("LETTERON", "Roseline", "PR", "Droit public", ""),
        ("MARCELLESI", "Marie-Christine", "PR", "Histoire grecque", "marie-christine.marcellesi@sorbonne-universite.fr"),
        ("MAYEUR-JAOUEN", "Catherine", "PR", "Histoire contemporaine", "mayeur-jaouen@wanadoo.fr"),
        ("MENSION-RIGAU", "Éric", "PR", "Histoire contemporaine", "ericmensionrigau@yahoo.fr"),
        ("MOEGLIN", "Jean-Marie", "PR", "Histoire médiévale", "jean-marie.moeglin@sorbonne-universite.fr"),
        ("POUMAREDE", "Géraud", "PR", "Histoire moderne", "geraud.poumarede@sorbonne-universite.fr"),
        ("RUGGIU", "François-Joseph", "PR", "Histoire moderne", "francois-joseph.ruggiu@sorbonne-universite.fr"),
        ("SALAMITO", "Jean-Marie", "PR", "Histoire des religions", "jeanmarie.salamito@gmail.com"),
        ("SOUSSEN", "Claire", "PR", "Histoire médiévale", "claire.soussen@sorbonne-universite.fr"),
        ("TALLET", "Pierre", "PR", "Égyptologie (en détachement)", "pierre.tallet@sorbonne-universite.fr"),
        ("TALLON", "Alain", "PR", "Histoire moderne", "alain.tallon@sorbonne-universite.fr"),
        ("TILLIER", "Mathieu", "PR", "Histoire médiévale", "mathieu.tillier@sorbonne-universite.fr"),
        ("TRAINA", "Giusto", "PR", "Histoire romaine", ""),
        ("WARLOUZET", "Laurent", "PR", "Histoire contemporaine", "laurent.warlouzet@sorbonne-universite.fr"),
        ("WILLIOT", "Jean-Pierre", "PR", "Histoire contemporaine", "jpwilliot@wanadoo.fr"),
        ("BENEDETTI", "Arnaud", "Professeur associé", "", "arnaud.benedetti@inserm.fr"),
        ("GALLAND", "Bruno", "Professeur associé", "", "bruno.galland@rhone.fr"),
        ("LASCONJARIAS", "Guillaume", "Professeur associé", "", ""),
    ]
    mcf_hdr = [
        ("DAVION", "Isabelle", "MCF HDR", "Histoire contemporaine", "isabelle.davion@sorbonne-universite.fr"),
        ("DUNYACH", "Jean-François", "MCF HDR", "Histoire moderne", ""),
        ("DUTOUR", "Thierry", "MCF HDR", "Histoire médiévale", ""),
        ("JETTOT", "Stéphane", "MCF HDR", "Histoire moderne", "stephane.jettot@sorbonne-universite.fr"),
        ("LAMY", "Marielle", "MCF HDR", "Histoire médiévale", ""),
        ("LE PERSON", "Xavier", "MCF HDR", "Histoire moderne", "xavier.le_person@sorbonne-universite.fr"),
        ("PONT", "Anne-Valérie", "MCF HDR", "Histoire ancienne", "anne-valerie.pont-boulay@sorbonne-universite.fr"),
        ("QUEYREL", "Anne", "MCF HDR", "Histoire ancienne", "anne.queyrel@sorbonne-universite.fr"),
        ("ROBIN", "Isabelle", "MCF HDR", "Histoire moderne", "isabelle.robin@sorbonne-universite.fr"),
    ]
    mcf = [
        ("BARANOVA DEBBAGI", "Tatiana", "MCF", "Histoire moderne", "debbagi_baranova@yahoo.fr"),
        ("BRESC", "Cécile", "MCF", "Histoire médiévale", "ratepenade@yahoo.fr"),
        ("CARBONNET", "Adrien", "MCF", "Histoire médiévale", "adrien.carbonnet@sorbonne-universite.fr"),
        ("COQUET", "Édouard", "MCF", "", "edouard.coquet@sorbonne-universite.fr"),
        ("CORNILLON", "Jonathan", "MCF", "Histoire ancienne", "jonathan-cornillon@orange.fr"),
        ("COUVENHES", "Jean-Christophe", "MCF", "Histoire ancienne", ""),
        ("DASQUE", "Isabelle", "MCF", "Histoire contemporaine", ""),
        ("DUPONT", "Anne-Laure", "MCF", "Histoire contemporaine", ""),
        ("DURAND", "Antonin", "MCF", "Histoire contemporaine", ""),
        ("FAUGERON", "Fabien", "MCF", "Histoire médiévale", ""),
        ("GIUNTA", "Alexandre", "MCF", "Histoire médiévale", "alexandre.giunta@sorbonne-universite.fr"),
        ("GUIEU-COPPOLANI", "Ariane", "MCF", "Histoire ancienne", "ariane.guieu-coppolani@sorbonne-universite.fr"),
        ("HAAN", "Bertrand", "MCF", "Histoire moderne", ""),
        ("HEME DE LACOTTE", "Rémy", "MCF", "Histoire contemporaine", "remy.heme_de_lacotte@sorbonne-universite.fr"),
        ("LAMY", "Claire", "MCF", "Histoire médiévale", "claire.lamy@sorbonne-universite.fr"),
        ("LOUZON", "Victor", "MCF", "Histoire contemporaine", ""),
        ("MAELSTAF", "Geneviève", "MCF", "Histoire contemporaine", ""),
        ("MILOR", "Alice", "MCF", "Histoire contemporaine", ""),
        ("MOMZIKOFF", "Sophie", "MCF", "Histoire contemporaine", "sophie.momzikoff@sorbonne-universite.fr"),
        ("PETITJEAN", "Maxime", "MCF", "", "maxime.petitjean@sorbonne-universite.fr"),
        ("PIALOUX", "Albane", "MCF", "Histoire moderne", "apialoux@hotmail.com"),
        ("PIQUET", "Caroline", "MCF", "Histoire contemporaine", ""),
        ("PRETEUX", "Franck", "MCF", "Histoire ancienne", ""),
        ("RELATS MONTSERRAT", "Félix", "MCF", "Histoire ancienne", "felix.relats_montserrat@sorbonne-universite.fr"),
        ("RICHARD", "Nicolas", "MCF", "Histoire moderne", ""),
        ("ROMANACCE", "François-Xavier", "MCF", "Histoire ancienne", "fr.romanacce@yahoo.fr"),
        ("SHIMAHARA", "Sumi", "MCF", "Histoire médiévale", "sumi.shimahara@sorbonne-universite.fr"),
        ("SOMAGLINO", "Claire", "MCF", "Histoire ancienne", ""),
        ("SOPRACASA", "Alessio", "MCF", "Histoire médiévale", "alessio.sopracasa@sorbonne-universite.fr"),
        ("TELLIEZ", "Romain", "MCF", "Histoire médiévale", "romain.telliez@sorbonne-universite.fr"),
        ("VAJDA", "Marie-Françoise", "MCF", "Histoire médiévale", "marie-francoise.vajda@sorbonne-universite.fr"),
    ]
    prag = [
        ("DUVAL", "Nathalie", "PRAG", "Histoire contemporaine", ""),
        ("GREGORCZYK-PIERRE", "Séverine", "PRAG", "Histoire ancienne", ""),
        ("PAYEN", "Guillaume", "PRAG", "Anglais pour historiens", ""),
        ("SAINT-GILLES", "Laurence", "PRAG", "Histoire contemporaine", ""),
    ]
    ater = [
        ("ANRICH", "Inès", "ATER", "", "ines.anrich@sorbonne-universite.fr"),
        ("GALASSO", "Eugénie", "ATER", "", "eugenie.galasso@sorbonne-universite.fr"),
    ]
    for group, statut in [
        (pr, "PR / associé"),
        (mcf_hdr, "MCF HDR"),
        (mcf, "MCF"),
        (prag, "PRAG / PRCE"),
        (ater, "ATER"),
    ]:
        for nom, prenom, titre, spec, email in group:
            matiere = "MYTHOLOGIE" if "religion" in fold(spec) else "HISTOIRE"
            if nom == "SALAMITO":
                matiere = "MYTHOLOGIE"
            add(rows, matiere=matiere, nom=nom, prenom=prenom, titre=titre,
                specialite=spec or "Histoire", email=email, institution=inst,
                source=src, statut=statut)
    return rows


def litterature_sorbonne() -> list[dict]:
    src = "https://lettres.sorbonne-universite.fr/faculte-des-lettres/ufr/ufr-de-litterature-francaise-et-comparee/personnels-enseignement-et-de"
    inst = "Sorbonne Université — UFR de Littérature française et comparée"
    rows = []
    pr = [
        ("ABRAMOVICI", "Jean-Christophe", "PR", "Littérature française du XVIIIe siècle", "Jean-Christophe.Abramovici@sorbonne-universite.fr"),
        ("BASCH", "Sophie", "PR", "Littérature française des XIXe et XXe siècles", "sophie.basch@sorbonne-universite.fr"),
        ("BELIN", "Olivier", "PR", "Littérature française", ""),
        ("BOUCHARDON", "Marianne", "PR", "Littérature française du XXe siècle", ""),
        ("BRET-VITOZ", "Renaud", "PR", "Littérature française du XVIIIe siècle", "renaudbretvitoz@gmail.com"),
        ("DECOUT", "Maxime", "PR", "Littérature française du XXe siècle", ""),
        ("DEL LUNGO", "Andrea", "PR", "Littérature française des XIXe et XXe siècles", "adellungo@free.fr"),
        ("FONKOUA", "Romuald", "PR", "Littératures francophones", "romualdfonkoua@yahoo.com"),
        ("FRANCO", "Bernard", "PR", "Littérature comparée", "bernard.franco1@gmail.com"),
        ("GELY", "Véronique", "PR", "Littératures comparées", "veronique.gely@wanadoo.fr"),
        ("GLAUDES", "Pierre", "PR", "Littérature française du XIXe siècle", "pierre.glaudes@wanadoo.fr"),
        ("GOEURY", "Julien", "PR", "Littérature française du XVIe siècle", "julien.goeury@club-internet.fr"),
        ("HENIN", "Emmanuelle", "PR", "Littérature comparée", "henin.emmanuelle@gmail.com"),
        ("HOVASSE", "Jean-Marc", "PR", "Littérature française du XIXe siècle", "jmhovasse@gmail.com"),
        ("JEANNELLE", "Jean-Louis", "PR", "Littérature française du XXe siècle", "jeannelle@fabula.org"),
        ("LOUETTE", "Jean-François", "PR", "Littérature française du XXe siècle", "jeanfrancois.louette@wanadoo.fr"),
        ("LOUVAT", "Bénédicte", "PR", "Littérature française du XVIIe siècle", "benedicte.louvat@neuf.fr"),
        ("MARTIN", "Christophe", "PR", "Littérature du XVIIIe siècle", "christophe.martin@sorbonne-universite.fr"),
        ("MASSON", "Jean-Yves", "PR", "Littérature comparée", "massonjeanyves@gmail.com"),
        ("METAYER", "Guillaume", "Directeur de recherche CNRS", "Littérature française et comparée", "gme.metayer@gmail.com"),
        ("MONFERRAN", "Jean-Charles", "PR", "Littérature française du XVIe siècle", "jcharles.monferran@free.fr"),
        ("NAUGRETTE", "Florence", "PR", "Littérature française des XIXe et XXe siècles", "florence.naugrette@sorbonne-universite.fr"),
        ("NOILLE", "Christine", "PR", "Littérature française du XVIIe siècle", "christine.noille@sorbonne-universite.fr"),
        ("PHILIPPOT", "Didier", "PR", "Littérature française du XIXe siècle", "philippot.didier@wanadoo.fr"),
        ("PRADEAU", "Christophe", "PR", "Littérature française du XXe siècle", "pradeau.christophe@orange.fr"),
        ("SIMONET-TENANT", "Françoise", "PR", "Littérature française", "francoise.simonet-tenant6@orange.fr"),
        ("TOMICHE", "Anne", "PR", "Littérature comparée", "tomicheanne@gmail.com"),
        ("VALETTE", "Jean-René", "PR", "Littérature française du Moyen Âge", "jrvalette@gmail.com"),
    ]
    mcf_hdr = [
        ("ALIX", "Florian", "MCF HDR", "Littératures francophones", "florian.alix.13@gmail.com"),
        ("CHADELAT", "Jean-Marc", "MCF HDR", "Littérature anglophone", "jmchadelat@free.fr"),
        ("LYON-CAEN", "Boris", "MCF HDR", "Littérature française", "boris.lyoncaen@gmail.com"),
        ("MARCHAND", "Sophie", "MCF HDR", "Littérature française", "marchand.soph@wanadoo.fr"),
        ("DE SAINT-CHERON", "François", "MCF HDR", "Littérature française", "fdst.cheron@gmail.com"),
        ("SARFATI-LANTER", "Judith", "MCF HDR", "Littérature comparée", "judithsl@yahoo.com"),
        ("TARRETE", "Alexandre", "MCF HDR", "Littérature française", "alexandre.tarrete@sorbonne-universite.fr"),
        ("VANDEN ABEELE", "Sophie", "MCF HDR", "Littérature française", "Sophie.Vanden_Abeele@sorbonne-universite.fr"),
        ("VEDRINE", "Hélène", "MCF HDR", "Littérature française", "helene.vedrine@sorbonne-universite.fr"),
    ]
    mcf = [
        ("ALBERT", "Sophie", "MCF", "Littérature française", "sophie.albert@sorbonne-universite.fr"),
        ("AMSTUTZ", "Delphine", "MCF", "Littérature française", "amstutz.delphine@wanadoo.fr"),
        ("AUDE", "Nicolas", "MCF", "Littérature comparée", ""),
        ("AUGAIS", "Thomas", "MCF", "Littérature française", "taugais@hotmail.com"),
        ("CAGNAT-DEBOEUF", "Constance", "MCF", "Littérature française", ""),
        ("COOPER-DENIAU", "Corinne", "MCF", "Littérature française", ""),
        ("COSTE", "Marion", "MCF", "Littératures francophones", ""),
        ("DAUPHANT", "Clotilde", "MCF", "Littérature française", "clotilde.dauphant@gmail.com"),
        ("DESARBRES", "Paul-Victor", "MCF", "Littérature française du XVIe siècle", "pvdesarbres@gmail.com"),
        ("DESVIGNES", "Stéphane", "MCF", "Littérature française", "stdesvignes@yahoo.fr"),
        ("DUCREY", "Anne", "MCF", "Littérature comparée", "anne.ducrey1907@gmail.com"),
        ("ENRIQUEZ", "Romain", "MCF", "Littérature française", ""),
        ("FLEPP", "Pauline", "MCF", "Littérature française", ""),
        ("FORTIN", "Damien", "MCF", "Littérature française", "dmn.fortin@gmail.com"),
        ("GALLET", "Olivier", "MCF", "Littérature française", "olivier6.gallet@gmail.com"),
        ("GAYRAUD", "Irene", "MCF", "Littérature comparée", "gayraud.irene@gmail.com"),
        ("GEHANNE-GAVOTY", "Stephanie", "MCF", "Littérature française", "stephanie.gehanne-gavoty@sorbonne-universite.fr"),
        ("GIRAUD ROLLAND", "Tiphaine", "MCF", "Littérature française", "tiphaine.rolland@gmx.fr"),
        ("GOUDMAND", "Anaïs", "MCF", "Littérature française", ""),
        ("GRIS", "Fabien", "MCF", "Littérature française", "fabiengris@yahoo.fr"),
        ("JALABERT", "Romain", "MCF", "Littérature française", "romain.jalabert@sorbonne-universite.fr"),
        ("LATIL", "Arnaud", "MCF", "Littérature française", ""),
        ("LIONETTO", "Adeline", "MCF", "Littérature française", "adelinelionetto@hotmail.com"),
        ("MONJOUR", "Servanne", "MCF", "Littérature française et humanités numériques", "servanne.monjour@gmail.com"),
        ("PERROT-CORPET", "Danielle", "MCF", "Littérature comparée", "danielle.perrot@wanadoo.fr"),
        ("SEGRESTIN", "Marthe", "MCF", "Littérature comparée", "marthe.segrestin@sorbonne-universite.fr"),
        ("VERNET", "Matthieu", "MCF", "Littérature française", "vernet@fabula.org"),
        ("DE VITRY D'AVAUCOURT", "Alexandre", "MCF", "Littérature française", "adevitry@gmail.com"),
        ("YVERNAULT", "Virginie", "MCF", "Littérature française", ""),
        ("CERQUIGLINI", "Blanche", "MCF associée", "Master CREM", ""),
        ("TERCIER", "Karine", "MCF associée", "Master CORREM", ""),
    ]
    prag = [
        ("BOUKHROUFA", "Manon", "PRAG", "Littérature française", ""),
        ("ETCHEVERRY", "Michel", "PRAG", "Littérature française", ""),
        ("GUILHEMBET", "Jacques", "PRAG", "Littérature française", ""),
        ("MARTINA", "Anne", "PRAG", "Littérature française", ""),
        ("GOODCHILD", "Rebekah", "Maîtresse de langue", "Langue", ""),
    ]
    ater = [
        ("BALASSONE", "Martina"), ("CRESPIN", "Cassandre"), ("GODREUIL", "Esther"),
        ("GUEGAN", "Marie-Anaïs"), ("HENNETIER", "Alice"), ("MESGUICH", "Léo"),
        ("RUZZENE", "Lorenzo"), ("THIRIOT", "Mélissa"), ("VILQUIN", "Irène"),
    ]
    for group, statut in [(pr, "PR"), (mcf_hdr, "MCF HDR"), (mcf, "MCF"), (prag, "PRAG")]:
        for nom, prenom, titre, spec, email in group:
            add(rows, matiere="LITTERATURE", nom=nom, prenom=prenom, titre=titre,
                specialite=spec, email=email, institution=inst, source=src, statut=statut)
    for nom, prenom in ater:
        add(rows, matiere="LITTERATURE", nom=nom, prenom=prenom, titre="ATER",
            specialite="Littérature française et comparée", institution=inst, source=src, statut="ATER")
    return rows


def sociologie_sorbonne() -> list[dict]:
    src = "https://lettres.sorbonne-universite.fr/faculte-des-lettres/ufr/ufr-de-sociologie-et-informatique-pour-les-sciences-humaines/personnels"
    inst = "Sorbonne Université — UFR de Sociologie et informatique pour les sciences humaines"
    rows = []
    people = [
        ("BRONNER", "Gérald", "PR", "Croyances collectives", "gerald.bronner@sorbonne-universite.fr", "MONDE ACTUEL"),
        ("DEMEULENAERE", "Pierre", "PR", "Théorie sociologique", "pierre.demeulenaere@sorbonne-universite.fr", "MONDE ACTUEL"),
        ("MANZO", "Gianluca", "PR", "Sociologie analytique, computationnelle et des réseaux", "gianluca.manzo@sorbonne-universite.fr", "MONDE ACTUEL"),
        ("CAROF", "Solenne", "MCF", "Sociologie de la santé", "solenne.carof@sorbonne-universite.fr", "MONDE ACTUEL"),
        ("CHAUVIN", "Pierre-Marie", "MCF", "Sociologie économique et sociologie des réputations", "pierre-marie.chauvin@sorbonne-universite.fr", "MONDE ACTUEL"),
        ("DEBAILLY", "Renaud", "MCF", "Sociologie des sciences", "renaud.debailly@sorbonne-universite.fr", "MONDE ACTUEL"),
        ("JAYET", "Cyril", "MCF", "Sociologie des attitudes politiques ; stratification et mobilité sociales", "cyril.jayet@sorbonne-universite.fr", "MONDE ACTUEL"),
        ("MOSBAH-NATANSON", "Sébastien", "MCF", "Histoire de la sociologie ; sociologie des religions", "sebastien.mosbah_natanson@sorbonne-universite.fr", "MONDE ACTUEL"),
        ("TRESPEUCH", "Marie", "MCF", "Sociologie du numérique", "marie.trespeuch@sorbonne-universite.fr", "MONDE ACTUEL"),
        ("VERLEY", "Élise", "MCF", "Sociologie de l'emploi", "elise.verley@sorbonne-universite.fr", "MONDE ACTUEL"),
        ("BOLDINI", "Pascal", "PRAG", "Mathématiques et logique", "pascal.boldini@sorbonne-universite.fr", "SCIENCES"),
        ("TIRBOIS", "Thierry", "PRAG", "Sociologie du droit", "thierry.tirbois@sorbonne-universite.fr", "MONDE ACTUEL"),
        ("DEVILLERS", "Laurence", "PR", "Informatique appliquée aux sciences de l'homme", "laurence.devillers@sorbonne-universite.fr", "SCIENCES"),
        ("MONTACIE", "Claude", "PR", "Informatique appliquée aux sciences de l'homme", "claude.montacie@sorbonne-universite.fr", "SCIENCES"),
        ("EYHARABIDE", "Maria-Victoria", "MCF", "Informatique et linguistique", "maria-victoria.eyharabide@sorbonne-universite.fr", "SCIENCES"),
        ("FORT", "Karen", "MCF", "Informatique", "karen.fort@sorbonne-universite.fr", "SCIENCES"),
        ("GUERIN", "Françoise", "MCF", "Linguistique générale", "francoise.guerin@sorbonne-universite.fr", "LITTERATURE"),
        ("LEJEUNE", "Gaël", "MCF", "Informatique", "gael.lejeune@sorbonne-universite.fr", "SCIENCES"),
        ("VINCENT", "Christian", "PRAG", "Mathématiques ; statistiques", "Christian.Vincent@sorbonne-universite.fr", "SCIENCES"),
        ("STEINER", "Philippe", "PR émérite", "Sociologie économique", "philippe.steiner@paris-sorbonne.fr", "MONDE ACTUEL"),
    ]
    for nom, prenom, titre, spec, email, matiere in people:
        add(rows, matiere=matiere, nom=nom, prenom=prenom, titre=titre,
            specialite=spec, email=email, institution=inst, source=src)
    return rows


def art_sorbonne() -> list[dict]:
    src = "https://lettres.sorbonne-universite.fr/faculte-des-lettres/ufr/ufr-histoire-de-l-art-et-archeologie/personnels-enseignement-et-de"
    inst = "Sorbonne Université — UFR Histoire de l'art et archéologie"
    rows = []
    people = [
        ("BRAC DE LA PERRIERE", "Éloïse", "PR", "Archéologie et histoire de l'art islamique", "eloise.brac_de_la_perriere@sorbonne-universite.fr"),
        ("CLUZEL", "Jean-Sebastien", "PR", "Archéologie et histoire de l'art de l'Extrême-Orient, spécialité Japon", "jean-sebastien.cluzel@sorbonne-universite.fr"),
        ("FARNOUX", "Alexandre", "PR", "Archéologie et histoire de l'art grec", "alexandre.farnoux@sorbonne-universite.fr"),
        ("GADY", "Alexandre", "PR", "Histoire de l'art de l'architecture moderne", "alexandre.gady@sorbonne-universite.fr"),
        ("GINOUX", "Nathalie", "PR", "Archéologie et art celtique", "nathalie.ginoux@sorbonne-universite.fr"),
        ("GOURNAY", "Antoine", "PR", "Archéologie et histoire de l'art de l'Extrême-Orient", "antoine.gournay@sorbonne-universite.fr"),
        ("GOUZI", "Christine", "PR", "Histoire de l'art de la Renaissance et des Temps modernes", "christine.gouzi@sorbonne-universite.fr"),
        ("JOBERT", "Barthélemy", "PR", "Histoire de l'art contemporain du XIXe siècle et histoire du patrimoine", "barthelemy.jobert@sorbonne-universite.fr"),
        ("LE GALL", "Guillaume", "PR", "Histoire de la photographie XIXe-XXIe siècles", "guillaume.le_gall@sorbonne-universite.fr"),
        ("LEFEVRE", "Vincent", "PR", "Archéologie et histoire de l'art d'Asie du Sud et du Sud-Est", "vincent.lefevre@sorbonne-universite.fr"),
        ("LEPOITTEVIN", "Anne", "PR", "Histoire de l'art de la Renaissance et des Temps modernes", "anne.lepoittevin@sorbonne-universite.fr"),
        ("MAVRIDORAKIS", "Valérie", "PR", "Histoire de l'art contemporain XXe-XXIe siècles", "valerie.mavridorakis@sorbonne-universite.fr"),
        ("MICHEL D'ANNOVILLE", "Caroline", "PR", "Archéologie et histoire de l'art de l'Antiquité tardive et paléochrétien", "caroline.michel_dannoville@sorbonne-universite.fr"),
        ("MINNAERT", "Jean-Baptiste", "PR", "Architecture contemporaine", "jean-baptiste.minnaert@sorbonne-universite.fr"),
        ("MUTIN", "Benjamin", "PR", "Archéologie de l'Orient ancien", "benjamin.mutin@sorbonne-universite.fr"),
        ("PIERRE", "Arnauld", "PR", "Histoire de l'art contemporain XXe-XXIe siècles", "arnauld.pierre@sorbonne-universite.fr"),
        ("PAYRAUDEAU", "Frédéric", "PR", "Égyptologie", "frederic.payraudeau@sorbonne-universite.fr"),
        ("ROSSO", "Emmanuelle", "PR", "Archéologie et histoire de l'art romain et gallo-romain", "emmanuelle.rosso.1@sorbonne-universite.fr"),
        ("SANDRON", "Dany", "PR", "Histoire de l'art du Moyen Âge", "dany.sandron@sorbonne-universite.fr"),
        ("DIRIE", "Clément", "Professeur associé", "Art contemporain / édition JRP", ""),
        ("GORGUET BALLESTEROS", "Pascale", "Professeure associée", "Mode XVIIIe siècle — Palais Galliera", ""),
        ("TURPIN", "Elfi", "Professeure associée", "Art contemporain / commissariat", ""),
        ("LEVINE", "Daniel", "PR émérite", "Archéologie de l'Amérique préhispanique", ""),
        ("MONCHAMBERT", "Jean-Yves", "PR émérite", "Archéologie et histoire de l'art du Proche-Orient ancien", ""),
        ("PARLIER-RENAULT", "Édith", "PR émérite", "Archéologie et histoire de l'art de l'Inde", "edith.parlier-renault@sorbonne-universite.fr"),
        ("BALCON-BERRY", "Sylvie", "MCF HDR", "Archéologie et histoire de l'art médiéval", "sylvie.balcon-berry@sorbonne-universite.fr"),
        ("BRUN-KYRIAKIDIS", "Hélène", "MCF HDR", "Archéologie et histoire de l'art grec", "helene.brun-kyriakidis@sorbonne-universite.fr"),
        ("CUYNET", "François", "MCF HDR", "Archéologie et histoire de l'art de l'Amérique préhispanique", "francois.cuynet@sorbonne-universite.fr"),
        ("DRYANSKY", "Larisa", "MCF HDR", "Histoire de l'art contemporain et histoire du patrimoine", "larisa.dryansky@sorbonne-universite.fr"),
        ("LADRECH", "Karine", "MCF HDR", "Archéologie et histoire de l'art de l'Inde", "karine.ladrech@sorbonne-universite.fr"),
        ("BERGER", "Sabine", "MCF", "Histoire de l'art médiéval", "sabine.berger@sorbonne-universite.fr"),
        ("BODENSTEIN", "Felicity", "MCF", "Histoire de l'art contemporain et histoire du patrimoine", "felicity.bodenstein@sorbonne-universite.fr"),
        ("DALIX", "Anne-Sophie", "MCF", "Archéologie et histoire de l'art du Proche-Orient ancien", "anne-sophie.dalix@sorbonne-universite.fr"),
        ("DANDRAU", "Alain", "MCF", "Archéologie grecque et archéométrie", "alain.dandrau@sorbonne-universite.fr"),
        ("DUROCHER", "Maxime", "MCF", "Archéologie et histoire de l'art islamique", "maxime.durocher@sorbonne-universite.fr"),
        ("EWIG", "Isabelle", "MCF", "Histoire de l'art contemporain et histoire du patrimoine", "isabelle.ewig@sorbonne-universite.fr"),
        ("FERRE", "Rose-Marie", "MCF", "Histoire de l'art médiéval", "rose-marie.ferre@sorbonne-universite.fr"),
        ("FOREST", "Marion", "MCF", "Art et archéologie préhispaniques", ""),
        ("GALLIAN", "Nastasia", "MCF", "Histoire de l'art de la Renaissance et des Temps modernes", "nastasia.gallian@sorbonne-universite.fr"),
        ("GALLICCHIO", "Alessandro", "MCF", "Histoire de l'art contemporain XXe-XXIe siècles", "alessandro.gallicchio@sorbonne-universite.fr"),
        ("GOETZ", "Adrien", "MCF", "Histoire de l'art contemporain (XIXe) et patrimoine", "adrien.goetz@sorbonne-universite.fr"),
        ("GOLOSETTI", "Raphaël", "MCF", "Archéologie et histoire de l'art romain et gallo-romain", "raphael.golosetti@sorbonne-universite.fr"),
        ("LETELLIER-TAILLEFER", "Éloïse", "MCF", "Archéologie et histoire de l'art romain et gallo-romain", "eloise.letellier-taillefer@sorbonne-universite.fr"),
        ("LURIN", "Emmanuel", "MCF", "Histoire de l'art de la Renaissance et des Temps modernes", "emmanuel.lurin@sorbonne-universite.fr"),
        ("MAILLET", "Arnaud", "MCF", "Histoire de l'art contemporain, spécialité cinéma", "arnaud.maillet@sorbonne-universite.fr"),
        ("MEENEN", "Dalila", "MCF", "Histoire de l'art contemporain (XIXe siècle)", "dalila.meenen@sorbonne-universite.fr"),
        ("SZANTO", "Mickael", "MCF", "Histoire de l'art de la Renaissance (XVIIe siècle)", "mickael.szanto@sorbonne-universite.fr"),
        ("VAUDRY", "Élodie", "MCF", "Histoire de l'art contemporain et arts décoratifs", "elodie.vaudry@sorbonne-universite.fr"),
        ("WILCZEK", "Josef", "MCF", "Archéologie numérique", "josef.wilczek@sorbonne-universite.fr"),
        ("WOLVESPERGES", "Thibaut", "MCF", "Histoire de l'art moderne et arts décoratifs", "thibaut.wolvesperges@sorbonne-universite.fr"),
        ("YOTA", "Elisabeth", "MCF", "Histoire de l'art médiéval, spécialité byzantine", "elisabeth.yota@sorbonne-universite.fr"),
        ("AUDO", "Anna", "PRAG", "Anglais spécialisé histoire de l'art et archéologie", "anna.audo@sorbonne-universite.fr"),
        ("DESBALS", "Marie-Anne", "PRAG", "Histoire de l'art grec", "marie-anne.desbals@sorbonne-universite.fr"),
    ]
    for nom, prenom, titre, spec, email in people:
        add(rows, matiere="ART", nom=nom, prenom=prenom, titre=titre,
            specialite=spec, email=email, institution=inst, source=src)
    return rows


def mythologie() -> list[dict]:
    src = "https://histoire.umontreal.ca/recherche/interets/experts/ex/Mythologie%20grecque/"
    inst = "Université de Montréal — Département d'histoire"
    rows = []
    add(rows, matiere="MYTHOLOGIE", nom="BONNECHERE", prenom="Pierre",
        titre="Professeur associé / professeur honoraire",
        specialite="Mythologie grecque ; religion grecque ; Grèce ancienne ; divination et sacrifice",
        email="pierre.bonnechere@umontreal.ca", institution=inst, source=src,
        statut="Professeur honoraire", pays="Canada")
    add(rows, matiere="MYTHOLOGIE", nom="PETRISOR CURSARU", prenom="Gabriela Elena",
        titre="Chargée de cours",
        specialite="Mythologie et religion grecques ; Antiquité gréco-romaine ; présocratiques",
        email="gabriela.elena.petrisor.cursaru@umontreal.ca", institution=inst, source=src,
        statut="Chargée de cours", pays="Canada")
    return rows


# EPHE section 27 — art historians / music / architecture moved to ART
EPHE_ART = {
    "FROISSART", "FROMMEL", "HOCHMANN", "LENIAUD", "LEPROUX", "LEUTRAT",
    "LORENTZ", "NASSIEU MAUPAS", "D'ORGEIX", "ORGEIX", "QUEYREL", "REYNAUD",
    "SALE", "SALÉ", "CASTRES", "FIEVE", "FIÉVÉ",
}
EPHE_MYTHO = {
    "VAN ANDRINGA",  # religion romaine
    "HOU BEN", "HOUBEN",  # veda / rituel
    "RAMBLE",  # tibet religion
    "PAPAS",  # soufisme
    "STOEKL BEN EZRA",  # judaïsme ancien
    "CAMPANINI",  # kabbale
}


def scrape_dauphine() -> list[dict]:
    rows = []
    src_base = "https://drm.dauphine.fr/fr/most/membres/enseignants-chercheurs-et-chercheurs.html"
    inst = "Université Paris Dauphine-PSL — DRM MOST"
    pages = [
        src_base,
        src_base + "?tx_sngprofiles_displayprofiles%5B%40widget_0%5D%5BcurrentPage%5D=2&cHash=08078e1cd8e5566d7dd8c8784c6fd1b2",
        src_base + "?tx_sngprofiles_displayprofiles%5B%40widget_0%5D%5BcurrentPage%5D=3&cHash=188672d36b9ce8a9a0671243a4b75a67",
    ]
    profiles = []
    for url in pages:
        r = get(url)
        if not r or r.status_code != 200:
            continue
        soup = BeautifulSoup(r.text, "lxml")
        for a in soup.select("a[href*='detail-cv/profile/']"):
            name = clean(a.get_text(" ", strip=True))
            href = a.get("href", "")
            if not name or len(name) < 4 or name in {"EN", "B", "C", "D"}:
                continue
            if "letter" in href or "currentPage" in href:
                continue
            full = urljoin("https://drm.dauphine.fr/", href)
            profiles.append((name, full))

    def fetch_profile(item):
        name, url = item
        r = get(url)
        email, titre, spec = "", "Enseignant-chercheur", "Management / organisation (MOST)"
        if r and r.status_code == 200:
            soup = BeautifulSoup(r.text, "lxml")
            mail = soup.select_one("a[href^='mailto:']")
            if mail:
                email = mail.get("href", "")
            text = soup.get_text("\n", strip=True)
            for line in text.splitlines():
                low = fold(line)
                if any(k in low for k in ["professeur", "maitre de", "maître de", "assistant"]):
                    if len(line) < 80:
                        titre = line
                        break
            emails = re.findall(r"[\w.+-]+@(?:dauphine|psl)[\w.-]*", r.text, re.I)
            if emails and not email:
                email = emails[0]
        nom, prenom = split_name(name)
        if nom.isupper() and prenom.isupper():
            # LAST FIRST
            prenom, nom = prenom.title(), nom
        return nom, prenom, titre, spec, email, url

    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(fetch_profile, p) for p in profiles]
        for fut in as_completed(futs):
            nom, prenom, titre, spec, email, url = fut.result()
            add(rows, matiere="MONDE ACTUEL", nom=nom, prenom=prenom, titre=titre,
                specialite=spec, email=email, institution=inst, source=url or src_base)
    return rows


def scrape_ephe_profiles(people: list[tuple[str, str, str, str, str]]) -> dict[str, dict]:
    """people: (slug_url, nom, prenom, titre, section)"""
    extra = {}

    def fetch_one(item):
        url, nom, prenom, titre, section = item
        r = get(url)
        email = ""
        chaire = ""
        if r and r.status_code == 200:
            soup = BeautifulSoup(r.text, "lxml")
            mail = soup.select_one("a[href^='mailto:'][title*='courriel' i], a[href^='mailto:']")
            if mail:
                href = mail.get("href", "")
                if "subject=" not in href.lower() or "@ephe" in href.lower():
                    email = href
            if not email:
                m = re.search(r"mailto:([a-z0-9._+-]+@ephe\.psl\.eu)", r.text, re.I)
                if m:
                    email = m.group(1)
            text = soup.get_text("\n", strip=True)
            # Chaire block
            m = re.search(r"Chaire\s*\n([^\n]+)", text)
            if m:
                chaire = clean(m.group(1))
            m2 = re.search(r"Thématiques\s*\n([^\n]+)", text)
            if m2 and not chaire:
                chaire = clean(m2.group(1))
        if not email:
            email = ephe_email(prenom, nom)
        return url, email, chaire

    with ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(fetch_one, p): p for p in people}
        for fut in as_completed(futs):
            url, email, chaire = fut.result()
            extra[url] = {"email": email, "chaire": chaire}
    return extra


def ephe_lists() -> list[dict]:
    hist_src = "https://www.ephe.psl.eu/annuaire-enseignants-chercheurs/section/27"
    sci_src = "https://www.ephe.psl.eu/annuaire-enseignants-chercheurs/section/25"
    inst = "EPHE - PSL"

    hist = [
        ("gilles-authier", "AUTHIER", "Gilles", "Directeur d'études"),
        ("nalini-balbir", "BALBIR", "Nalini", "Directrice d'études émérite"),
        ("dominique-barthelemy", "BARTHELEMY", "Dominique", "Directeur d'études émérite"),
        ("alessia-bauer", "BAUER", "Alessia", "Directrice d'études"),
        ("francois-berard", "BERARD", "François", "Directeur d'études émérite"),
        ("marc-bompaire", "BOMPAIRE", "Marc", "Directeur d'études émérite"),
        ("isabelle-bril", "BRIL", "Isabelle", "Directrice d'études émérite"),
        ("samara-broglia-de-moura", "BROGLIA DE MOURA", "Samara", "Chargée de conférences"),
        ("yves-bruley", "BRULEY", "Yves", "Maître de conférences"),
        ("laurianne-bruneau", "BRUNEAU", "Laurianne", "Maîtresse de conférences"),
        ("michel-cacouros", "CACOUROS", "Michel", "Maître de conférences"),
        ("saverio-campanini", "CAMPANINI", "Saverio", "Directeur d'études"),
        ("astrid-castres", "CASTRES", "Astrid", "Maître de conférences"),
        ("emmanuelle-chapron", "CHAPRON", "Emmanuelle", "Directrice d'études"),
        ("marie-pierre-chaufray", "CHAUFRAY", "Marie-Pierre", "Directrice d'études"),
        ("michel-chauveau", "CHAUVEAU", "Michel", "Directeur d'études émérite"),
        ("angela-cossu", "COSSU", "Angela", "Enseignante de langues"),
        ("joel-coste", "COSTE", "Joël", "Directeur d'études"),
        ("owen-daniel", "DANIEL", "Owen", "ATER"),
        ("nuria-de-castilla", "DE CASTILLA", "Nuria", "Directrice d'études"),
        ("alain-delattre", "DELATTRE", "Alain", "Directeur d'études"),
        ("francoise-delvoye", "DELVOYE", "Françoise", "Directrice d'études émérite"),
        ("sophie-demare", "DEMARE", "Sophie", "Directrice d'études"),
        ("florence-descamps", "DESCAMPS", "Florence", "Maître de conférences"),
        ("francois-xavier-dillmann", "DILLMANN", "François-Xavier", "Directeur d'études émérite"),
        ("jean-charles-ducene", "DUCENE", "Jean-Charles", "Directeur d'études"),
        ("joelle-ducos", "DUCOS", "Joëlle", "Directrice d'études"),
        ("emmanuel-dupraz", "DUPRAZ", "Emmanuel", "Directeur d'études"),
        ("frederique-duyrat", "DUYRAT", "Frédérique", "Directrice d'études"),
        ("nicolas-fieve", "FIEVE", "Nicolas", "Directeur d'études"),
        ("jean-luc-fournet", "FOURNET", "Jean-Luc", "Directeur d'études"),
        ("silverio-franzoni", "FRANZONI", "Silverio", "Chargé de conférences"),
        ("rossella-froissart", "FROISSART", "Rossella", "Directrice d'études"),
        ("sabine-frommel", "FROMMEL", "Sabine", "Directrice d'études émérite"),
        ("martin-glessgen", "GLESSGEN", "Martin", "Directeur d'études"),
        ("pierre-gonneau", "GONNEAU", "Pierre", "Directeur d'études"),
        ("michael-guichard", "GUICHARD", "Michaël", "Directeur d'études"),
        ("isabelle-guyot-bachy", "GUYOT-BACHY", "Isabelle", "Directrice d'études"),
        ("laurent-hablot", "HABLOT", "Laurent", "Directeur d'études"),
        ("dauphine-de-haldat-du-lys", "DE HALDAT DU LYS", "Dauphine", "ATER"),
        ("xavier-helary", "HELARY", "Xavier", "Directeur d'études"),
        ("wouter-henkelman", "HENKELMAN", "Wouter", "Maître de conférences"),
        ("patrick-henriet", "HENRIET", "Patrick", "Directeur d'études"),
        ("michel-hochmann", "HOCHMANN", "Michel", "Président / Directeur d'études"),
        ("sylvie-honigman", "HONIGMAN", "Sylvie", "Directrice d'études"),
        ("antony-hostein", "HOSTEIN", "Antony", "Directeur d'études"),
        ("jan-houben", "HOUBEN", "Jan", "Directeur d'études"),
        ("philip-huyse", "HUYSE", "Philip", "Directeur d'études"),
        ("guillaume-jacques", "JACQUES", "Guillaume", "Directeur d'études"),
        ("rainier-lanselle", "LANSELLE", "Rainier", "Directeur d'études"),
        ("jean-michel-leniaud", "LENIAUD", "Jean-Michel", "Directeur d'études émérite"),
        ("guy-michel-leproux", "LEPROUX", "Guy-Michel", "Directeur d'études"),
        ("virginie-leroux", "LEROUX", "Virginie", "Directrice d'études"),
        ("estelle-leutrat", "LEUTRAT", "Estelle", "Directrice d'études"),
        ("gauthier-liberman", "LIBERMAN", "Gauthier", "Directeur d'études"),
        ("sandra-lippert", "LIPPERT", "Sandra", "Chargée de conférences"),
        ("philippe-lorentz", "LORENTZ", "Philippe", "Directeur d'études émérite"),
        ("laetitia-loviconi", "LOVICONI", "Laetitia", "Maître de conférences"),
        ("alexis-lycas", "LYCAS", "Alexis", "Maître de conférences"),
        ("jean-marc-mandosio", "MANDOSIO", "Jean-Marc", "Maître de conférences"),
        ("pierre-marsone", "MARSONE", "Pierre", "Directeur d'études"),
        ("amina-mettouchi", "METTOUCHI", "Amina", "Directrice d'études"),
        ("sophie-minon", "MINON", "Sophie", "Directrice d'études émérite"),
        ("jean-marie-moeglin", "MOEGLIN", "Jean-Marie", "Directeur d'études émérite"),
        ("brigitte-mondrain", "MONDRAIN", "Brigitte", "Directrice d'études"),
        ("laurent-morelle", "MORELLE", "Laurent", "Directeur d'études émérite"),
        ("christophe-morhange", "MORHANGE", "Christophe", "Directeur d'études"),
        ("martin-motte", "MOTTE", "Martin", "Directeur d'études"),
        ("clement-mousse", "MOUSSE", "Clément", "Maître de conférences"),
        ("jean-michel-mouton", "MOUTON", "Jean-Michel", "Directeur d'études"),
        ("audrey-nassieu-maupas", "NASSIEU MAUPAS", "Audrey", "Directrice d'études"),
        ("sylvia-nieto-pelletier", "NIETO-PELLETIER", "Sylvia", "Chargée de conférences"),
        ("emilie-dorgeix", "D'ORGEIX", "Emilie", "Directrice d'études"),
        ("alexandre-papas", "PAPAS", "Alexandre", "Directeur d'études"),
        ("philippe-papin", "PAPIN", "Philippe", "Directeur d'études"),
        ("gilles-pecout", "PECOUT", "Gilles", "Directeur d'études"),
        ("stephane-pequignot", "PEQUIGNOT", "Stéphane", "Directeur d'études"),
        ("daniel-petit", "PETIT", "Daniel", "Directeur d'études"),
        ("jerome-petit", "PETIT", "Jérôme", "Directeur d'études"),
        ("georges-jean-pinault", "PINAULT", "Georges-Jean", "Directeur d'études émérite"),
        ("jean-louis-quantin", "QUANTIN", "Jean-Louis", "Directeur d'études"),
        ("francois-queyrel", "QUEYREL", "François", "Directeur d'études"),
        ("charles-ramble", "RAMBLE", "Charles", "Directeur d'études"),
        ("michel-redde", "REDDE", "Michel", "Directeur d'études émérite"),
        ("cecile-reynaud", "REYNAUD", "Cécile", "Directrice d'études"),
        ("jean-pierre-rothschild", "ROTHSCHILD", "Jean-Pierre", "Directeur d'études émérite"),
        ("denis-rousset", "ROUSSET", "Denis", "Directeur d'études"),
        ("marie-pierre-sale", "SALE", "Marie-Pierre", "Directrice d'études"),
        ("catherine-saliou", "SALIOU", "Catherine", "Directrice d'études"),
        ("vincent-samson", "SAMSON", "Vincent", "Chargé de conférences"),
        ("david-sasseville", "SASSEVILLE", "David", "Directeur d'études"),
        ("judith-schlanger", "SCHLANGER", "Judith", "Directrice d'études"),
        ("marc-smith", "SMITH", "Marc", "Directeur d'études"),
        ("andreas-stauder", "STAUDER", "Andreas", "Directeur d'études"),
        ("daniel-stoekl-ben-ezra", "STOEKL BEN EZRA", "Daniel", "Directeur d'études"),
        ("peter-stokes", "STOKES", "Peter", "Directeur d'études"),
        ("alain-thote", "THOTE", "Alain", "Directeur d'études émérite"),
        ("georgios-tolias", "TOLIAS", "Georgios", "Directeur d'études"),
        ("celine-trautmann-waller", "TRAUTMANN-WALLER", "Céline", "Directrice d'études"),
        ("anne-marie-turcan-verkerk", "TURCAN-VERKERK", "Anne-Marie", "Directrice d'études"),
        ("ozgur-turesay", "TURESAY", "Özgür", "Maître de conférences"),
        ("william-van-andringa", "VAN ANDRINGA", "William", "Directeur d'études"),
        ("olivier-venture", "VENTURE", "Olivier", "Directeur d'études"),
        ("stephane-verger", "VERGER", "Stéphane", "Directeur d'études"),
        ("michel-vieillard-baron", "VIEILLARD-BARON", "Michel", "Directeur d'études"),
        ("nicolas-weill-parot", "WEILL-PAROT", "Nicolas", "Directeur d'études"),
        ("jean-claude-yon", "YON", "Jean-Claude", "Directeur d'études"),
        ("nele-ziegler", "ZIEGLER", "Nele", "Chargé de conférences"),
        ("fabio-zinelli", "ZINELLI", "Fabio", "Directeur d'études"),
    ]

    sci = [
        ("benjamin-adroit", "ADROIT", "Benjamin", "ATER"),
        ("frederick-arnaud", "ARNAUD", "Frédérick", "Directeur d'études"),
        ("jean-yves-barnagaud", "BARNAGAUD", "Jean-Yves", "Maître de conférences"),
        ("emmanuel-belamie", "BELAMIE", "Emmanuel", "Directeur d'études"),
        ("isis-benoit-lizon", "BENOIT-LIZON", "Isis", "Maître de conférences"),
        ("aurelien-besnard", "BESNARD", "Aurélien", "Directeur d'études"),
        ("helene-blanchoud", "BLANCHOUD", "Hélène", "Maître de conférences"),
        ("dominique-bluteau", "BLUTEAU", "Dominique", "Maître de conférences"),
        ("laurent-bremond", "BREMOND", "Laurent", "Directeur d'études"),
        ("olivier-brisset", "BRISSET", "Olivier", "ATER"),
        ("marc-bui", "BUI", "Marc", "Directeur d'études"),
        ("bruno-canque", "CANQUE", "Bruno", "Directeur d'études"),
        ("christopher-carcaillet", "CARCAILLET", "Christopher", "Directeur d'études"),
        ("rosine-cartier", "CARTIER", "Rosine", "Maître de conférences"),
        ("gwenaelle-catheline", "CATHELINE", "Gwenaëlle", "Directrice d'études"),
        ("sandra-chanraud", "CHANRAUD", "Sandra", "Maître de conférences"),
        ("camille-clerissi", "CLERISSI", "Camille", "Maître de conférences"),
        ("eric-clua", "CLUA", "Eric", "Directeur d'études"),
        ("jessie-colin", "COLIN", "Jessie", "Maître de conférences"),
        ("antoine-collin", "COLLIN", "Antoine", "Maître de conférences"),
        ("antony-colombo", "COLOMBO", "Antony", "Maître de conférences"),
        ("helene-coqueugniot", "COQUEUGNIOT", "Hélène", "Directrice d'études"),
        ("sebastien-couette", "COUETTE", "Sébastien", "Maître de conférences"),
        ("sophie-couve", "COUVE", "Sophie", "Maître de conférences"),
        ("sarah-cubaynes", "CUBAYNES", "Sarah", "Maître de conférences"),
        ("erwan-delrieu-trottin", "DELRIEU-TROTTIN", "Erwan", "Maître de conférences"),
        ("sylvie-demignot", "DEMIGNOT", "Sylvie", "Directrice d'études"),
        ("stephanie-desprat", "DESPRAT", "Stéphanie", "Maître de conférences"),
        ("claudie-doums", "DOUMS", "Claudie", "Directrice d'études"),
        ("vincent-dufour", "DUFOUR", "Vincent", "Maître de conférences"),
        ("olivier-dutour", "DUTOUR", "Olivier", "Directeur d'études"),
        ("khalid-el-hachimi", "EL HACHIMI", "Khalid", "Maître de conférences"),
        ("samuel-etienne", "ETIENNE", "Samuel", "Directeur d'études"),
        ("johan-etourneau", "ETOURNEAU", "Johan", "Maître de conférences"),
        ("francis-eustache", "EUSTACHE", "Francis", "Directeur d'études émérite"),
        ("corinne-feiss-jehel", "FEISS-JEHEL", "Corinne", "Maître de conférences"),
        ("eric-feunteun", "FEUNTEUN", "Eric", "Directeur d'études"),
        ("veronique-frachet", "FRACHET", "Véronique", "Maître de conférences"),
        ("sophie-gad-lapiteau", "GAD-LAPITEAU", "Sophie", "Directrice d'études"),
        ("diego-garcia-weber", "GARCIA-WEBER", "Diego", "Maître de conférences"),
        ("betty-gardie", "GARDIE", "Betty", "Directrice d'études"),
        ("marc-godinot", "GODINOT", "Marc", "Directeur d'études émérite"),
        ("aurelie-goutte", "GOUTTE", "Aurélie", "Maître de conférences"),
        ("killian-gregory", "GREGORY", "Killian", "ATER"),
        ("elise-grevet", "GREVET", "Elise", "ATER"),
        ("elodie-guigon", "GUIGON", "Elodie", "Maître de conférences"),
        ("berengere-guillery-girard", "GUILLERY-GIRARD", "Bérengère", "Directrice d'études"),
        ("christelle-hely", "HELY ALLEAUME", "Christelle", "Directrice d'études"),
        ("francois-jouen", "JOUEN", "François", "Directeur d'études émérite"),
        ("marie-noelle-labour", "LABOUR", "Marie-Noëlle", "Maître de conférences"),
        ("jeremie-lafraire", "LAFRAIRE", "Jérémie", "Chargé de conférences"),
        ("isabelle-lagroye", "LAGROYE", "Isabelle", "Directrice d'études"),
        ("christelle-lahaye", "LAHAYE", "Christelle", "Directrice d'études"),
        ("mickael-laisney", "LAISNEY", "Mickaël", "Maître de conférences"),
        ("christelle-lasbleiz", "LASBLEIZ", "Christelle", "Maître de conférences"),
        ("morwena-latouche", "LATOUCHE", "Morwena", "Maître de conférences"),
        ("rachel-lauthelier-mourier", "LAUTHELIER-MOURIER", "Rachel", "Maître de conférences"),
        ("marie-christine-lebart", "LEBART", "Marie-Christine", "Maître de conférences"),
        ("david-lecchini", "LECCHINI", "David", "Directeur d'études"),
        ("stephanie-manel", "MANEL", "Stéphanie", "Directrice d'études"),
        ("anne-marcilhac", "MARCILHAC", "Anne", "Directrice de l'ITEV"),
        ("raphael-mathevet", "MATHEVET", "Raphaël", "Directeur d'études"),
        ("nicolas-mathevon", "MATHEVON", "Nicolas", "Directeur d'études"),
        ("laurence-mathieu", "MATHIEU", "Laurence", "Maître de conférences"),
        ("nadine-mestre-frances", "MESTRE-FRANCES", "Nadine", "Directrice d'études"),
        ("claude-miaud", "MIAUD", "Claude", "Directeur d'études"),
        ("suzanne-mills", "MILLS", "Suzanne", "Directrice d'études"),
        ("stefano-mona", "MONA", "Stefano", "Directeur d'études"),
        ("sophie-montuire", "MONTUIRE", "Sophie", "Directrice d'études"),
        ("nicolas-navarro", "NAVARRO", "Nicolas", "Maître de conférences"),
        ("thi-my-anh-neildez-nguyen", "NEILDEZ-NGUYEN", "Thi-My-Anh", "Maître de conférences"),
        ("stefan-niemann", "NIEMANN", "Stefan", "Directeur d'études"),
        ("maggy-nugues", "NUGUES", "Maggy", "Maître de conférences"),
        ("rosa-orlacchio", "ORLACCHIO", "Rosa", "Maître de conférences"),
        ("andras-paldi", "PALDI", "Andràs", "Directeur d'études"),
        ("valeriano-parravicini", "PARRAVICINI", "Valeriano", "Directeur d'études"),
        ("catherine-paul", "PAUL", "Catherine", "Directrice d'études"),
        ("serge-planes", "PLANES", "Serge", "Directeur d'études"),
        ("stephanie-plenchette", "PLENCHETTE", "Stéphanie", "Directrice d'études"),
        ("joelle-provasi", "PROVASI", "Joëlle", "Maître de conférences"),
        ("vincent-raquin", "RAQUIN", "Vincent", "Maître de conférences"),
        ("maxime-ratinier", "RATINIER", "Maxime", "Maître de conférences"),
        ("flore-renaud", "RENAUD", "Flore", "Maître de conférences"),
        ("stephane-richard", "RICHARD", "Stéphane", "Directeur d'études émérite"),
        ("jean-marie-robine", "ROBINE", "Jean-Marie", "Directeur d'études émérite"),
        ("mireille-rossel", "ROSSEL", "Mireille", "Maître de conférences"),
        ("pauline-saliou", "SALIOU", "Pauline", "ATER"),
        ("maria-fernanda-sanchez-goni", "SANCHEZ GONI", "Maria Fernanda", "Directrice d'études"),
        ("giovanni-stevanin", "STEVANIN", "Giovanni", "Directeur d'études"),
        ("daniel-stockholm", "STOCKHOLM", "Daniel", "Maître de conférences"),
        ("sophie-thenet", "THENET", "Sophie", "Directrice d'études"),
        ("thomas-thiebault", "THIEBAULT", "Thomas", "Maître de conférences"),
        ("francoise-trousse", "TROUSSE", "Françoise", "Maître de conférences"),
        ("gauthier-turpin", "TURPIN", "Gauthier", "ATER"),
        ("jean-michel-verdier", "VERDIER", "Jean-Michel", "Directeur d'études"),
        ("armelle-viard", "VIARD", "Armelle", "Maître de conférences"),
        ("pierre-de-villemereuil", "DE VILLEMEREUIL", "Pierre", "Maître de conférences"),
        ("thierry-wirth", "WIRTH", "Thierry", "Directeur d'études"),
    ]

    people = []
    for slug, nom, prenom, titre in hist:
        people.append((f"https://www.ephe.psl.eu/{slug}", nom, prenom, titre, "27"))
    for slug, nom, prenom, titre in sci:
        people.append((f"https://www.ephe.psl.eu/{slug}", nom, prenom, titre, "25"))

    print(f"EPHE: scraping {len(people)} fiches individuelles…")
    extras = scrape_ephe_profiles(people)

    rows = []
    for url, nom, prenom, titre, section in people:
        info = extras.get(url, {})
        email = info.get("email") or ephe_email(prenom, nom)
        chaire = info.get("chaire") or ""
        if section == "25":
            matiere = "SCIENCES"
            spec = chaire or "Sciences de la Vie et de la Terre"
            source = sci_src
        else:
            source = hist_src
            key = nom.upper()
            if key in EPHE_ART or any(k in key for k in EPHE_ART):
                matiere = "ART"
                spec = chaire or "Histoire de l'art / archéologie"
            elif key in EPHE_MYTHO or any(k in key for k in EPHE_MYTHO):
                matiere = "MYTHOLOGIE"
                spec = chaire or "Religions / mythologies"
            elif any(x in fold(chaire + " " + titre) for x in ["littératur", "philolog", "langue", "linguist"]):
                matiere = "LITTERATURE"
                spec = chaire or "Sciences historiques et philologiques"
            else:
                matiere = "HISTOIRE"
                spec = chaire or "Sciences historiques et philologiques"
        add(
            rows,
            matiere=matiere,
            nom=nom,
            prenom=prenom,
            titre=titre,
            specialite=spec,
            email=email,
            institution=inst,
            source=url,
            statut=titre,
        )
    return rows


def dedupe(rows: list[dict]) -> list[dict]:
    seen = {}
    out = []
    for r in rows:
        key = (fold(r["Nom"]), fold(r["Prénom"]), r["Matière"], fold(r["Institution"]))
        email = r.get("Email") or ""
        if key in seen:
            i = seen[key]
            if email and not out[i]["Email"]:
                out[i]["Email"] = email
            if r["Spécialité"] and len(r["Spécialité"]) > len(out[i]["Spécialité"]):
                out[i]["Spécialité"] = r["Spécialité"]
            continue
        seen[key] = len(out)
        out.append(r)
    out.sort(key=lambda x: (MATIERES.index(x["Matière"]) if x["Matière"] in MATIERES else 99, x["Nom"], x["Prénom"]))
    return out


HEADERS = [
    "Matière",
    "Nom",
    "Prénom",
    "Titre / fonction",
    "Spécialité",
    "Email",
    "Institution",
    "Statut",
    "Pays",
    "Source",
]


def style_header(ws, n_cols):
    ws.auto_filter.ref = f"A1:{get_column_letter(n_cols)}1"
    ws.freeze_panes = "A2"
    ws.row_dimensions[1].height = 22
    for col in range(1, n_cols + 1):
        cell = ws.cell(1, col)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def write_rows(ws, rows):
    for c, h in enumerate(HEADERS, 1):
        ws.cell(1, c, h)
    style_header(ws, len(HEADERS))
    for i, r in enumerate(rows, 2):
        values = [r[h] for h in HEADERS]
        for c, v in enumerate(values, 1):
            cell = ws.cell(i, c, v)
            cell.border = THIN
            cell.alignment = Alignment(vertical="center", wrap_text=True)
            if i % 2 == 0:
                cell.fill = ZEBRA
            if c == 1 and v in COLORS:
                cell.font = Font(bold=True, color=COLORS[v], name="Calibri")
            if c == 6 and v:
                cell.hyperlink = f"mailto:{v}"
                cell.font = Font(color="0563C1", underline="single", name="Calibri")
    widths = [16, 22, 18, 28, 42, 38, 48, 22, 10, 55]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.auto_filter.ref = f"A1:{get_column_letter(len(HEADERS))}{max(1, len(rows)+1)}"


def write_excel(rows: list[dict]):
    wb = Workbook()

    # Synthèse
    ws0 = wb.active
    ws0.title = "SYNTHESE"
    ws0["A1"] = "CONTACTS ENSEIGNANTS-CHERCHEURS — 6 MATIÈRES"
    ws0["A1"].font = Font(bold=True, size=18, color="1B1B1B", name="Calibri")
    ws0.merge_cells("A1:F1")
    ws0["A2"] = (
        "Annuaire constitué à partir des pages officielles d'universités "
        "(Sorbonne Université, Paris 1, Paris Cité, Dauphine-PSL, EPHE-PSL, UdeM, APHEC). "
        "Emails tels que publiés sur les annuaires ; pour l'EPHE, email institutionnel "
        "prenom.nom@ephe.psl.eu confirmé sur les fiches (ex. Gilles Authier)."
    )
    ws0["A2"].alignment = Alignment(wrap_text=True)
    ws0.merge_cells("A2:F2")
    ws0.row_dimensions[2].height = 48

    ws0["A4"] = "Matière"
    ws0["B4"] = "Nombre de contacts"
    ws0["C4"] = "Dont email renseigné"
    ws0["D4"] = "% avec email"
    style_header(ws0, 4)
    counts = []
    for i, m in enumerate(MATIERES, 5):
        subset = [r for r in rows if r["Matière"] == m]
        with_mail = sum(1 for r in subset if r["Email"])
        ws0.cell(i, 1, m).font = Font(bold=True, color=COLORS[m], name="Calibri")
        ws0.cell(i, 2, len(subset))
        ws0.cell(i, 3, with_mail)
        ws0.cell(i, 4, round(100 * with_mail / len(subset), 1) if subset else 0)
        counts.append((m, len(subset), with_mail))
    total_row = 11
    ws0.cell(total_row, 1, "TOTAL").font = Font(bold=True)
    ws0.cell(total_row, 2, len(rows))
    ws0.cell(total_row, 3, sum(1 for r in rows if r["Email"]))
    ws0.cell(total_row, 4, round(100 * sum(1 for r in rows if r["Email"]) / len(rows), 1) if rows else 0)

    pie = PieChart()
    pie.title = "Répartition par matière"
    labels = Reference(ws0, min_col=1, min_row=5, max_row=10)
    data = Reference(ws0, min_col=2, min_row=4, max_row=10)
    pie.add_data(data, titles_from_data=True)
    pie.set_categories(labels)
    pie.dataLabels = DataLabelList()
    pie.dataLabels.showPercent = True
    pie.dataLabels.showVal = True
    pie.dataLabels.showCatName = False
    pie.width = 15
    pie.height = 9
    ws0.add_chart(pie, "A14")

    ws0["A30"] = "Sources scrapées"
    ws0["A30"].font = Font(bold=True, size=14)
    sources = [
        ("MONDE ACTUEL", "Science politique Paris 1", "https://sciencepolitique.pantheonsorbonne.fr/personnel-enseignant"),
        ("MONDE ACTUEL", "Dauphine DRM MOST", "https://drm.dauphine.fr/fr/most/membres/enseignants-chercheurs-et-chercheurs.html"),
        ("MONDE ACTUEL", "Paris Cité GHES (éco / géo)", "https://u-paris.fr/ghes/contacts/"),
        ("MONDE ACTUEL", "Sociologie Sorbonne", "https://lettres.sorbonne-universite.fr/faculte-des-lettres/ufr/ufr-de-sociologie-et-informatique-pour-les-sciences-humaines/personnels"),
        ("MONDE ACTUEL", "APHEC conseil d'administration", "https://aphec.fr/conseil-administration/"),
        ("HISTOIRE", "UFR Histoire Sorbonne", "https://lettres.sorbonne-universite.fr/faculte-des-lettres/ufr/ufr-histoire/personnels-enseignement-et-de-recherche-ufr-histoire"),
        ("HISTOIRE", "EPHE section 27", "https://www.ephe.psl.eu/annuaire-enseignants-chercheurs/section/27"),
        ("HISTOIRE", "Paris Cité département Histoire", "https://u-paris.fr/ghes/contacts-du-departement-dhistoire/"),
        ("ART", "UFR Histoire de l'art et archéologie Sorbonne", "https://lettres.sorbonne-universite.fr/faculte-des-lettres/ufr/ufr-histoire-de-l-art-et-archeologie/personnels-enseignement-et-de"),
        ("ART", "EPHE historiens de l'art (section 27)", "https://www.ephe.psl.eu/annuaire-enseignants-chercheurs/section/27"),
        ("MYTHOLOGIE", "UdeM experts Mythologie grecque", "https://histoire.umontreal.ca/recherche/interets/experts/ex/Mythologie%20grecque/"),
        ("MYTHOLOGIE", "Historiens des religions (Sorbonne / EPHE)", "pages UFR Histoire + EPHE"),
        ("SCIENCES", "EPHE section 25 SVT", "https://www.ephe.psl.eu/annuaire-enseignants-chercheurs/section/25"),
        ("LITTERATURE", "UFR Littérature française et comparée Sorbonne", "https://lettres.sorbonne-universite.fr/faculte-des-lettres/ufr/ufr-de-litterature-francaise-et-comparee/personnels-enseignement-et-de"),
    ]
    ws0["A31"] = "Matière"
    ws0["B31"] = "Annuaire"
    ws0["C31"] = "URL"
    style_header(ws0, 3)
    # restyle row 31 after overwrite of A1 style - already done
    for i, (m, name, url) in enumerate(sources, 32):
        ws0.cell(i, 1, m).font = Font(bold=True, color=COLORS.get(m, "000000"))
        ws0.cell(i, 2, name)
        ws0.cell(i, 3, url)
        if url.startswith("http"):
            ws0.cell(i, 3).hyperlink = url
            ws0.cell(i, 3).font = Font(color="0563C1", underline="single")
    for col, w in zip("ABCDEF", [18, 28, 22, 16, 16, 16]):
        ws0.column_dimensions[col].width = w
    ws0.column_dimensions["B"].width = 55
    ws0.column_dimensions["C"].width = 90

    # Tous
    ws_all = wb.create_sheet("TOUS LES CONTACTS")
    write_rows(ws_all, rows)

    for m in MATIERES:
        ws = wb.create_sheet(m[:31])
        write_rows(ws, [r for r in rows if r["Matière"] == m])

    # Avec email only
    ws_mail = wb.create_sheet("AVEC EMAIL")
    write_rows(ws_mail, [r for r in rows if r["Email"]])

    wb.save(XLSX)
    print(f"Excel écrit : {XLSX} ({len(rows)} contacts)")


def main():
    print("Compilation des annuaires…")
    rows: list[dict] = []
    rows += science_politique()
    rows += aphec()
    rows += paris_cite()
    rows += histoire_sorbonne()
    rows += litterature_sorbonne()
    rows += sociologie_sorbonne()
    rows += art_sorbonne()
    rows += mythologie()
    print("Dauphine: scrape des 3 pages + fiches…")
    rows += scrape_dauphine()
    rows += ephe_lists()
    rows = dedupe(rows)
    print(f"Total après dédoublonnage : {len(rows)}")
    for m in MATIERES:
        n = sum(1 for r in rows if r["Matière"] == m)
        e = sum(1 for r in rows if r["Matière"] == m and r["Email"])
        print(f"  {m:16s} {n:4d} contacts  ({e} emails)")
    write_excel(rows)


if __name__ == "__main__":
    main()
