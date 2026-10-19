// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Multi-tenant SaaS with a shared AI/ML pipeline: tenants sign in through one control
// plane, each keeps an isolated database, and all of them feed one shared training and
// inference pipeline.
//
// Left to right, so connected components sit side by side and arrows stay short:
//   Tenants -> control plane (Cognito -> API Gateway -> Lambda tenant router)
//           -> one isolated data store per tenant
//           -> shared ML pipeline: Kinesis -> Glue ETL -> S3 data lake,
//              then SageMaker training -> model registry -> inference endpoint.
//
// What it shows:
//  - Tenant isolation (the silo model) as a column of small <Group>s inside one
//    account box, one store each, so the isolation is visible at a glance.
//  - The pipeline's two rows line up with the tenant rows. Ingest & ETL runs left to
//    right on Tenant B's row, so Tenant B -> Kinesis is straight. Train & serve runs
//    back right to left on Tenant C's row and starts with SageMaker directly under S3,
//    so S3 -> training is one straight drop into the right end of the Train & serve
//    box, far from its title.
//  - Every pipeline node sits in a fixed-width cell, so the two rows share columns;
//    invisible boxes lower the tenants and the pipeline onto their rows.
// Build/verify: npm run watch -- assets/examples/multitenant-ml.tsx
import { Diagram, Group, VStack, ZStack, Node, Arrow, Rect } from "../../src/engine.tsx";
import type { Figure } from "../../src/engine.tsx";
import { Users } from "../../src/icons/resource.js";
import {
  AmazonCognito, AmazonAPIGateway, AWSLambda, AmazonAurora, AmazonSimpleStorageService,
  AmazonKinesis, AWSGlue, AmazonSageMaker, AmazonElasticContainerRegistry,
} from "../../src/icons/service.js";

const PIPELINE_CELL_W = 128; // one pipeline column
const STAGE_GAP = 24;        // between pipeline steps in a row
// Between the tenant boxes, and between the two pipeline rows: the same gap is what
// keeps each pipeline row level with its tenant.
const TENANT_GAP = 16;
const COLUMN_GAP = 48;
const CONTROL_GAP = 32;
// Drops that put each column's first node on the row it connects to.
const TENANTS_DROP = 144;  // three title bands down: level with Cognito, so login is straight
const CONTROL_DROP = 48;   // one band: Cognito sits on Tenant A's row
const PIPELINE_DROP = 168; // Ingest & ETL starts level with Tenant B's box

// The tenants: Tenant A gets the box `tenant-a` holding its database `ta`, and so on.
const TENANTS = ["A", "B", "C"];
const siloId = (tenant: string) => `tenant-${tenant.toLowerCase()}`;
const dbId = (tenant: string) => `t${tenant.toLowerCase()}`;

// An invisible box `h` tall; above a node in a VStack it lowers that node by `h`.
const drop = (h: number) => <Rect w={8} h={h} stroke="none" fill="none" />;
const cell = (node: Figure) => (
  <ZStack><Rect w={PIPELINE_CELL_W} h={8} stroke="none" fill="none" />{node}</ZStack>
);
const tenantSilo = (tenant: string) => (
  <Group kind="generic" id={siloId(tenant)} label={`Tenant ${tenant}`}>
    <Node id={dbId(tenant)} icon={AmazonAurora} label="Amazon Aurora" sub={`tenant ${tenant}`} />
  </Group>
);

export default (
  <Diagram title="Multi-Tenant SaaS with Shared AI/ML Pipeline"
    subtitle="Tenants sign in through a shared control plane, keep isolated databases, and feed one shared training and inference pipeline"
    layout="row" gap={COLUMN_GAP} align="start">
    <VStack gap={0}>
      {drop(TENANTS_DROP)}
      <Node id="tenants" icon={Users} label="Tenants" sub="A · B · C" />
    </VStack>

    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="row" gap={COLUMN_GAP} align="start">
      <VStack gap={0}>
        {drop(CONTROL_DROP)}
        <Group kind="generic" id="control-plane" label="Control plane" layout="col" gap={CONTROL_GAP}>
          <Node id="cognito" icon={AmazonCognito} label="Amazon Cognito" sub="per-tenant pools" />
          <Node id="apigw" icon={AmazonAPIGateway} label="Amazon API Gateway" />
          <Node id="router" icon={AWSLambda} label="Tenant router" />
        </Group>
      </VStack>

      <Group kind="account" id="tenant-data-isolated" label="Account (tenant data)" layout="col" gap={TENANT_GAP}>
        {TENANTS.map((tenant) => tenantSilo(tenant))}
      </Group>

      {/* Ingest & ETL on Tenant B's row; Train & serve on Tenant C's row, written right
          to left so that SageMaker training sits under S3. */}
      <VStack gap={0}>
        {drop(PIPELINE_DROP)}
        <Group kind="generic" id="shared-ml-pipeline" label="Shared ML pipeline" layout="col" gap={TENANT_GAP}
          align="start">
          <Group kind="generic" id="ingest-etl" label="Ingest & ETL" layout="row" gap={STAGE_GAP}>
            {cell(<Node id="stream" icon={AmazonKinesis} label="Amazon Kinesis" sub="events" />)}
            {cell(<Node id="glue" icon={AWSGlue} label="AWS Glue" sub="ETL" />)}
            {cell(<Node id="lake" icon={AmazonSimpleStorageService} label="Amazon S3" sub="data lake" />)}
          </Group>
          <Group kind="generic" id="train-serve" label="Train & serve" layout="row" gap={STAGE_GAP}>
            {cell(<Node id="endpoint" icon={AmazonSageMaker} label="Endpoint" sub="inference" />)}
            {cell(<Node id="registry" icon={AmazonElasticContainerRegistry} label="Model registry" sub="versions" />)}
            {cell(<Node id="train" icon={AmazonSageMaker} label="Amazon SageMaker" sub="training" />)}
          </Group>
        </Group>
      </VStack>
    </Group>

    {/* Sign-in and the control plane, top down. */}
    <Arrow from="tenants" to="cognito" labelAt="start">login</Arrow>
    <Arrow from="cognito" to="apigw" />
    <Arrow from="apigw" to="router" />
    {/* The router fans out to every tenant's store. Pinning the router's right face and
        each store's left face makes the arrows leave from one point and enter cleanly;
        left to the engine, a diagonal would clip a tenant's caption. */}
    {TENANTS.map((tenant) => <Arrow from="router" to={dbId(tenant)} fromSide="right" toSide="left" />)}
    {/* Tenant B's data streams into the pipeline along their shared row. */}
    <Arrow from={dbId("B")} to="stream" fromSide="right" toSide="left" />
    <Arrow from="stream" to="glue" />
    <Arrow from="glue" to="lake" />
    {/* The lake feeds training: one straight drop to the node right below it. */}
    <Arrow from="lake" to="train" fromSide="bottom" toSide="top" />
    <Arrow from="train" to="registry" />
    <Arrow from="registry" to="endpoint" />
  </Diagram>
);
