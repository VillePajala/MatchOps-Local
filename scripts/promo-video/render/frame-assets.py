"""Static frames: intro card, end card with the Google Play badge, and the phone frame layers.
Usage: python3 render/frame-assets.py [--tagline "..."] [--lang fi|en]"""
import argparse, json, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'out'); A = os.path.join(ROOT, 'assets')
ap = argparse.ArgumentParser(); ap.add_argument('--tagline', default='Suunnittele - kirjaa - oivalla'); ap.add_argument('--lang', default='fi'); ap.add_argument('--icon', default=os.path.join(ROOT, '..', '..', 'public', 'icons', 'icon-512x512.png'))
args = ap.parse_args(); os.makedirs(OUT, exist_ok=True)
W, H = 1080, 1920; NAVY = (11, 18, 32); AMBER = (251, 191, 36); INK2 = (199, 210, 254)
F = lambda s: ImageFont.truetype(os.path.join(A, 'Rajdhani-Bold.ttf'), s)
# intro: icon, wordmark, tagline
img = Image.new('RGB', (W, H), NAVY); d = ImageDraw.Draw(img)
logo = Image.open(args.icon).convert('RGBA').resize((300, 300)); img.paste(logo, ((W - 300) // 2, H // 2 - 420), logo)
w = d.textlength('MatchOps', font=F(150)); d.text(((W - w) / 2, H // 2 - 80), 'MatchOps', font=F(150), fill=AMBER)
w = d.textlength(args.tagline, font=F(60)); d.text(((W - w) / 2, H // 2 + 110), args.tagline, font=F(60), fill=INK2)
img.save(os.path.join(OUT, 'intro.png'))
# end card: wordmark + official badge
img = Image.new('RGB', (W, H), NAVY); d = ImageDraw.Draw(img)
w = d.textlength('MatchOps', font=F(150)); d.text(((W - w) / 2, H / 2 - 190), 'MatchOps', font=F(150), fill=AMBER)
badge = Image.open(os.path.join(A, f'google-play-badge-{args.lang}.png')).convert('RGBA'); bw = 520; badge = badge.resize((bw, int(badge.height * bw / badge.width))); img.paste(badge, ((W - bw) // 2, H // 2 + 30), badge)
img.save(os.path.join(OUT, 'end.png'))
# phone frame, like the marketing site's .phone-frame: thin graphite bezel, camera dot, soft shadow and amber glow.
BZ = 14; MY = 54; SH = H - 2 * (MY + BZ); SW = round(SH * 390 / 844); SX = (W - SW) // 2; SY = MY + BZ; RI = 52; RO = RI + BZ
under = Image.new('RGBA', (W, H), NAVY + (255,))
gl = Image.new('RGBA', (W, H), (0, 0, 0, 0)); gd = ImageDraw.Draw(gl); gd.rounded_rectangle((SX - BZ - 10, SY - BZ - 10, SX + SW + BZ + 10, SY + SH + BZ + 10), radius=RO + 10, fill=(245, 158, 11, 70)); gl = gl.filter(ImageFilter.GaussianBlur(40))
sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(sh); sd.rounded_rectangle((SX - BZ, SY - BZ + 26, SX + SW + BZ, SY + SH + BZ + 26), radius=RO, fill=(0, 0, 0, 170)); sh = sh.filter(ImageFilter.GaussianBlur(28))
under = Image.alpha_composite(Image.alpha_composite(under, gl), sh); under.convert('RGB').save(os.path.join(OUT, 'phone-under.png'))
grad = Image.new('RGBA', (W, H), (0, 0, 0, 0)); g = ImageDraw.Draw(grad)
for i in range(H): c = int(58 - 32 * i / H); g.line((0, i, W, i), fill=(c, c, c, 255))
ring = Image.new('L', (W, H), 0); rd = ImageDraw.Draw(ring); rd.rounded_rectangle((SX - BZ, SY - BZ, SX + SW + BZ, SY + SH + BZ), radius=RO, fill=255); rd.rounded_rectangle((SX, SY, SX + SW, SY + SH), radius=RI, fill=0)
over = Image.new('RGBA', (W, H), (0, 0, 0, 0)); over.paste(grad, (0, 0), ring); d = ImageDraw.Draw(over)
d.rounded_rectangle((SX - BZ, SY - BZ, SX + SW + BZ, SY + SH + BZ), radius=RO, outline=(255, 255, 255, 28), width=2)
d.ellipse((W // 2 - 6, SY - BZ + 4, W // 2 + 6, SY - BZ + 16), fill=(31, 41, 55, 255)); d.ellipse((W // 2 - 3, SY - BZ + 6, W // 2 + 3, SY - BZ + 12), fill=(70, 80, 95, 255))
over.save(os.path.join(OUT, 'phone-over.png'))
json.dump({'SW': SW, 'SH': SH, 'SX': SX, 'SY': SY}, open(os.path.join(OUT, 'phone-geom.json'), 'w'))
print('frame assets ok', SW, SH, SX, SY)
