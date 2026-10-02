// Usage: node scripts/migrate-payments.js <region> <fromTable> <toTable> [institutions=Fitnessworld001]
// The old payment tables are shared with other apps; only TekkzyFit institutions are copied.
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const [region, fromTable, toTable, instArg] = process.argv.slice(2);
const INSTITUTIONS = new Set(String(instArg || 'Fitnessworld001').split(',').map((s) => s.trim()).filter(Boolean));
if (!region || !fromTable || !toTable) {
  console.error('Usage: node scripts/migrate-payments.js <region> <fromTable> <toTable>');
  process.exit(1);
}
process.env.AWS_REGION = region;
const { paymentRow } = require('../src/dynamo');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});

async function scanAll(table) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await client.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function writeAll(table, rows, toRequest = (Item) => ({ PutRequest: { Item } })) {
  for (let i = 0; i < rows.length; i += 25) {
    let requests = rows.slice(i, i + 25).map(toRequest);
    for (let attempt = 0; requests.length && attempt < 8; attempt += 1) {
      const out = await client.send(new BatchWriteCommand({ RequestItems: { [table]: requests } }));
      requests = out.UnprocessedItems?.[table] || [];
      if (requests.length) await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
    }
    if (requests.length) throw new Error(`Unprocessed items at batch ${i}`);
  }
}

function sum(rows) {
  return rows.reduce((total, row) => total + (Number(row.amount) || 0), 0);
}

(async () => {
  const source = (await scanAll(fromTable)).filter((row) => INSTITUTIONS.has(String(row.institution || row.institutionId || '')));
  const foreign = (await scanAll(toTable)).filter((row) => !INSTITUTIONS.has(String(row.institutionId || '')));
  await writeAll(toTable, foreign, (row) => ({ DeleteRequest: { Key: { institutionId: row.institutionId, paymentKey: row.paymentKey } } }));
  const seen = new Map();
  for (const item of source) {
    const row = paymentRow(item);
    const key = `${row.institutionId}|${row.paymentKey}`;
    const prev = seen.get(key);
    if (!prev || Number(row.updatedAt || row.paymentDate || 0) >= Number(prev.updatedAt || prev.paymentDate || 0)) seen.set(key, row);
  }
  const rows = [...seen.values()];
  await writeAll(toTable, rows);
  const target = await scanAll(toTable);
  const undated = source.filter((r) => !r.paymentDate && !r.paidAt && !r.createdAt).length;
  console.log(JSON.stringify({
    removedForeign: foreign.length,
    source: source.length,
    written: rows.length,
    duplicatesMerged: source.length - rows.length,
    target: target.length,
    sourceAmount: sum(source),
    targetAmount: sum(target),
    undated,
  }));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
