"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TimelineFormProps {
	formData: {
		startDate: string;
		endDate: string;
	};
	onInputChangeAction: (formData: FormData) => void;
}

export default function TimelineForm({ formData, onInputChangeAction }: TimelineFormProps) {
	return (
		<Card className="bg-black border-[#03FF24]/20">
			<CardHeader>
				<CardTitle className="text-[#03FF24]">Timeline</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<Label htmlFor="startDate" className="text-white">
							Start Date
						</Label>
						<Input
							id="startDate"
							type="datetime-local"
							value={formData.startDate}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "startDate");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
						/>
					</div>
					<div>
						<Label htmlFor="endDate" className="text-white">
							End Date
						</Label>
						<Input
							id="endDate"
							type="datetime-local"
							value={formData.endDate}
							onChange={(e) => {
								const formData = new FormData();
								formData.append("field", "endDate");
								formData.append("value", e.target.value);
								onInputChangeAction(formData);
							}}
							className="bg-black border-[#03FF24]/20 text-white"
						/>
					</div>
				</div>

			</CardContent>
		</Card>
	);
} 