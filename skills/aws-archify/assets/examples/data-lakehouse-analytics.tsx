// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Data lakehouse analytics platform: database changes and application events land in
// an Amazon S3 lake, AWS Glue curates them, and Athena, Redshift and QuickSight read
// the result. Short italic labels name the meaningful hops; obvious internal ones
// (ingest into the raw zone, the parallel Redshift lanes) stay unlabeled.
//
// The whole platform is one horizontal pipeline, so every hop joins neighbours and no
// arrow crosses an icon:
//   Sources -> Ingest (DMS change data capture / Data Firehose stream) -> S3 raw zone
//           -> Glue ETL -> S3 curated zone -> Consumption (Athena / Redshift) -> QuickSight
//
// What it shows:
//  - Put the transform between the zones it connects. Glue reads the raw zone and
//    writes the curated one, so placing it between them is both correct and what keeps
//    the lake a straight left-to-right line instead of a loop back.
//  - Keep a cross-cutting tier off the data path. Governance (Lake Formation and the
//    Glue Data Catalog) is a band right below the lake, joined to it by one short
//    dashed riser.
//  - Order a group's children by where their arrows come from. The Catalog is the
//    band's right-hand node, directly under Glue, so the register riser drops straight
//    into its top, well away from the band's title at the top left. With the Catalog on
//    the left, the arrow would enter the band and weave through it past Lake Formation.
//  - Two rows, each one band: row 1 is sources -> DMS -> lake -> Athena -> QuickSight,
//    row 2 is Applications -> Firehose, the governance band, Redshift. A group's first
//    node sits BAND px below its top, so the ungrouped nodes beside groups (the sources,
//    the lake, QuickSight) drop by BAND, and the gap between the two rows in Ingest and
//    Consumption equals the room the governance band needs above its own nodes.
// Build/verify: npm run watch -- assets/examples/data-lakehouse-analytics.tsx
import { Diagram, Group, HStack, VStack, Node, Arrow, Rect } from "../../src/engine.tsx";
import { Database, Client, AWSGlueDataCatalog } from "../../src/icons/resource.js";
import {
  AWSDatabaseMigrationService, AmazonDataFirehose, AmazonSimpleStorageService,
  AWSGlue, AWSLakeFormation, AmazonAthena, AmazonRedshift, AmazonQuick,
} from "../../src/icons/service.js";

const BAND = 48;     // 32px title band + 16px padding: how far down a group's first node sits
const LAKE_GAP = 56; // lake captions to the governance band, room for the "register" label
const SECOND_ROW_GAP = BAND + LAKE_GAP; // row 1 to row 2 in the Ingest and Consumption columns
// Widens the raw -> Glue lane so Glue sits exactly above the Catalog in the band below.
const GLUE_LANE = 48;
const LAKE_GAP_X = 32; // between the lake's nodes
// Absolute risers put the two fan-in bends mid-lane, off the group borders:
const RAW_RISER = 352;         // between Ingest and the lake
const QUICKSIGHT_RISER = 1064; // between Consumption and QuickSight

const blank = (w: number, h: number) => <Rect w={w} h={h} stroke="none" fill="none" />;
const drop = (h: number) => blank(8, h);

export default (
  <Diagram title="Data Lakehouse — Analytics Platform"
    subtitle="Database changes and app events land in an S3 lake, AWS Glue curates them, and Athena, Redshift and QuickSight read the result"
    layout="row" gap={24} align="start">
    {/* The sources, outside the cloud on the left, level with DMS and Firehose. */}
    <VStack gap={0} align="center">
      {drop(BAND + BAND)}
      <Node id="db-src" icon={Database} label="Operational DBs" sub="OLTP" />
      {drop(SECOND_ROW_GAP)}
      <Node id="app-src" icon={Client} label="Applications" sub="clickstream events" />
    </VStack>

    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="row" gap={32} align="start">
      <Group kind="generic" id="ingest" label="Ingest" layout="col" gap={SECOND_ROW_GAP}>
        <Node id="dms" icon={AWSDatabaseMigrationService} label="AWS DMS" sub="CDC" />
        <Node id="firehose" icon={AmazonDataFirehose} label="Amazon Data Firehose" sub="stream" />
      </Group>

      {/* The lake on row 1, the governance band under it on row 2. */}
      <VStack gap={0} align="start">
        {drop(BAND)}
        <HStack gap={LAKE_GAP_X} align="start">
          <Node id="raw" icon={AmazonSimpleStorageService} label="Amazon S3" sub="raw zone · landing" />
          {blank(GLUE_LANE, 8)}
          <Node id="glue" icon={AWSGlue} label="AWS Glue" sub="ETL transform" />
          <Node id="curated" icon={AmazonSimpleStorageService} label="Amazon S3" sub="curated zone · Parquet" />
        </HStack>
        {drop(LAKE_GAP)}
        <Group kind="generic" id="governance-catalog" label="Governance & catalog" layout="row" gap={48}>
          <Node id="lakeformation" icon={AWSLakeFormation} label="AWS Lake Formation" sub="fine-grained access" />
          <Node id="catalog" icon={AWSGlueDataCatalog} label="AWS Glue Data Catalog" sub="table metadata" />
        </Group>
      </VStack>

      <Group kind="generic" id="consumption" label="Consumption" layout="col" gap={SECOND_ROW_GAP}>
        <Node id="athena" icon={AmazonAthena} label="Amazon Athena" sub="serverless SQL" />
        <Node id="redshift" icon={AmazonRedshift} label="Amazon Redshift" sub="Spectrum" />
      </Group>

      <VStack gap={0} align="center">
        {drop(BAND)}
        <Node id="quicksight" icon={AmazonQuick} label="Amazon QuickSight" sub="BI dashboards" />
      </VStack>
    </Group>

    {/* Sources into Ingest: change data capture, and the app event stream. */}
    <Arrow id="a-db" from="db-src" to="dms" labelAt="start">CDC</Arrow>
    <Arrow id="a-app" from="app-src" to="firehose" labelAt="start">stream</Arrow>
    {/* Both ingest services land in the raw zone. */}
    <Arrow id="a-dms-raw" from="dms" to="raw" fromSide="right" toSide="left" />
    <Arrow id="a-fh-raw" from="firehose" to="raw" fromSide="right" toSide="left" riser={RAW_RISER} />
    {/* Along the lake: Glue reads raw and writes Parquet to the curated zone, which
        Athena and Redshift query and QuickSight reads. */}
    <Arrow id="a-raw-glue" from="raw" to="glue">read</Arrow>
    <Arrow id="a-glue-curated" from="glue" to="curated">write</Arrow>
    <Arrow id="a-cur-athena" from="curated" to="athena" fromSide="right" toSide="left" labelAt="start">query</Arrow>
    <Arrow id="a-cur-redshift" from="curated" to="redshift" fromSide="right" toSide="left" />
    <Arrow id="a-athena-qs" from="athena" to="quicksight" fromSide="right" toSide="left" labelAt="end">read</Arrow>
    <Arrow id="a-redshift-qs" from="redshift" to="quicksight" fromSide="right" toSide="left" riser={QUICKSIGHT_RISER} />
    {/* Governance, dashed: Glue's crawler registers the schema in the Catalog right
        below it, and inside the band Lake Formation governs the Catalog. */}
    <Arrow id="a-glue-catalog" from="glue" to="catalog" fromSide="bottom" toSide="top" dashed labelAt="start">
      register
    </Arrow>
    <Arrow id="a-lf-catalog" from="lakeformation" to="catalog" fromSide="right" toSide="left" dashed>govern</Arrow>
  </Diagram>
);
