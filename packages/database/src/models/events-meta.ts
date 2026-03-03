import Mongoose, { Schema, type Model as ModelType } from "mongoose";
import logger from "@waifufun/logger";
import type { IEventsMeta } from "@waifufun/types";

export interface IEventsMetaModel extends ModelType<IEventsMeta> {
	getOrCreate(programId: string, networkId: string): Promise<IEventsMeta>;
	updateSyncProgress(
		programId: string,
		networkId: string,
		currentBlock: number,
		highestSyncedBlock?: number,
	): Promise<IEventsMeta>;
	markGenesisComplete(programId: string, networkId: string): Promise<IEventsMeta>;
}

const schema = new Schema<IEventsMeta, IEventsMetaModel>(
	{
		programId: { type: String, required: true },
		networkId: { type: String, required: true },
		currentBlock: { type: Number, required: true, default: 0 },
		highestSyncedBlock: { type: Number, required: true, default: 0 },
		minBlock: { type: Number, required: true, default: 0 },
		doneGenesisSync: { type: Boolean, default: false },
		lastSyncTimestamp: { type: Date, default: Date.now },
		isActive: { type: Boolean, default: false },
	},
	{ timestamps: true, versionKey: false },
);

// Unique index for programId + networkId combination
schema.index({ programId: 1, networkId: 1 }, { unique: true });

schema.statics.getOrCreate = async function (programId: string, networkId: string): Promise<IEventsMeta> {
	try {
		let meta = await this.findOne({ programId, networkId });

		if (!meta) {
			meta = await this.create({
				programId,
				networkId,
				currentBlock: 0,
				highestSyncedBlock: 0,
				minBlock: 0,
				doneGenesisSync: false,
				lastSyncTimestamp: new Date(),
				isActive: false,
			});
			logger.info(`Created new sync metadata for ${programId} on ${networkId}`);
		}

		return meta;
	} catch (error) {
		logger.error("Error getting or creating events meta:", error);
		throw error;
	}
};

schema.statics.updateSyncProgress = async function (
	programId: string,
	networkId: string,
	currentBlock: number,
	highestSyncedBlock?: number,
): Promise<IEventsMeta> {
	const updateData: {
		currentBlock: number;
		isActive?: boolean;
		lastSyncTimestamp: Date;
		highestSyncedBlock?: number;
	} = {
		currentBlock,
		lastSyncTimestamp: new Date(),
		isActive: true,
	};

	if (highestSyncedBlock !== undefined) {
		updateData.highestSyncedBlock = Math.max(highestSyncedBlock, currentBlock);
	}

	const meta = await this.findOneAndUpdate({ programId, networkId }, updateData, { new: true, upsert: true });

	return meta;
};

schema.statics.markGenesisComplete = async function (programId: string, networkId: string): Promise<IEventsMeta> {
	const meta = await this.findOneAndUpdate(
		{ programId, networkId },
		{
			doneGenesisSync: true,
			lastSyncTimestamp: new Date(),
			isActive: false,
		},
		{ new: true },
	);

	if (!meta) {
		throw new Error(`Events meta not found for ${programId} on ${networkId}`);
	}

	logger.info(`Marked genesis sync complete for ${programId} on ${networkId}`);
	return meta;
};

const Model = Mongoose.model<IEventsMeta, IEventsMetaModel>("EventsMeta", schema);

Model.createIndexes();

export default Model;
