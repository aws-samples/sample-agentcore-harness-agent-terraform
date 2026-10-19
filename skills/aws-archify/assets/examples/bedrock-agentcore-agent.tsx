// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// AI agent on Amazon Bedrock AgentCore: users sign in with Amazon Cognito and call the
// agent through Amazon API Gateway; the agent runs on AgentCore Runtime, reasons with
// foundation models in Amazon Bedrock, keeps short- and long-term memory in AgentCore
// Memory, gets tokens and credentials from AgentCore Identity, and reaches its tools
// through AgentCore Gateway, an MCP endpoint whose targets are AWS Lambda functions and
// an external API. Every AgentCore part sends traces and metrics to Amazon CloudWatch
// (AgentCore Observability), so CloudWatch sits in Shared services with no arrows.
//
//   Shared services          Memory               Identity
//   (CloudWatch)               ^ store /       +--> ^ credentials
//                              | recall        | tokens  |
//   Users -HTTPS-> API Gateway -invoke-> Runtime --+--MCP--> Gateway -HTTPS-> External API
//     | sign in                            | inference        | invoke
//     +----------> Cognito                 v                  v
//                                       Bedrock            Lambda
//
// What it shows:
//  - A service group for one service and its parts: the four AgentCore capabilities sit in
//    a "service-teal" box carrying the AgentCore icon; Bedrock, Lambda, Cognito and the
//    API stay outside it, because they are other services.
//  - A hub with five links and four faces. The Runtime takes the request on its left
//    face, calls Bedrock from its bottom and Memory from its top, and its right face
//    fans out: straight to the Gateway, and up the lane between the columns into
//    Identity. The two branches share their first stub, so the MCP label sits at the
//    Gateway end, clear of the turn.
//  - Upward arrows end at <Anchor>s 8 px under the target's caption (Memory, Identity),
//    so no arrowhead presses on the text. The anchor and riser coordinates are derived
//    from the same width and gap constants as the layout, not typed in from a render.
//  - A grid made of three columns: the left column (Shared services, API Gateway,
//    Cognito) and the AgentCore columns line up row by row because the gaps are derived
//    from the 48 px a group's first node sits below its top (32 px band + 16 px pad).
//  - Left out on purpose: the JWT authorizer also reads the Cognito user pool's
//    discovery URL; that trust is in the Identity caption, since an arrow back to
//    Cognito would cross the whole figure. A client can also call the Runtime endpoint
//    directly with the same token; API Gateway is the managed front door drawn here.
//
// Stand-in icons: AgentCore Runtime, Memory, Identity and Gateway have no icons of their
// own, so each uses the Amazon Bedrock AgentCore service icon, captioned with its real
// name. The external API uses the General "Internet" icon.
// Build/verify: npm run watch -- assets/examples/bedrock-agentcore-agent.tsx
import { Diagram, Group, HStack, VStack, ZStack, Node, Arrow, Rect, Anchor } from "../../src/engine.tsx";
import type { Figure } from "../../src/engine.tsx";
import { Users, Internet } from "../../src/icons/resource.js";
import {
  AmazonAPIGateway, AmazonCognito, AmazonBedrockAgentCore, AmazonBedrock, AWSLambda, AmazonCloudWatch,
} from "../../src/icons/service.js";

const CELL_W = 160;     // every node is centred in a cell this wide, so the columns line up
const ACTOR_W = 112;    // Users and the external API, outside the cloud
const ACTOR_GAP = 48;   // the actors to the AWS Cloud box: room for the HTTPS labels
const CLOUD_GAP = 32;   // the left column to the AgentCore box
const AC_COL_GAP = 48;  // between the AgentCore columns: the Identity fan turns in this lane
const AC_ROW_GAP = 64;  // between the AgentCore rows: two short upward arrows and their labels
const BELOW_GAP = 64;   // the AgentCore box to Bedrock and Lambda: the down-arrow labels sit here
// A group's first node sits GROUP_TOP below the group's top (32 px band + 16 px padding),
// and a group adds GROUP_PAD under its last node. The left column's gaps are derived from
// that, so API Gateway lands on the Runtime's row and Cognito on Bedrock's row.
const GROUP_TOP = 48;
const GROUP_PAD = 16;
const API_DROP = AC_ROW_GAP - GROUP_PAD;
const COGNITO_DROP = BELOW_GAP + GROUP_PAD;
// The actors drop to the Runtime's row: past the cloud's band, the Shared services box
// (its band, one node, its padding) and API_DROP.
const NODE_H = 88;      // a node with a label and a sub line
const ACTOR_DROP = GROUP_TOP + GROUP_TOP + NODE_H + GROUP_PAD + API_DROP;
// Layout coordinates for the anchors and the riser, derived from the widths above (the
// left column is a Shared services box: one cell plus its padding). They do not follow
// the layout: re-measure them in the SVG after changing a width, a gap or a caption that
// widens a cell (a sub line over 112 px made the Users cell 120 px and moved every column).
const RUNTIME_X = ACTOR_W + ACTOR_GAP + GROUP_PAD + (CELL_W + 2 * GROUP_PAD) + CLOUD_GAP + GROUP_PAD + CELL_W / 2;
const GATEWAY_X = RUNTIME_X + CELL_W + AC_COL_GAP;
const UNDER_ROW_A = GROUP_TOP + GROUP_TOP + NODE_H + 8; // 8 px under the Memory and Identity captions
// The Identity branch of the Runtime's fan turns in the middle of the lane between the
// AgentCore columns, clear of both captions above it.
const IDENTITY_RISER = RUNTIME_X + CELL_W / 2 + AC_COL_GAP / 2;

const blank = (w: number, h = 8) => <Rect w={w} h={h} stroke="none" fill="none" />;
const cell = (node: Figure, w = CELL_W) => <ZStack>{blank(w)}{node}</ZStack>;
// A cell lowered by `h`, onto the row it connects to.
const lowered = (h: number, node: Figure) => <VStack gap={0} align="center">{blank(8, h)}{node}</VStack>;
const agentCore = (id: string, label: string, sub: string) =>
  cell(<Node id={id} icon={AmazonBedrockAgentCore} label={label} sub={sub} />);

export default (
  <Diagram title="AI Agent on Amazon Bedrock AgentCore"
    subtitle="Users sign in with Cognito and call an agent on AgentCore Runtime that uses Bedrock models, memory and MCP tools"
    layout="row" gap={ACTOR_GAP} align="start">
    {lowered(ACTOR_DROP, cell(<Node id="users" icon={Users} label="Users" sub="chat app" />, ACTOR_W))}

    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="row" gap={CLOUD_GAP} align="start">
      {/* The left column: cross-cutting CloudWatch in the free corner, the API on the
          Runtime's row, Cognito on Bedrock's row. */}
      <VStack gap={0} align="center">
        <Group kind="generic" id="shared-services" label="Shared services">
          {cell(<Node id="cloudwatch" icon={AmazonCloudWatch} label="Amazon CloudWatch" sub="AgentCore Observability" />)}
        </Group>
        {blank(8, API_DROP)}
        {cell(<Node id="api" icon={AmazonAPIGateway} label="Amazon API Gateway" sub="agent API" />)}
        {blank(8, COGNITO_DROP)}
        {cell(<Node id="cognito" icon={AmazonCognito} label="Amazon Cognito" sub="user pool" />)}
      </VStack>

      <VStack gap={BELOW_GAP} align="start">
        <Group kind="service-teal" icon={AmazonBedrockAgentCore} id="agentcore" label="Amazon Bedrock AgentCore"
          layout="col" gap={AC_ROW_GAP}>
          <HStack gap={AC_COL_GAP}>
            {agentCore("memory", "AgentCore Memory", "short and long term")}
            {agentCore("identity", "AgentCore Identity", "JWT check, credentials")}
          </HStack>
          <HStack gap={AC_COL_GAP}>
            {agentCore("runtime", "AgentCore Runtime", "hosted agent")}
            {agentCore("gateway", "AgentCore Gateway", "MCP endpoint")}
          </HStack>
        </Group>
        {/* Outside the AgentCore box, each under the part that calls it. The blank
            matches the box's left padding, so the columns stay in line. */}
        <HStack gap={0} align="start">
          {blank(GROUP_PAD)}
          <HStack gap={AC_COL_GAP}>
            {cell(<Node id="bedrock" icon={AmazonBedrock} label="Amazon Bedrock" sub="foundation models" />)}
            {cell(<Node id="lambda" icon={AWSLambda} label="AWS Lambda" sub="tool functions" />)}
          </HStack>
        </HStack>
      </VStack>
    </Group>

    {lowered(ACTOR_DROP, cell(<Node id="external-api" icon={Internet} label="External API" sub="OpenAPI target" />, ACTOR_W))}

    {/* Sign-in and the request, along the Runtime's row. */}
    <Arrow from="users" to="api" labelAt="start">HTTPS</Arrow>
    <Arrow from="users" to="cognito" fromSide="bottom" toSide="left" labelAt="start" labelSide="right">sign in</Arrow>
    <Arrow from="api" to="runtime" labelAt="start">invoke</Arrow>

    {/* The Runtime's five links. Memory and Identity are entered below their captions. */}
    <Anchor id="under-memory" x={RUNTIME_X} y={UNDER_ROW_A} />
    <Arrow from="runtime" to="under-memory" fromSide="top">{"store /\nrecall"}</Arrow>
    <Arrow from="runtime" to="gateway" labelAt="end">MCP</Arrow>
    <Arrow from="runtime" to="identity" fromSide="right" toSide="left" riser={IDENTITY_RISER} labelAt="end">tokens</Arrow>
    <Arrow from="runtime" to="bedrock" fromSide="bottom" toSide="top">inference</Arrow>

    {/* The Gateway: credentials from Identity, then its two targets. */}
    <Anchor id="under-identity" x={GATEWAY_X} y={UNDER_ROW_A} />
    <Arrow from="gateway" to="under-identity" fromSide="top">credentials</Arrow>
    <Arrow from="gateway" to="lambda" fromSide="bottom" toSide="top">invoke</Arrow>
    <Arrow from="gateway" to="external-api" labelAt="end">HTTPS</Arrow>
  </Diagram>
);
