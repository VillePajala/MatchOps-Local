"""Caption overlays from out/captions.json: a rounded band that hugs its text, bottom third of the screen.
Style 'plain' draws for the full 1080x1920 canvas; 'phone' draws inside the phone screen from phone-geom.json.
Usage: python3 render/captions.py [--style plain|phone]"""
import argparse, json, os
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'out')
ap = argparse.ArgumentParser(); ap.add_argument('--style', default='phone'); args = ap.parse_args()
W, H = 1080, 1920; caps = json.load(open(os.path.join(OUT, 'captions.json')))
if args.style == 'phone':
    G = json.load(open(os.path.join(OUT, 'phone-geom.json'))); size, wrap_w, box_max, bottom, lh, pad = 48, 680, G['SW'] - 60, G['SY'] + G['SH'] - 230, 58, 20
else:
    size, wrap_w, box_max, bottom, lh, pad = 52, 860, 920, H - 260, 62, 22
font = ImageFont.truetype(os.path.join(ROOT, 'assets', 'Rajdhani-Bold.ttf'), size)
for k, text in caps.items():
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im); lines, cur = [], ''
    for w in text.split():
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=font) > wrap_w and cur: lines.append(cur); cur = w
        else: cur = t
    lines.append(cur); h = lh * len(lines) + 2 * pad; y0 = bottom - h
    bw = min(box_max, max(d.textlength(l, font=font) for l in lines) + 64); x0 = (W - bw) / 2
    d.rounded_rectangle((x0, y0, x0 + bw, y0 + h), radius=18, fill=(11, 18, 32, 200))
    for i, l in enumerate(lines):
        tw = d.textlength(l, font=font); d.text(((W - tw) / 2, y0 + pad + i * lh), l, font=font, fill=(255, 255, 255, 255))
    im.save(os.path.join(OUT, f'cap_{args.style}_{k.replace(".", "_")}.png'))
print('captions ok', len(caps), args.style)
