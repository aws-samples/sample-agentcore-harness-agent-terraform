// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// AI-native trading platform, redrawn from a reference diagram. It spans two Regions,
// and its agents are managed infrastructure rather than containers: an Amazon Bedrock
// AgentCore fleet runs the research and analysis agents in us-east-1, beside the global
// edge, and calls Amazon Bedrock models in that same Region. The trading workload
// (ECS on EC2 and Aurora) runs in a VPC in ap-southeast-1. Inference stays in-Region,
// which is why there is no NAT gateway and no public subnet: nothing in the VPC needs a
// way out to another Region.
//
// Two stacked Region bands, each hugging its contents, with the request path in one
// column so every one-to-one hop shares a row or a column:
//   Users | WAF -> CloudFront -> S3                 (the top row of us-east-1)
//   CloudFront | ALB | Amazon EC2 (Coordinator) | Aurora   (one column)
//   AgentCore -> Bedrock along one row, the arrow leaving the fleet's Group box
//
// What it shows:
//  - Arrows from a group box keep the count down. Links shared by a whole fleet or
//    cluster start on its Group, not on one member: 16 arrows for 24 nodes.
//  - Cross-band arrows run in lanes that clear every group title. The cluster's links
//    to KMS, SQS and the agent fleet share one trunk in the narrow lane between
//    Regional services and the VPC; ALB -> Cognito climbs outside the cloud's right
//    edge. An arrow into a wide group enters from below, since from the side it would
//    tunnel through the member tiles.
//  - <Anchor>s carry what a face cannot: one on the fleet box's border for a straight
//    InvokeModel, one 16px under Cognito's caption to keep the arrowhead off the text,
//    and one on the cluster box's bottom border so the venue link leaves the cluster,
//    not one task. Anchor x/y are layout coordinates: re-measure after a change.
//  - Invisible boxes, never <Move>, for offsets inside a group: a Move is not measured,
//    so the group hugs the unmoved position and the moved node crosses its border.
//
// Arrow colours follow the reference's own key: blue for the in-VPC request path,
// purple for AgentCore invocations, gray for async, outbound and external links.
// Build/verify: npm run watch -- assets/examples/ai-native-trading.tsx
import { Diagram, Group, HStack, VStack, ZStack, Node, Arrow, Rect, Anchor } from "../../src/engine.tsx";
import type { Figure } from "../../src/engine.tsx";
import {
  AWSWAF, AmazonCloudFront, AmazonSimpleStorageService, AmazonCognito,
  AmazonBedrockAgentCore, AmazonBedrock, AmazonEC2, AmazonAurora,
  AWSKeyManagementService, AmazonElasticContainerRegistry, AmazonSimpleQueueService,
  AmazonCloudWatch, AmazonEventBridge, AWSLambda,
} from "../../src/icons/service.js";
import {
  Users, InternetAlt1, ElasticLoadBalancingApplicationLoadBalancer,
} from "../../src/icons/resource.js";

const BLUE = "#0972D3";   // the in-VPC request path
const PURPLE = "#8C4FFF"; // AgentCore invocations
const GRAY = "#5A6B86";   // async, outbound and external
const INK = "#232F3E";    // the engine's default arrow colour, set explicitly on one arrow

const CELL_W = 160; // every node is centred in a cell this wide, so the columns line up
const BAND_GAP = 40;
const ROW_GAP = 48;
const TILE_GAP = 24;
// The us-east-1 band is indented and its edge row starts with a blank; together they
// put CloudFront's centre over the ALB, the Coordinator and Aurora.
const REGION_INDENT = 88;
const EDGE_LEAD = 296;
const ALB_LEAD = 216;   // the ALB, in its own strip, over the Coordinator
const USERS_X = 448;    // Users over WAF
const EXCHANGE_X = 840; // the external venue under the cluster's UserTask column
// Widens the fleet -> Bedrock hop so the InvokeModel label has a stub to sit on.
const INVOKE_ROOM = 32;
// Bedrock and Cognito drop one title band, onto the fleet's first icon row.
const FLEET_ROW_DROP = 48;
// Regional services drops 32px so its rows stay off the ALB's row (on it, ECR and
// EventBridge read as part of one row with a wide hole) and its bottom row sits across
// from the cluster box, so the two blocks read as one band.
const REGIONAL_DROP = 32;
// Layout coordinates for the three anchors and the risers.
const FLEET_OUT = { x: 712, y: 384 };      // on the fleet box's right border, Bedrock's icon row
const UNDER_COGNITO = { x: 1104, y: 464 }; // Cognito's centre, 16px under its caption
const VENUE_OUT = { x: 920, y: 1072 };     // the cluster box's bottom border, under UserTask
const COGNITO_RISER = 1104; // outside the AWS Cloud's right edge
const TRUNK_X = 408;        // the lane between Regional services and the VPC
const KMS_TURN_X = 400;     // one cell before the trunk, so KMS's short jog is its own

// The managed agents, wrapped three to a row.
const AGENTS = [
  { id: "news-collect", role: "NewsCollector · 5-min" },
  { id: "news-process", role: "NewsProcessor" },
  { id: "research", role: "ResearchAgent" },
  { id: "analyzer", role: "MarketAnalyzer · hourly" },
  { id: "lesson", role: "LessonAgent · daily" },
  { id: "code-interp", role: "Code Interpreter" },
];

const blank = (w: number, h = 8) => <Rect w={w} h={h} stroke="none" fill="none" />;
const cell = (node: Figure) => <ZStack>{blank(CELL_W)}{node}</ZStack>;
// A cell lowered by `h`, onto the row it connects to.
const lowered = (h: number, node: Figure) => <VStack gap={0} align="center">{blank(8, h)}{cell(node)}</VStack>;
// A cell pushed `x` px right, inside the diagram's left-aligned column.
const atX = (x: number, node: Figure) => <HStack gap={0} align="start">{blank(x)}{cell(node)}</HStack>;
const agent = (id: string, role: string) =>
  cell(<Node id={id} icon={AmazonBedrockAgentCore} label="Amazon Bedrock AgentCore" sub={role} />);

export default (
  <Diagram title="AI-Native Trading Platform — AWS Infrastructure"
    subtitle="Managed agents and the global edge in us-east-1, the trading workload in a private VPC in ap-southeast-1"
    layout="col" gap={BAND_GAP} align="start">
    {atX(USERS_X, <Node id="users" icon={Users} label="Users" sub="web / app clients" />)}

    {/* us-east-1: the global edge and the managed agent fleet. */}
    <HStack gap={0} align="start">
      {blank(REGION_INDENT)}
      <Group kind="region" id="edge-region" label="Region: us-east-1" layout="col" gap={ROW_GAP} align="start">
        <HStack gap={ROW_GAP} align="start">
          {blank(EDGE_LEAD)}
          {cell(<Node id="waf" icon={AWSWAF} label="AWS WAF" sub="WebACL" />)}
          {cell(<Node id="cdn" icon={AmazonCloudFront} label="Amazon CloudFront" sub="CDN + VPC origin" />)}
          {cell(<Node id="s3" icon={AmazonSimpleStorageService} label="Amazon S3" sub="frontend dist" />)}
        </HStack>
        <HStack gap={ROW_GAP} align="start">
          {/* A 3x2 grid, not one row: as one row the fleet would be about 1200px wide,
              pushing the canvas past a page width. The band has height to spare. */}
          <Group kind="generic" id="agentcore" label="Amazon Bedrock AgentCore" layout="grid" cols={3} gap={TILE_GAP}>
            {AGENTS.map(({ id, role }) => agent(id, role))}
          </Group>
          {blank(INVOKE_ROOM)}
          {/* Beside the fleet, not under it: under it, Bedrock would sit in the lane the
              cluster's arrow uses to enter the fleet from below. On the fleet's first
              icon row, InvokeModel runs straight out of the box. */}
          <HStack gap={TILE_GAP} align="start">
            {lowered(FLEET_ROW_DROP,
              <Node id="bedrock" icon={AmazonBedrock} label="Amazon Bedrock" sub="Claude models" />)}
            {lowered(FLEET_ROW_DROP,
              <Node id="cognito" icon={AmazonCognito} label="Amazon Cognito" sub="JWT / OAuth 2.0" />)}
          </HStack>
        </HStack>
      </Group>
    </HStack>

    {/* ap-southeast-1: the trading workload. */}
    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud — ap-southeast-1" layout="row" gap={32} align="start">
      {/* Regional services, outside the VPC. Its right column holds everything the
          cluster and the fleet connect to, so those arrows stay short. */}
      <VStack gap={0} align="start">
        {blank(8, REGIONAL_DROP)}
        <Group kind="generic" id="regional" label="Regional services" layout="row" gap={TILE_GAP} align="start">
          <VStack gap={TILE_GAP}>
            {cell(<Node id="ecr" icon={AmazonElasticContainerRegistry} label="Amazon ECR" sub="container images" />)}
            {cell(<Node id="cw" icon={AmazonCloudWatch} label="Amazon CloudWatch" sub="logs · metrics" />)}
            {cell(<Node id="lambda" icon={AWSLambda} label="AWS Lambda" sub="SchemaMigration" />)}
          </VStack>
          <VStack gap={TILE_GAP}>
            {cell(<Node id="events" icon={AmazonEventBridge} label="Amazon EventBridge" sub="news · market · lesson" />)}
            {cell(<Node id="sqs" icon={AmazonSimpleQueueService} label="Amazon SQS" sub="pipeline events" />)}
            {cell(<Node id="kms" icon={AWSKeyManagementService} label="AWS KMS" sub="exchange key" />)}
          </VStack>
        </Group>
      </VStack>

      <Group kind="vpc" id="vpc" label="VPC (2 AZs · VPC endpoints)" layout="col" gap={56} align="start">
        {/* The ALB beside the subnets, in a strip of its own: as a member of the
            private subnet it would line up with neither of its neighbours. */}
        <HStack gap={0} align="start">
          {blank(ALB_LEAD)}
          {cell(<Node id="alb" icon={ElasticLoadBalancingApplicationLoadBalancer}
            label="Elastic Load Balancing" sub="internal ALB" />)}
        </HStack>
        <Group kind="private-subnet" id="private-subnet" label="Private Subnet" layout="col" gap={ROW_GAP} align="center">
          <Group kind="generic" id="ecs" label="ECS EC2 Cluster" layout="row" gap={TILE_GAP}>
            {cell(<Node id="ingester" icon={AmazonEC2} label="Amazon EC2" sub="MarketIngester" />)}
            {cell(<Node id="coordinator" icon={AmazonEC2} label="Amazon EC2" sub="Coordinator" />)}
            {cell(<Node id="usertask" icon={AmazonEC2} label="Amazon EC2" sub="UserTask" />)}
          </Group>
          {cell(<Node id="aurora" icon={AmazonAurora} label="Amazon Aurora" sub="Serverless v2" />)}
        </Group>
      </Group>
    </Group>

    {atX(EXCHANGE_X, <Node id="exchange" icon={InternetAlt1} label="Exchange" sub="REST API · WebSocket" />)}

    {/* The request path (blue), straight down the one column. */}
    <Arrow from="users" to="waf" fromSide="bottom" toSide="top" labelAt="start" color={BLUE}>HTTPS</Arrow>
    <Arrow from="waf" to="cdn" color={BLUE} />
    <Arrow from="cdn" to="alb" fromSide="bottom" toSide="top" labelAt="middle" labelSide="right" color={BLUE}>HTTPS</Arrow>
    <Arrow from="alb" to="coordinator" fromSide="bottom" toSide="top" color={BLUE} />

    {/* AgentCore invocations (purple). The whole fleet calls Bedrock, in-Region, so the
        arrow leaves the fleet's box, from an anchor on its border at Bedrock's icon row:
        one straight line rather than a 12px staircase. */}
    <Arrow from="news-collect" to="news-process" color={PURPLE} />
    <Anchor id="fleet-out" x={FLEET_OUT.x} y={FLEET_OUT.y} />
    <Arrow from="fleet-out" to="bedrock" color={PURPLE}>InvokeModel</Arrow>

    {/* Async, outbound and external (gray). */}
    <Arrow from="cdn" to="s3" dashed color={GRAY}>origin (OAC)</Arrow>
    {/* Ends 16px under Cognito's caption; a bottom-face arrow would end flush under the
        text, with the arrowhead pressed against it. */}
    <Anchor id="cognito-in" x={UNDER_COGNITO.x} y={UNDER_COGNITO.y} />
    <Arrow from="alb" to="cognito-in" fromSide="right" riser={COGNITO_RISER} color={GRAY}>JWT verify</Arrow>
    <Arrow from="ecs" to="kms" fromSide="left" toSide="right" riser={KMS_TURN_X} labelAt="end" color={GRAY}>decrypt</Arrow>
    <Arrow from="ecs" to="sqs" fromSide="left" toSide="right" riser={TRUNK_X} labelAt="end" color={GRAY}>events</Arrow>
    <Arrow from="events" to="sqs" dashed color={GRAY} />
    <Arrow from="lambda" to="aurora" fromSide="bottom" toSide="left" labelAt="start" labelSide="right" color={GRAY}>
      schema migration
    </Arrow>
    {/* In the default ink: the cluster and EventBridge enter the fleet from below, up
        the trunk, and the cluster writes to Aurora. */}
    <Arrow from="ecs" to="agentcore" fromSide="left" toSide="bottom" color={INK} />
    <Arrow from="ecs" to="aurora" fromSide="bottom" toSide="top" />
    <Arrow from="events" to="agentcore" fromSide="right" toSide="bottom" />
    {/* The whole cluster trades with the venue, so the line leaves the cluster box's
        bottom border under the task column, not one task's caption. */}
    <Anchor id="venue-out" x={VENUE_OUT.x} y={VENUE_OUT.y} />
    <Arrow from="venue-out" to="exchange" color={GRAY} />
  </Diagram>
);
