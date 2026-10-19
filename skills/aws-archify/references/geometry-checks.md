# Geometry checks the packaged scripts do not cover

Three checks run on every render, and each compares different things:

- The renderer's `CHECKPOINT` compares icon with icon (each tile padded by 8 px), text with text on one line (node captions, `<Label>`s and arrow labels), anything clipped at the canvas edge, and the alignment of icons inside their innermost group (each icon centre within 8 px of another member's row or column). It never looks at arrows, at text against an icon, or at text against a group border.
- `check-paths.ts` compares arrow with icon: a horizontal or vertical connector segment through an icon tile of 48 px or more.
- `check-layout.ts` checks nodes, groups, rows, arrow length, arrow tips, elbow stubs, sibling sizes, gaps, padding and whitespace, and compares arrow with arrow and an arrow's run with caption text (checks 1-17 below). Its groups are the borders the engine draws for `<Group>` (every kind except `borderless`, filled public and private subnets included) and any unfilled, stroked `<Rect>` outline. An invisible `<Rect stroke="none">` is never a group.

Still checked by hand, after every render:

1. An arrow label whose box overlaps an icon tile.
2. An arrow run through a free `<Label>`: check 16 covers node captions, group titles and arrow labels only.
3. Two arrows running side by side within about 12 px of each other: check 16 fails only runs within 6 px.
4. Then render a PNG (`node $SKILLS/aws-archify/scripts/svg-to-png.ts <fig>.svg /tmp/fig.png --look`) and look at it.

Before check 16 existed, all three checks passed diagrams where two arrows were drawn on top of each other for 66 px and where arrows cut through group titles. Check 16 now fails the first and flags the second.

## Checks 1-7

| Check | Fires when | Result |
| --- | --- | --- |
| 1 node overlap | two node boxes (icon plus the captions under it) overlap | FAIL |
| 2 node straddles a group | a node box is neither wholly inside nor wholly outside a group over 160 x 80 px | FAIL |
| 3 label on a border | a text box crosses a border line of a group over 160 x 80 px. Exempt: the diagram title and subtitle, text of 14 px and up, text wider than 30% of the canvas, and a start-anchored caption on a group's top edge | FAIL; WARN for a halo'd arrow label (re-anchor it with `labelAt`) |
| 4 rows overlap | two rows of two or more nodes (node box centres within 24 px make a row) share a vertical band | WARN |
| 5 uneven pitch | in a row of three or more nodes the widest centre gap is over 1.8x the narrowest; two nodes sharing a centre are reported instead | WARN |
| 6 node beside a group | a node outside a group (over 160 x 80 px, narrower than 85% of the canvas) shares 20-80% of its height with it. A node inside another group beside it is skipped; a node outside a VPC beside one of the VPC's subnets is not | WARN |
| 7 aspect ratio | width over height is past 2.5:1. A `<Diagram poster>` is exempt, and nothing checks a tall figure | WARN |

The aspect target is 4:3 to 16:9 (about 1.33 to 1.78, see [composition.md](composition.md)). The `CHECKPOINT` line prints the `aspect` and an `a4_landscape` flag (1.25 to 1.75) and never warns, so check 7's 2.5:1 is the only limit a script enforces.

## Layout checks in check-layout.ts (8-12)

| Check | Fires when | Threshold, and why |
| --- | --- | --- |
| 8 long arrow (WARN) | a straight run, minus the labels on it, is over 2x the node pitch and over 240 px | pitch = median centre-to-centre distance between neighbours, capped at 160 px (the examples' typical pitch) so a sprawling figure cannot excuse its own arrows |
| 8 sparse figure (FIX) | the median empty gap between neighbouring node boxes (tile plus caption) is over 150 px | the gallery's median gaps are 27-131 px; gaps, not centre distances, because wide captions make a compact figure's pitch large |
| 8 wide pitch (WARN) | the gaps are fine but the median centre-to-centre node pitch is over 240 px | the gallery sits at 112-232 px; usually captions longer than they need to be |
| 9 arrowhead on text (FAIL) | a tip is inside or within 6 px of any text under 14 px other than its own label | a tip on words is never intended |
| 9 flush under a caption (WARN) | a tip entering a node's bottom face touches that node's caption | the engine ends bottom-face arrows there by design; enter another face or end at an `<Anchor>` below |
| 10 uneven siblings (WARN) | same-kind structural boxes (same border, and a caption starting VPC, Account, Region, Public Subnet, Private Subnet, Subnet, Availability Zone, AZ or Auto Scaling) under one parent differ by 10-40% in height (same row) or width (same column), or by over 10% when their roles match (Workload A and B) | nearly equal reads as a mistake; clearly different reads as intended |
| 11 whitespace (FIX) | a group or the canvas is over 65% empty | the gallery reaches 62% |
| 11 row or column gap (WARN) | a gap between a group's rows or columns is over 160 px, or over 2.5x the smallest and over 64 px | the gallery reaches 136 px |
| 11 gap between groups (WARN) | two sibling groups sit further apart than the arrow labels between them need (label extent + 16 px a side, at least 48 px) plus 32 px | the gallery's widest group gaps (96-112 px) carry labels that need 91-111 px |
| 11 padding (WARN) | one side of a group's padding is over 80 px and over 3x its tightest side (counted as at least 8 px) | most gallery groups stay under 76 px; a box padded out to match a sibling (check 10) raises it too, so say why when you keep it |
| 12 elbow stub (WARN) | a bent arrow's first or last straight run is under 32 px, so the arrowhead sits right under the bend | the engine's own minimum stub is 8 px |
| 12 jog (WARN) | a three-run arrow whose middle run is under 12 px: two ends a few px out of line | the engine draws ends within 8 px straight, so a jog means the router could not |

## Checks 13-17

| Check | Fires when | Result |
| --- | --- | --- |
| 13 numbered label | an arrow label starts with a step number ("1 ...", "(2) ...", "Step 3") | FAIL |
| 14 zig-zag | a one-to-one arrow runs A, sideways 12-180 px, A again (a Z): its ends are out of line | FIX: put the two nodes on one row or column. Fan-outs, fan-ins and group ends are exempt |
| 14b avoidable bend | a one-to-one arrow between two nodes turns once and its shorter leg is 240 px or less | FIX: put the two nodes on one row or column. A source with two or more arrows out, a target with two or more in, and group ends are exempt |
| 14c icon skim | a run passes within 10 px of an icon it does not connect to | FIX: move it 10 px or more clear |
| 15 document scale | the canvas is over 1280 px wide (3000 px for a `<Diagram poster>`): at an 800 px page, icons print under 30 px and captions under 7 px | FIX: tighten the layout, do not shrink the page; a poster only when the user asked for one big picture |
| 16 arrows overlap | runs of two arrows lie on one line (within 6 px) for more than 24 px, and the arrows share neither a start nor an end | FAIL |
| 16 arrow through text | a run cuts through a node caption, a group title or another arrow's label | FIX |
| 17 title band | an arrow label inside the top 28 px of a group, or a vertical run 12 px or less to the right of a group's title | FIX: move the label below the band with `labelAt`, or route the arrow in from the side |

The sparse figure (8) and a group over 65% empty (11) are FIX too. FIX items fail the run; `--advisory` only reports them. Elements whose coordinates do not parse are skipped, with a WARN saying how many.

Treat every WARN from 8-12 on a new figure as must-fix; keep one only with a stated reason, and give that reason to the user.

## Renderer traps

- Scenes import the engine by relative path: copy the `.tsx` into `$SKILLS/aws-archify/scenes/` and run `npm run render -- scenes/<name>.tsx` from `$SKILLS/aws-archify`. `scenes/` inside the plugin is temporary working space that a plugin update replaces: keep the scene source in the user's project and delete the copy afterwards.
- Services with no icon: follow the stand-in rule in `SKILL.md` (Geometry and naming) and state every stand-in.
- A node has four faces. A fifth connection needs a zero-size `<Anchor>`; manual `points` arrows lose their labels.
- `labelAt="start"` or `"end"` on a straight arrow that runs right to left grows the label back over the node it names. Keep `middle` on those and make room for it instead.
- The caption of the account an arrow enters from ABOVE spans roughly the first 300 px of its top band: a vertical arrow into that account's first node crosses it. Start the account right of the arrow and enter the node's side face instead.
- A bare node in a row beside a group sits higher than the group's first node. Every row except the Diagram's own aligns its children's tops, so the node inside the group is 48 px lower: the group's label band (32 px) plus its top padding (16 px by default). Line them up with `<VStack gap={0}><Rect w={8} h={48} stroke="none" /><Node ... /></VStack>`. A spacer in a stack adds its own height plus the stack's gap (24 px by default), so without `gap={0}` the `<Rect>` is 24 px. The Diagram's own row centres its children on the tallest one instead, so there the offset depends on their heights: beside a group of one row of the same nodes the bare node is 4 px higher, and a 32 px `<Rect>` in a `<VStack gap={0}>` lines it up (with the default gap it lands 12 px low). Read the icon `y` values in the SVG to confirm.
- The `✕` glyph renders as a missing-glyph box in the embedded font. Do not use it in labels; write "denied".
- Draw what the code does, not what the brief says. Read the infrastructure code before drawing.
- Blog and document images are often capped at 800 px. Render at 2x or more for review copies and downscale only the upload copy; a wide diagram shrunk 5x is unreadable.
