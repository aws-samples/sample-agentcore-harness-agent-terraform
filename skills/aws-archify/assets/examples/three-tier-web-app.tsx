// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Three-tier web application on Amazon EC2, highly available across two Availability
// Zones in one Region: Route 53 and an Application Load Balancer in front, an EC2 Auto
// Scaling group of app servers in the private app subnets of both AZs, and Amazon RDS
// Multi-AZ with Amazon ElastiCache in the private data subnets.
//
//   Users -> Route 53 -> ALB --forward--> [ Auto Scaling group: EC2 x2 (AZ A) | EC2 x2 (AZ B) ]
//                                              | read / write                    | cache
//   AZ A:  ElastiCache replica  RDS primary --synchronous replication--> RDS standby  ElastiCache primary  :AZ B
//   NAT gateways sit in the public subnets of both AZs (outbound internet for the private subnets).
//
// What it shows:
//  - Two Availability Zone columns that line up. Every subnet is one width (two fixed-width
//    cells and a gap), and the public, app and data rows sit in one centred VStack. The
//    Auto Scaling group is 32 px wider than the rows above and below it (its own padding),
//    and centring absorbs that, so AZ A's three subnets share one x and AZ B's another.
//  - An Auto Scaling group spans subnets by being their parent: the `auto-scaling` Group
//    holds the two app subnets, one per AZ, so its dashed box crosses the AZ boundary. The
//    ALB forwards to the group, not to each instance.
//  - Arrows from a group at a chosen point. Anchors 8 px under the group's bottom border
//    (where an id arrow from the group would start) give each app-to-data arrow a straight
//    drop into its target, and the arrow still reads as coming from the whole fleet.
//  - Asymmetric cells pull the nodes beside the middle lane inwards. The outer cell of
//    each subnet is wider than the inner one, so the inner nodes sit next to the AZ lane:
//    the app row's middle gap stays short, and each node an arrow enters from above
//    (RDS primary, ElastiCache primary) sits clear of its subnet's title. The data nodes
//    are mirrored, RDS on the inner side in both AZs, so the replication arrow crosses
//    only the lane between the AZs.
//  - The entry row. Users, Route 53 and the ALB share the top row, and the AZ grid is
//    lowered by GRID_DROP so the NAT gateways form their own row below it: in one row
//    with Users and Route 53, the wide AZ spacing of the NATs would make an uneven pitch.
//    The ALB has a node in each public subnet; it is drawn once, beside the public row,
//    so the hop from Route 53 is one short straight line.
//  - Kept advisories: each public subnet is as wide as the subnets below it, so the AZ
//    columns line up, and its one NAT gateway leaves 128 px of padding on both sides;
//    check-layout reports that as uneven padding (WARN) for both public subnets.
// Stand-ins: none. The ALB is the Elastic Load Balancing service icon (ALB in its sub);
// the NAT gateways are the Amazon VPC NAT gateway resource icon.
// Build/verify: npm run render -- assets/examples/three-tier-web-app.tsx /tmp/three-tier-web-app.svg
import { Diagram, Group, HStack, VStack, ZStack, Node, Arrow, Rect, Anchor } from "../../src/engine.tsx";
import type { Figure } from "../../src/engine.tsx";
import { Users, AmazonVPCNATGateway } from "../../src/icons/resource.js";
import {
  AmazonRoute53, ElasticLoadBalancing, AmazonEC2, AmazonRDS, AmazonElastiCache,
} from "../../src/icons/service.js";

// One subnet is 16 + OUTER_CELL + CELL_GAP + INNER_CELL + 16 = 328 px wide. Half of each
// cell is a multiple of 8, so every node centre lands on the 8 px grid that anchors need.
const OUTER_CELL = 144;
const INNER_CELL = 80;
// Wide enough that the outer cell of AZ B, where ElastiCache primary takes its drop, lies 12 px
// past the end of the subnet's title, as check-layout requires.
const CELL_GAP = 72;
const SUBNET_CONTENT_W = OUTER_CELL + CELL_GAP + INNER_CELL; // the public subnet's single cell
const AZ_LANE = 96;      // between the AZ columns: room for the two-line replication label
const ALB_TO_GRID = 8;  // the ALB's column to the Auto Scaling group: the "forward" hop
// Lowers the AZ grid until the NAT gateways' row starts below the ALB's caption.
const GRID_DROP = 88;
const PUB_TO_ASG = 24;   // public subnets to the Auto Scaling group
const ASG_TO_DATA = 32;  // room for the two labels under the Auto Scaling group
const DNS_GAP = 48;      // Route 53 to the Region: room for "route"
const USERS_GAP = 72;    // Users to the AWS Cloud: room for "resolve"
// Lower Route 53 and Users onto the ALB's row: the Region and VPC bands (48 + 48), plus
// the AWS Cloud band (48) for Users, who sit outside it.
const DNS_DROP = 96;
const USERS_DROP = 144;
// Where the two app-to-data arrows leave the Auto Scaling group: layout coordinates read
// from the SVG (the group's bottom border is at y 608, the two targets' centres at x 664
// and 1056). Re-measure them after any change to the sizes above.
const ASG_EXIT_Y = 616;
const RDS_PRIMARY_X = 664;
const CACHE_PRIMARY_X = 1056;

const invisible = (w: number, h: number) => <Rect w={w} h={h} stroke="none" fill="none" />;
// Centre a node in a cell `w` wide.
const cell = (node: Figure, w: number) => <ZStack>{invisible(w, 8)}{node}</ZStack>;
// Lower `child` by `h` px.
const lowered = (h: number, child: Figure) => (
  <VStack gap={0} align="center">{invisible(8, h)}{child}</VStack>
);
// A subnet's two cells, outer first in AZ A and inner first in AZ B: the inner node of
// both AZs sits beside the lane between them.
const pair = (az: "A" | "B", outer: Figure, inner: Figure) =>
  az === "A"
    ? [cell(outer, OUTER_CELL), cell(inner, INNER_CELL)]
    : [cell(inner, INNER_CELL), cell(outer, OUTER_CELL)];

const publicSubnet = (az: "A" | "B") => (
  <Group kind="public-subnet" id={`public-subnet-${az.toLowerCase()}`} label={`Public Subnet (AZ ${az})`}>
    {cell(<Node id={`nat-${az.toLowerCase()}`} icon={AmazonVPCNATGateway} label="NAT gateway" />, SUBNET_CONTENT_W)}
  </Group>
);
const appServer = (id: string) => <Node id={id} icon={AmazonEC2} label="Amazon EC2" sub="app server" />;
const appSubnet = (az: "A" | "B") => (
  <Group kind="private-subnet" id={`app-subnet-${az.toLowerCase()}`} label={`Private Subnet (App, AZ ${az})`}
    gap={CELL_GAP}>
    {pair(az, appServer(`ec2-${az.toLowerCase()}-outer`), appServer(`ec2-${az.toLowerCase()}-inner`))}
  </Group>
);
const dataSubnet = (az: "A" | "B", outer: Figure, inner: Figure) => (
  <Group kind="private-subnet" id={`data-subnet-${az.toLowerCase()}`} label={`Private Subnet (Data, AZ ${az})`}
    gap={CELL_GAP}>
    {pair(az, outer, inner)}
  </Group>
);

export default (
  <Diagram title="Three-Tier Web Application (Multi-AZ)"
    subtitle="An Application Load Balancer spreads requests over an EC2 Auto Scaling group in two Availability Zones, backed by RDS Multi-AZ and ElastiCache"
    layout="row" gap={USERS_GAP} align="start">
    {lowered(USERS_DROP, <Node id="users" icon={Users} label="Users" />)}

    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="row" gap={DNS_GAP} align="start">
      {/* Two-line captions keep Route 53's and the ALB's columns narrow: the canvas stays under 1280 px. */}
      {lowered(DNS_DROP, <Node id="dns" icon={AmazonRoute53} label={"Amazon\nRoute 53"} sub="DNS" />)}

      <Group kind="region" id="region-us-east-1" label="Region: us-east-1">
        <Group kind="vpc" id="vpc" label="VPC" layout="row" gap={ALB_TO_GRID} align="start">
          <Node id="alb" icon={ElasticLoadBalancing} label={"Elastic Load\nBalancing"} sub="ALB" />
          {lowered(GRID_DROP,
            <VStack gap={0} align="center">
              <HStack gap={AZ_LANE}>{publicSubnet("A")}{publicSubnet("B")}</HStack>
              {invisible(8, PUB_TO_ASG)}
              <Group kind="auto-scaling" id="asg" label="Auto Scaling Group" gap={AZ_LANE}>
                {appSubnet("A")}{appSubnet("B")}
              </Group>
              {invisible(8, ASG_TO_DATA)}
              <HStack gap={AZ_LANE}>
                {dataSubnet("A",
                  <Node id="cache-replica" icon={AmazonElastiCache} label="Amazon ElastiCache" sub="replica" />,
                  <Node id="rds-primary" icon={AmazonRDS} label="Amazon RDS" sub="primary" />)}
                {dataSubnet("B",
                  <Node id="cache-primary" icon={AmazonElastiCache} label="Amazon ElastiCache" sub="primary" />,
                  <Node id="rds-standby" icon={AmazonRDS} label="Amazon RDS" sub="standby" />)}
              </HStack>
            </VStack>)}
        </Group>
      </Group>
    </Group>

    <Anchor id="asg-to-db" x={RDS_PRIMARY_X} y={ASG_EXIT_Y} />
    <Anchor id="asg-to-cache" x={CACHE_PRIMARY_X} y={ASG_EXIT_Y} />

    {/* The entry row: each hop is straight because the three icons share one row. */}
    <Arrow from="users" to="dns" labelAt="start">resolve</Arrow>
    <Arrow from="dns" to="alb" labelAt="start">route</Arrow>
    {/* Down the ALB's column and into the side of the group, below its title. The label
        rides the long vertical run, in the open space left of the public subnet. */}
    <Arrow from="alb" to="asg" fromSide="bottom" toSide="left" labelAt="start" labelSide="right">forward</Arrow>
    {/* The fleet to the data tier: straight drops, labels just under the group. */}
    <Arrow from="asg-to-db" to="rds-primary" toSide="top" labelAt="start" labelSide="right">read / write</Arrow>
    <Arrow from="asg-to-cache" to="cache-primary" toSide="top" labelAt="start" labelSide="right">cache</Arrow>
    {/* Multi-AZ: the primary copies every write to the standby in the other AZ. */}
    <Arrow from="rds-primary" to="rds-standby" fromSide="right" toSide="left" dashed>
      {"synchronous\nreplication"}
    </Arrow>
  </Diagram>
);
