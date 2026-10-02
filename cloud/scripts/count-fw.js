const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

async function count(table, region, pk, pkName = 'institution') {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  let n = 0;
  let ExclusiveStartKey;
  do {
    const out = await db.send(new QueryCommand({
      TableName: table,
      KeyConditionExpression: `${pkName} = :v`,
      ExpressionAttributeValues: { ':v': pk },
      Select: 'COUNT',
      ExclusiveStartKey,
    }));
    n += out.Count || 0;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return n;
}

async function main() {
  const institution = 'Fitnessworld001';
  const out = {
    ue1_user_profile: await count('user_profile', 'us-east-1', institution),
    ue2_userprofile: await count('userprofile', 'us-east-2', institution),
    ue2_beta_user_profile: await count('beta_user_profile', 'us-east-2', institution),
  };
  console.log(JSON.stringify(out));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
