// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Security operations, threat detection and automated response: four detectors send
// findings to AWS Security Hub, Amazon EventBridge routes them to three automated
// responders, and every finding is archived. Short italic labels name the actions.
//
//   GuardDuty ---\                                      /--> Lambda (remediate)
//   Inspector ----+--> Security Hub --> EventBridge ---+---> SNS (notify)
//   Macie --------+                         |           \--> Systems Manager (runbook)
//   Config ------/                          v archive
//                                     Security Lake --> S3
//
// What it shows:
//  - Fan-in, hub, fan-out. The detectors are one column, the responders another, and
//    the hub sits between them. Pinning the sides does the rest: every fan-in arrow
//    enters the hub's left face and every fan-out arrow leaves EventBridge's right
//    face, so neither bundle crosses an icon.
//  - Keep group titles away from a spine. The spine (Security Hub, EventBridge, then
//    the archive: Security Lake and S3) is a plain VStack, not a Group: a title band
//    under EventBridge would collide with the archive arrow's label, so the captions
//    say what the archive is. Likewise, a tier placed beside the AWS Cloud box rather
//    than inside it lands outside the cloud.
//  - Few labels on a bundle. One "findings" label on a middle hop reads for the whole
//    fan-in, and the fan-out labels sit at the responder ends, spread out, instead of
//    piling up on the shared stub at EventBridge.
// Build/verify: npm run watch -- assets/examples/security-threat-detection.tsx
import { Diagram, Group, VStack, Node, Arrow } from "../../src/engine.tsx";
import {
  AmazonGuardDuty, AmazonInspector, AmazonMacie, AWSConfig, AWSSecurityHub,
  AmazonEventBridge, AWSLambda, AmazonSimpleNotificationService, AWSSystemsManager,
  AmazonSecurityLake, AmazonSimpleStorageService,
} from "../../src/icons/service.js";

const COLUMN_GAP = 56;
const STACK_GAP = 32; // inside the detector and responder columns
const SPINE_GAP = 40;
// Room inside Automated response for the fan-out labels, off the box's left border.
const RESPONSE_LABEL_ROOM = 48;

// A detector's findings, into the hub's left face.
const intoHub = (arrowId: string, detector: string, label?: string) => (
  <Arrow id={arrowId} from={detector} to="hub" fromSide="right" toSide="left">{label}</Arrow>
);
// EventBridge's right face to a responder, labelled at the responder's end.
const toResponder = (arrowId: string, responder: string, action: string) => (
  <Arrow id={arrowId} from="events" to={responder} fromSide="right" toSide="left" labelAt="end">{action}</Arrow>
);

export default (
  <Diagram title="Security Ops — Threat Detection & Auto-Response" layout="row" gap={48} align="center">
    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="row" gap={COLUMN_GAP} align="center">
      <Group kind="generic" id="detection" label="Detection" layout="col" gap={STACK_GAP}>
        <Node id="guardduty" icon={AmazonGuardDuty} label="Amazon GuardDuty" sub="threat detection" />
        <Node id="inspector" icon={AmazonInspector} label="Amazon Inspector" sub="vulnerabilities" />
        <Node id="macie" icon={AmazonMacie} label="Amazon Macie" sub="sensitive data" />
        <Node id="config" icon={AWSConfig} label="AWS Config" sub="compliance drift" />
      </Group>

      {/* The spine, centred so Security Lake sits right under EventBridge and the
          archive hop is a straight drop. */}
      <VStack gap={SPINE_GAP} align="center">
        <Node id="hub" icon={AWSSecurityHub} label="AWS Security Hub" sub="normalize + score" />
        <Node id="events" icon={AmazonEventBridge} label="Amazon EventBridge" sub="finding rules" />
        <Node id="lake" icon={AmazonSecurityLake} label="Amazon Security Lake" sub="findings archive" />
        <Node id="archive" icon={AmazonSimpleStorageService} label="Amazon S3" sub="long-term retention" />
      </VStack>

      <Group kind="generic" id="automated-response" label="Automated response" layout="col" gap={STACK_GAP}
        padLeft={RESPONSE_LABEL_ROOM}>
        <Node id="remediate" icon={AWSLambda} label="AWS Lambda" sub="auto-remediate" />
        <Node id="notify" icon={AmazonSimpleNotificationService} label="Amazon SNS" sub="notify SOC" />
        <Node id="runbook" icon={AWSSystemsManager} label="AWS Systems Manager" sub="run runbook" />
      </Group>
    </Group>

    {intoHub("a-gd", "guardduty")}
    {intoHub("a-insp", "inspector")}
    {intoHub("a-macie", "macie", "findings")}
    {intoHub("a-cfg", "config")}
    <Arrow id="a-hub-events" from="hub" to="events">route</Arrow>
    {toResponder("a-rem", "remediate", "invoke")}
    {toResponder("a-notify", "notify", "notify")}
    {toResponder("a-run", "runbook", "runbook")}
    {/* The archive, dashed, straight down the spine. */}
    <Arrow id="a-archive" from="events" to="lake" fromSide="bottom" toSide="top" dashed>archive</Arrow>
    <Arrow id="a-lake-s3" from="lake" to="archive" />
  </Diagram>
);
