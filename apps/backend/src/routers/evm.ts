import type { EvmAddressLike, EvmChainIds, TChain } from "@autofun/types";
import type { FastifyInstance } from "fastify";

export default async function evmRoutes(fastify: FastifyInstance) {
    fastify.get<{
            Params: {
                chain: TChain;
                chainId: EvmChainIds;
                contractAddress: EvmAddressLike;
            };
            Reply: IToken | null;
        }>("/:chain/:chainId/:contractAddress", async (request) => {
            const { contractAddress, chain, chainId } = request.params;
    
            const cacheKey = `${chain}:${chainId}:${contractAddress}`;
    
            const cache = await redis.get(cacheKey);
            if (cache) {
                return JSON.parse(cache);
            }
    
            const token = await DB.Token.findOne({
                contractAddress,
                chainId,
                chain,
                hidden: { $ne: true },
            }).lean();
    
            if (!token) throw new Error("Token was not found");
    
            const populatedToken = await populateTokensWithLiveData([token]);
    
            await redis.setex(cacheKey, 8, JSON.stringify(populatedToken[0]));
    
            return token;
        });
}