import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AutoCreateForm from "@/components/ui/create-token/auto-create-form";
import { ManualCreateForm } from "@/components/ui/create-token/manual-create-form";
import { ImportTokenForm } from "@/components/ui/create-token/import-token-form";

export default function CreateTokenPage() {
	return (
		<>
			{" "}
			{/* Changed from div to fragment */}
			<div className="flex-1 container mx-auto px-4 py-8 space-y-8">
				<div className="text-center">
					{/* The COIN MACHINE logo could be added here if desired, or managed by FunHeader prop */}
				</div>

				<Tabs defaultValue="auto" className="w-full max-w-4xl mx-auto">
					<TabsList className="grid w-full grid-cols-3 bg-black border-2 border-[#03FF24]/50 rounded-none p-0 h-auto shadow-[3px_3px_0px_rgba(3,255,36,0.3)] mb-6">
						<TabsTrigger
							value="auto"
							className="text-sm data-[state=active]:bg-[#03FF24] data-[state=active]:text-black data-[state=active]:shadow-[inset_0px_0px_0px_2px_black] 
                     text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none py-3 font-bold uppercase tracking-wider
                     border-r border-[#03FF24]/50 data-[state=active]:border-r-[#01a718]"
						>
							Auto
						</TabsTrigger>
						<TabsTrigger
							value="manual"
							className="text-sm data-[state=active]:bg-[#03FF24] data-[state=active]:text-black data-[state=active]:shadow-[inset_0px_0px_0px_2px_black] 
                     text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none py-3 font-bold uppercase tracking-wider
                     border-x border-transparent data-[state=active]:border-x-[#01a718]"
						>
							Manual
						</TabsTrigger>
						<TabsTrigger
							value="import"
							className="text-sm data-[state=active]:bg-[#03FF24] data-[state=active]:text-black data-[state=active]:shadow-[inset_0px_0px_0px_2px_black] 
                     text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none py-3 font-bold uppercase tracking-wider
                     border-l border-[#03FF24]/50 data-[state=active]:border-l-[#01a718]"
						>
							Import
						</TabsTrigger>
					</TabsList>

					<TabsContent value="auto">
						<AutoCreateForm />
					</TabsContent>
					<TabsContent value="manual">
						<ManualCreateForm />
					</TabsContent>
					<TabsContent value="import">
						<ImportTokenForm />
					</TabsContent>
				</Tabs>
			</div>
		</>
	);
}
