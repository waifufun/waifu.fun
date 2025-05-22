"use client";
import TokenTypeSelector from "@/components/create-token-page/token-type-selector";
import { PromptProvider } from "@/components/hooks/providers/usePromptContext";
import { usePrompt } from "@/components/hooks/providers/usePromptContext";
import { useRef, useState } from "react";
import Image from "next/image";
import { Info, Wallet } from "lucide-react";

const PromptComponent = () => {
    const { prompt, setPrompt, generateToken } = usePrompt();
    const textareaRef = useRef(null as any);
    const [rows, setRows] = useState(3);
    const MAX_ROWS = 5;

    return (
        <div className="flex gap-4 bg-[#3333331A] px-4 items-center rounded-lg"
        style={{
            background: "linear-gradient(180deg, #171717 0%, #141414 100%)"
        }}>
            <textarea
                ref={textareaRef}
                className="w-full rounded-lg py-3 resize-none overflow-aut focus:outline-none"
                placeholder="A grumpy, older man in a Hawaiian shirt, wildly ripping open a vintage tech package with an ecstatic yet furious expression.  Surrounded by styrofoam peanuts and packing tape.  Highly detailed, 8k resolution, trending art style, vibrant colors, dramatic lighting."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={rows}
                style={{
                    minHeight: '4.5rem',
                }}
            />
            <button
            style={{
                background: "linear-gradient(106.96deg, #141414 -24.65%, #131313 48.9%, #121212 109.26%)"
            }}
            className="border border-[#03FF24] rounded-lg hover:cursor-pointer px-4 py-2 text-base uppercase font-[500]"
            onClick={() => {
                generateToken(prompt.length > 0 && prompt || undefined)
            }}
            >
                <p>Create</p>
            </button>
        </div>
    );
};

const AIImageWithPlaceHolder = ({href}: {href: string | undefined}) => {
    if (!href) {
        return (
            <div className="w-full h-full bg-[#3333331A] rounded-lg flex items-center justify-center">
                <p>No Image</p>
            </div>
        )
    } else {
        return (
            <div className="w-full h-full relative rounded-lg overflow-hidden">
                <Image
                    alt="Generated Image"
                    src={href}
                    layout="fill"
                    objectFit="cover"
                    className="rounded-lg"
                />
            </div>
        )
    }
}

const AiImageLoading = () => {
    return (
        <div className="w-full h-full bg-[#3333331A] rounded-lg flex items-center justify-center">
            <p>Loading...</p>
        </div>
    )
}

const TokenInfo = () => {
	const { name, setName, description, setDescription, ticker, setTicker } = usePrompt();

	return (
		<div className="w-full">
			<p className="text-[#FFFFFF] font-[700] text-lg border-b border-b-[#03FF24] inline-block">COIN INFO</p>

			<div className="flex flex-col gap-4 mt-2">
				<div className="flex flex-col md:flex-row md:gap-8 gap-4">
					<TokenInfoInput title="Name" value={name} setValue={setName} />
					<TokenInfoInput title="Ticker" label="$" value={ticker} setValue={setTicker} />
				</div>

				<TokenInfoInput title="Description" value={description} setValue={setDescription} />
			</div>
			<GenerateAddress />
            <BuyCoin/>
            <ChoosePool/>
		</div>
	);
};

const GeneratedImages = () => {
    const {previousImages} = usePrompt();
    const {isGeneratingImage, changeMainImage} = usePrompt();

    const startingIndex = isGeneratingImage ? 0 : 1;

    const nextImages: (string | undefined)[] = previousImages.slice(startingIndex, startingIndex + 3)

    if (nextImages.length < 3) {
        const diff = 3 - nextImages.length;
        for (let i = 0; i < diff; i++) {
            nextImages.push(undefined);
        }
    }
    return (
        <div className="w-full flex justify-center">
            <div className="w-[300px] sm:w-[500px]">
                <div className="w-full h-[300px] sm:h-[500px] rounded-lg overflow-hidden relative">
                    {isGeneratingImage && <AiImageLoading/>}
                    {!isGeneratingImage && <AIImageWithPlaceHolder href={previousImages[0]}/>}
                </div>
                <div>
                    <div>
                        <div className="grid grid-cols-3 gap-4 mt-4">
                            {nextImages.map((image, index) => (
                                <button onClick={() => {
                                    changeMainImage(index + 1);
                                }} key={index} className="w-full aspect-square hover:cursor-pointer rounded-lg overflow-hidden relative"> {/* Ensure button can host relative child properly */}
                                    <AIImageWithPlaceHolder href={image}/>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

const TokenInfoInput = ({title, label, value, setValue } : {title: string, label?: string, value: string, setValue: (value: string) => void}) => {

    return (
        <div className="flex flex-col gap-2 w-full">
            <p className="text-xl font-[500]">{title}</p>
            <div className="flex items-center w-full px-4 gap-4 rounded-lg"
            style={{
                background: "linear-gradient(180deg, #171717 0%, #141414 100%)"
            }}>
                {label && <p className="text-[#8C8C8C] text-xl font-[500]">{label}</p>}
                <input
                    className="w-full rounded-lg py-3 focus:outline-none"
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                />
            </div>
        </div>
    )
}

const GenerateAddress = () => {
    const [suffix, setSuffix] = useState<string>("FUN");

    const { generateAddress, address } = usePrompt();

    return (
        <div className="mt-4">
            <div className="inline-block">
                <p className="text-[#FFFFFF] font-[700] text-lg border-b border-b-[#03FF24]">
                    GENERATE CUSTOM ADDRESS
                </p>
                <div className="flex gap-4 mt-4">
                    <input
                        className="rounded-lg py-3 focus:outline-none text-center text-lg w-30"
                        type="text"
                        value={suffix}
                        onChange={(e) => setSuffix(e.target.value)}
                        placeholder="FUN"
                        style={{
                             background: "linear-gradient(106.96deg, #141414 -24.65%, #131313 48.9%, #121212 109.26%)"
                        }}
                    />
                    <button onClick={() => generateAddress(suffix)} className="border border-[#03FF24] rounded-lg hover:cursor-pointer px-4 py-2 w-full"> {/* Use flex-1 to share width */}
                        <p>GENERATE</p>
                    </button>
                </div>
            </div> 
            <p className="text-[#03FF24] text-sm md:text-md  xl:text-lg py-3 break-all">{address}</p>
            <div className="flex items-center gap-2">
                <Info size={14} color="#8C8C8C"/>
                <p className="text-[#8C8C8C] text-sm font-[500]">Longer suffixes are slower to generate</p>
            </div>
        </div>
    );
};

const BuyCoin = () => {
    return (
        <div className="inline-block py-4">
            <p className="text-[#FFFFFF] font-[700] text-lg border-b border-b-[#03FF24] inline-block">
                BUY COIN
            </p>

            <div className="flex gap-8 mt-4 items-center">
                <div className="relative flex gap-2">
                    <p className="text-xl font-[500]">Buy</p>
                    <Info size={14} color="#8C8C8C"/>
                </div>
                <div className="flex gap-3 items-center py-3 px-4"
                style={{
                    background: "linear-gradient(180deg, #171717 0%, #141414 100%)"
                }}>
                    <input
                        className="rounded-lg focus:outline-none text-lg w-10"
                        type="text"
                        placeholder="0.00"
                    />
                    <p className="text-xl text-[#03FF24] font-[500]">SOL</p>
                </div>
            </div>
            <div className="flex gap-2 items-center py-2">
                <Wallet size={14} color="#8C8C8C"/>
                <p className="text-[#8C8C8C] text-sm font-[500]">Balance: 5.65 SOL</p>
            </div>
            <button className="py-2 hover:cursor-pointer">
                <p className="text-[#E3AA00] text-sm font-[500]">Maximum amount based on your balance</p>
            </button>
        </div>
    )
}

const ChoosePool = () => {

    const poolData = [
        {
            name: "Meteora",
            value: "meteora",
            image: "/pools/meteora.svg",
        },
        {
            name: "Raydium",
            value: "raydium",
            image: "/pools/raydium.svg",
        }
    ]

    const [pool, setPool] = useState("meteora");

    return (
        <div className="flex flex-col gap-2 xl:flex-row xl:justify-between w-full xl:items-center">
            <div className="flex flex-col xl:flex-row gap-2 items-center">
                <p className="text-xl font-[500] whitespace-nowrap w-full xl:w-auto">Choose Pool</p>
                <div className="flex px-2 py-1 rounded-lg gap-2 w-full"
                style={{
                }}>
                    {poolData.map((poolIt) => (
                        <button key={poolIt.value} className="flex items-center gap-2 p-2 rounded-lg hover:cursor-pointer"
                        onClick={() => setPool(poolIt.value)}
                        style={{
                            border: poolIt.value === pool ? "1px solid #03FF24" : "1px solid #141414",
                            background: "linear-gradient(180deg, #171717 0%, #141414 100%)"
                        }}>
                            <img src={poolIt.image} alt={poolIt.name} className="w-5 h-5"/>
                            <p className="text-[#8C8C8C] text-base font-[500]">{poolIt.name}</p>
                        </button>
                    ))}
                </div>
            </div>
            <button 
            className="px-4 py-2 rounded-lg hover:cursor-pointer"
            style={{
                background: "linear-gradient(93.76deg, #03FF24 0%, #00E61E 102.57%)"
            }}>
                <p className="text-[#0A0A0A] text-base font-[700]">LAUNCH</p>
            </button>
        </div>
    )
}

export default function CreateTokenPage() {

    return (
        <PromptProvider>
            <div className="flex justify-center">
                <div className="flex flex-col items-center mt-5 w-full max-w-[1100px]">
                    <div>
                        <img src="/create/coin-machine.png"/>
                    </div>
                    <div className="rounded-lg bg-[#3333331A] w-full overflow-hidden">
                        <TokenTypeSelector selected="auto"/>
                        <div className="p-4">
                            <PromptComponent/>
                            <div className="flex flex-col lg:flex-row w-full gap-10 py-8">
                                <GeneratedImages/>
                                <TokenInfo/>
                            </div>
                        </div>
                    </div>
                </div>
                
            </div>
        </PromptProvider>
    )
}
