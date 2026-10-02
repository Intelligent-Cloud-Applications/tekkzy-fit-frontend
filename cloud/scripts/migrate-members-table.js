/**
 * Copy Fitnessworld001 gym members only from user_profile / beta_user_profile
 * into tekkzyfit_members / beta_tekkzyfit_members.
 *
 * Keys: institutionId (PK) + memberId (SK)
 * Does NOT migrate any other institution.
 *
 * Usage:
 *   node scripts/migrate-members-table.js --stage dev
 *   node scripts/migrate-members-table.js --stage prod
 *   node scripts/migrate-members-table.js --stage dev --delete-legacy
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');

const stage = process.argv.includes('--stage')
  ? process.argv[process.argv.indexOf('--stage') + 1]
  : 'dev';
const deleteLegacy = process.argv.includes('--delete-legacy');
const institution = process.env.INSTITUTION || 'Fitnessworld001';

const cfg = stage === 'prod'
  ? {
      region: 'us-east-1',
      profileTable: 'user_profile',
      membersTable: 'tekkzyfit_members',
    }
  : {
      region: 'us-east-2',
      profileTable: 'beta_user_profile',
      membersTable: 'beta_tekkzyfit_members',
    };

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: cfg.region }), {
  marshallOptions: { removeUndefinedValues: true },
});

function isStaff(row) {
  const email = String(row.emailId || row.email || '').trim().toLowerCase();
  if (email === 'admin@tekkzy.com' || email === 'manager@tekkzy.com') return true;
  const type = String(row.userType || row.role || '').trim().toLowerCase();
  return type === 'admin' || type === 'manager' || type === 'staff' || type === 'super_admin';
}

function isMember(row) {
  const id = String(row.cognitoId || '');
  if (!id || id.startsWith('__')) return false;
  if (isStaff(row)) return false;
  const type = String(row.userType || '').trim().toLowerCase();
  return !type || type === 'member';
}

function todayYmd() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function toMemberItem(item) {
  const institutionId = institution;
  const memberId = String(item.memberId || item.cognitoId || '').trim();
  const cognitoId = String(item.cognitoId || memberId).trim();
  const name = String(
    item.userName || item.name || `${item.firstName || ''} ${item.lastName || ''}`,
  ).trim() || 'Member';
  const nameLower = name.toLowerCase();
  const suspended = String(item.status || '').toUpperCase() === 'SUSPENDED';
  const renew = String(item.renewDate || item.rePaymentDate || item.deviceEnd || '').slice(0, 10);
  const membershipStatus = suspended ? 'SUSPENDED' : (renew && renew < todayYmd() ? 'EXPIRED' : 'ACTIVE');
  const next = {
    ...item,
    institutionId,
    institution: institutionId,
    memberId,
    cognitoId,
    userName: name,
    name,
    nameLower,
    nameSort: `${nameLower}#${memberId}`,
    membershipStatus,
    statusKey: `${institutionId}#${membershipStatus}`,
    userType: 'member',
  };
  return next;
}

async function loadProfiles() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await client.send(new QueryCommand({
      TableName: cfg.profileTable,
      KeyConditionExpression: 'institution = :institution',
      ExpressionAttributeValues: { ':institution': institution },
      ExclusiveStartKey,
    }));
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function main() {
  console.log(JSON.stringify({ stage, ...cfg, institution, deleteLegacy }, null, 2));
  const rows = (await loadProfiles()).filter(isMember);
  console.log(`Found ${rows.length} Fitnessworld001 members in ${cfg.profileTable}`);
  let written = 0;
  let removed = 0;
  let skipped = 0;
  for (const row of rows) {
    if (String(row.institution || '') !== institution) {
      skipped += 1;
      continue;
    }
    const next = toMemberItem(row);
    if (!next.memberId) {
      skipped += 1;
      continue;
    }
    await client.send(new PutCommand({ TableName: cfg.membersTable, Item: next }));
    written += 1;
    if (deleteLegacy) {
      await client.send(new DeleteCommand({
        TableName: cfg.profileTable,
        Key: { institution, cognitoId: next.cognitoId },
      }));
      removed += 1;
    }
    if (written % 50 === 0) console.log(`… ${written}/${rows.length}`);
  }
  console.log(JSON.stringify({ written, removed, skipped, total: rows.length }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
