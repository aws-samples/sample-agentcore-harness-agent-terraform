// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Multi-Region active-active for disaster recovery: two full Region stacks behind one
// global edge, with each data store replicated across Regions. Short italic labels on
// the connectors name each hop.
//
//   Users -> [ Route 53 -> Global Accelerator ]       (the global edge, on top)
//                                  |
//              +-------------------+-------------------+
//              v (into the us-east-1 ALB)              v (into the us-west-2 ALB)
//   each Region: ALB -> EKS -> Aurora -> DynamoDB -> S3
//   across Regions: Aurora global database, DynamoDB global table, S3 replication
//
// What it shows:
//  - Fan a hub into two tall columns from above. The global edge is a band over the
//    two side-by-side Regions, so its arrows drop straight down instead of cutting
//    across a Region.
//  - Enter a Region without crossing its title. A Region's title sits right above its
//    first node, so Global Accelerator drops down the lane between the Regions and
//    turns into the side of each ALB rather than its top.
//  - Chain neighbours, do not fan. Each arrow inside a Region joins two adjacent
//    nodes, so it is a short segment that never pierces the node between; one arrow
//    from EKS to every store would run straight through Aurora and DynamoDB. The data
//    tier reads as a pipeline: EKS -> Aurora -> DynamoDB -> S3.
// Build/verify: npm run watch -- assets/examples/multi-region-dr.tsx
import { Diagram, Group, HStack, VStack, Node, Arrow, Spacer } from "../../src/engine.tsx";
import { Users } from "../../src/icons/resource.js";
import {
  AmazonRoute53, AWSGlobalAccelerator, ElasticLoadBalancing, AmazonElasticKubernetesService,
  AmazonAurora, AmazonDynamoDB, AmazonSimpleStorageService,
} from "../../src/icons/service.js";

const ACTOR_GAP = 48;
// Lowers Users level with Route 53, so the resolve hop is one straight line that
// enters the AWS Cloud below its badge and title. A Spacer rather than a <Move>: it is
// measured, so the canvas keeps room for the Users caption.
const USERS_DROP = 96;
const EDGE_TO_REGIONS_GAP = 40;
const EDGE_GAP = 40;
const REGION_LANE = 64; // between the two Regions: Global Accelerator's arrows drop through it
const TIER_GAP = 24;
// The stores replicated across Regions, top to bottom.
const REPLICATED = ["aurora", "ddb", "s3"];

// One Region's full stack. Its node ids are `${prefix}-alb`, `${prefix}-eks` and so on.
const regionStack = (prefix: string, label: string) => (
  <Group kind="region" id={prefix} label={label} layout="col" gap={TIER_GAP}>
    <Node id={`${prefix}-alb`} icon={ElasticLoadBalancing} label="Application Load Balancer" />
    <Node id={`${prefix}-eks`} icon={AmazonElasticKubernetesService} label="Amazon EKS" sub="app pods" />
    <Node id={`${prefix}-aurora`} icon={AmazonAurora} label="Amazon Aurora" sub="cluster" />
    <Node id={`${prefix}-ddb`} icon={AmazonDynamoDB} label="Amazon DynamoDB" sub="global table" />
    <Node id={`${prefix}-s3`} icon={AmazonSimpleStorageService} label="Amazon S3" sub="assets" />
  </Group>
);

export default (
  <Diagram title="Multi-Region Active-Active (DR)" layout="row" gap={ACTOR_GAP} align="start">
    <VStack gap={0}>
      <Spacer size={USERS_DROP} />
      <Node id="users" icon={Users} label="Users" sub="global" />
    </VStack>

    {/* The AWS Cloud is a column: the global edge over the two Regions. */}
    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="col" gap={EDGE_TO_REGIONS_GAP} align="start">
      <Group kind="generic" id="global-edge" label="Global edge" gap={EDGE_GAP}>
        <Node id="dns" icon={AmazonRoute53} label="Amazon Route 53" sub="latency + health" />
        <Node id="gax" icon={AWSGlobalAccelerator} label="AWS Global Accelerator" />
      </Group>

      <HStack gap={REGION_LANE} align="start">
        {regionStack("e", "Region: us-east-1")}
        {regionStack("w", "Region: us-west-2")}
      </HStack>
    </Group>

    <Arrow id="a-dns" from="users" to="dns" fromSide="right" toSide="left" labelAt="start">resolve</Arrow>
    <Arrow id="a-gax" from="dns" to="gax">route</Arrow>
    {/* Down the lane between the Regions, then sideways into each ALB. */}
    <Arrow id="a-e-alb" from="gax" to="e-alb" fromSide="bottom" toSide="right" />
    <Arrow id="a-w-alb" from="gax" to="w-alb" fromSide="bottom" toSide="left" />
    {/* Down each Region, neighbour to neighbour. */}
    <Arrow id="a-e-eks" from="e-alb" to="e-eks">balance</Arrow>
    <Arrow from="e-eks" to="e-aurora" />
    <Arrow from="e-aurora" to="e-ddb" />
    <Arrow from="e-ddb" to="e-s3" />
    <Arrow from="w-alb" to="w-eks" />
    <Arrow from="w-eks" to="w-aurora" />
    <Arrow from="w-aurora" to="w-ddb" />
    <Arrow from="w-ddb" to="w-s3" />
    {/* Replication between the aligned data tiers: dashed and two-way. */}
    {REPLICATED.map((store) => (
      <Arrow id={`a-repl-${store}`} from={`e-${store}`} to={`w-${store}`} fromSide="right" toSide="left" head="both" dashed>
        replicate
      </Arrow>
    ))}
  </Diagram>
);
