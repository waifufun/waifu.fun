"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Link from "next/link";
interface User {
	address: string;
	displayName?: string;
	adminRole?: "super_admin" | "admin" | null;
	suspended: boolean;
	points?: number;
	createdAt?: string;
}

// API helpers
import { getAdminUsers, suspendUser } from "@/lib/api";

export default function AdminUsersPage() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);

	const { data, isLoading } = useQuery({
		queryKey: ["admin-users", search, page],
		queryFn: () => getAdminUsers({ search, page }),
	});

	const suspendMutation = useMutation({
		mutationFn: suspendUser,
		onSuccess: () => {
			toast.success("User status updated");
			queryClient.invalidateQueries({ queryKey: ["admin-users"] });
		},
		onError: (e: any) => toast.error(e.message),
	});

	return (
		<div className="container mx-auto p-6 space-y-6">
			<div className="flex justify-between items-center">
				<h1 className="text-3xl font-bold">Users</h1>
				<Input
					placeholder="Search by address or name..."
					value={search}
					onChange={(e) => {
						setSearch(e.target.value);
						setPage(1);
					}}
					className="w-64"
				/>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>User List</CardTitle>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<div>Loading...</div>
					) : (
						<div className="space-y-4">
							{data?.users?.map((user: User) => (
								<div key={user.address} className="flex items-center justify-between border-b py-3">
									<div>
										<div className="flex items-center gap-2">
											<Link href={`/admin/users/${user.address}`} className="font-mono text-sm hover:underline">
												{user.address}
											</Link>
											{user.displayName && <span className="text-xs text-muted-foreground">{user.displayName}</span>}
											{user.adminRole && (
												<Badge variant={user.adminRole === "super_admin" ? "default" : "secondary"}>
													{user.adminRole}
												</Badge>
											)}
											{user.suspended && <Badge variant="destructive">Suspended</Badge>}
										</div>
										<div className="flex gap-2 mt-1 flex-wrap">
											<span className="text-xs text-muted-foreground">Points: {user.points ?? 0}</span>
											<span className="text-xs text-muted-foreground">
												Created: {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}
											</span>
										</div>
									</div>
									<div className="flex gap-2">
										<Button
											size="sm"
											variant={user.suspended ? "default" : "outline"}
											onClick={() => suspendMutation.mutate({ address: user.address, suspended: !user.suspended })}
											disabled={suspendMutation.isPending}
										>
											{user.suspended ? "Unsuspend" : "Suspend"}
										</Button>
									</div>
								</div>
							))}
						</div>
					)}
					{/* Pagination */}
					{data && data.totalPages > 1 && (
						<div className="flex justify-center gap-2 mt-6">
							<Button variant="outline" onClick={() => setPage(page - 1)} disabled={page === 1}>
								Previous
							</Button>
							<span className="flex items-center px-4">
								Page {page} of {data.totalPages}
							</span>
							<Button variant="outline" onClick={() => setPage(page + 1)} disabled={page === data.totalPages}>
								Next
							</Button>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
