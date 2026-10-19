# Examples

What the hosted agent produces, and how to ask for it from an MCP client.

- [Example requests](requests.md): what to ask, tool by tool or as one `ask_architect` request, and what comes back.
- [MCP client configurations](mcp-clients/README.md): ready files for Claude Code, Codex and Kiro.
- [Design documents](#design-documents): a high-level design and a one-page reference architecture, built with the `aws-design-doc` skill.
- [Diagrams](#diagrams): the 28 worked architectures that ship with the `aws-archify` skill.

## Design documents

| Document | Kind | Files |
| --- | --- | --- |
| Retrieval-augmented assistant on Amazon Bedrock | High-level design | [Markdown](sample-design-doc/RAG-ASSISTANT-HLD.md), [HTML](sample-design-doc/rag-assistant-hld.html), [Word](sample-design-doc/rag-assistant-hld.docx) |
| Skills-based agent with governed MCP tools (this sample) | One-page reference architecture | [Markdown](reference-architecture/AGENTCORE-MCP-AGENT-REFARCH.md), [HTML](reference-architecture/agentcore-mcp-agent-refarch.html), [Word](reference-architecture/agentcore-mcp-agent-refarch.docx) |

Open the HTML in a browser, or the Word file in Word; each figure is inline, and the markdown is the source the agent writes.

## Diagrams

Each figure links to its scene (`.tsx`), the source the agent writes and the renderer lays out. The [gallery README](../skills/aws-archify/assets/examples/README.md) says what each one teaches.

| | |
| --- | --- |
| [![Serverless REST API (starter)](../skills/aws-archify/assets/examples/serverless-api.svg)](../skills/aws-archify/assets/examples/serverless-api.tsx) | [![Serverless web application](../skills/aws-archify/assets/examples/serverless-web-app.svg)](../skills/aws-archify/assets/examples/serverless-web-app.tsx) |
| Serverless REST API (starter) | Serverless web application |
| [![Three-tier web app (Multi-AZ)](../skills/aws-archify/assets/examples/three-tier-web-app.svg)](../skills/aws-archify/assets/examples/three-tier-web-app.tsx) | [![EKS microservices e-commerce](../skills/aws-archify/assets/examples/eks-ecommerce.svg)](../skills/aws-archify/assets/examples/eks-ecommerce.tsx) |
| Three-tier web app (Multi-AZ) | EKS microservices e-commerce |
| [![Multi-tenant SaaS with an AI/ML pipeline](../skills/aws-archify/assets/examples/multitenant-ml.svg)](../skills/aws-archify/assets/examples/multitenant-ml.tsx) | [![Web3 dApp with payments and OAuth](../skills/aws-archify/assets/examples/web3-payments-oauth.svg)](../skills/aws-archify/assets/examples/web3-payments-oauth.tsx) |
| Multi-tenant SaaS with an AI/ML pipeline | Web3 dApp with payments and OAuth |
| [![ML training pipeline](../skills/aws-archify/assets/examples/ml-training-pipeline.svg)](../skills/aws-archify/assets/examples/ml-training-pipeline.tsx) | [![HPC batch processing](../skills/aws-archify/assets/examples/hpc-batch-processing.svg)](../skills/aws-archify/assets/examples/hpc-batch-processing.tsx) |
| ML training pipeline | HPC batch processing |
| [![Generative-AI RAG assistant](../skills/aws-archify/assets/examples/bedrock-rag-assistant.svg)](../skills/aws-archify/assets/examples/bedrock-rag-assistant.tsx) | [![AI agent on Amazon Bedrock AgentCore](../skills/aws-archify/assets/examples/bedrock-agentcore-agent.svg)](../skills/aws-archify/assets/examples/bedrock-agentcore-agent.tsx) |
| Generative-AI RAG assistant | AI agent on Amazon Bedrock AgentCore |
| [![SageMaker as the LLM gateway](../skills/aws-archify/assets/examples/sagemaker-llm-gateway.svg)](../skills/aws-archify/assets/examples/sagemaker-llm-gateway.tsx) | [![IoT real-time streaming analytics](../skills/aws-archify/assets/examples/iot-streaming-analytics.svg)](../skills/aws-archify/assets/examples/iot-streaming-analytics.tsx) |
| SageMaker as the LLM gateway | IoT real-time streaming analytics |
| [![Event-driven order processing](../skills/aws-archify/assets/examples/event-driven-orders.svg)](../skills/aws-archify/assets/examples/event-driven-orders.tsx) | [![Multi-Region active-active (DR)](../skills/aws-archify/assets/examples/multi-region-dr.svg)](../skills/aws-archify/assets/examples/multi-region-dr.tsx) |
| Event-driven order processing | Multi-Region active-active (DR) |
| [![Backup and restore with AWS Backup](../skills/aws-archify/assets/examples/backup-and-restore.svg)](../skills/aws-archify/assets/examples/backup-and-restore.tsx) | [![Hybrid network with Transit Gateway](../skills/aws-archify/assets/examples/hybrid-network.svg)](../skills/aws-archify/assets/examples/hybrid-network.tsx) |
| Backup and restore with AWS Backup | Hybrid network with Transit Gateway |
| [![Hub-and-spoke network with centralized inspection](../skills/aws-archify/assets/examples/hub-and-spoke-network.svg)](../skills/aws-archify/assets/examples/hub-and-spoke-network.tsx) | [![Data center migration to AWS](../skills/aws-archify/assets/examples/migration-to-aws.svg)](../skills/aws-archify/assets/examples/migration-to-aws.tsx) |
| Hub-and-spoke network with centralized inspection | Data center migration to AWS |
| [![Multi-account OU tree](../skills/aws-archify/assets/examples/org-ou-tree.svg)](../skills/aws-archify/assets/examples/org-ou-tree.tsx) | [![AWS Control Tower landing zone](../skills/aws-archify/assets/examples/landing-zone.svg)](../skills/aws-archify/assets/examples/landing-zone.tsx) |
| Multi-account OU tree | AWS Control Tower landing zone |
| [![Centralized logging across accounts](../skills/aws-archify/assets/examples/central-logging.svg)](../skills/aws-archify/assets/examples/central-logging.tsx) | [![Data lakehouse analytics](../skills/aws-archify/assets/examples/data-lakehouse-analytics.svg)](../skills/aws-archify/assets/examples/data-lakehouse-analytics.tsx) |
| Centralized logging across accounts | Data lakehouse analytics |
| [![Container CI/CD delivery pipeline](../skills/aws-archify/assets/examples/cicd-container-pipeline.svg)](../skills/aws-archify/assets/examples/cicd-container-pipeline.tsx) | [![Security operations: threat detection and response](../skills/aws-archify/assets/examples/security-threat-detection.svg)](../skills/aws-archify/assets/examples/security-threat-detection.tsx) |
| Container CI/CD delivery pipeline | Security operations: threat detection and response |
| [![Media streaming, VOD and live](../skills/aws-archify/assets/examples/media-streaming-platform.svg)](../skills/aws-archify/assets/examples/media-streaming-platform.tsx) | [![Omnichannel contact center](../skills/aws-archify/assets/examples/contact-center-connect.svg)](../skills/aws-archify/assets/examples/contact-center-connect.tsx) |
| Media streaming, VOD and live | Omnichannel contact center |
| [![Virtual desktops with Amazon WorkSpaces](../skills/aws-archify/assets/examples/virtual-desktops.svg)](../skills/aws-archify/assets/examples/virtual-desktops.tsx) | [![AI-native trading platform](../skills/aws-archify/assets/examples/ai-native-trading.svg)](../skills/aws-archify/assets/examples/ai-native-trading.tsx) |
| Virtual desktops with Amazon WorkSpaces | AI-native trading platform |
