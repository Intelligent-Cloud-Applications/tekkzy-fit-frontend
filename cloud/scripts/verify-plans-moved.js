const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

async function count(region, table, pk, prefix) {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await db.send(new QueryCommand({
      TableName: table,
      KeyConditionExpression: prefix
        ? 'institution = :institution AND begins_with(cognitoId, :prefix)'
        : 'institution = :institution',
      ExpressionAttributeValues: prefix
        ? { ':institution': 'Fitnessworld001', ':prefix': prefix }
        : { ':institution': 'Fitnessworld001' },
      ExclusiveStartKey,
    }));
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.map((row) => row.productId || row.cognitoId || row.name || row.heading);
}

async function main() {
  console.log(JSON.stringify({
    prodProfilePlans: await count('us-east-1', 'user_profile', true, '__plan_'),
    prodProducts: await count('us-east-1', 'institute_product'),
    betaProfilePlans: await count('us-east-2', 'beta_user_profile', true, '__plan_'),
    betaProducts: await count('us-east-2', 'beta_institute_product'),
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
