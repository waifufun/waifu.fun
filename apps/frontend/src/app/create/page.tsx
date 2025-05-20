import TokenTypeSelector from "@/components/create-token-page/token-type-selector"

export default function CreateTokenPage() {
    return (
        <div className="flex justify-center px-40">
            <div className="flex flex-col items-center mt-5 w-full">
                <div>
                    <img src="/create/coin-machine.png"/>
                </div>
                <TokenTypeSelector selected="auto"/>
            </div>
        </div>
    )
}