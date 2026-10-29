import {
  siAkamai,
  siAlgolia,
  siAndroid,
  siApple,
  siApachekafka,
  siAuth0,
  siClerk,
  siCloudflare,
  siCloudflarepages,
  siCloudflareworkers,
  siContentful,
  siFastly,
  siKeycloak,
  siKubernetes,
  siLinux,
  siMongodb,
  siMysql,
  siNeon,
  siNetlify,
  siPostgresql,
  siRabbitmq,
  siRedis,
  siResend,
  siSanity,
  siStrapi,
  siSupabase,
  siUpstash,
  siVercel,
  siWordpress,
  type SimpleIcon,
} from "simple-icons";

/**
 * The logo of each block on the board: the brand's own mark (Simple Icons,
 * CC0) where there is one, else a monogram in the brand's colour (AWS asks for
 * its marks not to be redistributed, so its services get one).
 */
export type Logo = { path: string; hex: string } | { text: string; hex: string };

const icon = (i: SimpleIcon): Logo => ({ path: i.path, hex: `#${i.hex}` });
const AWS = "#FF9900";
const mono = (text: string, hex = AWS): Logo => ({ text, hex });

const LOGOS: Record<string, Logo> = {
  "aws-cloudfront": mono("CF"),
  "aws-s3-site": mono("S3"),
  "aws-api-gateway": mono("API"),
  "aws-lambda": mono("λ"),
  "aws-ecs": mono("ECS"),
  "aws-rds-postgres": mono("RDS", "#527FFF"),
  "aws-aurora": mono("AU", "#527FFF"),
  "aws-dynamodb": mono("DDB", "#527FFF"),
  "aws-elasticache": mono("EC", "#C925D1"),
  "aws-sqs": mono("SQS", "#E7157B"),
  "aws-sns": mono("SNS", "#E7157B"),
  "aws-s3": mono("S3", "#7AA116"),
  "aws-cognito": mono("COG", "#DD344C"),
  "aws-ses": mono("SES", "#DD344C"),
  "cf-cdn": icon(siCloudflare),
  "cf-pages": icon(siCloudflarepages),
  "cf-workers": icon(siCloudflareworkers),
  "cf-d1": icon(siCloudflare),
  "cf-kv": icon(siCloudflare),
  "cf-hyperdrive": icon(siCloudflare),
  "cf-queues": icon(siCloudflare),
  "cf-r2": icon(siCloudflare),
  "vercel-app": icon(siVercel),
  "vercel-blob": icon(siVercel),
  netlify: icon(siNetlify),
  supabase: icon(siSupabase),
  postgres: icon(siPostgresql),
  mysql: icon(siMysql),
  mongodb: icon(siMongodb),
  redis: icon(siRedis),
  kafka: icon(siApachekafka),
  rabbitmq: icon(siRabbitmq),
  keycloak: icon(siKeycloak),
  wordpress: icon(siWordpress),
  strapi: icon(siStrapi),
  vps: icon(siLinux),
  "ios-app": icon(siApple),
  "android-app": icon(siAndroid),
  kubernetes: icon(siKubernetes),
  upstash: icon(siUpstash),
  neon: icon(siNeon),
  clerk: icon(siClerk),
  auth0: icon(siAuth0),
  contentful: icon(siContentful),
  hygraph: mono("HY", "#5B21B6"),
  // Adobe's marks are not for redistribution: monograms in its red
  "aem-sites": mono("AEM", "#EB1000"),
  "aem-eds": mono("EDS", "#EB1000"),
  "aem-author": mono("AU", "#EB1000"),
  "aem-publish": mono("PUB", "#EB1000"),
  "aem-dispatcher": mono("DSP", "#EB1000"),
  "adobe-cdn": mono("CDN", "#EB1000"),
  "reverse-proxy": mono("RP", "#6B7280"),
  akamai: icon(siAkamai),
  fastly: icon(siFastly),
  "aem-da": mono("DA", "#EB1000"),
  "aem-assets": mono("AS", "#EB1000"),
  "adobe-app-builder": mono("AB", "#EB1000"),
  "adobe-io-events": mono("IO", "#EB1000"),
  sanity: icon(siSanity),
  algolia: icon(siAlgolia),
  resend: icon(siResend),
};

export const logoOf = (blockId: string): Logo | undefined => LOGOS[blockId];

/** Marks drawn in near black (Vercel, Kafka, Sanity, Resend) take the text colour, so they show in dark mode too. */
export const isDark = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 60;
};
