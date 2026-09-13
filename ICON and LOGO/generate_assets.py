# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
# ─── Sampler.Like.Audio ──────────────────────────────────────────────────────
# https://Sampler.Like.audio · Written by Anthony P. Kuzub · i @ Like . audio
#
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
#
# Every visual representation in this project is an HOMAGE to classic hardware.
# There is no affiliation with, or endorsement by, any of the original designers
# or manufacturers; their layouts appear here only because they are familiar
# interfaces, and every name they are known by remains the property of its owner.
# ─────────────────────────────────────────────────────────────────────────────

import math
import random
import os
from PIL import Image, ImageDraw

def generate_icon(size, output_path):
    image = Image.new("RGBA", (size, size), (20, 20, 20, 255))
    draw = ImageDraw.Draw(image)
    
    grid_size = 16
    cell_w = size / grid_size
    line_color = (60, 60, 60, 255)
    wave_color = (244, 144, 44, 255)
    
    for i in range(grid_size + 1):
        x = int(i * cell_w)
        draw.line([(x, 0), (x, size)], fill=line_color, width=max(1, int(size/200)))
        y = int(i * cell_w)
        draw.line([(0, y), (size, y)], fill=line_color, width=max(1, int(size/200)))
        
    center_y = size / 2
    points = []
    
    # Create an impressive waveform
    for x in range(size):
        nx = x / size
        
        # Envelope mimicking a kick drum + tail
        envelope = math.exp(-nx * 10) * (1 - math.exp(-nx * 50))
        
        value = math.sin(nx * 40 * math.pi) * envelope
        noise = (random.random() - 0.5) * 0.3 * envelope
        
        y = center_y + (value + noise) * (size * 0.4)
        points.append((x, int(y)))
        
    draw.line(points, fill=wave_color, width=max(2, int(size/40)))
    
    border_w = max(2, int(size/20))
    draw.rectangle([border_w//2, border_w//2, size - border_w//2, size - border_w//2], outline=wave_color, width=border_w)
    
    image.save(output_path)
    print(f"Saved {output_path}")

os.chdir("/home/anthony/Documents/GitProjects/Sampler.Like.Audio/ICON and LOGO")
generate_icon(16, "favicon.ico")
generate_icon(192, "icon-192.png")
generate_icon(512, "icon-512.png")
generate_icon(1024, "splash.png")
