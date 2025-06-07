"use client";
import { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import UseTokenImages from "../hook/UseTokenImages";
import { useMutation, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { generateImage, generateMetadata, generateRemoteMetadata } from "@/lib/api";
import {
	useForm,
	type UseFormHandleSubmit,
	type UseFormRegister,
	type FormState,
	type RegisterOptions,
	type UseFormSetValue,
} from "react-hook-form";
import { Keypair } from "@solana/web3.js";

const DEFAULT_MAIN_IMAGE = "/create/test-img.png";
const MAX_TICKER_LENGTH = 5;
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]+$/;
const MAX_SUFFIX_LENGTH_FOR_SERIOUS_WARNING = 4;
const MAX_SUFFIX_LENGTH_FOR_HOURS_WARNING = 4;
const INITIAL_GENERATION_SUFFIX = "FUN";

type PromptContextType = {
	registerForm: UseFormRegister<TokenFormData>;
	handleSubmit: UseFormHandleSubmit<TokenFormData>;
	formState: FormState<TokenFormData>;
	mintKeyPair: Keypair | null;
	generateAddress: (suffix: string) => void;
	isGeneratingAddress: boolean;
	isGeneratingImage: boolean;
	generateToken: (prompt?: string) => void;
	changeMainImage: (index: number) => void;
	previousImages: string[];
	uploadedImage: string | undefined;
	setUploadedImage: (image: string | undefined) => void;
	watchValue: (name: string) => string | number | undefined;
	getTokenData: (manual?: boolean) => Promise<TokenMetadata>;
	setPool: (pool: string) => void;
	pool: string;
	setLaunching: (isLaunching: boolean) => void;
	isLaunching: boolean;
	setValue: UseFormSetValue<TokenFormData>;
};

export type TokenFormData = {
	prompt: string;
	name: string;
	ticker: string;
	description: string;
	symbol: string;
	buyAmount: number;
};

export type TokenMetadata = {
	name: string;
	symbol: string;
	description: string;
	image: string;
	mintKeyPair: Keypair;
	buyAmount: number;
	metadataUrl: string;
	virtualReserves?: number;
	curveLimit?: number;
	initBondingCurve?: number;
};

export type TokenFormOptions = keyof TokenFormData;

const PromptContext = createContext<PromptContextType | undefined>(undefined);

const queryClient = new QueryClient();

export const PromptProvider = ({ children }: { children: ReactNode }) => {
	return (
		<QueryClientProvider client={queryClient}>
			<PromptProviderContent>{children}</PromptProviderContent>
		</QueryClientProvider>
	);
};

const PromptProviderContent = ({ children }: { children: ReactNode }) => {
	const { register, handleSubmit, formState, setValue, watch } = useForm<TokenFormData>({
		defaultValues: {
			prompt: "",
			name: "",
			ticker: "",
			description: "",
			symbol: "",
			buyAmount: 0,
		},
		mode: "onChange",
	});
	const [mintKeyPair, setMintKeyPair] = useState<Keypair | null>(null);
	const [isGeneratingAddressState, setIsGeneratingAddressState] = useState<boolean>(false);
	const { previousImages, changeMainImage, addImage } = UseTokenImages();
	const [isGeneratingImage, setIsGeneratingImage] = useState<boolean>(false);
	const [uploadedImage, setUploadedImage] = useState<string | undefined>(undefined);
	const [pool, setPool] = useState<string>("meteora");
	const [isLaunching, setIsLaunching] = useState<boolean>(false);

	const workerRefs = useRef<Worker[]>([]);
	const activeSuffixRef = useRef<string>("");
	const isGeneratingAddressRef = useRef<boolean>(false);

	const metadataMutation = useMutation({
		mutationKey: ["generateMetadata"],
		mutationFn: generateMetadata,
		onSuccess: (data) => {
			setValue("prompt", data?.metadata?.prompt || "", { shouldValidate: true, shouldDirty: true });
			setValue("name", data?.metadata?.name || "", { shouldValidate: true, shouldDirty: true });
			setValue("ticker", data?.metadata?.symbol || "", { shouldValidate: true, shouldDirty: true });
			setValue("description", data?.metadata?.description || "", { shouldValidate: true, shouldDirty: true });
			setValue("symbol", data?.metadata?.symbol || "", { shouldValidate: true, shouldDirty: true });

			generateImageMutation.mutate({
				prompt: data?.metadata?.prompt,
				width: 512,
				height: 512,
			});
		},
		onError: (error) => {
			console.error("Error generating metadata:", error);
			toast.error("Error generating metadata");
		},
	});

	const generateImageMutation = useMutation({
		mutationKey: ["generateImage"],
		mutationFn: generateImage,
		onSuccess: (data) => {
			if (data?.mediaUrl) {
				addImage(data?.mediaUrl);
				setIsGeneratingImage(false);
			} else {
				toast.error("Error generating image: No media URL returned");
				setIsGeneratingImage(false);
			}
		},
		onError: (error) => {
			console.error("Error generating image:", error);
			toast.error("Error generating image");
			setIsGeneratingImage(false);
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: Exhaustive deps
	const initializeAndStartWorkers = useCallback(
		(suffix: string) => {
			if (typeof Worker === "undefined") {
				setIsGeneratingAddress(false);
				return;
			}

			terminateWorkers();

			const cores = navigator.hardwareConcurrency || 2;
			const workersToCreate = Math.max(1, cores > 1 ? cores - 1 : 1);
			const newWorkers: Worker[] = [];

			for (let i = 0; i < workersToCreate; i++) {
				const worker = new Worker(new URL("../../../../workers/generateVanity.ts", import.meta.url), {
					type: "module",
				});

				worker.onmessage = (event: MessageEvent) => {
					if (!isGeneratingAddressRef.current || activeSuffixRef.current !== suffix) {
						return;
					}

					const { type, keypair, error, success } = event.data;

					switch (type) {
						case "progress":
							setMintKeyPair(Keypair.fromSeed(new Uint8Array(keypair.privateKey)));
							break;
						case "done":
							setMintKeyPair(Keypair.fromSeed(new Uint8Array(keypair.privateKey)));
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
								setMintKeyPair(null);
								activeSuffixRef.current = "";
								terminateWorkers();
							}
							break;
						default:
							if (success === false) {
								if (workerRefs.current.includes(worker)) {
									setIsGeneratingAddress(false);
									setMintKeyPair(null);
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
						setMintKeyPair(null);
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
				setMintKeyPair(null);
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
			setMintKeyPair(null);

			initializeAndStartWorkers(newSuffix);
		},
		[initializeAndStartWorkers, terminateWorkers],
	);

	const generateToken = (prompt?: string) => {
		setIsGeneratingImage(true);
		metadataMutation.mutate(prompt);
	};

	const getTokenData = async (manual = false): Promise<TokenMetadata> => {
		const name = watch("name") || "Untitled Token";
		const symbol = watch("symbol") || "";
		const description = watch("description") || "No description provided.";
		const mintKeyPairr = mintKeyPair || Keypair.generate();
		const buyAmount = watch("buyAmount") || 0;

		const remoteMetadata = await remoteMetadataMutation.mutateAsync({
			imageUrl: !manual && previousImages[0] ? previousImages[0] : undefined,
			image: manual ? uploadedImage : previousImages[0],
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
			console.log("metadata: ", remoteMetadata.data);
			throw new Error("Metadata URL generation failed");
		}

		return {
			name,
			symbol,
			description,
			image: remoteMetadataMutation.data?.imageUrl,
			mintKeyPair: mintKeyPairr,
			buyAmount,
			metadataUrl,
		};
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: Exhaustive deps
	useEffect(() => {
		generateAddress(INITIAL_GENERATION_SUFFIX);
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Exhaustive deps
	useEffect(() => {
		return () => {
			terminateWorkers();
			if (isGeneratingAddressRef.current) {
				setIsGeneratingAddress(false);
				setMintKeyPair(null);
			}
		};
	}, [terminateWorkers]);

	const contextValue: PromptContextType = {
		registerForm: register,
		handleSubmit,
		formState,
		mintKeyPair,
		generateAddress,
		isGeneratingAddress: isGeneratingAddressState,
		isGeneratingImage,
		generateToken,
		changeMainImage,
		previousImages,
		uploadedImage,
		watchValue: watch,
		setUploadedImage,
		getTokenData,
		setPool,
		pool,
		setLaunching: setIsLaunching,
		isLaunching,
		setValue,
	};

	return <PromptContext.Provider value={contextValue}>{children}</PromptContext.Provider>;
};

export const usePrompt = (): PromptContextType => {
	const context = useContext(PromptContext);
	if (!context) {
		throw new Error("usePrompt must be used within a PromptProvider");
	}
	return context;
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
