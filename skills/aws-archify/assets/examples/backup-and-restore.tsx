// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Backup and restore with AWS Backup: a backup plan protects a production account's
// resources, copies every recovery point to a second Region and to a separate backup
// account whose vault is locked, and restores back into production.
//
//   Account (Production)
//     Region: us-east-1                                          Region: us-west-2
//     [EC2  RDS      ] --back up--> AWS Backup (backup plan)
//     [DynamoDB  EFS ] <--restore--  Backup vault  ----copy---->  Backup vault
//                                        | copy
//   Shared services: AWS KMS             |
//   Account (Backup)                     +-------------------->  Vault Lock vault
//
// The AWS facts it follows (AWS Backup Developer Guide):
//  - Cross-account copies need both accounts in one AWS Organizations organization and a
//    vault access policy on the destination vault that allows backup:CopyIntoBackupVault.
//  - AWS Backup cannot restore from one account into another: a copy in the backup account
//    is copied back to production first, then restored. The restore arrow therefore leaves
//    the production vault.
//  - DynamoDB copies (cross-Region and cross-account) need AWS Backup advanced features for
//    DynamoDB, hence its caption.
//  - Vault Lock in compliance mode makes the backup account's vault immutable once its grace
//    time ends.
//
// What it shows:
//  - One face per relationship on the hub. The primary vault takes the backup from above,
//    restores out of its left face, copies cross-Region out of its right face and
//    cross-account out of its bottom, so no two arrows share a line.
//  - Relate to the group: back up and restore start and end on the Protected resources box
//    (two <Anchor>s on its border, one per row) instead of four arrows per direction.
//  - Rows across Regions: the vault row runs through both Regions, so the cross-Region copy is
//    one straight run; the us-west-2 Region is lowered to that row and hugs its vault.
//  - The backup account sits under the second Region, so the cross-account copy drops down the
//    open lane and enters the locked vault's side, clear of the account's title.
//  - Shared services (AWS KMS, no arrows) fills the corner the backup account leaves free,
//    under the Protected resources box: one node only, because a second one on the Vault Lock
//    row would leave an uneven pitch across the row.
// Build/verify: npm run render -- assets/examples/backup-and-restore.tsx /tmp/backup-and-restore.svg
import { Diagram, Group, HStack, VStack, ZStack, Node, Arrow, Anchor, Rect } from "../../src/engine.tsx";
import type { Figure } from "../../src/engine.tsx";
import { AWSBackupBackupVault, AWSBackupVaultLock } from "../../src/icons/resource.js";
import {
  AmazonEC2, AmazonRDS, AmazonDynamoDB, AmazonEFS, AWSBackup, AWSKeyManagementService,
} from "../../src/icons/service.js";

const CELL_W = 160;      // one column; wide enough for every caption on one line
const ROW_GAP = 48;      // between the two rows, everywhere
const RESOURCE_GAP = 24; // between the resources in the 2 x 2 grid
const PLAN_LANE = 96;    // resources box to AWS Backup: room for "back up" and "restore"
const REGION_GAP = 64;   // between the two Regions: room for "copy"
const ACCOUNT_GAP = 32;  // production account over the backup account
// AWS Backup sits beside the resources box, so it drops by that box's 48px band to share the
// first resource row.
const BAND = 48;
// Lowers the us-west-2 Region by BAND plus one row (88px node + ROW_GAP), so its vault sits
// on the primary vault's row.
const SECOND_REGION_DROP = 184;
// Widens the backup account on the right so its vault lines up under the us-west-2 vault
// (that Region box sits 16px inside the production account).
const BACKUP_ACCOUNT_PAD_RIGHT = 32;
// The bottom band: Shared services lines up under the Protected resources box (32px in from
// the production account), and this blank pushes the backup account out to the us-west-2
// column; the cross-account copy runs down the open middle.
const SHARED_LEAD = 32;
const BOTTOM_BLANK = 488;
// Anchors on the right border of the Protected resources box, one per row, and the
// cross-account copy's turn (layout coordinates, measured from the SVG).
const RESOURCES_EDGE_X = 424;
const BACKUP_ROW_Y = 216;
const VAULT_ROW_Y = 352;

const cell = (node: Figure) => (
  <ZStack><Rect w={CELL_W} h={8} stroke="none" fill="none" />{node}</ZStack>
);
const blank = (w: number) => <Rect w={w} h={8} stroke="none" fill="none" />;
const lowered = (h: number, child: Figure) => (
  <VStack gap={0}><Rect w={8} h={h} stroke="none" fill="none" />{child}</VStack>
);

export default (
  <Diagram title="Backup and Restore with AWS Backup"
    subtitle="A backup plan protects production, copies to a second Region and a locked vault in a backup account, and restores into production"
    layout="row" align="start">
    <Group kind="aws-cloud" id="aws-cloud" label="AWS Cloud" layout="col" gap={ACCOUNT_GAP} align="start">
      <Group kind="account" id="production" label="Account (Production)" layout="row" gap={REGION_GAP} align="start">
        <Group kind="region" id="primary-region" label="Region: us-east-1" layout="row" gap={PLAN_LANE}>
          {/* Two rows, not a Grid: a Grid uses one gap both ways, and the rows must keep
              ROW_GAP to line up with AWS Backup and the vault. */}
          <Group kind="generic" id="protected" label="Protected resources" layout="col" gap={ROW_GAP}>
            <HStack gap={RESOURCE_GAP}>
              {cell(<Node id="ec2" icon={AmazonEC2} label="Amazon EC2" sub="instances, EBS volumes" />)}
              {cell(<Node id="rds" icon={AmazonRDS} label="Amazon RDS" sub="databases" />)}
            </HStack>
            <HStack gap={RESOURCE_GAP}>
              {cell(<Node id="dynamodb" icon={AmazonDynamoDB} label="Amazon DynamoDB" sub="tables, advanced backup" />)}
              {cell(<Node id="efs" icon={AmazonEFS} label="Amazon EFS" sub="file systems" />)}
            </HStack>
          </Group>
          {lowered(BAND,
            <VStack gap={ROW_GAP}>
              {cell(<Node id="plan" icon={AWSBackup} label="AWS Backup" sub="backup plan" />)}
              {cell(<Node id="vault" icon={AWSBackupBackupVault} label="Backup vault" sub="primary recovery points" />)}
            </VStack>)}
        </Group>
        {lowered(SECOND_REGION_DROP,
          <Group kind="region" id="second-region" label="Region: us-west-2">
            {cell(<Node id="region-copy" icon={AWSBackupBackupVault} label="Backup vault" sub="cross-Region copy" />)}
          </Group>)}
      </Group>

      <HStack gap={0} align="start">
        {blank(SHARED_LEAD)}
        {/* No arrows: every vault and every copy uses these keys. */}
        <Group kind="generic" id="shared-services" label="Shared services">
          {cell(<Node id="kms" icon={AWSKeyManagementService} label="AWS Key Management Service" sub="vault encryption keys" />)}
        </Group>
        {blank(BOTTOM_BLANK)}
        <Group kind="account" id="backup-account" label="Account (Backup)" padRight={BACKUP_ACCOUNT_PAD_RIGHT}>
          {cell(<Node id="locked-vault" icon={AWSBackupVaultLock} label="AWS Backup Vault Lock" sub="compliance-mode vault" />)}
        </Group>
      </HStack>
    </Group>

    <Anchor id="backup-out" x={RESOURCES_EDGE_X} y={BACKUP_ROW_Y} />
    <Anchor id="restore-in" x={RESOURCES_EDGE_X} y={VAULT_ROW_Y} />

    <Arrow from="backup-out" to="plan">back up</Arrow>
    <Arrow from="plan" to="vault" fromSide="bottom" toSide="top">store</Arrow>
    <Arrow from="vault" to="restore-in" fromSide="left" dashed>restore</Arrow>
    <Arrow from="vault" to="region-copy" fromSide="right" toSide="left">copy</Arrow>
    <Arrow from="vault" to="locked-vault" fromSide="bottom" toSide="left">copy</Arrow>
  </Diagram>
);
