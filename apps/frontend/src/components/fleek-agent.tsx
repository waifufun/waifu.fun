import type { IAgent } from "@autofun/types";
import Image from "next/image";

export default function FleekAgent({ agents }: { agents: IAgent[] }) {
  if (!agents || agents.length === 0) return <p>No agents found</p>;

  return (
    <>
      {agents.map((agent, _) => (
        <div
          key={_}
          className="w-full group rounded-lg place-self-center bg-[#0C0C0C] relative flex items-center h-[150px] p-4 mb-4"
        >
          {agent.avatar && (
            <Image
              src={agent.avatar}
              height={150}
              width={150}
              alt={`${agent.name} Agent Avatar Image`}
              className="rounded-md"
            />
          )}
          <div className="flex flex-col justify-start h-[150px] ml-4 gap-y-1">
            <p className="text-autofun-background-action-highlight text-xl mb-1 font-semibold">
              {agent.name}
            </p>
            <div className="flex items-center gap-1">
              <p className="text-base text-white leading-none font-semibold">
                Created by {agent.createdBy}
              </p>
            </div>
            <div className="flex items-center gap-1 mt-4">
              <p className="text-base text-autofun-stroke-light leading-none font-semibold">
                {agent.bio ? agent.bio : "No bio provided"}
              </p>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
