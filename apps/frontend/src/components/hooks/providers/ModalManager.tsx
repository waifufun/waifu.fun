import { useModal } from "@/components/hooks/providers/UseModalContext";
import WalletConnectModal from "@/components/hooks/modals/WalletConnectModal";

export const ModalManager = () => {
	const { modalType, closeModal, modalProps } = useModal();

	if (!modalType) return null;

	console.log("ModalManager", modalType, modalProps);

	return (
		<div className="fixed inset-0 flex items-center justify-center backdrop-blur-lg z-50">
			{modalType === "WALLET_CONNECT" && <WalletConnectModal {...modalProps} onClose={closeModal} />}
		</div>
	);
};
