# Edit mode: the visual editor and the edit CLI

Two ways to change an existing scene without writing JSX by hand: a browser editor for people and a headless CLI for
agents. Both apply every edit through one shared core (`applyOp` in `scripts/lib/edit-ops.ts`, working on the source
model in `scripts/lib/scene-source.ts`), so a CLI `set`, `connect` or `shift` rewrites the source exactly as the
matching click does. Both change only the real `.tsx`, never a copy, and both go through the normal compose and render
pipeline, so anything done here could also be written by hand. The workflow that uses the CLI to fix defects is in
[review-and-fix.md](review-and-fix.md).

## The visual editor

```bash
npm run edit -- scenes/<name>.tsx              # serves http://127.0.0.1:5178
npm run edit -- scenes/<name>.tsx --open       # and opens the browser at it
npm run edit -- scenes/ --port 5180            # a whole folder: pick the scene in the panel
```

It is the hand-off step once a new figure passes review (the workflow in [GUIDE.md](../GUIDE.md)): launch it, tell the
user the URL, that this is their diagram open for editing, and that **Save SVG** writes the deliverables. On launch
the terminal prints a short tutorial of the gestures; `--open` also opens the system browser. The server listens on
127.0.0.1 only, port 5178 unless `--port` says otherwise. Given a folder, it opens the first scene and its panel
lists every `.tsx` and `.jsx` directly inside the folder (names starting with `.` or `_` are skipped); given one file,
it opens that file, and the same picker still offers the folder's other scenes.

A light gray 8 px grid (the engine's cell) covers the canvas while editing, so it is obvious you are in edit mode. It
is drawn by the page only and never saved.

| To | Do |
|---|---|
| Select | Click a node, an arrow or a group. The panel focuses it and shows its source. |
| Set a Group's `kind`, `layout`, `align` | Pick from a grid of large preview cells: each kind shows its border colour with its badge or corner square, each layout a picture of row, col, grid, zstack or free, each alignment three bars. |
| Set an Arrow's `from`, `to` | A searchable list of every target with its icon (or a group's kind swatch), name and id. |
| Set an Arrow's `fromSide`, `toSide`, `head`, `dashed`, `elbow` | Grid cells with a 48 x 48 picture of the face, the arrowhead placement, dashed or solid, elbow or straight. `dashed` is a boolean, so its two cells are the whole story: unset shows `false` rather than "(auto)", because absent is false, and picking `false` removes the prop. `labelAt` and `labelSide` are plain lists. |
| Edit text | Type a Node's or Group's `label`, a Node's `sub`, any `id`; numeric `gap`, `size` and `cols` are written as `={n}`. |
| Recolour an arrow | One-click swatches: squid ink `#232F3E` (the default), blue `#0972D3` (request path), purple `#8C4FFF` (invocation), gray `#5A6B86` (async or external), green `#7AA116` (storage), orange `#ED7100` (compute), teal `#00A4A6` (networking), red `#C7243A` (security or failure). The box beside them takes any hex or a scene constant, and the cross returns to the default. A scene that says `color={BLUE}` shows `BLUE` and keeps the constant until you pick something; a bare identifier is written back as an expression (`color={BLUE}`), a hex as a string (`color="#0972D3"`). |
| Move an elbow's first turn | The `riser` slider (a fraction from 0 to 1, in 0.05 steps) with a cross to return to the automatic lane. An absolute riser (a layout coordinate below 0 or above 1, a multiple of 8) is typed in the source or set with the CLI. When the arrow's geometry cannot honour a riser (a straight run has no turn; `via` and `elbow={false}` bypass the router) the field says so, from the report's `riser_ignored`, instead of sliding with no effect. A perpendicular L can be adjusted: the riser bends its corner into a staircase. |
| Nudge | The Move pad (four arrows) shifts the selection one 8 px cell by wrapping it in `<Move dx dy>`. Repeats add to the same Move, a Move that returns to zero is removed, and `Move` is imported for you. Shown for a Node, Group or Icon only: an arrow re-resolves its ends from the boxes it attaches to, so a Move around it changes nothing (retarget it with `from`/`to`). A Move inside a layout container still relocates the child: it keeps its slot and is offset. |
| Resize a Group | The two Scale pads (Group only): *scale out* grows one edge by 8 px, *scale in* shrinks it (never below 0), by setting that side's `padTop`, `padRight`, `padBottom` or `padLeft` (each starts from `pad`, 16 by default and 0 for `borderless`). A Group hugs its children, so per-side padding is its size control; the label band does not change. |
| Draw a new arrow | Hover over or select a node or group: four direction handles appear at its edge midpoints. Press one (it stays lit and a faint gray line follows the cursor), then press a handle on another element. The two handles become `fromSide` and `toSide`, and an end without an `id` gets one made from its label. Esc or a click on empty canvas cancels; pressing a handle on the same element re-arms from that side. |
| Add a node | Hover over or select a Group: a green **+** appears at its bottom-right corner. Click it to append a `<Node>` as the group's last child. It has no icon yet, so it draws the gray dashed placeholder labelled "icon", and it is selected so you can set its label and pick its icon at once. |
| Assign an icon | With a Node, an Icon or a `service-*` Group selected, the panel shows a searchable list of the whole 813-icon catalog: empty, it browses everything in name order; typing filters with the same ranked, abbreviation-aware search as `npm run find` (`sqs`, `s3`, `ddb` put the base service first). Each row carries a live thumbnail of the real icon, loaded as it scrolls into view. Picking one sets `icon={ExportName}` and adds the import (mind the import-path trap below). |
| Delete | Hover over or select an arrow (red cross at its midpoint), or a node, icon or group (red cross at its top-left corner), then click the cross. A cross that appears under the pointer (an arrow entered at its midpoint, a group pointed at by its corner) takes no click until the pointer has moved off it, so a click on the element itself always selects it. Deleting an element also removes every arrow that referenced it. Deleting the last one leaves a blank canvas, so the delete can still be undone; Save refuses a scene with nothing to draw. |
| Undo, redo | Toolbar buttons, or Cmd+Z and Shift+Cmd+Z (Ctrl on other systems). Each scene keeps its own history of whole-source snapshots (the last 100). An edit with several parts, such as a connect that also assigns ids, is one step. |
| Save | **Save SVG** writes `<scene>.svg`, `<scene>.drawio` and, for an animated scene, `<scene>.animated.svg` beside the scene: clean, with no edit ids. It refuses while any node still has no icon (the message names them), and it renders with the strict icon check, which also refuses an `icon` prop that is present but broken. No PNG is written; the live canvas is a faithful render to validate, or export a PNG with `scripts/svg-to-png.ts`. |

Every edit is trial-rendered before it is written. A change that would throw (an off-grid value, an unknown id, broken
JSX) is rejected, the file is left as it was, and the panel shows the reason. Two layout values have preconditions
that catch people here: `free` places only children with `x`/`y`, and `grid` needs `cols`. Pick one for a group whose
children do not qualify and the edit is refused with a message such as `<Group "VPC"> lays out its children as "free",
but its child <HStack> has no x/y`: set `cols` first, or give the children `x`/`y`. After a good edit the SVG
re-renders and the panel's report line updates (aspect, counts, overlaps, label collisions, clipping, misalignment).

### How a click finds its source

On every render the server parses the scene into an element model: each `<Node>`, `<Group>`, `<Arrow>` and `<Icon>`
opening tag with its byte range and props, numbered `e0`, `e1`, and so on in source
order; tags inside comments and strings are skipped. It renders an instrumented temporary copy in which every element
carries `__editId="eN"`, and the engine passes that through as `data-edit-id` on the element's `<g>` (it changes no
layout and is absent from normal renders). The SVG element you click therefore maps to an exact source span. Edits
work on byte ranges of the original file, which is parsed again after every write. The instrumented copies are
temporary files beside the scene, deleted after use; neither the saved `.svg` nor the scene ever carries the edit ids.
The live view renders with the icon check off, so a broken icon reference shows as a placeholder there instead of
an error; Save runs the check.

### HTTP endpoints

The page calls these, and they are scriptable.

| Request | Returns |
|---|---|
| `GET /` | The editor page |
| `GET /scenes` | `{dir, scenes, active}` |
| `GET /state[?scene=name]` | `{svg, width, height, report, scene, source, elems, schema, ids, targets, canUndo, canRedo}` |
| `GET /icons?q=...` | `{icons}`: every match, no cap. An empty `q` lists the whole catalog in name order; a query ranks exact and name matches first. Each entry is a full catalog record (`exportName`, `name`, `type`, `module` and the rest). |
| `GET /icon-svg?export=NAME[&px=N]` | A standalone `<svg>` of one icon or badge export (default 40 px) for the preview thumbnails, or 404 |
| `GET /kinds` | `{kinds: [{kind, border, badge, service}]}` for every group kind |
| `POST /edit` | `{op, editId, ...}` (below). Returns the new state (plus `newEditId` and `newId` after `addNode`), or `{ok: false, error}` |
| `POST /undo`, `POST /redo` | The new state, or `{ok: false, error: "nothing to undo"}` (or redo) |
| `POST /save` | `{ok, svgPath}` |

`?scene=` names a file directly inside the served folder; anything else answers `unknown scene`. Every POST must send
`content-type: application/json` (anything else gets 415). The `Host` header must be `localhost:<port>` or
`127.0.0.1:<port>` and an `Origin` header, when present, must match it (403 otherwise); other methods get 405. A
request target the URL parser refuses (an absolute form such as `http://[x`) gets 400, and the server keeps running.

### Edit operations

`POST /edit` and the CLI's edit commands both send one of these to `applyOp`:

| `op` | Fields | Effect |
|---|---|---|
| `setProp` | `editId, prop, value, kind` | Sets, replaces or (with `value: null`) removes one prop. `kind` `string` writes `prop="v"`, `expr` writes `prop={v}`, `bool` writes the bare prop; a bool set to `false` is removed, because JSX has no false spelling (absent is false). |
| `setProps` | `editId, props: [{prop, value, kind}]` | Several prop edits in one commit, such as an arrow's `labelAt` and `labelSide` |
| `shift` | `editId, dx, dy` | Wraps the element in `<Move dx dy>`, or adjusts the Move directly around it, removing it at 0, 0; imports `Move` |
| `scale` | `editId, side, d` | Group only: that side's `pad*` prop plus `d`, never below 0 |
| `setIcon` | `editId, icon` | `icon={ExportName}` for a catalog export name, plus the import |
| `connect` | `fromEditId, fromSide?, toEditId, toSide?` | Gives each end an `id` if it has none (a slug of its label, else of its tag), refuses joining an element to itself, and inserts `<Arrow from to [fromSide] [toSide] />` just before `</Diagram>` |
| `addNode` | `editId` of a Group | Appends `<Node id="node" label="New node" />` (then `node-2` and so on) as the group's last child, imports `Node`, returns the new id |
| `delete` | `editId` | Removes the element (and its line when it is alone on it) and every arrow whose `from` or `to` named an id inside it |

Values are spliced into source, so they are checked first: a prop name must be an identifier, an `expr` value a
number, `true`, `false` or an identifier (a scene constant), and a `string` value may not contain a double quote. An
arrow's `from` or `to` set to `@eN` (an id-less group, as listed in `targets`) gives that group an id made from its
label and wires the arrow in the same step. The `targets` list holds every Node, Icon and Group that has a plain id,
plus every Group without one (listed by its label); ids built from template literals are left out, though a current
such value is kept in the field.

## The edit CLI

```bash
npm run edit-cli -- <scene.tsx> <command> [args...] [flags]
node scripts/edit-cli.ts <scene.tsx> <command> [args...] [flags]
```

It takes one scene file. `npm run` prints a two-line banner on stdout, which pollutes captured source and `--json`
output: when you consume stdout, call the script with `node` directly. Status lines (the `✓` lines, notes and the
one-line report) go to stderr.

**Immutable by default, the deliberate difference from the editor.** An edit command applies the change and prints the
whole edited source to stdout, leaving the input file untouched. `--out <path>` writes it to a new file instead, and
`--in-place` overwrites the original the way the editor does. Every edit is trial-rendered first and rejected with exit
code 1 and an `error:` line on stderr when the result would not render. That includes an edit that leaves nothing to
draw, such as deleting the last element (`<Diagram> has nothing to draw`), which the visual editor allows so it can be
undone.

| Command | Does |
|---|---|
| `list` | Every editable element: a table of `editId`, tag and props (JSON with `--json`) |
| `get <editId>` | One element's props and the start of its source (JSON) |
| `targets` | What an arrow's `from`/`to` may name (JSON) |
| `icons [query]` | The ranked icon search, top 40, with a note when it stops at 40 (JSON with `--json`) |
| `kinds` | Group kinds with their preview metadata (JSON) |
| `schema` | Every editable prop per tag, with its kind and choices (JSON) |
| `set <editId> <prop> <value>` | `setProp`; the value is the rest of the line, and `""` or `null` removes the prop |
| `set-props <editId> <prop=value> ...` | `setProps` |
| `shift <editId> <dx> <dy>` | `shift` |
| `scale <editId> <side> <delta>` | `scale` (`delta` defaults to 8) |
| `set-icon <editId> <ExportName>` | `setIcon` |
| `connect <fromEditId> <toEditId> [fromSide] [toSide]` | `connect` (both ends are editIds) |
| `add-node <groupEditId>` | `addNode` |
| `delete <editId>` | `delete` |
| `render` | Writes `<scene>.svg`, `<scene>.drawio` and, for an animated scene, `<scene>.animated.svg` beside the scene (beside the `--out` path when given) and prints the one-line report |
| `help` | The full usage |

| Flag | Effect |
|---|---|
| `--out <path>` | Write the edited source to `<path>` (the input stays untouched) |
| `--in-place` | Overwrite the input file |
| `--render` | After the edit, also render beside the written file; needs `--out` or `--in-place` |
| `--view` | Render, then screenshot the SVG through agent-browser to a temp PNG (optional; needs Chrome) |
| `--json` | Print a result envelope on stdout, with the full layout report; with no `--out` or `--in-place`, the edited source is in its `src` field |
| `--quiet` | Hide the status lines and the report line; do not use it when you need the report |

### Using the CLI correctly

1. **`list` first, then edit by `editId`.** Never guess an id. editIds are positions in source order, so after an edit
   that adds or removes an element (`add-node`, `connect`, `delete`) run `list` again before the next edit. `set`,
   `set-props`, `shift`, `scale` and `set-icon` keep them stable.
2. **Discover values instead of inventing them.** `schema` lists every editable prop and its choices per tag; `icons
   <query>` finds the exact `ExportName` that `set-icon` needs, with the same ranked, abbreviation-aware search as
   `npm run find` (`icons sqs` and `icons s3` put the base service icon first); when it stops at 40, narrow the query
   rather than paging; `kinds` lists the group kinds; `targets` lists what `from`/`to` may reference.
3. **Value encoding is automatic** for props in the schema: `set e5 dashed true` writes a bare `dashed`, `set e5 elbow
   true` writes `elbow={true}`, `set e5 label "API Gateway"` a quoted string, and the numeric `gap`, `size`, `cols` and
   `riser` are written as `={n}`, so `set <group> gap 40` is a valid way to relieve an overlap. Clear a prop with `""`
   or `null` (`set e5 sub null`); a boolean set to `false` is removed, the same as `null`.
4. **`riser` applies only where there is a turn.** On a straight run, or an arrow using `via` or `elbow={false}`, it does
   nothing: `--render` names the affected arrows and the report lists them under `riser_ignored` (advisory; the arrow
   still routes correctly). On a perpendicular L it turns the corner into a staircase.
5. **Immutable output is a feature.** With no write flag the edited source goes to stdout and the file is untouched,
   which suits previews, diffs and candidate fixes. Save a candidate with `--out`; use `--in-place` only to commit a
   change to the original.
6. **Check the exit code.** A change that would not compile (off-grid, unknown id, bad JSX) exits 1 with an `error:` on
   stderr, and the file is never left half-edited.
7. **`--render` renders the edited scene** beside the file it wrote. Look at it with `node scripts/svg-to-png.ts
   <svg> <png> --look` (or the optional `--view`); the SVG is the artifact.

### Traps

- **Props outside the schema are written as quoted strings.** `set e2 padLeft 32` writes `padLeft="32"`, which the trial
  render rejects (the engine wants a number). Change padding with `scale`; edit `x`, `y`, `pad` and other unlisted
  numeric props in the source. For `color`, pass a hex: a bare word is also written as a string.
- **`set-icon` can write the wrong import path.** When the scene has no import from the icon's module yet, the CLI (and
  the editor's icon picker) adds `import { Name } from "../../src/icons/<module>"`. That is right for
  `assets/examples/` but wrong for `scenes/`, and the edit is rejected with `Could not resolve
  "../../src/icons/<module>"`. Add an import from that module by hand first (any icon from it); `set-icon` then
  extends the existing line.
- **Keep candidates beside the scene.** `--out` to another folder breaks the candidate's relative imports, and its
  `render` fails.

```bash
npm run edit-cli -- scenes/fig.tsx list                                          # find the editId
npm run edit-cli -- scenes/fig.tsx set e3 label "Amazon API Gateway"             # prints the edited source
npm run edit-cli -- scenes/fig.tsx set e3 label "Amazon API Gateway" --in-place --render
node scripts/svg-to-png.ts scenes/fig.svg /tmp/fig.png --look                    # then Read it and look
```
