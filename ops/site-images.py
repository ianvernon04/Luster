#!/usr/bin/env python3
"""Turns the screenshots from ops/site-shots.mjs into the website's images (welcome/img/*.webp).
   python3 ops/site-images.py [shots-dir]"""
import sys, os
from PIL import Image

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
shots = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'supabase', 'test', 'shots', 'site')
out = os.path.join(root, 'welcome', 'img'); os.makedirs(out, exist_ok=True)

# name: (screenshot, crop box in screenshot pixels or None, width on the site at 2x)
JOBS = {
    'hero-ipad':    ('ipad-calendar.png', None, 1280),
    'hero-phone':   ('phone-booked.png', None, 440),
    'step-book':    ('phone-services.png', None, 440),
    'step-intake':  ('phone-intake.png', None, 440),
    'step-caution': ('ipad-caution.png', (1500, 0, 2360, 1236), 520),   # the appointment drawer, cautions on top
    'client-file':  ('ipad-client.png', None, 1280),
}
for name, (src, box, width) in JOBS.items():
    im = Image.open(os.path.join(shots, src)).convert('RGB')
    if box: im = im.crop(box)
    h = round(im.height * width / im.width)
    im = im.resize((width, h), Image.LANCZOS)
    dest = os.path.join(out, name + '.webp')
    im.save(dest, 'WEBP', quality=74, method=6)   # small enough to ship inside a release, still sharp on a phone
    print(f'{name}.webp  {width}x{h}  {os.path.getsize(dest) // 1024} KB')
