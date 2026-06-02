const REQUIRED_S3_VARS = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY"
] as const;

export function validateEnv(): void {
  const missing = REQUIRED_S3_VARS.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required S3 environment variables: ${missing.join(", ")}. ` +
      `Copy .env.example to .env and fill in the values.`
    );
  }
}
