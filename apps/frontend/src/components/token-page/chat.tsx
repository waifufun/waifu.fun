"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Image as ImageIcon, Send, XIcon } from "lucide-react";
import { abbreviateNumber, fileToBase64, fromNow, shortenAddress } from "@/lib/utils";
import Image from "next/image";
import { useForm, useWatch, type SubmitHandler } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getChatHistory, sendChatMessage } from "@/lib/api";
import type { IChatMessage, IToken, TChatRooms } from "@autofun/types";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

type Inputs = {
	message: string;
	attachment: File | undefined;
};

export default function Chat({ token }: { token: IToken }) {
	const [room, setRoom] = useState<TChatRooms>("1000");
	return (
		<div className="bg-[#0c0c0c] rounded-b-xl">
			<div className="flex flex-col items-center w-full my-3 px-4">
				<Tabs defaultValue="1000" className="w-full" onValueChange={(value) => setRoom(value as TChatRooms)}>
					<TabsList className="grid w-full grid-cols-5 h-10 bg-[#11111] border-b border-autofun-text-stroke-primary">
						{["1000", "100000", "1000000"].map((r) => (
							<TabsTrigger value={String(r)} className="text-base mt-[1px]" key={r}>
								{abbreviateNumber(Number(r), true)}+
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<ChatWindow room={room} token={token} />
			</div>
		</div>
	);
}

const ChatWindow = ({ token, room }: { room: TChatRooms; token: IToken }) => {
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
			ref.current.scrollTo({ top: 0, behavior: "smooth" });
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

	return (
		<div className="flex flex-col gap-2 w-full relative">
			<div className="h-14 w-full absolute top-0 left-0 bg-gradient-to-b from-[#111111] via-[#111111]/80 to-[#111111]/10" />
			<div className="flex flex-col gap-2 w-full bg-gradient-to-b from-[#0F0F0F] to-[#0D0D0D] rounded-b-xl">
				<div className="h-[600px] w-full p-4 overflow-y-scroll flex flex-col-reverse gap-4" ref={ref}>
					{query?.data?.map((message: IChatMessage) => (
						<ChatItem key={String(message._id)} message={message} />
					))}
				</div>
			</div>
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

				<div className="relative w-full bg-gradient-to-b from-[#171717] to-[#141414] rounded-lg transition-all duration-200">
					{imagePreviewUrl && (
						<div className="relative w-fit m-2">
							<button
								type="button"
								className="absolute bg-gradient-to-b from-[#171717] to-[#1F1F1F] animate-jump-in animate-once animate-duration-200 animate-ease-linear top-0.5 right-0.5 cursor-pointer size-9 p-1.5 inline-flex rounded-lg border border-autofun-background-action-highlight"
								onClick={() => {
									setValue("attachment", undefined);
								}}
							>
								<XIcon size={24} className="m-auto" />
							</button>
							<Image
								className="aspect-square size-[160px] object-contain"
								src={imagePreviewUrl}
								alt="Selected attachment preview"
								width={500}
								height={500}
								unoptimized
								priority
							/>
						</div>
					)}
					<Input
						placeholder="Send a message"
						aria-autocomplete="none"
						autoComplete="off"
						className="bg-transparent border-0"
						{...register("message", { required: true })}
					/>
					<Button
						size="icon"
						type="button"
						onClick={handleIconClick}
						className="absolute p-0 bg-transparent hover:bg-transparent right-0 bottom-0"
					>
						<ImageIcon size={18} className="text-autofun-icon-secondary size-[18px]" />
					</Button>
				</div>
				<Button size="icon" type="submit" className="self-end">
					<Send onClick={() => scrollToBottom()} />
				</Button>
			</form>
		</div>
	);
};

const ChatItem = ({ message }: { message: IChatMessage }) => {
	return (
		<div className="flex items-start gap-2">
			<Image
				src="/chain-icons/solana.svg"
				width={40}
				height={40}
				unoptimized
				alt="avatar"
				className="rounded-full size-10 bg-autofun-background-action-primary"
			/>
			<div className="flex flex-col gap-2.5 bg-[#171717] rounded-xl p-3">
				<div className="inline-flex items-center justify-between gap-3">
					<div className="justify-start text-autofun-background-action-highlight text-base font-medium">
						{message?.sender ? shortenAddress(message?.sender) : "-"}
					</div>
					<div className="justify-start text-autofun-text-secondary text-sm font-medium">
						{message?.createdAt ? fromNow(message?.createdAt) : "-"}
					</div>
				</div>
				<div className="self-stretch justify-start text-autofun-text-primary text-base font-medium font-satoshi leading-tight">
					{message?.message}
				</div>
				{message?.image ? (
					<Image
						src={message?.image}
						width={500}
						height={500}
						unoptimized
						className="aspect-square size-80 object-contain"
						alt="image"
					/>
				) : null}
			</div>
		</div>
	);
};
