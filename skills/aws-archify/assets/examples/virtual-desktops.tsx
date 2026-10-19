// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Virtual desktops for remote staff with Amazon WorkSpaces: desktops in two Availability Zones,
// identity from AWS Managed Microsoft AD with a trust to the corporate domain, and home folders
// on Amazon FSx for Windows File Server.
//
//                      +-> WorkSpaces (AZ a) --sign in--> Managed AD (AZ a) --+
//   WorkSpaces client -+        | home folders                                 +-> Site-to-Site VPN --AD trust--> Active Directory
//                      |        v FSx (preferred)                              |                                    (on premises)
//                      +-> WorkSpaces (AZ b) --sign in--> Managed AD (AZ b) --+
//                               | home folders
//                               v FSx (standby)
//
// What it shows:
//  - One private subnet per Availability Zone, as the WorkSpaces admin guide sets it up: the
//    directory's domain controller, the desktops and the FSx file server of that zone share it.
//    Each subnet is the same 2 x 2 cell grid, so the two zones read as one stack drawn twice.
//  - Fan-out and fan-in on one axis. The client fans out to both zones' desktops and both
//    domain controllers fan in to the VPN, each pair turning on one shared absolute riser.
//  - The connection sits between the two sites it joins, outside both boxes, so the Region
//    hugs its VPC instead of carrying an empty column for one node.
//  - A row with no hole. The client, the VPN and the on-premises directory sit on the row of
//    the AZ a file server, so that row has an even pitch across the whole figure; on the exact
//    midpoint between the zones it would be three nodes with the whole VPC as one gap.
//  - Straight hops inside each zone: WorkSpaces to its domain controller runs right, to its file
//    server runs down, so no arrow inside a subnet bends.
//
// Names and stand-ins:
//  - AWS Managed Microsoft AD is the AWS Directory Service resource icon of that name.
//  - Amazon FSx for Windows File Server uses the service icon the set names "Amazon FSx for WFS".
//  - General icons: Client (the WorkSpaces client on staff devices) and Servers (the on-premises
//    Active Directory domain controllers).
//  - Left out on purpose: the NAT gateway for desktop internet access, and the AWS-managed
//    streaming gateway the client connects through (the stream ends on each WorkSpace).
// Build/verify: npm run render -- assets/examples/virtual-desktops.tsx
import { Diagram, Group, HStack, VStack, ZStack, Node, Arrow, Rect } from "../../src/engine.tsx";
import type { Figure } from "../../src/engine.tsx";
import { Client, Servers, AWSDirectoryServiceAWSManagedMicrosoftAD } from "../../src/icons/resource.js";
import { AmazonWorkSpaces, AmazonFSxForWFS, AWSSiteToSiteVPN } from "../../src/icons/service.js";

const BAND = 48;            // 32px title band + 16px padding: where a group's first child starts
const PAD = 16;             // a group's default side padding
const NODE_H = 88;          // a node with a one-line label and a sub line
const CLIENT_CELL_W = 128;  // "WorkSpaces client" needs 128px
const WS_CELL_W = 144;      // also the FSx column, which sits under the desktops
const AD_CELL_W = 176;      // "AWS Managed Microsoft AD" on one line
const VPN_CELL_W = 144;
const ONPREM_CELL_W = 128;
const CLIENT_GAP = 80;      // client to the AWS Cloud: the fan-out turns mid-way
const VPN_GAP = 48;         // AWS Cloud to the VPN: the fan-in turns mid-way
// VPN to the data center. Wide enough that the axis row keeps an even pitch: its widest gap,
// the AZ a file server to the VPN, stays under 1.8x the VPN to the on-premises directory.
const DC_GAP = 88;
const HOP_GAP = 32;         // WorkSpaces to its domain controller; "sign in" spans the cells' margins
const DOWN_GAP = 40;        // WorkSpaces down to its file server, "home folders" beside the line
const AZ_GAP = 24;          // AZ a subnet to AZ b subnet
// The desktops' icons sit four bands down (AWS Cloud, Region, VPC, subnet).
const WS_A_TOP = 4 * BAND;
// The AZ a file server's icon centre: one node and DOWN_GAP below the desktops' icons.
const FSX_A_MID = WS_A_TOP + NODE_H + DOWN_GAP + 24;
// The shared row: 16px below the AZ a file server's icon centre, so its node centre stays within
// that row (a node's centre is its icon plus caption) while the fan-out and fan-in, which reach
// both zones, stay close to symmetric.
const AXIS_MID = FSX_A_MID + 16;
const AXIS_TOP = AXIS_MID - 24;         // icon top of the client, the VPN and the on-premises AD
const DC_DROP = AXIS_TOP - BAND;        // the data center's own band sits above its icon
// The AWS Cloud is one subnet wide plus the AWS Cloud, Region and VPC paddings on both sides.
const SUBNET_W = PAD + WS_CELL_W + HOP_GAP + AD_CELL_W + PAD;
const CLOUD_W = 6 * PAD + SUBNET_W;
// Absolute risers (layout x): the client's fan-out turns mid-way between the client and the AWS
// Cloud; the domain controllers' fan-in turns mid-way between the AWS Cloud and the VPN.
const FANOUT_RISER = CLIENT_CELL_W + CLIENT_GAP / 2;
const FANIN_RISER = CLIENT_CELL_W + CLIENT_GAP + CLOUD_W + VPN_GAP / 2;

// An invisible box: it takes up room like any element, so it spaces things exactly.
const invisible = (w: number, h: number) => <Rect w={w} h={h} stroke="none" fill="none" />;
// Centre a node in a cell `w` wide, so the nodes of one column line up.
const cell = (node: Figure, w: number) => <ZStack>{invisible(w, 8)}{node}</ZStack>;
// Lower `child` by `h` px.
const lowered = (h: number, child: Figure) => (
  <VStack gap={0} align="start">{invisible(8, h)}{child}</VStack>
);
// One Availability Zone's private subnet: desktops and domain controller on top, the file
// server under the desktops. `az` keeps the ids apart.
const azSubnet = (az: string, fsxRole: string) => (
  <Group kind="private-subnet" id={`subnet-${az}`} label={`Private Subnet (AZ ${az})`} layout="col" gap={DOWN_GAP}
    align="start">
    <HStack gap={HOP_GAP} align="start">
      {cell(<Node id={`ws-${az}`} icon={AmazonWorkSpaces} label="Amazon WorkSpaces" sub="virtual desktops" />, WS_CELL_W)}
      {cell(<Node id={`ad-${az}`} icon={AWSDirectoryServiceAWSManagedMicrosoftAD} label="AWS Managed Microsoft AD"
        sub="domain controller" />, AD_CELL_W)}
    </HStack>
    {cell(<Node id={`fsx-${az}`} icon={AmazonFSxForWFS} label={"Amazon FSx for\nWindows File Server"} sub={fsxRole} />,
      WS_CELL_W)}
  </Group>
);

export default (
  <Diagram title="Virtual Desktops with Amazon WorkSpaces"
    subtitle="Remote staff stream desktops from two Availability Zones, sign in with corporate accounts and keep home folders on FSx"
    layout="row" gap={0} align="start">
    {lowered(AXIS_TOP,
      cell(<Node id="client" icon={Client} label="WorkSpaces client" sub="remote staff" />, CLIENT_CELL_W))}
    {invisible(CLIENT_GAP, 8)}

    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud">
      <Group kind="region" id="region" label="Region: us-east-1">
        <Group kind="vpc" id="vpc" label="VPC" layout="col" gap={AZ_GAP}>
          {azSubnet("a", "preferred file server")}
          {azSubnet("b", "standby file server")}
        </Group>
      </Group>
    </Group>
    {invisible(VPN_GAP, 8)}

    {lowered(AXIS_TOP,
      cell(<Node id="vpn" icon={AWSSiteToSiteVPN} label="AWS Site-to-Site VPN" sub="or Direct Connect" />, VPN_CELL_W))}
    {invisible(DC_GAP, 8)}

    {lowered(DC_DROP,
      <Group kind="datacenter" id="corporate-data-center" label="Corporate Data Center">
        {cell(<Node id="onprem-ad" icon={Servers} label="Active Directory" sub="on-premises domain" />, ONPREM_CELL_W)}
      </Group>)}

    {/* The client fans out to both zones; one label on the shared stub names both branches. */}
    <Arrow id="a-stream-a" from="client" to="ws-a" fromSide="right" toSide="left" riser={FANOUT_RISER}
      labelAt="start">stream</Arrow>
    <Arrow id="a-stream-b" from="client" to="ws-b" fromSide="right" toSide="left" riser={FANOUT_RISER} />
    {/* Inside each zone: sign in to the domain controller, home folders on the file server. */}
    <Arrow id="a-signin-a" from="ws-a" to="ad-a">sign in</Arrow>
    <Arrow id="a-signin-b" from="ws-b" to="ad-b">sign in</Arrow>
    <Arrow id="a-home-a" from="ws-a" to="fsx-a" fromSide="bottom" toSide="top" labelSide="right">home folders</Arrow>
    <Arrow id="a-home-b" from="ws-b" to="fsx-b" fromSide="bottom" toSide="top" labelSide="right">home folders</Arrow>
    {/* Both domain controllers reach the corporate domain through the VPN. */}
    <Arrow id="a-trust-a" from="ad-a" to="vpn" fromSide="right" toSide="left" riser={FANIN_RISER} />
    <Arrow id="a-trust-b" from="ad-b" to="vpn" fromSide="right" toSide="left" riser={FANIN_RISER} />
    {/* The label starts at the VPN, outside every box, clear of the data center's border. */}
    <Arrow id="a-trust" from="vpn" to="onprem-ad" labelAt="start">AD trust</Arrow>
  </Diagram>
);
