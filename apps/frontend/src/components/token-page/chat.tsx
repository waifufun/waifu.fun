"use client";
import { useRef, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Image as ImageIcon, Send } from "lucide-react";
import { abbreviateNumber } from "@/lib/utils";
import Image from "next/image";

export default function Chat() {
	const [room, setRoom] = useState<number>(1000);
	return (
		<div className="flex flex-col gap-2 items-center w-full">
			<div className="flex items-start gap-2 w-full">
				{[1000, 100_000, 1_000_000].map((r) => (
					<Button onClick={() => setRoom(r)} key={r} variant={r === room ? "default" : "secondary"}>
						{abbreviateNumber(r, true)}
					</Button>
				))}
			</div>
			<ChatWindow room={room} />
		</div>
	);
}

const ChatWindow = ({ room }: { room: number }) => {
	const ref = useRef<HTMLDivElement | null>(null);

	const scrollToBottom = () => {
		if (ref?.current) {
			const scrollHeight = ref.current.scrollHeight;
			ref.current.scrollTop = 0;
		}
	};

	return (
		<div className="flex flex-col gap-2 w-full">
			<div className="h-[50vh] w-full border p-4 overflow-y-scroll flex flex-col-reverse gap-4" ref={ref}>
				{Array.from({ length: 200 }, (_, i) => ({ id: `mock-message-${i}` })).map((message) => (
					<ChatItem key={message.id} />
				))}
			</div>
			<div className="flex items-center gap-2">
				<Button size="icon">
					<ImageIcon />
				</Button>
				<Input />
				<Button size="icon">
					<Send onClick={() => scrollToBottom()} />
				</Button>
			</div>
		</div>
	);
};

const ChatItem = () => {
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
					<div className="justify-start text-autofun-background-action-highlight text-base font-medium">Testuser2</div>
					<div className="justify-start text-autofun-text-secondary text-sm font-medium">07:09 AM</div>
				</div>
				<div className="self-stretch justify-start text-autofun-text-primary text-base font-medium font-satoshi leading-tight">
					Vitae mauris sollicitudin nulla faucibus fermentum nunc laoreet
				</div>
			</div>
		</div>
	);
};
