# Third-party licenses

The sample's own code and text are licensed under MIT-0 (see [LICENSE](LICENSE)). The components below keep their own licenses and notices. Nothing here relicenses a third-party component.

## Included in this repository

| Component | Where | License | Notes |
|---|---|---|---|
| AWS Architecture Icons, compiled into React components | `skills/aws-archify/src/icons/` | AWS Architecture Icons terms | Provided by AWS for use in architecture diagrams. Current terms: https://aws.amazon.com/architecture/icons/ |
| AWS documentation indexes | `skills/aws-docs-lookup/indexes/` | AWS documentation terms | Snapshots of the `llms.txt` index files published at docs.aws.amazon.com |

No third-party logos or brand marks ship with this sample. The only icons are the AWS Architecture Icons.

## Downloaded at build or deploy time

These are not in the repository. `setup.sh` (locally) or `hosted/container/Dockerfile` (in the image build) downloads them; each package carries its own license file.

| Package | Installed into | License |
|---|---|---|
| react, react-dom, scheduler | `skills/aws-archify/node_modules/` | MIT |
| esbuild (and its platform build) | same | MIT |
| @napi-rs/canvas (and its platform build) | same | MIT; bundles Skia, BSD-3-Clause |
| TypeScript | same | Apache-2.0 |
| @types/node, @types/react, @types/react-dom, csstype, undici-types (development only) | same | MIT |
| python-docx | `skills/aws-design-doc/vendor/python/` | MIT |
| lxml (with libxml2 and libxslt) | same | BSD-3-Clause (libxml2 and libxslt: MIT) |
| typing_extensions | same | PSF-2.0 |
| boto3, botocore, s3transfer, jmespath, python-dateutil, urllib3, six | container image (`pip`) | Apache-2.0 (boto3, botocore, s3transfer); MIT (jmespath, urllib3, six); Apache-2.0 or BSD-3-Clause (python-dateutil) |
| Node.js 22 base image (Debian bookworm slim), Python 3, pandoc, curl, ca-certificates | container image (`public.ecr.aws/docker/library/node`, `apt`) | Node.js: MIT; pandoc: GPL-2.0-or-later (used as a separate program, not linked); Debian packages: their own licenses |
| HashiCorp Terraform AWS provider | downloaded by `terraform init` | MPL-2.0 |

## Services and models

The deployed stack calls Amazon Bedrock models (by default an Anthropic Claude inference profile). Use of third-party models is subject to the model provider's terms, which are shown in the Amazon Bedrock console. You are responsible for reviewing and accepting those terms.
