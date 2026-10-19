# The icon catalog

The four official AWS Architecture Icon sets (release 04302026) are compiled into static React components under
`src/icons/` and indexed by `src/icons/catalog.json` (813 icons). Every search reads that one file through
`scripts/lib/icon-catalog.ts`: `npm run find`, the edit CLI's `icons` command and the editor's icon picker all rank
the same way. The AWS icon package itself is not shipped; regenerating the components needs it downloaded (last
section).

## Find the exact name first

There are 813 icons with strict official names, so guessing an export name almost always fails: Amazon S3 is
`AmazonSimpleStorageService`, not `S3`, and there is no `AWSRegion` (the Region badge is `Region` in `group.js`).
Search, then paste the import:

```bash
npm run find -- "lambda"                       # a service tile
npm run find -- "users" --type resource        # a resource glyph
npm run find -- "vpc" --type group             # a group badge
npm run find -- "aurora" --size 64 --limit 5
```

Each hit prints `import { <ExportName> } from "src/icons/<module>";  |  <name>  [<type>/<category>/<size>]`, best
first, eight by default (`--limit` changes it; `--type service|resource|group|category` and `--size` filter). With no
match it says so and suggests fewer words or dropping a filter.

The printed path is relative to the renderer folder. In a scene write `"../src/icons/<module>"` (from `scenes/`) or
`"../../src/icons/<module>"` (from `assets/examples/`); the bare `src/icons/...` path is refused by the scene guard.

**How the search ranks.** An exact name or export name comes first, then matches inside the name, the original file
name and the export name, then shared words; shorter names rank slightly higher. Common abbreviations expand to the words of
the official name first: `s3`, `sqs`, `sns`, `ses`, `elb`, `alb`, `nlb`, `ebs`, `efs`, `ecs`, `eks`, `ecr`, `vpc`,
`iam`, `apigw` (or `api gw`), `ddb`, `dynamo`, `cw`, `r53`, `route53`, `asg`, `kms`, `mq`, `msk`. Short names that are
already part of the official name (`rds`, `waf`) match directly.

**Export names** are the PascalCase of the official name: `AmazonSimpleStorageService`, `AWSLambda`,
`ElasticLoadBalancing`. Five pairs of icons share a name, and the second of each gets a `_2` suffix
(`AWSComputeOptimizer_2`, `AWSManagementConsole_2`, `AWSMarketplace_2`, `AmazonEC2AutoScaling_2`,
`AmazonKinesisVideoStreams_2`); compare both before choosing.

**A wrong name fails loudly.** A misspelt named import fails the build. An `icon` prop that is present but not a
component at run time (a namespace typo such as `Svc.AmazonAPIGatewy`, or a bad lookup) is a hard render error naming
the node. To draw a deliberate placeholder, leave the `icon` prop out instead of passing `undefined`.

## The four sets

| Set | `--type` | Module | What it is | When to use it |
|---|---|---|---|---|
| Architecture Service Icons | `service` | `src/icons/service.js` | A whole AWS service on its coloured category tile (Amazon EC2, AWS Lambda, Amazon S3, Amazon RDS), 64 px | The default node in almost every figure |
| Resource Icons | `resource` | `src/icons/resource.js` | Finer-grained resources and general glyphs: an EC2 instance, a Lambda function, plus users, client, internet, server, mobile; 48 px | Instance-level detail, and actors on the figure's edge (users, internet, on-premises) |
| Architecture Group Icons | `group` | `src/icons/group.js` | Container badges: VPC, public and private subnet, Region, AWS Cloud, account, Auto Scaling group, data center; 32 px | Rarely imported: `<Group kind>` draws them for you |
| Category Icons | `category` | `src/icons/category.js` | The 26 service-category emblems (Compute, Storage, Analytics and so on), 64 px | Legends, section headers, category-level overviews |

`src/icons/index.js` re-exports all four. Each icon is compiled at one size per set (64 px services and categories,
48 px resources, 32 px groups); SVG scales losslessly, and the components embed the official SVG source unchanged.

The counts (469 resource, 305 service, 26 category, 13 group: 813) can change with a release. Read them rather than
trusting a number:

```bash
node -e "const c=require('./src/icons/catalog.json');const t={};for(const e of c)t[e.type]=(t[e.type]||0)+1;console.log(c.length,t)"
```

**Light variant only.** Dark icons are white artwork meant for a dark canvas; on the renderer's white canvas they would
ship as blank tiles, and no check could tell (they are valid components). The build leaves them out, so no `Dark`
name exists: write `Users`, not `UsersDark`.

**AWS icons only.** There are no third-party marks. For a non-AWS product (GitHub, Okta, Datadog) use a General icon
from the resource set, such as `GitRepository`, `GenericApplication`, `Server` or `Internet`, with the product name as
the caption. The skill's `SKILL.md` has the full stand-in table.

## File names behind the exports

Official file names are strict, which is why guessing fails:

| Set | Pattern | Example |
|---|---|---|
| Service | `Arch_<Service-Name>_64.svg` | `Arch_Amazon-EC2_64.svg`, `Arch_AWS-Lambda_64.svg` |
| Resource | `Res_<Service>_<Resource>_48.svg`, or `Res_<Name>_48_Light.svg` for general glyphs | `Res_Amazon-EC2_Instance_48.svg`, `Res_Users_48_Light.svg` |
| Group | `<Container-Name>_32.svg` | `Virtual-private-cloud-VPC_32.svg` |
| Category | `Arch-Category_<Name>_64.svg` | `Arch-Category_Analytics_64.svg` |

Each `catalog.json` entry keeps the original stem (`raw`), the readable `name`, the set (`type`), `category`, `size`,
the tile `color`, the file `path` and the `module` that exports it.

## Category tile colours

Every service tile carries its category's colour, baked into the icon. They are useful for custom elements such as
legend chips or section bands. These are the tile colours (each entry's `color` in `catalog.json`); the
`service-{color}` group borders use a close but different palette (red `#C7243A` against the tile's `#DD344C`,
magenta `#CD2264` against `#C925D1`, teal `#00A4A6` against `#01A88D`), so take group colours from
[composition.md](composition.md) or [scene-api.md](scene-api.md), not from here.

| Category | Tile colour |
|---|---|
| Compute, Containers, Media Services, Blockchain, Quantum Technologies | `#ED7100` orange |
| Storage, Internet of Things, Cloud Financial Management | `#7AA116` green |
| Networking & Content Delivery, Analytics, Games | `#8C4FFF` purple |
| Databases, Developer Tools, Customer Enablement, Satellite | `#C925D1` magenta |
| Security, Identity & Compliance; Front-End Web & Mobile; Business Applications | `#DD344C` red |
| Application Integration, Management & Governance | `#E7157B` pink |
| Artificial Intelligence, Migration & Modernization, End User Computing | `#01A88D` teal green |
| General icons, the AWS wordmark | `#232F3E` squid ink |

## Group containers

`<Group kind="...">` draws the AWS container borders and badges itself, taking the badges from `group.js`. Eight
kinds are the official containers with a badge (`aws-cloud`, `region`, `vpc`, `public-subnet`, `private-subnet`,
`account`, `auto-scaling`, `datacenter`), `generic` is a dashed box with no badge, and the engine adds `borderless`
and the eight `service-*` kinds. Their colours, dashes and fills are tabled in [scene-api.md](scene-api.md).

## Common resource glyphs for the figure's edge

Search these with `--type resource`: `users`, `user`, `authenticated user`, `client`, `mobile client`, `internet`,
`globe`, `server`, `servers`, `generic application`, `disk`, `SDK`, `toolkit`.

## Regenerating the icons

Everything in `src/icons/` is generated: the four modules with their `.d.ts` typings (autocomplete on every name, and
`<Node icon>` accepts only an icon component), the `index.js` and `index.d.ts` barrel, the shared `runtime.js` and
`catalog.json`, the one icon metadata file the searches read. To pick up a new icon release, download the AWS
Architecture Icons package (https://aws.amazon.com/architecture/icons/), unzip it, and run:

```bash
AWS_ICONS_DIR=/path/to/Icons npm run icons
node scripts/build-icons.ts /path/to/Icons          # the same, with the folder as an argument
```

The folder comes from the argument, else `AWS_ICONS_DIR`, else the nearest `Icons/` folder found walking up from the
renderer. The script scans the four sets, skips dark variants and rewrites `src/icons/` in one step; no intermediate
index is written to disk. When it finds no icons, or cannot read the ones it found, it stops with an error and leaves
`src/icons/` as it was. Afterwards run `npm run typecheck` and the example regression gate
([engine-regression.md](engine-regression.md)).
