const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const INSTITUTION = 'Fitnessworld001';
const TABLE = 'user_profile';
const REGION = 'us-east-1';
const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function all() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await db.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'institution = :institution',
      ExpressionAttributeValues: { ':institution': INSTITUTION },
      ExclusiveStartKey,
    }));
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

function keep(row) {
  const id = String(row.cognitoId || '');
  if (id === '__devicebridge__') return true;
  if (id.startsWith('__plan_')) return true;
  if (row.userType === 'member') return true;
  return false;
}

async function remove(keys) {
  let deleted = 0;
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    let requestItems = {
      [TABLE]: chunk.map((Key) => ({ DeleteRequest: { Key } })),
    };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const out = await db.send(new BatchWriteCommand({ RequestItems: requestItems }));
      const unprocessed = out.UnprocessedItems?.[TABLE] || [];
      deleted += chunk.length - unprocessed.length;
      if (!unprocessed.length) break;
      requestItems = { [TABLE]: unprocessed };
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  return deleted;
}

async function main() {
  const items = await all();
  const drop = items.filter((row) => !keep(row));
  const kept = items.filter(keep);
  const deleted = await remove(drop.map((row) => ({
    institution: INSTITUTION,
    cognitoId: row.cognitoId,
  })));
  const after = await all();
  const types = {};
  for (const row of after) {
    const id = String(row.cognitoId || '');
    const key = id.startsWith('__') ? id.replace(/_.+$/, '__') : row.userType || 'other';
    types[id.startsWith('__deviceres_') ? '__deviceres_*' : id.startsWith('__plan_') ? '__plan_*' : id === '__devicebridge__' ? '__devicebridge__' : row.userType || 'other'] = (types[id.startsWith('__deviceres_') ? '__deviceres_*' : id.startsWith('__plan_') ? '__plan_*' : id === '__devicebridge__' ? '__devicebridge__' : row.userType || 'other'] || 0) + 1;
  }
  console.log(JSON.stringify({
    before: items.length,
    removed: deleted,
    keptBefore: kept.length,
    after: after.length,
    types,
    members: after.filter((row) => row.userType === 'member').map((row) => row.userName || row.cognitoId),
  }));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
