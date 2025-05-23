"use client";
import { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import UseTokenImages from "../hook/UseTokenImages";
import { useMutation } from "@tanstack/react-query";
import { generateImage, generateMetadata } from "@/lib/api";
import { useForm, type UseFormHandleSubmit, type UseFormRegister, type FormState, type RegisterOptions } from "react-hook-form";

const DEFAULT_MAIN_IMAGE = "/create/test-img.png";
const MAX_TICKER_LENGTH = 5;
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]+$/;
const MAX_SUFFIX_LENGTH_FOR_SERIOUS_WARNING = 4;
const MAX_SUFFIX_LENGTH_FOR_HOURS_WARNING = 4;
const INITIAL_GENERATION_SUFFIX = "FUN";

type PromptContextType = {
  registerForm: UseFormRegister<TokenFormData>
  handleSubmit: UseFormHandleSubmit<TokenFormData>
  formState: FormState<TokenFormData>;
  address: string;
  generateAddress: (suffix: string) => void;
  isGeneratingAddress: boolean;
  isGeneratingImage: boolean;
  generateToken: (prompt?: string) => void;
  changeMainImage: (index: number) => void;
};

export type TokenFormData = {
  prompt: string;
  name: string;
  ticker: string;
  description: string;
  symbol: string;
  buyAmount: number;
}

export type TokenFormOptions = keyof TokenFormData;

const PromptContext = createContext<PromptContextType | undefined>(undefined);

export const PromptProvider = ({ children }: { children: ReactNode }) => {
  const {register, handleSubmit, formState, setValue} = useForm<TokenFormData>({
    defaultValues: {
      prompt: "",
      name: "",
      ticker: "",
      description: "",
      symbol: "",
      buyAmount: 0
    },
    mode: "onChange"
  });
  const [address, setAddress] = useState<string>("");
  const [isGeneratingAddressState, setIsGeneratingAddressState] = useState<boolean>(false);
  const {previousImages, changeMainImage, addImage} = UseTokenImages();
  const [isGeneratingImage, setIsGeneratingImage] = useState<boolean>(true);

  const workerRefs = useRef<Worker[]>([]);
  const activeSuffixRef = useRef<string>("");
  const isGeneratingAddressRef = useRef<boolean>(false);


  const metadataMutation = useMutation({
    mutationKey: ["generateMetadata"],
    mutationFn: generateMetadata,
    onSuccess: (data) => {
      setValue("prompt", data?.metadata?.prompt || "", { shouldValidate: true, shouldDirty: true });
      setValue("name", data?.metadata?.name || "", { shouldValidate: true, shouldDirty: true });
      setValue("ticker", data?.metadata?.ticker || "", { shouldValidate: true, shouldDirty: true });
      setValue("description", data?.metadata?.description || "", { shouldValidate: true, shouldDirty: true });
      setValue("symbol", data?.metadata?.symbol || "", { shouldValidate: true, shouldDirty: true });

      setIsGeneratingImage(true);
      generateImageMutation.mutate({
        prompt: data?.metadata?.prompt,
        width: 512,
        height: 512,
      });
    },
    onError: (error) => {
      console.error("Error generating metadata:", error);
      toast.error("Error generating metadata");
    }
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
    }
  });

  const setIsGeneratingAddress = (value: boolean) => {
    isGeneratingAddressRef.current = value;
    setIsGeneratingAddressState(value);
  };

  const terminateWorkers = useCallback(() => {
    workerRefs.current.forEach(w => w.terminate());
    workerRefs.current = [];
  }, []);

  const initializeAndStartWorkers = useCallback((suffix: string) => {
    if (typeof Worker === 'undefined') {
        setAddress("Worker feature not supported.");
        setIsGeneratingAddress(false);
        return;
    }

    terminateWorkers();

    const cores = navigator.hardwareConcurrency || 2;
    const workersToCreate = Math.max(1, cores > 1 ? cores - 1 : 1);
    const newWorkers: Worker[] = [];

    for (let i = 0; i < workersToCreate; i++) {
      const worker = new Worker(new URL('../../../../workers/generateVanity.ts', import.meta.url), { type: 'module' });

      worker.onmessage = (event: MessageEvent) => {
        if (!isGeneratingAddressRef.current || activeSuffixRef.current !== suffix) {
          return;
        }

        const { type, address: generatedAddress, error, success } = event.data;

        switch (type) {
          case "progress":
            setAddress(generatedAddress);
            break;
          case "done":
            setAddress(generatedAddress);
            setIsGeneratingAddress(false);
            activeSuffixRef.current = "";
            workerRefs.current.forEach(w => {
              if (w !== worker) {
                w.terminate();
              }
            });
            workerRefs.current = workerRefs.current.filter(w => w === worker);
            break;
          case "error":
            if (workerRefs.current.includes(worker)) {
                setIsGeneratingAddress(false);
                setAddress("Error generating address");
                activeSuffixRef.current = "";
                terminateWorkers();
            }
            break;
          default:
            if (success === false) {
                 if (workerRefs.current.includes(worker)) {
                    setIsGeneratingAddress(false);
                    setAddress("Error generating address (fallback)");
                    activeSuffixRef.current = "";
                    terminateWorkers();
                 }
            }
            break;
        }
      };

      worker.onerror = (errorEvent) => {
        if (isGeneratingAddressRef.current && activeSuffixRef.current === suffix && workerRefs.current.includes(worker)) {
          setIsGeneratingAddress(false);
          setAddress("Worker script error");
          activeSuffixRef.current = "";
          terminateWorkers();
        }
      };
      newWorkers.push(worker);
    }
    workerRefs.current = newWorkers;
    activeSuffixRef.current = suffix;

    workerRefs.current.forEach(w => {
      w.postMessage({ suffix });
    });

  }, [terminateWorkers]);


  const generateAddress = useCallback((newSuffix: string) => {
    if (!newSuffix || newSuffix.trim() === "") {
      toast.error("Please enter a suffix to generate an address.");
      setAddress("");
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
      toast.warning(`Suffixes longer than ${MAX_SUFFIX_LENGTH_FOR_SERIOUS_WARNING} characters might take an extremely long time (months or years) to generate.`);
    } else if (newSuffix.length === MAX_SUFFIX_LENGTH_FOR_HOURS_WARNING) {
      toast.warning(`Suffixes with ${MAX_SUFFIX_LENGTH_FOR_HOURS_WARNING} characters might take hours or days to generate.`);
    }

    if (isGeneratingAddressRef.current && activeSuffixRef.current === newSuffix) {
      toast.info(`Already generating address for suffix: "${newSuffix}".`);
      return;
    }

    setIsGeneratingAddress(true);
    setAddress("Initializing workers and generating...");

    initializeAndStartWorkers(newSuffix);

  }, [initializeAndStartWorkers, terminateWorkers]);

  const generateToken = (prompt?: string) => {
    metadataMutation.mutate(prompt);
  }

  useEffect(() => {
    generateAddress(INITIAL_GENERATION_SUFFIX);
  }, []);

  useEffect(() => {
    return () => {
      terminateWorkers();
      if (isGeneratingAddressRef.current) {
        setIsGeneratingAddress(false);
        setAddress("");
      }
    };
  }, [terminateWorkers]);


  const contextValue: PromptContextType = {
    registerForm: register,
    handleSubmit,
    formState,
    address,
    generateAddress,
    isGeneratingAddress: isGeneratingAddressState,
    isGeneratingImage,
    generateToken,
    changeMainImage
  };

  return (
    <PromptContext.Provider value={contextValue}>
      {children}
    </PromptContext.Provider>
  );
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
    maxLength: { value: 200, message: "Description must be at most 200 characters long" },
    pattern: { value: /^[a-zA-Z0-9.,'!?" ]*$/, message: "Description can only contain letters, numbers, and basic punctuation" },
};