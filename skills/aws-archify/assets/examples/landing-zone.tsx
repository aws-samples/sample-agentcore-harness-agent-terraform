// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// AWS Control Tower landing zone: the management account governs the organization and vends accounts, the
// Log Archive account keeps the organization trail, the Audit account is the delegated administrator for
// the security services, and a Network account gives every workload VPC one way out to the internet.
//
//   [ Management: CloudTrail | Control Tower | Service Catalog | Organizations | IAM Identity Center ]
//          | logs                            | provision
//   [ Log Archive ]              [ Workloads OU: Prod | Test ] --config, findings--> [ Audit ]
//                                            | attach
//                                [ Network: Transit Gateway --egress--> NAT gateway ] --> Internet
//
// What it shows:
//  - Accounts as `account` groups named for their function, and groups related to groups: `provision`
//    ends on the Workloads OU box, `config, findings` runs box to box, `attach` ends on the Network
//    account. Six arrows for fourteen nodes; Control Tower, Organizations and IAM Identity Center act on
//    every account, so they carry no arrows.
//  - A free top level with every box at a computed x/y, so arrows between rows run straight:
//      CloudTrail's cell centre sits over the Log Archive box centre, AWS Service Catalog's over the
//      Workloads OU centre, and the Network account is centred under the Workloads OU.
//  - One icon row through boxes of different depth. The workload VPCs sit a group deeper than the Log
//    Archive and Audit nodes, so those two boxes start a group band (48 px) lower, and the Workloads OU
//    gets the same 48 px under its accounts: every icon in the row shares one top, and the Workloads OU
//    box centre is level with the Audit box centre, which keeps `config, findings` one straight run.
//  - Labels on the two drops from the management account sit at the arrow's end (labelAt="end"): in the
//    middle, `provision` would land on the management account's bottom border.
// Facts (AWS Control Tower docs, landing zone 4.0): the organization trail is created in the management
// account and its log files go to the S3 bucket in the Log Archive account, which since 4.0 holds CloudTrail
// logs only; AWS Config data goes to the Audit (Config aggregator) account, where Control Tower registers
// a delegated administrator and a service-linked aggregator. Account Factory is an AWS Service Catalog
// product in the management account. Security Hub and GuardDuty with the Audit (Security Tooling) account
// as their delegated administrator follow the multi-account whitepaper's recommendation. The Network
// account (whitepaper Infrastructure OU) shares its transit gateway through AWS RAM; internet-bound
// traffic leaves through NAT gateways in an egress VPC.
// Icons: Account Factory has none of its own, so it is drawn as the AWS Service Catalog product it is.
// Build/verify: npm run render -- assets/examples/landing-zone.tsx /tmp/landing-zone.svg
import { Diagram, Group, ZStack, Node, Arrow, Rect } from "../../src/engine.tsx";
import type { Figure } from "../../src/engine.tsx";
import {
  AWSCloudTrail, AWSControlTower, AWSServiceCatalog, AWSOrganizations, AWSIAMIdentityCenter,
  AmazonSimpleStorageService, AWSSecurityHub, AmazonGuardDuty, AWSConfig, AmazonVirtualPrivateCloud,
  AWSTransitGateway,
} from "../../src/icons/service.js";
import { AmazonVPCNATGateway, Internet } from "../../src/icons/resource.js";

const PAD = 16;           // a group's padding
const BAND = 32;          // a group's title band
const NODE_GAP = 16;      // between the cells in one account
const ROW_GAP = 64;       // between the three rows of boxes: room for one arrow label beside a drop
const MGMT_CELL = 160;    // management cells; SLOT is their centre-to-centre pitch
const SLOT = MGMT_CELL + NODE_GAP;
const LOG_CELL = 192;     // widens Log Archive to 224 px, enough for its title and a centre on the 8 px grid
const WORKLOAD_CELL = 128;
const WORKLOAD_GAP = 32;  // between the Prod and Test accounts
const AUDIT_CELL = 136;   // a 152 px pitch keeps the icon row's widest gap (260) under 1.8x its narrowest
const NETWORK_CELL = 160;
const FINDINGS_GAP = 80;  // Workloads OU to Audit: the two-line label is about 58 px wide
const NODE_H = 88;        // a node with a two-line caption
const MGMT_NODE_H = 104;  // IAM Identity Center's three-line caption sets the management account's height

const ACCOUNT_H = BAND + PAD + NODE_H + PAD;
const MGMT_H = BAND + PAD + MGMT_NODE_H + PAD;
const WORKLOADS_W = 2 * (WORKLOAD_CELL + 2 * PAD) + WORKLOAD_GAP + 2 * PAD;
const WORKLOADS_H = BAND + PAD + ACCOUNT_H + BAND + PAD; // padBottom = BAND + PAD, see the header
const NETWORK_W = 2 * NETWORK_CELL + NODE_GAP + 2 * PAD;

const LOGS = { x: 0, y: MGMT_H + ROW_GAP + BAND + PAD };
// CloudTrail's cell centre (x + PAD + MGMT_CELL / 2) lands on the Log Archive centre (LOGS.x + 112).
const MGMT = { x: LOGS.x + PAD, y: 0 };
// AWS Service Catalog, the third management cell, lands on the Workloads OU centre.
const FACTORY_CX = MGMT.x + PAD + MGMT_CELL / 2 + 2 * SLOT;
const WORKLOADS = { x: FACTORY_CX - WORKLOADS_W / 2, y: MGMT_H + ROW_GAP };
const AUDIT = { x: WORKLOADS.x + WORKLOADS_W + FINDINGS_GAP, y: LOGS.y };
const NETWORK = { x: FACTORY_CX - NETWORK_W / 2, y: WORKLOADS.y + WORKLOADS_H + ROW_GAP };
// The internet one pitch right of the NAT gateway, icon level with it (its box is 64 px wide).
const NAT_CX = NETWORK.x + PAD + NETWORK_CELL + NODE_GAP + NETWORK_CELL / 2;
const INTERNET = { x: NAT_CX + SLOT - 32, y: NETWORK.y + BAND + PAD };

// A node centred in a fixed-width cell, so the cells, not the captions, set every box's width.
const cell = (node: Figure, w: number) => (
  <ZStack><Rect w={w} h={8} stroke="none" fill="none" />{node}</ZStack>
);
const workloadAccount = (label: string) => (
  <Group kind="account" label={label}>
    {cell(<Node icon={AmazonVirtualPrivateCloud} label="Amazon VPC" sub="workload VPC" />, WORKLOAD_CELL)}
  </Group>
);

export default (
  <Diagram title="AWS Control Tower landing zone"
    subtitle="Shared accounts and workload accounts, and the logs, findings and traffic that pass between them"
    layout="free">
    <Group kind="account" id="management" label="Account (Management)" gap={NODE_GAP} x={MGMT.x} y={MGMT.y}>
      {cell(<Node id="trail" icon={AWSCloudTrail} label="AWS CloudTrail" sub="organization trail" />, MGMT_CELL)}
      {cell(<Node icon={AWSControlTower} label="AWS Control Tower" sub="landing zone" />, MGMT_CELL)}
      {cell(<Node id="factory" icon={AWSServiceCatalog} label="AWS Service Catalog" sub="Account Factory" />, MGMT_CELL)}
      {cell(<Node icon={AWSOrganizations} label="AWS Organizations" sub="OUs, SCPs" />, MGMT_CELL)}
      {cell(<Node icon={AWSIAMIdentityCenter} label={"AWS IAM\nIdentity Center"} sub="account access" />, MGMT_CELL)}
    </Group>

    <Group kind="account" id="log-archive" label="Account (Log Archive)" x={LOGS.x} y={LOGS.y}>
      {cell(<Node icon={AmazonSimpleStorageService} label="Amazon S3" sub="CloudTrail logs" />, LOG_CELL)}
    </Group>

    <Group kind="generic" id="workloads" label="Workloads OU" gap={WORKLOAD_GAP} padBottom={BAND + PAD}
      x={WORKLOADS.x} y={WORKLOADS.y}>
      {workloadAccount("Account (Prod)")}
      {workloadAccount("Account (Test)")}
    </Group>

    <Group kind="account" id="audit" label="Account (Audit)" gap={NODE_GAP} x={AUDIT.x} y={AUDIT.y}>
      {cell(<Node icon={AWSSecurityHub} label="AWS Security Hub" sub="delegated admin" />, AUDIT_CELL)}
      {cell(<Node icon={AmazonGuardDuty} label="Amazon GuardDuty" sub="delegated admin" />, AUDIT_CELL)}
      {cell(<Node icon={AWSConfig} label="AWS Config" sub="aggregator" />, AUDIT_CELL)}
    </Group>

    <Group kind="account" id="network" label="Account (Network)" gap={NODE_GAP} x={NETWORK.x} y={NETWORK.y}>
      {cell(<Node id="tgw" icon={AWSTransitGateway} label="AWS Transit Gateway" sub="network hub" />, NETWORK_CELL)}
      {cell(<Node id="nat" icon={AmazonVPCNATGateway} label="NAT gateway" sub="egress VPC" />, NETWORK_CELL)}
    </Group>

    <Node id="internet" icon={Internet} label="Internet" x={INTERNET.x} y={INTERNET.y} />

    <Arrow from="trail" to="log-archive" labelAt="end">logs</Arrow>
    <Arrow from="factory" to="workloads" labelAt="end">provision</Arrow>
    <Arrow from="workloads" to="audit">{"config,\nfindings"}</Arrow>
    <Arrow from="workloads" to="network">attach</Arrow>
    <Arrow from="tgw" to="nat">egress</Arrow>
    <Arrow from="nat" to="internet" />
  </Diagram>
);
