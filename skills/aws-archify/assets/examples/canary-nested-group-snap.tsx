// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Engine canary: a nested Group whose centring offset falls off the 8px grid. Not a
// style to copy.
//
// An event fan-out in three tiers, each a <VStack> of a trigger with its handler
// <Group> below it. That is the ordinary shape whenever a column's caption is wider
// than the box beneath it, and the width difference is the whole point:
//
//   A VStack is as wide as its widest child, and centres each narrower one by half the
//   difference. Half an odd number of cells is a multiple of 4, not of 8. A <Node> may
//   sit on that half-grid on purpose (it keeps sibling icon centres exactly on one
//   line), but the <HStack> around the handler inherits the same unsnapped offset and
//   passes it to the <Group> inside, which draws a border and so must sit on the grid.
//   verifyGrid() throws if it does not.
//
// Two tiers are built to trip that, and one is a control:
//   "Amazon EventBridge Pipes" (176) over a 104px box: offset 36, off the grid
//   "AWS Step Functions"       (136) over a 144px box: offset  0, on the grid
//   "Amazon EventBridge"       (136) over a 112px box: offset 12, off the grid
//
// place() snaps a Group's absolute origin to the grid; without that snap this scene
// fails to render with
//   Layout produced an off-8px-grid position for <Group "Enrich">: x=68, y=208.
// Snapping the centring offset in crossPlace is not enough: the off-grid value is the
// HStack's own x, which the Group takes over through the row cursor with no offset of
// its own. Only snapping the absolute origin reaches it. Keep all three tiers: the
// control catches a fix that over-snaps and moves a box that is already right.
// Expect the snap to show on tiers 1 and 3: it moves the box up to 4px off its
// trigger's centre line, so those two drops leave their trigger 4px off centre, while
// the control's drop runs dead centre.
// Build/verify: npm run watch -- assets/examples/canary-nested-group-snap.tsx
import { Diagram, Group, VStack, HStack, Node, Arrow } from "../../src/engine.tsx";
import type { Figure } from "../../src/engine.tsx";
import { AmazonEventBridgePipes } from "../../src/icons/resource.js";
import {
  AmazonEventBridge, AWSStepFunctions, AWSLambda, AmazonDynamoDB, AmazonSimpleNotificationService,
} from "../../src/icons/service.js";

const TIER_GAP = 48;
const DROP_GAP = 40; // a trigger over its handler box

// One tier: the trigger over its handler box. The bare HStack around the Group is the
// part under test: it carries the centring offset down to the Group.
const tier = (trigger: Figure, handlerId: string, handlerLabel: string, handler: Figure) => (
  <VStack gap={DROP_GAP}>
    {trigger}
    <HStack>
      <Group kind="generic" id={handlerId} label={handlerLabel}>{handler}</Group>
    </HStack>
  </VStack>
);

export default (
  <Diagram title="Order Events — Fan-out Tiers" layout="row" gap={48} align="center">
    <Group kind="aws-cloud" label="AWS Cloud">
      <Group kind="region" label="Region: us-east-1" gap={TIER_GAP}>
        {/* Tier 1: a 176px caption over a 104px box, offset 36. */}
        {tier(<Node id="pipes" icon={AmazonEventBridgePipes} label="Amazon EventBridge Pipes" />,
          "enrich", "Enrich", <Node id="enrich-fn" icon={AWSLambda} label="AWS Lambda" />)}
        {/* Tier 2, the control: a 136px caption over a 144px box, offset 0. */}
        {tier(<Node id="sfn" icon={AWSStepFunctions} label="AWS Step Functions" sub="Express workflow" />,
          "fulfil", "Fulfil", <Node id="orders" icon={AmazonDynamoDB} label="Amazon DynamoDB" />)}
        {/* Tier 3: a 136px caption over a 112px box, offset 12. The box is as wide as
            its own label needs, wider than its node. */}
        {tier(<Node id="bus" icon={AmazonEventBridge} label="Amazon EventBridge" sub="order events" />,
          "alerting", "Alerting", <Node id="topic" icon={AmazonSimpleNotificationService} label="Amazon SNS" />)}
      </Group>
    </Group>

    {/* Each trigger hands off to the box below it... */}
    <Arrow from="pipes" to="enrich" />
    <Arrow from="sfn" to="fulfil" />
    <Arrow from="bus" to="alerting" />
    {/* ...and each tier feeds the next. */}
    <Arrow from="enrich" to="sfn" fromSide="right" toSide="left" />
    <Arrow from="fulfil" to="bus" fromSide="right" toSide="left" />
  </Diagram>
);
