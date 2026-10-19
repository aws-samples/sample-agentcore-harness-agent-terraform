// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// EKS microservices e-commerce platform: shoppers reach Amazon EKS microservices
// through Route 53, CloudFront, AWS WAF and an Application Load Balancer, with a data
// tier, async messaging and shared platform services beside the cluster.
//
// The request runs left to right along the top, then straight down into the VPC:
//   Shoppers -> Route 53 -> CloudFront -> WAF         (Edge, the top row)
//                                          | ALB        (public subnet, across the VPC top)
//                                          | Storefront (EKS grid, right column)
//   Shipping -> SNS on the left (Async / events); Orders -> Aurora and
//   Catalog -> DynamoDB on the right (Data tier). Platform has no arrows: every
//   service uses it.
//
// Every one-to-one hop is a straight line because its two nodes share a row or a
// column. How the rows and columns are made to line up:
//  - Each node sits in a fixed-width cell (an invisible <Rect> under it in a <ZStack>)
//    and has a two-line caption, so all nodes are the same size and centre alike.
//  - Spacing does the rest: the Edge gap puts WAF over the ALB, a blank before the ALB
//    puts it over Storefront, and invisible boxes above Shoppers, Async / events, the
//    Data tier and Platform lower each one by the title bands it sits outside of.
// Build/verify: npm run watch -- assets/examples/eks-ecommerce.tsx
import { Diagram, Group, VStack, HStack, ZStack, Node, Arrow, Rect } from "../../src/engine.tsx";
import type { Figure } from "../../src/engine.tsx";
import { Users } from "../../src/icons/resource.js";
import {
  AmazonRoute53, AmazonCloudFront, AWSWAF, ElasticLoadBalancing,
  AmazonElasticKubernetesService, AmazonAurora, AmazonElastiCache, AmazonDynamoDB,
  AmazonSimpleQueueService, AmazonSimpleNotificationService,
  AmazonCognito, AmazonElasticContainerRegistry, AWSSecretsManager, AmazonSimpleStorageService,
} from "../../src/icons/service.js";

const CELL_W = 128;         // the default cell width
const SHOPPERS_CELL_W = 96; // narrower: at CELL_W the canvas would be 1304px, past 1280
const EVENTS_CELL_W = 112;
const ALB_CELL_W = 160;
const TIER_GAP = 48;        // Edge over the Region, and between the Region's columns
const VPC_GAP = 56;         // public subnet over private subnet
const GRID_COL_GAP = 24;    // between the two columns of the EKS grid
const ROW_GAP = 48;         // between the rows of the EKS grid, the Data tier and Platform
// Edge: 16 + 2 x (128 + 88) + 64 = 512 from the Edge box's left to WAF's centre, which
// is exactly where the ALB's centre lands in the Region below it.
const EDGE_GAP = 88;
// Inside either subnet the grid's right column is centred 232px in (16 + 128 + 24 + 64);
// this blank before the ALB cell puts the ALB there too (16 + 120 + 16 + 160 / 2).
const ALB_LEAD = 120;
// Widens the lane between Async / events and the VPC to 88px, room for "publish".
const EVENTS_LANE = 40;
// From the ALB's row down to the grid's first row is one node (88) plus this gap, so
// the second node of Async / events and of Platform lands on that grid row.
const DOWN_TO_GRID = 120;
// How far each outside column drops, by the 48px title bands and boxes it sits beside:
const SHOPPERS_DROP = 96;  // AWS Cloud and Edge bands: Shoppers level with Route 53
const EVENTS_DROP = 48;    // the VPC band: SQS level with the ALB
const DATA_DROP = 256;     // VPC band + public subnet (152) + VPC_GAP: level with the grid
const PLATFORM_DROP = 296; // Edge (152) + TIER_GAP + Region and VPC bands: level with the ALB

// An invisible box: it takes up room like any element, so it spaces things exactly.
const invisible = (w: number, h: number) => <Rect w={w} h={h} stroke="none" fill="none" />;
// Centre a node in a cell `w` wide.
const cell = (node: Figure, w = CELL_W) => <ZStack>{invisible(w, 8)}{node}</ZStack>;
// Lower `child` by `h` px.
const lowered = (h: number, child: Figure) => (
  <VStack gap={0} align="center">{invisible(8, h)}{child}</VStack>
);
const microservice = (id: string, role: string) =>
  cell(<Node id={id} icon={AmazonElasticKubernetesService} label="Amazon EKS" sub={role} />);

export default (
  <Diagram title="EKS Microservices E-Commerce Platform"
    subtitle="Edge services in front of an ALB and EKS microservices, with data, events and platform services in one Region"
    layout="row" gap={40} align="start">
    {/* Lowered so HTTPS is one straight hop into Route 53. */}
    {lowered(SHOPPERS_DROP,
      cell(<Node id="users" icon={Users} label="Shoppers" sub="web / mobile" />, SHOPPERS_CELL_W))}

    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="row" gap={16} align="start">
      <VStack gap={TIER_GAP} align="start">
        <Group kind="generic" id="edge" label="Edge" gap={EDGE_GAP}>
          {cell(<Node id="dns" icon={AmazonRoute53} label="Amazon Route 53" sub="DNS" />)}
          {cell(<Node id="cdn" icon={AmazonCloudFront} label="Amazon CloudFront" sub="CDN" />)}
          {cell(<Node id="waf" icon={AWSWAF} label="AWS WAF" sub="web ACL" />)}
        </Group>

        <Group kind="region" id="region-us-east-1" label="Region: us-east-1" layout="row" gap={TIER_GAP} align="start">
          {/* Async / events on the left: SQS on the ALB's row, SNS on the grid's first
              row, so Shipping publishes straight across. */}
          <HStack gap={0} align="start">
            {lowered(EVENTS_DROP,
              <Group kind="generic" id="async-events" label="Async / events" layout="col" gap={DOWN_TO_GRID}>
                {cell(<Node id="sqs" icon={AmazonSimpleQueueService} label="Amazon SQS" sub="jobs" />, EVENTS_CELL_W)}
                {cell(<Node id="sns" icon={AmazonSimpleNotificationService} label="Amazon SNS" sub="order events" />,
                  EVENTS_CELL_W)}
              </Group>)}
            {invisible(EVENTS_LANE, 8)}
          </HStack>

          <Group kind="vpc" id="vpc" label="VPC" layout="col" gap={VPC_GAP} align="start">
            {/* A strip as wide as the private subnet below it (both 328px). */}
            <Group kind="public-subnet" id="public-subnet" label="Public Subnet" gap={16}>
              {invisible(ALB_LEAD, 8)}
              {cell(<Node id="alb" icon={ElasticLoadBalancing} label="Elastic Load Balancing" sub="ALB" />, ALB_CELL_W)}
            </Group>
            <Group kind="private-subnet" id="private-subnet-eks-cluster" label="Private Subnet (EKS)" padRight={32}>
              <HStack gap={GRID_COL_GAP}>
                <VStack gap={ROW_GAP}>
                  {microservice("svc-ship", "Shipping")}
                  {microservice("svc-cart", "Cart")}
                  {microservice("svc-pay", "Payments")}
                </VStack>
                <VStack gap={ROW_GAP}>
                  {microservice("svc-web", "Storefront")}
                  {microservice("svc-order", "Orders")}
                  {microservice("svc-cat", "Catalog")}
                </VStack>
              </HStack>
            </Group>
          </Group>

          {/* The Data tier on the right, one store per grid row. padLeft keeps the
              arrow labels inside the box rather than on its border. */}
          {lowered(DATA_DROP,
            <Group kind="generic" id="data-tier" label="Data tier" layout="col" gap={ROW_GAP} padLeft={24}>
              {cell(<Node id="cache" icon={AmazonElastiCache} label="Amazon ElastiCache" sub="sessions" />)}
              {cell(<Node id="aurora" icon={AmazonAurora} label="Amazon Aurora" sub="orders" />)}
              {cell(<Node id="ddb" icon={AmazonDynamoDB} label="Amazon DynamoDB" sub="catalog" />)}
            </Group>)}
        </Group>
      </VStack>

      {/* Platform in the far column, no arrows: Cognito on the ALB's row and the other
          three on the grid's three rows. */}
      {lowered(PLATFORM_DROP,
        <Group kind="generic" id="platform" label="Platform" layout="col" gap={DOWN_TO_GRID}>
          {cell(<Node id="cognito" icon={AmazonCognito} label="Amazon Cognito" sub="auth" />)}
          <VStack gap={ROW_GAP}>
            {cell(<Node id="ecr" icon={AmazonElasticContainerRegistry} label="Amazon ECR" sub="images" />)}
            {cell(<Node id="secrets" icon={AWSSecretsManager} label="AWS Secrets Manager" sub="credentials" />)}
            {cell(<Node id="assets" icon={AmazonSimpleStorageService} label="Amazon S3" sub="assets" />)}
          </VStack>
        </Group>)}
    </Group>

    {/* The request flow: each hop shares a row or a column, so each is straight. */}
    <Arrow from="users" to="dns" labelAt="start">HTTPS</Arrow>
    <Arrow from="dns" to="cdn">resolve</Arrow>
    <Arrow from="cdn" to="waf">inspect</Arrow>
    <Arrow from="waf" to="alb" fromSide="bottom" toSide="top">forward</Arrow>
    <Arrow from="alb" to="svc-web" fromSide="bottom" toSide="top">route</Arrow>
    <Arrow from="svc-ship" to="sns">publish</Arrow>
    <Arrow from="svc-order" to="aurora" labelAt="end">{"read /\nwrite"}</Arrow>
    <Arrow from="svc-cat" to="ddb" labelAt="end">query</Arrow>
  </Diagram>
);
