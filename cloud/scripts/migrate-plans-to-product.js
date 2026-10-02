const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const INSTITUTION = 'Fitnessworld001';

function productFromLegacy(row) {
  const id = String(row.planId || '').replace(/^__plan_/, '') || String(row.cognitoId || '').replace(/^__plan_/, '');
  const price = Number(row.price || 0);
  const durationDays = Number(row.durationDays || 30);
  const name = row.name || 'Plan';
  const label = row.durationLabel || `${durationDays} days`;
  const razorpayPlanId = row.razorpayPlanId || '';
  return {
    institution: INSTITUTION,
    productId: id,
    heading: name,
    name,
    amount: Math.round(price * 100),
    price,
    currency: 'INR',
    country: 'IN',
    india: true,
    duration: durationDays * 86_400_000,
    durationDays,
    durationText: label,
    durationLabel: label,
    addonAmount: Number(row.addonAmount || 0),
    description: row.description || '',
    accessType: row.accessType || 'ALL_HOURS',
    status: row.status || 'ACTIVE',
    planStatus: (row.status || 'ACTIVE') === 'ACTIVE',
    billingPeriod: row.billingPeriod || '',
    subscriptionType: row.billingPeriod || 'monthly',
    billingInterval: row.billingInterval,
    interval: row.billingInterval || 1,
    razorpayPlanId,
    planId: razorpayPlanId,
    institutionType: 'gym',
    createdAt: row.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function legacyPlans(db, table) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await db.send(new QueryCommand({
      TableName: table,
      KeyConditionExpression: 'institution = :institution AND begins_with(cognitoId, :prefix)',
      ExpressionAttributeValues: { ':institution': INSTITUTION, ':prefix': '__plan_' },
      ExclusiveStartKey,
    }));
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function migrate({ region, profileTable, productTable }) {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const rows = await legacyPlans(db, profileTable);
  for (const row of rows) {
    await db.send(new PutCommand({ TableName: productTable, Item: productFromLegacy(row) }));
    await db.send(new DeleteCommand({
      TableName: profileTable,
      Key: { institution: INSTITUTION, cognitoId: row.cognitoId },
    }));
  }
  return { region, profileTable, productTable, moved: rows.map((row) => row.planId || row.cognitoId) };
}

async function main() {
  const out = [
    await migrate({
      region: 'us-east-1',
      profileTable: 'user_profile',
      productTable: 'institute_product',
    }),
    await migrate({
      region: 'us-east-2',
      profileTable: 'beta_user_profile',
      productTable: 'beta_institute_product',
    }),
  ];
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
