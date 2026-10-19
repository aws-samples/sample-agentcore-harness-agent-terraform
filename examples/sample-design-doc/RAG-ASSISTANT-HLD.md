---
title: Retrieval-augmented assistant on Amazon Bedrock high-level design
subtitle: An internal assistant that answers from a company's own approved documents
kind: hld
version: 1.1
status: Example
owner: Platform team
prepared_by: AWS Professional Services
prepared_for: AnyCompany
audience: Solution architects and security reviewers
classification: Public example
date: 2026-10-08
---

# Retrieval-augmented assistant on Amazon Bedrock high-level design

A worked example of the document shape this plugin produces: an internal assistant that answers from a company's own documents, owned by the platform team.

## Document history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-09-30 | Platform team | Example for the plugin |
| 1.1 | 2026-10-08 | Platform team | Restructured to the current HLD outline |

## 1. Introduction

### 1.1 Purpose

Teams lose time searching approved internal documents for answers. This design adds an assistant that answers questions from those documents only, with each answer grounded in retrieved passages. It asks the reader to approve a retrieval-augmented design on Amazon Bedrock with a separate ingestion path.

### 1.2 Scope and assumptions

**In scope.** The question-and-answer path for signed-in users, and the path that adds and retires documents in the index.

**Out of scope.** Writing or approving the documents themselves, which stays with each content owner.

**Assumptions.** Documents stay in the team's own storage, and the assistant reads only what has been indexed. Appendix C lists what still has to be confirmed.

### 1.3 Requirements summary

| ID | Requirement | Section |
| --- | --- | --- |
| R1 | A user asks a question in plain language and gets an answer grounded in approved internal documents | [3.1](#3-1-retrieval-path) |
| R2 | A content owner adds or retires a document, and the assistant reflects it without a redeploy | [3.2](#3-2-ingestion-path) |
| NFR1 | Only signed-in users reach the API | [3.3](#3-3-identity-and-data-protection) |
| NFR2 | An answer returns within the API integration timeout of 29 seconds | [3.4](#3-4-failure-handling) |

### 1.4 Key terms

| Term | Meaning |
| --- | --- |
| RAG | Retrieval-augmented generation: the model answers from passages retrieved for the question |
| HLD | High-level design |
| NFR | Non-functional requirement |
| AWS KMS | AWS Key Management Service |
| TTL | Time to live: the expiry time stored on a DynamoDB item |

## 2. Architecture

Figure 1 shows the whole solution: the retrieval path on the left and the ingestion path on the right.

<!-- aws-svg: hld-diagrams/bedrock-rag-assistant.svg | Retrieval path on the left, ingestion path on the right -->

The main components:

- **Entry point** (Amazon CloudFront, Amazon Cognito, Amazon API Gateway): users reach the assistant over HTTPS, sign in, and call the API.
- **Orchestrator** (AWS Lambda): retrieves passages and asks the model for an answer.
- **Knowledge base** (Amazon Bedrock, Amazon OpenSearch Service): the foundation model and the vector index it answers from.
- **Conversation store** (Amazon DynamoDB): the chat history for each conversation.
- **Ingestion** (Amazon S3, AWS Step Functions, Amazon Textract, AWS Lambda): turns each document into indexed passages.

## 3. How the design works

### 3.1 Retrieval path

A signed-in user sends a question through Amazon API Gateway, which checks the Amazon Cognito token. An AWS Lambda function retrieves the closest passages from the vector index in Amazon OpenSearch Service. It then asks a foundation model in Amazon Bedrock to answer from those passages only, keeping the conversation in Amazon DynamoDB.

### 3.2 Ingestion path

An AWS Step Functions workflow takes each document placed in Amazon S3 and extracts its text with Amazon Textract. It then chunks and embeds the text and writes it to the index. Retiring a document runs the same workflow, which deletes the document's chunks from the index.

### 3.3 Identity and data protection

| Area | Design |
| --- | --- |
| Identity | Users sign in to an Amazon Cognito user pool; API Gateway accepts only requests carrying a valid token (NFR1) |
| Encryption | Documents in Amazon S3 are encrypted at rest; the platform team decides whether to use its own AWS KMS key |
| Model data | Model providers have no access to the prompts and completions the assistant sends |
| Content safety | An Amazon Bedrock guardrail filters harmful input and model responses |
| Retention | Conversation items carry a TTL; DynamoDB deletes them in the background after expiry, so retention is at least the TTL, not exactly it |

### 3.4 Failure handling

| Failure | Detection | Response |
| --- | --- | --- |
| A long answer runs past the [API integration timeout](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-execution-service-limits-table.html) | API Gateway returns a timeout error to the user | Retrieved passages and response length are capped (NFR2) |
| An ingestion step fails | The Step Functions execution reports the error | The workflow retries the step, then catches the failure so the document is not half indexed |

## 4. Roles and responsibilities

| Team | Owns and operates | Does not own |
| --- | --- | --- |
| Platform team | The API, model access and guardrails, the vector index and the ingestion workflow | The source documents, or what is published to the index |
| Content owners | The source documents, and what is published to the index | The API, the models or the guardrails |

## 5. Key architecture decisions

| ID | Decision | Rationale | Reversible? |
| --- | --- | --- | --- |
| D1 | Retrieval before generation | Answers cite approved content instead of the model's general knowledge (R1) | No: the index and the ingestion path exist only to serve it |
| D2 | Ingestion separate from serving | A content change never needs a redeploy of the API (R2) | Yes: the two paths share only the index |

## 6. High-level implementation steps

| # | Step | Owner | Where |
| --- | --- | --- | --- |
| 1 | Create the Amazon Cognito user pool and the API with its Cognito authorizer | Platform team | Workload account |
| 2 | Create the vector index in Amazon OpenSearch Service | Platform team | Workload account |
| 3 | Build the ingestion workflow from Amazon S3 to the index | Platform team | Workload account |
| 4 | Deploy the orchestrator, the conversation table and the Amazon Bedrock guardrail | Platform team | Workload account |
| 5 | Load the first approved documents and check each answer cites them | Content owners | Ingestion bucket |

## 7. AWS references

- [Control access to REST APIs using Amazon Cognito user pools as an authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-integrate-with-cognito.html) - API Gateway accepts only tokens from the user pool
- [Quotas for configuring and running a REST API in API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-execution-service-limits-table.html) - the 29 second integration timeout, adjustable for Regional and private APIs
- [Inference using Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html) - multi-turn requests to a foundation model
- [Amazon Bedrock: data protection](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html) - model providers have no access to customer prompts and completions
- [Detect and filter harmful content by using Amazon Bedrock Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html) - filtering of harmful user input and model responses
- [k-Nearest Neighbor (k-NN) search in Amazon OpenSearch Service](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/knn.html) - nearest-neighbour search over `knn_vector` fields
- [Calling Amazon Textract Asynchronous Operations](https://docs.aws.amazon.com/textract/latest/dg/api-async.html) - the asynchronous API for multipage PDF and Tagged Image File Format (TIFF) documents
- [Handling errors in Step Functions workflows](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html) - retry and catch on a failed ingestion step
- [Using server-side encryption with Amazon S3 managed keys (SSE-S3)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html) - every new object upload is encrypted with SSE-S3 by default
- [Using time to live (TTL) in DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html) - expired items are deleted in the background after expiry, not at the expiry time

## 8. Appendix

### A. Do's and don'ts

| Do | Don't |
| --- | --- |
| Retire a document through the ingestion workflow, so its chunks leave the index | Delete only the source object and leave its chunks retrievable |
| Cap retrieved passages and response length | Let one answer grow until it runs past the integration timeout |
| Treat the TTL as the earliest deletion time | Rely on the TTL as the exact moment a conversation is deleted |

### B. Risks and deviations

| Risk | Cause | Impact | Remediation |
| --- | --- | --- | --- |
| A long answer exceeds the API integration timeout | Many retrieved passages or a long response | High: the user gets an error instead of an answer | Cap retrieved passages and response length; raise the quota for a Regional API if needed (platform team) |
| A retired document stays retrievable | The source is removed but its chunks are not | Medium: answers cite withdrawn content | Ingestion deletes its chunks from the index as part of retirement (platform team) |

### C. Assumptions to confirm

| Assumption | Confirm with | Impact if false |
| --- | --- | --- |
| No document in scope is classified too sensitive to index | Content owners | Those documents are excluded, or get an index of their own (3.2) |
| Every signed-in user may read every indexed document | Content owners and security architecture | Retrieval needs per-user filtering (3.1) |
