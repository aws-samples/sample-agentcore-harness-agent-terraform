// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Generative-AI RAG assistant on Amazon Bedrock: a chat front end whose answers are
// grounded in a vector knowledge base, plus the pipeline that fills that knowledge
// base. This is inference and serving, not model training (see multitenant-ml.tsx).
//
// Retrieval runs on the left, ingestion on the right, and both meet at the vector index:
//   Users -> Edge (CloudFront -> Cognito -> API Gateway), a top-down column
//     query:     Lambda orchestrator -> Bedrock (embed + generate)
//                Bedrock <-> OpenSearch vector index; DynamoDB keeps chat history
//     ingestion: Step Functions -> S3 documents -> Textract -> Lambda embedder
//                -> the same OpenSearch index
//
// What it shows: deliberate column offsets. Every link is one straight run because
// invisible boxes drop each column onto the rows it connects to (see the drops below).
// The retrieve arrow ends at an <Anchor> just under Bedrock's caption, so its upper
// arrowhead stays clear of the text. Anchor x/y are layout coordinates: re-measure them
// from the SVG after any layout change.
// Build/verify: npm run watch -- assets/examples/bedrock-rag-assistant.tsx
import { Diagram, Group, VStack, ZStack, Node, Arrow, Rect, Anchor } from "../../src/engine.tsx";
import type { Figure } from "../../src/engine.tsx";
import { Users } from "../../src/icons/resource.js";
import {
  AmazonCloudFront, AmazonCognito, AmazonAPIGateway, AWSLambda, AmazonBedrock,
  AmazonOpenSearchService, AmazonDynamoDB, AWSStepFunctions, AmazonSimpleStorageService,
  AmazonTextract,
} from "../../src/icons/service.js";

const COLUMN_GAP = 64;
const EDGE_GAP = 32;
const ROW_GAP = 48; // one gap in the RAG runtime and in Ingestion, so their rows match
// Knowledge base cells are this wide so the column's centre falls on the 8px grid,
// where the retrieve Anchor can sit exactly under Bedrock.
const KB_CELL_W = 192;
// Drops, each from the top of the row its column sits in:
const USERS_DROP = 144; // Users level with CloudFront, so HTTPS is one straight hop
// Edge drops one band so CloudFront is not level with Ingestion's first node; on the
// same row the top would read as a row of three with a hole in it.
const EDGE_DROP = 48;
// The RAG runtime's top row (orchestrator, Bedrock) lands level with API Gateway, and
// its bottom row (DynamoDB, OpenSearch) level with the Embedder at the foot of Ingestion.
const RAG_DROP = 224;
// Bedrock's centre x, 8px under the bottom of its node box (just below the caption).
const BEDROCK_CAPTION_ANCHOR = { x: 664, y: 464 };

const drop = (h: number) => <Rect w={8} h={h} stroke="none" fill="none" />;
const cell = (node: Figure) => (
  <ZStack><Rect w={KB_CELL_W} h={8} stroke="none" fill="none" />{node}</ZStack>
);

export default (
  <Diagram title="Generative-AI RAG Assistant on Amazon Bedrock" layout="row" gap={COLUMN_GAP} align="start">
    <VStack gap={0}>
      {drop(USERS_DROP)}
      <Node id="users" icon={Users} label="Users" sub="chat UI" />
    </VStack>

    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="row" gap={COLUMN_GAP} align="start">
      <VStack gap={0}>
        {drop(EDGE_DROP)}
        <Group kind="generic" id="edge" label="Edge" layout="col" gap={EDGE_GAP}>
          <Node id="cdn" icon={AmazonCloudFront} label="Amazon CloudFront" />
          <Node id="auth" icon={AmazonCognito} label="Amazon Cognito" sub="auth" />
          <Node id="api" icon={AmazonAPIGateway} label="Amazon API Gateway" />
        </Group>
      </VStack>

      {/* The query path and the knowledge base it shares with ingestion. */}
      <VStack gap={0}>
        {drop(RAG_DROP)}
        <Group kind="generic" id="rag-runtime" label="RAG runtime" layout="row" gap={24} align="start">
          <Group kind="generic" id="orchestration" label="Orchestration" layout="col" gap={ROW_GAP}>
            <Node id="orch" icon={AWSLambda} label="AWS Lambda" sub="RAG orchestrator" />
            <Node id="history" icon={AmazonDynamoDB} label="Amazon DynamoDB" sub="chat history" />
          </Group>
          <Group kind="generic" id="knowledge-base" label="Knowledge base" layout="col" gap={ROW_GAP}>
            {cell(<Node id="bedrock" icon={AmazonBedrock} label="Amazon Bedrock" sub="embed + LLM" />)}
            {cell(<Node id="vector" icon={AmazonOpenSearchService} label="Amazon OpenSearch Service" sub="vector index" />)}
          </Group>
        </Group>
      </VStack>

      {/* Ingestion fills the vector index. */}
      <Group kind="generic" id="ingestion" label="Ingestion" layout="col" gap={ROW_GAP}>
        <Node id="sfn" icon={AWSStepFunctions} label="AWS Step Functions" sub="ingest job" />
        <Node id="docs" icon={AmazonSimpleStorageService} label="Amazon S3" sub="documents" />
        <Node id="ocr" icon={AmazonTextract} label="Amazon Textract" sub="extract" />
        <Node id="embed" icon={AWSLambda} label="AWS Lambda" sub="chunk + embed" />
      </Group>
    </Group>

    {/* Sign-in and the query. */}
    <Arrow from="users" to="cdn" labelAt="start">HTTPS</Arrow>
    <Arrow from="cdn" to="auth" />
    <Arrow from="auth" to="api" />
    <Arrow from="api" to="orch">query</Arrow>
    <Arrow from="orch" to="bedrock" />
    <Arrow from="orch" to="history" />
    {/* The RAG loop: Bedrock pulls context from the vector index, both ways. */}
    <Anchor id="bedrock-cap" x={BEDROCK_CAPTION_ANCHOR.x} y={BEDROCK_CAPTION_ANCHOR.y} />
    <Arrow from="vector" to="bedrock-cap" head="both">retrieve</Arrow>
    {/* Ingestion, top down, ending with a write into the index. */}
    <Arrow from="sfn" to="docs" />
    <Arrow from="docs" to="ocr" />
    <Arrow from="ocr" to="embed" />
    {/* Drawn from the index end with the head at its start, so labelAt="start" puts
        "upsert" inside Knowledge base, clear of both group borders. */}
    <Arrow from="vector" to="embed" head="start" labelAt="start">upsert</Arrow>
  </Diagram>
);
