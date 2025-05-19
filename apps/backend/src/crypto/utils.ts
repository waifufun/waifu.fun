import bs58 from "bs58";
import nacl from "tweetnacl";

export const VerifySolanaSignature = (
    nonce: string,
    signature: string,
    publicKey: string
) => {
    try {
        const decodedSignature = bs58.decode(signature);
        const decodedNonce = new TextEncoder().encode(nonce);
        const decodedPublicKey = bs58.decode(publicKey);

        // Verify the signature
        return nacl.sign.detached.verify(
            decodedNonce,
            decodedSignature,
            decodedPublicKey
        );
    } catch (error) {
        console.error("Error verifying Solana signature:", error);
        return false;
    }
}