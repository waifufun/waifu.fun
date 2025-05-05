import * as aws from "@aws-sdk/client-s3";
import logger from "@autofun/logger";
import type { IFile } from "@autofun/types";
// @ts-ignore
import mime from "mime-types";
import sharp from "sharp";
import dotenv from "dotenv";

dotenv.config();

const BUCKET_NAME = "autofun";

if (!process.env.AWS_ACCESS_KEY || !process.env.AWS_SECRET_KEY || !process.env.S3_STORAGE_ENDPOINT) {
	logger.error("AWS_ACCESS_KEY or AWS_SECRET_KEY missing from ENV");
	process.exit(1);
}

const s3Credentials: aws.S3ClientConfig = {
	region: process.env.S3_REGION || "us-east-1",
	endpoint: process.env.S3_STORAGE_ENDPOINT,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY,
		secretAccessKey: process.env.AWS_SECRET_KEY,
	},
	forcePathStyle: false,
};

export const s3 = new aws.S3(s3Credentials);

export const upload = async (bucket: string, file: IFile, fileName: string) => {
	const command = new aws.PutObjectCommand({
		Bucket: BUCKET_NAME,
		Key: `${bucket}/${String(fileName)}.${mime.extension(file?.mimetype)}`,
		ContentType: file.mimetype,
		Body: file.data,
		ACL: "public-read",
	});
	await s3.send(command);
};

export const getBase64Buffer = (image: string | undefined | null) => {
	if (!image) return null;
	const imageSplit = String(image).split(";base64,").pop();
	const imgBuffer = Buffer.from(String(imageSplit), "base64");
	return imgBuffer;
};

export const deleteFile = async (bucket: string, fileName: string) => {
	const data = new aws.DeleteObjectCommand({
		Bucket: BUCKET_NAME,
		Key: `${bucket}/${fileName}`,
	});

	await s3.send(data);
};

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

		await upload(bucket, { data: compressed, mimetype: "image/webp" }, fileName);
	} else {
		return false;
	}
	return true;
};
