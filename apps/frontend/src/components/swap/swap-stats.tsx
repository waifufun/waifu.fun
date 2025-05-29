export default function SwapStats({ minReceived, priceImpact }: {minReceived: string, priceImpact: string}) {

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
