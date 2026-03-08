"use client";
import { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import UseTokenMedia from "../hook/UseTokenMedia";
import { useMutation } from "@tanstack/react-query";
import { generateMedia, generateMetadata, generateRemoteMetadata, generateMediaForToken } from "@/lib/api";
import {
	useForm,
	type UseFormHandleSubmit,
	type UseFormRegister,
	type FormState,
	type RegisterOptions,
	type UseFormSetValue,
	type Control,
} from "react-hook-form";
import { curveLimitConst } from "@/lib/utils";
import type { TChain, TChainId } from "@waifufun/types";
import { parseEther } from "viem";

const DEFAULT_MAIN_IMAGE = "/create/test-img.png";
const MAX_TICKER_LENGTH = 5;
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]+$/;
const MAX_SUFFIX_LENGTH_FOR_SERIOUS_WARNING = 4;
const MAX_SUFFIX_LENGTH_FOR_HOURS_WARNING = 4;
const INITIAL_GENERATION_SUFFIX = "FUN";

/** BNB has 18 decimals; use 1e18 as the base unit multiplier */
const NATIVE_DECIMALS = 18;

type MediaType = "audio" | "video" | "image";

type PromptContextType = {
	control: Control<TokenFormData>;
	registerForm: UseFormRegister<TokenFormData>;
	handleSubmit: UseFormHandleSubmit<TokenFormData>;
	formState: FormState<TokenFormData>;
	/** Salt used for CREATE2 address generation on BSC (replaces Solana mint keypair) */
	launchSalt: string | null;
	generateAddress: (suffix: string) => void;
	isGeneratingAddress: boolean;
	isGeneratingMedia: boolean;
	generateToken: (params: { mediaType: MediaType; prompt?: string }) => void;
	generateMediaToken: (params: {
		mediaType: MediaType;
		prompt?: string;
		contractAddress?: string;
		chain: TChain;
		chainId: TChainId;
	}) => void;
	changeMainImage: (index: number) => void;
	changeMainMedia: (index: number, type: MediaType) => void;
	previousImages: string[];
	previousVideos: string[];
	previousAudios: string[];
	uploadedImage: string | undefined | null;
	setUploadedImage: (image: string | undefined | null) => void;
	watchValue: (name: string) => string | number | undefined;
	getTokenData: (manual?: boolean) => Promise<TokenMetadata>;
	setPool: (pool: string) => void;
	pool: string;
	setLaunching: (isLaunching: boolean) => void;
	isLaunching: boolean;
	tokenImageQuery?: string | undefined;
	setValue: UseFormSetValue<TokenFormData>;
	deleteImage: (imageLink: string) => void;
	deleteMedia: (mediaLink: string, mediaType: MediaType) => void;
	addMedia: (link: string, type: MediaType) => void;
	terminateWorkers: () => void;
	cancelVanityGeneration: () => void;
	setLaunchSalt: (salt: string | null) => void;
	inviteCode: string | undefined;
};

export type TokenFormData = {
	prompt: string;
	name: string;
	ticker: string;
	description: string;
	symbol: string;
	buyAmount: number;
	curveLimit: number;
	delayForTrade: number;
	tradeLimitSol: number;
};

export type TokenMetadata = {
	name: string;
	symbol: string;
	description: string;
	image: string;
	/** Salt for CREATE2 address derivation on BSC */
	launchSalt: string;
	buyAmount: number;
	metadataUrl: string;
	curveLimit: number;
	delayForTrade: number;
	tradeLimitSol: number;
};

export type TokenFormOptions = keyof TokenFormData;

const PromptContext = createContext<PromptContextType | undefined>(undefined);

/** Generate a random hex salt for CREATE2 address derivation */
function generateRandomSalt(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return `0x${Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")}`;
}

/** Generate a random hex salt for CREATE2 address derivation */

export const PromptProvider = ({
	children,
	tokenImageQuery,
	inviteCode,
}: { children: ReactNode; tokenImageQuery?: string | undefined; inviteCode?: string | undefined }) => {
	return (
		<PromptProviderContent tokenImageQuery={tokenImageQuery} inviteCode={inviteCode}>
			{children}
		</PromptProviderContent>
	);
};

const PromptProviderContent = ({
	children,
	tokenImageQuery,
	inviteCode,
}: { children: ReactNode; tokenImageQuery?: string | undefined; inviteCode?: string | undefined }) => {
	const { control, register, handleSubmit, formState, setValue, watch } = useForm<TokenFormData>({
		defaultValues: {
			prompt: "",
			name: "",
			ticker: "",
			description: "",
			symbol: "",
			buyAmount: 0,
			curveLimit: Number(curveLimitConst) / 1e18,
			delayForTrade: 0,
			tradeLimitSol: 0,
		},
		mode: "onChange",
	});
	const [launchSalt, setLaunchSalt] = useState<string | null>(null);
	const [isGeneratingAddressState, setIsGeneratingAddressState] = useState<boolean>(false);
	const {
		previousImages,
		previousVideos,
		previousAudios,
		changeMainImage,
		changeMainMedia,
		addImage,
		addMedia,
		deleteImage,
		deleteMedia,
	} = UseTokenMedia(tokenImageQuery);
	const [isGeneratingMedia, setIsGeneratingMedia] = useState<boolean>(false);
	const [uploadedImage, setUploadedImage] = useState<string | undefined | null>(undefined);
	const [pool, setPool] = useState<string>("pancakeswap");
	const [isLaunching, setIsLaunching] = useState<boolean>(false);

	const workerRefs = useRef<Worker[]>([]);
	const activeSuffixRef = useRef<string>("");
	const isGeneratingAddressRef = useRef<boolean>(false);

	const metadataMutation = useMutation({
		mutationKey: ["generateMetadata"],
		mutationFn: generateMetadata,
		onSuccess: (data, variables) => {
			setValue("prompt", data?.metadata?.prompt || "", { shouldValidate: true, shouldDirty: true });
			setValue("name", data?.metadata?.name || "", { shouldValidate: true, shouldDirty: true });
			setValue("ticker", data?.metadata?.symbol || "", { shouldValidate: true, shouldDirty: true });
			setValue("description", data?.metadata?.description || "", { shouldValidate: true, shouldDirty: true });
			setValue("symbol", data?.metadata?.symbol || "", { shouldValidate: true, shouldDirty: true });
			const contractAddress = (variables as { mediaType?: MediaType; contractAddress?: string })?.contractAddress;
			generateMediaMutation.mutate({
				prompt: data?.metadata?.prompt,
				width: 512,
				height: 512,
				type: (variables as { mediaType?: MediaType })?.mediaType || "image",
				...(contractAddress && { contractAddress }),
			});
		},
		// biome-ignore lint/suspicious/noExplicitAny: Explicit any is used here for error handling
		onError: (error: any) => {
			console.error("Error generating metadata:", error);
			toast.error("Error generating metadata: ", error?.message || "Unknown error");
			setIsGeneratingMedia(false);
		},
	});

	const resetLaunchSalt = useCallback(() => {
		setLaunchSalt(null);
		setIsGeneratingAddress(false);
	}, []);

	const generateMediaMutation = useMutation({
		mutationKey: ["generateMedia"],
		mutationFn: generateMedia,
		onSuccess: (data, variables) => {
			if (data?.mediaUrl) {
				const mediaType = (variables as { type?: MediaType })?.type || "image";

				let actualMediaUrl: string;
				if (typeof data.mediaUrl === "string") {
					actualMediaUrl = data.mediaUrl;
				} else if (typeof data.mediaUrl === "object" && data.mediaUrl !== null && "url" in data.mediaUrl) {
					actualMediaUrl = (data.mediaUrl as { url: string }).url;
				} else {
					toast.error("Error generating media: Invalid media URL format");
					setIsGeneratingMedia(false);
					return;
				}

				if (typeof actualMediaUrl !== "string" || !actualMediaUrl) {
					console.error("Error generating media: Invalid media URL format", data);
					toast.error("Error generating media: Invalid media URL format");
					setIsGeneratingMedia(false);
					return;
				}

				console.log("actualMediaUrl: ", actualMediaUrl);

				if (!actualMediaUrl.startsWith("http")) {
					toast.error("Error generating media: Invalid media URL format");
					setIsGeneratingMedia(false);
					return;
				}

				addMedia(actualMediaUrl, mediaType);
				setIsGeneratingMedia(false);
				toast.success("Media generated successfully!");
			} else {
				toast.error("Error generating media: No media URL returned");
				setIsGeneratingMedia(false);
			}
		},
		// biome-ignore lint/suspicious/noExplicitAny: <reason>
		onError: (error: any) => {
			toast.error(error?.message || "Error generating media");
			setIsGeneratingMedia(false);
		},
	});

	const generateMediaTokenMutation = useMutation({
		mutationKey: ["generateMediaToken"],
		mutationFn: ({
			prompt,
			width,
			height,
			type,
			contractAddress,
			chain,
			chainId,
		}: {
			prompt: string;
			width: number;
			height: number;
			type: MediaType;
			contractAddress: string;
			chain: TChain;
			chainId: TChainId;
		}) =>
			generateMediaForToken({
				prompt,
				width,
				height,
				type: type as "audio" | "video" | "image",
				contractAddress,
				chain,
				chainId: chainId as any,
			}),
		onSuccess: (data) => {
			if (data?.mediaUrl) {
				let actualMediaUrl: string;
				let contentType = "image";
				
				if (typeof data.mediaUrl === "string") {
					actualMediaUrl = data.mediaUrl;
				} else if (typeof data.mediaUrl === "object" && data.mediaUrl !== null && "url" in data.mediaUrl) {
					actualMediaUrl = (data.mediaUrl as { url: string; content_type?: string }).url;
					contentType = (data.mediaUrl as { content_type?: string }).content_type || "image";
				} else {
					toast.error("Error generating media: Invalid media URL format");
					setIsGeneratingMedia(false);
					return;
				}

				console.log("actualMediaUrl: ", actualMediaUrl);
				console.log("contentType: ", contentType);
				console.log("data: ", data);

				let mediaType: MediaType;
				if (contentType.startsWith("video/")) {
					mediaType = "video";
				} else if (contentType.startsWith("audio/")) {
					mediaType = "audio";
				} else {
					mediaType = "image";
				}

				if (!actualMediaUrl.startsWith("http")) {
					toast.error("Error generating media: Invalid media URL format");
					setIsGeneratingMedia(false);
					return;
				}

				addMedia(actualMediaUrl, mediaType);
				setIsGeneratingMedia(false);
				toast.success("Media generated successfully!");
			} else {
				toast.error("Error generating media: No media URL returned");
				setIsGeneratingMedia(false);
			}
		},
		// biome-ignore lint/suspicious/noExplicitAny: Explicit any is used here for error handling
		onError: (error: any) => {
			toast.error(error?.message || "Error generating media");
			setIsGeneratingMedia(false);
		},
	});

	const remoteMetadataMutation = useMutation({
		mutationKey: ["remoteGenerateMetadata"],
		mutationFn: generateRemoteMetadata,
		onError: (error) => {
			console.error("Error generating remote metadata:", error);
			toast.error("Error generating remote metadata");
		},
	});

	const setIsGeneratingAddress = (value: boolean) => {
		isGeneratingAddressRef.current = value;
		setIsGeneratingAddressState(value);
	};

	const terminateWorkers = useCallback(() => {
		if (workerRefs?.current) {
			for (const w of workerRefs.current) {
				w.terminate();
			}
		}
		workerRefs.current = [];
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: yes
	const cancelVanityGeneration = useCallback(() => {
		if (isGeneratingAddressRef.current) {
			setIsGeneratingAddress(false);
			setLaunchSalt(null);
			activeSuffixRef.current = "";
			terminateWorkers();
		}
	}, [terminateWorkers]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Exhaustive deps
	const initializeAndStartWorkers = useCallback(
		(suffix: string) => {
			if (typeof Worker === "undefined") {
				setIsGeneratingAddress(false);
				return;
			}

			terminateWorkers();

			const cores = (navigator.hardwareConcurrency > 12 ? 12 : navigator.hardwareConcurrency) || 2;
			const workersToCreate = Math.max(1, cores > 1 ? cores - 1 : 1);
			const newWorkers: Worker[] = [];

			for (let i = 0; i < workersToCreate; i++) {
				const worker = new Worker(new URL("../../../workers/generateVanity.ts", import.meta.url), {
					type: "module",
				});

				worker.onmessage = (event: MessageEvent) => {
					if (!isGeneratingAddressRef.current || activeSuffixRef.current !== suffix) {
						return;
					}

					const { type, keypair, error, success } = event.data;

					switch (type) {
						case "progress":
							// Store the derived salt from the vanity generation
							setLaunchSalt(`0x${Array.from(new Uint8Array(keypair.privateKey)).map((b: number) => b.toString(16).padStart(2, "0")).join("")}`);
							break;
						case "done":
							setLaunchSalt(`0x${Array.from(new Uint8Array(keypair.privateKey)).map((b: number) => b.toString(16).padStart(2, "0")).join("")}`);
							setIsGeneratingAddress(false);
							activeSuffixRef.current = "";
							if (workerRefs?.current) {
								for (const w of workerRefs.current) {
									if (w !== worker) {
										w.terminate();
									}
								}
							}
							workerRefs.current = workerRefs.current.filter((w) => w === worker);
							break;
						case "error":
							if (workerRefs.current.includes(worker)) {
								setIsGeneratingAddress(false);
								setLaunchSalt(null);
								activeSuffixRef.current = "";
								terminateWorkers();
							}
							break;
						default:
							if (success === false) {
								if (workerRefs.current.includes(worker)) {
									setIsGeneratingAddress(false);
									setLaunchSalt(null);
									activeSuffixRef.current = "";
									terminateWorkers();
								}
							}
							break;
					}
				};

				worker.onerror = () => {
					if (
						isGeneratingAddressRef.current &&
						activeSuffixRef.current === suffix &&
						workerRefs.current.includes(worker)
					) {
						setIsGeneratingAddress(false);
						setLaunchSalt(null);
						activeSuffixRef.current = "";
						terminateWorkers();
					}
				};
				newWorkers.push(worker);
			}
			workerRefs.current = newWorkers;
			activeSuffixRef.current = suffix;

			if (workerRefs?.current) {
				for (const w of workerRefs.current) {
					w.postMessage({ suffix });
				}
			}
		},
		[terminateWorkers],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Exhaustive deps
	const generateAddress = useCallback(
		(newSuffix: string) => {
			if (!newSuffix || newSuffix.trim() === "") {
				toast.error("Please enter a suffix to generate an address.");
				setLaunchSalt(null);
				if (isGeneratingAddressRef.current) {
					setIsGeneratingAddress(false);
				}
				terminateWorkers();
				activeSuffixRef.current = "";
				return;
			}

			if (!BASE58_REGEX.test(newSuffix)) {
				toast.error("Invalid suffix. Only Base58 characters are allowed (no 0, O, I, l).");
				return;
			}

			if (newSuffix.length > MAX_SUFFIX_LENGTH_FOR_SERIOUS_WARNING) {
				toast.warning(
					`Suffixes longer than ${MAX_SUFFIX_LENGTH_FOR_SERIOUS_WARNING} characters might take an extremely long time (months or years) to generate.`,
				);
			} else if (newSuffix.length === MAX_SUFFIX_LENGTH_FOR_HOURS_WARNING) {
				toast.warning(
					`Suffixes with ${MAX_SUFFIX_LENGTH_FOR_HOURS_WARNING} characters might take hours or days to generate.`,
				);
			}

			if (isGeneratingAddressRef.current && activeSuffixRef.current === newSuffix) {
				toast.info(`Already generating address for suffix: "${newSuffix}".`);
				return;
			}

			setIsGeneratingAddress(true);
			setLaunchSalt(null);

			initializeAndStartWorkers(newSuffix);
		},
		[initializeAndStartWorkers, terminateWorkers],
	);

	const generateToken = ({
		mediaType,
		prompt,
		contractAddress,
	}: { mediaType: MediaType; prompt?: string; contractAddress?: string }) => {
		setIsGeneratingMedia(true);
		metadataMutation.mutate({ mediaType, prompt, contractAddress });
	};

	const generateMediaToken = ({
		mediaType,
		prompt,
		contractAddress,
		chain,
		chainId,
	}: {
		mediaType: MediaType;
		prompt?: string;
		contractAddress?: string;
		chain: TChain;
		chainId: TChainId;
	}) => {
		if (!contractAddress) {
			toast.error("Contract address is required for token media generation");
			return;
		}

		if (!chain || !chainId) {
			toast.error("Chain and chainId are required for token media generation");
			return;
		}

		setIsGeneratingMedia(true);
		generateMediaTokenMutation.mutate({
			prompt: prompt || "",
			width: 512,
			height: 512,
			type: mediaType,
			contractAddress,
			chain,
			chainId,
		});
	};

	const getTokenData = async (manual = false): Promise<TokenMetadata> => {
		const name = watch("name") || "Untitled Token";
		const symbol = watch("symbol") || "";
		const description = watch("description") || "No description provided.";
		const salt = launchSalt || generateRandomSalt();
		const buyAmount = watch("buyAmount") || 0;
		const curveLimit = watch("curveLimit") || curveLimitConst;
		const delayForTrade = watch("delayForTrade") || 0;
		const tradeLimitSol = watch("tradeLimitSol") || 0;

		const remoteMetadata = await remoteMetadataMutation.mutateAsync({
			imageUrl: !manual && previousImages[0] ? previousImages[0] : undefined,
			image: manual ? (uploadedImage ?? undefined) : previousImages[0],
			metadata: {
				name,
				description,
				symbol,
			},
			manual,
		});

		const metadataUrl = remoteMetadata?.metadataUrl || remoteMetadataMutation.data?.metadataUrl;

		if (!metadataUrl) {
			toast.error("Failed to generate metadata URL.");
			console.log("metadata: ", remoteMetadata);
			throw new Error("Metadata URL generation failed");
		}

		return {
			name,
			symbol,
			description,
			image: remoteMetadata?.imageUrl || remoteMetadataMutation.data?.imageUrl || "",
			launchSalt: salt,
			buyAmount,
			metadataUrl,
			curveLimit: Number(curveLimit),
			delayForTrade: Number(delayForTrade),
			tradeLimitSol: Number(tradeLimitSol),
		};
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: Exhaustive deps
	useEffect(() => {
		generateAddress(INITIAL_GENERATION_SUFFIX);
		generateToken({
			mediaType: "image",
			prompt: "",
		});
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Exhaustive deps
	useEffect(() => {
		return () => {
			terminateWorkers();
			if (isGeneratingAddressRef.current) {
				setIsGeneratingAddress(false);
				setLaunchSalt(null);
			}
		};
	}, [terminateWorkers]);

	const contextValue: PromptContextType = {
		control,
		registerForm: register,
		handleSubmit,
		formState,
		launchSalt,
		generateAddress,
		isGeneratingAddress: isGeneratingAddressState,
		isGeneratingMedia,
		generateToken,
		generateMediaToken,
		changeMainImage,
		changeMainMedia,
		previousImages,
		previousVideos,
		previousAudios,
		uploadedImage,
		watchValue: watch,
		setUploadedImage,
		getTokenData,
		setPool,
		pool,
		setLaunching: setIsLaunching,
		isLaunching,
		setValue,
		tokenImageQuery,
		deleteImage,
		deleteMedia,
		addMedia,
		terminateWorkers,
		cancelVanityGeneration,
		setLaunchSalt,
		inviteCode,
	};

	return <PromptContext.Provider value={contextValue}>{children}</PromptContext.Provider>;
};

export const usePrompt = (tokenImageQuery?: string): PromptContextType => {
	const context = useContext(PromptContext);
	if (!context) {
		throw new Error("usePrompt must be used within a PromptProvider");
	}

	return {
		...context,
		tokenImageQuery: tokenImageQuery || context.tokenImageQuery,
	};
};

export const nameValidation: RegisterOptions<TokenFormData, "name"> = {
	required: "Name is required",
	minLength: { value: 3, message: "Name must be at least 3 characters long" },
	maxLength: { value: 20, message: "Name must be at most 20 characters long" },
	pattern: { value: /^[a-zA-Z0-9 ]*$/, message: "Name can only contain letters, numbers, and spaces" },
};

export const tickerValidation: RegisterOptions<TokenFormData, "ticker"> = {
	required: "Ticker is required",
	minLength: { value: 3, message: "Ticker must be at least 3 characters long" },
	maxLength: { value: MAX_TICKER_LENGTH, message: `Ticker must be at most ${MAX_TICKER_LENGTH} characters long` },
	pattern: { value: /^[a-zA-Z0-9]*$/, message: "Ticker can only contain letters and numbers" },
};

export const descriptionValidation: RegisterOptions<TokenFormData, "description"> = {
	required: "Description is required",
	minLength: { value: 10, message: "Description must be at least 10 characters long" },
	maxLength: { value: 200, message: "Description must be at most 1000 characters long" },
};

export const curveLimitValidation: RegisterOptions<TokenFormData, "curveLimit"> = {
	valueAsNumber: true,
	required: "Curve limit is required",
	min: { value: 0, message: "Curve limit must be ≥ 0" },
	max: {
		value: Number(curveLimitConst) || 675,
		message: `Curve limit must be ≤ ${curveLimitConst || 675}`,
	},
};

export const tradeLimitValidation: RegisterOptions<TokenFormData, "tradeLimitSol"> = {
	valueAsNumber: true,
	required: "Trade limit is required",
	min: { value: 0, message: "Trade limit must be ≥ 0" },
	max: { value: 100, message: "Trade limit must be ≤ 100" },
};
