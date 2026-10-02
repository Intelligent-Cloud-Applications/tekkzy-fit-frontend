const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const INSTITUTION = 'Fitnessworld001';
const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));

const HIDDEN = [
  'gym-sms-active-mtusygot',
  'gym-sms-paused-mtusyhi7',
];

async function all() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await db.send(new QueryCommand({
      TableName: 'user_profile',
      KeyConditionExpression: 'institution = :institution',
      ExpressionAttributeValues: { ':institution': INSTITUTION },
      ExclusiveStartKey,
    }));
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function main() {
  for (const cognitoId of HIDDEN) {
    await db.send(new DeleteCommand({
      TableName: 'user_profile',
      Key: { institution: INSTITUTION, cognitoId },
    }));
  }
  const after = await all();
  console.log(JSON.stringify({
    after: after.length,
    rows: after.map((row) => ({
      cognitoId: row.cognitoId,
      userType: row.userType || '(none)',
      name: row.userName || row.name || row.firstName || null,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
