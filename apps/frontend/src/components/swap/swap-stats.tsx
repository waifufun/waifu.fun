import { useState } from "react";

const initialSettings = {
  speed: "Normal",
  slippage: "0.5%",
  deadline: "5",
};

export default function SwapStats({ minReceived, priceImpact }: SwapStatsProps) {
  const [settings, setSettings] = useState(initialSettings);

  return (
    <>
      <div className="flex font-medium justify-between text-base text-white">
        <p>Min received</p>
        <p>{minReceived}</p>
      </div>

      <div className="flex font-medium justify-between text-base text-white">
        <p>Price impact</p>
        <p>{priceImpact}</p>
      </div>
    </>
  );
}
