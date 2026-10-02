const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

async function query(region, table, institution) {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await db.send(new QueryCommand({
      TableName: table,
      KeyConditionExpression: 'institution = :institution',
      ExpressionAttributeValues: { ':institution': institution },
      ExclusiveStartKey,
    }));
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function sampleOther(region, table) {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  const out = await db.send(new ScanCommand({ TableName: table, Limit: 8 }));
  return (out.Items || []).map((row) => ({
    institution: row.institution,
    productId: row.productId,
    keys: Object.keys(row).sort(),
    name: row.name || row.productName || row.planName || null,
    price: row.price || row.amount || row.productPrice || null,
    durationDays: row.durationDays || row.days || row.duration || null,
    type: row.type || row.productType || row.category || row.userType || null,
  }));
}

function slim(row) {
  return {
    productId: row.productId,
    keys: Object.keys(row).sort(),
    name: row.name || row.productName || row.planName || null,
    price: row.price ?? row.amount ?? row.productPrice ?? null,
    durationDays: row.durationDays ?? row.days ?? row.duration ?? null,
    billingPeriod: row.billingPeriod || row.period || null,
    razorpayPlanId: row.razorpayPlanId || null,
    status: row.status || null,
    type: row.type || row.productType || row.category || null,
    raw: row,
  };
}

async function main() {
  const fw1 = await query('us-east-1', 'institute_product', 'Fitnessworld001');
  const fw2 = await query('us-east-2', 'beta_institute_product', 'Fitnessworld001');
  const sample = await sampleOther('us-east-1', 'institute_product');
  console.log(JSON.stringify({
    prodFw: fw1.map(slim),
    betaFw: fw2.map(slim),
    sample,
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
