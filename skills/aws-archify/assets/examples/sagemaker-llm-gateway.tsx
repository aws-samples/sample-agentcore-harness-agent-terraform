// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Amazon SageMaker as the LLM gateway: a self-hosted foundation model (for example a
// JumpStart model on a SageMaker real-time endpoint) that every inference call goes
// through. The counterpart to the managed-model example, bedrock-rag-assistant.tsx.
//
// The serving path is the usual way to put a SageMaker endpoint in front of clients,
// CloudFront -> API Gateway -> Lambda -> SageMaker endpoint (AWS Machine Learning Blog,
// "Call an Amazon SageMaker model endpoint using API Gateway and Lambda"). On top of it
// sit a RAG loop (a second SageMaker endpoint for embeddings and an OpenSearch vector
// index, as in the JumpStart RAG guidance), session state, a prompt cache, and
// security and operations services.
//
// The tiers, left to right in the Region, each a column of its parts:
//   Users -> Edge & Auth (CloudFront -> WAF -> Cognito) -> API (API Gateway, ElastiCache)
//         -> Inference (Lambda orchestrator -> SageMaker LLM and embeddings endpoints)
//         -> Knowledge & State (DynamoDB sessions, S3 corpus and artifacts,
//            OpenSearch vector index)
//   Security & Ops (KMS, Secrets Manager, CloudWatch) runs underneath, used by all.
//
// What it shows:
//  - Row alignment without anchors or elbows. Every tier uses the same row gap, so the
//    columns share one set of rows (the API tier fills the top two), and the Inference
//    and Knowledge columns are ordered so each link between them is a same-row
//    horizontal.
//  - Edge & Auth reads bottom-up: Users enter CloudFront on the bottom row and the
//    request climbs through WAF to Cognito, level with API Gateway, Lambda and DynamoDB.
//  - An arrow that points up at a node ends at an <Anchor> just under the node's
//    caption, which keeps its head off the text. Anchor x/y are layout coordinates:
//    re-measure them from the SVG after any layout change.
// Build/verify: npm run watch -- assets/examples/sagemaker-llm-gateway.tsx
import { Diagram, Group, VStack, ZStack, Node, Arrow, Rect, Anchor } from "../../src/engine.tsx";
import type { Figure } from "../../src/engine.tsx";
import { Users } from "../../src/icons/resource.js";
import {
  AmazonCloudFront, AWSWAF, AmazonCognito, AmazonAPIGateway, AWSLambda,
  AmazonSageMaker, AmazonOpenSearchService, AmazonSimpleStorageService,
  AmazonDynamoDB, AmazonElastiCache, AWSKeyManagementService, AWSSecretsManager,
  AmazonCloudWatch,
} from "../../src/icons/service.js";

const ROW_GAP = 48; // the same in every tier, which keeps the three rows aligned
const ACTOR_GAP = 48;
const USERS_DROP = 416; // Users level with CloudFront on the bottom row: HTTPS is straight
// The Region's tiers are 72px apart, and Edge and API share a borderless lane 96px wide
// that leaves room for the "authorized" label; together they keep the canvas at the
// 1280px document limit.
const TIER_GAP = 72;
const EDGE_TO_API_GAP = 96;
const REGION_TO_OPS_GAP = 40;
const OPS_GAP = 40;
// API cells are this wide so the API column's centre falls on the 8px grid, where an
// Anchor can sit under API Gateway.
const API_CELL_W = 160;
// Anchors at each target's centre x, 8px under its node box.
const UNDER_WAF = { x: 280, y: 376 };
const UNDER_COGNITO = { x: 280, y: 240 };
const UNDER_API_GATEWAY = { x: 552, y: 240 };

const drop = (h: number) => <Rect w={8} h={h} stroke="none" fill="none" />;
const cell = (node: Figure) => (
  <ZStack><Rect w={API_CELL_W} h={8} stroke="none" fill="none" />{node}</ZStack>
);

export default (
  <Diagram title="SageMaker as the LLM Gateway (self-hosted foundation model)" layout="row" gap={ACTOR_GAP} align="start">
    <VStack gap={0}>
      {drop(USERS_DROP)}
      <Node id="users" icon={Users} label="Users" sub="chat / app clients" />
    </VStack>

    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="col" gap={REGION_TO_OPS_GAP}>
      <Group kind="region" id="region" label="Region: us-east-1" layout="row" gap={TIER_GAP} align="start">
        {/* An invisible Group: it only gives Edge and API a gap of their own. */}
        <Group kind="borderless" layout="row" gap={EDGE_TO_API_GAP} align="start">
          {/* Internet-facing, read bottom-up. */}
          <Group kind="generic" id="edge" label="Edge & Auth" layout="col" gap={ROW_GAP}>
            <Node id="auth" icon={AmazonCognito} label="Amazon Cognito" sub="user auth" />
            <Node id="waf" icon={AWSWAF} label="AWS WAF" sub="edge protection" />
            <Node id="cdn" icon={AmazonCloudFront} label="Amazon CloudFront" sub="web app + API CDN" />
          </Group>

          <Group kind="generic" id="apitier" label="API" layout="col" gap={ROW_GAP}>
            {cell(<Node id="api" icon={AmazonAPIGateway} label="Amazon API Gateway" sub="inference REST API" />)}
            {cell(<Node id="cache" icon={AmazonElastiCache} label="Amazon ElastiCache" sub="prompt / response cache" />)}
          </Group>
        </Group>

        {/* SageMaker is the gateway every call goes through. These rows match the
            Knowledge column's: orchestrator / sessions, LLM / corpus, embeddings / vector. */}
        <Group kind="generic" id="inference" label="Inference" layout="col" gap={ROW_GAP}>
          <Node id="orch" icon={AWSLambda} label="AWS Lambda" sub="RAG orchestrator" />
          <Node id="llm" icon={AmazonSageMaker} label="Amazon SageMaker" sub="LLM endpoint (JumpStart)" />
          <Node id="embed" icon={AmazonSageMaker} label="Amazon SageMaker" sub="embeddings endpoint" />
        </Group>

        <Group kind="generic" id="data" label="Knowledge & State" layout="col" gap={ROW_GAP}>
          <Node id="sessions" icon={AmazonDynamoDB} label="Amazon DynamoDB" sub="sessions + history" />
          <Node id="corpus" icon={AmazonSimpleStorageService} label="Amazon S3" sub="corpus + model artifacts" />
          <Node id="vector" icon={AmazonOpenSearchService} label="Amazon OpenSearch Service" sub="vector index (RAG)" />
        </Group>
      </Group>

      <Group kind="generic" id="secops" label="Security & Ops" layout="row" gap={OPS_GAP}>
        <Node id="kms" icon={AWSKeyManagementService} label="AWS Key Management Service" sub="encryption keys" />
        <Node id="secrets" icon={AWSSecretsManager} label="AWS Secrets Manager" sub="endpoint credentials" />
        <Node id="cw" icon={AmazonCloudWatch} label="Amazon CloudWatch" sub="metrics + model latency" />
      </Group>
    </Group>

    {/* The request: into CloudFront, up through Edge & Auth, across to the orchestrator. */}
    <Arrow from="users" to="cdn" labelAt="start">HTTPS</Arrow>
    <Anchor id="waf-in" x={UNDER_WAF.x} y={UNDER_WAF.y} />
    <Anchor id="auth-in" x={UNDER_COGNITO.x} y={UNDER_COGNITO.y} />
    <Arrow from="cdn" to="waf-in" />
    <Arrow from="waf" to="auth-in" />
    <Arrow from="auth" to="api">authorized</Arrow>
    <Arrow from="api" to="orch">invoke</Arrow>
    {/* API Gateway caches hot prompts. */}
    <Anchor id="api-cap" x={UNDER_API_GATEWAY.x} y={UNDER_API_GATEWAY.y} />
    <Arrow from="cache" to="api-cap" head="both" />

    {/* Inside Inference: neighbours in the column, so each hop is a short vertical. */}
    <Arrow from="orch" to="llm">generate</Arrow>
    <Arrow from="llm" to="embed">embed query</Arrow>
    {/* Across to Knowledge & State, one row each: state, model artifacts, retrieval. */}
    <Arrow from="orch" to="sessions" head="both">{"read /\nwrite"}</Arrow>
    <Arrow from="llm" to="corpus">{"load\nmodel"}</Arrow>
    <Arrow from="embed" to="vector" head="both">retrieve</Arrow>
    {/* The S3 corpus feeds the vector index right below it. */}
    <Arrow from="corpus" to="vector">index docs</Arrow>
  </Diagram>
);
