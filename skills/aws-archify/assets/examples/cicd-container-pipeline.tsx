// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Container CI/CD delivery pipeline: a release moves from a GitHub push through build,
// a staging deployment and an approval gate to production on Amazon ECS. Short italic
// labels carry the flow on the connectors.
//
// The flow is a release progressing through stages, not a request or a data path, so
// the pipeline is one row of stages, and each stage hangs its artifact or runtime target
// directly below it:
//
//   Developer -> GitHub -> CodeBuild -> CodeDeploy staging -> Approval -> CodeDeploy prod
//                            | push image  | deploy                         | deploy
//                            v             v                                v
//                           ECR         ECS staging (Fargate)           ECS prod (Fargate)
//                                                                       <-> CloudWatch
//
// What it shows:
//  - Hang each stage's target under it in a VStack, so every "push" / "deploy" arrow
//    is a short vertical hop rather than a long arrow across the diagram.
//  - A custom service group ("service-devtools", carrying the CodePipeline icon) as the
//    pipeline box. GitHub has no AWS icon, so the General Git Repository icon stands in,
//    captioned GitHub.
//  - Leave out an arrow that would mislead. Both deploy stages pull images from ECR,
//    but one "pull" arrow would suggest only one of them does, and any arrow up to a
//    deploy stage would cross the ECS icon under it. The "push image" hop carries the
//    relationship instead, as the lakehouse example does for its catalog.
//  - Labels only on meaningful hops: approval -> deploy prod is obvious and unlabeled.
// Build/verify: npm run watch -- assets/examples/cicd-container-pipeline.tsx
import { Diagram, Group, VStack, Node, Arrow, Move } from "../../src/engine.tsx";
import type { Figure } from "../../src/engine.tsx";
import { User, GitRepository } from "../../src/icons/resource.js";
import {
  AWSCodePipeline, AWSCodeBuild, AWSCodeDeploy, AmazonElasticContainerRegistry,
  AmazonElasticContainerService, AmazonSimpleNotificationService, AmazonCloudWatch,
} from "../../src/icons/service.js";

const ACTOR_GAP = 48;
const CLOUD_GAP = 88;  // pipeline box to Observability: the "metrics" label sits between them
const STAGE_GAP = 48;
const DROP_GAP = 40;   // a stage over its target
// The developer and the repository sit outside AWS, beside the centred cloud; this
// lifts both onto the stage row, so GitHub -> CodeBuild is one straight hop.
const SOURCE_LIFT = -56;

// A stage with its runtime target (or artifact) directly below it.
const withTarget = (stage: Figure, target: Figure) => (
  <VStack gap={DROP_GAP} align="center">{stage}{target}</VStack>
);

export default (
  <Diagram title="Container CI/CD Delivery Pipeline" layout="row" gap={ACTOR_GAP} align="center">
    {/* The source repository is on GitHub, outside AWS; the pipeline reads it through
        an AWS CodeConnections connection. */}
    <Move dy={SOURCE_LIFT}>
      <Node id="dev" icon={User} label="Developer" sub="git push" />
      <Node id="github" icon={GitRepository} label="GitHub" sub="via AWS CodeConnections" />
    </Move>

    {/* align="end" bottom-aligns Observability with the pipeline box, which puts
        CloudWatch level with the ECS services it watches: the metrics arrow from ECS
        prod is one straight run. */}
    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="row" gap={CLOUD_GAP} align="end">
      <Group kind="service-devtools" icon={AWSCodePipeline} id="delivery-pipeline-aws-codepipeline"
        label="Delivery pipeline — AWS CodePipeline" layout="row" gap={STAGE_GAP} align="start">
        {withTarget(
          <Node id="build" icon={AWSCodeBuild} label="AWS CodeBuild" sub="build & test" />,
          <Node id="ecr" icon={AmazonElasticContainerRegistry} label="Amazon ECR" sub="image registry" />,
        )}
        {withTarget(
          <Node id="deploy-stg" icon={AWSCodeDeploy} label="AWS CodeDeploy" sub="deploy to staging" />,
          <Node id="ecs-stg" icon={AmazonElasticContainerService} label="Amazon ECS" sub="staging · Fargate" />,
        )}
        <Node id="approval" icon={AmazonSimpleNotificationService} label="Approval gate" sub="SNS notify" />
        {withTarget(
          <Node id="deploy-prd" icon={AWSCodeDeploy} label="AWS CodeDeploy" sub="deploy to prod" />,
          <Node id="ecs-prd" icon={AmazonElasticContainerService} label="Amazon ECS" sub="prod · Fargate" />,
        )}
      </Group>

      <Group kind="generic" id="observability" label="Observability" layout="row" gap={40}>
        <Node id="cw" icon={AmazonCloudWatch} label="Amazon CloudWatch" sub="logs / metrics / alarms" />
      </Group>
    </Group>

    <Arrow id="a-dev" from="dev" to="github">push</Arrow>
    {/* Along the stage row, joining the top node of each stage. */}
    <Arrow id="a-src-build" from="github" to="build" fromSide="right" toSide="left" labelAt="start">build</Arrow>
    <Arrow id="a-build-stg" from="build" to="deploy-stg" fromSide="right" toSide="left" />
    <Arrow id="a-stg-appr" from="deploy-stg" to="approval" fromSide="right" toSide="left">approve</Arrow>
    <Arrow id="a-appr-prd" from="approval" to="deploy-prd" fromSide="right" toSide="left" />
    {/* Down from each stage to its target. */}
    <Arrow id="a-build-ecr" from="build" to="ecr">{"push\nimage"}</Arrow>
    <Arrow id="a-dstg-ecs" from="deploy-stg" to="ecs-stg">deploy</Arrow>
    <Arrow id="a-dprd-ecs" from="deploy-prd" to="ecs-prd">deploy</Arrow>
    {/* The running service reports to CloudWatch (dashed: logs and metrics). */}
    <Arrow id="a-ecs-cw" from="ecs-prd" to="cw" dashed head="both">metrics</Arrow>
  </Diagram>
);
