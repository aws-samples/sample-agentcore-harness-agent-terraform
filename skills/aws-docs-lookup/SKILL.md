---
name: aws-docs-lookup
description: Settle any AWS fact from the official documentation instead of memory - API request and response shapes, IAM actions, resource types and condition keys, service quotas and limits, feature availability, maintenance-mode status. Use before writing an AWS claim into a design document, a diagram label, a blog post or code comments, and whenever the user asks "does service X support Y", "what is the limit", "which IAM action". Ships local indexes of every AWS guide and every service authorization page so the right page is found without searching.
license: MIT-0
---

# AWS documentation lookups

> `$SKILLS` below is the directory that holds this plugin's skills: `skills/` in this repository, or the parent of this skill's base directory otherwise.

Read the docs, do not answer from memory. Every AWS number, API shape or IAM fact that a document, diagram or post states must come from a page you opened in this session.

## Where to look, in order

1. **AWS documentation MCP tools**, when the session has them (`search_documentation`, `read_documentation`, `read_sections`, `search_table`). Best for searching and for very large tables.
2. **The local indexes in this skill** plus the Markdown variant of the page. Use these when the MCP tools are missing or fail to connect, or when you already know the guide.
   - `$SKILLS/aws-docs-lookup/indexes/aws-docs-llms.txt`: every AWS guide with its `llms.txt` URL.
   - `$SKILLS/aws-docs-lookup/indexes/aws-docs-llms-service-authorization.txt`: every service's IAM actions, resources and condition keys page.
   - `grep -i "<service or topic>" $SKILLS/aws-docs-lookup/indexes/aws-docs-llms.txt` finds the guide; the guide's own `llms.txt` lists its pages.

## Read the Markdown, not the HTML

Every docs page has a Markdown twin: replace the `.html` suffix with `.md` (for example `https://docs.aws.amazon.com/vpc/latest/tgw/tgw-route-tables.md`). The Markdown has no navigation chrome and **reference tables arrive intact** instead of truncated.

A 404 on a `.md` URL almost always means a renamed page, not a missing Markdown variant. Look the current slug up in that guide's `llms.txt` rather than guessing; an `.html` URL that answers `302` is the tell. Example: the EC2 IAM reference is `list_ec2.md`; the older `list_amazonec2` slug 404s as `.md`.

## IAM questions

`service-authorization/latest/reference/list_<service-prefix>.md` is authoritative for actions, resource types and condition keys. Settle "does this action support resource-level ARNs" or "does it honour condition key X" there instead of inferring it or probing with trial-and-error policies.

## Writing the answer

- Quote the fact with the page URL next to it.
- If the docs do not settle it, say so plainly and state what would (a test in a sandbox account, a support case).
- Check maintenance-mode and end-of-support notices before recommending a service or feature.

## Keeping the indexes current

The indexes are snapshots. Refresh them when a guide seems to be missing:

```bash
curl -sS https://docs.aws.amazon.com/llms.txt -o $SKILLS/aws-docs-lookup/indexes/aws-docs-llms.txt
curl -sS https://docs.aws.amazon.com/service-authorization/latest/reference/llms.txt -o $SKILLS/aws-docs-lookup/indexes/aws-docs-llms-service-authorization.txt
```

Three steps in this plugin need the network: reading a docs page (the documentation lives at docs.aws.amazon.com), refreshing these indexes, and the one-time `./setup.sh` that installs the plugin's dependencies. Everything else runs offline.
