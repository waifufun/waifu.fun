"use client";
import { useRef, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Image as ImageIcon, Send } from "lucide-react";
import { abbreviateNumber } from "@/lib/utils";
import Image from "next/image";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getChatHistory, sendChatMessage } from "@/lib/api";
import type { AddressLike, IChatMessage, IToken, TChatRooms } from "@autofun/types";
import { toast } from "sonner";

type Inputs = {
	message: string;
};

export default function Chat({ token }: { token: IToken }) {
	const [room, setRoom] = useState<TChatRooms>(1000);
	return (
		<div className="flex flex-col gap-2 items-center w-full">
			<div className="flex items-start gap-2 w-full">
				{[1000, 100_000, 1_000_000].map((r) => (
					<Button onClick={() => setRoom(r as TChatRooms)} key={r} variant={r === room ? "default" : "secondary"}>
						{abbreviateNumber(r, true)}
					</Button>
				))}
			</div>
			<ChatWindow room={room} contractAddress={token.contractAddress} />
		</div>
	);
}

const ChatWindow = ({ room, contractAddress }: { room: TChatRooms; contractAddress: AddressLike }) => {
	const ref = useRef<HTMLDivElement | null>(null);
	const {
		register,
		handleSubmit,
		watch,
		formState: { errors },
	} = useForm<Inputs>();

	const onSubmit: SubmitHandler<Inputs> = (data) => {
		mutation.mutate({ message: data.message });
	};

	const query = useQuery({
		queryKey: ["chat", contractAddress, room],
		queryFn: async () => {
			return await getChatHistory({
				contractAddress,
				room,
			});
		},
	});

	const mutation = useMutation({
		mutationKey: ["chat", "message"],
		mutationFn: async ({ message }: { message: string }) => {
			await sendChatMessage({
				room,
				contractAddress,
				message,
			});
		},
		onSuccess: () => {
			query?.refetch();
		},
		onError: (e) => {
			toast.error(e.message);
		},
	});

	const scrollToBottom = () => {
		if (ref?.current) {
			const scrollHeight = ref.current.scrollHeight;
			ref.current.scrollTop = 0;
		}
	};

	return (
		<div className="flex flex-col gap-2 w-full">
			<div className="h-[50vh] w-full border p-4 overflow-y-scroll flex flex-col-reverse gap-4" ref={ref}>
				{query?.data?.map((message: IChatMessage) => (
					<ChatItem key={message._id} message={message} />
				))}
			</div>
			<form className="flex items-center gap-2" onSubmit={handleSubmit(onSubmit)}>
				<Button size="icon" type="button">
					<ImageIcon />
				</Button>
				<Input placeholder="Send a message" aria-autocomplete="none" {...register("message")} />
				<Button size="icon" type="submit">
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
				<div className="inline-flex items-center gap-3">
					<div className="justify-start text-autofun-background-action-highlight text-base font-medium">
						{message?.sender}
					</div>
					<div className="justify-start text-autofun-text-secondary text-sm font-medium">{message?.createdAt}</div>
				</div>
				<div className="self-stretch justify-start text-autofun-text-primary text-base font-medium font-satoshi leading-tight">
					{message?.message}
				</div>
			</div>
		</div>
	);
};
