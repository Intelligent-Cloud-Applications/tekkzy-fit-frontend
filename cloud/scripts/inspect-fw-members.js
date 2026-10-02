const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));

async function all() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await db.send(new QueryCommand({
      TableName: 'user_profile',
      KeyConditionExpression: 'institution = :institution',
      ExpressionAttributeValues: { ':institution': 'Fitnessworld001' },
      ExclusiveStartKey,
    }));
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

function summary(row) {
  return {
    cognitoId: row.cognitoId,
    userType: row.userType || '(none)',
    userName: row.userName || row.name || null,
    phone: row.phoneNumber || row.phone || null,
    email: row.emailId || row.email || null,
    deviceEnrollId: row.deviceEnrollId || null,
    paymentStatus: row.paymentStatus || null,
    subscriptionStatus: row.subscriptionStatus || null,
    planId: row.planId || null,
    cmdStatus: row.cmdStatus || null,
    createdAt: row.createdAt || row.updatedAt || null,
  };
}

async function main() {
  const items = await all();
  const members = items.filter((row) => {
    const id = String(row.cognitoId || '');
    if (id.startsWith('__')) return false;
    return !row.userType || row.userType === 'member';
  });
  const reserved = items.filter((row) => String(row.cognitoId || '').startsWith('__'));
  const other = items.filter((row) => !members.includes(row) && !reserved.includes(row));
  const prefixes = {};
  for (const row of items) {
    const id = String(row.cognitoId || '');
    const prefix = id.startsWith('__')
      ? id.split('_').slice(0, 3).join('_')
      : row.userType || 'member-like';
    prefixes[prefix] = (prefixes[prefix] || 0) + 1;
  }
  console.log(JSON.stringify({
    total: items.length,
    prefixes,
    members: members.map(summary),
    plans: items.filter((row) => row.userType === 'plan').map((row) => ({
      cognitoId: row.cognitoId,
      planName: row.planName || row.name || row.title || null,
      amount: row.amount || row.price || null,
      days: row.durationDays || row.days || null,
    })),
    other: other.map(summary).slice(0, 20),
    otherCount: other.length,
    reservedSample: reserved.slice(0, 8).map(summary),
    reservedIdsSample: reserved.slice(0, 15).map((row) => row.cognitoId),
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
