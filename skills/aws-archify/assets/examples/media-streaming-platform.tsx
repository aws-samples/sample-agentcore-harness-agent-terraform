// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Media streaming platform, video on demand plus live, built on AWS Elemental Media
// Services: two parallel lanes converge on one CloudFront delivery edge. Short italic
// labels name the meaningful hops; obvious lane-internal ones (source -> transcode,
// live -> package, the playback API chain) stay unlabeled.
//
//   VOD:  Upload -> S3 source -> MediaConvert -> S3 packaged --\
//                                                              >--> CloudFront -> Viewers
//   Live: Camera -> MediaLive -> MediaPackage -> MediaTailor --/        (+ playback API)
//
// What it shows:
//  - Convergence, the mirror image of a fan-in to a hub: both lanes end on their right
//    edge and meet at one CloudFront node on the shared right side.
//  - Leave out an arrow that would cross the whole diagram. Viewers call the playback
//    API before playing, but a Viewers -> API arrow would run the full width back
//    through the Live lane, so the API is drawn as its own chain and the captions
//    carry the relationship.
// Build/verify: npm run watch -- assets/examples/media-streaming-platform.tsx
import { Diagram, Group, VStack, Node, Arrow, Spacer } from "../../src/engine.tsx";
import { User, Camera, MobileClient } from "../../src/icons/resource.js";
import {
  AmazonSimpleStorageService, AWSElementalMediaConvert, AWSElementalMediaLive,
  AWSElementalMediaPackage, AWSElementalMediaTailor, AmazonCloudFront,
  AmazonAPIGateway, AWSLambda, AmazonDynamoDB,
} from "../../src/icons/service.js";

const ACTOR_GAP = 96;
const LANE_GAP = 40; // between the lanes and between the nodes in each
// The source column is centred beside the cloud. This gap and the Spacer under it put
// each source level with the lane it feeds, so upload and ingest are straight hops,
// clear of the AWS Cloud border.
const SOURCE_GAP = 120;
const SOURCE_LIFT = 24;
// Both lanes turn on this one riser, in the open lane between the AWS Cloud and
// CloudFront (layout coordinates).
const DELIVERY_RISER = 744;

// An AWS Elemental service name, broken after "AWS Elemental" into a two-line caption.
const elemental = (service: string) => `AWS Elemental\n${service}`;

export default (
  <Diagram title="Media Streaming Platform — VOD + Live" layout="row" gap={ACTOR_GAP} align="center">
    {/* One source per lane, outside the cloud. */}
    <VStack gap={SOURCE_GAP} align="center">
      <Node id="upload" icon={User} label="Content team" sub="mezzanine upload" />
      <Node id="camera" icon={Camera} label="Live camera" sub="event feed" />
      <Spacer size={SOURCE_LIFT} />
    </VStack>

    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="col" gap={LANE_GAP} align="start">
      {/* The two lanes, each a straight left-to-right row. */}
      <VStack gap={LANE_GAP} align="start">
        <Group kind="generic" id="vod-pipeline" label="VOD pipeline" gap={LANE_GAP}>
          <Node id="s3src" icon={AmazonSimpleStorageService} label="Amazon S3" sub="source" />
          <Node id="convert" icon={AWSElementalMediaConvert} label={elemental("MediaConvert")} sub="transcode ABR" />
          <Node id="s3out" icon={AmazonSimpleStorageService} label="Amazon S3" sub="packaged" />
        </Group>

        <Group kind="generic" id="live-pipeline" label="Live pipeline" gap={LANE_GAP}>
          <Node id="live" icon={AWSElementalMediaLive} label={elemental("MediaLive")} sub="encode" />
          <Node id="package" icon={AWSElementalMediaPackage} label={elemental("MediaPackage")} sub="JIT package" />
          <Node id="tailor" icon={AWSElementalMediaTailor} label={elemental("MediaTailor")} sub="ad insertion" />
        </Group>
      </VStack>

      {/* The playback control plane, a small band under the lanes. */}
      <Group kind="generic" id="playback-api" label="Playback API" gap={LANE_GAP}>
        <Node id="api" icon={AmazonAPIGateway} label="Amazon API Gateway" />
        <Node id="fn" icon={AWSLambda} label="AWS Lambda" sub="entitlements" />
        <Node id="ddb" icon={AmazonDynamoDB} label="Amazon DynamoDB" sub="sessions" />
      </Group>
    </Group>

    {/* The delivery edge and the viewers, on the shared right side. */}
    <VStack gap={LANE_GAP} align="center">
      <Node id="cdn" icon={AmazonCloudFront} label="Amazon CloudFront" sub="edge delivery" />
      <Node id="viewers" icon={MobileClient} label="Viewers" sub="web + mobile" />
    </VStack>

    {/* Each source into its lane's first stage. */}
    <Arrow id="a-up" from="upload" to="s3src" labelAt="start">upload</Arrow>
    <Arrow id="a-cam" from="camera" to="live" labelAt="start">ingest</Arrow>
    <Arrow id="a-src-conv" from="s3src" to="convert" />
    <Arrow id="a-conv-out" from="convert" to="s3out">write</Arrow>
    <Arrow id="a-live-pkg" from="live" to="package" />
    <Arrow id="a-pkg-tailor" from="package" to="tailor">ad insert</Arrow>
    {/* Both lanes converge on CloudFront, each from its last node's right edge. */}
    <Arrow id="a-vod-cdn" from="s3out" to="cdn" fromSide="right" toSide="left" riser={DELIVERY_RISER} labelAt="end">
      deliver
    </Arrow>
    <Arrow id="a-live-cdn" from="tailor" to="cdn" fromSide="right" toSide="left" riser={DELIVERY_RISER} />
    <Arrow id="a-cdn-view" from="cdn" to="viewers">stream</Arrow>
    {/* The control plane on its own: session authorization and entitlements. */}
    <Arrow id="a-api-fn" from="api" to="fn" />
    <Arrow id="a-fn-ddb" from="fn" to="ddb" />
  </Diagram>
);
