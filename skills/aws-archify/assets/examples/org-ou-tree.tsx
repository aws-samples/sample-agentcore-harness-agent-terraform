// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// AWS Organizations OU structure as a top-down tree: the organizational units that the AWS whitepaper
// "Organizing Your AWS Environment Using Multiple Accounts" recommends, with their accounts as leaves.
//
//                  Management account (organization root)
//        +--------------+------------+---------------+----------+
//     Security    Infrastructure  Workloads        Sandbox   Suspended
//     +---+---+     +---+---+      +--+---+           |
//    Log    Security Network Shared Prod  Test     Developer A
//    Archive Tooling       Services  |     |
//                                Workload A  Workload A
//                                   prod        test
//
// The tree recipe (copy it for any hierarchy: OU trees, account trees, IPAM pool trees):
//  - Explicit x/y on a grid of rows. A node's place is (h, r): h counts half leaf slots across, r counts
//    levels down. cx(h) is its icon centre and top(r) its icon top; every node sits in a fixed-width cell
//    (an invisible <Rect> in a <ZStack>), so its icon centre is exactly the cell centre and on the 8 px grid.
//  - Parents are centred over their children: a parent's h is the midpoint of its first and last child
//    (Security 3 over its accounts at 2 and 4, the root 10 over Security 3 and Suspended 17). Leaves sit two
//    halves (128 px) apart. The childless Suspended OU and the one-child Sandbox OU are spaced so each row
//    keeps an even pitch and the root lands on a column below it: the report flags an icon that shares no
//    row or column with another one in its group.
//  - Trunk, bus and drops are <Arrow points head="none" /> lines in layout coordinates: a trunk from just
//    under the parent's caption down to the bus, the bus across, a drop into each child stopping GAP above
//    its icon. One line per edge, plus the root's trunk, so lines never outnumber nodes:
//      trunk + branch()  the root's bus is chained junction to junction (one L per child), so no straight run
//                        is longer than one sibling gap; a single 900 px bus reads as a stretched arrow.
//      trunk + pair()    two children under a parent: one drop-bus-drop line.
//      single()          a lone child: one straight line.
//  - Parent captions stay at two lines (label and sub). A third line runs past CAPTION_END into the trunk
//    (an arrow through text), and raising CAPTION_END instead eats the trunk: at a 144 px row it has no
//    length left and silently disappears.
//
// Boxes: the tree carries the hierarchy, so OUs are never boxes around their accounts. The two boxes are
// the ones AWS draws in the whitepaper's own figure: the organization (a service-pink AWS Organizations
// group, one service and its own parts) and the dashed "Foundational OUs" category (Security and
// Infrastructure). A bare tree leaves its canvas about 73% empty, which fails the whitespace check; inside
// these two boxes it does not. Nodes inside a group take x/y relative to that group's content box, while
// lines are always layout coordinates, so the scene converts once, in cellAt(), from named origins.
//
// Naming: the resource glyphs carry their resource name as the label (Management account, OU, Account)
// and the OU's or account's own name as the sub, the same split as a service's name and its role. Where
// SCPs attach is left to the text around the figure: the sub line already holds the name, and a third
// line under a parent is what the recipe above rules out.
// Facts (AWS docs): the root lives in the management account; Control Tower names the Security Tooling
// account "Audit"; the whitepaper's Workloads example nests a Prod and a Test OU.
// Build/verify: npm run render -- assets/examples/org-ou-tree.tsx /tmp/org-ou-tree.svg
import { Diagram, Group, ZStack, Node, Arrow, Rect } from "../../src/engine.tsx";
import type { Figure, Pt } from "../../src/engine.tsx";
import { AWSOrganizations } from "../../src/icons/service.js";
import {
  AWSOrganizationsAccount, AWSOrganizationsManagementAccount, AWSOrganizationsOrganizationalUnit,
} from "../../src/icons/resource.js";

const HALF = 64;  // half a leaf slot: leaves sit 128 px apart, centre to centre
const X0 = -32;   // puts the first leaf's cell (h = 2) flush with the Foundational OUs content edge
const CELL = 112; // default cell width, a multiple of 16 so a centred icon lands on the 8 px grid
const ROOT_CELL = 144;      // "Management account" is wider than the default cell
const LOG_ARCHIVE_CELL = 128; // widens the band's left edge so the Security drop clears its title by 12 px+
const PAD = 16;   // a group's padding
const BAND = 32;  // a group's title band
const CAPTION_END = 88; // a two-line caption ends 85 px under its icon top; the trunk starts just below it
const TRUNK = 24;       // caption to bus
const DROP = 32;        // bus to child: the 32 px straight run the elbow-stub check asks for
const GAP = 8;          // a line stops this far above a child icon, like an id-attached arrow
const BUS_CLEAR = 16;   // the root's bus runs this far above the Foundational OUs border, not on it
const ROW = CAPTION_END + TRUNK + DROP + GAP; // icon top to icon top between levels

const ROOT_TOP = BAND + PAD; // the organization box sits at the layout origin
// The first OU row sits under the root's trunk and bus and under the Foundational OUs band and padding.
const OU_TOP = ROOT_TOP + CAPTION_END + TRUNK + BUS_CLEAR + BAND + PAD;

const cx = (h: number) => X0 + h * HALF;
const top = (r: number) => (r === 0 ? ROOT_TOP : OU_TOP + (r - 1) * ROW);

// Content-box origins, in layout coordinates, of the two groups the nodes sit in.
const ORG = { x: PAD, y: BAND + PAD };
const FOUNDATION_BOX = { x: PAD, y: OU_TOP - BAND - PAD };
const FOUNDATION = { x: FOUNDATION_BOX.x + PAD, y: FOUNDATION_BOX.y + BAND + PAD };

// A node at (h, r), placed in a group whose content box starts at `origin`.
const cellAt = (origin: { x: number; y: number }, h: number, r: number, node: Figure, w = CELL) => (
  <ZStack x={cx(h) - w / 2 - origin.x} y={top(r) - origin.y}>
    <Rect w={w} h={8} stroke="none" fill="none" />
    {node}
  </ZStack>
);
const ouNode = (name: string) => <Node icon={AWSOrganizationsOrganizationalUnit} label="OU" sub={name} />;
const accountNode = (name: string) => <Node icon={AWSOrganizationsAccount} label="Account" sub={name} />;

const line = (points: Pt[]) => <Arrow points={points} head="none" />;
const trunkTop = (r: number) => top(r) + CAPTION_END;
const busY = (r: number) => trunkTop(r) + TRUNK;
const dropEnd = (r: number) => top(r + 1) - GAP;
const trunk = (h: number, r: number) => line([[cx(h), trunkTop(r)], [cx(h), busY(r)]]);
// The bus from the previous junction (fromH) to a child at h, then the drop into it.
const branch = (fromH: number, h: number, r: number) =>
  line([[cx(fromH), busY(r)], [cx(h), busY(r)], [cx(h), dropEnd(r)]]);
const pair = (a: number, b: number, r: number) =>
  line([[cx(a), dropEnd(r)], [cx(a), busY(r)], [cx(b), busY(r)], [cx(b), dropEnd(r)]]);
const single = (h: number, r: number) => line([[cx(h), trunkTop(r)], [cx(h), dropEnd(r)]]);

export default (
  <Diagram title="Multi-account OU structure"
    subtitle="The OUs the AWS multi-account whitepaper recommends, with their accounts, as a top-down tree"
    layout="free">
    <Group kind="service-pink" icon={AWSOrganizations} label="AWS Organizations" layout="free" x={0} y={0}>
      {cellAt(ORG, 10, 0,
        <Node icon={AWSOrganizationsManagementAccount} label="Management account" sub="organization root" />, ROOT_CELL)}

      <Group kind="generic" label="Foundational OUs" layout="free"
        x={FOUNDATION_BOX.x - ORG.x} y={FOUNDATION_BOX.y - ORG.y}>
        {cellAt(FOUNDATION, 3, 1, ouNode("Security"))}
        {cellAt(FOUNDATION, 7, 1, ouNode("Infrastructure"))}
        {cellAt(FOUNDATION, 2, 2, accountNode("Log Archive"), LOG_ARCHIVE_CELL)}
        {cellAt(FOUNDATION, 4, 2, accountNode("Security Tooling"))}
        {cellAt(FOUNDATION, 6, 2, accountNode("Network"))}
        {cellAt(FOUNDATION, 8, 2, accountNode("Shared Services"))}
      </Group>

      {cellAt(ORG, 11, 1, ouNode("Workloads"))}
      {/* Half a slot further out than its neighbours' pitch: it centres the root (10) over the Prod
          column and keeps the empty columns either side of Sandbox about the same width. */}
      {cellAt(ORG, 14.5, 1, ouNode("Sandbox"))}
      {cellAt(ORG, 17, 1, ouNode("Suspended"))}
      {cellAt(ORG, 10, 2, ouNode("Prod"))}
      {cellAt(ORG, 12, 2, ouNode("Test"))}
      {cellAt(ORG, 14.5, 2, accountNode("Developer A"))}
      {cellAt(ORG, 10, 3, accountNode("Workload A prod"))}
      {cellAt(ORG, 12, 3, accountNode("Workload A test"))}
    </Group>

    {trunk(10, 0)}
    {branch(10, 7, 0)}
    {branch(7, 3, 0)}
    {branch(10, 11, 0)}
    {branch(11, 14.5, 0)}
    {branch(14.5, 17, 0)}

    {trunk(3, 1)}{pair(2, 4, 1)}
    {trunk(7, 1)}{pair(6, 8, 1)}
    {trunk(11, 1)}{pair(10, 12, 1)}
    {single(14.5, 1)}

    {single(10, 2)}
    {single(12, 2)}
  </Diagram>
);
