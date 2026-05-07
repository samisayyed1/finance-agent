import "server-only";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let cached: S3Client | null = null;

export const getR2Client = (): S3Client => {
  if (cached) {
    return cached;
  }
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!(accountId && accessKeyId && secretAccessKey)) {
    throw new Error(
      "R2 not configured: set R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY"
    );
  }
  cached = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cached;
};

export interface PutRawPayloadArgs {
  body: Uint8Array;
  contentType?: string;
  orgId: string;
  source: string;
  webhookId: string;
}

export const putRawPayload = async (
  args: PutRawPayloadArgs
): Promise<string> => {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    throw new Error("R2_BUCKET not set");
  }
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const key = `${args.orgId}/${args.source}/${yyyy}/${mm}/${dd}/${args.webhookId}.json`;
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: args.body,
      ContentType: args.contentType ?? "application/json",
      Metadata: {
        "x-source": args.source,
        "x-event-id": args.webhookId,
        "x-received-at": now.toISOString(),
      },
    })
  );
  return key;
};
