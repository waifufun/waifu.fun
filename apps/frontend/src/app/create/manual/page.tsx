"use client";
import TokenInfo from "@/components/create-token-page/token-info";
import TokenTypeSelector from "@/components/create-token-page/token-type-selector";
import { PromptProvider } from "@/components/hooks/providers/usePromptContext";
import { Upload } from "lucide-react";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import type {ChangeEvent} from "react";
import { toast } from "sonner";

const UploadPlaceholder = ({ onClick }: { onClick: () => void }) => {
    return (
        <button
            onClick={onClick}
            className="w-full h-full bg-[#171717] rounded-lg flex items-center justify-center border border-[#262626] hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#03FF24]"
            aria-label="Upload image"
        >
            <div className="flex flex-col items-center justify-center gap-3">
                <Upload className="text-[#03FF24] animate-pulse flex justify-center w-[48px] h-[48px]"/>
                <p className="font-[500] text-base text-[#8C8C8C]">Png, jpeg, gif, webp max 5MB.</p>
            </div>
        </button>
    )
}

const UploadImage = () => {
    const [imageURL, setImageURL] = useState<string | undefined>(undefined);
    const [imageFile, setImageFile] = useState<File | undefined>(undefined);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const allowedTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
            const maxSize = 5 * 1024 * 1024; // 5MB

            if (!allowedTypes.includes(file.type)) {
                toast.error("Invalid file type. Please upload a PNG, JPEG, GIF, or WEBP.");
                return;
            }

            if (file.size > maxSize) {
                toast.error("File is too large. Maximum size is 5MB.");
                return;
            }

            if (imageURL && imageURL.startsWith("blob:")) {
                URL.revokeObjectURL(imageURL);
            }

            const newImageURL = URL.createObjectURL(file);
            setImageURL(newImageURL);
            setImageFile(file);

            if(event.target) {
                event.target.value = "";
            }
        }
    };

    const handlePlaceholderClick = () => {
        fileInputRef.current?.click();
    };

    const handleDeleteImage = () => {
        setImageURL(undefined);
        setImageFile(undefined);
    };

    useEffect(() => {
        const currentImageUrl = imageURL;

        // memory clean go

        return () => {
            if (currentImageUrl && currentImageUrl.startsWith("blob:")) {
                URL.revokeObjectURL(currentImageUrl);
            }
        };
    }, [imageURL]);

    return (
        <div className="w-full flex justify-center">
            <div className="w-[300px] sm:w-[500px]">
                <div className="w-full h-[300px] sm:h-[500px] rounded-lg overflow-hidden relative bg-[#171717] border border-[#262626]">
                    {!imageURL && <UploadPlaceholder onClick={handlePlaceholderClick} />}
                    {imageURL && (
                        <>
                            <Image
                                src={imageURL}
                                alt="Uploaded preview"
                                layout="fill"
                                objectFit="contain"
                                className="rounded-lg cursor-pointer" // Added cursor-pointer
                                onClick={handleDeleteImage}          // Added onClick handler
                            />
                            {/* Optional: Add a more explicit delete button overlay */}
                            {/*
                            <button
                                onClick={handleDeleteImage}
                                className="absolute top-2 right-2 bg-red-500 hover:bg-red-700 text-white p-1 rounded-full z-10"
                                aria-label="Delete image"
                            >
                                <XCircle size={24} />
                            </button>
                            */}
                        </>
                    )}
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/png, image/jpeg, image/gif, image/webp"
                        style={{ display: "none" }}
                    />
                </div>
            </div>
        </div>
    );
}

export default function CreateTokenPageManual() {
    return (
        <PromptProvider>
            <div className="flex justify-center">
                <div className="flex flex-col items-center mt-5 w-full max-w-[1100px]">
                    <div>
                        <Image src="/create/coin-machine.png" alt="Coin Machine" width={150} height={150} />
                    </div>
                    <div className="rounded-lg bg-[#3333331A] w-full overflow-hidden mt-4">
                        <TokenTypeSelector selected="manual"/>
                        <div className="p-4">
                            <div className="flex flex-col lg:flex-row w-full gap-10 py-8">
                                <UploadImage/>
                                <TokenInfo/>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </PromptProvider>
    )
}