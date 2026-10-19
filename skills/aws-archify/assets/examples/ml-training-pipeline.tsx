// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// ML training pipeline on Amazon SageMaker AI. New training data landing in Amazon S3
// raises an event; an Amazon EventBridge rule starts a SageMaker Pipelines execution,
// which runs processing, training, evaluation and a condition step. A model that meets
// the accuracy threshold is registered in the SageMaker Model Registry as pending
// approval, and an approved version is deployed to a real-time SageMaker endpoint.
//
//   S3 (training data) -> EventBridge rule -> [ Processing -> Training -> Evaluation -> Condition ]
//                                                                                          |
//                                                        SageMaker endpoint <- Model Registry
//
// What it shows:
//  - Draw the trigger as part of the chain. S3, the EventBridge rule and the pipeline sit
//    in one row, so the event path is two short straight hops into the pipeline box's
//    left face. The pipeline reading its input from S3 is carried by the Processing
//    caption: an arrow from S3 to that step would have to loop around EventBridge.
//  - Fixed-width cells line a lower row up with the steps above it. The condition step
//    and the registry sit in cells of one width, the registry row is right-aligned under
//    the pipeline and padded by the group's own padding, so `register` is a straight drop.
//  - Every node shares a row or a column with another node in its box: S3 and EventBridge
//    the chain row, the endpoint and the registry the bottom row. An earlier version
//    nudged S3 and EventBridge into place with `<Move>`, which left each on a row and a
//    column of its own, and the layout report flagged both as not grid-aligned.
//
// Icon stand-ins: the icon set has no icons for processing, evaluation or condition
// steps, the Model Registry or endpoints. Processing, evaluation and the endpoint use
// the Amazon SageMaker AI service icon, the Model Registry the SageMaker AI Model
// resource icon, and the condition step the General "Metrics" icon.
import { Diagram, Group, HStack, VStack, ZStack, Node, Arrow, Rect, Spacer, type Figure } from "../../src/engine.tsx";
import { AmazonSageMakerAITrain, AmazonSageMakerAIModel, Metrics } from "../../src/icons/resource.js";
import { AmazonSimpleStorageService, AmazonEventBridge, AmazonSageMakerAI } from "../../src/icons/service.js";

// A group's first node sits this far below the group's top (16 px padding plus the
// 32 px label band); the same drop puts S3 and EventBridge level with the steps.
const GROUP_NODE_DROP = 48;
// One cell width for every step and for the registry row, wide enough for the widest
// caption, so the registry centres exactly under the condition step.
const CELL = 144;
// The pipeline group's inner padding: the registry ends this far short of the group's
// right edge, as the condition step's cell does. It sits in a gap-0 stack with the
// registry, because a spacer in the row itself would add the row's gap too.
const GROUP_PAD = 16;

const cell = (node: Figure) => (
  <ZStack>
    <Rect w={CELL} h={8} stroke="none" fill="none" />
    {node}
  </ZStack>
);

const dropped = (node: Figure) => (
  <VStack gap={0}>
    <Spacer size={GROUP_NODE_DROP} />
    {node}
  </VStack>
);

export default (
  <Diagram title="ML Training Pipeline with Amazon SageMaker AI" layout="row" gap={48}>
    <Group kind="aws-cloud" id="cloud" label="AWS Cloud">
      <Group kind="region" id="region" label="Region" layout="col" gap={56} align="end">
        <HStack gap={64} align="start">
          {dropped(<Node id="s3" icon={AmazonSimpleStorageService} label="Amazon S3" sub="training data" />)}
          {dropped(<Node id="eb" icon={AmazonEventBridge} label="Amazon EventBridge" sub="rule" />)}
          <Group kind="service-teal" id="pipeline" label="Amazon SageMaker Pipelines" icon={AmazonSageMakerAI} gap={40}>
            {cell(<Node id="proc" icon={AmazonSageMakerAI} label="Processing step" sub="reads S3 data" />)}
            {cell(<Node id="train" icon={AmazonSageMakerAITrain} label="Training step" sub="training job" />)}
            {cell(<Node id="eval" icon={AmazonSageMakerAI} label="Evaluation step" sub="model metrics" />)}
            {cell(<Node id="cond" icon={Metrics} label="Condition step" sub="accuracy threshold" />)}
          </Group>
        </HStack>

        <HStack gap={40} align="start">
          {cell(<Node id="endpoint" icon={AmazonSageMakerAI} label="Amazon SageMaker AI" sub="real-time endpoint" />)}
          <HStack gap={0}>
            {cell(<Node id="registry" icon={AmazonSageMakerAIModel} label="Amazon SageMaker AI" sub="Model Registry" />)}
            <Spacer size={GROUP_PAD} />
          </HStack>
        </HStack>
      </Group>
    </Group>

    <Arrow from="s3" to="eb">new data</Arrow>
    <Arrow from="eb" to="pipeline">start</Arrow>
    <Arrow from="proc" to="train">features</Arrow>
    <Arrow from="train" to="eval">model</Arrow>
    <Arrow from="eval" to="cond">metrics</Arrow>
    <Arrow from="cond" to="registry" labelAt="end">register</Arrow>
    <Arrow from="registry" to="endpoint">{"deploy on\napproval"}</Arrow>
  </Diagram>
);
