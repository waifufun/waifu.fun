"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Image as ImageIcon, Send, XIcon, Lock } from "lucide-react";
import { abbreviateNumber, fileToBase64, fromNow, shortenAddress } from "@/lib/utils";
import Image from "next/image";
import { useForm, useWatch, type SubmitHandler } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getChatHistory, sendChatMessage } from "@/lib/api";
import type { IChatMessage, IToken, TChatRooms } from "@autofun/types";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import useAddress from "@/hooks/use-address";
import useTokenBalance from "@/hooks/use-token-balance";

type Inputs = {
	message: string;
	attachment: File | undefined;
};

const tierTokenRequirements: Record<TChatRooms, string> = {
	"1000": "1,000+",
	"100000": "100,000+",
	"1000000": "1,000,000+",
};

export default function Chat({ token }: { token: IToken }) {
	const [room, setRoom] = useState<TChatRooms>("1000");

	return (
		<div className="bg-black border-2 border-[#03FF24]/40 rounded-none shadow-[4px_4px_0px_rgba(3,255,36,0.3)] flex flex-col h-[550px]">
			<div className="flex items-center justify-between p-2 border-b-2 border-[#03FF24]/30 bg-black/50">
				<Tabs defaultValue="1000" className="flex" onValueChange={(value) => setRoom(value as TChatRooms)}>
					<TabsList shadowed={false} className="bg-transparent border-0 p-0 h-auto">
						{["1000", "100000", "1000000"].map((r) => (
							<TabsTrigger
								key={r}
								value={String(r)}
								filled={false}
								className={cn(
									"text-xs font-bold uppercase tracking-wider rounded-none px-3 py-1.5 h-auto relative data-[state=active]:text-[#03FF24] data-[state=inactive]:text-gray-500 hover:text-gray-300 bg-transparent border-0",
								)}
							>
								{abbreviateNumber(Number(r), true)}+
								{room === r && (
									<motion.div
										layoutId="activeTierUnderline"
										className="absolute bottom-[-1px] left-0 right-0 h-[3px] bg-[#03FF24]"
										transition={{ type: "spring", stiffness: 300, damping: 25 }}
									/>
								)}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				{/* <Link href="#" className="text-xs text-gray-400 hover:text-[#03FF24] flex items-center">
					Open Full Chat Page <ExternalLink size={12} className="ml-1" />
				</Link> */}
			</div>

			<ChatWindow room={room} token={token} tierRequirement={tierTokenRequirements[room]} />
		</div>
	);
}

const ChatWindow = ({ token, room, tierRequirement }: { room: TChatRooms; token: IToken; tierRequirement: string }) => {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const ref = useRef<HTMLDivElement | null>(null);
	const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
	const {
		control,
		register,
		handleSubmit,
		setValue,
		resetField,
		formState: { errors },
	} = useForm<Inputs>({
		defaultValues: {
			attachment: undefined,
			message: "",
		},
	});

	const userAddress = useAddress();
	const balance = useTokenBalance({
		chain: token.chain,
		contractAddress: token.contractAddress,
		address: userAddress,
	});

	const tierKey = Object.keys(tierTokenRequirements).find((key) => tierTokenRequirements[key] === tierRequirement);

	const hasEnoughTokens = balance.data && tierKey ? Number(balance.data) >= Number(tierKey) : false;

	const onSubmit: SubmitHandler<Inputs> = async (data) => {
		const base64Image = data.attachment ? String(await fileToBase64(data.attachment)) : undefined;
		mutation.mutate({
			message: data.message,
			attachment: base64Image,
		});
	};

	const contractAddress = token.contractAddress;
	const chain = token.chain;
	const chainId = token.chainId;

	const query = useQuery({
		queryKey: ["chat", contractAddress, room, chain],
		queryFn: async () => {
			return await getChatHistory({
				contractAddress,
				chain,
				chainId,
				room,
			});
		},
	});

	const mutation = useMutation({
		mutationKey: ["chat", "message"],
		mutationFn: async ({ message, attachment }: { message: string; attachment?: Base64URLString | undefined }) => {
			if (!message || message?.length === 0) return;
			await sendChatMessage({
				attachment,
				room,
				contractAddress,
				chain,
				chainId,
				message,
			});
		},
		onSuccess: () => {
			resetField("attachment");
			resetField("message");
			setImagePreviewUrl(null);
			query?.refetch().then(() => {
				setTimeout(scrollToBottom, 50);
			});
		},
		onError: (e) => {
			toast.error(e.message);
		},
	});

	const scrollToBottom = () => {
		if (ref?.current) {
			ref.current.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
		}
	};

	const handleIconClick = () => {
		if (fileInputRef.current) {
			fileInputRef.current.click();
		}
	};

	const attachmentFile = useWatch({
		control,
		name: "attachment",
	});

	useEffect(() => {
		let objectUrl: string | null = null;
		if (attachmentFile) {
			const file = attachmentFile;
			objectUrl = URL.createObjectURL(file);
			setImagePreviewUrl(objectUrl);
		} else {
			setImagePreviewUrl(null);
		}

		return () => {
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl);
			}
		};
	}, [attachmentFile]);

	useEffect(() => {
		if (ref.current) {
			ref.current.scrollTop = ref.current.scrollHeight;
		}
	}, []);

	return (
		<>
			<div ref={ref} className="flex-1 overflow-y-auto p-3 space-y-1 bg-black/30">
				<AnimatePresence>
					{query?.data?.map((message: IChatMessage) => (
						<ChatItem key={String(message._id)} message={message} />
					))}
				</AnimatePresence>
			</div>

			<div className="p-2 border-t-2 border-[#03FF24]/30 bg-black/50">
				{imagePreviewUrl && (
					<div className="relative w-fit mb-2">
						<button
							type="button"
							className="absolute bg-black/80 top-1 right-1 cursor-pointer size-6 p-1 inline-flex rounded-none border border-[#03FF24]/30"
							onClick={() => {
								setValue("attachment", undefined);
							}}
						>
							<XIcon size={14} className="m-auto text-white" />
						</button>
						<Image
							className="max-w-[200px] max-h-[150px] object-cover border-2 border-[#03FF24]/30 rounded-none shadow-[2px_2px_0px_rgba(3,255,36,0.2)]"
							src={imagePreviewUrl}
							alt="Selected attachment preview"
							width={200}
							height={150}
							unoptimized
							priority
						/>
					</div>
				)}

				<form className="flex items-center gap-2" onSubmit={handleSubmit(onSubmit)}>
					<input
						type="file"
						accept="image/*"
						style={{ display: "none" }}
						ref={fileInputRef}
						onChange={(e) => {
							const file = e?.target?.files?.[0];
							if (file) {
								setValue("attachment", file);
							}
						}}
					/>

					<Button
						variant="ghost"
						size="icon"
						type="button"
						disabled={!hasEnoughTokens}
						onClick={handleIconClick}
						className="h-9 w-9 p-0 text-gray-400 hover:text-[#03FF24] rounded-none flex-shrink-0"
					>
						<ImageIcon size={18} />
					</Button>

					<Input
						type="text"
						disabled={!hasEnoughTokens}
						placeholder="Type a message..."
						className="bg-black border-2 border-[#03FF24]/50 placeholder-gray-600 text-sm h-9 focus:border-[#03FF24] text-gray-200 rounded-none shadow-[2px_2px_0px_rgba(3,255,36,0.2)] flex-grow"
						{...register("message", { required: true })}
					/>

					<Button
						variant="ghost"
						size="icon"
						type="submit"
						disabled={mutation?.isPending || !hasEnoughTokens}
						className="h-9 w-9 p-0 bg-[#03FF24]/80 hover:bg-[#03FF24] text-black rounded-none shadow-[2px_2px_0px_#01a718] flex-shrink-0"
					>
						<Send size={18} />
					</Button>
				</form>

				{!hasEnoughTokens && (
					<p className="text-xs text-yellow-500 mt-1.5 px-1 flex items-center">
						<Lock size={12} className="mr-1.5 text-yellow-600" />
						You need {tierRequirement} tokens to post in this chat.
					</p>
				)}
			</div>
		</>
	);
};

const ChatItem = ({ message }: { message: IChatMessage }) => {
	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3 }}
			className="flex items-start gap-3 py-2.5"
		>
			<Avatar className="h-8 w-8 border-2 border-[#03FF24]/30 rounded-none shadow-[1px_1px_0px_rgba(3,255,36,0.2)]">
				<AvatarImage src="/chain-icons/solana.svg" alt={message?.sender ? shortenAddress(message?.sender) : "User"} />
				<AvatarFallback className="bg-gray-700 text-xs text-[#03FF24] rounded-none">
					{message?.sender ? shortenAddress(message?.sender).substring(0, 2).toUpperCase() : "U"}
				</AvatarFallback>
			</Avatar>
			<div className="flex-1">
				<div className="flex items-baseline gap-2 text-xs">
					<span className="font-bold text-[#03FF24]">
						{message?.sender ? shortenAddress(message?.sender) : "Unknown"}
					</span>
					<span className="text-gray-500">{message?.createdAt ? fromNow(message?.createdAt) : "Unknown time"}</span>
				</div>
				{message?.message && <p className="text-sm text-gray-200 mt-0.5">{message.message}</p>}
				{message?.image && (
					<div className="mt-2 border-2 border-[#03FF24]/30 rounded-none shadow-[2px_2px_0px_rgba(3,255,36,0.2)] overflow-hidden max-w-xs">
						<Image src={message.image} alt="Chat image" width={300} height={200} className="object-cover" unoptimized />
					</div>
				)}
			</div>
		</motion.div>
	);
};
