"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

type ModalType = "WALLET_CONNECT" | null;

type ModalContextType = {
	modalType: ModalType;
	// biome-ignore lint/suspicious/noExplicitAny: need for flexibility in props
	modalProps?: any;
	// biome-ignore lint/suspicious/noExplicitAny: need for flexibility in props
	openModal: (type: ModalType, props?: any) => void;
	closeModal: () => void;
};

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider = ({ children }: { children: ReactNode }) => {
	const [modalType, setModalType] = useState<ModalType>(null);
	// biome-ignore lint/suspicious/noExplicitAny: need for flexibility in props
	const [modalProps, setModalProps] = useState<any>(null);

	// biome-ignore lint/suspicious/noExplicitAny: need for flexibility in props
	const openModal = (type: ModalType, props?: any) => {
		setModalType(type);
		setModalProps(props || null);
	};

	const closeModal = () => {
		setModalType(null);
		setModalProps(null);
	};

	return (
		<ModalContext.Provider value={{ modalType, modalProps, openModal, closeModal }}>{children}</ModalContext.Provider>
	);
};

export const useModal = () => {
	const context = useContext(ModalContext);
	if (!context) throw new Error("useModal must be used within a ModalProvider");
	return context;
};
