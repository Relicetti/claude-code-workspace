from PIL import Image, ImageDraw

size = 256
img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

bg = (26, 58, 92, 255)      # #1a3a5c - navy
accent = (240, 192, 64, 255)  # #f0c040 - dourado
branco = (255, 255, 255, 255)

radius = 48
d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=bg)

cx, cy = size / 2, size / 2
r = 78
espessura = 20

d.arc([cx - r, cy - r, cx + r, cy + r], start=-90, end=230, fill=branco, width=espessura)
d.arc([cx - r, cy - r, cx + r, cy + r], start=230, end=270, fill=accent, width=espessura)

import math
ang = math.radians(230 - 90)
px = cx + r * math.cos(math.radians(230))
py = cy + r * math.sin(math.radians(230))
d.ellipse([px - espessura / 2, py - espessura / 2, px + espessura / 2, py + espessura / 2], fill=accent)

img.save("icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (128, 128), (256, 256)])
print("ok")
