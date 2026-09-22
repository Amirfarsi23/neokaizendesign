"""
Put a design on neokaizendesign.com so a headset or phone can open it.

    python publish-model.py              # takes the newest export from Downloads
    python publish-model.py --dry-run    # show what would happen, change nothing

Export the GLB (and the rig, if you want the doors to move) from the tool's
Scene tab first. They land in Downloads already named correctly; this copies
them into the site, commits and pushes. Netlify publishes in under a minute,
then the tool's share button gives a QR code that works.

Anything published this way is publicly downloadable and stays in the
repository's history.
"""

import argparse, re, shutil, subprocess, sys, time, urllib.parse
from pathlib import Path

REPO = Path(__file__).parent.resolve()
TOOL = REPO / 'tools' / 'eicha-kuchl'
SITE = 'https://neokaizendesign.com/tools/eicha-kuchl/'
DOWNLOADS = Path.home() / 'Downloads'


def tidy(name):
    """Undo the browser's duplicate suffix: "kitchen (1).glb" -> "kitchen.glb".

    The tool builds its share paths from the model name, so a stray "(1)"
    means the published file no longer matches the link it asks for.
    """
    name = re.sub(r'\s*\((\d+)\)(?=\.|$)', '', name)
    return name.replace(' ', '-')


def newest(pattern):
    found = [p for p in DOWNLOADS.glob(pattern) if p.is_file()]
    return max(found, key=lambda p: p.stat().st_mtime) if found else None


def link(model_name, rig_name):
    url = SITE + '?m=models/' + urllib.parse.quote(model_name)
    if rig_name:
        url += '&r=rigs/' + urllib.parse.quote(rig_name)
    return url + '&view=1'


def run(*args, **kw):
    return subprocess.run(args, cwd=REPO, text=True, capture_output=True, **kw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('model', nargs='?', help='GLB to publish (default: newest in Downloads)')
    ap.add_argument('--rig', help='rig JSON (default: newest in Downloads)')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--rig-only', action='store_true',
                    help='publish just the rig: your hinges, materials and '
                         'lights, without re-uploading the 30 MB model')
    args = ap.parse_args()

    model = Path(args.model) if args.model else newest('*.glb')
    rig = Path(args.rig) if args.rig else newest('*.rig.json')

    if args.rig_only:
        if not rig or not rig.is_file():
            sys.exit('No rig found. Press "Export rig" in the tool first.')
        model = Path(tidy(rig.name)[:-len('.rig.json')] + '.glb')   # names only

    if not model or (not args.rig_only and not model.is_file()):
        sys.exit('No GLB found. Export one from the tool first (Scene tab).')

    model_name = tidy(model.name)
    stem = model_name[:-4]
    # a rig only belongs to this model if it is named after it
    if rig and tidy(rig.name) != stem + '.rig.json':
        rig = None
    rig_name = tidy(rig.name) if rig else None

    if args.rig_only:
        print('  model: %s  (already published, not re-uploaded)' % model.name)
    else:
        print('  model: %s  (%.1f MB)' % (model.name, model.stat().st_size / 1048576))
    print('  rig:   %s' % (rig.name if rig else 'none - doors will not move'))

    # Re-uploading an unchanged 30 MB model wastes a deploy, and re-exporting
    # it after texturing bakes those textures in permanently.
    targets = [] if args.rig_only else [(model, TOOL / 'models' / model_name)]
    if rig:
        targets.append((rig, TOOL / 'rigs' / rig_name))

    if args.dry_run:
        print('\n  would copy:')
        for src, dst in targets:
            print('    %s -> %s' % (src.name, dst.relative_to(REPO)))
        print('  would commit and push, then the link would be:')
        print('    %s' % link(model_name, rig_name))
        return 0

    for src, dst in targets:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        print('  copied %s' % dst.relative_to(REPO))

    run('git', 'add', *[str(dst) for _, dst in targets])
    staged = run('git', 'diff', '--cached', '--name-only').stdout.strip()
    if not staged:
        print('\n  Already published and unchanged — nothing to do.')
    else:
        commit = run('git', 'commit', '-m',
                     'Publish %s%s for headset and phone viewing'
                     % (stem, ' rig' if args.rig_only else ''))
        if commit.returncode:
            sys.exit('git commit failed:\n' + commit.stdout + commit.stderr)
        push = run('git', 'push')
        if push.returncode:
            sys.exit('git push failed:\n' + push.stdout + push.stderr)
        print('  pushed')

    url = link(model_name, rig_name)

    print('\n  Waiting for the site to publish...', end='', flush=True)
    import urllib.request, urllib.error
    check = SITE + ('rigs/' + urllib.parse.quote(rig_name) if args.rig_only
                    else 'models/' + urllib.parse.quote(model_name))
    for _ in range(60):
        try:
            with urllib.request.urlopen(check, timeout=20) as r:
                if r.status == 200:
                    print(' live.')
                    break
        except urllib.error.URLError:
            pass
        time.sleep(5)
        print('.', end='', flush=True)
    else:
        print('\n  Still not live. Check the Netlify deploy.')

    print('\n  Open this in the headset, or press "Make a share link" in the tool:')
    print('    %s\n' % url)
    return 0


if __name__ == '__main__':
    sys.exit(main())
