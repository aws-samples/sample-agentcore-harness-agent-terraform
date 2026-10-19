// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Starter example: a serverless REST API, Users -> API Gateway -> Lambda -> DynamoDB.
//
// The smallest complete scene, written with layout primitives only. It has no x/y,
// no edges() and no hand-sized boxes: the scene states the structure and the engine
// computes every position on the 8px grid.
//
//  - A <Node> is an icon plus its caption, measured as one box.
//  - A <Group> lays out its children (as a row unless told otherwise) under a title
//    band, inside 16px of padding, and shrinks to fit them. AWS Cloud > Region > VPC
//    is simply three nested Groups.
//  - <Diagram layout="row"> places the Users actor beside the cloud.
//  - <Arrow from to> joins two ids; the engine picks the facing sides and the gap.
//
// Grow a scene one node at a time: keep the watcher running
// (npm run watch -- assets/examples/serverless-api.tsx), look at the SVG after each
// change, then add the next node. The layout report flags overlaps, clipping and
// misalignment on every save.
import { Diagram, Group, HStack, VStack, Node, Arrow, Spacer } from "../../src/engine.tsx";
import { Users } from "../../src/icons/resource.js";
import { AmazonAPIGateway, AWSLambda, AmazonDynamoDB } from "../../src/icons/service.js";

const ACTOR_GAP = 48;   // Users to the AWS Cloud box
const SERVICE_GAP = 40; // between the services, each hop wide enough for its label
// Every Group starts its content 48px below its own top (32px title band + 16px
// padding), so API Gateway sits three bands down. The centred diagram row already
// lowers the Users column by 48px; this Spacer adds the other 96px, which puts Users
// level with API Gateway. HTTPS is then one straight hop, instead of an elbow whose
// riser would run along the AWS Cloud border.
const USERS_DROP = 96;

export default (
  <Diagram title="Serverless REST API" layout="row" gap={ACTOR_GAP} align="center">
    <VStack gap={0}>
      <Spacer size={USERS_DROP} />
      <Node id="users" icon={Users} label="Users" />
    </VStack>

    <Group kind="aws-cloud" label="AWS Cloud">
      <Group kind="region" label="Region: us-east-1">
        <Group kind="vpc" label="VPC" gap={SERVICE_GAP}>
          <HStack gap={SERVICE_GAP}>
            <Node id="api" icon={AmazonAPIGateway} label="Amazon API Gateway" />
            <Node id="fn" icon={AWSLambda} label="AWS Lambda" />
            <Node id="ddb" icon={AmazonDynamoDB} label="Amazon DynamoDB" />
          </HStack>
        </Group>
      </Group>
    </Group>

    {/* labelAt="start" keeps HTTPS out by Users, in open space rather than on the
        AWS Cloud border. A "\n" breaks a label that is wider than its hop. */}
    <Arrow from="users" to="api" labelAt="start">HTTPS</Arrow>
    <Arrow from="api" to="fn">invoke</Arrow>
    <Arrow from="fn" to="ddb">{"read /\nwrite"}</Arrow>
  </Diagram>
);
