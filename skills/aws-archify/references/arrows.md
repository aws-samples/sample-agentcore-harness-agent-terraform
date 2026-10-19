# Arrows

How to wire a figure. Read this before adding any `<Arrow>`. The mechanics (endpoints, inferred sides, the elbow
router, `riser`, where labels land) are specified in [scene-api.md](scene-api.md); fixing a route that came out wrong
is in [review-and-fix.md](review-and-fix.md).

## Draw the fewest arrows that carry the shape

The arrow budget is set once, in the core design decisions of [GUIDE.md](../GUIDE.md): show logical relationships,
not every call; relate to groups; one dominant direction; no more arrows than nodes; a short label on each meaningful
arrow. Read it before drawing. Everything below is about the geometry of the arrows that survive it.

## Label the arrows; never number the steps

Figures never carry numbered step badges (①②③) or a numbered legend, however many steps the flow has. Numbers make
the reader jump between the picture and a legend, go stale as soon as the flow changes, and hide what each arrow
means. A short label on the arrow says what happens, right where it happens.

The engine enforces it: `<StepBadge>` and `<Diagram steps>` throw `Numbered step badges are not supported: label
the arrows instead (see references/arrows.md)`, and `check-layout.ts` fails an arrow label that starts with a step
number. To port an old numbered scene, delete every `<StepBadge>` and the `steps` prop, and give each arrow a badge
pointed at a one-or-two-word label. Detail that needs more words goes in a node's `sub` caption or in the text around
the figure.

Label the meaningful hops with a one-or-two-word protocol or action (`HTTPS`, `invoke`, `publish`) and leave obvious
internal hops bare. The label is the arrow's child, `<Arrow from="api" to="fn">invoke</Arrow>`; a `label=` prop is
silently dropped.

## Relate to the group, not to each member

When a source relates to a whole group, draw one arrow to the group, not one into each member. Give the `<Group>` an
`id` and target it: `<Arrow from="settlement" to="security" />` reaches the "Security & Config" box, instead of one
arrow to KMS and another to Secrets Manager inside it. Several arrows fanning from one node into members of one
container is clutter that reads as sequence detail; one link to the box says "this uses that group". Draw per-member
arrows only when the difference matters (a different direction, or only one member is involved).

The rule in general: relate to the container when the relationship is with the group as a whole, and to a node when
it is with that node.

## Leave and enter through open space

Two failures are common when an arrow leaves a node that sits in a grid or a stack next to other tiles, and the report
catches neither; only a look shows them.

- **Never leave through a face that has a neighbour.** If a tile sits right beside or below the node, an arrow out of
  that face runs into the neighbour before it can turn. In a control-plane grid where AWS Lambda sits directly above
  AWS Organizations, an arrow from Lambda's bottom face to a group further down collides with Organizations. Leave
  from a clear face (Lambda's right, or the row's outer edge) so the connector starts in open space. The same holds
  for the entry face at the target.
- **When no face works, route through an `<Anchor>`.** If every face-to-face route still crosses tiles (a Lambda in the
  middle of a row dropping to a group that spans the whole row below), put an `<Anchor>` in the clear margin (past
  the row's outer edge, or in the lane between the two tiers) and draw two legs: source to anchor with `head="none"`,
  then anchor to the group.

Rule of thumb: an arrow should be born in empty space. Look at what sits next to each end before setting `fromSide` or
`toSide`; use the open face, and if no open face reaches the target cleanly, use an anchor in the margin.

## Two nodes in one stack that are not neighbours

**Wrong:** joining two nodes with one or two nodes between them through the faces along the stacking axis. In a
`<VStack>`, `bottom` to `top` runs straight down through the icons in between; in an `<HStack>`, `left` to `right`
plows through the skipped tiles.

**Right:** leave and enter through the faces perpendicular to the stack, so the arrow runs in the margin beside it.

- In a `<VStack>`: `right` to `right` (or `left` to `left`). The arrow steps out sideways, runs down the margin past
  the skipped nodes and comes back in.

  ```tsx
  <Arrow from="kinesis" to="dynamodb" fromSide="right" toSide="right" />
  ```

  **Push the riser past the captions.** Captions hang below their icons and are usually wider than them, and by
  default the vertical run turns just outside the icon edge, so it lands on the skipped nodes' caption text (a
  fan-out Lambda to ElastiCache riser running through the "Amazon DynamoDB / feed store" caption). The report does not
  see it. Raise the `riser` until the turn sits in clear margin beyond the widest caption: an absolute x just past the
  caption edge, or a larger fraction. On a same-side arrow like this one the fraction is an outward lift (0 hugs the
  nodes, 1 goes out to the diagram's edge; see [scene-api.md](scene-api.md)). Try a few values and look:

  ```tsx
  <Arrow from="fanout" to="cache" fromSide="right" toSide="right" riser={0.9} />
  {/* or an absolute x past the caption: riser={560} */}
  ```

- In an `<HStack>`: `top` to `top` (or `bottom` to `bottom`), along the margin above or below the row.

  ```tsx
  <Arrow from="edge" to="analytics" fromSide="bottom" toSide="bottom" />
  ```

Only immediate neighbours use the along-axis faces (`bottom` to `top` between two adjacent nodes of a VStack, `left`
to `right` between two adjacent nodes of an HStack). Pick the margin (left or right, top or bottom) that no other
connector uses.

## Across stacks or groups: over the top or under the bottom

**Wrong:** one arrow between components in different stacks or different groups through the facing sides: a
`right` to `left` between two side-by-side columns, a `bottom` to `top` between two stacked rows. The straight or
elbow line cuts through the stacks and group boxes in between (a KMS to Cognito arrow slicing through the "Security &
Compliance" and "Query API" boxes; a feed-writer Lambda to an S3 bucket two columns away crossing every tile on the
way).

**Right:** go up and over, or down and under, through an `<Anchor>` outside the groups, so the crossing runs in the
empty margin.

1. Leave the source through its `top` (over) or `bottom` (under) face, whichever margin is clear.
2. Put an `<Anchor id x y>` (multiples of 8; anything else throws) in the clear lane just above the tops, or just below
   the bottoms, of the stacks you are crossing, at the height the crossbar should run. The anchor sits outside the
   group boxes: that is what keeps the crossing out of the icons and borders. For two stacked rows, mirror it: leave
   `left` or `right` and put the anchor in the clear lane beside them.
3. Draw the source to the anchor with `head="none"`.
4. Draw the anchor to the target, which carries the one visible head and enters on its top or bottom face.

An anchor attaches with no gap, so the two legs meet exactly and read as one connector with two turns: up out of A,
across the margin, down into B.

```tsx
{/* KMS (right group) to Cognito (left group): up, across the top, down */}
<Anchor id="wp" x={432} y={96} />                          {/* clear lane above both groups */}
<Arrow from="kms" to="wp" fromSide="top" head="none" />    {/* leg 1, no head */}
<Arrow from="wp" to="cognito" toSide="top" />              {/* leg 2 carries the head */}
```

**A node in one of several columns reaching a component in a row below them: drop to a bottom anchor.** Joining them
by their facing sides draws a long line at icon height straight through every column in between (a Kinesis stream in
an "Intake" column feeding a settlement Lambda two columns over, through the fraud-screening group and its Bedrock and
SQS icons). Leave the source's `bottom`, cross in the lane below the columns, then come up into the target.

```tsx
{/* Kinesis (in the Intake column) to the settlement Lambda: down, across, up */}
<Anchor id="wp-bot" x={1000} y={760} />                            {/* clear lane below the columns */}
<Arrow from="kinesis" to="wp-bot" fromSide="bottom" head="none" />
<Arrow from="wp-bot" to="settle-fn" toSide="bottom" />
```

Use an anchor whenever a connector between stacks or groups would otherwise pass through a stack's members or a group
box. Prefer the top or bottom margin to the lane between side-by-side columns, which runs straight through the group
interiors. Choose the margin that is clear and nearest both ends: a target in a row below takes the bottom anchor, one
reached over the top of the figure the top anchor. Two non-neighbours inside one stack need no anchor: use the off-axis
faces above.

Anchor coordinates do not follow the layout, so re-measure them from the SVG after any change around them
([scene-api.md](scene-api.md) explains which coordinates to read).

## Order a group's children by where the arrow enters

The router avoids every node's icon and caption, but a `<Group>` box is not an obstacle. An arrow from outside that
targets a node on the far side of a group enters the box at its near edge and runs through the interior, skimming the
nodes in between, to reach it; it reads as weaving through the container instead of pointing in. Put the target node
on the side of the group nearest the arrow's source, so the connector lands as a short elbow in the open margin and
enters that node's near face.

Example, the governance band of the data lakehouse: a dashed `register` riser drops from AWS Glue above the band into
the AWS Glue Data Catalog, so the Catalog is the band's right node, directly under Glue. With the Catalog as the left
node, the riser had to cross the whole box past Lake Formation.

## Hubs that fan out or fan in

When one node feeds several (a router, an API, an event bus), put the targets next to it, on one side, and force
`fromSide`/`toSide` so every branch leaves the same face and enters its target cleanly. A hub fanning out to columns
spread across the canvas draws long arrows that cross other components; stack the branches beside the hub instead.

- Give the bent branches one shared absolute `riser` in the middle of the lane, so all of them turn in the same place
  and none runs along a group border (web3-payments-oauth, iot-streaming-analytics, media-streaming-platform,
  contact-center-connect).
- On a fan-in, one label on the middle hop reads for the whole convergence; on a fan-out, put each label at the target
  end (`labelAt="end"`) so the labels spread out instead of stacking on the shared exit stub
  (security-threat-detection).
- A convergence of parallel lanes onto one node is the mirror of a fan-in: each lane's last node leaves its right face
  and all meet at the shared node's left face (media-streaming-platform).

## Let the engine do the geometry

- Attach by id: `<Arrow from="a" to="b" />` meets the two icons at their facing edge centres with an 8 px gap. An id
  may be a Group's, and the arrow then stops at the box edge (the relate-to-the-group rule above).
- Ends that line up get a straight line; otherwise the engine draws a right-angle elbow whose riser sits in a clear
  lane between components, never a diagonal through an icon or a caption. Force the faces with `fromSide`/`toSide` when
  the inferred ones are wrong; `elbow={false}` gives a deliberate diagonal.
- For a specific path, give bend points with `via={[[x, y], ...]}` (multiples of 8). The engine never invents a long
  detour: it draws the elbow you implied or the bends you gave.
- To move only where the elbow turns, set `riser`: a fraction, or an absolute coordinate below 0 or above 1. It pulls a
  turn out of a cramped lane or lines up the turns of parallel elbows; on a perpendicular L it makes a staircase; on a
  straight run it does nothing and the report lists it under `riser_ignored`. The full semantics are in
  [scene-api.md](scene-api.md).
- A node has four faces. A fifth connection needs a zero-size `<Anchor>` beside it; a hand-drawn `points` arrow cannot
  carry a label.
- Motion only when the user asks: `<Diagram animate="flow">` turns every directed arrow into dashes moving towards its
  head, in a separate `<name>.animated.svg` ([scene-api.md](scene-api.md)). Motion is never the only thing that shows
  direction: the arrowhead, the label and the colour still do that.

## Keep labels readable

Where a label lands by default, and how `labelAt` and `labelSide` move it, is in [scene-api.md](scene-api.md).

**Keep labels off group borders.** A label's halo on a border breaks the line and reads as part of the box
(`check-layout.ts` flags it). Fix it in this order:

1. Move the label with `labelAt` to whichever end sits in open space (`start` or `end`).
2. Give the target group `padLeft` or `padRight` so an `end` label lands inside it (contact-center-connect).
3. Widen the gap between the two groups (for example `gap={96}`); when `start`, `middle` and `end` all collide, the
   channel is simply narrower than the text.
4. When a source outside a container feeds a node inside it, lift or lower the source with a `<Spacer>` or an
   invisible `<Rect>` until the two icons share a row: the hop becomes straight. Otherwise the elbow's riser tends to
   run along the container border with the label on top of it.
5. When the default riser of a fan-out lands on a border, set an absolute `riser={x}` in the middle of the lane
   between the groups.

**A label wider than the gap between its two nodes spills onto an icon.** Prefer a shorter word first; if a single
line still cannot fit, break it into lines with a newline in the children, `<Arrow from="fn" to="ddb">{"read
/\nwrite"}</Arrow>`: the lines share the anchor point and fit the lane.

**Mind the direction of a straight arrow.** `labelAt="start"` or `"end"` on a straight arrow that runs right to left
grows the label back over the node it names. Keep `middle` there and make room for it. Drawing the arrow from the other
end with `head="start"` keeps the same picture but swaps which end is `start` (bedrock-rag-assistant does this so its
`upsert` label sits inside the Knowledge base box, clear of both group borders).

The report never checks a label against an icon; only a look does ([review-and-fix.md](review-and-fix.md)).

## After every arrow

Render and look. Both ends attach at an edge centre with a gap, nothing crosses a caption, and no label sits on a
border. Lines carry no white casing, so a connector crossing a container border is two lines crossing: route around
the border instead of relying on the line to stay legible.
