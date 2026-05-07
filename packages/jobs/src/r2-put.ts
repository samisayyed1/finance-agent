import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let cached: S3Client | null = null;

const getClient = (): S3Client => {
  if (cached) {
    return cached;
  }
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!(accountId && accessKeyId && secretAccessKey)) {
    throw new Error("R2 not configured");
  }
  cached = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cached;
};

export const putRawJson = async (args: {
  orgId: string;
  source: string;
  webhookId: string;
  payload: unknown;
}): Promise<string> => {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    throw new Error("R2_BUCKET not set");
  }
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const key = `${args.orgId}/${args.source}/${yyyy}/${mm}/${dd}/${args.webhookId}.json`;
  const body = new TextEncoder().encode(JSON.stringify(args.payload));
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/json",
    })
  );
  return key;
};
