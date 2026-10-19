#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
"""Check a markdown design document before it is built or sent.

    python3 lint-doc.py MY-DESIGN.md [--ascii] [--strict]

Three levels. An ERROR is something a reader must never see: an unfilled template slot, a
TODO/TBD/FIXME with no owner, a leftover `<!-- Figure:` note, a link or figure whose file is
missing, an #anchor no heading has, two headings with the same id, a real-looking 12-digit
account ID. A WARNING is probably wrong: em/en dashes and other non-ASCII, dated phrases
("currently", "as of"), weasel and guarantee words, sentences over the length limit, acronyms
never spelled out, a number with a quota/limit/price word but no link in its section, more
than one Region or overlapping CIDRs with nothing saying why, a design document or one-pager
with no figure, a kind missing one of its sections (lint-rules.json `kind_sections`) or with them
out of order, a one-page kind over its word limit or with numbered steps. INFO is worth a look: weasel words that are often correct, comparatives with no number near them.

The word lists and limits are in lint-rules.json beside this script. Code blocks, inline code,
link targets and HTML comments are skipped by the prose checks.

--ascii   non-ASCII anywhere (code included) is an error, for text pasted into ASCII-only forms.
--strict  exit 1 on warnings as well as errors.

Exit status is 1 when there is an error (or, with --strict, a warning). build-html.py and
build-docx.py run this first and print the result.
"""
import argparse
import importlib.util
import ipaddress
import json
import pathlib
import re
import sys
import urllib.parse

HERE = pathlib.Path(__file__).resolve().parent
RULES = json.loads((HERE / "lint-rules.json").read_text())


def _load_html_builder():
    """build-html.py owns the markdown rules (markers, slugs, links, front matter); reuse them."""
    sys.dont_write_bytecode = True   # no __pycache__ left in the skill folder
    spec = importlib.util.spec_from_file_location("build_html", HERE / "build-html.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


HTML = _load_html_builder()


def _words_re(words):
    """Whole-word, case-insensitive alternation; longest first so phrases win over their words."""
    alt = "|".join(re.escape(w).replace(r"\ ", r"\s+") for w in sorted(words, key=len, reverse=True))
    return re.compile(rf"(?<![\w-])(?:{alt})(?![\w-])", re.I)


FENCE_RE = re.compile(r"^(`{3,}|~{3,})")
PLACEHOLDER_RE = re.compile(r"<([A-Za-z][^<>=\"\n]*(?:\n[^<>=\"\n]+){0,3})>")
TODO_RE = re.compile(r"\b(TODO|TBD|FIXME)\b")
OWNER_RE = re.compile(r"\bowner\s*:\s*\S", re.I)
LEFTOVER_FIGURE_RE = re.compile(r"<!--\s*Figure:", re.I)
ACCOUNT_RE = re.compile(r"(?<!\d)\d{12}(?!\d)")
BARE_URL_RE = re.compile(r"(?:https?|mailto):[^\s<>)\]]+", re.I)
HLD_RE = re.compile(r"\bHLD\b|high[- ]level design", re.I)
# The document kinds `kind:` may name, and the words a title of that kind must contain. Every kind
# but an ADR and a runbook is a design document and must carry at least one figure.
KIND_TITLE = {
    "hld": re.compile(r"\bHLD\b|high[- ]level design", re.I),
    "lld": re.compile(r"\bLLD\b|low[- ]level design", re.I),
    "adr": re.compile(r"\bADR\b|decision record", re.I),
    "runbook": re.compile(r"runbook", re.I),
    "overview": re.compile(r"overview", re.I),
    "security": re.compile(r"security design", re.I),
    "migration": re.compile(r"migration plan|cutover", re.I),
    "war": re.compile(r"well[- ]architected", re.I),
    "orr": re.compile(r"operational readiness|readiness review", re.I),
    "assessment": re.compile(r"assessment|findings", re.I),
    "brief": re.compile(r"solution brief|\bbrief\b", re.I),
    "refarch": re.compile(r"reference architecture", re.I),
}
FIGURE_KINDS = {"hld", "lld", "overview", "security", "migration", "assessment", "brief", "refarch"}
ORDERED_ITEM_RE = re.compile(r"^\s*\d+\.\s+")
REGION_RE = re.compile(r"\b(?:us-gov|us|eu|ap|sa|ca|me|af|il|mx|cn)-(?:north|south|east|west|"
                       r"central|northeast|southeast|northwest|southwest)-\d\b")
REGION_WORD_RE = re.compile(r"\bregions?\b|multi-region", re.I)
CIDR_RE = re.compile(r"(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3}/\d{1,2})(?!\d)(?!\.\d)")
NESTED_WORD_RE = re.compile(r"\bsubnets?\b|\bwithin\b|\binside\b|\bpart of\b|\bcarved\b", re.I)
LIST_MARK_RE = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+")
ACRO_USE_RE = re.compile(r"(?<![\w<>/.-])([A-Z][A-Z0-9]{1,5})s?(?![\w-])")
ID_LIKE_RE = re.compile(r"[A-Z]{1,4}\d+")   # R1, NFR2, RK1: requirement and risk IDs, not acronyms
ACRO_DEF_PAREN_RE = re.compile(r"[A-Za-z][\w-]*\s+\(([A-Z][A-Za-z0-9]{1,5})s?\)")
GLOSSARY_ROW_RE = re.compile(r"^\|\s*([A-Z][A-Z0-9]{1,7})s?\s*\|\s*[A-Za-z]")
ACRO_DEF_AFTER_RE = re.compile(r"(?<![\w-])([A-Z][A-Za-z0-9]{1,5})s?\s+\((?=[A-Za-z])")

TIER1 = _words_re(RULES["weasel_tier1"]["words"])
TIER1_INFO = _words_re(RULES["weasel_tier1_info"]["words"])
TIER2 = _words_re(RULES["weasel_tier2"]["words"])
GUARANTEE = _words_re(RULES["guarantee"]["words"])
GUARANTEE_EXCEPT = _words_re(RULES["guarantee"]["except"])
TEMPORAL = _words_re(RULES["temporal"]["words"])
CLAIM_RE = re.compile(
    r"\$\s?\d|\d\s?USD\b|\bUSD\s?\d|\b\d[\d,.]*\s*%?(?:\s+[\w/-]+){0,3}?\s+(?:"
    + "|".join(re.escape(k).replace(r"\ ", r"\s+") for k in RULES["claim_keywords"])
    + r")(?![\w-])", re.I)
ACRO_ALLOW = set(RULES["acronym_allowlist"])
HTML_TAGS = set(RULES["html_tags"])


def _blank(m):
    """Same-length spaces for a match, newlines kept, so columns and line numbers stay put."""
    return re.sub(r"[^\n]", " ", m.group(0))


class Doc:
    """The source as parallel line lists, each with more of the non-prose masked out.

    raw      the file as written
    nofence  fenced code blocks and front matter blanked
    nocode   ... and inline code spans blanked
    nocom    ... and HTML comments blanked (multi-line too)
    prose    ... and link targets and bare URLs blanked, keeping link text
    text_ic  nofence with comments blanked but inline code kept (Regions, CIDRs)
    """

    def __init__(self, path):
        self.path = path
        text = path.read_text().replace("\r\n", "\n")
        self.raw = text.split("\n")
        self.meta, rest = HTML.front_matter(text)
        fm_lines = text[:len(text) - len(rest)].count("\n") if self.meta else 0
        self.fm_lines = fm_lines

        nofence, fence = [], None
        for n, line in enumerate(self.raw):
            s = line.strip()
            m = FENCE_RE.match(s)
            if n < fm_lines:
                nofence.append("")
            elif fence:
                nofence.append("")
                if m and m.group(1)[0] == fence[0] and len(m.group(1)) >= len(fence) \
                        and not s[len(m.group(1)):].strip():
                    fence = None
            elif m:
                fence = m.group(1)
                nofence.append("")
            else:
                nofence.append(line)
        self.nofence = nofence
        self.nocode = [HTML.CODE_SPAN_RE.sub(_blank, x) for x in nofence]
        self.nocom = re.sub(r"<!--.*?-->", _blank, "\n".join(self.nocode), flags=re.S).split("\n")
        self.text_ic = re.sub(r"<!--.*?-->", _blank, "\n".join(nofence), flags=re.S).split("\n")

        def strip_links(line):
            line = HTML.LINK_RE.sub(lambda m: m.group(2).ljust(len(m.group(0))), line)
            return BARE_URL_RE.sub(_blank, line)

        self.prose = [strip_links(x) for x in self.nocom]

        self.headings = []            # (line index, level, text as written)
        for n, line in enumerate(self.nocom):
            hm = HTML.HEADING_RE.match(line.strip())
            if hm and self.raw[n].strip().startswith("#"):
                raw_h = HTML.HEADING_RE.match(self.raw[n].strip())
                self.headings.append((n, len(raw_h.group(1)), raw_h.group(2).strip()))
        h1 = [h for h in self.headings if h[1] == 1]
        self.title = h1[0][2] if h1 else self.meta.get("title")
        self.title_line = h1[0][0] if h1 else None

    def section_of(self, n):
        """Index of the heading that line n sits under (-1 before the first one)."""
        k = -1
        for idx, (line, _, _) in enumerate(self.headings):
            if line <= n:
                k = idx
        return k

    def section_lines(self, k):
        start = self.headings[k][0] + 1 if k >= 0 else 0
        end = self.headings[k + 1][0] if k + 1 < len(self.headings) else len(self.raw)
        return range(start, end)


def lint(path, ascii_only=False, confine=False):
    """[(level, line number, message)] for one document, sorted by line."""
    d = Doc(pathlib.Path(path))
    out = []

    def add(level, n, msg):
        out.append((level, n + 1, msg))

    # front matter keys
    for key in d.meta:
        if key not in RULES["front_matter_keys"]:
            add("warning", 0, f"front matter key '{key}' is not used by the builders "
                              f"(known: {', '.join(RULES['front_matter_keys'])})")
        if re.search(r"<[^<>=\"]+>", str(d.meta[key])):
            add("error", 0, f"front matter {key} is an unfilled placeholder: {d.meta[key]}")
    if not d.title:
        add("error", 0, "no `# Title` line and no front matter title")

    # unfilled template slots, outside code
    joined = "\n".join(d.nocom)
    for m in PLACEHOLDER_RE.finditer(joined):
        body = m.group(1)
        tag = body.strip().rstrip("/").split()[0].lower() if body.strip() else ""
        if tag in HTML_TAGS and len(body.split()) == 1:
            continue
        if re.match(r"(?:https?|mailto):", body, re.I):
            continue
        n = joined.count("\n", 0, m.start())
        shown = re.sub(r"\s+", " ", m.group(0))
        add("error", n, f"unfilled placeholder {shown[:70]}{'...' if len(shown) > 70 else ''}")
    # ... and a code span that is nothing but a slot: `<account id>`
    for n, line in enumerate(d.nofence):
        for m in HTML.CODE_SPAN_RE.finditer(line):
            inner = m.group(2).strip()
            if re.fullmatch(r"<[A-Za-z][^<>]*>", inner) and inner[1:-1].split()[0].lower() not in HTML_TAGS:
                add("error", n, f"unfilled placeholder {inner} in inline code")

    # TODO / TBD / FIXME need an owner on the same line: "TBD (owner: platform team)"
    for n, line in enumerate(d.nocode):
        m = TODO_RE.search(line)
        if m and not OWNER_RE.search(line):
            add("error", n, f"{m.group(1)} without an owner on the line (write '{m.group(1)} (owner: <team>)')")

    # leftover template figure notes and figure markers
    figures = 0
    for n, line in enumerate(d.nofence):
        s = line.strip()
        if LEFTOVER_FIGURE_RE.search(line):
            add("error", n, "leftover '<!-- Figure:' note: draw the figure and replace it with an aws-svg marker")
        if HTML.ARCHIFY_RE.fullmatch(s):
            add("error", n, "<!-- archify: --> markers are no longer supported; use <!-- aws-svg: path.svg -->")
            continue
        fm = HTML.AWSSVG_RE.fullmatch(s)
        if fm:
            figures += 1
            if confine and not outside_ok(d.path.parent, fm.group(1)):
                add("error", n, f"figure {fm.group(1)} is outside the document's folder (--confine)")
            elif not (d.path.parent / fm.group(1)).is_file():
                add("error", n, f"figure {fm.group(1)} not found")

    # headings: duplicate ids
    ids = {}
    for n, _level, text in d.headings:
        if n == d.title_line:
            continue
        sid = HTML.slug(text)
        if sid in ids:
            add("error", n, f"heading id '#{sid}' already used on line {ids[sid] + 1}; anchors to it are ambiguous")
        else:
            ids[sid] = n

    # links and images
    for n, line in enumerate(d.nocom):
        for m in HTML.LINK_RE.finditer(line):
            target = m.group(3)
            if HTML.EXTERNAL_LINK_RE.match(target):
                continue
            if target.startswith("#"):
                if target[1:] not in ids:
                    add("error", n, f"link {target} matches no heading")
                continue
            local = urllib.parse.unquote(target.partition("#")[0])
            if local and confine and not outside_ok(d.path.parent, local):
                add("error", n, f"link target {local} is outside the document's folder (--confine)")
            elif local and not (d.path.parent / local).exists():
                add("error", n, f"link target {local} not found")

    # dashes and non-ASCII
    src_lines = d.raw if ascii_only else d.nocom
    level = "error" if ascii_only else "warning"
    for n, line in enumerate(src_lines):
        bad = sorted({c for c in line if ord(c) > 127})
        if not bad:
            continue
        names = []
        for c in bad:
            names.append({"—": "em dash", "–": "en dash"}.get(c, f"'{c}' U+{ord(c):04X}"))
        kind = "dash" if set(bad) <= {"—", "–"} else "non-ASCII"
        add(level, n, f"{kind}: {', '.join(names)}")

    # word lists, one finding per line per list
    for n, line in enumerate(d.prose):
        if not line.strip():
            continue
        g_line = GUARANTEE_EXCEPT.sub(_blank, line)
        for rx, key in ((TEMPORAL, "temporal"), (GUARANTEE, "guarantee"), (TIER1, "weasel_tier1"),
                        (TIER1_INFO, "weasel_tier1_info")):
            hits = sorted({m.group(0).lower() for m in rx.finditer(g_line if key == "guarantee" else line)})
            if hits:
                add(RULES[key]["level"], n, f"{', '.join(hits)}: {RULES[key]['why']}")
        window = RULES["weasel_tier2"]["number_window_words"]
        hits = []
        for m in TIER2.finditer(line):
            before = line[:m.start()].split()[-window:]
            after = line[m.end():].split()[:window]
            if not any(re.search(r"\d", w) for w in before + after):
                hits.append(m.group(0).lower())
        if hits:
            add(RULES["weasel_tier2"]["level"], n, f"{', '.join(sorted(set(hits)))}: {RULES['weasel_tier2']['why']}")

    # real-looking account IDs, anywhere (code included)
    allowed = set(RULES["allowed_account_ids"])
    for n, line in enumerate(d.raw):
        for m in ACCOUNT_RE.finditer(line):
            v = m.group(0)
            if v not in allowed and len(set(v)) > 1:
                add("error", n, f"12-digit number {v} looks like a real AWS account ID; use 111122223333")

    # a number with a quota / limit / price word and no link in its section
    heading_lines = {h[0] for h in d.headings}
    for k in range(-1, len(d.headings)):
        rng = d.section_lines(k)
        linked = any(re.search(r"\]\(\s*https?://|https?://", d.nocom[x]) for x in rng)
        if linked:
            continue
        for x in rng:
            if x in heading_lines:
                continue
            m = CLAIM_RE.search(LIST_MARK_RE.sub("", d.prose[x]))
            if m:
                add("warning", x, f"unsourced claim? '{m.group(0).strip()}' has no link in this section; "
                                  "cite the AWS page it comes from")
                break

    # HLD with no figures
    fm_text = " ".join(str(v) for v in d.meta.values())
    # A design document needs a figure. `kind:` says which document this is (see SKILL.md); fall
    # back to the title for a document written before the key existed.
    kind = str(d.meta.get("kind", "")).strip().lower()
    needs_figure = kind in FIGURE_KINDS or (not kind and (HLD_RE.search(d.title or "") or HLD_RE.search(fm_text)))
    if figures == 0 and needs_figure:
        add("warning", d.title_line or 0, f"this is a {kind or 'high-level design'} but has no <!-- aws-svg: --> figure")
    if kind and kind not in KIND_TITLE:
        add("warning", 0, f"front matter kind '{kind}' is not one of: {', '.join(KIND_TITLE)}")
    elif kind and d.title and not KIND_TITLE[kind].search(d.title):
        add("warning", d.title_line or 0,
            f"the title does not say this is a {kind}; name the kind in the title so a reader "
            f"knows the altitude (see the kinds table in SKILL.md)")

    # each kind's sections, in order (lint-rules.json kind_sections)
    def bare(text):
        return HTML.SECNUM_RE.sub("", text).strip().lower()

    h2 = [(n, bare(text)) for n, level, text in d.headings if level == 2]
    found = []
    for want in RULES["kind_sections"].get(kind, []):
        names = [want] if isinstance(want, str) else want
        hit = next((n for n, b in h2 if any(b.startswith(x.lower()) for x in names)), None)
        if hit is None:
            add("warning", d.title_line or 0, f"kind {kind} is missing its '## {names[0]}' section "
                                              f"(see the {kind} template)")
        else:
            found.append((hit, names[0]))
    for (n1, a), (n2, b) in zip(found, found[1:]):
        if n2 < n1:
            add("warning", n2, f"'{b}' comes before '{a}'; keep the template order")

    # the first table under Document history becomes the Word document-history page
    for k, (n, level, text) in enumerate(d.headings):
        if level == 2 and bare(text).startswith("document history"):
            if not any(d.nocom[x].strip().startswith("|") for x in d.section_lines(k)):
                add("warning", n, "Document history has no table (Version | Date | Author | Change)")

    # one-page kinds: a word budget, and no numbered steps (arrow labels carry the order)
    if kind in RULES["one_page"]["kinds"]:
        body = [x for i, x in enumerate(d.prose) if i != d.title_line and i >= d.fm_lines]
        words = sum(len(re.findall(r"[A-Za-z0-9][\w'./-]*", x)) for x in body)
        limit = RULES["one_page"]["max_words"]
        if words > limit:
            add("warning", d.title_line or 0, f"{words} words in a {kind} (limit {limit}): "
                                              f"{RULES['one_page']['why']}")
        for n, line in enumerate(d.prose):
            if ORDERED_ITEM_RE.match(line):
                add("warning", n, f"numbered list in a {kind}: write bullets keyed to the "
                                  "figure's arrow labels, never numbered steps")
                break

    # long sentences: paragraphs and list items, not headings, tables, code or comments
    limit = RULES["sentence_max_words"]
    unit, start = [], None

    def flush():
        if not unit:
            return
        text = re.sub(r"[*_`]", "", " ".join(unit))
        for sent in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])", text):
            words = re.findall(r"[A-Za-z0-9][\w'./-]*", sent)
            if len(words) > limit:
                add("warning", start, f"sentence of {len(words)} words (limit {limit}): "
                                      f"'{' '.join(words[:8])} ...'")

    for n, line in enumerate(d.prose):
        s = line.strip()
        if (not s or n in heading_lines or s.startswith("|") or HTML.RULE_RE.match(s)
                or LIST_MARK_RE.match(line)):
            flush()
            unit, start = [], None
            if s and LIST_MARK_RE.match(line):
                unit, start = [LIST_MARK_RE.sub("", line).strip()], n
            continue
        if start is None:
            start = n
        unit.append(s.lstrip("> "))
    flush()

    # acronyms spelled out before first use: "Service control policy (SCP)" or "SCP (service ...)"
    defined, reported = set(), set()
    # A glossary row "| ACRO | Expansion |" defines the acronym for the whole document.
    defined.update(m.group(1) for line in d.prose if (m := GLOSSARY_ROW_RE.match(line.strip())))
    for n, line in enumerate(d.prose):
        for rx in (ACRO_DEF_PAREN_RE, ACRO_DEF_AFTER_RE):
            defined.update(m.group(1) for m in rx.finditer(line))
        if n in heading_lines or n < d.fm_lines:
            continue
        for m in ACRO_USE_RE.finditer(line):
            a = m.group(1)
            if sum(c.isupper() for c in a) < 2 or ID_LIKE_RE.fullmatch(a):
                continue
            if a in ACRO_ALLOW or a in defined or a in reported:
                continue
            reported.add(a)
            add("warning", n, f"acronym {a} is not spelled out before its first use (write 'Full name ({a})')")

    # consistency: more than one Region, overlapping CIDRs
    regions = {}
    for n, line in enumerate(d.text_ic):
        for m in REGION_RE.finditer(line):
            regions.setdefault(m.group(0), n)
    if len(regions) > 1:
        for r, n in sorted(regions.items(), key=lambda kv: kv[1])[1:]:
            near = " ".join(d.text_ic[max(0, n - 3):n + 4])
            if not REGION_WORD_RE.search(near.replace(r, "")):
                add("warning", n, f"second Region {r} (the doc also names {', '.join(x for x in regions if x != r)}); "
                                  "say which part runs in which Region")
    cidrs = []
    for n, line in enumerate(d.text_ic):
        for m in CIDR_RE.finditer(line):
            try:
                cidrs.append((ipaddress.ip_network(m.group(1), strict=False), m.group(1), n))
            except ValueError:
                add("warning", n, f"{m.group(1)} is not a valid CIDR block")
    seen = set()
    for i, (a, a_s, an) in enumerate(cidrs):
        for b, b_s, bn in cidrs[i + 1:]:
            if a == b or not a.overlaps(b) or d.section_of(an) == d.section_of(bn):
                continue
            wide, narrow = (a_s, b_s) if a.prefixlen <= b.prefixlen else (b_s, a_s)
            nn = bn if narrow == b_s else an
            sec = " ".join(d.text_ic[x] for x in d.section_lines(d.section_of(nn)))
            if wide in sec or NESTED_WORD_RE.search(sec) or REGION_WORD_RE.search(sec):
                continue
            if (wide, narrow) not in seen:
                seen.add((wide, narrow))
                add("warning", nn, f"CIDR {narrow} overlaps {wide} named in another section; "
                                   "say it is a subnet of it, or fix the collision")
    return sorted(out, key=lambda f: (f[1], f[0]))


def report(path, findings, show_info=True):
    """Print the findings and a summary line; returns (errors, warnings)."""
    path = pathlib.Path(path)
    counts = {"error": 0, "warning": 0, "info": 0}
    for level, line, msg in findings:
        counts[level] += 1
        if level != "info" or show_info:
            print(f"{path.name}:{line}: {level}: {msg}")
    tail = f", {counts['info']} info" if counts["info"] else ""
    hint = " (run lint-doc.py to list the info notes)" if counts["info"] and not show_info else ""
    print(f"lint: {counts['error']} error(s), {counts['warning']} warning(s){tail}{hint}")
    return counts["error"], counts["warning"]


def outside_ok(folder, target):
    """Whether `target` resolves inside `folder`: with --confine nothing outside is even looked up."""
    return (folder / target).resolve().is_relative_to(folder.resolve())


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("doc", help="the markdown design document")
    ap.add_argument("--ascii", action="store_true",
                    help="any non-ASCII character (code included) is an error")
    ap.add_argument("--strict", action="store_true", help="exit 1 on warnings too")
    ap.add_argument("--confine", action="store_true",
                    help="report figures and links outside the document's folder (set by a remote MCP server)")
    args = ap.parse_args()
    path = pathlib.Path(args.doc).resolve()
    if not path.is_file():
        sys.exit(f"error: {path} not found")
    errors, warnings = report(path, lint(path, ascii_only=args.ascii, confine=args.confine))
    sys.exit(1 if errors or (args.strict and warnings) else 0)


if __name__ == "__main__":
    main()
