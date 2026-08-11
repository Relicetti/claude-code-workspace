from PIL import Image, ImageDraw

size = 256
img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

bg = (30, 41, 59, 255)      # navy escuro
accent = (42, 120, 214, 255)  # azul do app (#2a78d6)
bolt = (255, 255, 255, 255)

radius = 48
d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=bg)

cx, cy = size / 2, size / 2
r = 92
d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=accent)

# raio estilizado (bateria/energia)
bolt_pts = [
    (cx + 14, cy - 78),
    (cx - 46, cy + 10),
    (cx - 4, cy + 10),
    (cx - 14, cy + 78),
    (cx + 46, cy - 14),
    (cx + 4, cy - 14),
]
d.polygon(bolt_pts, fill=bolt)

img.save("icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (128, 128), (256, 256)])
print("ok")
