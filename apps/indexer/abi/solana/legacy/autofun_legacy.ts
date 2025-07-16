import { PublicKey } from "@solana/web3.js";

export const programId = new PublicKey("autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5");

function readBorshString(buffer: Buffer, offset: number): { value: string; nextOffset: number } {
	let off = offset;
	const length = buffer.readUInt32LE(off);
	off += 4;

	const value = buffer.toString("utf-8", off, off + length);
	off += length;

	return { value, nextOffset: off };
}

export const instructions = {
	launch: {
		name: "launch",
		d8: [153, 241, 93, 225, 22, 69, 74, 61],
		decode: (data: Buffer) => {
			const payload = data.slice(8);
			let offset = 0;

			try {
				const decimals = payload.readUInt8(offset);
				offset += 1;

				const tokenSupply = payload.readBigUInt64LE(offset);
				offset += 8;

				const virtualLamportReserves = payload.readBigUInt64LE(offset);
				offset += 8;

				const name = readBorshString(payload, offset);
				offset = name.nextOffset;

				const symbol = readBorshString(payload, offset);
				offset = symbol.nextOffset;

				const uri = readBorshString(payload, offset);
				offset = uri.nextOffset;

				return {
					data: {
						decimals,
						tokenSupply,
						virtualLamportReserves,
						name: name.value,
						symbol: symbol.value,
						uri: uri.value,
					},
				};
				// biome-ignore lint/suspicious/noExplicitAny: <reason>
			} catch (error: any) {
				return {
					error: `Failed to decode launch instruction: ${error.message}`,
					rawPayload: Array.from(payload),
				};
			}
		},
	},

	swap: {
		name: "swap",
		d8: [248, 198, 158, 145, 225, 117, 135, 200],
		decode: (data: Buffer) => {
			const payload = data.slice(8);
			let offset = 0;

			try {
				const amount = payload.readBigUInt64LE(offset);
				offset += 8;

				const direction = payload.readUInt8(offset);
				offset += 1;

				const minimumReceiveAmount = payload.readBigInt64LE(offset);
				offset += 8;

				const deadline = payload.readBigInt64LE(offset);
				offset += 8;

				return {
					data: {
						amount,
						direction,
						minimumReceiveAmount,
						deadline,
					},
				};
				// biome-ignore lint/suspicious/noExplicitAny: <reason>
			} catch (error: any) {
				return {
					error: `Failed to decode swap instruction: ${error.message}`,
					rawPayload: Array.from(payload),
				};
			}
		},
	},

	launchAndSwap: {
		name: "launchAndSwap",
		d8: [67, 201, 190, 15, 185, 41, 47, 122],
		decode: (data: Buffer) => {
			const payload = data.slice(8);
			let offset = 0;

			try {
				const decimals = payload.readUInt8(offset);
				offset += 1;

				const tokenSupply = payload.readBigUInt64LE(offset);
				offset += 8;

				const virtualLamportReserves = payload.readBigUInt64LE(offset);
				offset += 8;

				const name = readBorshString(payload, offset);
				offset = name.nextOffset;

				const symbol = readBorshString(payload, offset);
				offset = symbol.nextOffset;

				const uri = readBorshString(payload, offset);
				offset = uri.nextOffset;

				const swapAmount = payload.readBigUInt64LE(offset);
				offset += 8;

				const minimumReceiveAmount = payload.readBigUInt64LE(offset);
				offset += 8;

				const deadline = payload.readBigInt64LE(offset);
				offset += 8;

				return {
					data: {
						decimals,
						tokenSupply,
						virtualLamportReserves,
						name: name.value,
						symbol: symbol.value,
						uri: uri.value,
						swapAmount,
						minimumReceiveAmount,
						deadline,
					},
				};
				// biome-ignore lint/suspicious/noExplicitAny: <reason>
			} catch (error: any) {
				return {
					error: `Failed to decode launchAndSwap instruction: ${error.message}`,
					rawPayload: Array.from(payload),
				};
			}
		},
	},

	configure: {
		name: "configure",
		d8: [245, 7, 108, 117, 95, 196, 54, 217],
		decode: (data: Buffer) => {
			return {
				type: "configure",
				rawData: Array.from(data.slice(8)),
			};
		},
	},

	withdraw: {
		name: "withdraw",
		d8: [183, 18, 70, 156, 148, 109, 161, 34],
		decode: (data: Buffer) => {
			return {
				type: "withdraw",
				rawData: Array.from(data.slice(8)),
			};
		},
	},

	acceptAuthority: {
		name: "accept_authority",
		d8: [107, 86, 198, 91, 33, 12, 107, 160],
		decode: (data: Buffer) => {
			return {
				type: "accept_authority",
				rawData: Array.from(data.slice(8)),
			};
		},
	},

	nominateAuthority: {
		name: "nominate_authority",
		d8: [148, 182, 144, 91, 186, 12, 118, 18],
		decode: (data: Buffer) => {
			const payload = data.slice(8);

			try {
				const newAdmin = payload.slice(0, 32).toString("hex");

				return {
					data: {
						newAdmin,
					},
				};
				// biome-ignore lint/suspicious/noExplicitAny: <reason>
			} catch (error: any) {
				return {
					error: `Failed to decode nominate_authority instruction: ${error.message}`,
					rawPayload: Array.from(payload),
				};
			}
		},
	},

	events: {
		CompleteEvent: {
			name: "CompleteEvent",
			d8: [95, 114, 97, 156, 212, 46, 152, 8],
			decode: (data: Buffer) => {
				try {
					return {
						user: data.slice(0, 32).toString("hex"),
						mint: data.slice(32, 64).toString("hex"),
						bondingCurve: data.slice(64, 96).toString("hex"),
					};
					// biome-ignore lint/suspicious/noExplicitAny: <reason>
				} catch (error: any) {
					return {
						error: `Failed to decode CompleteEvent: ${error.message}`,
						rawData: Array.from(data),
					};
				}
			},
		},
	},
};
