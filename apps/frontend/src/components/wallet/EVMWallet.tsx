import { WalletClass } from "./WalletClass";
import { AddressLike, EvmAddressLike, EvmChainIds } from "@autofun/types";

interface IEVMFunctions {
    signMessage: (message: string) => Promise<string>;
    signTransaction: (transaction: any) => Promise<any>;
}

export class EVMWallet extends WalletClass {
    public readonly address: EvmAddressLike;
    public readonly chain: EvmChainIds;
    private _evmFunctions: IEVMFunctions;

    constructor(
        address: EvmAddressLike,
        chain: EvmChainIds,
        functions: IEVMFunctions,
    ) {
        super();
        this._evmFunctions = functions;
        this.address = address;
        this.chain = chain;
        console.log(`EVMWallet instance created for address: ${address}, chain: ${chain}`);
    }

    async signTransaction(transaction: any): Promise<any> {
        console.log("EVMWallet: Signing transaction...");
        try {
            const signedTx = await this._evmFunctions.signTransaction(transaction);
            console.log("EVMWallet: Transaction signed successfully.");
            return signedTx;
        } catch (error) {
            console.error("EVMWallet: Error signing transaction:", error);
            throw error;
        }
    }

    async signMessage(message: string): Promise<string> { 
        console.log("EVMWallet: Signing message...");
        try {
            const signature = await this._evmFunctions.signMessage(message);
            console.log("EVMWallet: Signed Message:", signature);
            return signature;
        } catch (error) {
            console.error("EVMWallet: Error signing message:", error);
            throw error;
        }
    }

    async getNativeBalance(): Promise<number> {
        throw new Error("Method not implemented.");
    }
}