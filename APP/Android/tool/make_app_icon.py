"""Install launcher icons from assets/android (full adaptive pack)."""

from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
pack = root / 'assets' / 'android'
pack_res = pack / 'res'
app_res = root / 'android' / 'app' / 'src' / 'main' / 'res'
out_dir = root / 'assets' / 'app_icon'
out_dir.mkdir(parents=True, exist_ok=True)

if not pack_res.exists():
    raise SystemExit(f'Missing icon pack: {pack_res}')

densities = ('mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi')
files = (
    'ic_launcher.png',
    'ic_launcher_background.png',
    'ic_launcher_foreground.png',
    'ic_launcher_monochrome.png',
)

for density in densities:
    src = pack_res / f'mipmap-{density}'
    dst = app_res / f'mipmap-{density}'
    if not src.exists():
        raise SystemExit(f'Missing {src}')
    dst.mkdir(parents=True, exist_ok=True)
    for name in files:
        src_file = src / name
        if not src_file.exists():
            raise SystemExit(f'Missing {src_file}')
        shutil.copy2(src_file, dst / name)
    print(f'wrote mipmap-{density}')

anydpi_src = pack_res / 'mipmap-anydpi-v26' / 'ic_launcher.xml'
anydpi_dst = app_res / 'mipmap-anydpi-v26'
anydpi_dst.mkdir(parents=True, exist_ok=True)
shutil.copy2(anydpi_src, anydpi_dst / 'ic_launcher.xml')
shutil.copy2(anydpi_src, anydpi_dst / 'ic_launcher_round.xml')

play = pack / 'play_store_512.png'
if play.exists():
    shutil.copy2(play, out_dir / 'play_store_512.png')
    shutil.copy2(play, out_dir / 'ic_launcher_1024.png')

# Keep a navy fallback color for any legacy references.
values = app_res / 'values'
values.mkdir(parents=True, exist_ok=True)
colors = values / 'colors.xml'
if colors.exists():
    text = colors.read_text(encoding='utf-8')
    if 'ic_launcher_background' not in text:
        text = text.replace(
            '</resources>',
            '    <color name="ic_launcher_background">#122236</color>\n</resources>',
        )
        colors.write_text(text, encoding='utf-8')
else:
    colors.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources>\n'
        '    <color name="ic_launcher_background">#122236</color>\n'
        '</resources>\n',
        encoding='utf-8',
    )

manifest = root / 'android' / 'app' / 'src' / 'main' / 'AndroidManifest.xml'
man = manifest.read_text(encoding='utf-8')
if 'android:roundIcon' not in man:
    man = man.replace(
        'android:icon="@mipmap/ic_launcher"',
        'android:icon="@mipmap/ic_launcher"\n        android:roundIcon="@mipmap/ic_launcher"',
    )
    manifest.write_text(man, encoding='utf-8')

print(f'Installed icons from {pack}')
