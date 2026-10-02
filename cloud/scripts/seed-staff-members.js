/**
 * Seed Cognito Admin/Manager group users into tekkzyfit members tables
 * as userType=staff for Fitnessworld001.
 *
 *   node scripts/seed-staff-members.js --stage dev
 *   node scripts/seed-staff-members.js --stage prod
 *   node scripts/seed-staff-members.js --stage all
 */
const {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const stageArg = process.argv.includes('--stage')
  ? process.argv[process.argv.indexOf('--stage') + 1]
  : 'all';
const institution = process.env.INSTITUTION || 'Fitnessworld001';
const poolId = process.env.COGNITO_USER_POOL_ID || 'us-east-2_SIyuvuvcd';
const cognitoRegion = process.env.COGNITO_REGION || 'us-east-2';

const cognito = new CognitoIdentityProviderClient({ region: cognitoRegion });

const stages = stageArg === 'all' ? ['dev', 'prod'] : [stageArg];

function cfgFor(stage) {
  return stage === 'prod'
    ? { region: 'us-east-1', membersTable: 'tekkzyfit_members' }
    : { region: 'us-east-2', membersTable: 'beta_tekkzyfit_members' };
}

function attrs(user) {
  const map = {};
  for (const row of user.Attributes || []) map[row.Name] = row.Value;
  return map;
}

async function listGroup(groupName) {
  const users = [];
  let NextToken;
  do {
    const out = await cognito.send(new ListUsersInGroupCommand({
      UserPoolId: poolId,
      GroupName: groupName,
      NextToken,
    }));
    users.push(...(out.Users || []));
    NextToken = out.NextToken;
  } while (NextToken);
  return users;
}

function toStaffItem(user, cognitoRole) {
  const a = attrs(user);
  const cognitoId = String(a.sub || user.Username || '').trim();
  const email = String(a.email || '').trim().toLowerCase();
  const name = String(a.name || `${a.given_name || ''} ${a.family_name || ''}`).trim()
    || email.split('@')[0]
    || 'Staff';
  const nameLower = name.toLowerCase();
  const now = Date.now();
  return {
    institutionId: institution,
    institution,
    memberId: cognitoId,
    cognitoId,
    emailId: email,
    userName: name,
    name,
    firstName: a.given_name || name.split(' ')[0] || '',
    lastName: a.family_name || name.split(' ').slice(1).join(' ') || '',
    nameLower,
    nameSort: `${nameLower}#${cognitoId}`,
    userType: 'staff',
    cognitoRole,
    membershipStatus: 'STAFF',
    statusKey: `${institution}#STAFF`,
    status: 'ACTIVE',
    createdAt: now,
    createdAtIso: new Date(now).toISOString(),
    updatedAt: now,
    updatedAtIso: new Date(now).toISOString(),
  };
}

async function main() {
  const [admins, managers] = await Promise.all([
    listGroup('Admin'),
    listGroup('Manager'),
  ]);
  const staff = [
    ...admins.map((user) => toStaffItem(user, 'admin')),
    ...managers.map((user) => toStaffItem(user, 'manager')),
  ].filter((row) => row.memberId && row.emailId);

  console.log(JSON.stringify({
    poolId,
    institution,
    stages,
    staff: staff.map((row) => ({ email: row.emailId, cognitoRole: row.cognitoRole, memberId: row.memberId })),
  }, null, 2));

  for (const stage of stages) {
    const cfg = cfgFor(stage);
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: cfg.region }), {
      marshallOptions: { removeUndefinedValues: true },
    });
    let written = 0;
    for (const row of staff) {
      await client.send(new PutCommand({ TableName: cfg.membersTable, Item: row }));
      written += 1;
    }
    console.log(JSON.stringify({ stage, table: cfg.membersTable, written }, null, 2));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
