"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addAdmin, getAdmins, removeAdmin, updateAdminPermissions } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Shield, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const ALL_PERMISSIONS = ["manage_tokens", "manage_users", "verify_tokens", "view_analytics"];

export default function ModeratorsPage() {
	const queryClient = useQueryClient();
	const [showAdd, setShowAdd] = useState(false);
	const [showEdit, setShowEdit] = useState<{ address: string; permissions: string[] } | null>(null);
	const [showRemove, setShowRemove] = useState<string | null>(null);

	const { data: admins, isLoading } = useQuery({
		queryKey: ["admins"],
		queryFn: getAdmins,
	});

	// Add admin mutation
	const addAdminMutation = useMutation({
		mutationFn: addAdmin,
		onSuccess: () => {
			toast.success("Admin added");
			setShowAdd(false);
			queryClient.invalidateQueries({ queryKey: ["admins"] });
		},
		onError: (e: any) => toast.error(e.message),
	});

	// Edit permissions mutation
	const editPermissionsMutation = useMutation({
		mutationFn: updateAdminPermissions,
		onSuccess: () => {
			toast.success("Permissions updated");
			setShowEdit(null);
			queryClient.invalidateQueries({ queryKey: ["admins"] });
		},
		onError: (e: any) => toast.error(e.message),
	});

	// Remove admin mutation
	const removeAdminMutation = useMutation({
		mutationFn: removeAdmin,
		onSuccess: () => {
			toast.success("Admin removed");
			setShowRemove(null);
			queryClient.invalidateQueries({ queryKey: ["admins"] });
		},
		onError: (e: any) => toast.error(e.message),
	});

	return (
		<div className="container mx-auto p-6 space-y-6">
			<div className="flex justify-between items-center">
				<h1 className="text-3xl font-bold">Moderators & Admins</h1>
				<Button onClick={() => setShowAdd(true)} className="flex gap-2">
					<UserPlus className="h-4 w-4" /> Add Moderator/Admin
				</Button>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>All Moderators & Admins</CardTitle>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<div>Loading...</div>
					) : (
						<div className="space-y-4">
							{admins?.map((admin: any) => (
								<div key={admin.address} className="flex items-center justify-between border-b py-3">
									<div>
										<div className="flex items-center gap-2">
											<span className="font-mono text-sm">{admin.address}</span>
											<Badge variant={admin.adminRole === "super_admin" ? "default" : "secondary"}>
												{admin.adminRole}
											</Badge>
											{admin.adminRole === "super_admin" && <Shield className="h-4 w-4 text-green-500" />}
										</div>
										<div className="flex gap-2 mt-1 flex-wrap">
											{admin.adminPermissions?.length ? (
												admin.adminPermissions.map((perm: string) => (
													<Badge key={perm} variant="outline">
														{perm}
													</Badge>
												))
											) : (
												<span className="text-xs text-muted-foreground">No permissions</span>
											)}
										</div>
										<div className="text-xs text-muted-foreground mt-1">
											Created: {admin.createdAt ? new Date(admin.createdAt).toLocaleString() : "-"}
											{admin.adminCreatedBy && (
												<span>
													{" "}
													• By: <span className="font-mono">{admin.adminCreatedBy}</span>
												</span>
											)}
										</div>
									</div>
									{admin.adminRole !== "super_admin" && (
										<div className="flex gap-2">
											<Button
												size="sm"
												variant="outline"
												onClick={() => setShowEdit({ address: admin.address, permissions: admin.adminPermissions })}
											>
												<Edit2 className="h-4 w-4 mr-1" /> Edit
											</Button>
											<Button size="sm" variant="destructive" onClick={() => setShowRemove(admin.address)}>
												<Trash2 className="h-4 w-4 mr-1" /> Remove
											</Button>
										</div>
									)}
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			{showAdd && (
				<div
					className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
					onClick={() => setShowAdd(false)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							setShowAdd(false);
						}
					}}
				>
					<div
						className="bg-card p-6 w-full max-w-md space-y-4"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						<h2 className="text-xl font-bold mb-2">Add Moderator/Admin</h2>
						<Input placeholder="Wallet address" id="add-address" className="mb-2" />
						<select id="add-role" className="w-full mb-2 border p-2 bg-zinc-900 text-white focus:border-primary">
							<option value="moderator">Moderator</option>
							<option value="admin">Admin</option>
						</select>
						<div className="mb-2">
							<div className="font-semibold mb-1">Permissions</div>
							<div className="flex flex-wrap gap-2">
								{ALL_PERMISSIONS.map((perm) => (
									<label key={perm} className="flex items-center gap-1 text-xs">
										<input type="checkbox" value={perm} id={`perm-${perm}`} /> {perm}
									</label>
								))}
							</div>
						</div>
						<div className="flex gap-2 justify-end">
							<Button variant="outline" onClick={() => setShowAdd(false)}>
								Cancel
							</Button>
							<Button
								onClick={() => {
									const address = (document.getElementById("add-address") as HTMLInputElement)?.value.trim();
									const role = (document.getElementById("add-role") as HTMLSelectElement)?.value;
									const permissions = ALL_PERMISSIONS.filter(
										(perm) => (document.getElementById(`perm-${perm}`) as HTMLInputElement)?.checked,
									);
									if (!address || !role) {
										toast.error("Address and role required");
										return;
									}
									addAdminMutation.mutate({ address, role, permissions });
								}}
								disabled={addAdminMutation.isPending}
							>
								{addAdminMutation.isPending ? "Adding..." : "Add"}
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* Edit Permissions Modal */}
			{showEdit && (
				<div
					className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
					onClick={() => setShowEdit(null)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							setShowEdit(null);
						}
					}}
				>
					<div
						className="bg-card p-6 w-full max-w-md space-y-4"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						<h2 className="text-xl font-bold mb-2">Edit Permissions</h2>
						<div className="mb-2">
							<div className="font-semibold mb-1">Permissions</div>
							<div className="flex flex-wrap gap-2">
								{ALL_PERMISSIONS.map((perm) => (
									<label key={perm} className="flex items-center gap-1 text-xs">
										<input
											type="checkbox"
											value={perm}
											id={`edit-perm-${perm}`}
											defaultChecked={showEdit.permissions.includes(perm)}
										/>
										{perm}
									</label>
								))}
							</div>
						</div>
						<div className="flex gap-2 justify-end">
							<Button
								variant="outline"
								onClick={(e) => {
									e.stopPropagation();
									setShowEdit(null);
								}}
							>
								Cancel
							</Button>
							<Button
								onClick={(e) => {
									e.stopPropagation();
									const permissions = ALL_PERMISSIONS.filter(
										(perm) => (document.getElementById(`edit-perm-${perm}`) as HTMLInputElement)?.checked,
									);
									editPermissionsMutation.mutate({ address: showEdit.address, permissions });
								}}
								disabled={editPermissionsMutation.isPending}
							>
								{editPermissionsMutation.isPending ? "Saving..." : "Save"}
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* Remove Modal */}
			{showRemove && (
				<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
					<div className="bg-card p-6 w-full max-w-md space-y-4">
						<h2 className="text-xl font-bold mb-2">Remove Moderator/Admin</h2>
						<p>
							Are you sure you want to remove <span className="font-mono">{showRemove}</span>?
						</p>
						<div className="flex gap-2 justify-end">
							<Button variant="outline" onClick={() => setShowRemove(null)}>
								Cancel
							</Button>
							<Button
								variant="destructive"
								onClick={() => removeAdminMutation.mutate(showRemove)}
								disabled={removeAdminMutation.isPending}
							>
								{removeAdminMutation.isPending ? "Removing..." : "Remove"}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
