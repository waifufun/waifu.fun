import { Keypair } from '@solana/web3.js';
self.onmessage = async (event) => {
    const { suffix } = event.data;
    if (!suffix) {
        console.error("Worker received no suffix.");
        self.postMessage({ success: false, error: "No suffix provided." });
        return;
    }
    const targetSuffix = suffix.toLowerCase();
    let isRunning = true;
    const stopWorker = () => {
        isRunning = false;
    };
    self.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'stop') {
            stopWorker();
        }
    });
    while (isRunning) {
        try {
            const keypair = Keypair.generate();
            const address = keypair.publicKey.toBase58();
            if (address.toLowerCase().endsWith(targetSuffix)) {
                self.postMessage({ success: true, address: address, secretKey: Array.from(keypair.secretKey) });
                isRunning = false;
            }
        }
        catch (error) {
            console.error("Error generating Solana address in worker:", error);
            await new Promise(resolve => setTimeout(resolve, 10)); // Short delay
        }
        await new Promise(resolve => setTimeout(resolve, 0)); // Yield to event loop
    }
};
