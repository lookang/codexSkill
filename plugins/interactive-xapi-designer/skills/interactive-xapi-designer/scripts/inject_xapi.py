#!/usr/bin/env python3
"""Prepare a preserved HTML/ZIP/folder with unchanged SLS transport and an authored adapter.

This does not infer grading, author analytics, or prove runtime integration.
"""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
from urllib.parse import urlsplit
import zipfile

from prepare_sls_transport import prepare_transport
from zip_safety import extract_zip_safely


class InspectHTML(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=False)
        self.text = text
        self.lines = [0]
        for i, c in enumerate(text):
            if c == '\n':
                self.lines.append(i + 1)
        self.head = None
        self.body_end = None
        self.sources = []
        self.assets = []

    def source_offset(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'head' and self.head is None:
            self.head = self.source_offset() + len(self.get_starttag_text())
        if tag == 'script' and attrs.get('src'):
            self.sources.append(attrs['src'])
        for key in ('src', 'href', 'poster'):
            value = attrs.get(key)
            if value and not value.startswith('#'):
                self.assets.append(value)

    def handle_endtag(self, tag):
        if tag == 'body':
            self.body_end = self.source_offset()


def hashes(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(root.rglob('*')) if p.is_file()}


def unpack(source, stage):
    if source.is_dir():
        if any(p.is_symlink() for p in source.rglob('*')):
            raise ValueError('Resolve source symlinks explicitly before packaging.')
        shutil.copytree(source, stage, dirs_exist_ok=True)
    elif source.suffix.lower() in ('.html', '.htm'):
        text = source.read_bytes().decode('utf-8')
        inspect = InspectHTML(text)
        inspect.feed(text)
        local = [v for v in inspect.assets if not urlsplit(v).scheme and not v.startswith('//')]
        if local:
            raise ValueError('HTML has relative dependencies; supply its complete folder or ZIP: ' + ', '.join(local[:5]))
        (stage / 'index.html').write_bytes(source.read_bytes())
    elif source.suffix.lower() == '.zip':
        with zipfile.ZipFile(source) as archive:
            extract_zip_safely(archive, stage)
    else:
        raise ValueError('Supply an HTML file, ZIP or extracted folder.')
    if not (stage / 'index.html').is_file():
        raise ValueError('Expected index.html at root. Inspect the entry layout manually; no output written.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--adapter', type=Path, required=True,
                        help='Authored domain adapter; must bind actual checks/model state')
    args = parser.parse_args()
    source, output, adapter = args.source.resolve(), args.output.resolve(), args.adapter.resolve()
    if not source.exists() or not adapter.is_file():
        parser.error('Source and authored adapter must exist.')
    if output.exists():
        parser.error('Output must be a new path; original and existing output are never overwritten.')
    if source.is_dir() and output.is_relative_to(source):
        parser.error('Output must be outside the source folder.')
    try:
        with tempfile.TemporaryDirectory(prefix='sls-preserve-') as temp:
            stage = Path(temp) / 'package'
            stage.mkdir()
            unpack(source, stage)
            original = hashes(stage)
            entry = stage / 'index.html'
            text = entry.read_bytes().decode('utf-8')
            html = InspectHTML(text)
            html.feed(text)
            if html.head is None or html.body_end is None:
                raise ValueError('Explicit head and closing body are required; inspect unusual HTML manually.')
            if (any(Path(urlsplit(v).path).name.lower() in ('xapi.js', 'xapiwrapper.min.js') for v in html.sources)
                    or re.search(r'\b(?:window\.)?storeState\s*(?:=|\()', text)
                    or 'ADL.XAPIWrapper' in text):
                raise ValueError('Existing xAPI detected. Preserve its transport and adapt payloads manually; do not inject twice.')
            for name in ('sls-payload-adapter.js', 'SLS-PRESERVATION.json', 'SLS-BASELINE.json'):
                if (stage / name).exists():
                    raise ValueError('Reserved integration filename already exists: ' + name)
            prepare_transport(stage)
            vendor = '\n<script src="lib/xapiwrapper.min.js"></script>\n<script src="lib/xAPI.js"></script>\n'
            hook = '\n<script src="sls-payload-adapter.js"></script>\n'
            revised = text[:html.body_end] + hook + text[html.body_end:]
            revised = revised[:html.head] + vendor + revised[html.head:]
            entry.write_bytes(revised.encode('utf-8'))
            shutil.copyfile(adapter, stage / 'sls-payload-adapter.js')
            after = hashes(stage)
            changed = [name for name in original if original[name] != after.get(name)]
            if changed != ['index.html']:
                raise ValueError('Unexpected original-file change: ' + ', '.join(changed))
            (stage / 'SLS-PRESERVATION.json').write_text(json.dumps({
                'mode': 'integrate-only', 'status': 'scaffold-requires-runtime-verification',
                'sourceName': source.name, 'originalSHA256': original,
                'changedOriginalFiles': changed,
                'addedFiles': sorted(set(after) - set(original)),
                'externalReferences': [v for v in html.assets if urlsplit(v).scheme in ('http', 'https') or v.startswith('//')],
                'limitations': 'Authored adapter must capture actual model/check evidence; injection alone proves neither scoring nor delivery.',
            }, indent=2) + '\n', encoding='utf-8')
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(stage, output)
        print('Preserved scaffold prepared. Bind and verify the authored payload adapter before delivery.')
    except (OSError, ValueError, UnicodeError, zipfile.BadZipFile) as exc:
        print('FAIL: ' + str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
