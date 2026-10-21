"""Illustrations produit du catalogue simulé, dans la palette Platinum Mist.

Chaque fonction renvoie le contenu SVG (viewBox 0 0 200 200) d'un article.
`python design/products.py` écrit les fichiers dans design/svg/products/ ;
design/render.sh les convertit en PNG dans assets/images/products/.
"""
import os

D = "#2B2E33"   # Platinum 900
G = "#55595F"
M = "#7B7F85"   # Platinum 600
S = "#A8ACB2"
L = "#C1C4C8"   # Platinum 300
P = "#DCDFE2"
W = "#F5F6F7"   # Platinum 100
BG = "#ECEEF0"
FONT = "font-family='Segoe UI, Arial, sans-serif' font-weight='700'"


def frame(body: str) -> str:
    return (
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200' width='200' height='200'>"
        f"<rect width='200' height='200' fill='{BG}'/>"
        f"<ellipse cx='100' cy='170' rx='70' ry='9' fill='{D}' opacity='0.10'/>"
        f"{body}</svg>"
    )


def label(x, y, text, size=11, color=W):
    return f"<text x='{x}' y='{y}' text-anchor='middle' font-size='{size}' fill='{color}' {FONT}>{text}</text>"


def sack(title, sub, fill=L, band=D):
    return (
        # Sac de derrière, décalé
        f"<path d='M70 46 Q110 36 150 46 L158 150 Q112 160 64 150 Z' fill='{S}'/>"
        f"<path d='M48 56 Q92 44 136 56 L146 166 Q94 178 40 166 Z' fill='{fill}'/>"
        f"<path d='M48 56 Q92 44 136 56 L137 68 Q92 58 47 68 Z' fill='{M}' opacity='0.45'/>"
        f"<rect x='58' y='92' width='70' height='46' rx='5' fill='{band}'/>"
        + label(93, 113, title, 13)
        + label(93, 129, sub, 10, L)
    )


def bucket(title, lid=L, body=D, small=False):
    s = 0.85 if small else 1.0
    tx = 100 * (1 - s)
    return (
        f"<g transform='translate({tx},{24 * (1 - s) + 10}) scale({s})'>"
        f"<path d='M58 62 Q100 20 142 62' fill='none' stroke='{M}' stroke-width='5' stroke-linecap='round'/>"
        f"<path d='M48 66 L58 158 Q100 170 142 158 L152 66 Z' fill='{body}'/>"
        f"<ellipse cx='100' cy='66' rx='52' ry='12' fill='{lid}'/>"
        f"<ellipse cx='100' cy='66' rx='40' ry='8' fill='{S}'/>"
        f"<rect x='60' y='96' width='80' height='34' rx='4' fill='{W}'/>"
        + label(100, 118, title, 13, D)
        + "</g>"
    )


def iso_box(x, y, w, d, h, top, left, right):
    """Pavé isométrique : coin avant en (x, y)."""
    dx, dy = d * 0.87, d * 0.5
    wx, wy = w * 0.87, w * 0.5
    return (
        f"<path d='M{x} {y} L{x + wx} {y - wy} L{x + wx} {y - wy - h} L{x} {y - h} Z' fill='{right}'/>"
        f"<path d='M{x} {y} L{x - dx} {y - dy} L{x - dx} {y - dy - h} L{x} {y - h} Z' fill='{left}'/>"
        f"<path d='M{x} {y - h} L{x + wx} {y - wy - h} L{x + wx - dx} {y - wy - dy - h} L{x - dx} {y - dy - h} Z' fill='{top}'/>"
    )


def ciment():
    return sack("CEM II", "42.5 · 50 kg")


def enduit():
    return sack("ENDUIT", "25 kg", fill=P, band=G)


def colle():
    return sack("C2ET", "25 kg", fill=W, band=D)


def fer():
    rods = ""
    for i, c in enumerate([D, G, M, D, G, M, D]):
        y = 70 + i * 9
        rods += f"<g transform='rotate(-18 100 100)'><rect x='20' y='{y}' width='170' height='7' rx='3.5' fill='{c}'/>"
        rods += "".join(f"<rect x='{30 + k * 14}' y='{y}' width='2' height='7' fill='{W}' opacity='0.25'/>" for k in range(11)) + "</g>"
    ties = "".join(
        f"<g transform='rotate(-18 100 100)'><rect x='{x}' y='64' width='7' height='72' rx='2' fill='{L}'/></g>" for x in (60, 130)
    )
    return rods + ties


def treillis():
    lines = ""
    for i in range(7):
        a = i / 6
        x1, y1 = 40 + a * 70, 140 - a * 40
        x2, y2 = x1 + 70, y1 + 20
        lines += f"<line x1='{x1}' y1='{y1}' x2='{x2}' y2='{y2}' stroke='{G}' stroke-width='3'/>"
        bx1, by1 = 40 + a * 70, 140 - a * 40
    for j in range(5):
        b = j / 4
        x1, y1 = 40 + b * 70, 140 + b * 20
        x2, y2 = x1 + 70, y1 - 40
        lines += f"<line x1='{x1}' y1='{y1}' x2='{x2}' y2='{y2}' stroke='{D}' stroke-width='3'/>"
    return f"<g transform='translate(-5 -20)'>{lines}</g>"


def carrelage():
    out = ""
    for i in range(4):
        out += iso_box(100, 150 - i * 12, 52, 52, 10, W if i == 3 else P, S, L)
    # joints du carreau du dessus
    out += f"<path d='M100 104 L145 78 L100 52 L55 78 Z' fill='none' stroke='{L}' stroke-width='1.5'/>"
    out += f"<path d='M77.5 91 L122.5 65 M122.5 91 L77.5 65' stroke='{L}' stroke-width='1.2'/>"
    return out


def faience():
    tiles = ""
    for r in range(4):
        for c in range(3):
            tiles += f"<rect x='{52 + c * 33}' y='{36 + r * 32}' width='30' height='29' rx='2' fill='{W}'/>"
    return f"<rect x='48' y='32' width='104' height='136' rx='4' fill='{L}'/>{tiles}"


def plinthe():
    out = ""
    for i in range(5):
        out += f"<g transform='rotate(-12 100 100)'><rect x='22' y='{78 + i * 14}' width='156' height='11' rx='2' fill='{W if i % 2 else P}'/>"
        out += f"<rect x='22' y='{86 + i * 14}' width='156' height='3' fill='{S}'/></g>"
    return out


def parquet():
    out = ""
    for i in range(4):
        out += iso_box(110, 150 - i * 11, 70, 34, 9, P if i < 3 else W, M, S)
        out += f"<path d='M{110 - 25} {150 - i * 11 - 9 - 26} l58 -33' stroke='{S}' stroke-width='1.2' opacity='0.7'/>"
    return out


def peinture_facade():
    return bucket("FAÇADE")


def peinture_int():
    return bucket("MAT", lid=P, body=G)


def sous_couche():
    return bucket("PRIMER", lid=W, body=M, small=True)


def tube_pvc():
    out = ""
    for i, y in enumerate((88, 112, 136)):
        out += f"<g transform='rotate(-14 100 112)'><rect x='26' y='{y - 9}' width='148' height='18' fill='{L if i != 1 else S}'/>"
        out += f"<ellipse cx='174' cy='{y}' rx='5' ry='9' fill='{M}'/><ellipse cx='174' cy='{y}' rx='3' ry='6' fill='{D}'/>"
        out += f"<ellipse cx='26' cy='{y}' rx='5' ry='9' fill='{S}'/></g>"
    return out


def cable():
    rings = "".join(
        f"<ellipse cx='100' cy='108' rx='{58 - i * 7}' ry='{44 - i * 5}' fill='none' stroke='{D if i % 2 == 0 else G}' stroke-width='7'/>"
        for i in range(5)
    )
    return rings + f"<ellipse cx='100' cy='108' rx='20' ry='14' fill='{BG}'/>" + f"<path d='M150 128 Q172 150 160 166' fill='none' stroke='{D}' stroke-width='7' stroke-linecap='round'/>"


def tableau():
    out = f"<rect x='44' y='38' width='112' height='128' rx='8' fill='{W}' stroke='{D}' stroke-width='5'/>"
    for r in range(2):
        out += f"<rect x='54' y='{56 + r * 48}' width='92' height='34' rx='3' fill='{P}'/>"
        for c in range(6):
            out += f"<rect x='{57 + c * 15}' y='{60 + r * 48}' width='12' height='26' rx='2' fill='{D}'/>"
            out += f"<rect x='{60 + c * 15}' y='{66 + r * 48}' width='6' height='7' rx='1' fill='{W}'/>"
    return out


def disjoncteur():
    out = ""
    for c in range(3):
        x = 52 + c * 34
        out += f"<rect x='{x}' y='48' width='30' height='112' rx='4' fill='{W}' stroke='{L}' stroke-width='2'/>"
        out += f"<rect x='{x + 6}' y='84' width='18' height='30' rx='3' fill='{D}'/><rect x='{x + 10}' y='90' width='10' height='10' rx='2' fill='{W}'/>"
        out += label(x + 15, 72, "20A", 9, D)
    return out


def prise():
    return (
        f"<rect x='46' y='46' width='108' height='108' rx='18' fill='{W}' stroke='{L}' stroke-width='3'/>"
        f"<circle cx='100' cy='100' r='36' fill='{P}'/>"
        f"<circle cx='84' cy='100' r='6' fill='{D}'/><circle cx='116' cy='100' r='6' fill='{D}'/>"
        f"<rect x='96' y='66' width='8' height='10' rx='2' fill='{M}'/>"
    )


def projecteur():
    grid = "".join(f"<rect x='{62 + c * 13}' y='{58 + r * 13}' width='10' height='10' rx='2' fill='{W}' opacity='0.9'/>" for r in range(4) for c in range(6))
    return (
        f"<path d='M70 150 L100 120 L130 150' fill='none' stroke='{G}' stroke-width='6' stroke-linecap='round'/>"
        f"<rect x='50' y='44' width='100' height='70' rx='8' fill='{D}'/>{grid}"
        f"<rect x='92' y='112' width='16' height='12' fill='{G}'/>"
    )


def perforateur():
    return (
        f"<rect x='150' y='92' width='38' height='6' rx='3' fill='{S}'/>"
        f"<rect x='128' y='84' width='26' height='22' rx='5' fill='{M}'/>"
        f"<path d='M40 70 Q40 58 54 58 H130 Q140 58 140 70 V112 Q140 120 130 120 H70 Z' fill='{D}'/>"
        f"<path d='M56 118 L74 118 L66 166 Q64 172 56 172 H44 Q38 172 40 164 Z' fill='{G}'/>"
        f"<rect x='60' y='72' width='54' height='8' rx='4' fill='{W}' opacity='0.18'/>"
        f"<rect x='54' y='128' width='10' height='14' rx='3' fill='{L}'/>"
    )


def meuleuse():
    return (
        f"<ellipse cx='150' cy='118' rx='34' ry='12' fill='{S}'/><ellipse cx='150' cy='118' rx='10' ry='4' fill='{G}'/>"
        f"<rect x='126' y='86' width='30' height='30' rx='6' fill='{M}'/>"
        f"<rect x='30' y='80' width='110' height='34' rx='17' fill='{D}'/>"
        f"<rect x='44' y='86' width='40' height='6' rx='3' fill='{W}' opacity='0.2'/>"
        f"<rect x='120' y='62' width='10' height='24' rx='4' fill='{G}'/>"
    )


def kit_peintre():
    return (
        f"<rect x='40' y='62' width='92' height='30' rx='15' fill='{W}' stroke='{L}' stroke-width='2'/>"
        f"<path d='M132 77 H150 V110 H100 V132' fill='none' stroke='{G}' stroke-width='6' stroke-linejoin='round'/>"
        f"<rect x='92' y='130' width='16' height='38' rx='6' fill='{D}'/>"
        f"<g transform='rotate(24 60 130)'><rect x='52' y='92' width='18' height='30' rx='3' fill='{S}'/><rect x='54' y='120' width='14' height='10' fill='{M}'/><rect x='57' y='128' width='8' height='40' rx='4' fill='{D}'/></g>"
    )


def wc():
    return (
        f"<rect x='60' y='34' width='80' height='46' rx='8' fill='{W}' stroke='{L}' stroke-width='3'/>"
        f"<rect x='86' y='46' width='28' height='8' rx='4' fill='{L}'/>"
        f"<path d='M48 92 H152 Q152 140 112 146 L116 166 H84 L88 146 Q48 140 48 92 Z' fill='{W}' stroke='{L}' stroke-width='3'/>"
        f"<ellipse cx='100' cy='94' rx='46' ry='9' fill='{P}'/>"
    )


def mitigeur():
    return (
        f"<rect x='60' y='150' width='80' height='10' rx='5' fill='{S}'/>"
        f"<path d='M84 150 V96 Q84 76 104 76 H146 Q156 76 156 86 V96' fill='none' stroke='{M}' stroke-width='16' stroke-linecap='round'/>"
        f"<path d='M84 150 V96 Q84 76 104 76 H146 Q156 76 156 86 V96' fill='none' stroke='{L}' stroke-width='6' stroke-linecap='round' opacity='0.7'/>"
        f"<rect x='70' y='50' width='58' height='12' rx='6' fill='{D}' transform='rotate(-14 84 56)'/>"
        f"<rect x='78' y='58' width='14' height='22' rx='4' fill='{G}'/>"
    )


def chauffe_eau():
    return (
        f"<rect x='62' y='26' width='76' height='138' rx='36' fill='{W}' stroke='{L}' stroke-width='3'/>"
        f"<circle cx='100' cy='112' r='14' fill='{P}' stroke='{M}' stroke-width='3'/>"
        f"<path d='M100 112 L108 104' stroke='{D}' stroke-width='3' stroke-linecap='round'/>"
        f"<rect x='84' y='164' width='8' height='12' fill='{M}'/><rect x='108' y='164' width='8' height='12' fill='{M}'/>"
        + label(100, 76, "100 L", 14, D)
    )


def niveau_laser():
    return (
        f"<path d='M100 92 L20 60 M100 92 L180 60 M100 92 L100 22' stroke='{M}' stroke-width='2' stroke-dasharray='5 4'/>"
        f"<rect x='74' y='86' width='52' height='66' rx='8' fill='{D}'/>"
        f"<rect x='86' y='96' width='28' height='18' rx='4' fill='{G}'/><circle cx='100' cy='105' r='5' fill='{W}'/>"
        f"<rect x='84' y='152' width='32' height='8' rx='3' fill='{G}'/>"
    )


def brouette():
    return (
        f"<path d='M40 82 H150 L132 128 H66 Z' fill='{D}'/>"
        f"<path d='M44 82 H146' stroke='{G}' stroke-width='6' stroke-linecap='round'/>"
        f"<path d='M132 120 L182 106' stroke='{M}' stroke-width='6' stroke-linecap='round'/>"
        f"<path d='M80 128 L72 160 M118 128 L124 156' stroke='{M}' stroke-width='5' stroke-linecap='round'/>"
        f"<circle cx='58' cy='146' r='18' fill='{G}'/><circle cx='58' cy='146' r='7' fill='{L}'/>"
    )


def echafaudage():
    out = ""
    for x in (60, 140):
        out += f"<rect x='{x - 3}' y='30' width='6' height='126' fill='{M}'/>"
    for y in (40, 92, 144):
        out += f"<rect x='54' y='{y - 3}' width='92' height='6' fill='{G}'/>"
    out += f"<path d='M60 40 L140 92 M140 92 L60 144' stroke='{S}' stroke-width='4'/>"
    out += f"<rect x='50' y='86' width='100' height='8' rx='2' fill='{D}'/>"
    out += "".join(f"<circle cx='{x}' cy='162' r='8' fill='{D}'/>" for x in (60, 140))
    return out


def betonniere():
    return (
        f"<path d='M60 160 L84 104 M140 160 L116 104' stroke='{M}' stroke-width='6' stroke-linecap='round'/>"
        f"<g transform='rotate(-24 100 92)'><path d='M58 70 H132 Q152 92 132 114 H58 Q46 92 58 70 Z' fill='{D}'/>"
        f"<ellipse cx='138' cy='92' rx='10' ry='18' fill='{G}'/><rect x='70' y='76' width='50' height='6' rx='3' fill='{W}' opacity='0.2'/></g>"
        f"<circle cx='140' cy='160' r='12' fill='{G}'/><circle cx='140' cy='160' r='4' fill='{L}'/>"
    )


def gravier():
    stones = ""
    pts = [(70, 140), (90, 128), (112, 134), (130, 146), (100, 112), (82, 150), (118, 120), (140, 156), (60, 156), (104, 150), (95, 96), (124, 104)]
    for i, (x, y) in enumerate(pts):
        stones += f"<ellipse cx='{x}' cy='{y}' rx='{7 + i % 3}' ry='{5 + i % 2}' fill='{[M, G, S][i % 3]}'/>"
    return f"<path d='M30 166 Q100 40 170 166 Z' fill='{L}'/>" + stones


def sable():
    dots = "".join(f"<circle cx='{50 + (i * 37) % 100}' cy='{110 + (i * 23) % 52}' r='1.6' fill='{M}' opacity='0.6'/>" for i in range(40))
    return f"<path d='M26 166 Q100 56 174 166 Z' fill='{P}'/><path d='M60 120 Q100 70 140 120' fill='none' stroke='{W}' stroke-width='4' opacity='0.7'/>" + dots


def parpaing():
    def block(x, y):
        return iso_box(x, y, 60, 30, 30, P, S, L) + (
            f"<path d='M{x - 10} {y - 36} l20 -11.5 l-9 -5.2 l-20 11.5 Z M{x + 16} {y - 51} l20 -11.5 l-9 -5.2 l-20 11.5 Z' fill='{M}'/>"
        )
    return block(92, 168) + block(92, 136) + block(140, 140)


def casque():
    return (
        f"<path d='M48 120 Q48 56 100 56 Q152 56 152 120 Z' fill='{D}'/>"
        f"<rect x='94' y='56' width='12' height='64' fill='{G}'/>"
        f"<path d='M30 120 H170 Q170 132 158 132 H42 Q30 132 30 120 Z' fill='{G}'/>"
        f"<path d='M60 80 Q72 64 92 62' fill='none' stroke='{W}' stroke-width='5' stroke-linecap='round' opacity='0.3'/>"
        f"<rect x='54' y='146' width='92' height='16' rx='8' fill='{L}'/>"
    )


PRODUCTS = {
    "ciment": ciment,
    "fer": fer,
    "carrelage": carrelage,
    "peinture-facade": peinture_facade,
    "tube-pvc": tube_pvc,
    "cable": cable,
    "perforateur": perforateur,
    "brouette": brouette,
    "enduit": enduit,
    "gravier": gravier,
    "tableau": tableau,
    "faience": faience,
    "sable": sable,
    "parpaing": parpaing,
    "treillis": treillis,
    "colle": colle,
    "plinthe": plinthe,
    "parquet": parquet,
    "peinture-interieure": peinture_int,
    "sous-couche": sous_couche,
    "kit-peintre": kit_peintre,
    "wc": wc,
    "mitigeur": mitigeur,
    "chauffe-eau": chauffe_eau,
    "disjoncteur": disjoncteur,
    "prise": prise,
    "projecteur": projecteur,
    "meuleuse": meuleuse,
    "niveau-laser": niveau_laser,
    "echafaudage": echafaudage,
    "betonniere": betonniere,
    "casque": casque,
}

# ── Cinq vues par produit ─────────────────────
# 1 face · 2 gros plan · 3 autre fond, décalé · 4 studio (fond blanc) · 5 « fiche »
# sur fond quadrillé, légèrement tourné. Mêmes dessins, cadrages différents.
VIEWS = 5


def view(body: str, n: int) -> str:
    if n == 1:
        return frame(body)
    if n == 2:
        return frame(f"<g transform='translate(100 104) scale(1.5) translate(-100 -104)'>{body}</g>")
    if n == 3:
        return (
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200' width='200' height='200'>"
            f"<rect width='200' height='200' fill='{P}'/>"
            f"<rect x='0' y='150' width='200' height='50' fill='{L}' opacity='0.5'/>"
            f"<ellipse cx='88' cy='168' rx='58' ry='8' fill='{D}' opacity='0.12'/>"
            f"<g transform='translate(-12 4) scale(0.92)'>{body}</g></svg>"
        )
    if n == 4:
        # Studio : fond blanc, produit plus petit, beaucoup d'air (les
        # étiquettes restent lisibles — pas de vue inversée).
        return (
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200' width='200' height='200'>"
            "<rect width='200' height='200' fill='#FFFFFF'/>"
            f"<ellipse cx='100' cy='100' rx='92' ry='84' fill='{BG}'/>"
            f"<ellipse cx='100' cy='160' rx='52' ry='6' fill='{D}' opacity='0.10'/>"
            f"<g transform='translate(100 100) scale(0.74) translate(-100 -92)'>{body}</g></svg>"
        )
    grid = "".join(f"<path d='M{i} 0 V200 M0 {i} H200' stroke='{P}' stroke-width='1'/>" for i in range(0, 201, 20))
    return (
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200' width='200' height='200'>"
        f"<rect width='200' height='200' fill='{W}'/>{grid}"
        f"<ellipse cx='100' cy='170' rx='64' ry='8' fill='{D}' opacity='0.08'/>"
        f"<g transform='rotate(-7 100 110) translate(14 14) scale(0.86)'>{body}</g>"
        f"<path d='M28 186 H172 M28 182 V190 M172 182 V190' stroke='{M}' stroke-width='1.5'/></svg>"
    )


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "svg", "products")
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        os.remove(os.path.join(out, f))
    for name, fn in PRODUCTS.items():
        body = fn()
        for n in range(1, VIEWS + 1):
            with open(os.path.join(out, f"{name}-{n}.svg"), "w", encoding="utf8") as f:
                f.write(view(body, n))
    print(len(PRODUCTS), "produits ×", VIEWS, "vues")
