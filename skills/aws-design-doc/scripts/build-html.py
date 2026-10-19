#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
"""Render a markdown design document to a shareable, self-contained HTML page.

    python3 build-html.py MY-DESIGN.md [--strict]

Figures are referenced by an HTML comment on a line of its own, with the path relative
to the source markdown: `<!-- aws-svg: path.svg -->`, an SVG drawn by aws-archify with
the official AWS Architecture Icons. It is inlined. `<!-- aws-svg: path.svg | Caption -->`
adds a caption, numbered "Figure N." in document order.

An optional YAML front matter block (`---` lines at the very top) with title, version,
status, owner, reviewers, audience, classification and date fills the metadata row under
the title and the page <title>; prepared_by (default "AWS Professional Services") and
prepared_for lead that row, and subtitle is shown under the title. The first table under a
`## Document history` heading is shown right after the header. Kinds `brief` and `refarch`
get a compact header with one metadata line and no contents sidebar.

Mermaid fences are pre-rendered to inline SVG, so the output needs no network
access and no JavaScript: it survives an email attachment and a blocked CDN,
which a `<script src="...mermaid...">` page does not. Without mermaid-cli the fence
is shown as a code block and the build warns.

lint-doc.py runs first and its findings are printed. With --strict, a lint error, a
missing mermaid renderer or a link that cannot be resolved fails the build (exit 1).

Output is written beside the source as the lower-cased stem plus `.html`
(MY-DESIGN.md -> my-design.html).

Requires: mermaid-cli (mmdc) on the PATH only when the doc contains mermaid
fences; nothing is downloaded. No Python packages.
"""
import argparse
import html
import importlib.util
import json
import pathlib
import re
import shutil
import subprocess  # nosec B404 - fixed argument lists of known tools, never a shell
import sys
import tempfile
import urllib.parse

HERE = pathlib.Path(__file__).resolve().parent

MERMAID_THEME = {
    "theme": "base",
    "themeVariables": {
        "fontFamily": "-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif",
        "fontSize": "14px",
        "primaryColor": "#eef4fb",
        "primaryTextColor": "#12263f",
        "primaryBorderColor": "#7ba7d4",
        "lineColor": "#5b7fa6",
        "tertiaryColor": "#f6f8fa",
        "clusterBkg": "#fafbfc",
        "clusterBorder": "#d4dae0",
    },
    "flowchart": {"curve": "basis", "nodeSpacing": 45, "rankSpacing": 55,
                  "padding": 12, "useMaxWidth": True},
}

# Colours for dark mode. Used twice: under prefers-color-scheme (when no choice is stored)
# and under [data-theme="dark"] (the toggle). Screen only, so print is always light.
DARK_VARS = """
  --bg:#0e1319; --surface:#151c24; --surface-2:#1b232d; --code-bg:#121920;
  --ink:#e7eaee; --ink-soft:#c3cad3; --ink-faint:#97a3b1;
  --line:#2c3642; --line-soft:#222b36;
  --accent:#5aa9f2; --accent-soft:#1a3350;
  --hero-a:#161f2b; --hero-b:#0b1016;
  --green-bg:#173222; --green-fg:#86d891; --amber-bg:#33270f; --amber-fg:#f5c26b;
  --red-bg:#3a1c17; --red-fg:#ff9d8a; --blue-bg:#15283d; --blue-fg:#94c5f6;
  --grey-bg:#252e39; --grey-fg:#bcc5cf; --strong-bg:#e7eaee; --strong-fg:#16191f;
  --c-info:#13263a; --c-warning:#33270f; --c-risk:#3a1c17; --c-decision:#13291a;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.25);
  --badge:#34465c;
  color-scheme:dark;
"""

CSS = """
:root{
  /* AWS palette: Squid Ink for structure, Smile Orange as the single accent, Cloudscape's
     link blue. Figures always sit on a white card, so they read the same in dark mode. */
  --bg:#ffffff; --surface:#f6f7f9; --surface-2:#eef1f4; --code-bg:#f5f7f9;
  --ink:#16191f; --ink-soft:#414d5c; --ink-faint:#5b6674;
  --line:#dde2e7; --line-soft:#eaedf0;
  --accent:#0972d3; --accent-soft:#e3eefb;
  --squid:#232f3e; --orange:#ff9900; --badge:#232f3e;
  --hero-a:#2a384a; --hero-b:#172230;
  --green-bg:#e3f3e5; --green-fg:#1d6b24; --amber-bg:#fff0d3; --amber-fg:#855000;
  --red-bg:#fde6e1; --red-fg:#a32a13; --blue-bg:#e5effb; --blue-fg:#0b5aa8;
  --grey-bg:#eceff2; --grey-fg:#4a5563; --strong-bg:#232f3e; --strong-fg:#ffffff;
  --c-info:#ecf4fd; --c-warning:#fff3db; --c-risk:#fdece8; --c-decision:#e9f6ea;
  --shadow:0 1px 2px rgba(18,38,63,.05),0 6px 20px rgba(18,38,63,.07);
  --bar-h:54px; --side:248px; --gap:64px; --radius:12px;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI Variable Text","Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
  color-scheme:light;
}
@media screen and (prefers-color-scheme:dark){:root:not([data-theme="light"]){/*DARK*/}}
@media screen{:root[data-theme="dark"]{/*DARK*/}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-padding-top:calc(var(--bar-h) + 20px)}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
body{margin:0;background:var(--bg);color:var(--ink);font:16.5px/1.68 var(--sans);
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
main:focus{outline:none}
.skip{position:absolute;left:-9999px;top:8px;z-index:60;padding:8px 14px;border-radius:8px;
  background:var(--squid);color:#fff}
.skip:focus{left:12px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
/* top bar */
.topbar{position:sticky;top:0;z-index:40;height:var(--bar-h);display:flex;align-items:center;gap:10px;
  padding:0 18px;background:var(--bg);background:color-mix(in srgb,var(--bg) 84%,transparent);
  -webkit-backdrop-filter:saturate(1.5) blur(12px);backdrop-filter:saturate(1.5) blur(12px);
  border-bottom:1px solid var(--line-soft)}
.brand{display:flex;align-items:center;gap:10px;min-width:0;flex:1;color:var(--ink);border:0}
.mark{flex:none;width:24px;height:24px;border-radius:7px;background:var(--squid);
  box-shadow:inset 0 -5px 0 var(--orange),0 0 0 1px rgba(255,255,255,.2)}
.brand .kind{font-size:12px;font-weight:650;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-faint);white-space:nowrap}
.brand .t{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  opacity:0;transform:translateY(4px);transition:opacity .2s,transform .2s}
.scrolled .brand .t{opacity:1;transform:none}
.brand .t::before{content:"/";margin:0 10px 0 2px;color:var(--line)}
.ibtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;min-width:34px;
  padding:0 9px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--ink-soft);
  font:600 13px var(--sans);cursor:pointer}
.ibtn:hover{color:var(--ink);border-color:var(--ink-faint);background:var(--surface)}
.ibtn svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.toc-btn{display:none}
.progress{position:absolute;left:0;right:0;bottom:-1px;height:2px;transform-origin:0 50%;
  transform:scaleX(0);background:linear-gradient(90deg,var(--orange),#ffc266)}
/* hero */
.hero{position:relative;color:#fff;overflow:hidden;
  background:radial-gradient(1100px 380px at 85% -10%,rgba(255,153,0,.16),transparent 60%),
  linear-gradient(160deg,var(--hero-a),var(--hero-b))}
.hero::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.5;
  background-image:radial-gradient(rgba(255,255,255,.09) 1px,transparent 1px);background-size:22px 22px;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 70%);mask-image:linear-gradient(90deg,transparent,#000 70%)}
.hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;
  background:linear-gradient(90deg,var(--orange),rgba(255,153,0,.15))}
.hero-in{position:relative;max-width:1320px;margin:0 auto;padding:52px 32px 40px}
.eyebrow{display:inline-flex;align-items:center;gap:8px;margin:0 0 18px;padding:5px 12px 5px 10px;
  border-radius:999px;background:rgba(255,153,0,.12);border:1px solid rgba(255,153,0,.35);
  font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#ffc266;font-weight:700}
.eyebrow::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--orange);
  box-shadow:0 0 0 3px rgba(255,153,0,.25)}
.hero h1{margin:0 0 16px;max-width:30ch;font-size:clamp(28px,3.4vw,42px);line-height:1.14;
  letter-spacing:-.022em;font-weight:720;text-wrap:balance}
.standfirst{margin:0;max-width:68ch;color:#cfd6df;font-size:18px;line-height:1.6}
.subtitle{margin:-4px 0 18px;max-width:60ch;color:#e6eaef;font-size:21px;line-height:1.4;font-weight:560}
.meta-line{margin:0 0 14px;color:#b8c2cd;font-size:13.5px;line-height:1.5}
.hero.compact .hero-in{padding:30px 32px 26px}
.hero.compact .eyebrow{margin-bottom:12px}
.hero.compact h1{margin-bottom:8px;max-width:none;font-size:clamp(24px,2.6vw,32px)}
.hero.compact .subtitle{margin:0 0 10px;font-size:17px}
.hero.compact .standfirst{font-size:16.5px}
.meta{display:flex;flex-wrap:wrap;gap:10px;margin:30px 0 0;padding:0;list-style:none}
.meta li{margin:0;padding:8px 14px 9px;border-radius:10px;background:rgba(255,255,255,.055);
  border:1px solid rgba(255,255,255,.11);font-size:13.5px;line-height:1.35}
.meta b{display:block;margin-bottom:3px;font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;
  color:#a9b4c0;font-weight:650}
.meta li>span{color:#fff;font-weight:560}
.meta .pill{margin-top:1px}
/* document history, lifted to the top of the body */
.doc-history{margin:28px 0 12px}
.doc-history-title{margin:0 0 10px;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--ink-faint);font-weight:700}
/* layout */
.layout{max-width:1320px;margin:0 auto;padding:0 32px;display:grid;
  grid-template-columns:var(--side) minmax(0,1fr);gap:var(--gap)}
.layout.solo{grid-template-columns:minmax(0,1fr)}
.toc{position:sticky;top:var(--bar-h);align-self:start;max-height:calc(100vh - var(--bar-h));
  overflow:auto;padding:36px 4px 32px 0;font-size:14px;overscroll-behavior:contain}
.toc-title{margin:0 0 12px 12px;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--ink-faint);font-weight:700}
.toc ol{list-style:none;margin:0;padding:0}
.toc ol ol{margin:2px 0 6px 22px;border-left:1px solid var(--line-soft);font-size:13.5px}
.toc li{margin:0}
.toc a{display:flex;gap:10px;padding:6px 10px 6px 12px;border:0;border-left:2px solid transparent;
  border-radius:0 8px 8px 0;color:var(--ink-soft);line-height:1.4}
.toc a:hover{color:var(--ink);background:var(--surface)}
.toc a[aria-current="true"]{color:var(--ink);background:var(--surface);border-left-color:var(--orange);font-weight:600}
.toc .n{flex:none;min-width:1.4em;color:var(--ink-faint);font-variant-numeric:tabular-nums}
.doc-body{min-width:0;max-width:920px;padding:20px 0 72px}
.doc-body>p,.doc-body>ul,.doc-body>ol,.doc-body>blockquote,.doc-body>.note{max-width:74ch}
/* type */
h2{margin:56px 0 18px;padding-top:30px;border-top:1px solid var(--line-soft);font-size:25px;line-height:1.25;
  letter-spacing:-.018em;font-weight:720;position:relative}
.doc-body>h2:first-child,.doc-body>hr.rule:first-child+h2{border-top:0;margin-top:16px}
h3{margin:36px 0 10px;font-size:19px;line-height:1.35;letter-spacing:-.01em;font-weight:680;position:relative}
h4{margin:26px 0 8px;font-size:16px;font-weight:680;color:var(--ink-soft);position:relative}
h5,h6{margin:20px 0 6px;font-size:14px;font-weight:680;color:var(--ink-soft)}
.secnum{display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;
  margin-right:.6em;padding:0 .35em;border-radius:8px;background:var(--badge);color:#fff;
  font-size:.62em;font-weight:700;vertical-align:.2em;box-shadow:inset 0 -2px 0 var(--orange)}
.anchor{position:absolute;left:-1.3em;top:auto;padding:0 .3em;border:0;color:var(--ink-faint);
  font-weight:500;opacity:0;transition:opacity .15s;text-decoration:none}
h2 .anchor{bottom:.05em}
:is(h2,h3,h4):hover .anchor,.anchor:focus-visible{opacity:1}
.anchor:hover{color:var(--accent)}
p{margin:0 0 16px}
ul,ol{margin:0 0 18px;padding-left:24px}
li{margin:0 0 7px}
li>ul,li>ol{margin:7px 0 0}
li::marker{color:var(--ink-faint)}
strong{font-weight:680}
a{color:var(--accent);text-decoration:none;border-bottom:1px solid var(--accent-soft)}
a:hover{border-bottom-color:var(--accent)}
hr.rule{border:0;border-top:1px solid var(--line-soft);margin:40px 0}
hr.rule:has(+h2){display:none}
code{font:.84em/1.45 var(--mono);background:var(--surface-2);border:1px solid var(--line-soft);
  border-radius:5px;padding:.1em .38em}
blockquote{margin:0 0 18px;padding:4px 0 4px 20px;border-left:3px solid var(--line);color:var(--ink-soft)}
blockquote p:last-child{margin-bottom:0}
.footnote{margin:36px 0 0;padding-top:18px;border-top:1px solid var(--line-soft);
  color:var(--ink-faint);font-size:14.5px;font-style:italic}
/* callouts */
.note{--bar:var(--orange);margin:0 0 20px;padding:14px 18px 14px 20px;background:var(--surface);
  border:1px solid var(--line-soft);border-left:4px solid var(--bar);border-radius:10px;font-size:15.5px}
.note-info{--bar:#0972d3;background:var(--c-info)}
.note-warning{--bar:#e07b00;background:var(--c-warning)}
.note-risk{--bar:#d13212;background:var(--c-risk)}
.note-decision{--bar:#1d8102;background:var(--c-decision)}
/* pills */
.pill{display:inline-flex;align-items:center;gap:6px;padding:1px 10px 2px 8px;border-radius:999px;
  background:var(--grey-bg);color:var(--grey-fg);font-size:12.5px;font-weight:650;line-height:1.6;white-space:nowrap}
.pill::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.85}
.pill-green{background:var(--green-bg);color:var(--green-fg)}
.pill-amber{background:var(--amber-bg);color:var(--amber-fg)}
.pill-red{background:var(--red-bg);color:var(--red-fg)}
.pill-blue{background:var(--blue-bg);color:var(--blue-fg)}
.pill-strong{background:var(--strong-bg);color:var(--strong-fg)}
/* tables */
.tablewrap{margin:0 0 24px;overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius);
  background:var(--bg);-webkit-overflow-scrolling:touch}
.tablewrap.fits{overflow:visible}
table{border-collapse:separate;border-spacing:0;width:100%;font-size:14.5px;line-height:1.55}
th,td{text-align:left;vertical-align:top;padding:11px 16px;border-bottom:1px solid var(--line-soft)}
thead th{background:var(--surface);color:var(--ink-soft);font-size:11.5px;letter-spacing:.08em;
  text-transform:uppercase;font-weight:700;white-space:nowrap;border-bottom:1px solid var(--line)}
.tablewrap.fits thead th{position:sticky;top:var(--bar-h);z-index:2}
thead th:first-child{border-top-left-radius:var(--radius)}
thead th:last-child{border-top-right-radius:var(--radius)}
tbody tr:nth-child(even) td{background:color-mix(in srgb,var(--surface) 60%,transparent)}
tbody tr:hover td{background:var(--accent-soft)}
tbody tr:last-child td{border-bottom:0}
td:first-child{font-weight:560}
.tablewrap:not(.fits) :is(th,td){min-width:7.5em}
td code{white-space:nowrap}
/* figures */
figure.diagram{margin:28px 0 30px;border:1px solid var(--line);border-radius:var(--radius);
  background:var(--surface);box-shadow:var(--shadow);overflow:hidden}
.fig-canvas{position:relative;padding:22px;background:#fff;text-align:center;
  border-radius:var(--radius) var(--radius) 0 0}
.js .fig-canvas{cursor:zoom-in}
.fig-canvas svg{max-width:100%;height:auto;display:inline-block;vertical-align:top}
figure.diagram figcaption{display:flex;align-items:baseline;gap:8px;margin:0;padding:12px 18px 13px;
  border-top:1px solid var(--line-soft);font-size:14px;line-height:1.45;color:var(--ink-soft)}
figure.diagram figcaption b{flex:none;color:var(--ink);font-weight:700}
.fig-tools{position:absolute;top:10px;right:10px;display:flex;gap:6px;opacity:.0;transition:opacity .15s}
.fig-canvas:hover .fig-tools,.fig-tools:focus-within{opacity:1}
@media (hover:none){.fig-tools{opacity:1}}
.fig-tools .ibtn{height:32px;background:rgba(255,255,255,.94);border-color:#d5dbe1;color:#414d5c;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.fig-tools .ibtn:hover{background:#fff;color:#16191f}
/* code */
.code{position:relative;margin:0 0 20px}
pre{margin:0 0 20px;padding:16px 18px;background:var(--code-bg);border:1px solid var(--line-soft);
  border-radius:var(--radius);overflow-x:auto;font:13.5px/1.6 var(--mono);tab-size:2}
.code pre{margin:0}
.code[data-lang] pre{padding-top:34px}
.code[data-lang]::before{content:attr(data-lang);position:absolute;top:9px;left:18px;font:700 10.5px var(--sans);
  letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint)}
pre code{background:none;border:0;padding:0;font-size:inherit;white-space:pre}
.copy{position:absolute;top:7px;right:7px;height:28px;font-size:12px;opacity:0;transition:opacity .15s}
.code:hover .copy,.copy:focus-visible{opacity:1}
@media (hover:none){.copy{opacity:1}}
/* footer, back to top, toast */
footer.doc{border-top:1px solid var(--line-soft);background:var(--surface);color:var(--ink-faint);font-size:13px}
.foot-in{max-width:1320px;margin:0 auto;padding:22px 32px 28px;display:flex;justify-content:space-between;gap:10px 24px;flex-wrap:wrap}
.foot-in b{color:var(--ink-soft);font-weight:650}
.totop{position:fixed;right:20px;bottom:20px;z-index:35;height:42px;width:42px;border-radius:50%;
  box-shadow:var(--shadow);opacity:0;visibility:hidden;transform:translateY(8px);transition:.2s}
.totop.show{opacity:1;visibility:visible;transform:none}
.toast{position:fixed;left:50%;bottom:24px;z-index:70;transform:translate(-50%,16px);padding:9px 16px;
  border-radius:10px;background:var(--squid);color:#fff;font-size:13.5px;box-shadow:var(--shadow);
  opacity:0;pointer-events:none;transition:.2s}
.toast.show{opacity:1;transform:translate(-50%,0)}
/* figure viewer */
dialog.viewer{width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;
  background:rgba(12,17,23,.94);color:#fff}
dialog.viewer::backdrop{background:rgba(12,17,23,.7)}
.v-bar{position:absolute;left:0;right:0;top:0;z-index:2;display:flex;align-items:center;gap:12px;
  padding:10px 14px;background:linear-gradient(rgba(12,17,23,.95),rgba(12,17,23,.6))}
.v-cap{flex:1;margin:0;font-size:14px;color:#dfe4ea;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v-bar .ibtn{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18);color:#fff}
.v-bar .ibtn:hover{background:rgba(255,255,255,.16)}
.v-stage{position:absolute;inset:56px 16px 16px;overflow:hidden;border-radius:12px;background:#fff;
  cursor:grab;touch-action:none}
.v-stage.drag{cursor:grabbing}
.v-stage svg{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 0}
.v-hint{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);margin:0;padding:5px 12px;
  border-radius:8px;background:rgba(35,47,62,.85);color:#fff;font-size:12.5px;pointer-events:none}
/* narrow screens */
@media (max-width:1099px){
  .layout{grid-template-columns:minmax(0,1fr);gap:0}
  .toc{position:static;max-height:none;margin:24px 0 0;padding:16px 8px 12px 4px;border:1px solid var(--line);
    border-radius:var(--radius);background:var(--surface)}
  .js .toc-btn{display:inline-flex}
  .js .toc{position:fixed;top:calc(var(--bar-h) + 8px);left:12px;right:12px;z-index:45;margin:0;
    max-height:calc(100vh - var(--bar-h) - 24px);background:var(--bg);box-shadow:var(--shadow);display:none}
  .js .toc.open{display:block}
  .doc-body{padding-top:8px}
  .anchor{display:none}
}
@media (max-width:640px){
  :root{--bar-h:52px}
  body{font-size:16px}
  .hero-in{padding:40px 20px 34px} .layout{padding:0 18px} .foot-in{padding:18px 20px 24px}
  .standfirst{font-size:16.5px} .subtitle{font-size:18px}
  .meta li{padding:7px 11px}
  h2{font-size:21.5px;margin-top:44px;padding-top:24px}
  .brand .kind{display:none} .brand .t::before{display:none}
  .fig-canvas{padding:12px}
  th,td{padding:10px 12px}
  .ibtn .lbl{display:none}
}
@media print{
  @page{margin:16mm 15mm}
  body{background:#fff;font-size:10.5pt;line-height:1.5}
  .topbar,.totop,.toast,.anchor,.copy,.fig-tools,dialog.viewer,.skip{display:none!important}
  .hero{background:none;color:var(--ink);border-bottom:2px solid var(--orange)}
  .hero::before,.hero::after{display:none}
  .hero-in{padding:0 0 16px}
  .eyebrow{background:none;border:0;padding:0;color:var(--ink-faint)}
  .hero h1{color:var(--ink);max-width:none} .standfirst,.subtitle,.meta-line{color:var(--ink-soft)}
  .meta li{background:none;border-color:var(--line)} .meta b{color:var(--ink-faint)} .meta li>span{color:var(--ink)}
  .layout{display:block;padding:0;max-width:none}
  .toc,.js .toc{display:block;position:static;max-height:none;margin:16px 0;padding:12px 16px;
    border:1px solid var(--line);border-radius:8px;box-shadow:none;background:none;break-inside:avoid}
  .toc a[aria-current]{background:none;border-left-color:transparent;font-weight:400}
  .doc-body{max-width:none;padding:0}
  h2,h3,h4{break-after:avoid;page-break-after:avoid}
  figure.diagram,.note,pre,tr,.code{break-inside:avoid;page-break-inside:avoid}
  figure.diagram{box-shadow:none;background:none}
  .fig-canvas{padding:8px}
  thead{display:table-header-group}
  .tablewrap{overflow:visible}
  table{font-size:9pt} :is(th,td),.tablewrap:not(.fits) :is(th,td){min-width:0;padding:6px 8px}
  thead th,td code{white-space:normal} td{overflow-wrap:anywhere}
  .tablewrap.fits thead th{position:static}
  tbody tr:hover td,tbody tr:nth-child(even) td{background:none}
  a{color:var(--ink);border:0}
  .foot-in{padding:12px 0 0}
  footer.doc{background:none}
}
""".replace("/*DARK*/", DARK_VARS)

# Runs before first paint, so a stored dark choice does not flash light.
HEAD_JS = ("document.documentElement.classList.add('js');try{var t=localStorage.getItem('dd-theme');"
           "if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}")

# Progressive enhancement only: with scripts off the page still reads, prints and links.
JS = r"""
(function(){
var d=document,R=d.documentElement,W=window;
function $$(s,c){return Array.prototype.slice.call((c||d).querySelectorAll(s))}
function el(t,a,h){var e=d.createElement(t);for(var k in a)e.setAttribute(k,a[k]);if(h)Array.prototype.slice.call(new DOMParser().parseFromString(h,'text/html').body.childNodes).forEach(function(n){e.appendChild(n)});return e}
var toast=d.querySelector('.toast'),tt;
function say(m){toast.textContent=m;toast.classList.add('show');clearTimeout(tt);tt=setTimeout(function(){toast.classList.remove('show')},1600)}
function copy(txt,ok){function old(){var a=el('textarea');a.value=txt;a.style.position='fixed';a.style.opacity='0';d.body.appendChild(a);a.select();try{d.execCommand('copy');say(ok)}catch(e){say('Copy failed')}a.remove()}
 if(navigator.clipboard&&W.isSecureContext)navigator.clipboard.writeText(txt).then(function(){say(ok)},old);else old()}
/* theme */
var mq=W.matchMedia('(prefers-color-scheme: dark)'),tb=d.getElementById('theme-btn');
function isDark(){var t=R.getAttribute('data-theme');return t?t==='dark':mq.matches}
function sync(){tb.setAttribute('aria-pressed',String(isDark()))}
tb.addEventListener('click',function(){var v=isDark()?'light':'dark';R.setAttribute('data-theme',v);try{localStorage.setItem('dd-theme',v)}catch(e){}sync()});
if(mq.addEventListener)mq.addEventListener('change',sync);sync();
d.getElementById('print-btn').addEventListener('click',function(){W.print()});
/* contents menu on narrow screens */
var toc=d.getElementById('toc'),tbtn=d.getElementById('toc-btn');
function menu(open){if(!toc)return;toc.classList.toggle('open',open);tbtn.setAttribute('aria-expanded',String(open))}
if(toc){tbtn.addEventListener('click',function(){menu(!toc.classList.contains('open'))});
 toc.addEventListener('click',function(e){if(e.target.closest('a'))menu(false)});
 d.addEventListener('keydown',function(e){if(e.key==='Escape'&&toc.classList.contains('open')){menu(false);tbtn.focus()}});
 d.addEventListener('click',function(e){if(toc.classList.contains('open')&&!toc.contains(e.target)&&!tbtn.contains(e.target))menu(false)})}
else tbtn.remove();
/* heading anchors */
$$('.doc-body h2[id],.doc-body h3[id],.doc-body h4[id]').forEach(function(h){
 var a=el('a',{'class':'anchor',href:'#'+h.id,'aria-label':'Copy link to '+h.textContent.trim()},'#');
 a.addEventListener('click',function(e){e.preventDefault();history.replaceState(null,'','#'+h.id);h.scrollIntoView();copy(location.href,'Link copied')});
 h.insertBefore(a,h.firstChild)});
/* code copy */
$$('.doc-body pre').forEach(function(p){var w=el('div',{'class':'code'}),c=p.querySelector('code'),m=c&&/language-([\w+#.-]+)/.exec(c.className);
 if(m)w.setAttribute('data-lang',m[1]);p.parentNode.insertBefore(w,p);w.appendChild(p);
 var b=el('button',{'class':'ibtn copy',type:'button'},'Copy');b.addEventListener('click',function(){copy(p.innerText.replace(/\n$/,''),'Copied')});w.appendChild(b)});
/* sticky table headers where the table fits (a scrolling wrapper would trap them) */
function fit(){$$('.tablewrap').forEach(function(w){w.classList.remove('fits');if(w.firstChild.scrollWidth<=w.clientWidth+1)w.classList.add('fits')})}
fit();W.addEventListener('resize',fit);
/* scroll: progress, scroll-spy, back to top */
var bar=d.querySelector('.progress'),hero=d.querySelector('.hero'),top=d.querySelector('.totop'),
 links=$$('#toc a'),heads=links.map(function(a){return d.getElementById(decodeURIComponent(a.hash.slice(1)))}),cur=-1,tick=0;
function onScroll(){tick=0;var y=W.scrollY,h=R.scrollHeight-W.innerHeight;
 bar.style.transform='scaleX('+(h>0?Math.min(1,y/h):0)+')';
 d.body.classList.toggle('scrolled',y>hero.offsetHeight-40);top.classList.toggle('show',y>900);
 var off=parseInt(getComputedStyle(R).getPropertyValue('--bar-h'))+Math.min(160,W.innerHeight*.25),n=-1;
 for(var i=0;i<heads.length;i++){if(heads[i]&&heads[i].getBoundingClientRect().top<=off)n=i}
 if(y+W.innerHeight>=R.scrollHeight-4&&heads.length)n=heads.length-1;
 if(n!==cur){if(cur>=0)links[cur].removeAttribute('aria-current');cur=n;
  if(n>=0){links[n].setAttribute('aria-current','true');var t=toc,r=links[n].getBoundingClientRect(),q=t.getBoundingClientRect();
   if(t.scrollHeight>t.clientHeight&&(r.top<q.top||r.bottom>q.bottom))t.scrollTop+=r.top-q.top-q.height/2}}}
W.addEventListener('scroll',function(){if(!tick){tick=1;requestAnimationFrame(onScroll)}},{passive:true});onScroll();
top.addEventListener('click',function(){W.scrollTo(0,0);d.getElementById('content').focus({preventScroll:true})});
/* figures: full-screen viewer and SVG download */
var dlg=el('dialog',{'class':'viewer','aria-label':'Figure viewer'},
 '<div class="v-bar"><p class="v-cap"></p><button class="ibtn" data-z="-1" type="button" aria-label="Zoom out">&minus;</button>'+
 '<button class="ibtn" data-z="0" type="button" aria-label="Fit to screen">Fit</button><button class="ibtn" data-z="1" type="button" aria-label="Zoom in">+</button>'+
 '<a class="ibtn v-dl" href="#">SVG</a><button class="ibtn v-x" type="button" aria-label="Close">&times;</button></div>'+
 '<div class="v-stage" tabindex="0" aria-label="Figure. Drag to pan, scroll or plus and minus keys to zoom"></div><p class="v-hint">Scroll or pinch to zoom, drag to pan, Esc to close</p>');
d.body.appendChild(dlg);
var st=dlg.querySelector('.v-stage'),vs,S=1,X=0,Y=0,P={},pd=0,opener;
function paint(){if(vs)vs.style.transform='translate('+X+'px,'+Y+'px) scale('+S+')'}
function zoom(f,cx,cy){var r=st.getBoundingClientRect();if(cx==null){cx=r.width/2;cy=r.height/2}
 var n=Math.max(.5,Math.min(16,S*f));X=cx-(cx-X)*n/S;Y=cy-(cy-Y)*n/S;S=n;paint()}
function reset(){S=1;X=0;Y=0;paint()}
function dataUrl(svg){var c=svg.cloneNode(true),vb=svg.viewBox&&svg.viewBox.baseVal;
 if(vb&&vb.width){c.setAttribute('width',vb.width);c.setAttribute('height',vb.height)}['style','role','aria-labelledby'].forEach(function(n){c.removeAttribute(n)});
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(c))}
function fname(fig,i){var c=fig.querySelector('figcaption');var s=(c?c.textContent:'figure '+i).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(s.length>60)s=s.slice(0,60).replace(/-[^-]*$/,'');return (s||'figure-'+i)+'.svg'}
function dl(a,fig,i){a.setAttribute('download',fname(fig,i));a.href=dataUrl(fig.querySelector('.fig-canvas svg'))}
function open(fig,i){opener=d.activeElement;var svg=fig.querySelector('.fig-canvas svg');
 st.textContent='';vs=svg.cloneNode(true);vs.removeAttribute('style');vs.setAttribute('aria-hidden','true');st.appendChild(vs);
 var c=fig.querySelector('figcaption');dlg.querySelector('.v-cap').textContent=c?c.textContent:'Figure';
 var a=dlg.querySelector('.v-dl');a.onclick=function(){dl(a,fig,i)};reset();dlg.showModal();st.focus()}
dlg.addEventListener('close',function(){st.textContent='';vs=null;if(opener&&opener.focus)opener.focus()});
dlg.querySelector('.v-x').addEventListener('click',function(){dlg.close()});
$$('[data-z]',dlg).forEach(function(b){b.addEventListener('click',function(){var z=+b.getAttribute('data-z');z?zoom(z>0?1.4:1/1.4):reset()})});
st.addEventListener('wheel',function(e){e.preventDefault();var r=st.getBoundingClientRect();zoom(Math.exp(-e.deltaY*(e.deltaMode?.05:.0018)),e.clientX-r.left,e.clientY-r.top)},{passive:false});
st.addEventListener('dblclick',function(e){var r=st.getBoundingClientRect();zoom(2,e.clientX-r.left,e.clientY-r.top)});
function pts(){var k=Object.keys(P);return k.map(function(i){return P[i]})}
st.addEventListener('pointerdown',function(e){st.setPointerCapture(e.pointerId);P[e.pointerId]={x:e.clientX,y:e.clientY};st.classList.add('drag');var p=pts();if(p.length===2)pd=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)});
st.addEventListener('pointermove',function(e){var o=P[e.pointerId];if(!o)return;var p=pts();
 if(p.length===1){X+=e.clientX-o.x;Y+=e.clientY-o.y;o.x=e.clientX;o.y=e.clientY;paint()}
 else if(p.length===2){o.x=e.clientX;o.y=e.clientY;var nd=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),r=st.getBoundingClientRect();
  if(pd)zoom(nd/pd,(p[0].x+p[1].x)/2-r.left,(p[0].y+p[1].y)/2-r.top);pd=nd}});
function up(e){delete P[e.pointerId];pd=0;if(!pts().length)st.classList.remove('drag')}
st.addEventListener('pointerup',up);st.addEventListener('pointercancel',up);
dlg.addEventListener('keydown',function(e){var k=e.key,m=60;
 if(k==='+'||k==='=')zoom(1.4);else if(k==='-'||k==='_')zoom(1/1.4);else if(k==='0')reset();
 else if(k==='ArrowLeft')X+=m;else if(k==='ArrowRight')X-=m;else if(k==='ArrowUp')Y+=m;else if(k==='ArrowDown')Y-=m;else return;
 e.preventDefault();paint()});
var ICON_ZOOM='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
 ICON_DL='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
$$('.doc-body figure.diagram').forEach(function(fig,i){var cv=fig.querySelector('.fig-canvas');if(!cv||!cv.querySelector('svg'))return;
 var c=fig.querySelector('figcaption b'),lab=c?c.textContent.replace(/\.$/,''):'figure '+(i+1),t=el('div',{'class':'fig-tools'});
 var z=el('button',{'class':'ibtn',type:'button','aria-label':'Open '+lab+' full screen'},ICON_ZOOM),
  a=el('a',{'class':'ibtn',href:'#','aria-label':'Download '+lab+' as SVG'},ICON_DL);
 z.addEventListener('click',function(e){e.stopPropagation();open(fig,i+1)});a.addEventListener('click',function(e){e.stopPropagation();dl(a,fig,i+1)});
 t.appendChild(z);t.appendChild(a);cv.appendChild(t);
 cv.addEventListener('click',function(e){if(!e.target.closest('.fig-tools'))open(fig,i+1)})});
})();
"""


# `code`, with a run of backticks closed by a run of the same length (``a ` b``)
CODE_SPAN_RE = re.compile(r"(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)")
# [text](target) or ![alt](target), with an optional "title"
LINK_RE = re.compile(r"(!?)\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+(?:\"[^\"]*\"|'[^']*'))?\s*\)")
EXTERNAL_LINK_RE = re.compile(r"(?:https?|mailto):", re.I)

# Where relative links resolve from, the heading ids an #anchor may name, and every link
# that could not be resolved (printed after the build; fatal with --strict).
LINKS = {"base": None, "ids": None, "problems": []}


def resolve_link(target, base, ids=None):
    """(href, problem) for a markdown link target; href None means render the text plain.

    http(s) and mailto pass through. `#anchor` passes through, with a problem if no heading
    has that id. `x.md` (optionally `#frag`) becomes the sibling `x.html` when that page has
    been built next to it, else plain text: a link to a .md file is dead once the page is
    mailed. Any other relative path is kept if the file exists. build-docx.py uses the same.
    """
    t = target.strip()
    if EXTERNAL_LINK_RE.match(t):
        return t, None
    if t.startswith("#"):
        if ids is not None and t[1:] not in ids:
            return t, f"link {t} matches no heading in this document"
        return t, None
    if base is None:
        return t, None
    path, _, frag = t.partition("#")
    local = urllib.parse.unquote(path)
    frag = f"#{frag}" if frag else ""
    if local.lower().endswith(".md"):
        rel = pathlib.PurePosixPath(local)
        for name in (rel.stem.lower() + ".html", rel.stem + ".html"):
            if (base / rel.with_name(name)).is_file():
                return urllib.parse.quote(str(rel.with_name(name))) + frag, None
        return None, (f"link {t}: no {rel.stem.lower()}.html built next to it, so it is shown "
                      "as plain text (build that document first, or link its published URL)")
    if (base / local).exists():
        return t, None
    return None, f"link {t}: {local} not found, so it is shown as plain text"


def _link_problem(msg):
    if msg not in LINKS["problems"]:
        LINKS["problems"].append(msg)


def _emphasis(t):
    # non-greedy and asterisk-tolerant, so nested emphasis (**a *b* c**) still matches
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    return re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"<em>\1</em>", t)


def _bare_url(m):
    url = m.group(0)
    # sentence punctuation after a URL is not part of it; a ) only when it has no (
    while url and (url[-1] in ".,;:!?'" or (url[-1] == ")" and "(" not in url)):
        url = url[:-1]
    return url, m.group(0)[len(url):]


def inline(text):
    """Escape, then apply the inline markdown these docs actually use.

    Code spans, then links, are lifted out into placeholders first, so `**` or a URL inside
    backticks stays literal and emphasis rules never reach into an href.
    """
    stash = []

    def keep(s):
        stash.append(s)
        return f"\x00{len(stash) - 1}\x00"

    t = html.escape(text, quote=False)
    t = CODE_SPAN_RE.sub(lambda m: keep(f"<code>{m.group(2).strip() or m.group(2)}</code>"), t)

    def link(m):
        label, target = m.group(2), html.unescape(m.group(3))
        href, problem = resolve_link(target, LINKS["base"], LINKS["ids"])
        if problem:
            _link_problem(problem)
        if href is None:
            return keep(_emphasis(label))
        rel = ' rel="noopener"' if EXTERNAL_LINK_RE.match(href) else ""
        return keep(f'<a href="{html.escape(href)}"{rel}>{_emphasis(label)}</a>')

    t = LINK_RE.sub(link, t)
    t = re.sub(r"&lt;((?:https?|mailto):[^\s&]+?)&gt;",
               lambda m: keep(f'<a href="{m.group(1)}" rel="noopener">{m.group(1)}</a>'), t)

    def bare(m):
        url, rest = _bare_url(m)
        return keep(f'<a href="{url}" rel="noopener">{url}</a>') + rest

    t = re.sub(r"(?<![\w/\"'=])https?://(?:(?!&[lg]t;)[^\s<>\"\x00])+", bare, t)
    t = _emphasis(t)
    while "\x00" in t:
        t = re.sub(r"\x00(\d+)\x00", lambda m: stash[int(m.group(1))], t)
    return t


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"<[^>]+>", "", text).lower()).strip("-")


FRONT_KEYS = ("title", "version", "status", "owner", "reviewers", "audience", "classification",
              "date")
META_LABELS = {k: k.capitalize() for k in FRONT_KEYS[1:]}
# `prepared_by`, `prepared_for`, `subtitle` and `kind` are front matter keys too, shown in their
# own places rather than in the metadata row.
PREPARED_BY = "AWS Professional Services"   # the default `prepared_by`
# Kinds laid out as one page: a compact title block, no cover, history or contents pages.
ONE_PAGE_KINDS = ("brief", "refarch")
KIND_LABELS = {"hld": "High Level Design", "lld": "Low Level Design",
               "adr": "Architecture Decision Record", "runbook": "Runbook", "overview": "Overview",
               "security": "Security Design", "migration": "Migration Plan",
               "war": "Well-Architected Review", "orr": "Operational Readiness Review",
               "assessment": "Assessment", "brief": "Solution Brief", "refarch": "Reference Architecture"}
HISTORY_RE = re.compile(r"^##\s+(?:\d{1,2}(?:\.\d{1,2})*\.?\s+)?document history\s*$", re.I)
TABLE_SEP_RE = re.compile(r"^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?$")


def doc_kind(meta):
    return str(meta.get("kind", "")).strip().lower()


def prepared(meta):
    """(prepared by, prepared for); prepared by defaults to PREPARED_BY, prepared for may be ""."""
    return meta.get("prepared_by") or PREPARED_BY, meta.get("prepared_for", "")


def split_history(md):
    """(md, table lines, heading id): the first table under `## Document history` lifted out.

    The heading and its section go too when nothing but blank lines, rules and comments is left
    in it, and its id is returned so #anchor links can land on the lifted table; otherwise they
    stay with the rest of the section and the id is "". No such heading, or no table under it,
    returns md unchanged with no table. build-docx.py uses the same split.
    """
    lines, fence = md.split("\n"), False
    for n, line in enumerate(lines):
        s = line.strip()
        if s.startswith("```"):
            fence = not fence
            continue
        if fence or not HISTORY_RE.match(s):
            continue
        end = n + 1
        while end < len(lines):
            hm = HEADING_RE.match(lines[end].strip())
            if hm and len(hm.group(1)) <= 2:
                break
            end += 1
        start = next((j for j in range(n + 1, end) if lines[j].strip().startswith("|")), None)
        if start is None:
            return md, [], ""
        stop = start
        while stop < end and lines[stop].strip().startswith("|"):
            stop += 1
        table = [x.strip() for x in lines[start:stop]]
        if len(table) < 2 or not TABLE_SEP_RE.match(table[1]):
            return md, [], ""
        rest = re.sub(r"<!--.*?-->", "", "\n".join(lines[n + 1:start] + lines[stop:end]), flags=re.S)
        if any(x.strip() and not RULE_RE.match(x.strip()) for x in rest.split("\n")):
            return "\n".join(lines[:start] + lines[stop:]), table, ""
        return "\n".join(lines[:n] + lines[end:]), table, slug(HEADING_RE.match(s).group(2).strip())
    return md, [], ""


def _unquote(v):
    v = v.strip()
    return v[1:-1] if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'" else v


def front_matter(md):
    """(meta, rest) for an optional YAML block between `---` lines at the very top.

    Only the flat subset a document header needs: `key: value`, `key: [a, b]`, and a `key:`
    followed by `- item` lines. Lists are joined with ", ". A block with any other kind of line
    is not front matter, so a document that merely opens with a rule builds as before.
    """
    if not md.startswith("---\n"):
        return {}, md
    end = re.search(r"^(?:---|\.\.\.)[ \t]*$", md[4:], re.M)
    if not end:
        return {}, md
    meta, key = {}, None
    for line in md[4:4 + end.start()].split("\n"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        kv = re.match(r"^([A-Za-z_][\w-]*)\s*:(?:\s+(.*))?$", line)
        item = re.match(r"^\s+-\s+(.*)$", line)
        if kv:
            key, val = kv.group(1).lower(), (kv.group(2) or "").strip()
            if val.startswith("[") and val.endswith("]"):
                val = ", ".join(_unquote(v) for v in val[1:-1].split(",") if v.strip())
            meta[key] = _unquote(val)
        elif item and key:
            v = _unquote(item.group(1))
            meta[key] = f"{meta[key]}, {v}" if meta[key] else v
        elif key and line.startswith((" ", "\t")):
            meta[key] = f"{meta[key]} {line.strip()}".strip()
        else:
            return {}, md
    if not meta:
        return {}, md
    return meta, md[4 + end.end():].lstrip("\n")


# A table cell (or the front matter status) that is exactly one of these words is drawn as
# a coloured pill. Anything else stays plain text.
PILL_TONES = {
    "green": ("accepted", "approved", "done", "closed", "resolved", "complete", "completed",
              "yes", "pass", "passed", "live", "final"),
    "amber": ("proposed", "open", "in progress", "pending", "draft", "in review", "review",
              "medium", "should", "partial"),
    "red": ("high", "critical", "rejected", "blocked", "fail", "failed", "no"),
    "blue": ("low", "info", "planned", "new"),
    "grey": ("superseded", "deprecated", "withdrawn", "won't", "wont", "could", "n/a",
             "example", "deferred"),
    "strong": ("must",),
}
PILL_TONE = {w: tone for tone, words in PILL_TONES.items() for w in words}


def pill(text, default=None):
    """`text` as a status pill when it is one of PILL_TONE's words (or default is a tone)."""
    tone = PILL_TONE.get(re.sub(r"[*_`]", "", text).strip().lower(), default)
    if not tone:
        return inline(text)
    return f'<span class="pill pill-{tone}">{inline(text)}</span>'


def meta_row(meta):
    """The metadata row under the title: prepared by and for, then every front matter key in
    META_LABELS, in order. Only when the document has front matter.

    The status value is drawn as a pill (a known word gets its colour, any other is grey)."""
    if not meta:
        return ""
    by, to = prepared(meta)
    items = f'<li class="m-prepared_by"><b>Prepared by</b><span>{inline(by)}</span></li>'
    if to:
        items += f'<li class="m-prepared_for"><b>Prepared for</b><span>{inline(to)}</span></li>'
    items += "".join(f'<li class="m-{k}"><b>{label}</b><span>'
                     f'{pill(meta[k], "grey") if k == "status" else inline(meta[k])}</span></li>'
                     for k, label in META_LABELS.items() if meta.get(k))
    return f'\n  <ul class="meta">{items}</ul>'


def meta_text(meta):
    """The one metadata line of a one-page layout, as plain markdown text (both builders)."""
    if not meta:
        return ""
    by, to = prepared(meta)
    parts = [f"Prepared by {by}" + (f" for {to}" if to else "")]
    parts += [f"{label}: {meta[k]}" for k, label in META_LABELS.items() if meta.get(k)]
    return "   |   ".join(parts)


# A bold lead naming one of these kinds colours the callout; any other bold lead is a plain note.
CALLOUT_KINDS = {"note": "info", "info": "info", "tip": "info", "warning": "warning",
                 "caution": "warning", "important": "warning", "risk": "risk",
                 "decision": "decision"}
CALLOUT_RE = re.compile(r"^\*\*(\w+)\b")

# "1. Summary", "4.1 Networking": the number is drawn as a badge in headings and the contents.
# Bounded repetition (at most 7 levels) keeps matching linear on long headings.
SECNUM_RE = re.compile(r"^(\d{1,2}(?:\.\d{1,2}){0,6})(\.)?\s+(?=\S)")  # nosemgrep


def split_secnum(text):
    """(number, rest) for a numbered heading, else ("", text)."""
    m = SECNUM_RE.match(text)
    if m and (m.group(2) or "." in m.group(1)):
        return m.group(1), text[m.end():]
    return "", text


def heading_html(text):
    num, rest = split_secnum(text)
    if not num:
        return inline(text)
    return f'<span class="secnum">{num}<span class="sr">.</span></span>{inline(rest)}'


def toc_list(toc):
    """The contents list: H2 entries, each H3 nested under the H2 above it."""
    parts, sub = [], False
    for level, sid, text in toc:
        num, rest = split_secnum(text)
        item = (f'<a href="#{sid}">' + (f'<span class="n">{num}</span>' if num else "")
                + f"<span>{html.escape(rest)}</span></a>")
        if level == 3 and parts:
            if not sub:
                parts.append("<ol>")
                sub = True
            parts.append(f"<li>{item}</li>")
            continue
        if sub:
            parts.append("</ol>")
            sub = False
        if parts:
            parts.append("</li>")
        parts.append(f"<li>{item}")
    if sub:
        parts.append("</ol>")
    if parts:
        parts.append("</li>")
    return "".join(parts)


def lint_doc(src):
    """Run lint-doc.py over the source, print its findings, return the error count."""
    sys.dont_write_bytecode = True   # no __pycache__ left in the skill folder
    spec = importlib.util.spec_from_file_location("lint_doc", HERE / "lint-doc.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    errors, _ = mod.report(src, mod.lint(src, confine=CONFINE_DIR is not None), show_info=False)
    return errors


def split_row(row):
    """Cells of a table row: split on `|` outside code spans and not escaped, then unescape `\\|`."""
    s = row.strip()
    s = s[1:] if s.startswith("|") else s
    s = s[:-1] if s.endswith("|") and not s.endswith("\\|") else s

    def split(code_aware):
        cells, cur, i, tick = [], [], 0, 0
        while i < len(s):
            c = s[i]
            if c == "\\" and s[i + 1:i + 2] == "|":
                cur.append("|"); i += 2; continue
            if c == "`" and code_aware:
                n = len(re.match(r"`+", s[i:]).group(0))
                tick = n if tick == 0 else (0 if tick == n else tick)
                cur.append("`" * n); i += n; continue
            if c == "|" and tick == 0:
                cells.append("".join(cur).strip()); cur = []; i += 1; continue
            cur.append(c); i += 1
        cells.append("".join(cur).strip())
        return cells, tick

    cells, open_tick = split(True)
    # an unclosed backtick would swallow the rest of the row; fall back to a plain split
    return split(False)[0] if open_tick else cells


LIST_ITEM_RE = re.compile(r"^( *)([-*+]|\d+\.)[ \t]+(.*)$")


def parse_list(lines, i):
    """(html, next index) for the list starting at line i, nested by indentation.

    A deeper indent (2 or 4 spaces, or 3 under `1.`) opens a list inside the item above; a
    blank line ends the list unless another item or an indented continuation follows.
    """
    items = []                       # [indent, tag, start number, text]
    while i < len(lines):
        raw = lines[i].expandtabs(4)
        m = LIST_ITEM_RE.match(raw)
        if m:
            mk = m.group(2)
            tag = "ol" if mk[0].isdigit() else "ul"
            items.append([len(m.group(1)), tag, int(mk[:-1]) if tag == "ol" else None,
                          m.group(3).strip()])
            i += 1
            continue
        cur = raw.strip()
        if cur and not is_block_start(cur) and raw.startswith("  "):
            items[-1][3] += " " + cur
            i += 1
            continue
        if not cur and i + 1 < len(lines):
            nxt = lines[i + 1].expandtabs(4)
            if LIST_ITEM_RE.match(nxt) or (nxt.startswith("  ") and nxt.strip()
                                            and not is_block_start(nxt.strip())):
                i += 1
                continue
        break

    out, stack = [], []              # stack of (indent, tag) for the open lists
    for indent, tag, start, text in items:
        while stack and indent < stack[-1][0]:
            out.append(f"</li></{stack.pop()[1]}>")
        if stack and indent == stack[-1][0] and tag != stack[-1][1]:
            out.append(f"</li></{stack.pop()[1]}>")
        if stack and indent == stack[-1][0]:
            out.append("</li>")
        else:
            attr = f' start="{start}"' if start not in (None, 1) else ""
            out.append(f"<{tag}{attr}>")
            stack.append((indent, tag))
        out.append(f"<li>{inline(text)}")
    while stack:
        out.append(f"</li></{stack.pop()[1]}>")
    return "".join(out), i


def override_line(lines, idx):
    """Index of an aws-svg marker following mermaid placeholder line idx, else None.

    One blank line is allowed in the source; the placeholder adds one of its own.
    """
    for j in range(idx + 1, min(idx + 4, len(lines))):
        if marker(lines[j])[0]:
            return j
        if lines[j].strip():
            break
    return None


def mermaid_as_code(body):
    return '<pre><code class="language-mermaid">' + html.escape(body.rstrip("\n"), quote=False) + "</code></pre>"


def render_mermaid(blocks, workdir, strict=False):
    """Pre-render each mermaid block to standalone SVG markup; None entries are skipped.

    Without a local mmdc each block comes back as a `<pre><code>` of its source, as in the
    Word build, and the build warns; with strict=True it fails instead.
    """
    if not any(b is not None for b in blocks):
        return [None] * len(blocks)
    # No network: use an mmdc that is already on the PATH and never let npx download one.
    mmdc = shutil.which("mmdc")
    if not mmdc:
        msg = ("this doc has mermaid fences but no local mermaid-cli (mmdc) on the PATH. "
               "Draw the figure with aws-archify as an AWS-icon SVG and reference it with "
               "<!-- aws-svg: path.svg -->, or install @mermaid-js/mermaid-cli yourself.")
        if strict:
            sys.exit(f"error: {msg}")
        print(f"  WARNING: {msg} The mermaid source is shown as a code block.")
        return [None if b is None else mermaid_as_code(b) for b in blocks]
    cfg = workdir / "mermaid.json"
    cfg.write_text(json.dumps(MERMAID_THEME))
    # mermaid-cli drives puppeteer, and inside an already-sandboxed shell Chrome cannot
    # start its own sandbox: it dies with ConnectionClosedError in Page.close and no SVG
    # is written. --no-sandbox is safe here - it only renders a local file we just made.
    pcfg = workdir / "puppeteer.json"
    pcfg.write_text(json.dumps({"args": ["--no-sandbox", "--disable-gpu"]}))
    svgs = []
    for i, body in enumerate(blocks, 1):
        if body is None:            # replaced by an aws-svg figure; no need to render it
            svgs.append(None)
            continue
        src, out = workdir / f"d{i}.mmd", workdir / f"d{i}.svg"
        src.write_text(body)
        # Argument list, no shell: mmdc comes from shutil.which and every path is a temp file made here.
        r = subprocess.run(  # nosec B603  # nosemgrep
            [mmdc, "-i", str(src), "-o", str(out),
             "-c", str(cfg), "-p", str(pcfg), "-b", "transparent"],
            capture_output=True, text=True,
        )
        if not out.exists():
            sys.exit(f"error: mermaid render failed for block {i}\n{r.stderr[-800:]}")
        svg = re.sub(r"<\?xml[^>]*\?>", "", out.read_text()).strip()
        svg = re.sub(r'style="max-width:[^"]*"', 'style="max-width:100%"', svg)
        svgs.append(svg)
        print(f"  rendered diagram {i}/{len(blocks)}")
    return svgs


# A figure marker is a whole line of its own; the same text inside prose or backticks is prose.
# `<!-- aws-svg: path.svg -->` or `<!-- aws-svg: path.svg | Caption -->`; the path runs up to
# ` | ` or ` -->`, so it may contain spaces.
AWSSVG_RE = re.compile(r"<!--\s*aws-svg:\s*([^|\s](?:[^|]*?[^|\s])?)\s*(?:\|\s*(.*?)\s*)?-->")
ARCHIFY_RE = re.compile(r"<!--\s*archify:\s*(\S+?)\s*-->")
ARCHIFY_ERROR = ("error: <!-- archify: {} --> is no longer supported. Only <!-- aws-svg: path.svg --> "
                 "figures are: redraw it with aws-archify as an AWS-icon SVG.")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
RULE_RE = re.compile(r"^-{3,}$")
BULLET_RE = re.compile(r"^[-*+] ")
ORDERED_RE = re.compile(r"^\d+\. ")
MERMAID_RE = re.compile(r"```mermaid[ \t]*\n(.*?)```", re.S)

# What makes a page not self-contained: things a browser fetches. Ordinary <a href> links
# are navigation, not loads, so they do not count.
EXTERNAL_RE = re.compile(
    r"""\bsrc\s*=\s*["']?https?://"""
    r"""|<image\b[^>]*?(?<![\w:])href\s*=\s*["']https?://"""
    r"""|\bxlink:href\s*=\s*["']https?://"""
    r"""|<link\b[^>]*?\bhref\s*=\s*["']https?://"""
    r"""|@import\b"""
    r"""|url\(\s*["']?https?://""", re.I)


def strip_root_size(svg):
    """Drop width/height from the root <svg> tag only, so the figure scales to the column.

    Child elements keep theirs: a rect or image losing its size would vanish.
    """
    m = re.match(r"""<svg\b(?:[^>"']|"[^"]*"|'[^']*')*>""", svg)
    if not m:
        return svg
    root = re.sub(r"""\s(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*')""", "", m.group(0))
    return root + svg[m.end():]


# With --confine (the MCP server sets it when it runs remotely), a figure must sit inside the document's
# folder, so a pasted document cannot pull another file on the server into its output.
CONFINE_DIR = None


def confined(path, given):
    """`path` (resolved), or exit when --confine is on and it lies outside the document's folder."""
    if CONFINE_DIR is not None and not path.is_relative_to(CONFINE_DIR):
        sys.exit(f"error: {given} is outside the document's folder (--confine)")
    return path


def aws_svg_figure(path):
    """Inline an SVG from the aws-archify aws-svg renderer.

    Those files carry only presentation attributes - no CSS classes and no <style> - so
    they need no style extraction and no scoping. The root element also keeps its
    embedded mxfile, so the result stays editable in diagrams.net.
    """
    if not path.exists():
        sys.exit(f"error: aws-svg not found: {path}")
    raw = path.read_text()
    m = re.search(r"<svg\b.*</svg>", raw, re.S)
    if not m:
        sys.exit(f"error: no <svg> in {path.name}")
    if re.match(r'<svg\b[^>]*\bdata-poster="true"', m.group(0)):
        sys.exit(f"error: {path.name} is a poster figure (<Diagram poster>), too wide to read in a page; "
                 "embed an overview and detail figures instead and deliver the poster on its own")
    svg = strip_root_size(m.group(0))
    print(f"  aws-svg {path.name}: {len(re.findall('<path', svg))} paths, "
          f"{len(EXTERNAL_RE.findall(svg))} external refs")
    return svg


def marker(line):
    """('aws', path, caption or None) for an aws-svg marker line; exits on a leftover archify marker."""
    s = line.strip()
    aw = AWSSVG_RE.fullmatch(s)
    if aw:
        return "aws", aw.group(1), (aw.group(2) or None)
    am = ARCHIFY_RE.fullmatch(s)
    if am:
        sys.exit(ARCHIFY_ERROR.format(am.group(1)))
    return None, None, None


def heading_ids(md_text):
    """The ids convert() gives headings (every heading but the first H1), for #anchor checks."""
    ids, first_h1, fence = set(), True, False
    for line in md_text.split("\n"):
        s = line.strip()
        if s.startswith("```"):
            fence = not fence
            continue
        hm = None if fence else HEADING_RE.match(s)
        if hm:
            if len(hm.group(1)) == 1 and first_h1:
                first_h1 = False
                continue
            ids.add(slug(hm.group(2).strip()))
    return ids


def is_block_start(cur):
    """A stripped line that starts some block other than a paragraph."""
    return bool(not cur or HEADING_RE.match(cur) or RULE_RE.match(cur) or BULLET_RE.match(cur)
                or ORDERED_RE.match(cur)
                or cur.startswith(("|", "@@DIAGRAM", "```", ">", "<!--")))


def table_html(rows):
    """A markdown table (its stripped `|` lines) as HTML; status words in body cells as pills."""
    head = split_row(rows[0])
    # a body row is padded or cut to the header's width, as GitHub renders it
    thead = "".join(f"<th>{inline(c)}</th>" for c in head)
    body = "".join(
        "<tr>" + "".join(f"<td>{pill(c)}</td>"
                         for c in (split_row(r) + [""] * len(head))[:len(head)]) + "</tr>"
        for r in rows[2:]
    )
    return ('<div class="tablewrap"><table><thead><tr>' + thead +
            "</tr></thead><tbody>" + body + "</tbody></table></div>")


def convert(md_text, svgs, base, extra_ids=()):
    """Convert the markdown subset these docs use into HTML.

    An `<!-- aws-svg: <path> -->` line inlines that SVG. Placed directly after a mermaid
    fence it *replaces* the mermaid render, so the source markdown still shows a diagram
    in GitHub and VS Code preview (both ignore HTML comments) while the built page gets
    the better one. extra_ids are ids an #anchor may name outside md_text (the history table).
    """
    out, toc, title = [], [], None
    lines = md_text.split("\n")
    LINKS["base"], LINKS["ids"] = base, heading_ids(md_text) | set(extra_ids)
    i = 0
    fig_no = 0

    def override_at(idx):
        """The aws-svg marker after placeholder line idx: (line index, path, caption)."""
        j = override_line(lines, idx)
        return (j, *marker(lines[j])[1:]) if j is not None else (None, None, None)

    def aws_figure(path, caption):
        """A captioned figure is numbered "Figure N." in order; an uncaptioned one is not.

        The caption also names the SVG for screen readers (role="img", aria-labelledby).
        """
        nonlocal fig_no
        cap = ""
        svg = aws_svg_figure(confined((base / path).resolve(), path))
        if caption:
            fig_no += 1
            cid = f"figure-{fig_no}-caption"
            cap = f'<figcaption id="{cid}"><b>Figure {fig_no}.</b> {inline(caption)}</figcaption>'
            svg = re.sub(r"^<svg\b", f'<svg role="img" aria-labelledby="{cid}"', svg, count=1)
        return (f'<figure class="diagram awssvg"><div class="fig-canvas">{svg}</div>'
                f"{cap}</figure>")

    while i < len(lines):
        s = lines[i].strip()

        m = re.fullmatch(r"@@DIAGRAM(\d+)@@", s)
        if m:
            end, path, caption = override_at(i)
            if path:
                out.append(aws_figure(path, caption))
                i = end + 1
            else:
                svg = svgs[int(m.group(1)) - 1]
                out.append(svg if svg.startswith("<pre")
                           else f'<figure class="diagram"><div class="fig-canvas">{svg}</div></figure>')
                i += 1
            continue

        kind, path, caption = marker(s)
        if kind:
            out.append(aws_figure(path, caption))
            i += 1
            continue

        # any other HTML comment is an authoring note: drop it, however many lines it spans
        if s.startswith("<!--"):
            while i < len(lines) and "-->" not in lines[i]:
                i += 1
            i += 1
            continue

        hm = HEADING_RE.match(s)
        if hm:
            level, text = len(hm.group(1)), hm.group(2).strip()
            if level == 1 and title is None:
                title = text
            elif level <= 2:
                sid = slug(text); toc.append((2, sid, text))
                out.append(f'<h2 id="{sid}">{heading_html(text)}</h2>')
            else:
                if level == 3:
                    toc.append((3, slug(text), text))
                out.append(f'<h{level} id="{slug(text)}">{heading_html(text)}</h{level}>')
            i += 1
            continue
        if RULE_RE.match(s):
            out.append('<hr class="rule">'); i += 1; continue

        # fenced code block (non-mermaid; mermaid fences are already placeholders)
        if s.startswith("```"):
            lang = re.match(r"```\s*([\w+#.-]*)", s).group(1)
            cls = f' class="language-{lang}"' if lang else ""
            i += 1
            buf = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buf.append(lines[i]); i += 1
            i += 1
            out.append(f"<pre><code{cls}>" + html.escape("\n".join(buf), quote=False) + "</code></pre>")
            continue

        # blockquote (consecutive "> " lines, joined into one paragraph)
        if s.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                buf.append(re.sub(r"^>\s?", "", lines[i].strip())); i += 1
            text = " ".join(x for x in buf if x)
            out.append(f"<blockquote><p>{inline(text)}</p></blockquote>")
            continue

        if s.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(lines[i].strip()); i += 1
            out.append(table_html(rows))
            continue

        if BULLET_RE.match(s) or ORDERED_RE.match(s):
            block, i = parse_list(lines, i)
            out.append(block)
            continue

        if not s:
            i += 1
            continue
        # A paragraph always takes its first line, so a line no other branch claimed
        # (`#nospace`, say) is emitted as text and the loop always advances.
        para = [s]
        i += 1
        while i < len(lines) and not is_block_start(lines[i].strip()):
            para.append(lines[i].strip()); i += 1
        text = " ".join(para)
        if text.startswith("*") and text.endswith("*") and text.count("*") == 2:
            out.append(f'<p class="footnote">{inline(text.strip("*"))}</p>')
        elif text.startswith("**"):
            kind = CALLOUT_KINDS.get(CALLOUT_RE.match(text).group(1).lower()
                                     if CALLOUT_RE.match(text) else "")
            cls = f"note note-{kind}" if kind else "note"
            out.append(f'<p class="{cls}" role="note">{inline(text)}</p>')
        else:
            out.append(f"<p>{inline(text)}</p>")
    return title, toc, "\n".join(out)


def split_lead(md):
    """Lift the first paragraph after the H1 out for use as the standfirst.

    Keeps it from appearing twice - once in the header, once in the body. build-docx.py
    imports this, so both outputs pick the same paragraph.
    """
    lines = md.split("\n")
    for n, line in enumerate(lines):
        if line.startswith("# "):
            j = n + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            start = j
            while j < len(lines) and not is_block_start(lines[j].strip()):
                j += 1
            if j > start:
                lead = re.sub(r"\s+", " ", " ".join(lines[start:j])).strip()
                return "\n".join(lines[:start] + lines[j:]), lead
            break
    return md, ""


def eyebrow_for(title, kind=""):
    """The document-kind label: from front matter `kind` when it names one, else the title."""
    if kind in KIND_LABELS:
        return KIND_LABELS[kind]
    t = title.lower()
    if re.search(r"high[- ]level design|\bhld\b", t):
        return "High Level Design"
    if re.search(r"low[- ]level design|\blld\b", t):
        return "Low Level Design"
    if "walkthrough" in t or "overview" in t or "one page" in t:
        return "Overview"
    if "cost" in t or "bill" in t:
        return "Cost reference"
    if "demo" in t or "runbook" in t:
        return "Runbook"
    if "design" in t:
        return "Design"
    return "Reference"


def parse_args():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", help="the markdown design document")
    ap.add_argument("--strict", action="store_true",
                    help="fail (exit 1) on a lint error, a missing mermaid renderer or an "
                         "unresolved link")
    ap.add_argument("--confine", action="store_true",
                    help="refuse figures outside the document's folder (set by a remote MCP server)")
    return ap.parse_args()


def main():
    global CONFINE_DIR
    args = parse_args()
    src = pathlib.Path(args.src).resolve()
    if not src.is_file():
        sys.exit(f"error: {src} not found")
    if args.confine:
        CONFINE_DIR = src.parent
    dst = src.with_name(src.stem.lower() + ".html")

    if lint_doc(src) and args.strict:
        sys.exit("error: lint-doc.py found errors; fix them, or build without --strict")

    meta, raw = front_matter(src.read_text().replace("\r\n", "\n"))
    blocks = MERMAID_RE.findall(raw)
    counter = iter(range(1, len(blocks) + 1))
    raw = MERMAID_RE.sub(lambda _: f"\n@@DIAGRAM{next(counter)}@@\n", raw)

    lines = raw.split("\n")
    for n, line in enumerate(lines):
        pm = re.fullmatch(r"@@DIAGRAM(\d+)@@", line.strip())
        if pm and override_line(lines, n) is not None:
            blocks[int(pm.group(1)) - 1] = None
    print(f"{src.name}: {len(blocks)} mermaid block(s), "
          f"{sum(b is None for b in blocks)} replaced by an aws-svg figure")
    with tempfile.TemporaryDirectory() as tmp:
        svgs = render_mermaid(blocks, pathlib.Path(tmp), strict=args.strict)

    raw, standfirst = split_lead(raw)
    one_page = doc_kind(meta) in ONE_PAGE_KINDS
    history, hid = [], ""
    if not one_page:
        raw, history, hid = split_history(raw)
    title, toc, body = convert(raw, svgs, src.parent, extra_ids=[hid] if hid else [])
    title = title or meta.get("title") or src.stem
    page_title = meta.get("title") or title
    toc_html = toc_list(toc)
    subtitle = (f'  <p class="subtitle">{inline(meta["subtitle"])}</p>\n'
                if meta.get("subtitle") else "")
    lead = f'  <p class="standfirst">{inline(standfirst)}</p>' if standfirst else ""
    if one_page:
        line = meta_text(meta)
        head_html = subtitle + (f'  <p class="meta-line">{inline(line)}</p>\n' if line else "") + lead
    else:
        head_html = subtitle + lead + meta_row(meta)
    hid_attr = f' id="{hid}"' if hid else ""
    history_html = (f'<section class="doc-history"{hid_attr} aria-labelledby="doc-history-title">'
                    '<p class="doc-history-title" id="doc-history-title">Document history</p>'
                    f'{table_html(history)}</section>\n' if history else "")
    for problem in LINKS["problems"]:
        print(f"  WARNING: {problem}")
    if LINKS["problems"] and args.strict:
        sys.exit(f"error: {len(LINKS['problems'])} link(s) could not be resolved (--strict)")

    kind = eyebrow_for(title, doc_kind(meta))
    stamp = " &middot; ".join(html.escape(x) for x in (
        f"Version {meta['version']}" if meta.get("version") else "", meta.get("date", "")) if x)
    sidebar = bool(toc) and not one_page
    toc_nav = (f'<nav class="toc" id="toc" aria-labelledby="toc-title"><p class="toc-title" '
               f'id="toc-title">Contents</p><ol>{toc_html}</ol></nav>\n' if sidebar else "")
    icon = ('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="{}"/></svg>').format
    dst.write_text(f"""<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>{html.escape(page_title)}</title>
<script>{HEAD_JS}</script>
<style>{CSS}</style>
</head>
<body id="top">
<a class="skip" href="#content">Skip to content</a>
<header class="topbar">
  <a class="brand" href="#top"><span class="mark" aria-hidden="true"></span><span class="kind">{html.escape(kind)}</span><span class="t">{html.escape(page_title)}</span></a>
  <button class="ibtn toc-btn" id="toc-btn" type="button" aria-controls="toc" aria-expanded="false" aria-label="Contents">{icon("M4 6h16M4 12h16M4 18h10")}<span class="lbl">Contents</span></button>
  <button class="ibtn" id="print-btn" type="button" aria-label="Print">{icon("M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z")}</button>
  <button class="ibtn" id="theme-btn" type="button" aria-label="Dark theme" aria-pressed="false">{icon("M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z")}</button>
  <div class="progress" aria-hidden="true"></div>
</header>
<main id="content" tabindex="-1">
<header class="hero{' compact' if one_page else ''}"><div class="hero-in">
  <p class="eyebrow">{html.escape(kind)}</p>
  <h1>{inline(title)}</h1>
{head_html}
</div></header>
<div class="layout{'' if sidebar else ' solo'}">
{toc_nav}<article class="doc-body">
{history_html}{body}
</article>
</div>
</main>
<footer class="doc"><div class="foot-in">
  <span><b>{html.escape(page_title)}</b>{' &middot; ' + stamp if stamp else ''}</span>
  <span>Self-contained document &middot; diagrams embedded &middot; works offline</span>
</div></footer>
<button class="ibtn totop" type="button" aria-label="Back to top">{icon("M12 19V5M6 11l6-6 6 6")}</button>
<div class="toast" role="status" aria-live="polite"></div>
<script>{JS}</script>
</body>
</html>
""")
    ext = len(EXTERNAL_RE.findall(dst.read_text()))
    n_aws = body.count('<figure class="diagram awssvg">')
    n_mermaid = body.count('<figure class="diagram">')
    n_code = body.count('<code class="language-mermaid">')
    n_sec = sum(level == 2 for level, _, _ in toc)
    print(f"wrote {dst.name}  {dst.stat().st_size / 1024:.0f} KB  {n_sec} sections  "
          f"{n_aws} aws-svg  {body.count('<figcaption')} captioned  {n_mermaid} mermaid  "
          f"{n_code} mermaid as code  {len(LINKS['problems'])} unresolved links  "
          f"{ext} external refs")


if __name__ == "__main__":
    main()
