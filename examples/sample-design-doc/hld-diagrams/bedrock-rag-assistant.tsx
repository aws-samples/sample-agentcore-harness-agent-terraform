// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Complex example: a generative-AI RAG assistant on Amazon Bedrock.
//
// Retrieval-augmented generation for a chatbot — distinct from the ML *training*
// pipeline example (this is inference/serving + a vector knowledge base). Retrieval
// runs on the left, ingestion on the right, and both meet at the vector index:
//
//   Users → Edge (CloudFront → Cognito → API Gateway)       a top-down column
//     ├─ Query:      Orchestrator Lambda → Bedrock (embed+generate)
//     │              ↕ OpenSearch (vector search) ; DynamoDB (chat history)
//     └─ Ingestion:  Step Functions → S3 docs → Textract → Embedder Lambda
//                    → OpenSearch index   (populates the same knowledge base)
//
// Every link is one straight run, which is what the offsets are for: the Edge
// column is dropped 48px so CloudFront does not sit in the same row as the
// Ingestion column's first node, and the RAG runtime is dropped far enough that
// its top row (orchestrator, Bedrock) is level with API Gateway and its bottom row
// (DynamoDB, OpenSearch) is level with the Embedder at the foot of Ingestion.
// The retrieve arrow ends at an Anchor just under Bedrock's caption, so its upper
// arrowhead stays clear of the text. Its x/y are layout coordinates (Bedrock's
// centre, 14px under its caption): re-measure them from the SVG after any change.
// Figure 1 of RAG-ASSISTANT-HLD.md (canvas kept under 1100px for page width).
// Build/verify: the ../src imports resolve from the aws-archify skill's scenes/ folder,
// so copy this file there, run `npm run render -- scenes/bedrock-rag-assistant.tsx` in
// the skill folder, copy the .svg back beside this file and delete the copy in scenes/.
import { Diagram, Group, VStack, ZStack, Node, Arrow, Rect, Anchor, Figure } from "../src/engine.tsx";
import { Users } from "../src/icons/resource.js";
import {
  AmazonCloudFront, AmazonCognito, AmazonAPIGateway, AWSLambda, AmazonBedrock,
  AmazonOpenSearchService, AmazonDynamoDB, AWSStepFunctions, AmazonSimpleStorageService,
  AmazonTextract,
} from "../src/icons/service.js";

const pad = (h: number) => <Rect w={8} h={h} stroke="none" fill="none" />;
// A fixed-width cell: 192 puts the Knowledge base column centre on the 8px grid,
// so the retrieve Anchor can sit exactly under Bedrock.
const cell = (node: Figure, w = 192) => (
  <ZStack><Rect w={w} h={8} stroke="none" fill="none" />{node}</ZStack>
);

export default (
  <Diagram title="Generative-AI RAG Assistant on Amazon Bedrock" layout="row" gap={64} align="start">
    {/* Lowered level with CloudFront, so HTTPS is one straight hop. */}
    <VStack gap={0}>
      {pad(144)}
      <Node id="users" icon={Users} label="Users" sub="chat UI" />
    </VStack>

    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="row" gap={64} align="start">
      {/* Edge, lowered 48px so CloudFront is not level with the Ingestion column's
          first node — otherwise the top row reads as a row of three with a hole. */}
      <VStack gap={0}>
      {pad(48)}
      <Group kind="generic" id="edge" label="Edge" layout="col" gap={32}>
        <Node id="cdn" icon={AmazonCloudFront} label="Amazon CloudFront" />
        <Node id="auth" icon={AmazonCognito} label="Amazon Cognito" sub="auth" />
        <Node id="api" icon={AmazonAPIGateway} label="Amazon API Gateway" />
      </Group>
      </VStack>

      {/* Query / RAG runtime + shared knowledge base, lowered 176px so its top row is
          level with API Gateway; the 48px row gap puts its bottom row level with the
          Embedder (Ingestion gap 32). */}
      <VStack gap={0}>
        {pad(224)}
        <Group kind="generic" id="rag-runtime" label="RAG runtime" layout="row" gap={24} align="start">
          <Group kind="generic" id="orchestration" label="Orchestration" layout="col" gap={48}>
            <Node id="orch" icon={AWSLambda} label="AWS Lambda" sub="RAG orchestrator" />
            <Node id="history" icon={AmazonDynamoDB} label="Amazon DynamoDB" sub="chat history" />
          </Group>
          <Group kind="generic" id="knowledge-base" label="Knowledge base" layout="col" gap={48}>
            {cell(<Node id="bedrock" icon={AmazonBedrock} label="Amazon Bedrock" sub="embed + LLM" />)}
            {cell(<Node id="vector" icon={AmazonOpenSearchService} label="Amazon OpenSearch Service" sub="vector index" />)}
          </Group>
        </Group>
      </VStack>

      {/* Ingestion pipeline (populates the vector index) */}
      <Group kind="generic" id="ingestion" label="Ingestion" layout="col" gap={48}>
        <Node id="sfn" icon={AWSStepFunctions} label="AWS Step Functions" sub="ingest job" />
        <Node id="docs" icon={AmazonSimpleStorageService} label="Amazon S3" sub="documents" />
        <Node id="ocr" icon={AmazonTextract} label="Amazon Textract" sub="extract" />
        <Node id="embed" icon={AWSLambda} label="AWS Lambda" sub="chunk + embed" />
      </Group>
    </Group>

    {/* Entry + query flow */}
    <Arrow from="users" to="cdn" labelAt="start">HTTPS</Arrow>
    <Arrow from="cdn" to="auth" />
    <Arrow from="auth" to="api" />
    <Arrow from="api" to="orch">query</Arrow>
    <Arrow from="orch" to="bedrock" />
    <Arrow from="orch" to="history" />
    {/* RAG loop: Bedrock retrieves context from the vector index */}
    <Anchor id="bedrock-cap" x={664} y={464} />
    <Arrow from="vector" to="bedrock-cap" head="both">retrieve</Arrow>
    {/* Ingestion flow (top-down), ending by writing into the vector index */}
    <Arrow from="sfn" to="docs" />
    <Arrow from="docs" to="ocr" />
    <Arrow from="ocr" to="embed" />
    {/* Drawn from the index end (head="start") so labelAt="start" puts "upsert"
        inside Knowledge base, clear of both group borders. */}
    <Arrow from="vector" to="embed" head="start" labelAt="start">upsert</Arrow>
  </Diagram>
);
