export function calculateStreak(dates: string[]): { streakPoints: number } {
	// Requires at least 2 days to begin counting a streak
	if (dates.length < 2) return { streakPoints: 0 };

	const pointsPerDay = [10, 20, 30, 40, 50, 60, 70];
	let streak = 1;
	let maxStreak = 1;

	for (let i = 1; i < dates.length; i++) {
		const previousDate = dates[i - 1];
		const currentDate = dates[i];
		if (!previousDate || !currentDate) {
			continue;
		}

		const prev = new Date(previousDate);
		const curr = new Date(currentDate);
		const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

		if (diffDays === 1) {
			streak++;
			maxStreak = Math.max(maxStreak, streak);
		} else {
			streak = 1;
		}
	}

	if (maxStreak < 2) return { streakPoints: 0 };

	const limitedStreak = Math.min(maxStreak, 7);
	const streakPoints = pointsPerDay.slice(0, limitedStreak).reduce((a, b) => a + b, 0);
	return { streakPoints };
}
