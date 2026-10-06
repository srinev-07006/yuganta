"""Builds the terrain tiles, props and the fire animation sheet from the raw art.
   python3 tools/buildTerrainArt.py            (needs Pillow, numpy and ffmpeg for the fire sheet)

   Maptiles/<name>.webp   1024² square ground art   → public/tiles/<name>.webp   256×128 iso diamond (plains1/2 are left alone: they ship pre-built)
   Props/<name>.webp      large transparent sprites → public/props/<slug>.webp   cropped to the opaque box, 2× display width
   Props/fire_animation.mp4 (fake checkerboard "alpha") → public/props/fire_sheet.webp  keyed to transparent, 12 frames, 4×3 grid
Run from anywhere; paths are relative to the repo root. Display sizes live in src/data/TerrainArt.js (keep PROP_WIDTH there in step)."""
import os, subprocess, tempfile, glob
import numpy as np
from PIL import Image, ImageDraw

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(f'{root}/public/tiles', exist_ok=True); os.makedirs(f'{root}/public/props', exist_ok=True)

# ---- tiles -------------------------------------------------------------------------------------------------------
SKIP = {'plains1', 'plains2'}
W, H = 256, 128                                                    # 2× of the 128×64 game tile
mask = Image.new('L', (W * 4, H * 4), 0); ImageDraw.Draw(mask).polygon([(W*2, 0), (W*4, H*2), (W*2, H*4), (0, H*2)], fill=255)
mask = mask.resize((W, H), Image.LANCZOS)
n_tiles = 0
for f in sorted(glob.glob(f'{root}/Maptiles/*.webp')):
    name = os.path.splitext(os.path.basename(f))[0]
    if name in SKIP: continue
    im = Image.open(f).convert('RGB').resize((W, H), Image.LANCZOS).convert('RGBA'); im.putalpha(mask)
    im.save(f'{root}/public/tiles/{name}.webp', quality=86, method=6); n_tiles += 1

# ---- props -------------------------------------------------------------------------------------------------------
# source file → (output slug, display width in game px). Typo in the source name (moutain1) is fixed on the way out.
PROPS = {'trees1': ('trees1', 124), 'tree2': ('tree2', 112), 'tree3': ('tree3', 118), 'fir': ('fir', 104),
         'moutain1': ('mountain1', 150), 'mountain2': ('mountain2', 150), 'fortified_battlement': ('fortified_battlement', 128),
         'pandava_tent': ('pandava_tent', 120), 'kaurava_tent': ('kaurava_tent', 120), 'pillar': ('pillar', 46),
         'wall': ('wall', 124), 'rubble': ('rubble', 100), 'fire': ('fire', 84), 'shrine': ('shrine', 108)}
n_props = 0
for src, (slug, disp) in PROPS.items():
    p = f'{root}/Props/{src}.webp'
    if not os.path.exists(p): print('  missing', p); continue
    im = Image.open(p).convert('RGBA'); im = im.crop(im.getchannel('A').getbbox())
    w = disp * 2; im = im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)
    im.save(f'{root}/public/props/{slug}.webp', quality=86, method=6); n_props += 1

# ---- fire animation ------------------------------------------------------------------------------------------------
vid = f'{root}/Props/fire_animation.mp4'
if os.path.exists(vid):
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', vid, f'{td}/f%03d.png'], check=True)
        frames = sorted(glob.glob(f'{td}/f*.png'))
        pick = [frames[round(i * (len(frames) - 1) / 11)] for i in range(12)]
        fw, fh = 168, round(168 * 662 / 516)
        sheet = Image.new('RGBA', (fw * 4, fh * 3), (0, 0, 0, 0))
        for i, fp in enumerate(pick):
            im = Image.open(fp).convert('RGB'); a = np.asarray(im).astype(np.float32) / 255
            mx, mn = a.max(2), a.min(2); sat = (mx - mn) / np.maximum(mx, 1e-4)
            bg = (sat < 0.10) & (mx > 0.70)                      # the checkerboard: pale and unsaturated; logs/flames are neither
            alpha = Image.fromarray(((~bg) * 255).astype(np.uint8)).resize(im.size)
            # soften the key edge so the flame tips do not carry a grey halo
            from PIL import ImageFilter
            alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
            rgba = im.convert('RGBA'); rgba.putalpha(alpha)
            rgba = rgba.crop(rgba.getchannel('A').getbbox() or (0, 0, *rgba.size)) if False else rgba
            rgba = rgba.resize((fw, fh), Image.LANCZOS)
            sheet.paste(rgba, ((i % 4) * fw, (i // 4) * fh))
        sheet.save(f'{root}/public/props/fire_sheet.webp', quality=84, method=6)
        print('fire sheet', sheet.size, 'frame', (fw, fh))
print(f'ok: {n_tiles} tiles, {n_props} props')
