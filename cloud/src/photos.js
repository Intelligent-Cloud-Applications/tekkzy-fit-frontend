const crypto = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = process.env.FACES_BUCKET || '';
const REGION = process.env.AWS_REGION || 'us-east-2';
const URL_TTL_SECONDS = 12 * 60 * 60;

const s3 = new S3Client({ region: REGION });

function enabled() {
  return Boolean(BUCKET);
}

function parseDataUrl(value) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(value || '').trim());
  if (!match) return null;
  const body = Buffer.from(match[2], 'base64');
  return body.length ? { contentType: match[1].toLowerCase(), body } : null;
}

function safePart(value) {
  return String(value || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'unknown';
}

/** Permanent (private) object address kept on the member row; the app gets a signed copy of it. */
function objectUrl(key) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${String(key).split('/').map(encodeURIComponent).join('/')}`;
}

function isSignedS3Url(value) {
  const url = String(value || '');
  return /^https:\/\/[^/]+\.amazonaws\.com\//i.test(url) && /X-Amz-Signature=/i.test(url);
}

/** Moves an inline data: photo on the row to S3 and keeps only the object key on the row. */
async function persistRowPhoto(row) {
  if (!row || !enabled()) return row;
  const inline = parseDataUrl(row.devicePhotoUrl);
  if (inline) {
    const institution = safePart(row.institutionId || row.institution);
    const memberId = safePart(row.memberId || row.cognitoId);
    const ext = inline.contentType.includes('png') ? 'png' : 'jpg';
    const key = `faces/${institution}/${memberId}.${ext}`;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: inline.body,
      ContentType: inline.contentType,
      CacheControl: 'private, max-age=86400',
    }));
    if (row.devicePhotoKey && row.devicePhotoKey !== key) {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: row.devicePhotoKey })).catch(() => undefined);
    }
    return {
      ...row,
      devicePhotoKey: key,
      devicePhotoS3Url: objectUrl(key),
      devicePhotoAt: Date.now(),
      devicePhotoUrl: '',
      faceRegistered: true,
    };
  }
  const next = isSignedS3Url(row.devicePhotoUrl) ? { ...row, devicePhotoUrl: '' } : row;
  if (next.devicePhotoKey && !next.devicePhotoS3Url) return { ...next, devicePhotoS3Url: objectUrl(next.devicePhotoKey) };
  return next;
}

async function deleteRowPhoto(row) {
  if (!row?.devicePhotoKey || !enabled()) return;
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: row.devicePhotoKey })).catch(() => undefined);
}

function rfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

/**
 * Synchronous SigV4 presign so toMember() can stay sync. Signing time is floored to the hour
 * so the URL (and the phone's image cache) stays stable within that window.
 */
function signedPhotoUrl(key, version) {
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  if (!key || !BUCKET || !accessKey || !secret) return '';
  const token = process.env.AWS_SESSION_TOKEN;
  const now = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const host = `${BUCKET}.s3.${REGION}.amazonaws.com`;
  const path = `/${String(key).split('/').map(rfc3986).join('/')}`;
  const scope = `${day}/${REGION}/s3/aws4_request`;
  const params = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(URL_TTL_SECONDS),
    'X-Amz-SignedHeaders': 'host',
    ...(token ? { 'X-Amz-Security-Token': token } : {}),
    ...(version ? { v: String(version) } : {}),
  };
  const query = Object.keys(params)
    .sort()
    .map((name) => `${rfc3986(name)}=${rfc3986(params[name])}`)
    .join('&');
  const canonical = ['GET', path, query, `host:${host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    crypto.createHash('sha256').update(canonical, 'utf8').digest('hex'),
  ].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secret}`, day), REGION), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(toSign, 'utf8').digest('hex');
  return `https://${host}${path}?${query}&X-Amz-Signature=${signature}`;
}

function photoUrlFor(item) {
  if (item?.devicePhotoKey) return signedPhotoUrl(item.devicePhotoKey, item.devicePhotoAt);
  return item?.devicePhotoUrl || '';
}

module.exports = { enabled, persistRowPhoto, deleteRowPhoto, photoUrlFor, isSignedS3Url };
