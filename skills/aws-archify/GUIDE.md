# aws-svg renderer guide

The renderer behind the `aws-archify` skill: `SKILL.md`, beside this file, routes every AWS-icon figure here.
Package: `aws-archify-aws-svg`.

## What it is

It turns an AWS design into a polished figure drawn with the **real official AWS Architecture Icons**, styled the way
AWS styles its own diagrams: service icons on coloured category tiles, inside VPC, subnet, Region and AWS Cloud
containers with the right border colours and corner badges, joined by labelled arrows.

You write the figure as a nested React component tree, a typed `.tsx` **scene**, and layout primitives place
everything for you. A `<Diagram>` holds `<Group>` containers and stacks (`<HStack>`, `<VStack>`, `<Grid>`) of
`<Node>`s (an icon with its caption), wired by `<Arrow>`s that attach to nodes by `id`. You describe structure; the
engine computes every coordinate on an 8 px grid and hugs each container to its contents.

`npm run render` composes the scene and writes, beside it:

| File | What it is |
|---|---|
| `<name>.svg` | The deliverable: one self-contained SVG that also carries an editable draw.io model |
| `<name>.png` | 4800 px wide (three times a 1600 px page), sharp when zoomed or printed; a deliverable, too large to open |
| `<name>.drawio` | The same figure for diagrams.net |
| `<name>.animated.svg` | Only when an arrow moves (`animate="flow"` on an arrow with an end or start head, or `animate="dots"`): the moving copy for READMEs and web pages |
| `$TMPDIR/<name>.look.png` | A look copy that fits inside 1568 x 1568 px: the one to open and look at |

It then runs the path and layout checks and exits 3 if either fails. `$TMPDIR` in these guides means the system temp
folder (`/tmp` when the variable is unset); every command prints the full path it wrote.

## Core design decisions (always apply)

These five principles shape every figure. The detailed procedures are in the guides listed at the end.

1. **Use the real icon components, never redraw them.** A hand-drawn orange square is not an EC2 icon. Every AWS icon
   is a generated, typed React component (`import { AWSLambda } from "../src/icons/service.js"`) that embeds the
   official SVG unchanged. A misspelt or unknown icon is a hard render error, never a blank box; the `icon` prop is
   optional only for the editor's placeholder state, and **every node and service group in a finished figure MUST
   carry a real icon** (no check enforces it: a placeholder renders as a gray dashed box, so the look has to catch
   it). Icons are the light variant only: dark artwork is white on white on this always-light canvas,
   so there is no `Dark` name (`Users`, not `UsersDark`). Look names up with `npm run find`
   ([icon-catalog.md](references/icon-catalog.md)).

2. **An architecture diagram is a high-level logical map, not a sequence diagram.** Its job is to let a reader see in
   one glance what the pieces are, how they are grouped and how they relate, not to trace the exact runtime order.
   Design for comprehension, not completeness:
   - **Show logical relationships, not every call.** One arrow means "these are connected, data flows this way". Merge
     a read and a write into one link; do not draw a reverse arrow for every response, or a connector to a
     cross-cutting service (logging, monitoring, secrets, KMS) from every node.
   - **Group first: the grouping carries most of the meaning.** A reader learns more from "these five services form
     the ingestion tier" than from ten arrows among them. Prefer flows between tiers and groups over flows between
     individual nodes.
   - **One dominant direction**, left to right or top to bottom. An arrow that doubles back across the whole canvas is
     the main source of crossings: drop it, or carry the relationship in a caption.
   - **Budget the arrows at or below the number of `<Node>`s** (count nodes, not groups). More arrows than nodes means
     sequence-diagram work: merge links and lift flows to the group level.
   - **Label the arrows; never number the steps.** Put a one-or-two-word action on each meaningful connector
     (`<Arrow>invoke</Arrow>`) and leave obvious internal hops bare. Never numbered badges or a step legend: the engine
     throws on `<StepBadge>` and `<Diagram steps>` ([arrows.md](references/arrows.md) says why).

   Test before rendering: could a newcomer understand this in ten seconds? Is there one obvious flow direction? Are
   there more arrows than nodes? Does any arrow carry a sentence or double back? If so, simplify.

3. **Name every node by its official AWS service, and every container by what it is.** A Node's `label` is the
   service's official name (`AWS Lambda`, not `Settlement Lambda`), with context in `sub`. A `service-{color}` group is
   one service and holds only that service's parts; a box mixing different services is `kind="generic"`, never wrapped
   in one member's colour. A structural container (`vpc`, `public-subnet`, `private-subnet`, `account`, `region`,
   `auto-scaling`, `datacenter`, `aws-cloud`) is labelled with its boundary's functional name (`Private Subnet`,
   optionally `Private Subnet (App Tier)`), not a free-form tier name: the figure shows the AWS structure. A tier or
   zone name belongs on a `generic` box. The strict rules are in [composition.md](references/composition.md).

4. **The SVG is the deliverable, and it is not done until you have looked at it.** Open the look copy the render
   prints (or export one with `node scripts/svg-to-png.ts <in.svg> <out.png> --look`) and Read it. A green report
   proves nothing about the picture: an arrow through a node, a label on a group border or a route through a group only
   show when you look. Never Read the 4800 px PNG. The checklist is in
   [review-and-fix.md](references/review-and-fix.md).

5. **Compact and even.** Connected nodes sit about one pitch apart (112 to 192 px centre to centre in the examples);
   an arrow longer than two pitches means move the node. Every arrowhead ends in clear space, same-kind boxes share one
   size, columns line up through fixed-width cells, sibling groups sit only as far apart as their labels need, and
   every bend leaves a 32 px stub before the head. `check-layout.ts` checks 8 to 12 measure this; treat their WARNs as
   must-fix. The patterns and numbers are in [composition.md](references/composition.md), the thresholds in `SKILL.md`
   and [geometry-checks.md](references/geometry-checks.md).

## Setup (once)

From this folder run `bash setup.sh`. It checks for Node.js 22.18 or later and runs `npm ci` here, skipping it when
the packages are already installed; it needs the network once.

- Scripts are plain `node x.ts` (Node's type stripping); scenes are bundled through esbuild.
- The 813 icon components are already compiled under `src/icons/`, with `catalog.json` and typed `.d.ts` files, so
  every name autocompletes. The AWS Architecture Icons package itself is not shipped; regenerating the icons
  (`npm run icons`) needs it downloaded and `AWS_ICONS_DIR` pointing at it ([icon-catalog.md](references/icon-catalog.md)).
- Optional: agent-browser (headless Chrome) for `--view` screenshots and the watcher's live preview:
  `npm i -g agent-browser && agent-browser install`, which downloads Chrome. `scripts/svg-to-png.ts` covers the look
  step without it.

## Where to work

Run every command from this folder, the skill folder (`$SKILLS/aws-archify`). Scenes import the engine by relative
path, so put the scene in `scenes/` (its imports are then `"../src/engine.tsx"` and `"../src/icons/<module>.js"`),
render it, copy the outputs back beside the source, and delete the copy. `scenes/` is scratch space that a plugin
update replaces: keep the `.tsx` in the user's project.

## The workflow

1. **Understand the architecture.** Find the nodes (services and resources), the containers they sit in (AWS Cloud,
   Region, VPC, subnets; an account boundary, an on-premises data center, an Auto Scaling group) and the connections
   (which node talks to which, in which direction). If the ask is vague ("diagram our setup"), ask for the services and
   how they connect before drawing. Given a reference image to reproduce, study it as a map first and follow
   [reproducing-a-reference.md](references/reproducing-a-reference.md).
2. **Resolve every icon to a real component.** Do not guess: there are 813 icons with strict official names (S3 is
   `AmazonSimpleStorageService`). Search, and the tool prints the import line:
   ```bash
   npm run find -- "lambda"                  # a service tile
   npm run find -- "users" --type resource   # a small resource glyph
   npm run find -- "vpc" --type group        # a group badge
   npm run find -- "s3"                      # abbreviations such as s3, sqs and elb work
   ```
   The four icon sets are explained in [icon-catalog.md](references/icon-catalog.md). An `icon` that is `undefined` at
   run time (a misspelt namespace access, a bad lookup) is a hard error naming the node; for an intentional placeholder,
   leave the prop out.
3. **Compose with layout: add one element, look, adjust, repeat.** Write a `.tsx` that default-exports a `<Diagram>`
   (the first scene below), start the watcher (`npm run watch -- scenes/<name>.tsx`) and add one element at a time,
   looking after each. Composition rules: [composition.md](references/composition.md); arrows:
   [arrows.md](references/arrows.md); every component and prop: [scene-api.md](references/scene-api.md).
4. **Review and fix.** Render, look, fix, repeat until every check on the list holds
   ([review-and-fix.md](references/review-and-fix.md)). When a look finds a defect, try candidate fixes in parallel with
   the edit CLI, as that page describes.
5. **Hand off in the visual editor.** Once a new figure passes review, open it in edit mode so the user can adjust
   placement, labels, arrows and colours without touching JSX:
   ```bash
   npm run edit -- scenes/<name>.tsx --open
   ```
   `--open` opens the browser and the terminal prints a short tutorial of the gestures. The editor changes the real
   `.tsx` and re-renders live. Tell the user the URL, that this is their diagram open for editing, and that **Save SVG**
   writes the final files ([edit-mode.md](references/edit-mode.md)). Tell them too that the figure is editable in
   draw.io: every SVG carries the model, so the `.svg` (or the `.drawio`) opens in [diagrams.net](https://app.diagrams.net)
   as a real diagram, and `node scripts/drawio-link.ts scenes/<name>.drawio` prints a link that opens it there
   directly.

## A first scene

The serverless REST API from `assets/examples/serverless-api.tsx`, written for `scenes/`:

```tsx
import { Diagram, Group, HStack, VStack, Node, Arrow, Spacer } from "../src/engine.tsx";
import { Users } from "../src/icons/resource.js";
import { AmazonAPIGateway, AWSLambda, AmazonDynamoDB } from "../src/icons/service.js";

export default (
  <Diagram title="Serverless REST API" layout="row" gap={48} align="center">
    {/* The Spacer lowers Users level with API Gateway, so HTTPS is one straight hop. */}
    <VStack gap={0}>
      <Spacer size={96} />
      <Node id="users" icon={Users} label="Users" />
    </VStack>
    <Group kind="aws-cloud" label="AWS Cloud">
      <Group kind="region" label="Region: us-east-1">
        <Group kind="vpc" label="VPC" gap={40}>
          <HStack gap={40}>
            <Node id="api" icon={AmazonAPIGateway} label="Amazon API Gateway" />
            <Node id="fn" icon={AWSLambda} label="AWS Lambda" />
            <Node id="ddb" icon={AmazonDynamoDB} label="Amazon DynamoDB" />
          </HStack>
        </Group>
      </Group>
    </Group>
    <Arrow from="users" to="api" labelAt="start">HTTPS</Arrow>
    <Arrow from="api" to="fn">invoke</Arrow>
    <Arrow from="fn" to="ddb">{"read /\nwrite"}</Arrow>
  </Diagram>
);
```

No coordinates anywhere: the nesting is the containment, the stacks do the placing, and the arrows find their own
faces. The other worked examples are described in [assets/examples/README.md](assets/examples/README.md).

## Commands

Run from this folder. Every npm script except `typecheck` is `node scripts/<file>.ts` underneath (the file is named in
each row); call the script directly when you need clean stdout, because npm prints a banner.

| Command | Does |
|---|---|
| `npm run render -- <scene.tsx> [out.svg] [--png-width N] [--no-png] [--no-check] [--canvas WxH] [--view] [--width N] [--keep-browser]` | Render the scene to `.svg`, `.drawio`, `.animated.svg` (when an arrow moves), the 4800 px `.png` and the look copy; print the report; run both checks. Exits 0, 3 (a check failed, files written), 2 (usage or unknown flag) or 1 (the scene threw, or a PNG export failed). Flags: [scene-api.md](references/scene-api.md). (`scripts/render.ts`) |
| `npm run watch -- <scene.tsx> [--svg out.svg] [--png preview.png] [--width N]` | Re-render on every save, with a live preview PNG through agent-browser (`scripts/watch.ts`) |
| `npm run examples [-- --view] [--dir <path>] [--width N]` | Re-render every example SVG: the engine regression gate (`scripts/render-examples.ts`) |
| `npm run find -- "<query>" [--type service\|resource\|group\|category] [--size N] [--limit N]` | Search the icon catalog; prints import lines (`scripts/find-icon.ts`) |
| `npm run edit -- <scene.tsx \| folder> [--port N] [--open]` | The visual editor on 127.0.0.1, port 5178 by default (`scripts/edit-server.ts`, page `scripts/edit-ui.html`) |
| `npm run edit-cli -- <scene.tsx> <command> [args] [--out path] [--in-place] [--render] [--view] [--json] [--quiet]` | Headless edit mode: `list`, `get`, `targets`, `icons`, `kinds`, `schema`, `set`, `set-props`, `shift`, `scale`, `set-icon`, `connect`, `add-node`, `delete`, `render`, `help` (`scripts/edit-cli.ts`) |
| `npm run overlay -- <reference.png> <render.png> <out.png> [--width N]` | Stack a reference over your render for comparison (`scripts/reference-overlay.ts`) |
| `npm run match -- <reference.png> <render.png> [--tol N] [--json]` | A supporting layout-match score (`scripts/reference-match.ts`) |
| `AWS_ICONS_DIR=<dir> npm run icons` | Regenerate `src/icons/` from the AWS icon package (`scripts/build-icons.ts`; also takes the folder as an argument) |
| `npm run typecheck` | `tsc --noEmit` over the engine, scripts, examples and scenes |
| `node scripts/svg-to-png.ts <in.svg> <out.png> [width \| --look]` | Rasterise an SVG: default 1100 px wide, `--look` fits inside 1568 x 1568. `SVG2PNG_DEBUG=<path>` also writes the SVG it rasterised. |
| `node scripts/check-paths.ts <svg>` | Does any connector cross an icon tile? Exits 1 on any intersection. |
| `node scripts/check-layout.ts [--advisory] <svg>` | The layout check (rows, holes, borders, arrows against arrows and text). Exits 1 on a FAIL or FIX item; `--advisory` reports FIX items without failing. |
| `node scripts/drawio-link.ts <file.drawio> [--open]` | Print a link that opens the `.drawio` in diagrams.net, loaded and editable. Nothing is uploaded: the diagram rides in the URL fragment. Refuses non-draw.io files and files over 2 MB. |
| `node scripts/crop-png.ts <in.png> <out.png> <top> <height>` | Cut a horizontal band out of a tall PNG (a page screenshot, an overlay) and scale it to 980 px wide |
| `agent-browser close --session aws-diagram-render` | Stop the warm screenshot session `--view` leaves open |

## What lives where

| Path | Holds |
|---|---|
| `SKILL.md` | When to draw an AWS-icon figure, and the rules every figure follows |
| `GUIDE.md` | This guide |
| `setup.sh` | One-time install of the packages below into `node_modules/` |
| `package.json`, `package-lock.json`, `tsconfig.json` | The renderer package: npm scripts, pinned dependencies, the typecheck settings |
| `references/` | The guides listed below |
| `src/engine.tsx` | The scene API that scenes import: components, `edges()`, `cell()`, types |
| `src/engine/` | The engine modules: `geometry.ts` (grid, snapping), `text.ts` (text metrics), `groups.ts` (group kinds and styles), `elements.ts` (components and their props), `layout.ts` (measure and place), `flatten.ts` (placed tree to drawable parts), `routing.ts` (arrow ends, elbow router), `connectors.ts` (arrows and labels), `report.ts` (layout report, canvas fit), `paint.ts` (the SVG), `compose.ts` (`composeScene`) |
| `src/icons/` | Generated: `service.js`, `resource.js`, `group.js`, `category.js` with their `.d.ts`, the `index.js` barrel, the shared `runtime.js` and `catalog.json` |
| `scripts/` | The command-line tools in the table above, plus `edit-ui.html`, the editor page |
| `scripts/lib/` | Shared helpers: `scene-bundle.ts` (bundling a scene with esbuild), `scene-guard.ts` (what a scene may import and use), `render-scene.ts` (render to strings, output paths, the report printout), `drawio-model.ts`, `browser-view.ts` (agent-browser screenshots), `svg-for-skia.ts` (SVG rewrites before rasterising), `raster.ts` (PNG helpers), `icon-catalog.ts` (catalog search and previews), `icon-package.ts` (reading the AWS icon package for `npm run icons`), `scene-source.ts` (the editor's source model), `edit-ops.ts` (edit operations and their trial render) |
| `assets/examples/` | The worked scenes with their SVGs, and their README |
| `scenes/` | Scratch space for renders (replaced by plugin updates) |

## Guide index

| When you are | Read |
|---|---|
| Looking for a worked precedent: the bundled scenes (architectures and two engine canaries) and the lesson each one encodes | [assets/examples/README.md](assets/examples/README.md) |
| Composing a scene: containers (structural, generic, service groups), node labels, stacks, compact placement, conventions | [references/composition.md](references/composition.md) |
| Wiring arrows: how many, to groups, around stacks, through anchors, hubs, labels | [references/arrows.md](references/arrows.md) |
| Finishing: the visual review checklist, then fixing overlaps, crossings, bad routes and label collisions | [references/review-and-fix.md](references/review-and-fix.md) |
| Editing an existing scene in the visual editor or with the headless CLI | [references/edit-mode.md](references/edit-mode.md) |
| Reproducing a given reference image | [references/reproducing-a-reference.md](references/reproducing-a-reference.md) |
| Looking up an icon's export name, the four icon sets, regenerating the icons | [references/icon-catalog.md](references/icon-catalog.md) |
| Needing the exact behaviour: every component and prop, layout, routing, the report, the output files, the commands | [references/scene-api.md](references/scene-api.md) |
| Changing the engine: the regression gate | [references/engine-regression.md](references/engine-regression.md) |
| Checking labels, readability and layout against the house figure rules | [references/diagram-quality.md](references/diagram-quality.md) |
| Running the manual geometry checks the scripts cannot do, and the meaning of each layout check | [references/geometry-checks.md](references/geometry-checks.md) |
