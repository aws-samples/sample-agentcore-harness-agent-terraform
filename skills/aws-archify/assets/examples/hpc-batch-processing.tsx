// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// HPC batch processing: input data landing in Amazon S3 starts a run. An Amazon
// EventBridge rule on the Object Created event starts an AWS Step Functions workflow,
// which submits the work to an AWS Batch job queue and waits for it (submitJob.sync).
// Batch runs the jobs on a compute environment of EC2 Spot Instances in a VPC. The jobs
// read and write Amazon FSx for Lustre, a scratch file system linked to the bucket by a
// data repository association: it imports the input from S3 and exports the results
// back to it. Job logs go to Amazon CloudWatch.
//
//   data lane:     Users -> S3 <-import / export-> FSx for Lustre <-read / write-> [ EC2 Spot x2 ]
//                            | object created                                          ^ run jobs
//   control lane:       EventBridge -> Step Functions -> AWS Batch (job queue) - - logs - -> CloudWatch
//
// What it shows:
//  - Two lanes that both read left to right. The data path is the top lane and the
//    control path the bottom one. The only links between the lanes are two straight
//    vertical hops: S3 sits directly over EventBridge, and the job queue sits under the
//    centre of the compute environment.
//  - Columns that line up through nested boxes. Every node sits in a fixed CELL and the
//    lanes share one PITCH. A box adds its padding on both sides of its contents, so the
//    gap before a box is BOX_PAD narrower than the gap inside it: S3, FSx and the two
//    Spot Instances land exactly over EventBridge, Step Functions and the half pitches
//    around the job queue.
//  - One icon row across group depths. The Spot Instances sit two box bands down (the
//    VPC and the compute environment), FSx one, S3 none, so S3 is lowered by two bands
//    and FSx by one: the whole data lane is one row and its arrows run straight. The
//    price is the empty corner above S3 inside the Region.
//  - Into a group from below. Run jobs ends on the compute environment's bottom edge,
//    a group end: it never lands flush under a caption, and it says "the fleet", not
//    one instance.
//  - Two-way links as one arrow. The data repository association and the file system
//    mount are each one head="both" arrow. The import / export label sits at the S3
//    end, so it stays on one side of the VPC border.
//  - A logs arrow instead of a shared-services box: CloudWatch has one named source, so
//    it gets one thin dashed arrow labelled logs.
// Stand-ins: none. The Spot Instances are the Amazon EC2 service icon, Spot in the sub.
// Build/verify: npm run render -- assets/examples/hpc-batch-processing.tsx /tmp/hpc-batch-processing.svg
import { Diagram, Group, HStack, VStack, ZStack, Node, Arrow, Rect } from "../../src/engine.tsx";
import type { Figure } from "../../src/engine.tsx";
import { Users } from "../../src/icons/resource.js";
import {
  AmazonSimpleStorageService, AmazonEventBridge, AWSStepFunctions, AWSBatch, AmazonEC2,
  AmazonFSxForLustre, AmazonCloudWatch,
} from "../../src/icons/service.js";

const CELL = 136;    // fits the widest one-line caption (Amazon EventBridge, AWS Step Functions)
const PITCH = 192;   // one column pitch, shared by both lanes
const BOX_PAD = 16;  // a group's side padding
const OUTSIDE_GAP = PITCH - CELL - BOX_PAD; // between a node and the next box: that box adds BOX_PAD
const INSIDE_GAP = PITCH - CELL;            // between two nodes in one box
// The job queue sits under the centre of the compute environment, half a pitch past
// its first Spot Instance, so the gap before it is a pitch and a half.
const QUEUE_GAP = PITCH + PITCH / 2 - CELL;
const LANE_GAP = 40;   // data lane to control lane: room for the two vertical labels
const USERS_CELL = 96;
const USERS_GAP = 56;  // Users to the AWS Cloud: room for "upload" outside the borders
const BAND = 48;       // a group's title band and top padding: how far down its first node sits
const S3_DROP = 2 * BAND;  // level with the Spot Instances: the VPC and compute environment bands
const FSX_DROP = BAND;     // FSx is one band shallower: the compute environment's
const USERS_DROP = 4 * BAND; // and outside the AWS Cloud and Region bands too

const invisible = (w: number, h: number) => <Rect w={w} h={h} stroke="none" fill="none" />;
// Centre a node in a cell `w` wide.
const cell = (node: Figure, w = CELL) => <ZStack>{invisible(w, 8)}{node}</ZStack>;
// Lower `child` by `h` px.
const lowered = (h: number, child: Figure) => (
  <VStack gap={0} align="center">{invisible(8, h)}{child}</VStack>
);
const spotInstance = (id: string) => <Node id={id} icon={AmazonEC2} label="Amazon EC2" sub="Spot Instance" />;

export default (
  <Diagram title="HPC Batch Processing with AWS Batch and FSx for Lustre"
    subtitle="A new object in Amazon S3 starts a Step Functions workflow that runs AWS Batch jobs on Spot capacity over an FSx for Lustre scratch file system"
    layout="row" gap={USERS_GAP} align="start">
    {lowered(USERS_DROP, cell(<Node id="users" icon={Users} label="Users" />, USERS_CELL))}

    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud">
      <Group kind="region" id="region-us-east-1" label="Region: us-east-1" layout="col" gap={LANE_GAP} align="start">
        {/* The data lane. */}
        <HStack gap={0} align="start">
          {lowered(S3_DROP, cell(<Node id="s3" icon={AmazonSimpleStorageService} label="Amazon S3" sub="input and results" />))}
          {invisible(OUTSIDE_GAP, 8)}
          <Group kind="vpc" id="vpc" label="VPC" gap={OUTSIDE_GAP} align="start">
            {lowered(FSX_DROP,
              cell(<Node id="fsx" icon={AmazonFSxForLustre} label={"Amazon FSx\nfor Lustre"} sub="scratch" />))}
            <Group kind="generic" id="compute-env" label="AWS Batch compute environment" gap={INSIDE_GAP}>
              {cell(spotInstance("spot-1"))}
              {cell(spotInstance("spot-2"))}
            </Group>
          </Group>
        </HStack>

        {/* The control lane, column for column under the data lane. */}
        <HStack gap={0} align="start">
          {cell(<Node id="events" icon={AmazonEventBridge} label="Amazon EventBridge" sub="rule" />)}
          {invisible(INSIDE_GAP, 8)}
          {cell(<Node id="sfn" icon={AWSStepFunctions} label="AWS Step Functions" sub="workflow" />)}
          {invisible(QUEUE_GAP, 8)}
          {cell(<Node id="batch" icon={AWSBatch} label="AWS Batch" sub="job queue" />)}
          {invisible(INSIDE_GAP, 8)}
          {cell(<Node id="cw" icon={AmazonCloudWatch} label="Amazon CloudWatch" sub="job logs" />)}
        </HStack>
      </Group>
    </Group>

    {/* Data lane: the start labels keep their text clear of the borders the arrows cross. */}
    <Arrow from="users" to="s3" labelAt="start">upload</Arrow>
    <Arrow from="s3" to="fsx" head="both" labelAt="start">{"import /\nexport"}</Arrow>
    <Arrow from="fsx" to="compute-env" head="both">{"read /\nwrite"}</Arrow>
    {/* Between the lanes: labels at the open end of each vertical hop. */}
    <Arrow from="s3" to="events" fromSide="bottom" toSide="top" labelAt="end" labelSide="right">object created</Arrow>
    <Arrow from="batch" to="compute-env" fromSide="top" toSide="bottom" labelAt="start" labelSide="right">run jobs</Arrow>
    {/* Control lane. */}
    <Arrow from="events" to="sfn">start</Arrow>
    <Arrow from="sfn" to="batch">submit job</Arrow>
    <Arrow from="batch" to="cw" dashed>logs</Arrow>
  </Diagram>
);
