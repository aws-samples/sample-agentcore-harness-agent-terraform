# Composing a scene

How to build a figure that reads well, with the layout engine doing the placing. Every prop named here is specified
in [scene-api.md](scene-api.md); arrows have their own guide, [arrows.md](arrows.md); the final check is
[review-and-fix.md](review-and-fix.md).

The bar to compose against is `assets/examples/`: every scene there was rendered and looked at. Start from
`serverless-api.tsx`, the smallest layout-only scene, and use [assets/examples/README.md](../assets/examples/README.md)
to find the example that shows the pattern you need.

## Build it up one element at a time

Layout removes the coordinate arithmetic, not the need to check. Start the watcher before you write any structure:

```bash
npm run watch -- scenes/<name>.tsx
```

Then add one `<Node>`, `<Group>` or `<Arrow>`, save, look, and only then add the next. The watcher refreshes a
preview PNG when agent-browser is installed; without it, export a look copy after each save with
`node scripts/svg-to-png.ts scenes/<name>.svg /tmp/<name>.png --look` and Read that. For a one-off checkpoint without
the watcher, `npm run render -- scenes/<name>.tsx --no-check` writes everything and prints the path of the look copy
(`$TMPDIR/<name>.look.png`).

The report printed on every save (overlaps, label collisions, clipping, alignment, aspect) is a guide. The look is
the gate.

## The tree mirrors the containment

Nest the `<Group>`s the way the boundaries nest: a node in a private subnet sits inside that subnet's Group, inside
the VPC's, inside the Region's, inside the AWS Cloud's. The engine paints outer boxes first and hugs each one to its
contents, so deep nesting stays tight.

Box things only when they share something: a type, a purpose, or a real boundary or tier. A box with no shared reason
is noise.

## Choosing a container

| Kind | Use it for |
|---|---|
| `aws-cloud`, `region`, `vpc`, `public-subnet`, `private-subnet`, `account`, `auto-scaling`, `datacenter` | A real AWS (or on-premises) boundary the system is deployed into |
| `generic` | A logical tier or zone of different services ("Ingestion", "Edge and auth") |
| `borderless` | Grouping with nothing drawn: still lays out, hugs, and can carry an `id` as an arrow target |
| `service-purple` ... `service-devtools` | AWS's "custom group for a service" pattern: one service and its own parts |

<STRICT_REQUIREMENT>
**A structural container is labelled with what it is.** An architecture diagram shows the AWS structure a system is
deployed into (its boundaries, zones and accounts), not a fine-grained logical flow. So when `kind` is a real
boundary (`aws-cloud`, `region`, `vpc`, `public-subnet`, `private-subnet`, `account`, `auto-scaling`,
`datacenter`), the `label` MUST start with that boundary's functional name:

| `kind` | Label |
|---|---|
| `public-subnet` | `Public Subnet` |
| `private-subnet` | `Private Subnet` |
| `vpc` | `VPC` |
| `region` | `Region`, or the Region itself: `Region: us-east-1` |
| `account` | `Account` |
| `auto-scaling` | `Auto Scaling Group` |
| `datacenter` | `Data Center` (or `Corporate Data Center`) |
| `aws-cloud` | `AWS Cloud` |

Context MAY follow as a suffix in parentheses, `Private Subnet (App Tier)`, `Public Subnet (Ingress)`, but the
functional name comes first and is never replaced. `<Group kind="private-subnet" label="Application Tier">` is
wrong: the box draws the private-subnet border and badge, so it must read `Private Subnet` (write
`Private Subnet (Application Tier)` when the tier matters). A free-form tier or zone name with no AWS boundary
behind it ("Ingestion", "Edge & Auth", "Application Tier") belongs on a `kind="generic"` box.

Test: does this box stand for a real structural boundary (a subnet, a VPC, an account, a Region, an Auto Scaling
group, an on-premises data center)? Yes: use that kind and its functional name, plus an optional suffix. No, it is a
logical tier of services: `kind="generic"` with your own label.
</STRICT_REQUIREMENT>

A service group draws a category-coloured box with a square in its top-left corner for the service's icon: pass
`icon={...}`. Without `icon` the square is solid colour, which is only the editor's in-progress state. A finished
service group always carries the icon of its service.

<STRICT_REQUIREMENT>
**A `service-{color}` group is ONE service and holds only that service's own parts.** It is not a tier or a section
container. The corner icon names the single service, and every child is a component, instance or closely related
resource of that same service: an Amazon S3 group holding its buckets, an Amazon ECS or EKS group holding its tasks or
pods, an API Gateway group holding its stages or routes, an RDS group holding a primary and its read replicas.

**A box holding different services is not a service group.** Use `kind="generic"`, or the structural container it
really is (`vpc`, `public-subnet`, `private-subnet`, `account`, `auto-scaling`). "Dispatch services" with several
Lambda functions, a cache and a queue, or "Edge / Auth" with Cognito, API Gateway and WAF, are mixed sets: `generic`.
Never take one member's colour and wrap the whole mixed tier in a `service-{color}` box; that presents unrelated
services as one.

Test: could this box carry a single AWS service name, with every icon inside a part of that one service? Yes:
`service-{color}` in that service's category colour. No, it is a tier of different services: `generic`.
</STRICT_REQUIREMENT>

Each service-group colour is an AWS service category, so choose the kind by the category of the icon in its corner
(this is how AWS assigns the colour; never pick one for looks):

| Kind | Border | Categories |
|---|---|---|
| `service-purple` | `#8C4FFF` | Analytics, Games, Networking & Content Delivery, Serverless |
| `service-pink` | `#E7157B` | Application Integration, Management & Governance, Multicloud & Hybrid |
| `service-green` | `#7AA116` | Cloud Financial Management, Internet of Things, Storage |
| `service-teal` | `#00A4A6` | Artificial Intelligence, End User Computing, Migration & Modernization |
| `service-orange` | `#ED7100` | Blockchain, Compute, Containers, Media Services, Quantum Technologies |
| `service-red` | `#C7243A` | Business Applications, Customer Experience, Front-End Web & Mobile, Security & Identity |
| `service-magenta` | `#CD2264` | Customer Enablement, Databases, Satellite |
| `service-devtools` | `#C925D1` | Developer Tools |

So an Amazon S3 group is `service-green` (Storage), an Amazon EC2 or ECS group `service-orange` (Compute,
Containers), an Amazon Bedrock or SageMaker AI group `service-teal`, a DynamoDB or Aurora group `service-magenta`
(Databases), a Lambda group `service-purple` (Serverless), a CodePipeline group `service-devtools`.

## Naming nodes

A Node's `label` (its first caption line) MUST be the service's official name, the one its icon carries: `AWS
Lambda`, `AWS WAF`, `Amazon API Gateway`, `Amazon Aurora`, `Amazon SQS`. Project context (`idempotent handler`,
`rate limiting`, `double-entry ledger`, `payer/payee alerts`) goes in `sub`: `label="AWS Lambda" sub="settlement
handler"`, never `label="Settlement Lambda"`. Every tile then reads as a real AWS service at a glance, with its role
underneath.

## Compact and even

A compact figure is worth more than a sprawling one: the eye takes in a tight composition at once, and sprawl makes
relationships look weaker than they are. Groups already hug their contents (16 px padding and a 32 px label band;
`borderless` has neither), so a huge empty box only appears when something pushes it out. Keep it tight:

- **Small gaps.** The default `gap` is 24 px. Use 24 to 32 between nodes and up to 40 between major tiers. Never
  inflate gaps to let things breathe: a big empty band at a checkpoint means lower the gap.
- **Grids over sprawl.** Four nodes make a 2 x 2 (`<Grid cols={2}>`, or a row of two columns), not a long row; a
  three-step flow is an `<HStack>`.
- **One pitch apart.** Connected nodes sit about one node pitch apart: the examples run 112 to 192 px centre to
  centre. An arrow longer than two pitches means move the node, not stretch the arrow.
- **Arrowheads in clear space.** Every head ends on an icon edge with room before any caption. An arrow into a node's
  bottom face ends flush on its caption, so enter another face, or end at an `<Anchor>` 8 to 16 px below the caption.
- **Same-kind boxes, one size.** Two VPCs, two workload accounts, Regions side by side: give them one size from a shared
  constant by wrapping each box's content in a `<ZStack>` with an invisible `<Rect w={W} h={H} stroke="none"
  fill="none" />`. Boxes in one row share a height, in one column a width.
- **Fixed-width cells line up columns.** `<Node>` has no width (it comes from the label), so put each node in a
  `<ZStack>` with an invisible `<Rect w={COL} h={8}>` and nodes line up in columns across groups.
- **Gaps between groups only as wide as their labels need**: 48 to 64 px for one line of arrow label. Every group
  hugs its content with one padding.
- **A 32 px stub before every arrowhead.** The straight run into a head, and the first run out of a node, are at least
  32 px; a bend just above an icon puts the head under the corner.

`check-layout.ts` checks 8 to 12 measure all of this; on a new figure treat their WARNs as must-fix. The thresholds
are in `SKILL.md` ("Compact and even") and [geometry-checks.md](geometry-checks.md).

**Lining up a bare node with a grouped one.** A node inside a group sits below the group's padding and label band. In
a row aligned at the top, the grouped node's icon is 48 px lower than a bare node beside the group; in a centred row
(the Diagram default) the offset is small and depends on the caption heights (4 px for one row of one-line nodes). Put an invisible
`<Rect w={8} h={48}>` (top-aligned) or `h={32}` (centred) above the bare node in a `<VStack gap={0}>`. Caption heights
change the centred case, so measure the icon positions in the SVG after rendering. A `<Rect>` gives height without
width; a `<Spacer>` is square and adds both.

**Reading `off_center`.** The report lists only lopsided groups, measured from the icons. A two-line caption counts as
bottom margin, so `T16/B56` is normal; a large or lopsided L/R pair is real dead space, usually a stray gap or an
absolutely placed child you can pull in.

**Aspect ratio.** Aim for a standard landscape ratio, 4:3 (about 1.33) or 16:9 (about 1.78), the shapes slides,
documents and screens are built for. Treat 1.33 to 1.78 as the target band: a compact figure near 4:3, a wide
left-to-right flow near 16:9. The report's `a4_landscape` flag passes the looser 1.25 to 1.75, so a pass at 1.26 or a
value above 1.8 is still off target. Too tall, or narrower than 4:3: switch a `VStack` to an `HStack` or a `Grid`, add a
tier, or change the `<Diagram layout>`. Wider than 16:9: wrap a long row into a grid or split it over two rows. Past
about 2.5:1 a figure is unreadable at document width (`check-layout.ts` warns).

## Design with a designer's eye

What makes a figure look amateur is dead space, misalignment and mismatched siblings. The primitives prevent all three
when you use them:

- **Alignment comes free inside stacks and grids.** `misaligned` should stay empty. Place things absolutely and you
  own alignment again: put nodes on shared x or y values.
- **Peers look equal.** A `<Grid>` gives siblings equal cells; give peer subnets the same nodes and stacks so they come
  out matched.
- **Whitespace is uniform.** One `gap` per container spaces its children evenly; change the container's `gap` or
  `align` to re-flow the whole set.
- **Labels sit in open lanes.** An arrow label on a group border or an icon gets moved or the group padded
  ([arrows.md](arrows.md)).

Aim for what AWS's own reference architectures look like: compact, landscape, grid-aligned, consistent gaps. Dead space
is the enemy.

## Layout conventions

Good AWS diagrams read left to right or top to bottom, following the request:

- **Users, clients and the internet sit outside and enter from the left**: `<Diagram layout="row">` with the actor
  first. Use the resource glyphs (`Users`, `Internet`, `Client`, `MobileClient` from `resource.js`), light variant only
  (see [icon-catalog.md](icon-catalog.md)).
- **Egress targets go to the right.** The internet or an on-premises site that traffic leaves to sits right of the
  cloud in a `layout="row"`. In a `layout="col"` it lands below and to the left and drags a long backwards arrow across
  the whole canvas.
- **Mix the axes.** A figure built only of `VStack`s (or only of `HStack`s) forces most connectors into one crowded
  lane where they cross. Nest them: an outer stack of tiers along the flow, each tier an inner stack on the other axis
  (an `<HStack>` of tiers each holding a `<VStack>`, or the reverse for a top-down flow). Every arrow between tiers
  then gets its own lane and every arrow inside a tier is a short hop. Keep a single axis for a short linear pipeline.
- **Public and private subnets look different on purpose**: `public-subnet` for internet-facing parts (load balancers,
  NAT gateways, bastions), `private-subnet` for application and data tiers.

## Moving many things at once

- **Re-flow through the container.** Change a Group's or stack's `gap` or `align`, or a Grid's `cols`, and every child
  moves consistently in one edit.
- **`<Move dx dy>`** slides a whole subtree like a dragged selection: each child keeps its normal slot and is then
  displaced, so siblings stay put and nothing resizes. Because the container does not grow, a child nudged too far
  crosses its group's border without any report noticing. When the box should grow, use a measured `<Spacer>` or
  `<Rect>` instead.
