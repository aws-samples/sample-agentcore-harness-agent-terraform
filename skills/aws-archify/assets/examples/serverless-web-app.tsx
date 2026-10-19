// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Serverless web application: a static site on Amazon S3 served through Amazon
// CloudFront, and a REST API on Amazon API Gateway backed by AWS Lambda and
// Amazon DynamoDB. Amazon Cognito signs users in and API Gateway validates the
// token; Lambda writes its logs to Amazon CloudWatch.
//
//   Users -> CloudFront -> S3 (static site)
//   Users -> API Gateway -> Lambda -> DynamoDB
//   Users -> Cognito (sign in);  API Gateway -> Cognito (verify token)
//   Lambda -> CloudWatch (logs)
import { Diagram, Group, Grid, Node, Arrow, Spacer, Move } from "../../src/engine.tsx";
import { Users } from "../../src/icons/resource.js";
import {
  AmazonCloudFront, AmazonSimpleStorageService, AmazonAPIGateway, AWSLambda,
  AmazonDynamoDB, AmazonCognito, AmazonCloudWatch,
} from "../../src/icons/service.js";

export default (
  <Diagram title="Serverless Web Application" layout="row" gap={96} align="start">
    <Move dy={264}>
      <Node id="users" icon={Users} label="Users" sub="web browser" />
    </Move>

    <Group kind="aws-cloud" id="cloud" label="AWS Cloud">
      <Group kind="region" id="region" label="Region">
        <Grid cols={3} gap={80}>
          <Node id="cf" icon={AmazonCloudFront} label="Amazon CloudFront" sub="CDN" />
          <Node id="s3" icon={AmazonSimpleStorageService} label="Amazon S3" sub="static site" />
          <Spacer size={48} />

          <Node id="api" icon={AmazonAPIGateway} label="Amazon API Gateway" sub="REST API" />
          <Node id="fn" icon={AWSLambda} label="AWS Lambda" sub="API handlers" />
          <Node id="ddb" icon={AmazonDynamoDB} label="Amazon DynamoDB" sub="app data" />

          <Node id="cognito" icon={AmazonCognito} label="Amazon Cognito" sub="user pool" />
          <Node id="cw" icon={AmazonCloudWatch} label="Amazon CloudWatch" sub="logs, metrics" />
          <Spacer size={48} />
        </Grid>
      </Group>
    </Group>

    <Arrow from="users" to="cf" fromSide="top" toSide="left">HTTPS</Arrow>
    <Arrow from="users" to="api" fromSide="right" toSide="left" labelAt="start">API calls</Arrow>
    <Arrow from="users" to="cognito" fromSide="bottom" toSide="left">sign in</Arrow>
    <Arrow from="cf" to="s3">origin</Arrow>
    <Arrow from="api" to="fn">invoke</Arrow>
    <Arrow from="fn" to="ddb">read/write</Arrow>
    <Arrow from="api" to="cognito" fromSide="bottom" toSide="top" labelSide="right">verify token</Arrow>
    <Arrow from="fn" to="cw" fromSide="bottom" toSide="top">logs</Arrow>
  </Diagram>
);
