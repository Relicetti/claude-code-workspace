import math
from PIL import Image, ImageDraw

size = 256
img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

bg = (26, 58, 92, 255)     # #1a3a5c - navy da paleta do app
sun = (240, 192, 64, 255)  # #f0c040 - dourado da paleta do app

radius = 48
d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=bg)

cx, cy = size / 2, size / 2 - 4
r_core = 46
r_ray_in = 62
r_ray_out = 96

for i in range(8):
    ang = math.radians(i * 45)
    perp = ang + math.pi / 2
    half_w = 9
    tip_x = cx + r_ray_out * math.cos(ang)
    tip_y = cy + r_ray_out * math.sin(ang)
    base1_x = cx + r_ray_in * math.cos(ang) + half_w * math.cos(perp)
    base1_y = cy + r_ray_in * math.sin(ang) + half_w * math.sin(perp)
    base2_x = cx + r_ray_in * math.cos(ang) - half_w * math.cos(perp)
    base2_y = cy + r_ray_in * math.sin(ang) - half_w * math.sin(perp)
    d.polygon([(tip_x, tip_y), (base1_x, base1_y), (base2_x, base2_y)], fill=sun)

d.ellipse([cx - r_core, cy - r_core, cx + r_core, cy + r_core], fill=sun)

img.save("icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (128, 128), (256, 256)])
print("ok")
