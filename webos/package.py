"""Build a deterministic webOS IPK from the CI-produced default map bundle."""
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import tarfile
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

def archive(files):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w', format=tarfile.GNU_FORMAT) as tar:
        for name, data in sorted(files):
            item = tarfile.TarInfo(name)
            item.size, item.mode, item.mtime = len(data), 0o644, 0
            tar.addfile(item, io.BytesIO(data))
    return gzip.compress(output.getvalue(), mtime=0)

control = ('Package: {id}\nVersion: {version}\nSection: misc\nPriority: optional\n'
           'Architecture: all\nMaintainer: Canadaverse\nDescription: CartoLite live map for webOS TV\n'
           'webOS-Package-Format-Version: 2\nwebOS-Packager-Version: 1.0.0\n').format(**info).encode()
files = [('./usr/palm/applications/' + info['id'] + '/' + p.relative_to(DIST).as_posix(), p.read_bytes()) for p in DIST.rglob('*') if p.is_file()]
package_info = json.dumps({'id': info['id'], 'version': info['version'], 'app': info['id']}).encode()
files.append(('./usr/palm/packages/' + info['id'] + '/packageinfo.json', package_info))
data = archive(files)
members = [('debian-binary', b'2.0\n'), ('control.tar.gz', archive([('./control', control)])), ('data.tar.gz', data)]
result = bytearray(b'!<arch>\n')
for name, payload in members:
    result.extend(f'{name:<16}{0:<12}{0:<6}{0:<6}{"100644":<8}{len(payload):<10}`\n'.encode('ascii'))
    result.extend(payload)
    if len(payload) % 2: result.extend(b'\n')
output = ROOT / 'artifacts'
output.mkdir(exist_ok=True)
ipk = output / (info['id'] + '_' + info['version'] + '_all.ipk')
ipk.write_bytes(result)
(output / 'SHA256SUMS').write_text(hashlib.sha256(result).hexdigest() + '  ' + ipk.name + '\n')
(output / 'build-info.json').write_bytes((DIST / 'build-info.json').read_bytes())
print(f'{ipk.name}: {len(result):,} bytes; source {os.environ["CARTOLITE_COMMIT"]}')

