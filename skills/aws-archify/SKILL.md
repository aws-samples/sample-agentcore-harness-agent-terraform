---
name: aws-archify
description: Draw one AWS architecture, network or pipeline diagram with the official AWS Architecture Icons, then verify its geometry before it ships. Authors a typed React scene, renders it to SVG, PNG and an editable .drawio, runs the layout and arrow checks and looks at a PNG of the result. Use whenever asked to draw, diagram, visualize, sketch or redraw an AWS architecture, a cloud or network topology, a VPC or multi-account layout, or a pipeline whose steps are AWS services, including "make a diagram of this", "show me how these connect", "fix this diagram", or turning a Terraform/CloudFormation stack or a written design into a picture. Also use it when asked for a sequence diagram, a state machine or a process flow; those are written as Mermaid text, never drawn with this renderer or a hand-made script (see the routing table). For a whole document with figures inline, use aws-design-doc, which calls this.
license: MIT-0
metadata:
  version: "4.0"
  renderer: aws-svg (bundled)
---

# AWS architecture diagrams

> `$SKILLS` below is the directory that holds this plugin's skills: `skills/` in this repository, or the parent of this skill's base directory otherwise.

## First use

Before the first render on a machine, install the renderer's packages once (it checks and skips if they are already there):

```bash
bash $SKILLS/aws-archify/setup.sh
```

It needs Node.js 22.18 or later and the network once. If a render fails with a missing `esbuild`, `react` or `@napi-rs/canvas`, run it again.

One figure at a time, drawn with the official AWS Architecture Icons by the bundled `aws-svg` renderer,
then **checked by eye**, because the renderer's own validation does not catch what actually goes wrong.

| Renderer | Path | What it is |
| --- | --- | --- |
| `aws-svg` | `$SKILLS/aws-archify` (guide: `GUIDE.md`) | Typed React scene → `.svg` with the 813 official AWS icons |

Read `GUIDE.md` before writing a scene. Drive the renderer; do not edit inside it. Read
`references/diagram-quality.md` for the labelling, readability and layout rules every figure follows.

## Is it an AWS-icon figure?

| The figure shows | What to do |
| --- | --- |
| AWS services, accounts, VPCs, subnets, Regions, network topology, a hierarchy of anything AWS names | Draw it with `aws-svg` |
| A pipeline whose steps are AWS services (an event starting a Step Functions or SageMaker pipeline, a CI/CD chain of CodePipeline, CodeBuild and CloudFormation) | Draw it with `aws-svg` as a left-to-right chain of service icons, the step names on the arrows or as captions |
| A process, approval workflow, API call sequence or state machine whose steps are people, decisions or abstract states | Not an AWS-icon figure. Write it as **Mermaid text** in a `.mmd` file (and inside a fenced `mermaid` block when it goes in a document): `sequenceDiagram` for a call sequence, `stateDiagram-v2` for a state machine, `flowchart LR` for a process. No `autonumber` and no numbered steps; label each message with what happens. Do not write your own renderer or drawing script. GitHub, GitLab and most wikis render Mermaid; `aws-design-doc` renders it when mermaid-cli is installed and shows it as code otherwise. Offer an AWS-icon figure of the services involved alongside, if they are AWS services. |

**Stretch for icons.** If every box is a real service, the AWS renderer can carry a decision or a
lifecycle too: `Amazon VPC → AWS Organizations → Explicit deny` reads faster as icons, because the
reader already knows them. An outcome with no icon ("refused", "left unconnected") is still
expressible: use the closest real resource icon (`AWSIdentityAccessManagementPermissions` for an
explicit deny), or put the outcome on the arrow label and end the chain.

## Before you draw: confirm what the figure will show

When the figure comes from code (Terraform, CloudFormation, CDK) or a long written design, read it first,
then state in a few lines what you are about to draw and let the user correct it before you render:

- **Services**, by official name, and the role each plays (one or two words).
- **Boundaries**: accounts, Regions, VPCs, subnets, on-premises.
- **Flows**: which service talks to which, in which direction.
- **Left out on purpose**: cross-cutting services, other environments, anything you could not place.

Draw what the code creates, not what the brief implies. If the user said to go ahead without questions,
or you are running unattended, state the list in your hand-off instead and draw.

## Big figures: split first, then build up

Count before you draw. Over about 15 nodes, or more than three levels of nested boxes (cloud,
account, VPC, subnet), one figure stops being readable at page width and takes many render-and-fix
loops (a 20-node hybrid figure took 37 minutes). Then:

1. **Offer an overview plus detail figures**: the overview at group level (accounts, VPCs, external
   systems, one node or none per box), and one figure per flow or account that needs its parts shown.
2. **If one figure is required, build it up.** Render the skeleton first: every group, with one node
   each and no arrows. Fix the box sizes and positions, then add the nodes, then the arrows, rendering
   after each batch. Re-laying out a full scene for every fix is where the loops go.
3. **Budget the width before drawing** (1280 px): four columns of boxes do not fit; stack them.
4. **One big picture only when asked.** When the user explicitly asks for a single figure of everything (a
   poster, a wall chart, "all of it on one page"), recommend the overview plus detail figures once, then do
   what was asked: mark the scene `<Diagram poster>`. That allows up to 3000 px; every other check still
   runs. Deliver it as `.svg` and `.drawio` on its own: the document builders refuse to embed a poster.

## Starting points

| The figure is | Start from (`assets/examples/`) |
| --- | --- |
| Serverless web app or REST API | `serverless-api.tsx`, `serverless-web-app.tsx` |
| Event-driven or streaming | `event-driven-orders.tsx`, `iot-streaming-analytics.tsx`, `media-streaming-platform.tsx` |
| Web app on EC2, Multi-AZ | `three-tier-web-app.tsx` |
| Containers on Amazon EKS or Amazon ECS | `eks-ecommerce.tsx` |
| HPC or batch computing | `hpc-batch-processing.tsx` |
| CI/CD pipeline | `cicd-container-pipeline.tsx` |
| Data lake or analytics | `data-lakehouse-analytics.tsx` |
| Generative AI, RAG, agents | `bedrock-agentcore-agent.tsx`, `bedrock-rag-assistant.tsx`, `sagemaker-llm-gateway.tsx`, `ai-native-trading.tsx` |
| ML training or MLOps | `ml-training-pipeline.tsx` |
| Multi-Region or disaster recovery | `multi-region-dr.tsx`, `backup-and-restore.tsx` |
| Hybrid network, on-premises | `hybrid-network.tsx` |
| Network hub, inspection, egress | `hub-and-spoke-network.tsx` |
| Multi-account, OU tree, landing zone | `org-ou-tree.tsx`, `landing-zone.tsx` |
| Security and threat detection | `security-threat-detection.tsx` |
| Logging, monitoring, operations | `central-logging.tsx` |
| Multi-tenant or SaaS | `multitenant-ml.tsx` |
| Migration to AWS | `migration-to-aws.tsx` |
| End-user computing, virtual desktops | `virtual-desktops.tsx` |

Copy the structure, not the coordinates, and check the layout rules below: several examples predate them.

## Conventions that keep a figure readable

- **Title and subtitle.** Give every figure a `title` and a one-sentence `subtitle` that says what it
  shows: `<Diagram title="Order service" subtitle="Static site and API behind CloudFront, in one Region">`.
- **Cross-cutting services get a box, not arrows.** Amazon CloudWatch, AWS CloudTrail, AWS X-Ray, AWS
  IAM, AWS KMS: if the user wants them shown, put them in one `<Group kind="generic" label="Shared
  services">` in a free corner of the AWS Cloud box, with no arrows to them. An arrow from every node to
  CloudWatch says nothing and crosses everything. Leave them out unless asked. One exception: when the
  brief names the relation and three or fewer nodes feed it ("CloudWatch collects logs from both
  functions"), place the service beside those nodes and draw thin `dashed` arrows labelled "logs", so
  they read as secondary to the solid data flow. With more sources, keep the box and say it in the
  caption ("logs and metrics from all functions").
- **Non-AWS technology uses a General icon and an exact label.** The icon is generic, so the label
  carries the meaning (`label="PostgreSQL" sub="on premises"`):

| Technology | Icon |
| --- | --- |
| Any self-managed database (PostgreSQL, MySQL, MongoDB, Redis) | `Database` |
| Servers, VMs, on-premises hosts | `Server`, `Servers` |
| Corporate site or office | `OfficeBuilding`; the boundary is `<Group kind="datacenter">` |
| GitHub, GitLab, Bitbucket | `GitRepository` |
| SaaS or third-party API (Stripe, Twilio, an LLM provider) | `Internet` |
| Browser or desktop app | `Client`; a phone app is `MobileClient` |
| An SDK or client library | `SDK` |
| Email, chat | `Email`, `Chat` |
| Identity provider (SAML, OIDC) | `SAMLToken` |

## Draw it

### AWS icons

```bash
cd $SKILLS/aws-archify
npm run find <service>                       # verify the icon name EXISTS first
cp <project>/diagrams/my-topology.tsx scenes/
npm run render -- scenes/my-topology.tsx     # writes scenes/my-topology.svg, .png and .drawio
                                             # (+ .animated.svg when an arrow moves: animate="flow" on a headed arrow)
                                             # and the look copy $TMPDIR/my-topology.look.png
```

Deliverables are always high resolution: link or embed the `.svg` wherever the target renders SVG (READMEs, HTML), and ship the 4800 px PNG and the editable `.drawio` the render writes. Never hand over a PNG narrower than 4800 px; if you export one yourself, use `node scripts/svg-to-png.ts <in.svg> <out.png> 4800`. For your own look step, Read the `$TMPDIR/<name>.look.png` that every render writes and prints, or export one with `--look` (`node scripts/svg-to-png.ts <in.svg> "${TMPDIR:-/tmp}/<name>.look.png" --look`), which fits the PNG inside 1568 x 1568 px whatever the figure's shape, and Read only that file. Never Read the 4800 px deliverable PNG or a PNG exported at a fixed width: a tall or wide figure then goes over 2000 px on one side, the model API rejects it, and because the image stays in the conversation every later turn fails too. Deliverables have no such limit.

```bash
node scripts/check-paths.ts scenes/my-topology.svg   # exits 1 on an arrow crossing an icon
```

Scenes import `../src/engine.tsx`, so **render from this skill's folder** (`$SKILLS/aws-archify`),
with the scene copied into its `scenes/`. `scenes/` inside the plugin is temporary working
space: a plugin update replaces it. Keep the `.tsx` source in the user's project, copy the `.svg`, `.png` and `.drawio`
back beside it, and delete the copy from `scenes/` afterwards.

## Then check the layout, then look at it

`npm run render` now runs both scripts below on every render and prints `PATH CHECK` and `LAYOUT CHECK`
with PASS or FAIL; it exits 3 (files still written) when either fails. A figure that exits 3 is not
done. `--no-check` skips them, for a quick look while composing only.

Two automated checks, plus the renderer's own `CHECKPOINT` line, each see something the others cannot.
Run both scripts on every figure:

```bash
node $SKILLS/aws-archify/scripts/check-paths.ts  scenes/fig.svg   # arrow vs icon
node $SKILLS/aws-archify/scripts/check-layout.ts scenes/fig.svg   # rows, holes, borders
```

| Check | Sees | Blind to |
| --- | --- | --- |
| renderer `CHECKPOINT` | label vs label, icon vs icon (with 8 px of padding), anything clipped at the canvas edge, an icon in line with no other icon of its group | arrows entirely |
| `check-paths.ts` | connector vs icon tile | all text |
| `check-layout.ts` | node/node overlap, node straddling a group border, label on a border, arrowhead on text, numbered arrow labels, two arrows drawn on one line (FAIL); sparse figure, group over 65% empty, zig-zag arrow, canvas too wide for a page, arrow through text, a label in a group title band or an arrow within 12 px of a title, an avoidable bend (a one-to-one arrow that turns once), an arrow skimming within 10 px of an unrelated icon (FIX, also fails the run); misaligned rows, uneven pitch, node beside a group, aspect ratio, long arrow, arrowhead flush under a caption, uneven sibling boxes, oversized gap between groups, uneven padding, short elbow stub, jog (WARN) | whether the picture is *correct* |

`check-layout.ts` now compares arrow with arrow and an arrow's run with caption text. An arrow label
over an icon is still a manual check (`references/geometry-checks.md`).

`check-layout.ts` exits 1 on a FAIL or a FIX, and 0 with advisories. **A figure is not done while it exits 1.**
The FIX rules, in plain words: the figure stays under 1280 px wide so icons and captions stay readable in
a document; connected nodes sit about one node pitch apart, with no padding `Spacer`s to push them
around; an arrow bends only for a fan-out or fan-in or to get around something, so a one-to-one link
runs straight, with no L and no Z (put the two nodes on one row or column; move an actor such as Users
down or up to the row of what it calls); no arrow crosses words or another arrow; labels
say what happens, never a step number. The engine already draws two facing sides within 8 px as one
straight line (nodes at different group depths land 4 px apart, and `<Move>` only takes multiples of
8), so any zig-zag it still reports is a real misalignment: move the node. **Every bundled example passes both checks** (0 hard defects, 0 must-fix). They still carry 25
advisories between them, listed in `assets/examples/README.md`. Only five are deliberate: long arrows
that a cross-Region or cross-band hop really needs (`ai-native-trading`), one uneven column pitch
where a tier genuinely has fewer services than its neighbours (`sagemaker-llm-gateway`), the
hand-routed arrow of the `canary-primitives` canary, and the wide padding of subnets kept one width
so their columns line up (`three-tier-web-app`, `eks-ecommerce`). The rest predate the WARN rules: copy those
scenes' DSL, not those parts of their layout.
**On a figure you draw, treat every WARN as must-fix.** Keep one only when you can say why, and say it
to the user when you hand the figure over.

### Compact and even: the layout rules

Measured on three figures that passed every check and still looked wrong: arrows running 300-700 px of
empty line, arrowheads ending against a caption, and sibling VPCs and accounts of different sizes.

- **Keep connected nodes about one pitch apart.** The bundled examples sit 112-192 px centre to centre.
  An arrow whose empty run is longer than two pitches means move the node, not stretch the arrow.
- **End every arrowhead in clear space.** The engine ends an arrow into a node's **bottom** face flush
  against its caption: enter the top or a side face, or end the arrow at an `<Anchor>` 8 px below the
  caption. A vertical drop into a group's first node crosses the group's caption text: route it down
  the lane between two groups and into the node's side.
- **Give same-kind boxes one size.** Two VPCs, two workload accounts, Regions side by side: one size
  constant in the scene, not whatever their contents make them. Boxes in one row share a height, in one
  column a width.
- **Spread space evenly, and no more than the labels need.** No group more than about two-thirds
  empty, no gap between rows or columns over 160 px or 2.5x the smallest. Sibling groups sit only as
  far apart as the arrow labels between them need (48-64 px for one label line); every group hugs its
  content with one padding. A big hole means the structure is wrong: move a node or re-row.
- **Give every bend a clear stub.** The straight run into an arrowhead, and the first run out of a
  node, are at least 32 px; a bend 8-15 px above an icon puts the arrowhead under the corner. Two
  ends a few px out of line (a jog) get lined up, not bent.

The pattern that makes this easy (the engine has no width prop on `<Node>` and hugs every group to its
contents, so fix sizes with invisible `<Rect>`s):

```tsx
import { Diagram, Group, Node, Arrow, ZStack, Rect, Anchor, type Figure } from "../src/engine.tsx";

const COL = 216, GAP = 24;                  // one column; pitch = COL + GAP
const cell = (node: Figure, w = COL) => (
  <ZStack><Rect w={w} h={8} stroke="none" fill="none" />{node}</ZStack>   // fixed-width cell
);
const VPC_W = 192, VPC_H = 96;              // every VPC box the same size
const vpc = (label: string, node: Figure) => (
  <Group kind="vpc" label={label}>
    <ZStack><Rect w={VPC_W} h={VPC_H} stroke="none" fill="none" />{node}</ZStack>
  </Group>
);
// An arrow entering from below ends under the caption, not on it (layout coordinates, multiples of 8):
<Anchor id="busIn" x={1128} y={584} />
<Arrow from="rulesB" to="busIn" fromSide="top">Forward events</Arrow>
```

Put every node in a `cell`, and nodes line up in columns across groups; a `<Rect>` in a row or a
`VStack` pads a box to its sibling's size. A bare node next to a group box sits higher than the
group's node. In a top-aligned row (the default for an `HStack` or a row group) the gap is 48 px, the
group's 32 px label band plus its 16 px padding: drop the node with a `<Rect w={8} h={48}>` above it in
a `<VStack gap={0}>`. In the Diagram's own centred row the gap depends on caption heights (4 px for one row of
one-line nodes); a 32 px `<Rect>` in a `<VStack gap={0}>` lines it up when the group holds one row of the same
nodes (with the stack's default gap the node lands 12 px low). Measure the icon `y` in the SVG
after rendering. Anchor coordinates do not follow the layout: re-measure them from the SVG after any change.

### Rows, holes and alignment

The defect class that passes every geometric check and still looks broken. All three below were
measured on a real diagram that `check-paths.ts` passed with zero intersections:

- **Keep one column pitch per row.** Gaps of `416, 184, 184` put a hole in the middle of a row of four
  and read as a missing node. If one node must sit apart — because an arrow has to reach it — move the
  whole row, do not stretch one gap.
- **A node must not sit beside a group at *partial* height.** Sharing 37px of an 88px node with a
  group it is outside makes the two read as peers on one row when they are not. Either align it fully
  with the group's band, or move it clear of the band entirely. Partial is the only bad case.
- **Rows are defined by the eye, not by the container.** Two multi-node rows whose vertical spans
  overlap read as one broken row even with zero pixel collision. Give every row its own band.

**"The diagram has overlapping rows" almost never means overlapping pixels.** Measure before
restructuring: it is usually one of the three above.

### Then look at it

None of the checks look at the finished picture. Look at every figure, every time:

```bash
# npm run render prints "Wrote $TMPDIR/my-topology.look.png (fits 1568 px)": Read that file.
# scenes/my-topology.png is the 4800 px deliverable: never Read it.
```

Optional, and only with a local Chrome: `npm run render -- scenes/x.tsx --view` screenshots the SVG
through agent-browser. The `scripts/svg-to-png.ts` step above does not need a browser.

Two defect classes get through **all** automated checks and are only ever caught this way: an arrow
crossing a caption, and a label or legend using the wrong vocabulary.

**Arrow labels carry a white halo** (`paint-order="stroke"`), so one crossing a line does not look
like a collision — it punches a white gap in whatever is behind it. That is why a label on a group
border is an advisory rather than a failure, and why it still wants fixing: the gap reads as a break
in the box.

## Hand the figure over

Give the user, every time:

- the `.svg`, the 4800 px `.png` and the `.drawio` paths, plus the `.animated.svg` when the user asked for motion;
- a link that opens the figure in diagrams.net, from `node scripts/drawio-link.ts <name>.drawio`
  (run in the skill folder; nothing is uploaded, the diagram rides in the link);
- the check results, and any advisory you kept with the reason;
- the icon stand-ins you used;
- **suggested alt text**: one plain sentence under 100 characters that says what the figure shows, not
  "a diagram of", for READMEs, wikis and documents.

## Traps — every one hit in practice

### Scenes are code, and the renderer guards them

A scene runs when it renders, so the renderer only lets it import the engine (`src/engine.tsx`), the
icons (`src/icons/*`), React, and other scene files beside it, and refuses `process`, `require`,
dynamic `import()`, `eval`, `Function`, `constructor` and `prototype` tricks, computed member names, and
network calls. A scene never needs any of them. A `scene guard:` error names the line: remove that
code. It is a guard, not a sandbox: render only scenes you or your agent wrote.

### Arrows and labels

- **Diagrams never use numbered steps**, not even when asked: no ①②③ badges, no numbered legend.
  Numbers make the reader jump between the picture and a legend, go stale when the flow changes, and
  hide what each arrow means; a short label on the arrow says what happens right where it happens. Put a
  one-or-two-word action on each meaningful arrow and leave obvious hops bare. The renderer throws on
  `<StepBadge>` and `<Diagram steps>`. If a user asks for numbered steps, say so and label the arrows.
- **An arrow's label is its CHILD, not a prop.** `<Arrow from="a" to="b" label="x" />` renders the arrow
  and **silently drops the label** — `label` is not in `ArrowProps`. Write
  `<Arrow from="a" to="b">x</Arrow>`. The render does not warn (only `npm run typecheck`, which covers
  `scenes/`, flags it); the symptom is a bare connector.
- **A label defaults to the path midpoint, which is frequently a group border.** An arrow leaving a
  node's bottom and entering the node below elbows just outside the enclosing group, dropping the label
  exactly on the border line. `labelAt="start" | "middle" | "end"` moves it; `"end"` lands in open space
  near the target. If neither end is clear, pad the target group (`padLeft`/`padRight`) so an `end`
  label lands inside it.
- **Straighten a hop that enters a container from outside.** When an actor beside the AWS Cloud feeds a
  node inside it, the default elbow puts its riser on the container border with the label on top. Lift
  or lower the actor with a `<Spacer>` in a `VStack` until the two icons share a row, then use
  `labelAt="start"`. Set an absolute `riser={x}` (layout coordinates, a multiple of 8) to put a
  fan-out's riser in the middle of the lane between two groups.
- **When re-anchoring fails, the channel is too narrow.** If `start`/`middle`/`end` all collide, the gap
  between the two groups is narrower than the text — **widen the gap** (e.g. `gap={96}`) or shorten the
  label to one word. Three anchor changes once failed where one gap change fixed it.
- **Draw a denied relationship as `dashed color="#C7243A"` with "denied" in the label** (never a `✕`:
  the embedded font has no glyph for it and it renders as a box). Route it through
  the empty channel *between* sibling groups — leave the source's `right`, enter the target's `left` —
  and never pick a face that already carries an arrow, or the two merge into one ambiguous line.
- **Budget arrows at or below the node count.** More arrows than nodes means the figure is trying to
  show a call sequence; merge links, lift them to the group level, or split the figure.
- Several edges converging on one node produce stacked parallel segments and colliding labels. Re-row
  instead, or fold the node's meaning into the arrow labels and delete it.

### Geometry and naming

- **`✓ no overlaps` covers labels, nodes, clipping and alignment, never arrows.** It does not see an arrow crossing an icon. Run
  `check-paths.ts` after every render — on two diagrams the renderer had passed, it found 4 and 8.
- **`check-paths.ts` does not see** an arrow crossing a caption, or a label on a group border.
- **Aspect ratio is a readability limit.** Aim for 4:3 to 16:9 (about 1.33 to 1.78; the CHECKPOINT's
  `a4_landscape` flag passes 1.25 to 1.75). Past roughly 2.5:1 a figure stops being readable at document
  width and `check-layout.ts` warns: restructure into two rows or fold a node inside a group.
- **Siblings belong in a row.** A column of three peers reads as a hierarchy.
- **Match the icon to what the thing IS.** Applications modelled as organisational units take the OU
  icon, not the Account icon.
- **`layout` takes `row` / `col` / `grid` / `zstack` / `free`** (`free` places only children that carry
  `x`/`y`). `"column"` is invalid.
- **Put an external actor to the RIGHT** with `layout="row"`. In a column it lands below-left and its
  arrow doubles back across the canvas.
- Gaps must be **multiples of 8**; the engine refuses anything else.
- `Spacer` is **square** — `size={232}` also adds 232px of height. Put the node in the same `VStack` as
  its parent instead.
- `Node` has **no width prop** — width comes from the label, so long official names cannot be aligned
  into columns. Force arrow faces with `fromSide`/`toSide` rather than fighting geometry.
- **Verify every icon name** with `npm run find`. `AWSRegion` does not exist (it is `Region` in
  `group.js`).
- **A service with no icon** (AWS CodeConnections, Amazon VPC IP Address Manager, Transit Gateway route
  tables, AWS Network Manager, SageMaker endpoints and Processing, condition and fail steps): use the
  nearest parent-service icon (AWS Cloud WAN for Network Manager, the Amazon SageMaker AI service icon
  for its endpoints and jobs) or a General icon, with a caption naming the real service. State every
  stand-in when you hand the figure over.
- `kind="account"` labels must start with the boundary name, but **`Account (…)` takes a free suffix** —
  that is how an ownership model gets into the picture and still passes validation.
- Icons are compiled into `src/icons/*.js`; this plugin has no raw `Icons/` directory. Look names up
  with `npm run find` or in `src/icons/catalog.json` (813 entries).
- **Non-AWS products** (GitHub, HCP Terraform, and so on) have no icon here, and this plugin ships no
  third-party logos. Use a General icon (for example a generic source-code or server icon) with the
  product name as the caption.

### Editing an existing scene

- **Never blanket find/replace across a scene.** It breaks identifiers and silently drops connectors:
  replacing a group id inside `from="…"` removed an arrow whose target no longer existed, and the render
  still succeeded. Replace one occurrence at a time and re-check the arrow count in the build line.
- **`sed` on a scene leaves duplicated comment lines.** Use a precise edit, then re-read the region.

## How the output gets consumed

A finished figure is referenced from markdown by HTML comment, so GitHub and VS Code preview ignore it:

```markdown
<!-- aws-svg: diagrams/my-topology.svg -->
```

Paths resolve **relative to the markdown file**, so a document and its diagrams directory move
together safely. Put a marker directly after a ` ```mermaid ` fence and it **replaces** that render —
the source still previews a diagram while the built page gets the better one.

`aws-design-doc` owns the build. Keep sources beside their output: the `.tsx` scene next to the `.svg`
it produced, in the document's own `diagrams/` directory.

## Reference figures

Working examples ship with the renderer: `$SKILLS/aws-archify/assets/examples/` (scene sources and rendered SVGs, see its `README.md`). Read a `.tsx` before authoring a new one; the DSL is easier to copy than to infer. They are also the calibration set for `check-layout.ts`: if a change to that script makes one of them FAIL a hard check (run it with `--advisory`), the script is wrong, not the diagram. None of them raises a FIX item; the WARNs a few still carry are listed in that README, which also says which are deliberate.

```bash
for f in $SKILLS/aws-archify/assets/examples/*.svg; do
  printf "%-38s " "$(basename $f)"; node $SKILLS/aws-archify/scripts/check-layout.ts "$f" | tail -1
done
```
