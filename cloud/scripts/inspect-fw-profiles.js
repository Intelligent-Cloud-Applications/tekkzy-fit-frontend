const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

async function all(region, table) {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await db.send(new QueryCommand({
      TableName: table,
      KeyConditionExpression: 'institution = :institution',
      ExpressionAttributeValues: { ':institution': 'Fitnessworld001' },
      ExclusiveStartKey,
    }));
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  const types = {};
  let reserved = 0;
  for (const row of items) {
    const id = String(row.cognitoId || '');
    if (id.startsWith('__')) reserved += 1;
    const t = row.userType || '(none)';
    types[t] = (types[t] || 0) + 1;
  }
  return { region, table, total: items.length, reserved, types };
}

async function main() {
  const out = [
    await all('us-east-1', 'user_profile'),
    await all('us-east-2', 'userprofile'),
    await all('us-east-2', 'beta_user_profile'),
  ];
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
