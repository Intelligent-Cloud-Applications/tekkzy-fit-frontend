const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const INSTITUTION = 'Fitnessworld001';
const DROP = [
  'address',
  'city',
  'emergencyContactName',
  'emergencyContactPhone',
  'app',
  'source',
  'role',
];

function compact(item) {
  const next = { ...item };
  for (const key of DROP) delete next[key];
  const linkId = String(next.paymentLinkId || '');
  if (!linkId || linkId.startsWith('sub_')) delete next.paymentLinkId;
  if (next.dateOfBirth === '1995-01-15') delete next.dateOfBirth;
  for (const [key, value] of Object.entries(next)) {
    if (value === '' || value == null) delete next[key];
  }
  return next;
}

async function run(region, table) {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await db.send(new QueryCommand({
      TableName: table,
      KeyConditionExpression: 'institution = :institution',
      ExpressionAttributeValues: { ':institution': INSTITUTION },
      ExclusiveStartKey,
    }));
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  const members = items.filter((row) => row.userType === 'member');
  for (const row of members) {
    await db.send(new PutCommand({ TableName: table, Item: compact(row) }));
  }
  return {
    region,
    table,
    cleaned: members.map((row) => row.userName || row.cognitoId),
  };
}

async function main() {
  const out = [
    await run('us-east-1', 'user_profile'),
    await run('us-east-2', 'beta_user_profile'),
  ];
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
