// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Omnichannel contact center on Amazon Connect: voice, chat and web contacts reach
// Connect, which hands them to self-service, a CRM screen-pop or live agents, while
// Contact Lens analytics turns the conversations into dashboards. Short italic labels
// name the meaningful hops; obvious internal ones stay unlabeled.
//
//   Voice   \                    /- Self-service:      Lex -> Polly
//   Web chat --> Amazon Connect -+-- CRM screen-pop:   Lambda -> DynamoDB
//   Web/app /                    \- Agents & outbound: live agents -> Pinpoint
//   Contact Lens analytics:  Kinesis -> Transcribe -> Comprehend -> QuickSight
//
// What it shows (the hub pattern of web3-payments-oauth.tsx, fed by a fan-in):
//  - Branch labels inside their boxes. Each label rides Connect's branch arrow at
//    labelAt="end", and padLeft on the concern box gives it room inside, off the
//    border.
//  - When not to draw an arrow. Connect sits almost directly above the full-width
//    analytics band whose first node it feeds: no entry side keeps that riser off the
//    band's title, and the side gutter is too narrow to go around. The stream from
//    Connect to Kinesis is left to the layout and the captions instead of an arrow
//    that pierces a label.
// Build/verify: npm run watch -- assets/examples/contact-center-connect.tsx
import { Diagram, Group, VStack, Node, Arrow, Spacer } from "../../src/engine.tsx";
import { MobileClient, Chat, User, Users } from "../../src/icons/resource.js";
import {
  AmazonConnect, AmazonLex, AmazonPolly, AmazonPinpoint, AmazonKinesisDataStreams,
  AmazonTranscribe, AmazonComprehend, AmazonQuick, AWSLambda, AmazonDynamoDB,
} from "../../src/icons/service.js";

const ACTOR_GAP = 80;
const STEP_GAP = 40;   // between the channels, the bands and the nodes inside them
const BRANCH_GAP = 56; // Connect to its concern boxes
const CONCERN_STACK_GAP = 32;
// The channel column is centred beside the cloud; this Spacer under it lifts the
// channels so Web chat is level with Connect, its "contact" hop straight and its label
// in the open gap.
const CHANNELS_LIFT = 88;
// Puts Connect exactly level with Lambda, so screen-pop is straight. Centring the hub
// in its row instead left it 4px off that row.
const CONNECT_DROP = 232;
// The three channel arrows turn on one riser, mid-lane between the channels and the
// AWS Cloud (layout coordinates). Web chat's hop is straight, so on it the riser has
// nothing to move, and the report lists it as ignored: expected.
const CHANNEL_RISER = 120;

// A channel into Connect's left face; a label, if any, sits at the Connect end.
const intoConnect = (arrowId: string, channel: string, label?: string) => (
  <Arrow id={arrowId} from={channel} to="connect" fromSide="right" toSide="left" riser={CHANNEL_RISER}
    labelAt={label ? "end" : undefined}>
    {label}
  </Arrow>
);

export default (
  <Diagram title="Omnichannel Contact Center — Amazon Connect" layout="row" gap={ACTOR_GAP} align="center">
    {/* The customer channels, outside the cloud. */}
    <VStack gap={STEP_GAP} align="center">
      <Node id="voice" icon={MobileClient} label="Voice" sub="telephony" />
      <Node id="chat" icon={Chat} label="Web chat" />
      <Node id="web" icon={User} label="Web / app" />
      <Spacer size={CHANNELS_LIFT} />
    </VStack>

    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="col" gap={STEP_GAP} align="start">
      {/* The Connect hub and its three stacked concerns. */}
      <Group kind="generic" id="contact-center" label="Contact center" layout="row" gap={BRANCH_GAP} align="start">
        <VStack gap={0}>
          <Spacer size={CONNECT_DROP} />
          <Node id="connect" icon={AmazonConnect} label="Amazon Connect" sub="contact flow" />
        </VStack>

        <VStack gap={CONCERN_STACK_GAP} align="start">
          <Group kind="generic" id="self-service" label="Self-service" gap={STEP_GAP} padLeft={112}>
            <Node id="lex" icon={AmazonLex} label="Amazon Lex" sub="intent (NLU)" />
            <Node id="polly" icon={AmazonPolly} label="Amazon Polly" sub="speech" />
          </Group>

          {/* No padLeft: its label sits at the start of a straight hop, outside the box. */}
          <Group kind="generic" id="crm-screen-pop" label="CRM screen-pop" gap={STEP_GAP}>
            <Node id="lambda" icon={AWSLambda} label="AWS Lambda" sub="lookup" />
            <Node id="ddb" icon={AmazonDynamoDB} label="Amazon DynamoDB" sub="customer 360" />
          </Group>

          <Group kind="generic" id="agents-outbound" label="Agents & outbound" gap={STEP_GAP} padLeft={96}>
            <Node id="agents" icon={Users} label="Live agents" sub="routed contact" />
            <Node id="pinpoint" icon={AmazonPinpoint} label="Amazon Pinpoint" sub="outbound SMS / email" />
          </Group>
        </VStack>
      </Group>

      {/* Contact Lens analytics, the band under the hub that Connect streams into. */}
      <Group kind="generic" id="contact-lens-analytics" label="Contact Lens analytics" layout="row" gap={STEP_GAP}>
        <Node id="kinesis" icon={AmazonKinesisDataStreams} label="Amazon Kinesis Data Streams" sub="contact events" />
        <Node id="transcribe" icon={AmazonTranscribe} label="Amazon Transcribe" sub="speech-to-text" />
        <Node id="comprehend" icon={AmazonComprehend} label="Amazon Comprehend" sub="sentiment" />
        <Node id="quicksight" icon={AmazonQuick} label="Amazon QuickSight" sub="supervisor dashboards" />
      </Group>
    </Group>

    {/* The fan-in: only the middle channel is labelled, and it reads for all three. */}
    {intoConnect("a-voice", "voice")}
    {intoConnect("a-chat", "chat", "contact")}
    {intoConnect("a-web", "web")}
    {/* Connect to each concern's first node, entering its left face. */}
    <Arrow id="a-c-lex" from="connect" to="lex" fromSide="right" toSide="left" labelAt="end">self-service</Arrow>
    <Arrow id="a-c-lambda" from="connect" to="lambda" fromSide="right" toSide="left" dashed labelAt="start">
      screen-pop
    </Arrow>
    <Arrow id="a-c-agents" from="connect" to="agents" fromSide="right" toSide="left" labelAt="end">route</Arrow>
    {/* Inside each concern; obvious, so unlabeled. */}
    <Arrow id="a-lex-polly" from="lex" to="polly" />
    <Arrow id="a-lambda-ddb" from="lambda" to="ddb" />
    {/* The agent follows up with a Pinpoint message. */}
    <Arrow id="a-agents-pinpoint" from="agents" to="pinpoint" dashed>follow-up</Arrow>
    {/* Analytics: Comprehend adds sentiment to the transcript and QuickSight puts it on
        dashboards. Kinesis -> Transcribe is obvious and unlabeled. */}
    <Arrow id="a-kin-trans" from="kinesis" to="transcribe" />
    <Arrow id="a-trans-comp" from="transcribe" to="comprehend">sentiment</Arrow>
    <Arrow id="a-comp-qs" from="comprehend" to="quicksight">visualize</Arrow>
  </Diagram>
);
