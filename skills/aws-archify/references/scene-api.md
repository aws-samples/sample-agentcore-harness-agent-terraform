# Scene API reference

What a scene can say and what the engine does with it. The scene-facing exports live in `src/engine.tsx`; the
engine itself is split across `src/engine/` (layout, routing, painting and so on). For how to compose a good
figure read [composition.md](composition.md); for how to wire arrows read [arrows.md](arrows.md).

## The scene file

A scene is a `.tsx` module whose default export is one `<Diagram>` element. The worked example in
[GUIDE.md](../GUIDE.md) shows the whole shape.

| Scene lives in | Engine import | Icon import |
|---|---|---|
| `scenes/` | `"../src/engine.tsx"` | `"../src/icons/<module>.js"` |
| `assets/examples/` | `"../../src/engine.tsx"` | `"../../src/icons/<module>.js"` |

Icon modules are `service.js`, `resource.js`, `group.js` and `category.js`; `index.js` re-exports all four.
A helper function that returns part of a figure is typed `Figure` (React 19's types have no global `JSX`
namespace).

Rendering bundles the scene together with the engine through esbuild (`scripts/lib/scene-bundle.ts`), because the
engine recognises its components by identity and the scene must share its module graph. Render from the renderer
folder so the relative imports resolve.

### The scene guard

Rendering runs the scene's code, so `scripts/lib/scene-guard.ts` checks every scene file (and every scene file it
imports) before the bundle is built. It reads the parsed source, so label text and comments never trip it. A
refusal starts with `scene guard:` and names the file and the line. It is a static check, not a sandbox.

| Refused | Allowed instead |
|---|---|
| Importing anything except the engine and other files under `src/`, `react`, `react/jsx-runtime`, and `.tsx`/`.ts`/`.jsx`/`.js` files in the scene's own folder or below it | Those imports only |
| The names `process`, `globalThis`, `global`, `window`, `self`, `require`, `module`, `exports`, `eval`, `Function`, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `Deno`, `Bun`, `Reflect`, `Proxy`, `WebAssembly` used as values (so no local variable may be called `self` either) | The same words as an object key, a property name after a dot, a JSX attribute or an import name |
| Reading `.constructor`, `.prototype`, `.__proto__`, `.__defineGetter__`, `.__lookupGetter__` | |
| A computed member name: `list[i]`, `byId[key]` | A number or string literal index (`list[0]`); look items up with `.find()` and build lists with `.map()` |
| `import()`, `import.meta`, `with` | |

## The 8 px grid

The canvas is a lattice of 8 px cells. Every coordinate or size you pass must be a multiple of 8: `x`, `y`, `gap`,
`pad` and the four `pad*` sides, a Node's, Icon's or Spacer's `size`, a Rect's `w` and `h`, a Move's `dx` and `dy`,
every point in an Arrow's `points` and `via`, and an absolute `riser`. An off-grid value throws at compose time; the
message names the prop and the nearest multiple of 8. Nothing is rounded silently.

`cell(n)` is `n * 8` (`GRID` is 8): `cell(6)` is the 48 px icon, `cell(2)` the 16 px group padding, `cell(3)` the
24 px default gap.

Two things are allowed off the grid on purpose. Caption text sits where its baseline reads best. A Node's or Icon's
box may land on a 4 px half step, because centring siblings of different widths on one shared centre line needs
it. A Group draws a border, so its box is snapped onto the grid when it is placed; a group that still ends up off
the grid is an engine bug and throws `Layout produced an off-8px-grid position for <Group ...>`.

## How layout works

The engine measures bottom up and places top down. Every container hugs its flow children (the ones without
`x`/`y`) and rounds its size up to whole cells. You never give a Group a width or a height.

| Element | Places its flow children | Notes |
|---|---|---|
| `<HStack>` | left to right | |
| `<VStack>` | top to bottom | |
| `<Grid cols>` | row by row into `cols` equal cells | Cell width is the widest child, row pitch the tallest; boxes are centred in their cell and icons line up at the cell top |
| `<ZStack>` | all on one centre | Earlier children paint behind later ones |
| `<Free>` | none: only children with `x`/`y` | Hugs their bounding box |
| `<Group>` | by its `layout`, default `row` | The AWS container box, see Groups below |
| `<Diagram>` | by its `layout`, default `row` | The top level |

`layout` (on Group and Diagram) takes five values, one per stack: `row`, `col`, `grid`, `zstack`, `free`. There is
no `"column"`: any other value throws, naming the container and the five. Two of them have preconditions that throw with a message naming the container and the child:

- `grid` (and `<Grid>`) needs `cols` as soon as it has two or more flow children. Without it the children would
  silently become one column.
- `free` (and `<Free>`) places only children that carry `x` and/or `y`. A child without them would be drawn at the
  layout origin on top of its siblings, so it throws. A `<Move>` does not rescue it.

Props shared by the stacks, Group and Diagram:

| Prop | Default | Meaning |
|---|---|---|
| `gap` | 24 | Space between flow children |
| `align` | see below | Cross-axis placement: `start`, `center`, `end` |
| `pad` | 0 on stacks | Inner padding on every side (Groups: see Groups) |
| `x`, `y` | | Place this element absolutely inside its parent's content box |

**Cross-axis default.** A row inside the figure (an `<HStack>`, or a Group laid out as a row) aligns at the top
(`start`): icons share one top line and a longer caption hangs further down, so same-row arrows run straight.
Columns, grids and zstacks centre. The `<Diagram>`'s own row is the frame, not a component, so it centres (a lone
actor beside a tall cloud reads better centred). An explicit `align` wins everywhere.

**Icon band.** In rows and grids the cross-axis alignment uses a Node's or Icon's icon height, not its full box, so
captions of different lengths never push a neighbour's icon out of line.

**Absolute children.** `x`/`y` are relative to the parent's content box (inside its padding and label band). In a
`free` layout they also set the container's size. In any other layout they are ignored when the container measures
itself, so an absolute child can stick out of its box.

**Text width** is an estimate: 0.6 x font size per character of the widest line. A Node's box is as wide as the wider
of its icon and its caption, rounded up to a cell, and as tall as the icon plus 8 px plus 14 px per caption line.
`<Node>` has no width prop: a long official name makes a wide box. To make boxes line up in columns, put each node
in a fixed-width cell (see [composition.md](composition.md)).

## Elements

### Diagram

`<Diagram title? subtitle? layout? gap? align? cols? animate? poster?>`

| Prop | Meaning |
|---|---|
| `title` | Bold 18 px text at the top left. A long title widens the fitted canvas. |
| `subtitle` | One plain sentence under the title (13 px, gray) saying what the figure shows. Needs a `title`, or the render throws. |
| `layout`, `gap`, `align`, `cols` | As above. Default `row`, centred. |
| `animate` | Animate every arrow: `"flow"`, `"dots"` or `true`. See Animation. |
| `poster` | Only when the user asks for one big picture. Marks the SVG `data-poster="true"`: `check-layout.ts` then allows a canvas up to 3000 px wide instead of 1280 px (every other check still runs) and aws-design-doc refuses to embed it in a document. |
| `steps` | Not supported. A non-empty list throws the numbered-steps error (see [arrows.md](arrows.md)). |

The canvas is fitted to the content: a 24 px margin on every side, plus 34 px at the top for a title and 22 px more
for a subtitle, all rounded up to whole cells. A scene never carries a canvas size; `--canvas` on the command line is
the only fixed-size path.

A diagram with nothing in it (no Node, Icon, Group, Label, Rect, Raw or Arrow; a title alone does not count) is an
error in render, watch and examples: `<Diagram> has nothing to draw`. The usual cause is a function of your own used
as a tag, `<Part />`, which the engine never calls: call it, `{Part()}`. The `allowEmpty` render option draws such a
scene as a blank 960 x 600 canvas instead, for edit mode's live view, where deleting the last element must still
leave something to undo from. A scene holding only `<Raw>` blocks, which cannot be measured, also gets 960 x 600.

### Group

`<Group kind label? layout? cols? gap? align? pad? padTop? padRight? padBottom? padLeft? id? icon? x? y?>`

- The box is its content plus 16 px padding on each side plus a 32 px band at the top for the badge and the bold
  13 px label. It also grows to fit its own label (badge, text and 8 px of slack), so a long label widens the box and
  the content is centred in the extra width.
- `pad` replaces the 16 px on all sides; `padTop`, `padRight`, `padBottom`, `padLeft` replace it on one side each.
  `padTop` is the room between the label band and the content (`pad` unless set), not extra room added to it. They are how you make room for a label inside a box, and how the
  editor's Scale control resizes a group.
- `id` makes the box an arrow endpoint (the arrow stops at the box edge).
- `kind="borderless"` draws nothing: no border, badge, band or default padding. It still lays out and hugs its
  children and can carry an `id`. Use it to name a wrapper (a bare stack cannot carry an id).
- A `service-*` kind draws a 28 px square in the top-left corner holding `icon` (on a white backing), with the label
  to its right. Without `icon` the square is solid category colour, the in-progress state the editor shows. The band
  is the same 32 px as every other kind, so switching `kind` never moves the contents. Which colour to use is in
  [composition.md](composition.md).
- Groups paint their chrome first and their children on top, so a container sits behind its contents.
- The title starts right of the badge or service square (34 or 38 px in, baseline 19 px down), or 10 px in and 22 px
  down for a kind with neither. A badge missing from `src/icons/group.js` is a broken install, not a reason to move
  the title: the render throws `The corner badge "<name>" of <Group kind="<kind>"> is missing ...`.

Every kind and how it is drawn (`GROUP_STYLES` in `src/engine/groups.ts`). Dashed borders use a 6 4 pattern; every
border is 2 px with 4 px rounded corners.

| `kind` | Border | Label text | Dashed | Corner badge (`group.js`) | Fill |
|---|---|---|---|---|---|
| `aws-cloud` | `#242F3E` | `#242F3E` | no | `AWSCloudLogo` | none |
| `region` | `#00A4A6` | `#00A4A6` | yes | `Region` | none |
| `vpc` | `#8C4FFF` | `#8C4FFF` | no | `VirtualPrivateCloudVPC` | none |
| `public-subnet` | `#7AA116` | `#248814` | no | `PublicSubnet` | `#F2F6E8` |
| `private-subnet` | `#00A4A6` | `#147EBA` | no | `PrivateSubnet` | `#E6F6F7` |
| `account` | `#E7157B` | `#E7157B` | no | `AWSAccount` | none |
| `auto-scaling` | `#ED7100` | `#ED7100` | yes | `AutoScalingGroup` | none |
| `datacenter` | `#7D8998` | `#7D8998` | no | `CorporateDataCenter` | none |
| `generic` | `#5A6B86` | `#5A6B86` | yes | none | none |
| `borderless` | not drawn | | | none | none |
| `service-purple` | `#8C4FFF` | `#232F3E` | no | corner square | none |
| `service-pink` | `#E7157B` | `#232F3E` | no | corner square | none |
| `service-green` | `#7AA116` | `#232F3E` | no | corner square | none |
| `service-teal` | `#00A4A6` | `#232F3E` | no | corner square | none |
| `service-orange` | `#ED7100` | `#232F3E` | no | corner square | none |
| `service-red` | `#C7243A` | `#232F3E` | no | corner square | none |
| `service-magenta` | `#CD2264` | `#232F3E` | no | corner square | none |
| `service-devtools` | `#C925D1` | `#232F3E` | no | corner square | none |

### Node

`<Node icon? label? sub? size? id? x? y?>`: one icon and its caption, measured as one box.

| Prop | Meaning |
|---|---|
| `icon` | An icon component from `src/icons/*.js`. Leaving the prop out draws a placeholder (a gray dashed box labelled "icon"), the state of a node just added in the editor. A prop that is present but not a component, such as `undefined` from a misspelt namespace access, is a hard error naming the node. That check (`strictIcons`) runs on every render except the editor's live view; it does not catch a placeholder, which renders and saves as the gray box, so give every node its icon before handing over. |
| `label` | The caption under the icon, 12 px, centred; `\n` starts a second line. |
| `sub` | One more line under the label, 11 px gray. |
| `size` | Icon size in px, default 48. |
| `id` | Lets arrows attach to the icon (not the caption). |

Caption lines start 8 px below the icon and step 14 px.

### Icon

`<Icon icon size? id? x? y?>`: the icon alone, no caption. Use it with a separately placed `<Label>`.

### Label

`<Label anchor? bold? chip? size? color? x? y?>text</Label>`: free text, 12 px `#232F3E` by default, `\n` for more
lines. It reserves the box `[x, x + width]` (estimated width, rounded up) and `anchor` says where the glyphs sit in
that box: `start` from the left edge, `middle` (the default) centred, `end` to the right edge. These are SVG's own
`text-anchor` words, so `"center"` is not an anchor and throws. In a `<VStack align="start">` a `start` label lines up with the column's left edge.

`chip` puts a white box (95 % opaque) behind the text. Labels paint with the structure, before every arrow, so a
chip masks a group border or anything drawn earlier but cannot mask a connector.

### Arrow

`<Arrow from? to? fromSide? toSide? via? points? riser? elbow? head? dashed? color? animate? labelAt? labelSide? id?>label?</Arrow>`

The label is the arrow's child. `<Arrow label="x">` is not a prop: TypeScript flags it, the render silently drops it.

| Prop | Default | Meaning |
|---|---|---|
| `from`, `to` | | Ids of a Node, Icon, Group or Anchor. An unknown id throws. |
| `fromSide`, `toSide` | inferred | `left`, `right`, `top`, `bottom` |
| `via` | | Bend points between the two ends, layout coordinates. Skips the router. |
| `points` | | A complete hand-drawn polyline, layout coordinates. Overrides `from`/`to`. A `points` arrow draws no label: its children are ignored. |
| `riser` | auto | Where the first turn goes, see Routing |
| `elbow` | `"auto"` | `false` draws one straight, possibly diagonal segment |
| `head` | `end` | `start`, `both`, `none` |
| `dashed` | off | A 5 4 dash |
| `color` | `#232F3E` | Line and head colour; each colour gets its own arrowhead marker |
| `animate` | off | See Animation |
| `labelAt` | see Labels | `start`, `middle`, `end` |
| `labelSide` | see Labels | `top`, `bottom`, `left`, `right` |
| `id` | | A handle for tools; names a `points` arrow in the report |

Lines are 1.5 px with an open chevron head. There is no white casing under a line; the arrow labels carry a thin
white halo instead.

**Layout coordinates** (`points`, `via`, an absolute `riser`) are the diagram's own layout space, before the
canvas margin and title band are added, and are never relative to a group. Inside the SVG's content group
(`<g transform="translate(...)">`) every element coordinate is already a layout coordinate, so you can read the
value you need straight off the rendered SVG. An `<Anchor>`'s `x`/`y` are different: relative to its parent's
content box like any `x`/`y`, which equals layout coordinates only at the top level of the `<Diagram>`.

**Endpoints.** An id arrow leaves and enters the centre of a face with an 8 px gap. The bottom face of a Node is the
exception: it starts or ends right at the bottom of the caption (no gap), so a vertical arrow does not run through
the text, and an arrowhead entering a Node from below sits flush under its caption. An Anchor is attached exactly at
its point, with no gap, so two arrows meeting there join cleanly. A Group endpoint is the centre of the box edge, with
the same 8 px gap.

**Inferred sides.** Without `fromSide`/`toSide` the engine picks the faces from the two centres (the larger of the
horizontal and vertical distance wins). For a link between groups it then protects group titles: when an endpoint
node sits inside a labelled group that does not hold the other end, a `top` face is swapped for a side (or the
bottom), and so is a side face that a sibling within 32 px blocks. An explicit side is always honoured.

**Near-straight.** When two facing sides are within 8 px of each other (nodes at different group depths often land
4 px apart, and `<Move>` cannot fix that), the engine slides the source end along its face and draws one straight
line instead of a tiny jog.

### Routing

- Ends aligned on the travel axis: one straight line.
- Otherwise an orthogonal elbow with 6 px rounded corners: an 8 px stub out of the source, a riser (the cross-axis
  run), an 8 px stub into the target.
- Default riser position: 45 % of the way from the source stub to the target stub (a little towards the source, so
  the longer straight run is the one into the arrowhead), kept at least 16 px outside the target face so the head
  has a straight run, then moved one or two cells off any parallel group border it would run along (within 2 px).
  If that path crosses a node's footprint (icon plus caption), the router tries the unmoved position, the plain
  45 % position, each stub tip and 24 px beyond each stub, and takes the first clear one. If none is clear it keeps
  the first.
- One horizontal face and one vertical face make an L: the corner sits where the two stub lines meet; both corner
  orders are tried.
- Only Node and Icon footprints are obstacles. A Group box is not, so an elbow can run through a group's interior;
  there is no automatic detour around anything. Steer with sides, `riser`, `via` or an `<Anchor>`
  ([arrows.md](arrows.md)).

**`riser`** places the first turn by hand and switches off the clear-lane search and the border nudge.

| Value | Arrow shape | Meaning |
|---|---|---|
| fraction 0 to 1 | Z (`fromSide` differs from `toSide`) | Position between the source stub (0) and the target stub (1); 0.5 is the middle |
| fraction 0 to 1 | U (`fromSide` equals `toSide`, for example `top` to `top`) | Outward lift past the outer stub: 0 hugs the nodes, 1 takes the shared crossbar out to the diagram's outermost content on that side (128 px out when that edge is unknown). Both stubs grow together; use it to vault a group between the ends. It applies as well when the two ends share a row (`top`/`bottom` faces) or a column (`left`/`right` faces). When the arrow's own icons are the outermost content on that side, every fraction hugs the nodes. |
| fraction 0 to 1 | L (one horizontal, one vertical face) | Turns the single corner into a staircase: run along the exit axis to the riser, cross, then finish along the target axis. 1 folds back into the plain L. |
| below 0 or above 1 | any bent arrow | An absolute layout coordinate (multiple of 8): the riser's x for horizontal exits, its y for vertical exits. `riser={1}` is the fraction 1, not the coordinate. |

A `riser` cannot apply when the run is already straight (for a U-turn, only when its crossbar has no length: `top` to
`top` between two nodes in one column, `left` to `left` between two in one row), or when `via`, `points` or
`elbow={false}` bypasses the router. The engine then lists the arrow in the report's `riser_ignored` (advisory: the arrow still draws correctly).

### Labels on arrows

An arrow's child text is drawn beside the line, never on it: Arial italic 12 px with a white halo, in its own layer
above every connector.

- Default position: the middle of a straight arrow. On an elbow (three or more points) the default is the end
  whose segment is the longer horizontal run (`end` if the last one is longer, else `start`), on the `top` side,
  because an elbow's middle sits on the cramped riser.
- `labelAt="start"`/`"end"` on an elbow centres the text on the first or last segment. On a straight arrow it sits
  8 px in from that end and grows from the point to the right for `start` and to the left for `end`, whatever the
  arrow's direction (so on a right-to-left arrow it grows back over the node it starts at).
- `labelSide` picks the side: by default above a horizontal run and left of a vertical one. Text above a line sits
  4 px clear of it and a multi-line block grows upwards; text beside a vertical line sits 7 px off it, centred on the
  point.
- `\n` in the text stacks lines; they share the anchor point.

### Animation

Only when the user asks for motion. `<Diagram animate="flow">` animates every arrow; `<Arrow animate>` animates one
and `animate={false}` opts one out of a scene-wide setting.

| Value | Motion |
|---|---|
| `"flow"` (the house style) | The line becomes dashes (10 5; a dashed arrow keeps its 5 4) moving towards the head at 30 px/s, through CSS `stroke-dashoffset`. `head="start"` runs backwards; `head="both"` and `"none"` stay still. |
| `"dots"` or `true` | A 3.5 px dot travels the line at 110 px/s (at least 1.2 s per run), through SMIL `<animateMotion>` with an `<mpath>` pointing at the line (`href` and `xlink:href`). |

The motion goes only into a second file, `<name>.animated.svg`. The `.svg` and `.png` stay still, so documents,
Word files and slides keep a still figure; use the animated copy in READMEs, wikis and HTML pages. The animated copy
carries one `<style>`: the flow rules plus a `prefers-reduced-motion: reduce` rule that hides the dots, stops the
dashes and turns solid lines solid again. It is written only when at least one arrow moves (`"flow"` on an arrow
with `head="end"` or `"start"`, or `"dots"`): a scene whose animated arrows all have both heads or none gets no
animated copy, and any render in which nothing moves deletes a stale one. In
the `.drawio`, `"flow"` sets draw.io's own `flowAnimation=1` on end-headed edges; draw.io has nothing for dots.
Never let motion carry meaning on its own: the arrowhead, label and colour still have to.

### Move

`<Move dx? dy?>...</Move>` shifts everything inside it by `(dx, dy)` (multiples of 8, may be negative), like
dragging a selection. It is transparent to layout: each child keeps its normal slot (its row, column, cell or own
`x`/`y`) and is then displaced, so siblings stay put and no box changes size. That also means a container does not
grow for a Move: nudge a child far enough and it crosses its group's border, and neither `clipped` nor
`label_overlaps` sees it. Nested Moves add up.

### Spacer

`<Spacer size? />` is an invisible square (default 24 px) that takes a normal slot and draws nothing. It is
measured, so its container grows with it. It is square: a 232 px spacer in a row also adds 232 px of height.

### Anchor

`<Anchor id x y />` is an invisible zero-size waypoint at `(x, y)`. It draws nothing and is not an obstacle; arrows
attach to it by `id`, exactly on the point. Use one to run a connector through a clear lane in two legs (first leg
`head="none"`). Anchor coordinates do not follow the layout: re-measure them after any change around them.

### Rect

`<Rect w h x? y? stroke? fill? strokeWidth? dashed? rx? />` draws a rectangle (defaults: stroke `#5A6B86`, fill
none, `strokeWidth` 2, `rx` 4, dashed 6 4). `w`/`h` are the rectangle; `strokeWidth` is the border, never spell
it `width`. It is measured: it grows the fitted canvas and is checked for clipping. With `stroke="none"
fill="none"` it is the usual invisible sizing box.

### Raw

`<Raw>{"<svg markup/>"}</Raw>` inserts SVG markup verbatim. The engine cannot know its extent, so a Raw block does
not grow the canvas and is not clip-checked; the report only counts it (`unmeasured_raw`). Keep raw art inside the
measured content and look at it.

Rects, Raw blocks and Labels paint in tree order with the rest of the structure: after earlier siblings, before
later ones, and always under the arrows.

### edges()

`edges(x, y, size = 48, gap = 8)` gives the handles of an icon you placed at explicit coordinates, for a
hand-drawn `<Arrow points>`: `cx`, `cy`, the face centres `left`, `right`, `top`, `bottom` and `center`, the same
pushed out by `gap` (`leftGap`, `rightGap`, `topGap`, `bottomGap`, the ones to use as arrow ends), and
`capBottom(lines = 1)`, a point under a captioned icon for an arrow that stops below the text. The values are exact,
not snapped (only `capBottom` snaps up), while `points` must be on the grid: keep `size` a multiple of 16 and `x`/`y`
on the grid. With `size={40}` every face centre lands on a half cell and the arrow throws.

### StepBadge

`<StepBadge>` and `<Diagram steps>` throw `Numbered step badges are not supported: label the arrows instead (see
references/arrows.md)`. They stay exported only so an old scene fails with that message instead of an import error.

## The layout report

`composeScene()` returns a report with these fields, in this order. `npm run render` prints it as the `CHECKPOINT`
block; the editor shows it after every edit; `edit-cli --json` returns it whole.

| Field | Holds | Notes |
|---|---|---|
| `overlaps` | Pairs of icons whose boxes, each padded 8 px, intersect | Named by label, else id |
| `label_overlaps` | Pairs of text runs (captions, Labels, arrow labels and group titles) on one line (baselines within 0.9 of the font size) whose estimated extents overlap | Text against text only, never text against an icon or a line. A group title is named `[label]` and listed after the other pairs |
| `clipped` | Anything with a known box past the canvas: icons (padded), groups, text, Rects, and the title on a fixed canvas | Raw blocks are not measured. A group title stays inside its box unless the label has line breaks (drawn on one line, while the box fits the widest line); one that then runs past the canvas is `[label] title` |
| `misaligned` | An icon that shares neither a row nor a column (within 8 px) with another icon of its innermost group | Groups with one icon are skipped |
| `off_center` | Advisory: groups whose left and right icon margins, or top and bottom ones, differ by more than 24 px, as `L../R.. T../B..` | Margins are measured from the icons, the top one below the 32 px band, so a caption counts as bottom margin: `T16/B56` is normal for two-line captions. Look for one side much larger than its partner. |
| `unmeasured_raw` | How many Raw blocks the scene has | Advisory |
| `riser_ignored` | Arrows whose explicit `riser` could not apply | Advisory. Named by edit id in the editor, else `from→to`, else the arrow's `id`, else `points (x0,y0)→(x1,y1)`, else `arrow#i` |
| `aspect` | Width over height, two decimals | |
| `a4_landscape` | `aspect` between 1.25 and 1.75 | A loose filter; the target ratios are in [composition.md](composition.md) |
| `icons`, `groups`, `labels`, `arrows` | Counts | `labels` counts every text run, arrow labels included |

The report filters; it does not judge. It never compares an arrow with anything, so a line through an icon, a label
on a group border or a route through a group all pass it. What it misses and how to look is in
[review-and-fix.md](review-and-fix.md).

## Output files

### The SVG

- The file starts with an XML declaration and draw.io's comment `<!-- Do not edit this file with editors other than
  draw.io -->`, then `<svg content="...">`: the root carries the draw.io model as an escaped attribute, so the same
  file renders as an image everywhere and opens as an editable diagram in diagrams.net.
- The root has `width`, `height` and `viewBox`, and `data-poster="true"` for a poster. Inside: `<defs>` with the
  arrowhead markers, a white background, the title and subtitle, then one content group translated by the fit
  offset.
- The content group mirrors the scene: each Group is a `<g data-name data-kind>` with a `<title>`, painting its
  chrome then its children; each Node is a `<g data-name>` with a `<title>`, its icon (a nested `<svg>`) and its
  caption. Plain stacks leave no trace. After the structure come `<g data-name="connectors">` and
  `<g data-name="arrow-labels">`. A "convert to shapes" import into
  PowerPoint, Illustrator or Figma keeps every container and every icon-with-caption as one movable group, nested the
  way the JSX nests.
- Every id is prefixed per scene, `d<hash>-` (a hash of the title and the laid-out content), so two figures inlined in
  one HTML page never collide: arrowhead markers are `d<hash>-arrow-<colour>` and `d<hash>-arrow-rev-<colour>`, and in
  the animated copy the dot tracks are `d<hash>-flow-aN`. The still `.svg` has no `<style>` and no ids it does not use.
- `<colour>` is the colour's letters and digits. Two colours that reduce to the same ones (`rgb(1,23,4)` and
  `rgb(12,3,4)`) would share a head, so the later one gets `-2` (then `-3`, ...).
- A few icons point at ids inside their own markup (a clip path; 15 of the 813, among them Amazon Bedrock AgentCore
  and Amazon Quick). Each copy of such an icon prefixes those ids with its own place in the figure,
  `d<hash>-<place>_<id>`, so an icon drawn twice, or in two figures on one page, never repeats one. Every other icon's
  markup is exactly as in `src/icons`, and so is every icon inside the `.drawio`, where each is its own image.
- `data-edit-id` attributes appear only in the editor's instrumented renders, never in a saved file.

### The draw.io model

Built by `scripts/lib/drawio-model.ts` from the composed scene, embedded in every SVG (examples included) and written
as `<name>.drawio` by `npm run render`, the watcher, `edit-cli render` and the editor's Save. draw.io discards the
drawn SVG and rebuilds the figure from this model, made from the renderer's own assets (no aws4 shape library):

| Scene part | draw.io cell |
|---|---|
| Group (not borderless) | `container=1` rounded rectangle in the kind's border colour and dash, label top left; nested in the smallest group around it, so it drags with its children; its badge as a 28 px image inside |
| Icon | `shape=image` vertex with the official icon SVG inlined as a `data:image/svg+xml,` URI, labelled with the node's label (or id) |
| Arrow | Orthogonal edge with the route's bend points as waypoints, attached to an icon cell when its end is within 12 px of one, open chevron heads, same colour, width and dash; `flowAnimation=1` on end-headed `"flow"` arrows |
| Arrow label | Edge label riding its edge at 25, 50 or 75 % for `start`, `middle`, `end`, on the side the engine chose |

Not carried: free `<Label>`s, `<Rect>`s, `<Raw>` blocks, a node's `sub` line and borderless groups. The model's grid
is 8 px and its page is the canvas size. draw.io may re-route an orthogonal edge when you move a node.

### The PNG

`scripts/svg-to-png.ts` rasterises with `@napi-rs/canvas` (Skia) on a white background. Skia's SVG support skips a few
things the renderer relies on, so `scripts/lib/svg-for-skia.ts` rewrites the SVG first: every `marker-start`,
`marker-mid` and `marker-end` becomes real arrowhead geometry, a `paint-order` halo becomes a stroke-only copy under a
fill-only copy, and each `font-family` list is cut to its first installed family (so bold and italic survive). Icon
`<svg>`s are copied through untouched. Set `SVG2PNG_DEBUG=<path>` to also write the rewritten SVG when a PNG looks
different from a browser.

## Rendering and watching

The command table is in [GUIDE.md](../GUIDE.md); this is what each command does.

**`npm run render -- <scene.tsx> [out.svg] [flags]`** bundles the scene, composes it and writes `<name>.svg`,
`<name>.drawio` and, when an arrow moves (see Animation), `<name>.animated.svg`. It then writes the 4800 px PNG beside the SVG
(the deliverable; too large to open) and a look copy that fits inside 1568 x 1568 px at `$TMPDIR/<name>.look.png`
(the one to Read), prints the `CHECKPOINT` report and the `drawio-link` command, and finally runs
`scripts/check-paths.ts` and `scripts/check-layout.ts` on the SVG, printing `PATH CHECK` and `LAYOUT CHECK`.

| Flag | Effect |
|---|---|
| `[out.svg]` | Second argument, used only when it ends in `.svg`; otherwise the SVG goes next to the scene |
| `--png-width N` | Width of the deliverable PNG, default 4800 |
| `--no-png` | No PNG and no look copy |
| `--no-check` | Skip both checks (only for a quick look while composing) |
| `--canvas WxH` | Render into that fixed size (`--canvas 1200x800`) instead of fitting: the content stays at the raw layout origin and anything past the size, the title included, is reported as clipped. A debugging view of layout coordinates. |
| `--view` | Also screenshot the SVG through agent-browser to `$TMPDIR/aws-diagram-view-<name>.png` |
| `--width N` | Width of that screenshot, default 1400 (nothing to do with the canvas) |
| `--keep-browser` | Leave the agent-browser session open after `--view` |

Exit codes: 0 clean, 3 when a check fails (files still written: fix the scene), 2 for a usage error or an unknown
flag (flags are never silently ignored), 1 when the scene throws or a PNG export fails.

**`npm run watch -- <scene.tsx> [--svg out.svg] [--png preview.png] [--width N]`** renders once, then again on
every save (debounced, one render at a time), writing the SVG, `.drawio` and animated copy, and refreshing a preview
PNG at `$TMPDIR/aws-diagram-view-<name>.png` through agent-browser (`--png` moves it). It writes no 4800 px PNG and
runs no checks. A scene that throws prints the error and keeps watching. Only the scene file, `src/engine.tsx` and
the engine modules in `src/engine/` are watched: after editing a helper file or an icon module, restart it. It ignores its own outputs, survives editors that save by renaming, and `Ctrl-C` stops it and closes the
browser session. Without agent-browser, export a look PNG after each save.

**`npm run examples [-- --view] [--dir <path>] [--width N]`** re-renders every `.tsx` in `assets/examples/` (or
`--dir`), in name order, and writes each scene's SVG only (with its embedded model: no `.drawio`, no PNG, no checks).
It prints one line per scene, `clean` or the issue counts, then a summary line, and exits 1 when a scene fails to
render. `--view` screenshots every example into a temp folder for the look. This is the engine regression gate:
[engine-regression.md](engine-regression.md).

`--view` uses the warm agent-browser session `aws-diagram-render`; stop it with
`agent-browser close --session aws-diagram-render`.

## TypeScript

`npm run typecheck` runs `tsc --noEmit` over the engine, the scripts, the examples and `scenes/` (the generated
`src/icons/` is excluded). It is the only thing that catches an Arrow `label` prop. Scripts run as plain `node x.ts`
on Node 22.18 or later (type stripping); scenes go through esbuild, which handles the JSX.

Types a scene or tool may need: `IconComponent`, `Figure`, `GroupKind`, `GroupStyle`, `Align` (`start`, `center`,
`end`), `TextAnchor` (a Label's `start`, `middle`, `end`), `Side`, `LayoutDir`, `Animate`, `Pt`, `LayoutReport`,
`ComposeOptions`, and the prop interfaces (`DiagramProps`, `GroupProps`, `NodeProps`, `ArrowProps` and the rest).
