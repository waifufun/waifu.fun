"use client";
import { PromptProvider, usePrompt } from "@/components/hooks/providers/usePromptContext";
import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ManualCreateForm from "@/components/ui/create-token/manual-create-form";
import AutoCreateForm from "@/components/ui/create-token/auto-create-form";
import ImportTokenForm from "@/components/ui/create-token/import-token-form";
import { StepProgress } from "@/components/ui/create-token/step-progress";
import { RecentlyCreated } from "@/components/ui/create-token/recently-created";
import { FAQAccordion } from "@/components/ui/create-token/faq-accordion";
import { Wand2, Settings2, Download, Sparkles } from "lucide-react";
const steps = [{ label: "choose", description: "pick a mode" }, { label: "create", description: "configure token" }, { label: "launch", description: "deploy to chain" }];
function CreateTokenPageContent() {
	const [activeTab, setActiveTab] = useState("auto");
	const { mintKeyPair, isLaunching, previousImages } = usePrompt();
	const currentStep = useMemo(() => { if (isLaunching) return 2; if (mintKeyPair || (previousImages && previousImages.length > 0)) return 1; return 0; }, [mintKeyPair, isLaunching, previousImages]);
	return (
		<div className="w-full min-h-screen bg-[#08080a]">
			<div className="w-full max-w-6xl mx-auto px-4 pt-8 pb-4"><div className="text-center mb-8"><div className="inline-flex items-center gap-2 mb-3"><Sparkles className="w-5 h-5 text-[#00ff87]" /><span className="text-xs font-mono text-[#00ff87] uppercase tracking-widest">token launcher</span></div><h1 className="text-2xl md:text-3xl font-bold text-[#e4e4e7] mb-2">Create Your Token</h1><p className="text-sm text-[#71717a] max-w-md mx-auto">Launch your token on Solana in minutes. AI-powered image generation, custom vanity addresses, and instant deployment.</p></div><StepProgress steps={steps} currentStep={currentStep} className="max-w-md mx-auto mb-8" /></div>
			<div className="w-full max-w-7xl mx-auto px-4 pb-8"><div className="grid lg:grid-cols-[1fr_280px] gap-6"><div><Tabs value={activeTab} onValueChange={setActiveTab} className="w-full"><TabsList className="grid w-full grid-cols-3 bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm mb-6 p-1"><TabsTrigger value="auto" className="relative text-sm py-3 font-bold uppercase tracking-wider data-[state=active]:bg-transparent data-[state=active]:text-[#00ff87] data-[state=inactive]:text-[#71717a] rounded-sm flex items-center justify-center gap-2"><Wand2 size={14} /><span>Auto</span>{activeTab === "auto" && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-[#00ff87] rounded-full animate-glow-pulse" />}</TabsTrigger><TabsTrigger value="manual" className="relative text-sm py-3 font-bold uppercase tracking-wider data-[state=active]:bg-transparent data-[state=active]:text-[#00ff87] data-[state=inactive]:text-[#71717a] rounded-sm flex items-center justify-center gap-2"><Settings2 size={14} /><span>Manual</span>{activeTab === "manual" && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-[#00ff87] rounded-full animate-glow-pulse" />}</TabsTrigger><TabsTrigger value="import" className="relative text-sm py-3 font-bold uppercase tracking-wider data-[state=active]:bg-transparent data-[state=active]:text-[#00ff87] data-[state=inactive]:text-[#71717a] rounded-sm flex items-center justify-center gap-2"><Download size={14} /><span>Import</span>{activeTab === "import" && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-[#00ff87] rounded-full animate-glow-pulse" />}</TabsTrigger></TabsList><TabsContent value="auto" className="mt-0"><AutoCreateForm /></TabsContent><TabsContent value="manual" className="mt-0"><ManualCreateForm /></TabsContent><TabsContent value="import" className="mt-0"><ImportTokenForm /></TabsContent></Tabs><FAQAccordion className="mt-8" /></div><aside className="hidden lg:block"><div className="sticky top-4"><RecentlyCreated /></div></aside></div><div className="lg:hidden mt-8"><RecentlyCreated /></div></div>
		</div>
	);
}
export default function CreateTokenPage() { return <PromptProvider><CreateTokenPageContent /></PromptProvider>; }
