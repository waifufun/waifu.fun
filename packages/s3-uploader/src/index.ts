import * as aws from "@aws-sdk/client-s3";
import logger from "@waifufun/logger";
import type { IFile, TURLLike } from "@waifufun/types";
import dotenv from "dotenv";
// @ts-ignore
import mime from "mime-types";
import sharp from "sharp";
import { getS3Client } from "./s3Client";
import { safeFetchBytes } from "./safe-url-fetch";

dotenv.config();
const { PUBLIC_STORAGE_BASE_URL, S3_BUCKET_NAME: bucketName } = process.env;
if (!PUBLIC_STORAGE_BASE_URL || !bucketName) {
	logger.error("Missing PUBLIC_STORAGE_BASE_URL or S3_BUCKET_NAME in environment variables.");
	process.exit(1);
}

export const publicBaseUrl = `${PUBLIC_STORAGE_BASE_URL.replace(/\/$/, "")}/${bucketName}`;
const MAX_IMAGE_FETCH_BYTES = 10 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 10_000;

export const getFileUrl = (fileName: string, bucket: string): TURLLike => {
	return `${process.env.PUBLIC_STORAGE_BASE_URL}/${bucket}/${fileName}` as TURLLike;
};

/**
 * Uploads a file to S3
 * @param bucket The S3 bucket folder to upload to
 * @param file The file object containing data and mimetype
 * @param fileName The name to give the file in S3 (without extension)
 * @returns Promise<void>
 */
export const upload = async (bucket: string, file: IFile, fileName: string) => {
	const { client, bucketName, publicBaseUrl, isLocal } = await getS3Client();
	console.log(
		`Uploading file to S3: ${fileName} in bucket: ${bucket}, bucketName: ${bucketName}, publicBaseUrl: ${publicBaseUrl}, isLocal: ${isLocal}`,
	);

	const ext = mime.extension(file.mimetype);
	const key = `${bucket}/${fileName}.${ext}`;

	logger.info(`Uploading to ${bucketName}/${key} (contentType=${file.mimetype})`);

	const command = new aws.PutObjectCommand({
		Bucket: bucketName,
		Key: key,
		CacheControl: "max-age=31536000, immutable",
		ContentType: file.mimetype,
		Body: file.data,
		// Only set ACL for local S3
		...(isLocal ? { ACL: "public-read" } : {}),
	});
	try {
		await client.send(command);
	} catch (error) {
		console.error("S3 upload error:", error);
		throw error;
	}
};

// Modifies an existing file in S3 by updating its content
export const modifyFile = async (
	bucket: string,
	fileName: string,
	newContent: Buffer | string,
	contentType = "application/json",
) => {
	const { client, bucketName, isLocal } = await getS3Client();
	const key = `${bucket}/${fileName}`;

	logger.info(`Modifying S3 file: ${bucketName}/${key} (contentType=${contentType})`);

	const contentBuffer = typeof newContent === "string" ? Buffer.from(newContent, "utf8") : newContent;

	const command = new aws.PutObjectCommand({
		Bucket: bucketName,
		Key: key,
		Body: contentBuffer,
		ContentType: contentType,
		CacheControl: "public, max-age=3600",
		// Only set ACL for local S3
		...(isLocal ? { ACL: "public-read" } : {}),
	});

	try {
		await client.send(command);
		logger.info(`Successfully modified S3 file: ${bucketName}/${key}`);
	} catch (error: unknown) {
		const err = error instanceof Error ? error : new Error(String(error));
		logger.error(err, `Failed to modify S3 file ${bucketName}/${key}`);
		throw error;
	}
};

// Extracts the S3 object key from a metadata URL
export const extractObjectKeyFromUrl = (metadataUrl: string): string => {
	const { publicBaseUrl } = getS3Client();

	// Define potential prefixes
	const expectedR2Prefix = "https://storage.waifufun.tech/";
	const expectedMinioPrefixPattern = /^http:\/\/localhost:9000\/[^\/]+\//;
	const localApiPrefix = "/api/metadata/";

	if (metadataUrl.startsWith(`${publicBaseUrl}/`)) {
		// Check primary case: starts with current base URL
		const basePath = new URL(publicBaseUrl).pathname.replace(/^\/+|\/+$/g, "");
		const path = new URL(metadataUrl).pathname.replace(/^\/+/, "");
		return basePath && path.startsWith(`${basePath}/`) ? path.substring(basePath.length + 1) : path;
	}
	if (metadataUrl.startsWith(expectedR2Prefix)) {
		// Check legacy/hardcoded R2 prefix
		return metadataUrl.substring(expectedR2Prefix.length);
	}
	if (expectedMinioPrefixPattern.test(metadataUrl)) {
		// Check if it looks like a MinIO path URL
		return new URL(metadataUrl).pathname.substring(1);
	}
	// Fallback for local API path or other unknowns
	try {
		const parsedUrl = new URL(metadataUrl);
		const path = parsedUrl.pathname;
		if (path.startsWith(localApiPrefix)) {
			const filename = path.substring(localApiPrefix.length);
			return `token-metadata/${filename}`;
		}
		throw new Error(`Cannot determine S3 key from unexpected URL format: ${metadataUrl}`);
	} catch (urlParseError) {
		throw new Error(`Failed to parse metadata URL: ${metadataUrl}`);
	}
};

/**
 * Converts a base64 encoded image string to a Buffer
 * @param image The base64 encoded image string
 * @returns Buffer | null - Returns null if the input is falsy
 */
export const getBase64Buffer = (image: string | undefined | null) => {
	if (!image) return null;
	const imageSplit = String(image).split(";base64,").pop();
	const imgBuffer = Buffer.from(String(imageSplit), "base64");
	if (imgBuffer.byteLength > MAX_IMAGE_FETCH_BYTES) {
		throw new Error(`Base64 image is larger than ${MAX_IMAGE_FETCH_BYTES} bytes`);
	}
	return imgBuffer;
};

export async function deleteFile(folder: string, fileName: string): Promise<void> {
	const { client, bucketName } = await getS3Client();
	const key = `${folder}/${fileName}`;

	const cmd = new aws.DeleteObjectCommand({
		Bucket: bucketName,
		Key: key,
	});

	try {
		await client.send(cmd);
		logger.info(`Deleted S3 object ${bucketName}/${key}`);
	} catch (err: unknown) {
		const wrapped = err instanceof Error ? err : new Error(String(err));
		logger.error(wrapped, `Failed to delete S3 object ${bucketName}/${key}`);
		throw err;
	}
}

/**
 * Uploads a base64 encoded image to S3
 * @param image The base64 encoded image string
 * @param fileName The name to give the file in S3 (without extension)
 * @param bucket The S3 bucket folder to upload to
 * @param width Optional width to resize the image to (default: 750)
 * @param height Optional height to resize the image to (default: 750)
 * @returns Promise<boolean> indicating success or failure
 */
export const uploadBase64Image = async (
	image: string | undefined | null,
	fileName: string,
	bucket: string,
	width?: number,
	height?: number,
) => {
	const imgBuffer = getBase64Buffer(image);
	if (imgBuffer) {
		const compressed = await sharp(imgBuffer)
			.resize({ height: height || 750, width: width || 750 })
			.png({
				compressionLevel: 2,
				quality: 100,
			})
			.toBuffer();
		await upload(bucket, { data: compressed, mimetype: "image/png" }, fileName);
	} else {
		return false;
	}
	return getFileUrl(`${fileName}.png`, bucket);
};

/**
 * Uploads an image from a direct URL to S3
 * @param imageUrl The URL of the image to upload
 * @param fileName The name to give the file in S3 (without extension)
 * @param bucket The S3 bucket folder to upload to
 * @param width Optional width to resize the image to
 * @param height Optional height to resize the image to
 * @returns Promise<boolean> indicating success or failure
 */
export const uploadImageFromUrl = async (
	imageUrl: string,
	fileName: string,
	bucket: string,
	width?: number,
	height?: number,
): Promise<TURLLike> => {
	const response = await safeFetchBytes(imageUrl, {
		maxBytes: MAX_IMAGE_FETCH_BYTES,
		timeoutMs: IMAGE_FETCH_TIMEOUT_MS,
		allowedContentTypes: ["image/"],
		accept: "image/*",
	});
	const imageBuffer = Buffer.from(response.bytes);

	const compressed = await sharp(imageBuffer)
		.resize({ height: height || 750, width: width || 750 })
		.png({
			compressionLevel: 2,
			quality: 100,
		})
		.toBuffer();

	await upload(bucket, { data: compressed, mimetype: "image/png" }, fileName);

	return getFileUrl(`${fileName}.png`, bucket);
};
