// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Data center migration to AWS: three migration services move three kinds of workload in
// parallel lanes, and all three lanes ride one AWS Direct Connect link.
//
//   VMware servers --replicate--> AWS Transform MGN (staging) --launch--> Amazon EC2 (target)
//   PostgreSQL     --replicate--> AWS DMS (staging)           --load----> Amazon Aurora (target)
//   File share     --copy-------> AWS DataSync (Region)       --write---> Amazon S3 (Region)
//   Corporate Data Center --> AWS Direct Connect --> Region        (one bridge under the lanes)
//   AWS Transform plans and tracks the migration                   (shared box, no arrows)
//
// What it shows:
//  - Parallel lanes. Each source sits on the row of the service that migrates it, so every
//    lane is three nodes on one straight line, and the lanes never cross.
//  - A network path that every lane uses is drawn once, as a bridge under the lanes, not
//    threaded through each lane: Direct Connect hangs below the channel between the two boxes,
//    joined to them by anchors on their bottom borders (no badge or title sits there).
//  - The engine nests four title bands (AWS Cloud, Region, VPC, subnet) above the first AWS
//    node, so the data center is lowered by the difference instead of padding it inside.
//  - Lane 3 sits outside the VPC because AWS DataSync and Amazon S3 are Regional services;
//    blank cells line its nodes up with the subnet columns above.
//  - A shared box placed by meaning: AWS Transform, which plans and tracks the migration, sits
//    beside the VPC, centred between the MGN and DMS lanes, and not beside the DataSync lane.
//  - Lane labels start at the source (labelAt="start"), inside the data center's right
//    padding, so the channel to the AWS Cloud stays narrow and the lane arrows short.
//
// Names and stand-ins:
//  - AWS Application Migration Service was renamed AWS Transform MGN in June 2026. The icon set
//    (April 2026) still carries the old name; the caption uses the current one.
//  - AWS Transform stands where AWS Migration Hub used to: Migration Hub has been closed to new
//    customers since 7 November 2025, and AWS Transform is its recommended successor.
//  - General icons for the on-premises technology: Servers (VMware servers), Database
//    (PostgreSQL), Folders (the NFS file share). The AWS Replication Agent (on each server) and
//    the AWS DataSync agent (a VM beside the share) are named in the source captions.
// Build/verify: npm run render -- assets/examples/migration-to-aws.tsx
import { Diagram, Group, HStack, VStack, ZStack, Node, Arrow, Rect, Anchor } from "../../src/engine.tsx";
import type { Figure } from "../../src/engine.tsx";
import { Servers, Database, Folders } from "../../src/icons/resource.js";
import {
  AWSApplicationMigrationService, AWSDatabaseMigrationService, AWSDataSync, AWSDirectConnect,
  AmazonEC2, AmazonAurora, AmazonSimpleStorageService, AWSTransform,
} from "../../src/icons/service.js";

const BAND = 48;            // 32px title band + 16px padding: where a group's first child starts
const PAD = 16;             // a group's default side padding
const NODE_H = 88;          // a node with a one-line label and a sub line
const DC_CELL_W = 136;      // the data center column, wide enough for "NFS + DataSync agent"
// "Private Subnet (Staging)" needs a 240px box (208px of content). Each AWS cell sits 16px off
// centre towards the other subnet, so a lane's hop between the subnets is one 232px pitch.
const AWS_CELL_W = 144;
const NEAR = 16, FAR = 48;  // blank widths beside a cell: NEAR + AWS_CELL_W + FAR = 208
const TRANSFORM_CELL_W = 136;
const DX_CELL_W = 136;
const SUBNET_GAP = 24;      // staging to target subnet; the hop labels sit inside the staging subnet
const SHARED_GAP = 40;          // VPC to the shared box
const CHANNEL = 72;         // data center to AWS Cloud: only the lane arrows cross it
// Room inside the data center, right of its icons, for the lane labels.
const DC_PAD_RIGHT = 64;
const DC_W = PAD + DC_CELL_W + DC_PAD_RIGHT;
// Lane pitch: lane 2 to lane 3 runs through the DMS node (three caption lines), the staging
// subnet and VPC bottom paddings and LANE3_GAP; lane 1 to lane 2 is NODE_H + ROW_GAP.
const DMS_H = 104;          // the DMS node: a two-line label and a sub line
const LANE3_GAP = 24;       // VPC bottom border to the lane 3 icons
const ROW_GAP = DMS_H + 2 * PAD + LANE3_GAP - NODE_H; // 72: both lane pitches are 160
// The first AWS icon sits four bands down (AWS Cloud, Region, VPC, subnet), the first data
// center icon one band down: lower the data center by the other three.
const DC_DROP = 3 * BAND;
// Lane 3 cells line up with the subnet columns: VPC and subnet padding and the staging cell's
// lead before DataSync; the staging cell's tail, both subnet paddings, the subnet gap and the
// target cell's lead before S3.
const LANE3_LEAD = 2 * PAD + FAR;
const LANE3_MID = NEAR + PAD + SUBNET_GAP + PAD + NEAR;
// The target subnet holds two one-line nodes, the staging subnet a three-line DMS node: pad the
// target subnet's bottom so the two subnets share one height.
const TARGET_PAD_BOTTOM = PAD + 16;
// AWS Transform's icon sits halfway between the MGN and DMS icons: BAND + BAND to the MGN icon,
// plus half a lane pitch, minus the shared box's own BAND.
const TRANSFORM_DROP = BAND + (NODE_H + ROW_GAP) / 2;
// The bridge: Direct Connect is centred under the channel, its icon 8px below the AWS Cloud box.
const BRIDGE_GAP = 8;
const DX_LEAD = DC_W + CHANNEL / 2 - DX_CELL_W / 2;
// Anchors on the two bottom borders (layout coordinates): the data center's bottom 32px in from
// its right corner, and the Region's bottom 32px in from its left corner. Both bottoms sit at
// DC_DROP + the data center's height; re-read them from the SVG after any change above.
const BOTTOM_Y = DC_DROP + BAND + 3 * NODE_H + 2 * ROW_GAP + PAD;
const DC_OUT_X = DC_W - 32;
const REGION_IN_X = DC_W + CHANNEL + PAD + 32;

// An invisible box: it takes up room like any element, so it spaces things exactly.
const invisible = (w: number, h: number) => <Rect w={w} h={h} stroke="none" fill="none" />;
// Centre a node in a cell `w` wide, so the nodes of one column line up.
const cell = (node: Figure, w: number) => <ZStack>{invisible(w, 8)}{node}</ZStack>;
const dcCell = (node: Figure) => cell(node, DC_CELL_W);
// A subnet cell with blank room on both sides: `lead` px before it, `tail` px after it.
const awsCell = (node: Figure, lead: number, tail: number) => (
  <HStack gap={0} align="start">{invisible(lead, 8)}{cell(node, AWS_CELL_W)}{invisible(tail, 8)}</HStack>
);
const stagingCell = (node: Figure) => awsCell(node, FAR, NEAR);   // pushed right, towards Target
const targetCell = (node: Figure) => awsCell(node, NEAR, FAR);    // pushed left, towards Staging
// Lower `child` by `h` px.
const lowered = (h: number, child: Figure) => (
  <VStack gap={0} align="start">{invisible(8, h)}{child}</VStack>
);

export default (
  <Diagram title="Data Center Migration to AWS"
    subtitle="Servers, a database and file shares move to AWS in three parallel lanes over one AWS Direct Connect link"
    layout="col" gap={BRIDGE_GAP} align="start">
    <HStack gap={CHANNEL} align="start">
      {lowered(DC_DROP,
        <Group kind="datacenter" id="corporate-data-center" label="Corporate Data Center" layout="col"
          gap={ROW_GAP} padRight={DC_PAD_RIGHT}>
          {dcCell(<Node id="servers" icon={Servers} label="VMware servers" sub="replication agent" />)}
          {dcCell(<Node id="db" icon={Database} label="PostgreSQL" sub="source database" />)}
          {dcCell(<Node id="share" icon={Folders} label="File share" sub="NFS + DataSync agent" />)}
        </Group>)}

      <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud">
        <Group kind="region" id="region" label="Region: us-east-1" layout="col" gap={LANE3_GAP} align="start">
          <HStack gap={SHARED_GAP} align="start">
            <Group kind="vpc" id="vpc" label="VPC" gap={SUBNET_GAP} align="start">
              <Group kind="private-subnet" id="staging-subnet" label="Private Subnet (Staging)" layout="col" gap={ROW_GAP}>
                {stagingCell(<Node id="mgn" icon={AWSApplicationMigrationService} label="AWS Transform MGN"
                  sub="replication servers" />)}
                {stagingCell(<Node id="dms" icon={AWSDatabaseMigrationService} label={"AWS Database\nMigration Service"}
                  sub="replication instance" />)}
              </Group>
              <Group kind="private-subnet" id="target-subnet" label="Private Subnet (Target)" layout="col" gap={ROW_GAP}
                padBottom={TARGET_PAD_BOTTOM}>
                {targetCell(<Node id="ec2" icon={AmazonEC2} label="Amazon EC2" sub="cutover instances" />)}
                {targetCell(<Node id="aurora" icon={AmazonAurora} label="Amazon Aurora" sub="PostgreSQL-compatible" />)}
              </Group>
            </Group>
            {lowered(TRANSFORM_DROP,
              <Group kind="generic" id="shared-services" label="Shared services">
                {cell(<Node id="transform" icon={AWSTransform} label="AWS Transform" sub="plans and tracks" />,
                  TRANSFORM_CELL_W)}
              </Group>)}
          </HStack>
          <HStack gap={0} align="start">
            {invisible(LANE3_LEAD, 8)}
            {cell(<Node id="datasync" icon={AWSDataSync} label="AWS DataSync" sub="transfer task" />, AWS_CELL_W)}
            {invisible(LANE3_MID, 8)}
            {cell(<Node id="s3" icon={AmazonSimpleStorageService} label="Amazon S3" sub="migrated files" />, AWS_CELL_W)}
          </HStack>
        </Group>
      </Group>
    </HStack>

    {/* The bridge row: Direct Connect under the channel. */}
    <HStack gap={0} align="start">
      {invisible(DX_LEAD, 8)}
      {cell(<Node id="dx" icon={AWSDirectConnect} label="AWS Direct Connect" sub="private connection" />, DX_CELL_W)}
    </HStack>

    {/* The three lanes: each source straight into the service that migrates it. */}
    <Arrow id="a-servers" from="servers" to="mgn" labelAt="start">replicate</Arrow>
    <Arrow id="a-db" from="db" to="dms" labelAt="start">replicate</Arrow>
    <Arrow id="a-files" from="share" to="datasync" labelAt="start">copy</Arrow>
    {/* Inside AWS the labels start at the source too, inside the staging subnet, clear of the
        narrow gap between the two subnets. */}
    <Arrow id="a-launch" from="mgn" to="ec2" labelAt="start">launch</Arrow>
    <Arrow id="a-load" from="dms" to="aurora" labelAt="start">load</Arrow>
    <Arrow id="a-write" from="datasync" to="s3" labelAt="start">write</Arrow>
    {/* The bridge: down out of the data center, through Direct Connect, up into the Region. */}
    <Anchor id="dc-out" x={DC_OUT_X} y={BOTTOM_Y} />
    <Anchor id="region-in" x={REGION_IN_X} y={BOTTOM_Y} />
    <Arrow id="a-dx-in" from="dc-out" to="dx" fromSide="bottom" toSide="left" />
    <Arrow id="a-dx-out" from="dx" to="region-in" fromSide="right" toSide="bottom" />
  </Diagram>
);
