// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Engine canary: a video-on-demand pipeline drawn by hand, so that every escape hatch
// of the engine is on a real element. Not a style to copy.
//
// Every other example is pure layout (Diagram, Group, Node and Arrow over
// HStack/VStack/Grid), which leaves the absolute-placement half of the engine out of
// `npm run examples`: break it and no SVG changes, so the regression gate cannot see
// it. This scene closes that gap. It is a legitimate architecture (upload, transcode,
// deliver, plus an observability tier), drawn the way you would mirror a reference
// image:
//
//   layout="free" + <Free>   the diagram places its top-level clusters at x/y
//   <Icon> + <Label>         an icon whose caption is placed on its own
//   <Rect> / <Raw>           the internet boundary box, and the trust-boundary line
//   <ZStack>                 an emphasis card behind the delivery node
//   <Spacer>                 a wider seam between the transcode and delivery halves
//   <Move>                   the CloudWatch / X-Ray pair nudged as one selection
//   <Anchor>                 the two-leg log route out of the CDN
//   points={} + edges()      the hand-drawn request connector
//   via={} / riser={}        one connector routed by hand, one by its first turn
//
// Everything is on the 8px grid and inside the canvas, so a clean report is the
// target, and anything it flags is a real bug in one of those primitives. The <Move>
// wraps two tiles on purpose: it also guards the rule that a Move keeps its children's
// layout (CloudWatch and X-Ray stay side by side in the Observability row, nudged down
// together) instead of stacking them on one point.
// Build/verify: npm run watch -- assets/examples/canary-primitives.tsx
import {
  Diagram, Group, HStack, ZStack, Free, Move, Spacer, Node, Icon, Label, Rect, Raw, Anchor, Arrow,
  edges, cell,
} from "../../src/engine.tsx";
import { Users } from "../../src/icons/resource.js";
import {
  AmazonSimpleStorageService, AWSLambda, AWSElementalMediaConvert, AmazonCloudFront,
  AmazonCloudWatch, AWSXRay,
} from "../../src/icons/service.js";

// Hand-placed positions, spelled in grid cells, all in layout coordinates.
const INTERNET = { x: 0, y: cell(11) }; // the internet cluster's origin
const VIEWER_IN_CLUSTER = { x: cell(5), y: cell(3) };
// The Users icon's absolute position (its cluster's origin plus its own x/y), level
// with the Region's top. Being absolute is what lets edges() give its exact sides.
const VIEWER = { x: INTERNET.x + VIEWER_IN_CLUSTER.x, y: INTERNET.y + VIEWER_IN_CLUSTER.y };
const VIEWER_EDGES = edges(VIEWER.x, VIEWER.y);
const CLOUD = { x: cell(26), y: cell(8) }; // the AWS Cloud box's origin
const TOP_LANE_Y = cell(3);     // a clear lane above everything: the CDN -> viewer crossbar
const TRUST_LINE_X = cell(21);  // the boundary between the internet and the cloud
const CDN_CENTER_X = cell(106); // the delivery node's icon centre: the log and delivery lane
const LOG_Y = cell(50);         // the Observability box's right edge-centre

// A dashed vertical rule. The engine has no line primitive, so it is raw SVG.
const verticalRule = (x: number, top: number, bottom: number) =>
  `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="#B6C0D0" stroke-width="2" stroke-dasharray="6 4" />`;

export default (
  <Diagram title="Video-on-Demand Pipeline — hand-placed" layout="free">
    {/* The public internet, by hand: a boundary <Rect>, a bare <Icon> and a
        left-aligned <Label> in place of a Node's centred caption. The <Free> makes the
        three one cluster that moves together. */}
    <Free x={INTERNET.x} y={INTERNET.y}>
      <Rect x={0} y={0} w={cell(16)} h={cell(13)} rx={8} dashed stroke="#7D8998" />
      <Icon id="viewers" icon={Users} x={VIEWER_IN_CLUSTER.x} y={VIEWER_IN_CLUSTER.y} />
      <Label x={cell(2)} y={cell(10)} anchor="start" color="#5A6B86">Public internet</Label>
    </Free>

    {/* The trust boundary the request crosses. */}
    <Raw>{verticalRule(TRUST_LINE_X, cell(6), cell(63))}</Raw>

    <Group kind="aws-cloud" id="cloud" label="AWS Cloud" x={CLOUD.x} y={CLOUD.y} layout="col">
      <Group kind="region" label="Region: us-east-1" layout="col" gap={72}>
        <HStack gap={40}>
          <Node id="up" icon={AmazonSimpleStorageService} label="Amazon S3" sub="uploads" />
          <Node id="trig" icon={AWSLambda} label="AWS Lambda" sub="job trigger" />
          <Node id="mc" icon={AWSElementalMediaConvert} label={"AWS Elemental\nMediaConvert"} />
          {/* 24px more seam between transcode and delivery, only here, without
              widening the row's gap everywhere. */}
          <Spacer size={cell(3)} />
          <Node id="out" icon={AmazonSimpleStorageService} label="Amazon S3" sub="renditions" />
          {/* The emphasis card is the node's own size, so the ZStack centres both on
              the same spot. */}
          <ZStack>
            <Rect w={cell(16)} h={cell(11)} rx={8} dashed fill="#F7F9FC" stroke="#B6C0D0" strokeWidth={1} />
            <Node id="cdn" icon={AmazonCloudFront} label="Amazon CloudFront" sub="edge cache" />
          </ZStack>
        </HStack>

        {/* padBottom makes the box 160px tall, which puts its right edge-centre (LOG_Y)
            on the grid, so the CDN's log connector comes in dead level. */}
        <Group kind="generic" id="obs" label="Observability" padBottom={24}>
          {/* One <Move> over two tiles: both slide down together. */}
          <Move dy={8}>
            <Node id="cw" icon={AmazonCloudWatch} label="Amazon CloudWatch" sub="job + edge metrics" />
            <Node id="xray" icon={AWSXRay} label="AWS X-Ray" sub="traces" />
          </Move>
        </Group>
      </Group>
    </Group>

    {/* The request in, drawn by hand from the viewer icon's gapped right side to one
        cell short of the AWS Cloud border, level with the icon's centre. */}
    <Arrow points={[VIEWER_EDGES.rightGap, [CLOUD.x - cell(1), VIEWER_EDGES.cy]]} />

    {/* The pipeline itself, with ordinary id-attached connectors. */}
    <Arrow from="up" to="trig">event</Arrow>
    <Arrow from="trig" to="mc">job</Arrow>
    <Arrow from="mc" to="out" />
    <Arrow from="out" to="cdn">origin</Arrow>

    {/* Transcode metrics drop into Observability. riser={0.5} puts the first turn in
        the middle of the 72px lane between the tiers, so both stubs are 32px. */}
    <Arrow from="mc" to="obs" fromSide="bottom" toSide="top" riser={0.5} />

    {/* CDN logs: down out of the CDN, then left into Observability. The two legs meet
        exactly on an <Anchor>, so they read as one connector. */}
    <Anchor id="log-wp" x={CDN_CENTER_X} y={LOG_Y} />
    <Arrow from="cdn" to="log-wp" fromSide="bottom" head="none" />
    <Arrow from="log-wp" to="obs" toSide="right" />

    {/* Delivery out, over the top of the cloud: `via` holds the crossbar in the clear
        lane above every box. */}
    <Arrow from="cdn" to="viewers" fromSide="top" toSide="top"
      via={[[CDN_CENTER_X, TOP_LANE_Y], [VIEWER_EDGES.cx, TOP_LANE_Y]]} labelAt="end">HLS</Arrow>
  </Diagram>
);
