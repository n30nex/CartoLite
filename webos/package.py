"""Package the CI-produced default map with the official webOS CLI."""
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import zlib

ROOT = Path(__file__).resolve().parent
DIST = ROOT / 'dist'
info = json.loads((ROOT / 'appinfo.json').read_text())
assert (DIST / 'index.html').is_file(), 'Run the webOS Vite build in CI first'
assert (DIST / 'tv-polyfills.js').is_file()
(DIST / 'appinfo.json').write_text(json.dumps(info, indent=2) + '\n')
(DIST / 'build-info.json').write_text(json.dumps({
    'commit': os.environ['CARTOLITE_COMMIT'], 'version': info['version'],
    'engineTarget': 'chrome68', 'apiOrigin': 'https://carto.canadaverse.org',
}) + '\n')

# Launcher artwork uses the app's dark-map/teal-node motif, with no external
# fonts or platform image dependencies in the reproducible package job.
def png_chunk(kind, payload):
    return struct.pack('!I', len(payload)) + kind + payload + struct.pack('!I', zlib.crc32(kind + payload) & 0xffffffff)

size = 130
pixels = bytearray()
nodes = [(31, 84), (65, 41), (100, 79)]
for y in range(size):
    pixels.append(0)
    for x in range(size):
        color = (11, 25, 34)
        for (ax, ay), (bx, by) in zip(nodes, nodes[1:]):
            t = max(0, min(1, ((x-ax)*(bx-ax)+(y-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)))
            if (x-ax-t*(bx-ax))**2+(y-ay-t*(by-ay))**2 < 8:
                color = (52, 146, 146)
        if any((x-a)**2+(y-b)**2 < 70 for a, b in nodes):
            color = (104, 238, 205)
        pixels.extend(color)
(DIST / 'icon.png').write_bytes(b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('!2I5B', size, size, 8, 2, 0, 0, 0)) + png_chunk(b'IDAT', zlib.compress(pixels, 9)) + png_chunk(b'IEND', b''))

output = ROOT / 'artifacts'
output.mkdir(exist_ok=True)
# Use the vendor's package schema/archives, including packageinfo and installed
# size metadata required by older TV installers. Frontend compilation is done.
subprocess.run(['npm', 'exec', '--yes', '--package=@webos-tools/cli@3.2.6', '--',
                'ares-package', str(DIST), '--no-minify', '--outdir', str(output)], check=True)
ipk = output / (info['id'] + '_' + info['version'] + '_all.ipk')
result = ipk.read_bytes()
(output / 'SHA256SUMS').write_text(hashlib.sha256(result).hexdigest() + '  ' + ipk.name + '\n')
(output / 'build-info.json').write_bytes((DIST / 'build-info.json').read_bytes())
print(f'{ipk.name}: {len(result):,} bytes; source {os.environ["CARTOLITE_COMMIT"]}')
