// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Hub-and-spoke network with centralized inspection and egress. Three workload
// VPCs attach to an AWS Transit Gateway. The Transit Gateway sends spoke traffic
// to an inspection VPC, where AWS Network Firewall inspects it before a NAT
// gateway and an internet gateway take it to the internet. The corporate data
// center connects to the same Transit Gateway over AWS Site-to-Site VPN.
//
//   Workload VPCs A/B/C --attach--> Transit Gateway --> Network Firewall --> NAT gateway --> Internet gateway --> Internet
//                                        |
//                                 Site-to-Site VPN --> Customer gateway --> Servers
import { Diagram, Group, HStack, VStack, Node, Arrow, Move, Rect } from "../../src/engine.tsx";
import {
  Internet, Servers, AmazonVPCNATGateway, AmazonVPCInternetGateway, AmazonVPCCustomerGateway,
} from "../../src/icons/resource.js";
import {
  AWSTransitGateway, AWSNetworkFirewall, AWSSiteToSiteVPN, AmazonEC2,
} from "../../src/icons/service.js";

const spoke = (id: string, name: string, cidr: string) => (
  <Group kind="vpc" id={`vpc-${id}`} label={`VPC (${name})`}>
    <Node id={`ec2-${id}`} icon={AmazonEC2} label="Amazon EC2" sub={cidr} />
  </Group>
);

export default (
  <Diagram title="Hub-and-Spoke Network with Centralized Inspection" layout="col" gap={48} align="start">
    <HStack gap={56} align="start">
      <Group kind="aws-cloud" id="cloud" label="AWS Cloud">
        <Group kind="region" id="region" label="Region">
          <Group kind="borderless" id="region-body" layout="col" gap={48} align="start">
            <Group kind="generic" id="spokes" label="Workload VPCs" gap={24}>
              {spoke("a", "Workload A", "10.1.0.0/16")}
              {spoke("b", "Workload B", "10.2.0.0/16")}
              {spoke("c", "Workload C", "10.3.0.0/16")}
            </Group>

            <HStack gap={48} align="start">
              <Rect w={184} h={8} stroke="none" fill="none" />
              <VStack gap={80} align="center">
                <VStack gap={0} align="center">
                  <Rect w={8} h={96} stroke="none" fill="none" />
                  <Node id="tgw" icon={AWSTransitGateway} label="AWS Transit Gateway" sub="hub" />
                </VStack>
                <Node id="vpn" icon={AWSSiteToSiteVPN} label="AWS Site-to-Site VPN" sub="two IPsec tunnels" />
              </VStack>

              <Group kind="vpc" id="inspection" label="VPC (Inspection)" gap={64} align="start">
                <Group kind="private-subnet" id="fw-subnet" label="Private Subnet">
                  <Node id="fw" icon={AWSNetworkFirewall} label="AWS Network Firewall" sub="stateful rules" />
                </Group>
                <Group kind="public-subnet" id="pub-subnet" label="Public Subnet">
                  <Node id="nat" icon={AmazonVPCNATGateway} label="NAT gateway" />
                </Group>
                <Move dy={48}>
                  <Node id="igw" icon={AmazonVPCInternetGateway} label="Internet gateway" />
                </Move>
              </Group>
            </HStack>
          </Group>
        </Group>
      </Group>

      <Move dy={456}>
        <Node id="internet" icon={Internet} label="Internet" />
      </Move>
    </HStack>

    <Move dx={88}>
    <Group kind="datacenter" id="dc" label="Corporate Data Center" gap={64}>
      <Node id="srv" icon={Servers} label="Servers" sub="172.16.0.0/16" />
      <Node id="cgw" icon={AmazonVPCCustomerGateway} label="Customer gateway (CGW)" />
    </Group>
    </Move>

    <Arrow from="spokes" to="tgw" fromSide="bottom" toSide="top">VPC attachments</Arrow>
    <Arrow from="tgw" to="fw" fromSide="right" toSide="left" labelAt="start">inspect</Arrow>
    <Arrow from="fw" to="nat" fromSide="right" toSide="left">allowed</Arrow>
    <Arrow from="nat" to="igw" fromSide="right" toSide="left">egress</Arrow>
    <Arrow from="igw" to="internet" fromSide="right" toSide="left" labelAt="end">public</Arrow>
    <Arrow from="tgw" to="vpn" fromSide="bottom" toSide="top">VPN attachment</Arrow>
    <Arrow from="vpn" to="cgw" fromSide="bottom" toSide="top">IPsec</Arrow>
    <Arrow from="cgw" to="srv" fromSide="left" toSide="right">LAN</Arrow>
  </Diagram>
);
