const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');

async function institutions(region, table, attr = 'institution') {
  const db = new DynamoDBClient({ region });
  const counts = {};
  let ExclusiveStartKey;
  do {
    const out = await db.send(new ScanCommand({
      TableName: table,
      ProjectionExpression: attr,
      ExclusiveStartKey,
    }));
    for (const item of out.Items || []) {
      const value = item[attr]?.S || item[attr]?.N || '(none)';
      counts[value] = (counts[value] || 0) + 1;
    }
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return { region, table, counts };
}

async function main() {
  const out = [
    await institutions('us-east-1', 'user_profile'),
    await institutions('us-east-1', 'code_generator_variables', 'institutionid'),
    await institutions('us-east-2', 'userprofile'),
  ];
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
