"""Rebuilds public/sprites/units/*.webp and public/tiles/*.webp from the raw art in Units/ and Maptiles/.
   python3 tools/buildArt.py        (needs Pillow)
Units are cropped to their opaque bounding box and scaled to 320px tall; plains tiles are cut into a 2:1 iso diamond."""
import os
from PIL import Image, ImageDraw
UNITS = {
 'ratha_kaurava_1':'Chariot_kauravas','ratha_kaurava_2':'Chariot_kauravas2','ratha_pandava_1':'Chariot_pandavas','ratha_pandava_2':'Chariots_pandavas2',
 'gaja_kaurava_1':'Gaja_kauravas','gaja_kaurava_2':'Gaja_kauravas2','gaja_pandava_1':'Gaja_pandavas','gaja_pandava_2':'Gaja_pandavas2','gaja_neutral':'Gaja',
 'ashva_kaurava_1':'padathi_cavalry_kauravas','ashva_kaurava_2':'padathi_cavalry_kauravas2','ashva_pandava_1':'padathi_cavalry_pandavas','ashva_pandava_2':'padathi_cavalry_pandavas2',
 'archer_kaurava_1':'padathi_archers_kaurava','archer_pandava_1':'padathi_archers_pandava','archer_neutral':'padathi_archers',
 'melee_kaurava_1':'padathi_melee_kaurava','melee_kaurava_2':'padathi_melee_kaurava2','melee_pandava_1':'padathi_melee_pandava','melee_pandava_2':'padathi_melee_pandava2','melee_neutral':'padthi_melee',
 'pair_arjuna_krishna':'Arjuna_krishna_chariot','pair_arjuna_sikhandi':'Arjuna_sikhandi',
}
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(f'{root}/public/sprites/units', exist_ok=True); os.makedirs(f'{root}/public/tiles', exist_ok=True)
for slug, src in UNITS.items():
    im = Image.open(f'{root}/Units/{src}.webp').convert('RGBA'); im = im.crop(im.getchannel('A').getbbox())
    h = 320; im = im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)
    im.save(f'{root}/public/sprites/units/{slug}.webp', quality=86, method=6)
for n in ('plains1', 'plains2'):
    im = Image.open(f'{root}/Maptiles/{n}.webp').convert('RGB')
    W, H = 256, 128                                    # 2x of the 128x64 tile
    im = im.resize((W, H), Image.LANCZOS).convert('RGBA')
    m = Image.new('L', (W * 4, H * 4), 0); ImageDraw.Draw(m).polygon([(W*2, 0), (W*4, H*2), (W*2, H*4), (0, H*2)], fill=255)
    im.putalpha(m.resize((W, H), Image.LANCZOS)); im.save(f'{root}/public/tiles/{n}.webp', quality=88, method=6)
print('ok')
