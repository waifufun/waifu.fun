"use client";
import { createContext, useContext, useState, ReactNode, useRef, useEffect } from "react";

type PromptContextType = {
  prompt: string;
  setPrompt: (prompt: string) => void;
  previousImages: string[];
  mainImage: string;
  name: string;
  setName: (name: string) => void;
  description: string;
  setDescription: (description: string) => void;
  ticker: string;
  setTicker: (ticker: string) => void;
  address: string;
  buyAmount: number;
  setBuyAmount: (amount: number) => void;
  generateAddress: (suffix: string) => void;
};

const PromptContext = createContext<PromptContextType | undefined>(undefined);

export const PromptProvider = ({ children }: { children: ReactNode }) => {
  const [prompt, setPrompt] = useState("");
  const [previousImages, setPreviousImages] = useState<string[]>([]);
  const [mainImage, setMainImage] = useState<string>("/create/test-img.png");
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [ticker, _setTicker] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [buyAmount, setBuyAmount] = useState<number>(0);
  const [isGeneratingAddress, setIsGeneratingAddress] = useState<boolean>(false);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (typeof Worker !== 'undefined') {
      workerRef.current = new Worker('/workers/generateVanity.js', { type: 'module' });

      workerRef.current.onmessage = (event) => {
        const { success, address: generatedAddress } = event.data;
        if (success) {
          setAddress(generatedAddress);
          setIsGeneratingAddress(false);
        } else {
          console.error("Error from address generation worker:", event.data);
          setIsGeneratingAddress(false);
        }
      };

      generateAddress("ewa");

      workerRef.current.onerror = (error) => {
        console.error("Web Worker error:", error);
        setIsGeneratingAddress(false);
      };
    } else {
      console.warn("Web Workers are not supported in this environment.");
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const setTicker = (ticker: string) => {
    if (ticker.length > 5) {
      return;
    }
    if (ticker !== "" && !/^[a-zA-Z0-9]+$/.test(ticker)) {
      return;
    }

    _setTicker(ticker);
  }

  const generateAddress = (suffix: string) => {
    if (isGeneratingAddress) {
      console.log("Already generating an address. Please wait.");
      return;
    }
    if (!suffix) {
      console.warn("Suffix is required to generate an address.");
      return;
    }
    if (!workerRef.current) {
      console.error("Web Worker not initialized.");
      return;
    }

    setIsGeneratingAddress(true);
    setAddress("");

    workerRef.current.postMessage({ suffix });
  };

  const props = {
    prompt,
    setPrompt,
    previousImages,
    setPreviousImages,
    mainImage,
    setMainImage,
    name,
    setName,
    description,
    setDescription,
    ticker,
    setTicker,
    address,
    setAddress,
    buyAmount,
    setBuyAmount,
    generateAddress,
  } as PromptContextType;



  return (
    <PromptContext.Provider value={props}>
      {children}
    </PromptContext.Provider>
  );
}

export const usePrompt = (): PromptContextType => {
  const context = useContext(PromptContext);
  if (!context) {
    throw new Error("usePrompt must be used within a PromptProvider");
  }
  return context;
};