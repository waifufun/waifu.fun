"use client";
import { createContext, useContext, useState, ReactNode } from "react";

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


  const setTicker = (ticker: string) => {
    if (ticker.length > 5) {
      return;
    }
    // Allow empty string or a string that matches the regex
    if (ticker !== "" && !/^[a-zA-Z0-9]+$/.test(ticker)) {
      return;
    }

    _setTicker(ticker);
  }

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