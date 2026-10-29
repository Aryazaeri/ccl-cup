"""Download the old archive's image files listed in an export's assets.csv.

Read-only against arsiv.cclcup.com. Mirrors the site's paths under --out, skips
files already downloaded (safe to rerun), and writes manifest.csv with a sha256
per file so the later Backblaze upload can be verified.

    python3 -I download_assets.py --export "<export dir>" --out "<new media dir>"
"""
import argparse, csv, hashlib, re, sys, threading, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

AGENT = 'CCLSeasonArchive/1.0 (public historical export; no login)'  # same identity as scrape.py
IMAGE = re.compile(r'^https://arsiv\.cclcup\.com/(images/[^?#]+\.(?:jpe?g|png|gif|webp))$', re.I)
SKIP_DIRS = {'images', 'images/zaman'}  # site chrome: arrows and clock icons


def url_to_path(url):
    """Relative mirror path for an archive image URL, or None if it should be skipped."""
    m = IMAGE.match(url)
    if not m or '..' in m.group(1):
        return None
    rel = m.group(1)
    return None if rel.rsplit('/', 1)[0] in SKIP_DIRS else rel


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--export', required=True, type=Path)
    ap.add_argument('--out', required=True, type=Path)
    ap.add_argument('--workers', type=int, default=2)
    ap.add_argument('--delay', type=float, default=0.5, help='seconds between requests per worker')
    args = ap.parse_args()

    csv.field_size_limit(sys.maxsize)
    with open(args.export / 'assets.csv', encoding='utf-8-sig') as f:
        urls = list(dict.fromkeys(r['url'] for r in csv.DictReader(f) if url_to_path(r['url'])))
    args.out.mkdir(parents=True, exist_ok=True)
    lock, rows, done = threading.Lock(), [], [0]

    def fetch(url):
        rel = url_to_path(url)
        dest = args.out / rel
        status = 'ok'
        if not (dest.exists() and dest.stat().st_size > 0):
            dest.parent.mkdir(parents=True, exist_ok=True)
            status = 'error: not attempted'
            for attempt in range(3):
                try:
                    time.sleep(args.delay)
                    req = urllib.request.Request(url, headers={'User-Agent': AGENT})
                    with urllib.request.urlopen(req, timeout=30) as r:
                        if not r.headers.get('Content-Type', '').startswith('image/'):
                            raise ValueError(f"not an image: {r.headers.get('Content-Type')}")
                        data = r.read()
                    part = dest.with_suffix(dest.suffix + '.part')
                    part.write_bytes(data)
                    part.replace(dest)
                    status = 'ok'
                    break
                except Exception as e:  # noqa: BLE001 — record and move on; a rerun retries
                    status = f'error: {e}'
                    time.sleep(2 ** (attempt + 1))
        ok = status == 'ok' and dest.exists()
        row = [url, rel, dest.stat().st_size if ok else 0,
               hashlib.sha256(dest.read_bytes()).hexdigest() if ok else '', status]
        with lock:
            rows.append(row)
            done[0] += 1
            if done[0] % 500 == 0:
                print(f'{done[0]}/{len(urls)}', flush=True)

    with ThreadPoolExecutor(args.workers) as pool:
        list(pool.map(fetch, urls))

    rows.sort(key=lambda r: r[1])
    with open(args.out / 'manifest.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['url', 'path', 'bytes', 'sha256', 'status'])
        w.writerows(rows)
    failed = [r for r in rows if r[4] != 'ok']
    print(f'done: {len(rows) - len(failed)} ok, {len(failed)} failed, '
          f'{sum(r[2] for r in rows) / 1e9:.2f} GB in {args.out}')


if __name__ == '__main__':
    assert url_to_path('https://arsiv.cclcup.com/images/maclar/00062a4014e6f12.jpg') == 'images/maclar/00062a4014e6f12.jpg'
    assert url_to_path('https://arsiv.cclcup.com/images/arrow-left-gray.png') is None
    assert url_to_path('https://arsiv.cclcup.com/images/zaman/1.png') is None
    assert url_to_path('https://www.youtube.com/watch?v=x') is None
    assert url_to_path('https://arsiv.cclcup.com/images/../../etc/x.jpg') is None
    main()
