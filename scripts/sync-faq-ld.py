"""Regenera el bloque FAQPage JSON-LD a partir del texto VISIBLE de los <details>.

Garantiza que el marcado estructurado sea literalmente el mismo que el que
ve el visitante (requisito de Google para los rich results de FAQ).
"""
import json
import pathlib
import re
import sys

DETAIL_RE = re.compile(
    r'<summary>(.*?)</summary>\s*<div class="faq-item__body">(.*?)</div>', re.S
)


def clean(html: str) -> str:
    text = re.sub(r'<[^>]+>', '', html)
    text = (text.replace('&amp;', '&').replace('&lt;', '<')
                .replace('&gt;', '>').replace('&quot;', '"')
                .replace('&#39;', "'").replace('&nbsp;', ' '))
    return re.sub(r'\s+', ' ', text).strip()


def extract(path: pathlib.Path):
    html = path.read_text()
    items = []
    for m in DETAIL_RE.finditer(html):
        question = clean(m.group(1))
        body = clean(m.group(2))
        # the body may contain several <p>: join them into one answer
        items.append((question, body))
    return items


def build_ld(items):
    entities = []
    for q, a in items:
        entities.append({
            "@type": "Question",
            "name": q,
            "acceptedAnswer": {"@type": "Answer", "text": a},
        })
    return json.dumps({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": entities,
    }, indent=2, ensure_ascii=False)


def replace_ld(html: str, ld: str) -> str:
    pattern = re.compile(
        r'<script type="application/ld\+json">\s*\{[^<]*?"@type"\s*:\s*"FAQPage".*?\n\}\s*</script>',
        re.S,
    )
    new = '<script type="application/ld+json">\n' + ld + '\n</script>'
    out, n = pattern.subn(new, html, count=1)
    if n != 1:
        raise SystemExit('FAQPage JSON-LD block not found')
    return out


for name in sys.argv[1:]:
    path = pathlib.Path(name)
    items = extract(path)
    if not items:
        raise SystemExit(f'no FAQ items found in {name}')
    html = path.read_text()
    path.write_text(replace_ld(html, build_ld(items)))
    print(f'{name}: {len(items)} questions synchronised')
