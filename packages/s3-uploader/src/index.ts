import * as aws from "@aws-sdk/client-s3";
import logger from "@autofun/logger";
import type { IFile, TURLLike } from "@autofun/types";
// @ts-ignore
import mime from "mime-types";
import sharp from "sharp";
import dotenv from "dotenv";

dotenv.config();

const BUCKET_NAME = "autofun";

if (!process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY || !process.env.S3_STORAGE_ENDPOINT) {
	logger.error("AWS_ACCESS_KEY or AWS_SECRET_KEY missing from ENV");
	process.exit(1);
}

const s3Credentials: aws.S3ClientConfig = {
	region: process.env.S3_REGION || "us-east-1",
	endpoint: process.env.S3_STORAGE_ENDPOINT,
	credentials: {
		accessKeyId: process.env.S3_ACCESS_KEY,
		secretAccessKey: process.env.S3_SECRET_KEY,
	},
	forcePathStyle: false,
};

export const s3 = new aws.S3(s3Credentials);

export const getFileUrl = (fileName: string, bucket: string): TURLLike => {
	return `${process.env.S3_STORAGE_ENDPOINT}/${bucket}/${fileName}` as TURLLike;
};

/**
 * Uploads a file to S3
 * @param bucket The S3 bucket folder to upload to
 * @param file The file object containing data and mimetype
 * @param fileName The name to give the file in S3 (without extension)
 * @returns Promise<void>
 */
export const upload = async (bucket: string, file: IFile, fileName: string) => {
	const isMacOs = process.platform === "darwin" || process.platform === "linux";

	const command = new aws.PutObjectCommand({
		Bucket: bucket,
		Key: isMacOs
			? `${bucket}/${String(fileName)}.${mime.extension(file?.mimetype)}`
			: `${String(fileName)}.${mime.extension(file?.mimetype)}`,
		ContentType: file.mimetype,
		Body: file.data,
		ACL: "public-read",
	});
	try {
		await s3.send(command);
	} catch (error) {
		console.error("S3 upload error:", error);
		throw error;
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
	return imgBuffer;
};

/**
 * Deletes a file from S3
 * @param bucket The S3 bucket folder where the file is stored
 * @param fileName The name of the file to delete (including extension)
 * @returns Promise<void>
 */
export const deleteFile = async (bucket: string, fileName: string) => {
	const data = new aws.DeleteObjectCommand({
		Bucket: BUCKET_NAME,
		Key: `${bucket}/${fileName}`,
	});

	await s3.send(data);
};

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
			.webp({ lossless: true })
			.toBuffer();
		console.log("file name ->", compressed)
		await upload(bucket, { data: compressed, mimetype: "image/webp" }, fileName);
	} else {
		return false;
	}
	return getFileUrl(`${fileName}.webp`, bucket);
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
	const response = await fetch(imageUrl);

	if (!response.ok) {
		throw new Error(`Failed to fetch image from URL: ${imageUrl}, status: ${response.status}`);
	}

	const imageArrayBuffer = await response.arrayBuffer();
	const imageBuffer = Buffer.from(imageArrayBuffer);

	const compressed = await sharp(imageBuffer)
		.resize({ height: height || 750, width: width || 750 })
		.webp({ lossless: true })
		.toBuffer();

	await upload(bucket, { data: compressed, mimetype: "image/webp" }, fileName);

	return getFileUrl(`${fileName}.webp`, bucket);
};
