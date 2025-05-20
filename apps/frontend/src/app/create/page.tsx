"use client";
import TokenTypeSelector from "@/components/create-token-page/token-type-selector"
import { PromptProvider } from "@/components/hooks/providers/usePromptContext"
import { usePrompt } from "@/components/hooks/providers/usePromptContext"
import { useEffect, useRef, useState } from "react";



const PromptComponent = () => {
    const { prompt, setPrompt } = usePrompt();
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
                placeholder="Enter your prompt here..."
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
            className="border border-[#03FF24] rounded-lg hover:cursor-pointer px-4 py-2"
            >
                <p>Create</p>
            </button>
        </div>
    );
};


export default function CreateTokenPage() {
    return (
        <PromptProvider>
            <div className="flex justify-center px-40">
                <div className="flex flex-col items-center mt-5 w-full">
                    <div>
                        <img src="/create/coin-machine.png"/>
                    </div>
                    <div className="rounded-lg bg-[#3333331A] w-full overflow-hidden">
                        <TokenTypeSelector selected="auto"/>
                        <div className="p-4">
                            <PromptComponent/>
                        </div>
                    </div>
                </div>
            </div>
        </PromptProvider>
    )
}