import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

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

export const fetchRawPayload = async (r2Key: string): Promise<unknown> => {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    throw new Error("R2_BUCKET not set");
  }
  const out = await getClient().send(
    new GetObjectCommand({ Bucket: bucket, Key: r2Key })
  );
  if (!out.Body) {
    throw new Error(`empty body at ${r2Key}`);
  }
  const text = await out.Body.transformToString("utf-8");
  return JSON.parse(text);
};
