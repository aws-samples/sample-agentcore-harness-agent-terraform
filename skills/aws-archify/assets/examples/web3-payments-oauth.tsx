// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Web3 dApp backend with payments and OAuth / OIDC sign-in: three concerns behind one
// API, each named on its connectors with a short italic label.
//
//   Users -> CloudFront -> API Gateway -+- Auth:     Cognito -> Authorizer
//                                       +- Web3:     Tx signer -> KMS -> Managed Blockchain
//                                       +- Payments: Step Functions -> EventBridge
//                                                    -> DynamoDB ledger / SQS retry
//
// What it shows:
//  - A hub that fans out without long arrows. The API branches to three concerns, so
//    the concerns are stacked in one column right beside it (Auth / Web3 / Payments),
//    each entered from its left edge; inside each concern the steps run left to right.
//    A hub fanning out to columns spread across the canvas would cross other parts.
//  - One shared riser: all three branch arrows turn in the middle of the lane between
//    Edge and the concern boxes, so none runs along a group border.
//  - Labels only where they say something: each meaningful hop gets a one- or two-word
//    protocol or action, and obvious internal hops stay unlabeled.
// Build/verify: npm run watch -- assets/examples/web3-payments-oauth.tsx
import { Diagram, Group, VStack, Node, Arrow, Spacer } from "../../src/engine.tsx";
import { Users } from "../../src/icons/resource.js";
import {
  AmazonCloudFront, AmazonAPIGateway, AmazonCognito, AWSLambda,
  AWSKeyManagementService, AmazonManagedBlockchain, AWSSecretsManager,
  AWSStepFunctions, AmazonEventBridge, AmazonDynamoDB, AmazonSimpleQueueService,
} from "../../src/icons/service.js";

const ACTOR_GAP = 96;
// The Users column is centred on the cloud; a Spacer under Users raises it level with
// CloudFront, so HTTPS is one straight hop instead of an elbow whose label would land
// on the Edge border.
const USERS_LIFT = 32;
const EDGE_GAP = 32;
const CONCERN_STACK_GAP = 24;
const STEP_GAP = 32;
// The lane between Edge (ending at x=328) and the concern boxes (starting at x=408).
const BRANCH_LANE = 80;
const BRANCH_RISER = 368; // its middle, in layout coordinates
// Each concern box opens with this much room, so a branch label at the target end
// sits inside the box instead of on its left border.
const LABEL_ROOM = 80;

// The API's branch into each concern's first node, in the order the concerns stack.
const BRANCHES = [
  { id: "a-auth", to: "cognito", label: "OIDC" },
  { id: "a-sign", to: "signer", label: "invoke", dashed: true },
  { id: "a-pay", to: "sfn", label: "start" },
];

export default (
  <Diagram title="Web3 dApp — Payments & OAuth" layout="row" gap={ACTOR_GAP} align="center">
    <VStack gap={0}>
      <Node id="users" icon={Users} label="Users" sub="wallets" />
      <Spacer size={USERS_LIFT} />
    </VStack>

    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="row" gap={BRANCH_LANE} align="center">
      <Group kind="generic" id="edge" label="Edge" layout="col" gap={EDGE_GAP}>
        <Node id="cdn" icon={AmazonCloudFront} label="Amazon CloudFront" sub="dApp UI" />
        <Node id="api" icon={AmazonAPIGateway} label="Amazon API Gateway" />
      </Group>

      <VStack gap={CONCERN_STACK_GAP} align="start">
        <Group kind="generic" id="auth-oauth-oidc" label="Auth (OAuth / OIDC)" gap={STEP_GAP} padLeft={LABEL_ROOM}>
          <Node id="cognito" icon={AmazonCognito} label="Amazon Cognito" sub="OIDC" />
          <Node id="authfn" icon={AWSLambda} label="Authorizer" sub="JWT verify" />
        </Group>

        <Group kind="generic" id="web3-on-chain" label="Web3 / on-chain" gap={STEP_GAP} padLeft={LABEL_ROOM}>
          <Node id="signer" icon={AWSLambda} label="Tx signer" />
          <Node id="kms" icon={AWSKeyManagementService} label="AWS KMS" sub="signing keys" />
          <Node id="chain" icon={AmazonManagedBlockchain} label="Amazon Managed Blockchain" />
        </Group>

        {/* Not to copy: this box borrows kind="region" for its dashed border, but it is a
            logical concern, not a Region. Use kind="generic" for a concern; a region box
            is labelled as a Region. */}
        <Group kind="region" id="payments" label="Payments" gap={STEP_GAP} align="start" padLeft={LABEL_ROOM}>
          <Node id="sfn" icon={AWSStepFunctions} label="AWS Step Functions" sub="checkout saga" />
          <Node id="events" icon={AmazonEventBridge} label="Amazon EventBridge" sub="provider" />
          <VStack gap={24}>
            <Node id="ledger" icon={AmazonDynamoDB} label="Amazon DynamoDB" sub="ledger" />
            <Node id="retry" icon={AmazonSimpleQueueService} label="Amazon SQS" sub="retry / DLQ" />
          </VStack>
          <Node id="secrets" icon={AWSSecretsManager} label="AWS Secrets Manager" sub="API keys" />
        </Group>
      </VStack>
    </Group>

    <Arrow from="users" to="cdn" labelAt="start">HTTPS</Arrow>
    <Arrow from="cdn" to="api">forward</Arrow>
    {BRANCHES.map(({ id, to, label, dashed }) => (
      <Arrow id={id} from="api" to={to} fromSide="right" toSide="left" riser={BRANCH_RISER} dashed={dashed} labelAt="end">
        {label}
      </Arrow>
    ))}
    {/* Inside the concerns. Cognito -> Authorizer is obvious, so it has no label. */}
    <Arrow id="a-kms" from="signer" to="kms">sign</Arrow>
    <Arrow id="a-chain" from="kms" to="chain">submit</Arrow>
    <Arrow from="cognito" to="authfn" />
    <Arrow id="a-events" from="sfn" to="events">publish</Arrow>
    <Arrow from="events" to="ledger">record</Arrow>
    <Arrow id="a-retry" from="events" to="retry" labelAt="end">retry</Arrow>
  </Diagram>
);
