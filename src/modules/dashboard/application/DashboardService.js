export default class DashboardService {
  constructor(dashboardRepo) {
    this.dashboardRepo = dashboardRepo;
  }

  async getStats(therapistId) {
    const [stats, recentPatients, emotionTrend] = await Promise.all([
      this.dashboardRepo.getStats(therapistId),
      this.dashboardRepo.getRecentPatients(therapistId),
      this.dashboardRepo.getEmotionTrend(therapistId),
    ]);

    return {
      totalPatients: stats.total_patients,
      pendingInterviews: stats.pending_interviews,
      highRiskCases: stats.high_risk_cases,
      completedThisWeek: stats.completed_this_week,
      recentPatients: recentPatients.map((p) => ({
        id: p.id,
        name: p.name,
        risk: p.risk ? p.risk.charAt(0).toUpperCase() + p.risk.slice(1) : "N/A",
        status: p.status,
        lastInterview: p.last_interview
          ? new Date(p.last_interview).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "N/A",
      })),
      riskOverview: {
        high: stats.risk_high,
        moderate: stats.risk_moderate,
        low: stats.risk_low,
      },
      emotionTrend: {
        happy: emotionTrend.happy,
        sad: emotionTrend.sad,
        angry: emotionTrend.angry,
      },
    };
  }
}
