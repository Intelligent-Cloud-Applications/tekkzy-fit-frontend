const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const INSTITUTION = 'Fitnessworld001';
const src = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-2' }), {
  marshallOptions: { removeUndefinedValues: true },
});
const dest = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true },
});

async function queryAll(db, table, indexName) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await db.send(new QueryCommand({
      TableName: table,
      IndexName: indexName,
      KeyConditionExpression: 'institution = :institution',
      ExpressionAttributeValues: { ':institution': INSTITUTION },
      ExclusiveStartKey,
    }));
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function putAll(table, items) {
  let written = 0;
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    let requestItems = {
      [table]: chunk.map((Item) => ({ PutRequest: { Item } })),
    };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const out = await dest.send(new BatchWriteCommand({ RequestItems: requestItems }));
      const unprocessed = out.UnprocessedItems?.[table] || [];
      written += chunk.length - unprocessed.length;
      if (!unprocessed.length) break;
      requestItems = { [table]: unprocessed };
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  return written;
}

async function main() {
  const profiles = await queryAll(src, 'userprofile');
  const payments = await queryAll(src, 'payments', 'institution-paymentDate-index');
  const reports = await queryAll(src, 'monthly_report');
  const destProfiles = await queryAll(dest, 'user_profile');
  const destPayments = await queryAll(dest, 'payment', 'institution-paymentDate-index').catch(() => []);
  const destReports = await queryAll(dest, 'monthly_report');

  console.log(JSON.stringify({
    src: { profiles: profiles.length, payments: payments.length, reports: reports.length },
    destBefore: { profiles: destProfiles.length, payments: destPayments.length, reports: destReports.length },
  }));

  const wroteProfiles = await putAll('user_profile', profiles);
  const wrotePayments = await putAll('payment', payments);
  const wroteReports = await putAll('monthly_report', reports);

  const afterProfiles = await queryAll(dest, 'user_profile');
  const afterReports = await queryAll(dest, 'monthly_report');
  console.log(JSON.stringify({
    wrote: { profiles: wroteProfiles, payments: wrotePayments, reports: wroteReports },
    destAfter: { profiles: afterProfiles.length, reports: afterReports.length },
  }));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
