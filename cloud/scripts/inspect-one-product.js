const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

async function main() {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
  const one = await db.send(new GetCommand({
    TableName: 'institute_product',
    Key: { institution: 'tekkzy', productId: '1000001' },
  }));
  const fwPlans = [];
  const profile = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
  let ExclusiveStartKey;
  do {
    const out = await profile.send(new QueryCommand({
      TableName: 'user_profile',
      KeyConditionExpression: 'institution = :institution AND begins_with(cognitoId, :prefix)',
      ExpressionAttributeValues: { ':institution': 'Fitnessworld001', ':prefix': '__plan_' },
      ExclusiveStartKey,
    }));
    fwPlans.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  const beta = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-2' }));
  const betaPlans = [];
  ExclusiveStartKey = undefined;
  do {
    const out = await beta.send(new QueryCommand({
      TableName: 'beta_user_profile',
      KeyConditionExpression: 'institution = :institution AND begins_with(cognitoId, :prefix)',
      ExpressionAttributeValues: { ':institution': 'Fitnessworld001', ':prefix': '__plan_' },
      ExclusiveStartKey,
    }));
    betaPlans.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  console.log(JSON.stringify({ sample: one.Item, fwPlans, betaPlans }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
