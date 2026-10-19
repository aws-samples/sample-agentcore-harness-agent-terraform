// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// The scene API of the aws-svg renderer. A scene imports everything it needs from here:
//
//   import { Diagram, Group, Node, Arrow } from "../src/engine.tsx";
//   import { AWSLambda, AmazonDynamoDB } from "../src/icons/service.js";
//
//   export default (
//     <Diagram title="Orders" subtitle="One function writing to one table">
//       <Group kind="aws-cloud" label="AWS Cloud">
//         <Node id="fn" icon={AWSLambda} label="AWS Lambda" />
//         <Node id="db" icon={AmazonDynamoDB} label="Amazon DynamoDB" />
//       </Group>
//       <Arrow from="fn" to="db">write</Arrow>
//     </Diagram>
//   );
//
// Containers (<HStack>, <VStack>, <Grid>, <ZStack>, <Free>, <Group>) place their children on an 8 px grid and hug
// them; arrows attach to ids and route themselves; every coordinate an author gives must be a multiple of 8.
// The modules under src/engine/ hold the implementation; scripts/lib/render-scene.ts turns a scene into files.
export { GRID, cell, type Align, type LayoutDir, type Pt, type Side, type Size } from "./engine/geometry.ts";
export type { TextAnchor } from "./engine/text.ts";
export { GROUP_STYLES, SERVICE_GROUP_COLORS, type GroupKind, type GroupStyle } from "./engine/groups.ts";
export {
  Anchor, Arrow, Diagram, Free, Grid, Group, HStack, Icon, Label, Move, NUMBERED_STEPS_ERROR, Node, Raw, Rect,
  Spacer, StepBadge, VStack, ZStack, edges,
  type Animate, type AnchorProps, type ArrowProps, type DiagramProps, type Figure, type GridProps, type GroupIconModule,
  type GroupProps, type IconComponent, type IconProps, type LabelProps, type MoveProps, type NodeProps, type RawProps,
  type RectProps, type SpacerProps, type StackProps, type StepBadgeProps,
} from "./engine/elements.ts";
export { checkLayout, fit, type LayoutReport } from "./engine/report.ts";
export { SceneSvg, type SceneSvgProps } from "./engine/paint.ts";
export { composeScene, type ComposeOptions, type Composed } from "./engine/compose.ts";
