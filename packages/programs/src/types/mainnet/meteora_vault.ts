/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/meteora_vault.json`.
 */
export type MeteoraVault = {
	address: "auto8znD4FacuJSPEfD6hpFUZTUaakso8dbEgDD1P84";
	metadata: {
		name: "meteoraVault";
		version: "0.1.0";
		spec: "0.1.0";
		description: "Created with Anchor";
	};
	instructions: [
		{
			name: "changeClaimer";
			discriminator: [89, 180, 248, 121, 12, 93, 126, 137];
			accounts: [
				{
					name: "authority";
					writable: true;
					signer: true;
				},
				{
					name: "vaultConfig";
					pda: {
						seeds: [
							{
								kind: "const";
								value: [109, 101, 116, 101, 111, 114, 97, 95, 118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103];
							},
						];
					};
				},
				{
					name: "userPosition";
					pda: {
						seeds: [
							{
								kind: "const";
								value: [109, 101, 116, 101, 111, 114, 97, 95, 112, 111, 115, 105, 116, 105, 111, 110];
							},
							{
								kind: "account";
								path: "positionNft";
							},
						];
					};
				},
				{
					name: "positionNft";
				},
			];
			args: [
				{
					name: "newClaimer";
					type: "pubkey";
				},
			];
		},
		{
			name: "changeEmergency";
			discriminator: [162, 172, 152, 154, 224, 204, 91, 122];
			accounts: [
				{
					name: "authority";
					writable: true;
					signer: true;
				},
				{
					name: "vaultConfig";
					writable: true;
					pda: {
						seeds: [
							{
								kind: "const";
								value: [109, 101, 116, 101, 111, 114, 97, 95, 118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103];
							},
						];
					};
				},
			];
			args: [
				{
					name: "newEmergency";
					type: "pubkey";
				},
			];
		},
		{
			name: "changeExecutor";
			discriminator: [192, 236, 44, 38, 136, 100, 140, 158];
			accounts: [
				{
					name: "authority";
					writable: true;
					signer: true;
				},
				{
					name: "vaultConfig";
					writable: true;
					pda: {
						seeds: [
							{
								kind: "const";
								value: [109, 101, 116, 101, 111, 114, 97, 95, 118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103];
							},
						];
					};
				},
			];
			args: [
				{
					name: "newExecutor";
					type: "pubkey";
				},
			];
		},
		{
			name: "changeManager";
			discriminator: [97, 44, 74, 213, 119, 243, 203, 8];
			accounts: [
				{
					name: "authority";
					writable: true;
					signer: true;
				},
				{
					name: "vaultConfig";
					writable: true;
					pda: {
						seeds: [
							{
								kind: "const";
								value: [109, 101, 116, 101, 111, 114, 97, 95, 118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103];
							},
						];
					};
				},
			];
			args: [
				{
					name: "newManager";
					type: "pubkey";
				},
			];
		},
		{
			name: "claimPositionFee";
			discriminator: [180, 38, 154, 17, 133, 33, 162, 211];
			accounts: [
				{
					name: "authority";
					writable: true;
					signer: true;
				},
				{
					name: "vaultConfig";
					pda: {
						seeds: [
							{
								kind: "const";
								value: [109, 101, 116, 101, 111, 114, 97, 95, 118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103];
							},
						];
					};
				},
				{
					name: "poolAuthority";
					writable: true;
				},
				{
					name: "pool";
					writable: true;
				},
				{
					name: "position";
					writable: true;
				},
				{
					name: "tokenAAccount";
					docs: ["The user token a account"];
					writable: true;
				},
				{
					name: "tokenBAccount";
					docs: ["The user token b account"];
					writable: true;
				},
				{
					name: "tokenAVault";
					docs: ["The vault token account for input token"];
					writable: true;
				},
				{
					name: "tokenBVault";
					docs: ["The vault token account for output token"];
					writable: true;
				},
				{
					name: "tokenAMint";
					docs: ["The mint of token a"];
				},
				{
					name: "tokenBMint";
					docs: ["The mint of token b"];
				},
				{
					name: "positionNftAccount";
					docs: ["The token account for nft"];
					writable: true;
				},
				{
					name: "owner";
				},
				{
					name: "tokenAProgram";
					docs: ["Token a program"];
				},
				{
					name: "tokenBProgram";
					docs: ["Token b program"];
				},
				{
					name: "eventAuthority";
				},
				{
					name: "dynamicAmm";
					address: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";
				},
			];
			args: [];
		},
		{
			name: "deposit";
			discriminator: [242, 35, 198, 137, 82, 225, 242, 182];
			accounts: [
				{
					name: "authority";
					writable: true;
					signer: true;
				},
				{
					name: "vaultConfig";
					pda: {
						seeds: [
							{
								kind: "const";
								value: [109, 101, 116, 101, 111, 114, 97, 95, 118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103];
							},
						];
					};
				},
				{
					name: "userPosition";
					writable: true;
					pda: {
						seeds: [
							{
								kind: "const";
								value: [109, 101, 116, 101, 111, 114, 97, 95, 112, 111, 115, 105, 116, 105, 111, 110];
							},
							{
								kind: "account";
								path: "positionNft";
							},
						];
					};
				},
				{
					name: "positionNft";
				},
				{
					name: "fromAccount";
					writable: true;
					pda: {
						seeds: [
							{
								kind: "account";
								path: "authority";
							},
							{
								kind: "account";
								path: "tokenProgram";
							},
							{
								kind: "account";
								path: "positionNft";
							},
						];
						program: {
							kind: "const";
							value: [
								140,
								151,
								37,
								143,
								78,
								36,
								137,
								241,
								187,
								61,
								16,
								41,
								20,
								142,
								13,
								131,
								11,
								90,
								19,
								153,
								218,
								255,
								16,
								132,
								4,
								142,
								123,
								216,
								219,
								233,
								248,
								89,
							];
						};
					};
				},
				{
					name: "nftTokenFaucet";
					writable: true;
					pda: {
						seeds: [
							{
								kind: "const";
								value: [
									109,
									101,
									116,
									101,
									111,
									114,
									97,
									95,
									118,
									97,
									117,
									108,
									116,
									95,
									110,
									102,
									116,
									95,
									115,
									101,
									101,
									100,
								];
							},
							{
								kind: "account";
								path: "positionNft";
							},
						];
					};
				},
				{
					name: "tokenProgram";
				},
				{
					name: "systemProgram";
					address: "11111111111111111111111111111111";
				},
			];
			args: [
				{
					name: "claimerAddress";
					type: "pubkey";
				},
			];
		},
		{
			name: "emergencyWithdraw";
			discriminator: [239, 45, 203, 64, 150, 73, 218, 92];
			accounts: [
				{
					name: "authority";
					writable: true;
					signer: true;
				},
				{
					name: "vaultConfig";
					pda: {
						seeds: [
							{
								kind: "const";
								value: [109, 101, 116, 101, 111, 114, 97, 95, 118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103];
							},
						];
					};
				},
				{
					name: "userPosition";
					writable: true;
					pda: {
						seeds: [
							{
								kind: "const";
								value: [109, 101, 116, 101, 111, 114, 97, 95, 112, 111, 115, 105, 116, 105, 111, 110];
							},
							{
								kind: "account";
								path: "positionNft";
							},
						];
					};
				},
				{
					name: "positionNft";
					writable: true;
				},
				{
					name: "nftTokenFaucet";
					writable: true;
					pda: {
						seeds: [
							{
								kind: "const";
								value: [
									109,
									101,
									116,
									101,
									111,
									114,
									97,
									95,
									118,
									97,
									117,
									108,
									116,
									95,
									110,
									102,
									116,
									95,
									115,
									101,
									101,
									100,
								];
							},
							{
								kind: "account";
								path: "positionNft";
							},
						];
					};
				},
				{
					name: "toAccount";
					writable: true;
				},
				{
					name: "tokenProgram";
				},
			];
			args: [];
		},
		{
			name: "initialize";
			discriminator: [175, 175, 109, 31, 13, 152, 155, 237];
			accounts: [
				{
					name: "payer";
					writable: true;
					signer: true;
				},
				{
					name: "vaultConfig";
					writable: true;
					pda: {
						seeds: [
							{
								kind: "const";
								value: [109, 101, 116, 101, 111, 114, 97, 95, 118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103];
							},
						];
					};
				},
				{
					name: "systemProgram";
					docs: ["System program"];
					address: "11111111111111111111111111111111";
				},
			];
			args: [
				{
					name: "initConfig";
					type: {
						defined: {
							name: "initVaultConfig";
						};
					};
				},
			];
		},
	];
	accounts: [
		{
			name: "userPosition";
			discriminator: [251, 248, 209, 245, 83, 234, 17, 27];
		},
		{
			name: "vaultConfig";
			discriminator: [99, 86, 43, 216, 184, 102, 119, 77];
		},
	];
	events: [
		{
			name: "claimerChanged";
			discriminator: [58, 116, 209, 125, 102, 22, 183, 26];
		},
		{
			name: "cpFeeCollected";
			discriminator: [33, 223, 81, 151, 208, 80, 188, 1];
		},
		{
			name: "emergencyChanged";
			discriminator: [216, 70, 157, 227, 147, 10, 142, 77];
		},
		{
			name: "emergencyWithdrawed";
			discriminator: [139, 158, 121, 121, 239, 210, 1, 50];
		},
		{
			name: "executorChanged";
			discriminator: [231, 13, 59, 234, 251, 184, 82, 224];
		},
		{
			name: "managerChanged";
			discriminator: [142, 97, 175, 220, 73, 27, 252, 56];
		},
		{
			name: "nftPositionDeposited";
			discriminator: [59, 70, 235, 200, 51, 202, 245, 222];
		},
		{
			name: "vaultInitialized";
			discriminator: [180, 43, 207, 2, 18, 71, 3, 75];
		},
	];
	errors: [
		{
			code: 6000;
			name: "unauthorized";
			msg: "Unauthorized access attempt";
		},
		{
			code: 6001;
			name: "positionNotFound";
			msg: "Position not found";
		},
		{
			code: 6002;
			name: "claimerNotFound";
			msg: "Claimer not found";
		},
		{
			code: 6003;
			name: "invalidPosition";
			msg: "Invalid position";
		},
		{
			code: 6004;
			name: "invalidAuthority";
			msg: "Invalid authority";
		},
		{
			code: 6005;
			name: "invalidFeeClaimer";
			msg: "Invalid fee claimer";
		},
		{
			code: 6006;
			name: "invalidToken";
			msg: "Invalid token or NFT";
		},
		{
			code: 6007;
			name: "invalidClaimerAddress";
			msg: "Invalid claimer address";
		},
		{
			code: 6008;
			name: "balanceOverflow";
			msg: "Balance Overflow";
		},
		{
			code: 6009;
			name: "invalidNftOwner";
			msg: "Invalid NFT Owner";
		},
		{
			code: 6010;
			name: "onlyOneNftAllowed";
			msg: "Only One NFT Allowed";
		},
		{
			code: 6011;
			name: "insufficientBalance";
			msg: "Insufficient Balance";
		},
	];
	types: [
		{
			name: "claimerChanged";
			type: {
				kind: "struct";
				fields: [
					{
						name: "oldClaimer";
						type: "pubkey";
					},
					{
						name: "newClaimer";
						type: "pubkey";
					},
				];
			};
		},
		{
			name: "cpFeeCollected";
			type: {
				kind: "struct";
				fields: [
					{
						name: "claimer";
						type: "pubkey";
					},
					{
						name: "positionNft";
						type: "pubkey";
					},
					{
						name: "claimedTime";
						type: "i64";
					},
				];
			};
		},
		{
			name: "emergencyChanged";
			type: {
				kind: "struct";
				fields: [
					{
						name: "oldEmergency";
						type: "pubkey";
					},
					{
						name: "newEmergency";
						type: "pubkey";
					},
				];
			};
		},
		{
			name: "emergencyWithdrawed";
			type: {
				kind: "struct";
				fields: [
					{
						name: "claimer";
						type: "pubkey";
					},
					{
						name: "positionNft";
						type: "pubkey";
					},
					{
						name: "withdrawedTime";
						type: "i64";
					},
				];
			};
		},
		{
			name: "executorChanged";
			type: {
				kind: "struct";
				fields: [
					{
						name: "oldExecutor";
						type: "pubkey";
					},
					{
						name: "newExecutor";
						type: "pubkey";
					},
				];
			};
		},
		{
			name: "initVaultConfig";
			type: {
				kind: "struct";
				fields: [
					{
						name: "executorAuthority";
						type: "pubkey";
					},
					{
						name: "emergencyAuthority";
						type: "pubkey";
					},
					{
						name: "managerAuthority";
						type: "pubkey";
					},
				];
			};
		},
		{
			name: "managerChanged";
			type: {
				kind: "struct";
				fields: [
					{
						name: "oldManager";
						type: "pubkey";
					},
					{
						name: "newManager";
						type: "pubkey";
					},
				];
			};
		},
		{
			name: "nftPositionDeposited";
			type: {
				kind: "struct";
				fields: [
					{
						name: "positionNft";
						type: "pubkey";
					},
					{
						name: "claimer";
						type: "pubkey";
					},
				];
			};
		},
		{
			name: "userPosition";
			type: {
				kind: "struct";
				fields: [
					{
						name: "claimer";
						docs: ["The owner of this position"];
						type: "pubkey";
					},
					{
						name: "positionNft";
						docs: ["The NFT or token representing this position"];
						type: "pubkey";
					},
					{
						name: "amount";
						docs: ["The amount deposited in this position (default 1 for NFTs)"];
						type: "u8";
					},
					{
						name: "createdAt";
						docs: ["Timestamp when the position was created"];
						type: "i64";
					},
					{
						name: "lastUpdated";
						docs: ["Timestamp of the last update to the position"];
						type: "i64";
					},
				];
			};
		},
		{
			name: "vaultConfig";
			type: {
				kind: "struct";
				fields: [
					{
						name: "executorAuthority";
						docs: ["The authority that can manage executing operations"];
						type: "pubkey";
					},
					{
						name: "emergencyAuthority";
						docs: ["The authority that can manage emergency operations"];
						type: "pubkey";
					},
					{
						name: "managerAuthority";
						docs: ["The authority that can manage administrative operations"];
						type: "pubkey";
					},
				];
			};
		},
		{
			name: "vaultInitialized";
			type: {
				kind: "struct";
				fields: [
					{
						name: "executor";
						type: "pubkey";
					},
					{
						name: "emergency";
						type: "pubkey";
					},
					{
						name: "manager";
						type: "pubkey";
					},
				];
			};
		},
	];
};
