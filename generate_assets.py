from PIL import Image, ImageDraw
import os

os.makedirs("resources", exist_ok=True)
GOLD  = (201, 168, 76)
BLACK = (10, 10, 10)
logo  = Image.open("www/logo.jpg").convert("RGBA")

# icon.png 1024x1024
SZ    = 1024
pad   = int(SZ * 0.08)
inner = SZ - 2 * pad
sm    = logo.resize((inner, inner), Image.LANCZOS)
mask  = Image.new("L", (inner, inner), 0)
ImageDraw.Draw(mask).ellipse([0, 0, inner-1, inner-1], fill=255)
base  = Image.new("RGB", (SZ, SZ), BLACK)
base.paste(sm.convert("RGB"), (pad, pad), mask)
out   = base.convert("RGBA")
lw    = max(6, SZ // 60)
ImageDraw.Draw(out).ellipse([lw//2, lw//2, SZ-lw//2-1, SZ-lw//2-1], outline=GOLD, width=lw)
out.save("resources/icon.png")

# splash.png 2732x2732
W = H = 2732
spl   = Image.new("RGB", (W, H), BLACK)
d     = ImageDraw.Draw(spl)
cx, cy = W//2, H//2
for i in range(50, 0, -1):
    t  = i / 50
    ac = tuple(int(BLACK[c] + (GOLD[c] - BLACK[c]) * t * 0.20) for c in range(3))
    rp = int(min(W, H) * 0.42 * t)
    d.ellipse([cx-rp, cy-rp, cx+rp, cy+rp], fill=ac)
lr    = int(min(W, H) * 0.28)
lsq   = lr * 2
big   = logo.resize((lsq, lsq), Image.LANCZOS)
cm    = Image.new("L", (lsq, lsq), 0)
ImageDraw.Draw(cm).ellipse([0, 0, lsq-1, lsq-1], fill=255)
spl.paste(big.convert("RGB"), (cx-lr, cy-lr), cm)
lw2   = max(8, lr // 20)
d.ellipse([cx-lr-lw2, cy-lr-lw2, cx+lr+lw2, cy+lr+lw2], outline=GOLD, width=lw2)
spl.save("resources/splash.png")

print("resources/icon.png and resources/splash.png generated")
