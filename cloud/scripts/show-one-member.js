const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

async function main() {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
  const out = await db.send(new GetCommand({
    TableName: 'user_profile',
    Key: { institution: 'Fitnessworld001', cognitoId: 'gym-mts9mwer-osv9rh' },
  }));
  console.log(JSON.stringify(out.Item, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
