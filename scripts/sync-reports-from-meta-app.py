#!/usr/bin/env python3
"""Copy completed bien-evaluator HTML reports from meta-app/reports into immo-evals."""

from __future__ import annotations

import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
META_REPORTS = ROOT.parent / "meta-app" / "reports"
OUT = ROOT / "reports"
DATA = ROOT / "data" / "reports.json"
SITEMAP = ROOT / "sitemap.xml"
SITE_BASE = "https://luongnv.com/immo-evals"

# Prefer these job IDs (newest production-style template reports).
PREFERRED_IDS = [
    ("116ada96b9be431d9f966c75135b17a6", "versailles-clagny-2-pieces"),
    ("16f2fe2da0eb429ab308ba037af39d54", "versailles-chantiers-2-pieces"),
    ("d28a3bb6b20248f4bc75232f59945489", "versailles-chantiers-studio-21m2"),
]


def slugify(title: str) -> str:
    s = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:80] or "report"


def parse_report_meta(index_html: Path) -> dict | None:
    text = index_html.read_text(encoding="utf-8")
    marker = 'id="report-data">'
    pos = text.find(marker)
    if pos < 0:
        return None
    start = text.find("{", pos)
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])
    return None


def is_bien_evaluator_done(job_dir: Path) -> bool:
    ev = job_dir / "events.jsonl"
    summ = job_dir / "summary.json"
    idx = job_dir / "index.html"
    if not (ev.exists() and summ.exists() and idx.exists()):
        return False
    if "bien-evaluator" not in ev.read_text(encoding="utf-8"):
        return False
    summary = json.loads(summ.read_text(encoding="utf-8"))
    if summary.get("status") != "done":
        return False
    if idx.stat().st_size < 10_000:
        return False
    return parse_report_meta(idx) is not None


def collect_candidates() -> list[Path]:
    if not META_REPORTS.is_dir():
        sys.exit(f"meta-app reports not found: {META_REPORTS}")
    chosen: list[tuple[Path, str | None]] = []
    for entry in PREFERRED_IDS:
        jid, fixed_slug = entry if isinstance(entry, tuple) else (entry, None)
        d = META_REPORTS / jid
        if is_bien_evaluator_done(d):
            chosen.append((d, fixed_slug))
    if len(chosen) >= 3:
        return chosen[:3]
    seen = {p for p, _ in chosen}
    for d in sorted(META_REPORTS.iterdir()):
        if d.is_dir() and is_bien_evaluator_done(d) and d not in seen:
            chosen.append((d, None))
            seen.add(d)
        if len(chosen) >= 3:
            break
    return chosen


def main() -> None:
    jobs = collect_candidates()
    if not jobs:
        sys.exit("No completed bien-evaluator reports found in meta-app/reports")

    if OUT.exists():
        for old in OUT.glob("*.html"):
            old.unlink()

    catalog: list[dict] = []
    used_slugs: set[str] = set()

    for job_dir, fixed_slug in jobs:
        meta = parse_report_meta(job_dir / "index.html")
        assert meta is not None
        base_slug = fixed_slug or slugify(meta.get("title", job_dir.name))
        slug = base_slug
        n = 2
        while slug in used_slugs:
            slug = f"{base_slug}-{n}"
            n += 1
        used_slugs.add(slug)

        dest = OUT / f"{slug}.html"
        shutil.copy2(job_dir / "index.html", dest)
        verdict = (meta.get("verdict") or {}).get("label", "")
        tone = (meta.get("verdict") or {}).get("tone", "neutral")
        kpi = meta.get("kpi") or {}
        catalog.append(
            {
                "id": slug,
                "jobId": job_dir.name,
                "title": meta.get("title", slug),
                "date": meta.get("date", ""),
                "url": meta.get("url", ""),
                "verdict": verdict,
                "tone": tone,
                "summary": meta.get("summary", ""),
                "price": kpi.get("price", ""),
                "pricem2": kpi.get("pricem2", ""),
                "surface": kpi.get("surface", ""),
                "type": kpi.get("type", ""),
                "href": f"reports/{slug}.html",
            }
        )
        print(f"copied {job_dir.name} -> {dest.name}")

    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {DATA} ({len(catalog)} reports)")

    write_sitemap(catalog)


def write_sitemap(catalog: list[dict]) -> None:
    """Regenerate sitemap.xml from the synced report list (absolute URLs)."""
    urls = [
        (f"{SITE_BASE}/", "monthly", "1.0"),
        (f"{SITE_BASE}/catalog.html", "weekly", "0.8"),
    ]
    for entry in catalog:
        urls.append((f"{SITE_BASE}/{entry['href']}", "monthly", "0.6"))

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, changefreq, priority in urls:
        lines.append("  <url>")
        lines.append(f"    <loc>{loc}</loc>")
        lines.append(f"    <changefreq>{changefreq}</changefreq>")
        lines.append(f"    <priority>{priority}</priority>")
        lines.append("  </url>")
    lines.append("</urlset>")
    SITEMAP.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {SITEMAP} ({len(urls)} urls)")


if __name__ == "__main__":
    main()