import { useQuery } from "@tanstack/react-query";
import { getAdminStatus } from "@/lib/api";

export function useAdmin() {
	const { data: adminStatus, isLoading } = useQuery({
		queryKey: ["admin-status"],
		queryFn: getAdminStatus,
		refetchInterval: 30000, // Refresh every 30 seconds
	});

	const isAdmin = adminStatus?.isAdmin || false;
	const adminInfo = adminStatus?.adminInfo || null;

	return {
		isAdmin,
		adminInfo,
		isLoading,
	};
} 