type SwapStatsProps = {
    minReceived: string;
    priceImpact: string;
    advancedSettings: boolean;
};

export default function SwapStats({ minReceived, priceImpact, advancedSettings }: SwapStatsProps) {
    return (
        <>
            <div className="flex justify-between text-sm text-white/70">
                <p>Min received</p>
                <p>{minReceived}</p>
            </div>

            <div className="flex justify-between text-sm text-white/70">
                <p>Price impact</p>
                <p>{priceImpact}%</p>
            </div>

            <div className="flex justify-between text-sm text-white/70 items-center">
                <p>Advanced settings</p>
                <input type="checkbox" checked={advancedSettings} readOnly />
            </div>
        </>
    );
}
