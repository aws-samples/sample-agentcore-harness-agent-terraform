// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Event-driven serverless order pipeline: Amazon API Gateway and an AWS Lambda order API
// save each order to Amazon DynamoDB and publish one event to an Amazon EventBridge event
// bus. Bus rules fan the event out to three independent consumers: an AWS Step Functions
// order workflow (payment and inventory steps as Lambda functions), an Amazon SQS
// fulfillment queue with a dead-letter queue, and Amazon SNS customer notifications.
//
//                                                  +-enqueue-> SQS queue - - - - -> SQS DLQ
//   Customers -> API Gateway -> Lambda -> EventBridge -start---> Step Functions -> [ payment, inventory ]
//                                 | write            +-notify--> SNS
//                                 v
//                              DynamoDB
//
// What it shows:
//  - Fan-out from a bus, every branch leaving one face. The three targets are stacked in
//    one column beside the bus and all three rules leave its right face: the middle one
//    straight, the outer two turning on one shared riser in the middle of the lane. Each
//    label sits at its target end (labelAt="end"), so the labels spread out instead of
//    piling up on the stub the branches share.
//  - A dead-letter queue as a secondary path: dashed, labelled, and off the main row, so
//    the eye follows the solid flow first. The DLQ sits on the queue's own row, out of
//    line with the request path.
//  - One arrow to a group: the workflow invokes both step functions, so the arrow targets
//    the "Workflow steps" box instead of chaining one Lambda into the other (which would
//    claim the payment function calls the inventory function). padTop centres the box on
//    the icon row, so the arrow into it is straight.
//  - Rows that read as rows: the queue and the DLQ go on the top row, where nothing sits in
//    the Lambda's column, because a row with a hole two columns wide reads as a missing node.
//
// Stand-in icons: none. Customers use the General "Users" icon.
// Build/verify: npm run watch -- assets/examples/event-driven-orders.tsx
import { Diagram, Group, HStack, VStack, ZStack, Node, Arrow, Rect } from "../../src/engine.tsx";
import type { Figure } from "../../src/engine.tsx";
import { Users } from "../../src/icons/resource.js";
import {
  AmazonAPIGateway, AWSLambda, AmazonDynamoDB, AmazonEventBridge, AWSStepFunctions,
  AmazonSimpleQueueService, AmazonSimpleNotificationService,
} from "../../src/icons/service.js";

const WIDE_W = 136;    // cells for the long names (API Gateway, EventBridge, Step Functions)
const NARROW_W = 112;  // cells for the short ones
// The DLQ and the two steps: "dead-letter queue" and "reserve inventory" are 112.2 px at
// 11 px, so their nodes snap to 120; all three share this width to stay in one column.
const STEP_W = 120;
const ACTOR_W = 112;   // Customers, outside the cloud
const ACTOR_GAP = 48;  // Customers to the AWS Cloud box: room for the HTTPS label
const STEP_GAP = 48;   // along the request path: room for "publish"
const FAN_LANE = 64;   // the bus to its targets: the branches turn in the middle of this lane
const BOX_GAP = 40;    // Step Functions to the Workflow steps box: room for "invoke"
const STEPS_GAP = 24;  // between the two step functions
const ROW_GAP = 80;    // between the three rows
const NODE_H = 88;     // a node with a label and a sub line
const ROW = NODE_H + ROW_GAP;
// A group puts its first node 32 px (band) plus its top padding below its top, and 16 px
// of padding under its last node.
const GROUP_BAND = 32;
const GROUP_PAD = 16;
// padTop = padBottom + 8 puts the box's vertical centre on its icon row, so the arrow from
// Step Functions to the box edge is one straight line.
const STEPS_PAD_TOP = GROUP_PAD + 8;
// The DLQ's bottom to the Workflow steps box's top, chosen so the step functions land on
// the request row.
const DLQ_TO_STEPS = ROW - NODE_H - GROUP_BAND - STEPS_PAD_TOP;
// Customers drop past the cloud's band and padding to the request row.
const CUSTOMERS_DROP = GROUP_BAND + GROUP_PAD + ROW;
// Layout x of the shared riser: the middle of the lane between the bus and its targets.
const BUS_X = ACTOR_W + ACTOR_GAP + GROUP_PAD + WIDE_W + STEP_GAP + NARROW_W + STEP_GAP + WIDE_W / 2;
const FAN_RISER = BUS_X + WIDE_W / 2 + FAN_LANE / 2;

const blank = (w: number, h = 8) => <Rect w={w} h={h} stroke="none" fill="none" />;
const cell = (node: Figure, w = WIDE_W) => <ZStack>{blank(w)}{node}</ZStack>;
// A column whose first node sits on the request row, one row down.
const onRequestRow = (column: Figure) => <VStack gap={0} align="center">{blank(8, ROW)}{column}</VStack>;
// One bus rule: out of the bus's right face into the target's left face, labelled at the
// target end. The bent branches share FAN_RISER; on the straight one it does not apply.
const rule = (to: string, label: string, bent: boolean) => (
  <Arrow from="bus" to={to} fromSide="right" toSide="left" riser={bent ? FAN_RISER : undefined} labelAt="end">
    {label}
  </Arrow>
);

export default (
  <Diagram title="Event-Driven Order Processing"
    subtitle="The order API saves each order and publishes one event, which bus rules fan out to a workflow, a queue and notifications"
    layout="row" gap={ACTOR_GAP} align="start">
    <VStack gap={0} align="center">
      {blank(8, CUSTOMERS_DROP)}
      {cell(<Node id="customers" icon={Users} label="Customers" sub="web or mobile" />, ACTOR_W)}
    </VStack>

    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="row" gap={0} align="start">
      {onRequestRow(cell(<Node id="api" icon={AmazonAPIGateway} label="Amazon API Gateway" sub="REST API" />))}
      {blank(STEP_GAP)}
      {onRequestRow(
        <VStack gap={ROW_GAP} align="center">
          {cell(<Node id="order-api" icon={AWSLambda} label="AWS Lambda" sub="order API" />, NARROW_W)}
          {cell(<Node id="orders-table" icon={AmazonDynamoDB} label="Amazon DynamoDB" sub="orders table" />, NARROW_W)}
        </VStack>)}
      {blank(STEP_GAP)}
      {onRequestRow(cell(<Node id="bus" icon={AmazonEventBridge} label="Amazon EventBridge" sub="order event bus" />))}
      {blank(FAN_LANE)}

      {/* The bus's three targets, one per row. */}
      <VStack gap={ROW_GAP} align="center">
        {cell(<Node id="fulfillment" icon={AmazonSimpleQueueService} label="Amazon SQS" sub="fulfillment queue" />)}
        {cell(<Node id="workflow" icon={AWSStepFunctions} label="AWS Step Functions" sub="order workflow" />)}
        {cell(<Node id="notify" icon={AmazonSimpleNotificationService} label="Amazon SNS" sub="notify customers" />)}
      </VStack>
      {blank(BOX_GAP)}

      {/* The DLQ on the queue's row, over the first step; then the steps on the request row. */}
      <VStack gap={0} align="start">
        <HStack gap={0} align="start">
          {blank(GROUP_PAD)}
          {cell(<Node id="dlq" icon={AmazonSimpleQueueService} label="Amazon SQS" sub="dead-letter queue" />, STEP_W)}
        </HStack>
        {blank(8, DLQ_TO_STEPS)}
        <Group kind="generic" id="workflow-steps" label="Workflow steps" gap={STEPS_GAP} padTop={STEPS_PAD_TOP}>
          {cell(<Node id="payment" icon={AWSLambda} label="AWS Lambda" sub="charge payment" />, STEP_W)}
          {cell(<Node id="inventory" icon={AWSLambda} label="AWS Lambda" sub="reserve inventory" />, STEP_W)}
        </Group>
      </VStack>
    </Group>

    {/* The request path. API Gateway to the order API is obvious, so it is unlabelled. */}
    <Arrow from="customers" to="api" labelAt="start">HTTPS</Arrow>
    <Arrow from="api" to="order-api" />
    <Arrow from="order-api" to="orders-table" fromSide="bottom" toSide="top">write</Arrow>
    <Arrow from="order-api" to="bus">publish</Arrow>

    {/* The fan-out: all three rules leave the bus's right face. */}
    {rule("fulfillment", "enqueue", true)}
    {rule("workflow", "start", false)}
    {rule("notify", "notify", true)}

    {/* The secondary path, dashed: messages that keep failing move to the DLQ. */}
    <Arrow from="fulfillment" to="dlq" dashed>after retries</Arrow>
    <Arrow from="workflow" to="workflow-steps">invoke</Arrow>
  </Diagram>
);
