const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const INSTITUTION = 'Fitnessworld001';

function isStaff(row) {
  const email = String(row.emailId || row.email || '').trim().toLowerCase();
  return email === 'admin@tekkzy.com' || email === 'manager@tekkzy.com';
}

async function queryAll(db, table, extra = {}) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await db.send(new QueryCommand({
      TableName: table,
      KeyConditionExpression: extra.KeyConditionExpression || 'institution = :institution',
      ExpressionAttributeValues: extra.ExpressionAttributeValues || { ':institution': INSTITUTION },
      IndexName: extra.IndexName,
      ExclusiveStartKey,
    }));
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function remove(db, table, keys) {
  let deleted = 0;
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    let requestItems = {
      [table]: chunk.map((Key) => ({ DeleteRequest: { Key } })),
    };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const out = await db.send(new BatchWriteCommand({ RequestItems: requestItems }));
      const unprocessed = out.UnprocessedItems?.[table] || [];
      deleted += chunk.length - unprocessed.length;
      if (!unprocessed.length) break;
      requestItems = { [table]: unprocessed };
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  return deleted;
}

async function wipe({ region, profileTable, paymentTable }) {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const profiles = await queryAll(db, profileTable);
  const members = profiles.filter((row) => {
    const id = String(row.cognitoId || '');
    if (id.startsWith('__')) return false;
    if (isStaff(row)) return false;
    return row.userType === 'member' || !row.userType;
  });
  const staffKept = profiles.filter(isStaff).map((row) => row.emailId || row.cognitoId);
  let payments = [];
  try {
    payments = await queryAll(db, paymentTable, {
      IndexName: 'institution-paymentDate-index',
      KeyConditionExpression: 'institution = :institution',
      ExpressionAttributeValues: { ':institution': INSTITUTION },
    });
  } catch {
    payments = [];
  }
  const memberIds = new Set(members.map((row) => row.cognitoId));
  const dropPays = payments.filter((row) => memberIds.has(row.cognitoId) || row.institution === INSTITUTION);

  const deletedMembers = await remove(db, profileTable, members.map((row) => ({
    institution: INSTITUTION,
    cognitoId: row.cognitoId,
  })));
  const deletedPayments = await remove(db, paymentTable, dropPays.map((row) => ({
    cognitoId: row.cognitoId,
    paymentId: row.paymentId,
  })));

  return {
    region,
    deletedMembers,
    deletedPayments,
    names: members.map((row) => row.userName || row.cognitoId),
    staffKept,
  };
}

async function main() {
  const out = await wipe({
    region: 'us-east-1',
    profileTable: 'user_profile',
    paymentTable: 'payment',
  });
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
