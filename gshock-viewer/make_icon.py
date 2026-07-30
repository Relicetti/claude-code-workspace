"""Gera icon.ico do G-Shock Viewer (preto estilo G-Shock + linha de batimentos)."""
from PIL import Image, ImageDraw

S = 256
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

preto = (22, 23, 26, 255)     # #16171a - fundo G-Shock
vermelho = (235, 64, 52, 255) # #eb4034 - batimentos
cinza = (60, 63, 70, 255)     # detalhe do bezel

# fundo arredondado + borda sutil
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=52, fill=preto)
d.rounded_rectangle([6, 6, S - 7, S - 7], radius=46, outline=cinza, width=4)

# linha de batimento (ECG): reta -> pico pra cima -> vale -> reta
w = 14
mid = S // 2
pts = [
    (28, mid), (78, mid), (98, mid - 16),
    (120, mid + 58), (146, mid - 78), (168, mid + 20),
    (188, mid), (S - 28, mid),
]
d.line(pts, fill=vermelho, width=w, joint="curve")
# arredonda as pontas da linha
for (px, py) in (pts[0], pts[-1]):
    d.ellipse([px - w/2, py - w/2, px + w/2, py + w/2], fill=vermelho)

img.save("icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (128, 128), (256, 256)])
img.save("icon.png")
print("ok: icon.ico + icon.png")
