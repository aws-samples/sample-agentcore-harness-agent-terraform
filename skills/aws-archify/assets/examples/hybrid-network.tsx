// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Hybrid network: an AWS Transit Gateway hub joins two workload VPCs to an on-premises
// data center over two redundant paths, AWS Direct Connect (primary) and AWS
// Site-to-Site VPN (backup), which both end on the customer gateway.
//
//   [ VPC A ] \                    / Direct Connect ----\
//              > Transit Gateway  <                      > Customer gateway -> Servers
//   [ VPC B ] /                    \ Site-to-Site VPN --/
//
// A network topology rather than an application flow: the arrow labels name links
// (attach, dedicated, encrypted, terminate). What it shows:
//  - One connector per hub face. VPC A enters the hub's top, VPC B its left, Direct
//    Connect leaves its right and the VPN its bottom, and the VPN reaches the customer
//    gateway's bottom, so no two arrows share a segment.
//  - An attachment belongs to a whole VPC, so each one starts on the VPC's Group box
//    and never threads between the VPC's members.
//  - The on-premises side is a "datacenter" Group, outside the AWS Cloud.
//  - A Spacer and a Move both shift things, but only the Spacer is measured (see the
//    Direct Connect column and the data center below).
// Build/verify: npm run watch -- assets/examples/hybrid-network.tsx
import { Diagram, Group, VStack, Node, Arrow, Move, Spacer } from "../../src/engine.tsx";
import {
  AWSTransitGateway, AWSDirectConnect, AWSSiteToSiteVPN, AmazonElasticKubernetesService, AmazonRDS,
} from "../../src/icons/service.js";
import { AmazonVPCCustomerGateway, Server } from "../../src/icons/resource.js";

const CLOUD_TO_DC_GAP = 112; // wide enough for the terminate label to sit between the two boxes
const CLOUD_GAP = 48;        // VPCs | hub | the two paths
const VPC_STACK_GAP = 32;
const MEMBER_GAP = 24;       // between the two nodes inside a VPC or the data center
const PATH_GAP = 40;         // Direct Connect over Site-to-Site VPN
// Lowers Direct Connect onto the hub's row, so the primary path is one straight line
// and the hub sits on that row instead of floating between the two paths. A Spacer
// rather than a Move: it is measured, so the AWS Cloud box grows with it and keeps the
// VPN caption inside.
const DIRECT_CONNECT_DROP = 128;
// The data center is centred beside the cloud, which leaves the customer gateway 16px
// above the hub's row. A Move is fine out here at the top level, because the canvas is
// fitted to where things finally land; inside a Group, use a Spacer.
const DATA_CENTER_NUDGE = 16;

// A workload VPC: the app tier and its database. `prefix` keeps the ids apart.
const workloadVpc = (prefix: string, label: string) => (
  <Group kind="vpc" id={`${prefix}-vpc`} label={label} gap={MEMBER_GAP}>
    <Node id={`${prefix}-eks`} icon={AmazonElasticKubernetesService} label="Amazon EKS" sub="app tier" />
    <Node id={`${prefix}-rds`} icon={AmazonRDS} label="Amazon RDS" sub="data" />
  </Group>
);

export default (
  <Diagram title="Hybrid Network — Transit Gateway + On-Prem" layout="row" gap={CLOUD_TO_DC_GAP} align="center">
    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="row" gap={CLOUD_GAP} align="center">
      <VStack gap={VPC_STACK_GAP} align="end">
        {workloadVpc("a", "VPC A — 10.0.0.0/16")}
        {workloadVpc("b", "VPC B — 10.1.0.0/16")}
      </VStack>

      <Node id="tgw" icon={AWSTransitGateway} label="AWS Transit Gateway" />

      <VStack gap={PATH_GAP} align="start">
        <Spacer size={DIRECT_CONNECT_DROP} />
        <Node id="dx" icon={AWSDirectConnect} label="AWS Direct Connect" sub="primary" />
        <Node id="vpn" icon={AWSSiteToSiteVPN} label="AWS Site-to-Site VPN" sub="backup" />
      </VStack>
    </Group>

    <Move dy={DATA_CENTER_NUDGE}>
      <Group kind="datacenter" id="corporate-data-center" label="Corporate data center" gap={MEMBER_GAP}>
        <Node id="cgw" icon={AmazonVPCCustomerGateway} label="Customer gateway" />
        <Node id="srv" icon={Server} label="Servers" sub="172.16.0.0/16" />
      </Group>
    </Move>

    {/* Attachments: each from its VPC's box, on a hub face of its own. */}
    <Arrow id="a-att-a" from="a-vpc" to="tgw" fromSide="right" toSide="top">attach</Arrow>
    <Arrow id="a-att-b" from="b-vpc" to="tgw" fromSide="right" toSide="left" />
    {/* The two redundant paths leave the hub's remaining faces... */}
    <Arrow id="a-dx" from="tgw" to="dx" fromSide="right" toSide="left">dedicated</Arrow>
    <Arrow id="a-vpn" from="tgw" to="vpn" fromSide="bottom" toSide="left" dashed>encrypted</Arrow>
    {/* ...and land on different faces of the customer gateway. */}
    <Arrow id="a-dx-cgw" from="dx" to="cgw" fromSide="right" toSide="left">terminate</Arrow>
    <Arrow from="vpn" to="cgw" fromSide="right" toSide="bottom" dashed />
    <Arrow from="cgw" to="srv" />
  </Diagram>
);
