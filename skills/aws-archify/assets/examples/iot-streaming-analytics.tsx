// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// IoT real-time streaming analytics: device telemetry comes in through AWS IoT Core,
// and Amazon Kinesis feeds three consumers (alerting, a data lake and a time-series
// store), with search and dashboards over the lake.
//
//   Devices -> Greengrass -> IoT Core -> Kinesis -+- Real-time:   Flink -> SNS
//                                                 +- Storage:     Firehose -> S3 -> Insights:
//                                                 |                    OpenSearch -> Grafana
//                                                 +- Time-series: Timestream
//
// What it shows:
//  - Keep a fan-out next to its source. Kinesis has three consumers, so Real-time,
//    Storage and Time-series are stacked in one column right beside Ingestion: every
//    fan-out arrow is short, and none jumps across another group or its title.
//    Insights reads the lake from the next column.
//  - Line rows up with arithmetic, not trial and error. Devices, Greengrass and Flink
//    share the top row; Kinesis, Firehose, S3 and OpenSearch share the Storage row.
//    A group's first node sits BAND px below the group's top, so the gap between the
//    stacked groups is what puts the Storage row two ingestion steps below the top row,
//    and invisible boxes lower Devices and Insights onto their rows.
// Build/verify: npm run watch -- assets/examples/iot-streaming-analytics.tsx
import { Diagram, Group, VStack, Node, Arrow, Rect } from "../../src/engine.tsx";
import { AWSIoTThingGeneric } from "../../src/icons/resource.js";
import {
  AWSIoTGreengrass, AWSIoTCore, AmazonKinesisDataStreams, AmazonManagedServiceForApacheFlink,
  AmazonDataFirehose, AmazonTimestream, AmazonSimpleStorageService,
  AmazonOpenSearchService, AmazonManagedGrafana, AmazonSimpleNotificationService,
} from "../../src/icons/service.js";

const BAND = 48;          // 32px title band + 16px padding: where a group's first node sits
const NODE_H = 88;        // a node with a two-line caption
const INGEST_GAP = 32;    // between the ingestion steps
const INGEST_STEP = NODE_H + INGEST_GAP;
const REAL_TIME_H = 168;  // the Real-time box, taller because Flink's caption has three lines
// The Storage row is two ingestion steps below the top row, so Kinesis -> Firehose is
// straight: REAL_TIME_H + STACK_GAP = 2 * INGEST_STEP.
const STACK_GAP = 2 * INGEST_STEP - REAL_TIME_H;
// Devices -> AWS Cloud. Wide enough to keep the MQTT label clear of the cloud's border.
const ACTOR_GAP = 64;
// The two bent fan-out arrows turn on this one riser, in the lane between Ingestion
// and the stacked groups (layout coordinates).
const FAN_OUT_RISER = 312;

const drop = (h: number) => <Rect w={8} h={h} stroke="none" fill="none" />;

export default (
  <Diagram title="IoT Real-Time Streaming Analytics"
    subtitle="Device telemetry flows through AWS IoT Core into Kinesis, which feeds alerting, the data lake and a time-series store"
    layout="row" gap={ACTOR_GAP} align="start">
    {/* Two bands down (AWS Cloud, then Ingestion): level with Greengrass, so MQTT is
        one straight hop. */}
    <VStack gap={0}>
      {drop(BAND + BAND)}
      <Node id="devices" icon={AWSIoTThingGeneric} label="Devices" sub="fleet" />
    </VStack>

    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="row" gap={48} align="start">
      <Group kind="generic" id="ingestion" label="Ingestion" layout="col" gap={INGEST_GAP}>
        <Node id="greengrass" icon={AWSIoTGreengrass} label="AWS IoT Greengrass" sub="edge" />
        <Node id="iotcore" icon={AWSIoTCore} label="AWS IoT Core" sub="MQTT" />
        <Node id="stream" icon={AmazonKinesisDataStreams} label={"Amazon Kinesis\nData Streams"} />
      </Group>

      {/* Kinesis's three consumers, each a row of its own steps. Real-time's padLeft
          gives the "stream" label room inside the box, off its border. */}
      <VStack gap={STACK_GAP} align="start">
        <Group kind="generic" id="real-time" label="Real-time" gap={32} padLeft={48}>
          <Node id="flink" icon={AmazonManagedServiceForApacheFlink}
            label={"Amazon Managed Service\nfor Apache Flink"} sub="anomaly" />
          <Node id="alerts" icon={AmazonSimpleNotificationService} label="Amazon SNS" sub="alerts" />
        </Group>
        <Group kind="generic" id="storage" label="Storage" gap={40}>
          <Node id="firehose" icon={AmazonDataFirehose} label="Amazon Data Firehose" sub="delivery" />
          <Node id="lake" icon={AmazonSimpleStorageService} label="Amazon S3" sub="data lake" />
        </Group>
        <Group kind="generic" id="time-series" label="Time-series" gap={32}>
          <Node id="tsdb" icon={AmazonTimestream} label="Amazon Timestream" sub="metrics" />
        </Group>
      </VStack>

      {/* Insights starts on the Storage row, beside the lake it reads. */}
      <VStack gap={0}>
        {drop(REAL_TIME_H + STACK_GAP)}
        <Group kind="generic" id="insights" label="Insights" layout="col" gap={32}>
          <Node id="search" icon={AmazonOpenSearchService} label="Amazon OpenSearch Service" sub="index" />
          <Node id="dash" icon={AmazonManagedGrafana} label="Amazon Managed Grafana" sub="dashboards" />
        </Group>
      </VStack>
    </Group>

    {/* Ingestion, top down. */}
    <Arrow from="devices" to="greengrass" labelAt="start">MQTT</Arrow>
    <Arrow from="greengrass" to="iotcore" />
    <Arrow from="iotcore" to="stream" />
    {/* The fan-out: the Firehose hop is straight, the other two share one riser. */}
    <Arrow from="stream" to="flink" fromSide="right" toSide="left" riser={FAN_OUT_RISER} labelAt="end">stream</Arrow>
    <Arrow from="stream" to="firehose" fromSide="right" toSide="left" />
    <Arrow from="stream" to="tsdb" fromSide="right" toSide="left" riser={FAN_OUT_RISER} dashed />
    <Arrow from="flink" to="alerts" />
    <Arrow from="firehose" to="lake" />
    {/* The lake to Insights, along the Storage row. */}
    <Arrow from="lake" to="search" fromSide="right" toSide="left" />
    <Arrow from="search" to="dash" />
  </Diagram>
);
