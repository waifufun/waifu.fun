// s3Client.ts
import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import logger from "@waifufun/logger";

const { PUBLIC_STORAGE_BASE_URL: configuredPublicStorageBaseUrl, S3_BUCKET_NAME: configuredBucketName } = process.env;

let cachedClient:
	| {
			client: S3Client;
			bucketName: string;
			publicBaseUrl: string;
			isLocal: boolean;
	  }
	| undefined;

function getS3Config() {
	const {
		S3_STORAGE_ENDPOINT,
		PUBLIC_STORAGE_BASE_URL,
		S3_ACCESS_KEY: accessKeyId,
		S3_SECRET_KEY: secretAccessKey,
		S3_BUCKET_NAME: bucketName,
		S3_REGION: region = "us-east-1",
	} = process.env;

	if (!S3_STORAGE_ENDPOINT || !accessKeyId || !secretAccessKey || !bucketName || !PUBLIC_STORAGE_BASE_URL) {
		const message =
			"Missing one of S3_STORAGE_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, or S3_BUCKET_NAME, or PUBLIC_STORAGE_BASE_URL in environment variables.";
		logger.error(message);
		throw new Error(message);
	}

	const endpoint = S3_STORAGE_ENDPOINT.replace(/\/$/, "");
	const isLocal = endpoint.includes("localhost") || endpoint.includes("127.0.0.1");
	const s3Config: S3ClientConfig = {
		region: isLocal ? region : "auto",
		endpoint,
		credentials: { accessKeyId, secretAccessKey },
		forcePathStyle: true,
	};

	return {
		s3Config,
		bucketName,
		publicBaseUrl: `${PUBLIC_STORAGE_BASE_URL.replace(/\/$/, "")}/${bucketName}`,
		isLocal,
	};
}

export const s3 = new Proxy({} as S3Client, {
	get(_target, prop) {
		const client = getS3Client().client;
		const value = Reflect.get(client, prop, client);
		return typeof value === "function" ? value.bind(client) : value;
	},
});

export const publicBaseUrl =
	configuredPublicStorageBaseUrl && configuredBucketName
		? `${configuredPublicStorageBaseUrl.replace(/\/$/, "")}/${configuredBucketName}`
		: "";

export function getS3Client() {
	if (!cachedClient) {
		const { s3Config, bucketName, publicBaseUrl, isLocal } = getS3Config();
		cachedClient = {
			client: new S3Client(s3Config),
			bucketName,
			publicBaseUrl,
			isLocal,
		};
	}

	return {
		client: cachedClient.client,
		bucketName: cachedClient.bucketName,
		publicBaseUrl: cachedClient.publicBaseUrl,
		isLocal: cachedClient.isLocal,
	};
}
