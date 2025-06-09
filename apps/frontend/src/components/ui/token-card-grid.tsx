import { Star } from "lucide-react";

enum TokenActivity {
    IsNew = 'is-new',
    QuickHit = 'quick-hit',
    BondingSoon = 'bonding-soon',
    Imported = 'imported',
    Featured = 'featured',
}


function CardContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {children}
    </div>
  );
}

const FeaturedActivity = () => {
  return (
      <div className="bg-[#03FF24] text-black font-bold border border-black py-1 px-2.5 text-xs rounded-none shadow-[3px_3px_0px_#01a718] inline-block">
          <Star/>
          <p>FEATURED</p>
      </div>
  )
}

export function TokenCardGrid({
    activity,
}: {
    activity?: TokenActivity;
}) {
    return (
        <CardContainer>
            <FeaturedActivity/>
        </CardContainer>
    );
    }