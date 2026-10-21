"""Illustrations de l'onboarding et de l'écran de bienvenue (320 × 240).

Fond transparent : l'écran pose l'illustration sur sa propre surface.
`python design/illustrations.py` écrit design/svg/illustrations/*.svg.
"""
import os

from products import BG, D, FONT, G, L, M, P, S, W, bucket, casque, ciment, carrelage, perforateur

CART = (
    "M16 27 H24 Q26.4 27 26.9 29.2 L36.5 58 M28.6 35 H80 Q83.2 35 82.2 38.2 L76.9 55.4 Q76 58 73 58 H36.5 "
    "M32.4 46.5 H79.4 M45 35 L46.6 58 M64 35 L61.6 58 M36.5 58 Q33 58.4 33 61.8 Q33 65.2 36.6 65.2 H72"
)


def svg(body):
    return f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 240' width='320' height='240'>{body}</svg>"


def logo(x, y, size, square=D, ink=W):
    """Le logo (chariot) : carré arrondi de `size` px en (x, y)."""
    k = size / 100
    return (
        f"<g transform='translate({x} {y}) scale({k})'>"
        f"<rect width='100' height='100' rx='24' fill='{square}'/>"
        f"<g fill='none' stroke='{ink}' stroke-width='4.4' stroke-linecap='round' stroke-linejoin='round'>"
        f"<path d='{CART}'/><circle cx='41' cy='75.5' r='3.7'/><circle cx='67.5' cy='75.5' r='3.7'/></g></g>"
    )


def place(fn, x, y, size):
    """Pose une illustration produit (200 × 200, sans son fond) en (x, y)."""
    k = size / 200
    return f"<g transform='translate({x} {y}) scale({k})'>{fn()}</g>"


def blob(cx=160, cy=124, rx=128, ry=96):
    return f"<ellipse cx='{cx}' cy='{cy}' rx='{rx}' ry='{ry}' fill='{P}' opacity='0.55'/>"


def floor(cy=212, rx=110):
    return f"<ellipse cx='160' cy='{cy}' rx='{rx}' ry='9' fill='{D}' opacity='0.10'/>"


def phone(x, y, w=96, h=176, screen=""):
    return (
        f"<g transform='translate({x} {y})'>"
        f"<rect width='{w}' height='{h}' rx='16' fill='{D}'/>"
        f"<rect x='6' y='10' width='{w - 12}' height='{h - 20}' rx='10' fill='{W}'/>"
        f"<rect x='{w / 2 - 12}' y='4' width='24' height='3' rx='1.5' fill='{G}'/>"
        f"{screen}</g>"
    )


def catalogue():
    tiles = ""
    for r in range(3):
        for c in range(2):
            x, y = 12 + c * 37, 40 + r * 40
            tiles += f"<rect x='{x}' y='{y}' width='33' height='36' rx='5' fill='{P}'/>"
            tiles += f"<rect x='{x + 4}' y='{y + 26}' width='18' height='4' rx='2' fill='{S}'/>"
    screen = (
        f"<rect x='12' y='18' width='70' height='14' rx='7' fill='{P}'/>"
        f"<circle cx='21' cy='25' r='3' fill='{M}'/>" + tiles
    )
    return svg(
        blob()
        + floor()
        + phone(112, 30, screen=screen)
        + place(ciment, 22, 92, 120)
        + place(lambda: bucket("PEINTURE"), 196, 104, 104)
        + place(carrelage, 200, 20, 84)
        + place(perforateur, 30, 14, 88)
    )


def storefront(x, y, w, h, stripe):
    awning = "".join(
        f"<path d='M{x + i * w / 6} {y} h{w / 6} v14 q-{w / 12} 8 -{w / 6} 0 Z' fill='{stripe if i % 2 == 0 else W}'/>" for i in range(6)
    )
    return (
        f"<rect x='{x + 4}' y='{y + 10}' width='{w - 8}' height='{h}' fill='{W}'/>"
        f"<rect x='{x}' y='{y - 8}' width='{w}' height='10' rx='2' fill='{D}'/>"
        + awning
        + f"<rect x='{x + 12}' y='{y + 30}' width='{w * 0.36}' height='{h - 20}' rx='2' fill='{L}'/>"
        f"<rect x='{x + w * 0.56}' y='{y + 30}' width='{w * 0.32}' height='{h * 0.42}' rx='2' fill='{P}' stroke='{L}' stroke-width='2'/>"
    )


def boutiques():
    pin = (
        "<g transform='translate(136 8)'>"
        f"<path d='M24 0 C37 0 48 10 48 23 C48 40 24 62 24 62 C24 62 0 40 0 23 C0 10 11 0 24 0 Z' fill='{D}'/>"
        + logo(10, 9, 28, square=W, ink=D)
        + "</g>"
    )
    return svg(
        blob(cy=132)
        + floor(cy=214, rx=130)
        + f"<rect x='24' y='200' width='272' height='6' rx='3' fill='{L}'/>"
        + storefront(34, 118, 78, 82, M)
        + storefront(121, 96, 78, 104, D)
        + storefront(208, 118, 78, 82, S)
        + pin
    )


def livraison():
    building = (
        f"<rect x='214' y='70' width='70' height='130' fill='none' stroke='{S}' stroke-width='4'/>"
        + "".join(f"<line x1='214' y1='{y}' x2='284' y2='{y}' stroke='{S}' stroke-width='3'/>" for y in (102, 134, 166))
        + "".join(f"<line x1='{x}' y1='70' x2='{x}' y2='200' stroke='{S}' stroke-width='3'/>" for x in (237, 261))
        # Grue
        + f"<rect x='292' y='28' width='6' height='172' fill='{M}'/><rect x='196' y='26' width='112' height='6' fill='{M}'/>"
        + f"<line x1='212' y1='32' x2='212' y2='58' stroke='{G}' stroke-width='2'/><rect x='204' y='58' width='16' height='10' fill='{D}'/>"
    )
    truck = (
        "<g transform='translate(20 108)'>"
        f"<rect x='0' y='10' width='118' height='72' rx='6' fill='{L}'/>"
        + logo(36, 23, 46)
        + f"<path d='M118 30 H150 L172 54 V82 H118 Z' fill='{D}'/>"
        f"<path d='M126 38 H146 L162 56 H126 Z' fill='{P}'/>"
        f"<rect x='0' y='78' width='174' height='8' rx='3' fill='{G}'/>"
        f"<circle cx='34' cy='92' r='14' fill='{D}'/><circle cx='34' cy='92' r='5' fill='{L}'/>"
        f"<circle cx='144' cy='92' r='14' fill='{D}'/><circle cx='144' cy='92' r='5' fill='{L}'/>"
        "</g>"
    )
    speed = "".join(f"<rect x='{x}' y='{y}' width='{w}' height='4' rx='2' fill='{S}'/>" for x, y, w in ((0, 130, 14), (2, 150, 10), (0, 170, 16)))
    return svg(blob() + floor() + f"<rect x='0' y='214' width='320' height='4' fill='{L}'/>" + building + truck + speed)


def suivi():
    steps = ""
    for i, (done, text_w) in enumerate(((True, 44), (True, 50), (True, 38), (False, 46))):
        y = 44 + i * 32
        steps += f"<circle cx='22' cy='{y}' r='8' fill='{D if done else W}' stroke='{D if done else L}' stroke-width='2'/>"
        if done:
            steps += f"<path d='M18 {y} l3 3 l5 -6' fill='none' stroke='{W}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>"
        if i < 3:
            steps += f"<line x1='22' y1='{y + 8}' x2='22' y2='{y + 24}' stroke='{D if i < 2 else L}' stroke-width='2'/>"
        steps += f"<rect x='36' y='{y - 6}' width='{text_w}' height='5' rx='2.5' fill='{M if done else L}'/>"
        steps += f"<rect x='36' y='{y + 2}' width='{text_w - 16}' height='4' rx='2' fill='{P}'/>"
    box = (
        "<g transform='translate(186 96)'>"
        f"<path d='M0 30 L52 4 L104 30 L52 56 Z' fill='{P}'/>"
        f"<path d='M0 30 V88 L52 114 V56 Z' fill='{S}'/>"
        f"<path d='M104 30 V88 L52 114 V56 Z' fill='{L}'/>"
        f"<path d='M26 17 L78 43 V60 L70 56 V47 L18 21 Z' fill='{M}'/>"
        "</g>"
        f"<circle cx='280' cy='96' r='20' fill='{D}'/>"
        f"<path d='M271 96 l6 6 l12 -13' fill='none' stroke='{W}' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/>"
    )
    return svg(blob() + floor() + phone(70, 28, screen=steps) + box)


def bienvenue():
    buildings = ""
    for x, w, h, c in ((26, 46, 92, L), (78, 58, 132, S), (142, 40, 74, L), (188, 54, 112, P), (248, 44, 86, L)):
        buildings += f"<rect x='{x}' y='{206 - h}' width='{w}' height='{h}' rx='3' fill='{c}'/>"
        for wy in range(206 - h + 12, 196, 18):
            for wx in range(x + 8, x + w - 10, 14):
                buildings += f"<rect x='{wx}' y='{wy}' width='7' height='9' rx='1' fill='{W}' opacity='0.8'/>"
    crane = (
        f"<rect x='228' y='20' width='6' height='186' fill='{D}'/>"
        f"<rect x='150' y='18' width='150' height='6' fill='{D}'/>"
        f"<path d='M228 18 L238 4 L248 18' fill='none' stroke='{D}' stroke-width='4'/>"
        f"<rect x='286' y='24' width='14' height='18' fill='{G}'/>"
        f"<line x1='172' y1='24' x2='172' y2='62' stroke='{G}' stroke-width='2'/>"
        f"<rect x='162' y='62' width='20' height='8' fill='{M}'/>"
    )
    return svg(
        f"<circle cx='86' cy='70' r='34' fill='{P}'/>"
        + buildings
        + crane
        + f"<rect x='10' y='204' width='300' height='6' rx='3' fill='{G}'/>"
        + logo(130, 150, 60)
    )


ILLUSTRATIONS = {"catalogue": catalogue, "boutiques": boutiques, "livraison": livraison, "suivi": suivi, "bienvenue": bienvenue}

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "svg", "illustrations")
    os.makedirs(out, exist_ok=True)
    for name, fn in ILLUSTRATIONS.items():
        with open(os.path.join(out, f"{name}.svg"), "w", encoding="utf8") as f:
            f.write(fn())
    print(len(ILLUSTRATIONS), "illustrations")
