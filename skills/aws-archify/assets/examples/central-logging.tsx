// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Centralized logging for a multi-account organization: every workload account sends its
// logs to one Log Archive account, which keeps them in one bucket and makes them searchable.
//
//   each workload account            Log Archive account
//   VPC Flow Logs                    Shared services: AWS KMS (no arrows)
//        | publish
//   CloudWatch Logs  --subscribe-->  Data Firehose --index--> OpenSearch Service
//                                         | archive
//   CloudTrail       --deliver---->  Amazon S3 --query--> Athena
//
// The delivery paths, as the AWS docs describe them:
//  - CloudWatch Logs: a subscription filter in each workload account sends to a CloudWatch
//    Logs destination in the Log Archive account, which fronts the Firehose stream.
//  - VPC Flow Logs publish to the account's CloudWatch Logs, so they ride the same subscription.
//  - CloudTrail: the organization trail has a copy in every member account and delivers each
//    account's events straight to the central S3 bucket.
//  - Firehose indexes into OpenSearch Service and backs up every record to the S3 bucket.
//
// What it shows:
//  - Accounts as columns, log types as rows. Both workload accounts hold the same three nodes
//    in the same order, so each log type is one row across the figure and each delivery path
//    leaves at the height of the row it carries.
//  - Relate to the group, not to each account. The two cross-account arrows start on the
//    border of the "Workload accounts" box (two <Anchor>s), so two arrows stand for every
//    account instead of one pair per account.
//  - The Log Archive is a 2 x 2 grid whose rows are the subscribe and deliver rows, so every
//    arrow in the figure is one straight run.
//  - Shared services sits above the Log Archive, in the band the VPC Flow Logs row leaves free,
//    with no arrows: KMS encrypts everything and an arrow to it would say nothing.
// Build/verify: npm run render -- assets/examples/central-logging.tsx /tmp/central-logging.svg
import { Diagram, Group, HStack, VStack, ZStack, Node, Arrow, Anchor, Rect } from "../../src/engine.tsx";
import type { Figure } from "../../src/engine.tsx";
import { AmazonVPCFlowLogs, AmazonCloudWatchLogs } from "../../src/icons/resource.js";
import {
  AWSCloudTrail, AmazonDataFirehose, AmazonSimpleStorageService, AmazonAthena,
  AmazonOpenSearchService, AWSKeyManagementService,
} from "../../src/icons/service.js";

const CELL_W = 160;      // wide enough for "Amazon CloudWatch Logs" on one line
// The Log Archive cells fit "Amazon OpenSearch Service", so both of its rows are one width
// and the S3 bucket sits exactly under Firehose.
const ARCHIVE_CELL_W = 184;
const ROW_GAP = 48;      // between the log-type rows, in every account
const ACCOUNT_GAP = 24;  // Workload A beside Workload B
const LANE = 96;         // workload accounts to the Log Archive: room for "subscribe"
const ARCHIVE_COL_GAP = 48;
// Shared services is 152px tall (band, padding, one node); this gap puts the Log Archive's
// first row level with the CloudWatch Logs row: 152 + 32 = 136 + ROW_GAP.
const STACK_GAP = 32;
// The cross-account arrows start on the right border of the Workload accounts box, level
// with the CloudWatch Logs and CloudTrail rows (layout coordinates, measured from the SVG).
const LANE_X = 488;
const SUBSCRIBE_Y = 304;
const DELIVER_Y = 440;

const cell = (node: Figure, w = CELL_W) => (
  <ZStack><Rect w={w} h={8} stroke="none" fill="none" />{node}</ZStack>
);

// One workload account: the same three log sources, top to bottom.
const workloadAccount = (prefix: string, label: string) => (
  <Group kind="account" id={`${prefix}-account`} label={label} layout="col" gap={ROW_GAP}>
    {cell(<Node id={`${prefix}-flow`} icon={AmazonVPCFlowLogs} label="Amazon VPC Flow Logs" sub="network traffic" />)}
    {cell(<Node id={`${prefix}-cwl`} icon={AmazonCloudWatchLogs} label="Amazon CloudWatch Logs" sub="log groups" />)}
    {cell(<Node id={`${prefix}-trail`} icon={AWSCloudTrail} label="AWS CloudTrail" sub="organization trail" />)}
  </Group>
);

export default (
  <Diagram title="Centralized Logging Across Accounts"
    subtitle="Workload accounts send their logs to one Log Archive account, which keeps them in one place and searchable"
    layout="row" align="start">
    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="row" gap={LANE} align="start">
      <Group kind="generic" id="workload-accounts" label="Workload accounts" layout="row" gap={ACCOUNT_GAP}>
        {workloadAccount("a", "Account (Workload A)")}
        {workloadAccount("b", "Account (Workload B)")}
      </Group>

      <VStack gap={STACK_GAP} align="start">
        <Group kind="generic" id="shared-services" label="Shared services">
          {cell(<Node id="kms" icon={AWSKeyManagementService} label="AWS Key Management Service" sub="log encryption" />)}
        </Group>
        <Group kind="account" id="log-archive" label="Account (Log Archive)" layout="col" gap={ROW_GAP}>
          <HStack gap={ARCHIVE_COL_GAP}>
            {cell(<Node id="firehose" icon={AmazonDataFirehose} label="Amazon Data Firehose" sub="delivery stream" />, ARCHIVE_CELL_W)}
            {cell(<Node id="opensearch" icon={AmazonOpenSearchService} label="Amazon OpenSearch Service" sub="dashboards" />, ARCHIVE_CELL_W)}
          </HStack>
          <HStack gap={ARCHIVE_COL_GAP}>
            {cell(<Node id="bucket" icon={AmazonSimpleStorageService} label="Amazon S3" sub="log bucket" />, ARCHIVE_CELL_W)}
            {cell(<Node id="athena" icon={AmazonAthena} label="Amazon Athena" sub="SQL queries" />, ARCHIVE_CELL_W)}
          </HStack>
        </Group>
      </VStack>
    </Group>

    <Anchor id="lane-subscribe" x={LANE_X} y={SUBSCRIBE_Y} />
    <Anchor id="lane-deliver" x={LANE_X} y={DELIVER_Y} />

    {/* Inside each account, flow logs land in CloudWatch Logs. */}
    <Arrow from="a-flow" to="a-cwl">publish</Arrow>
    <Arrow from="b-flow" to="b-cwl">publish</Arrow>
    {/* Across accounts, from the group's border: labelAt="start" keeps each label in the lane,
        off the Log Archive's border. */}
    <Arrow from="lane-subscribe" to="firehose" labelAt="start">subscribe</Arrow>
    <Arrow from="lane-deliver" to="bucket" labelAt="start">deliver</Arrow>
    {/* Inside the Log Archive. */}
    <Arrow from="firehose" to="opensearch">index</Arrow>
    <Arrow from="firehose" to="bucket">archive</Arrow>
    <Arrow from="bucket" to="athena">query</Arrow>
  </Diagram>
);
