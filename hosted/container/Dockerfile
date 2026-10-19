# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# kics-scan disable=965a08d7-ef86-4f14-8792-4a3b2098937e,b03a748a-542d-44f4-bb86-9199ab4fd2d5,b16e8501-ef3c-44e1-a543-a093238099c9
# checkov:skip=CKV_DOCKER_2:AgentCore checks the session itself (/ping); it does not run Docker HEALTHCHECK.
# Debian packages come from the pinned base image's release, whose versions change with security updates; pinning
# them would stop those updates. The platform flag is required: AgentCore runs linux/arm64 images only.
# Environment image for the hosted AWS Architecture Agent (AgentCore harness and the
# MCP tools runtime). AgentCore runs linux/arm64 images only. The harness overrides
# ENTRYPOINT and CMD; the MCP tools runtime uses CMD below.
# hadolint ignore=DL3029
FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:22-bookworm-slim

# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip pandoc ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && pip3 install --no-cache-dir --break-system-packages boto3==1.43.108

ENV AGENT_HOME=/opt/aws-architecture-agent
ENV SKILLS=${AGENT_HOME}/skills \
    CLAUDE_PLUGIN_ROOT=${AGENT_HOME} \
    AWS_ARCH_SKILLS_DIR=${AGENT_HOME}/skills \
    NODE_ENV=production

COPY . ${AGENT_HOME}
WORKDIR ${AGENT_HOME}

# Install every skill's dependencies at build time so sessions never touch the network for them.
# Renders write their scene copy to scenes/ and a temporary entry and bundle to the skill folder itself.
RUN bash skills/aws-design-doc/setup.sh \
 && mkdir -p skills/aws-archify/scenes /workspace \
 && chown -R node:node ${AGENT_HOME} /workspace

# The agent process and the MCP server run as the base image's unprivileged node user.
USER node

# AgentCore Runtime reaches the MCP server on 0.0.0.0:8000/mcp; without MCP_HOST it listens on 127.0.0.1 only.
ENV MCP_HOST=0.0.0.0
EXPOSE 8000
CMD ["node", "mcp-server/server.mjs", "--http"]
