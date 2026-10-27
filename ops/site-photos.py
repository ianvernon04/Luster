#!/usr/bin/env python3
"""Turns the website's photographs into welcome/img/*.webp.
   python3 ops/site-photos.py <dir with luster-photo-*.jpg> <ian.jpg>

The studio photos are free Unsplash photos (Unsplash License), downloaded at the sizes in welcome/img/credits.txt and
named luster-photo-<slot>.jpg. They set the mood and are never presented as Luster's customers: no names, quotes or
captions under them that say otherwise. ian.jpg is Ian's own photo; it's turned upright and saved without its
metadata (an iPhone photo carries the GPS position where it was taken)."""
import sys, os
from PIL import Image, ImageOps

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src, ian = sys.argv[1], sys.argv[2]
out = os.path.join(root, 'welcome', 'img'); os.makedirs(out, exist_ok=True)

# name: (source, crop box in source pixels or None, width on the site at 2x, quality)
JOBS = {
    'photo-hero':   ('luster-photo-hero.jpg',    (0, 190, 1600, 2190), 1000, 72),   # 4:5, her face in the top third
    'photo-band':   ('luster-photo-band.jpg',    None,                 1600, 70),   # the CSS crops it to the band
    'photo-desk':   ('luster-photo-desk.jpg',    (0, 315, 1600, 2315),  800, 72),
    'kind-skin':    ('luster-photo-skin.jpg',    (0, 118, 1200, 1618),  480, 72),
    'kind-medspa':  ('luster-photo-medspa.jpg',  None,                  480, 72),
    'kind-massage': ('luster-photo-massage.jpg', (48, 0, 688, 800),     480, 72),
    'kind-lash':    ('luster-photo-lash.jpg',    (246, 0, 886, 800),    480, 72),
    'kind-hair':    ('luster-photo-hair.jpg',    (0, 100, 1200, 1600),  480, 72),
    'kind-nails':   ('luster-photo-nails.jpg',   (220, 0, 860, 800),    480, 72),
    'kind-barber':  ('luster-photo-barber.jpg',  (480, 0, 1120, 800),   480, 72),
    'ian':          (None,                       (540, 240, 1180, 1040), 640, 78),  # 4:5, no cars' plates or signs in frame
    'ian-face':     (None,                       (610, 255, 910, 555),   200, 80),
}
for name, (file, box, width, q) in JOBS.items():
    im = ImageOps.exif_transpose(Image.open(ian if file is None else os.path.join(src, file))).convert('RGB')
    if box: im = im.crop(box)
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    dest = os.path.join(out, name + '.webp')
    im.save(dest, 'WEBP', quality=q, method=6)   # a fresh image: no EXIF, no GPS
    print(f'{name}.webp  {im.width}x{im.height}  {os.path.getsize(dest) // 1024} KB')
