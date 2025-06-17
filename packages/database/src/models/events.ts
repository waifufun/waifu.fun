import logger from "@autofun/logger";
import Mongoose, { Schema, type PaginateModel } from "mongoose";
import paginate from "mongoose-paginate-v2";

export interface IEvent {
	signature: string;
	slot: number;
	blockTime: number;
	eventType: "launch" | "swap" | "launchAndSwap" | "curveCompleted" | "withdraw";
	contractAddress: string;
	creator?: string;
	user?: string;
	admin?: string;
	tokenName?: string;
	tokenSymbol?: string;
	tokenUri?: string;
	decimals?: number;
	tokenSupply?: string;
	virtualLamportReserves?: string;
	swapAmount?: string;
	direction?: number;
	minimumReceiveAmount?: string;
	deadline?: string;
	amountGotten?: string;
	bondingCurve?: string;
	bondingCurveAddress?: string;
	teamWallet?: string;
	globalVault?: string;
	instructionData?: string;
	accounts?: string[];
	processed: boolean;
	error?: string;
	instructionIndex?: number;
	programId: string;
}

export interface IEventModel extends PaginateModel<IEvent> {
	createOrUpdate(eventData: Partial<IEvent>): Promise<IEvent>;
	insertManyOrUpdate(events: Partial<IEvent>[]): Promise<IEvent[]>;
}

const schema = new Schema<IEvent, IEventModel>(
	{
		signature: { type: String, required: true },
		slot: { type: Number, required: true },
		blockTime: { type: Number, required: true },
		eventType: {
			type: String,
			enum: ["launch", "swap", "launchAndSwap", "curveCompleted", "withdraw"],
			required: true,
		},
		contractAddress: { type: String, required: true },
		creator: { type: String },
		user: { type: String },
		admin: { type: String },
		tokenName: { type: String },
		tokenSymbol: { type: String },
		tokenUri: { type: String },
		decimals: { type: Number },
		tokenSupply: { type: String },
		virtualLamportReserves: { type: String },
		swapAmount: { type: String },
		direction: { type: Number },
		minimumReceiveAmount: { type: String },
		deadline: { type: String },
		amountGotten: { type: String },
		bondingCurve: { type: String },
		bondingCurveAddress: { type: String },
		teamWallet: { type: String },
		globalVault: { type: String },
		instructionData: { type: String },
		accounts: [{ type: String }],
		processed: { type: Boolean, default: false },
		error: { type: String },
		instructionIndex: { type: Number },
		programId: { type: String, required: true },
	},
	{ timestamps: true, versionKey: false },
);

// biome-ignore lint/suspicious/noExplicitAny: Use any for now
schema.plugin(paginate as any);

// Compound unique index to prevent duplicates
schema.index({ signature: 1, instructionIndex: 1, programId: 1 }, { unique: true, name: "unique_instruction" });

// Additional indexes
schema.index({ signature: 1 });
schema.index({ contractAddress: 1 });
schema.index({ eventType: 1 });
schema.index({ creator: 1 });
schema.index({ user: 1 });
schema.index({ slot: 1 });
schema.index({ blockTime: 1 });
schema.index({ contractAddress: 1, eventType: 1 });
schema.index({ processed: 1 });
schema.index({ createdAt: -1 });
schema.index({ contractAddress: 1, eventType: 1, createdAt: 1 });
schema.index({ admin: 1 });
schema.index({ eventType: 1, admin: 1 });

// Static method implementation
schema.statics.createOrUpdate = async function (eventData: Partial<IEvent>): Promise<IEvent> {
	try {
		// Try to find existing event first
		const existing = await this.findOne({
			signature: eventData.signature,
			instructionIndex: eventData.instructionIndex,
			programId: eventData.programId,
		});

		if (existing) {
			// Update existing event
			Object.assign(existing, eventData);
			return await existing.save();
		}
		return await this.create(eventData);
	} catch (err) {
		const error = err as { code?: number };
		if (error?.code === 11000) {
			// Duplicate key error - event already exists
			logger.info(`Event already exists: ${eventData.signature}:${eventData.instructionIndex}`);
			const existingEvent = await this.findOne({
				signature: eventData.signature,
				instructionIndex: eventData.instructionIndex,
				programId: eventData.programId,
			});
			if (!existingEvent) {
				throw new Error("Event not found after duplicate key error");
			}
			return existingEvent;
		}
		throw error;
	}
};

schema.statics.insertManyOrUpdate = async function (events: Partial<IEvent>[]): Promise<IEvent[]> {
	if (events.length === 0) return [];

	try {
		// bulkWrite for efficient upsert
		const bulkOps = events.map((eventData) => ({
			updateOne: {
				filter: {
					signature: eventData.signature,
					instructionIndex: eventData.instructionIndex,
					programId: eventData.programId,
				},
				update: { $set: eventData },
				upsert: true,
			},
		}));

		const result = await this.bulkWrite(bulkOps, { ordered: false });

		logger.info(`Bulk operation completed: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`);

		// Return the events by finding them, not the most efficient but ensures we return the actual documents;
		const signatures = events.map((e) => ({
			signature: e.signature,
			instructionIndex: e.instructionIndex,
			programId: e.programId,
		}));

		const savedEvents = await this.find({
			$or: signatures,
		});

		return savedEvents;
	} catch (error) {
		logger.error("Error in bulk upsert operation:", error);

		throw error;
	}
};

const Model = Mongoose.model<IEvent, IEventModel>("Event", schema);

Model.createIndexes();

export default Model;
