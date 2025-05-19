import type { FastifyInstance } from "fastify";
import { updateCryptoPrices } from "@autofun/utils";
import redis from "@autofun/redis";
import type { AddressLike, TChain } from "@autofun/types";
import { VerifySolanaSignature } from "../crypto/utils";
import { verifyMessage } from "viem";

export default async function authRoutes(fastify: FastifyInstance) {
    /** Retrieve crypto token prices */
    fastify.post("/generateNonce", async (request) => {
        const { address } = request.body as { address: AddressLike };
        if (!address) {
            return { error: "Address is required" };
        }

        const nonce = Math.floor(Math.random() * 1000000).toString();
        await redis.set(`nonce:${address}`, nonce, "EX", 60 * 5);
        return { nonce };
    });

    fastify.post("/authenticate", async (request) => {
        const { address, signature, chain } = request.body as { address: AddressLike; signature: string, chain: TChain };

        if (!address || !signature || !chain) {
            return { error: "Address, signature, and chain are required" };
        }

        const nonce = await redis.get(`nonce:${address}`);
        if (!nonce) {
            return { error: "Nonce not found or expired" };
        }

        switch (chain) {
            case "solana":
                const isValidSol = await VerifySolanaSignature(
                    nonce,
                    signature,
                    address
                )

                if (!isValidSol) {
                    return { error: "Invalid signature" };
                }
                break;
            case "evm":
                const isValidEVM = await verifyMessage({
                    address: address as `0x${string}`,
                    message: nonce,
                    signature: signature as `0x${string}`,
                })
                if (!isValidEVM) {
                    return { error: "Invalid signature" };
                }
                break;
            default:
                return { error: "Unsupported chain" };
        }
    })
}
