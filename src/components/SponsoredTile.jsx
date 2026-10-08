import { ExternalLink } from "lucide-react";

export default function SponsoredTile() {
  return (
    <div className="relative flex h-24 flex-col items-center justify-center overflow-hidden rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/20 via-[#151c28] to-amber-500/20 p-2 text-center sm:h-32 md:h-36">
      <span className="absolute left-1.5 top-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-amber-400 px-1.5 py-0.5 text-[8px] font-black text-black">
        #SPONSORED
      </span>
      <ExternalLink className="absolute right-1.5 top-1.5 h-3 w-3 text-cyan-300" />
      <p className="text-[10px] font-extrabold text-cyan-200">Promoted Slot</p>
      <p className="text-[8px] text-gray-400">Your ad in the live grid</p>
    </div>
  );
}