import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LogAdInteractionDto, AdInteractionType } from './dto/log-ad-interaction.dto';

@Injectable()
export class AdMetricsService {
    private readonly logger = new Logger(AdMetricsService.name);

    constructor(private prisma: PrismaService) { }

    async logInteraction(logData: LogAdInteractionDto, prismaTransaction?: any) {
        const prismaClient = prismaTransaction || this.prisma;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        try {
            // Check if we already have metrics for today
            const existingMetrics = await prismaClient.adMetrics.findUnique({
                where: {
                    advertisementId_date: {
                        advertisementId: logData.advertisementId,
                        date: today
                    }
                }
            });

            if (existingMetrics) {
                // Update existing metrics
                const updateData: any = {};

                switch (logData.interactionType) {
                    case AdInteractionType.IMPRESSION:
                        updateData.impressions = { increment: 1 };
                        break;
                    case AdInteractionType.CLICK:
                        updateData.clicks = { increment: 1 };
                        // Update CTR when clicks are incremented
                        updateData.ctr = (existingMetrics.clicks + 1) /
                            (existingMetrics.impressions > 0 ? existingMetrics.impressions : 1);
                        break;
                    case AdInteractionType.CONVERSION:
                        updateData.conversions = { increment: 1 };
                        break;
                }

                // Add cost if provided in metadata
                if (logData.metadata?.cost) {
                    updateData.cost = { increment: logData.metadata.cost };

                    // Calculate ROI if revenue exists
                    if (existingMetrics.revenue) {
                        const newCost = existingMetrics.cost + logData.metadata.cost;
                        updateData.roi = (existingMetrics.revenue / newCost) - 1;
                    }
                }

                // Add revenue if conversion provided a value
                if (logData.interactionType === AdInteractionType.CONVERSION && logData.metadata?.value) {
                    updateData.revenue = { increment: logData.metadata.value };

                    // Update ROI
                    const newRevenue = existingMetrics.revenue + logData.metadata.value;
                    const currentCost = existingMetrics.cost || 0;
                    if (currentCost > 0) {
                        updateData.roi = (newRevenue / currentCost) - 1;
                    }
                }

                // Store demographic data if provided
                if (logData.metadata?.demographics) {
                    if (!existingMetrics.demographics) {
                        updateData.demographics = logData.metadata.demographics;
                    } else {
                        // Merge demographic data
                        updateData.demographics = this.mergeDemographics(
                            existingMetrics.demographics as any,
                            logData.metadata.demographics
                        );
                    }
                }

                await prismaClient.adMetrics.update({
                    where: {
                        advertisementId_date: {
                            advertisementId: logData.advertisementId,
                            date: today
                        }
                    },
                    data: updateData
                });
            } else {
                // Create new metrics for today
                const newMetrics: any = {
                    advertisementId: logData.advertisementId,
                    date: today,
                    impressions: logData.interactionType === AdInteractionType.IMPRESSION ? 1 : 0,
                    clicks: logData.interactionType === AdInteractionType.CLICK ? 1 : 0,
                    conversions: logData.interactionType === AdInteractionType.CONVERSION ? 1 : 0,
                };

                // Add CTR if there was a click
                if (logData.interactionType === AdInteractionType.CLICK) {
                    newMetrics.ctr = 1; // First click = 100% CTR initially
                }

                // Add cost if provided in metadata
                if (logData.metadata?.cost) {
                    newMetrics.cost = logData.metadata.cost;
                }

                // Add revenue if conversion provided a value
                if (logData.interactionType === AdInteractionType.CONVERSION && logData.metadata?.value) {
                    newMetrics.revenue = logData.metadata.value;

                    // Calculate ROI if cost exists
                    if (newMetrics.cost && newMetrics.cost > 0) {
                        newMetrics.roi = (newMetrics.revenue / newMetrics.cost) - 1;
                    }
                }

                // Store demographic data if provided
                if (logData.metadata?.demographics) {
                    newMetrics.demographics = logData.metadata.demographics;
                }

                // Store custom metrics if provided
                if (logData.metadata?.customMetrics) {
                    newMetrics.customMetrics = logData.metadata.customMetrics;
                }

                await prismaClient.adMetrics.create({
                    data: newMetrics
                });
            }

            return { success: true };
        } catch (error) {
            this.logger.error(`Error logging ad metrics: ${error.message}`, error.stack);
            throw error;
        }
    }

    private mergeDemographics(existing: any, newData: any): any {
        const result = { ...existing };

        // Example of merging age groups
        if (newData.ageGroups) {
            if (!result.ageGroups) {
                result.ageGroups = {};
            }

            for (const [ageGroup, count] of Object.entries(newData.ageGroups)) {
                result.ageGroups[ageGroup] = (result.ageGroups[ageGroup] || 0) + (count as number);
            }
        }

        // Example of merging gender data
        if (newData.genders) {
            if (!result.genders) {
                result.genders = {};
            }

            for (const [gender, count] of Object.entries(newData.genders)) {
                result.genders[gender] = (result.genders[gender] || 0) + (count as number);
            }
        }

        // Example of merging locations
        if (newData.locations) {
            if (!result.locations) {
                result.locations = {};
            }

            for (const [location, count] of Object.entries(newData.locations)) {
                result.locations[location] = (result.locations[location] || 0) + (count as number);
            }
        }

        return result;
    }

    async getPerformanceSummary(advertisementId: string) {
        try {
            // Get the advertisement
            const ad = await this.prisma.advertisement.findUnique({
                where: { id: advertisementId }
            });

            if (!ad) {
                throw new Error(`Advertisement with ID ${advertisementId} not found`);
            }

            // Get metrics for the last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            thirtyDaysAgo.setHours(0, 0, 0, 0);

            const metrics = await this.prisma.adMetrics.findMany({
                where: {
                    advertisementId,
                    date: { gte: thirtyDaysAgo }
                },
                orderBy: {
                    date: 'asc'
                }
            });

            // Calculate overall performance
            const totalImpressions = metrics.reduce((sum, metric) => sum + metric.impressions, 0);
            const totalClicks = metrics.reduce((sum, metric) => sum + metric.clicks, 0);
            const totalConversions = metrics.reduce((sum, metric) => sum + metric.conversions, 0);
            const totalRevenue = metrics.reduce((sum, metric) => sum + (metric.revenue || 0), 0);
            const totalCost = metrics.reduce((sum, metric) => sum + (metric.cost || 0), 0);

            // Calculate derived metrics
            const overallCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
            const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;
            const cpc = totalClicks > 0 ? totalCost / totalClicks : 0;
            const cpm = totalImpressions > 0 ? (totalCost / totalImpressions) * 1000 : 0;
            const roi = totalCost > 0 ? ((totalRevenue / totalCost) - 1) * 100 : 0;

            // Calculate daily averages
            const uniqueDays = new Set(metrics.map(m => m.date.toISOString().split('T')[0])).size;
            const avgDailyImpressions = uniqueDays > 0 ? totalImpressions / uniqueDays : 0;
            const avgDailyClicks = uniqueDays > 0 ? totalClicks / uniqueDays : 0;
            const avgDailyConversions = uniqueDays > 0 ? totalConversions / uniqueDays : 0;

            // Calculate trend (comparing last 7 days to previous 7 days)
            const last7Days = metrics.filter(m => {
                const date = new Date(m.date);
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                sevenDaysAgo.setHours(0, 0, 0, 0);
                return date >= sevenDaysAgo;
            });

            const previous7Days = metrics.filter(m => {
                const date = new Date(m.date);
                const fourteenDaysAgo = new Date();
                fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
                fourteenDaysAgo.setHours(0, 0, 0, 0);
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                sevenDaysAgo.setHours(0, 0, 0, 0);
                return date >= fourteenDaysAgo && date < sevenDaysAgo;
            });

            const last7DaysImpressions = last7Days.reduce((sum, metric) => sum + metric.impressions, 0);
            const last7DaysClicks = last7Days.reduce((sum, metric) => sum + metric.clicks, 0);
            const previous7DaysImpressions = previous7Days.reduce((sum, metric) => sum + metric.impressions, 0);
            const previous7DaysClicks = previous7Days.reduce((sum, metric) => sum + metric.clicks, 0);

            const impressionsTrend = previous7DaysImpressions > 0
                ? ((last7DaysImpressions - previous7DaysImpressions) / previous7DaysImpressions) * 100
                : 0;

            const clicksTrend = previous7DaysClicks > 0
                ? ((last7DaysClicks - previous7DaysClicks) / previous7DaysClicks) * 100
                : 0;

            // Aggregate demographic data if available
            const demographics = this.aggregateDemographics(metrics);

            // Format the data into daily series for charts
            const dailyData = this.formatDailyData(metrics);

            return {
                summary: {
                    totalImpressions,
                    totalClicks,
                    totalConversions,
                    totalRevenue,
                    totalCost,
                    overallCTR,
                    conversionRate,
                    cpc,
                    cpm,
                    roi
                },
                averages: {
                    impressions: avgDailyImpressions,
                    clicks: avgDailyClicks,
                    conversions: avgDailyConversions
                },
                trends: {
                    impressions: impressionsTrend,
                    clicks: clicksTrend
                },
                demographics,
                dailyData,
                reachedLimits: {
                    budget: ad.budget !== null && ad.budget <= 0,
                    impressions: ad.maxImpressions !== null && ad.impressions >= ad.maxImpressions,
                    clicks: ad.maxClicks !== null && ad.clicks >= ad.maxClicks
                }
            };
        } catch (error) {
            this.logger.error(`Error getting performance summary: ${error.message}`, error.stack);
            throw error;
        }
    }

    private aggregateDemographics(metrics: any[]): any {
        const result = {
            ageGroups: {},
            genders: {},
            locations: {},
            devices: {}
        };

        for (const metric of metrics) {
            if (!metric.demographics) continue;

            // Aggregate age groups
            if (metric.demographics.ageGroups) {
                for (const [ageGroup, count] of Object.entries(metric.demographics.ageGroups)) {
                    result.ageGroups[ageGroup] = (result.ageGroups[ageGroup] || 0) + (count as number);
                }
            }

            // Aggregate genders
            if (metric.demographics.genders) {
                for (const [gender, count] of Object.entries(metric.demographics.genders)) {
                    result.genders[gender] = (result.genders[gender] || 0) + (count as number);
                }
            }

            // Aggregate locations
            if (metric.demographics.locations) {
                for (const [location, count] of Object.entries(metric.demographics.locations)) {
                    result.locations[location] = (result.locations[location] || 0) + (count as number);
                }
            }

            // Aggregate devices
            if (metric.demographics.devices) {
                for (const [device, count] of Object.entries(metric.demographics.devices)) {
                    result.devices[device] = (result.devices[device] || 0) + (count as number);
                }
            }
        }

        return result;
    }

    private formatDailyData(metrics: any[]): any[] {
        const dailyMap = new Map();

        // Group metrics by date
        for (const metric of metrics) {
            const dateStr = metric.date.toISOString().split('T')[0];
            dailyMap.set(dateStr, {
                date: dateStr,
                impressions: metric.impressions,
                clicks: metric.clicks,
                conversions: metric.conversions,
                revenue: metric.revenue || 0,
                cost: metric.cost || 0,
                ctr: metric.ctr || 0
            });
        }

        // Sort by date
        return Array.from(dailyMap.values()).sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );
    }

    async getAdCampaignComparison(adIds: string[]) {
        try {
            const adsData = await Promise.all(adIds.map(async (id) => {
                const performance = await this.getPerformanceSummary(id);
                const ad = await this.prisma.advertisement.findUnique({
                    where: { id },
                    select: {
                        id: true,
                        title: true,
                        type: true,
                        status: true,
                        startDate: true,
                        endDate: true
                    }
                });

                return {
                    ...ad,
                    performance: performance.summary
                };
            }));

            return {
                ads: adsData,
                comparison: {
                    bestPerformer: this.determineBestPerformer(adsData),
                    metrics: this.compareMetrics(adsData)
                }
            };
        } catch (error) {
            this.logger.error(`Error comparing ad campaigns: ${error.message}`, error.stack);
            throw error;
        }
    }

    private determineBestPerformer(adsData: any[]): any {
        if (adsData.length === 0) return null;

        // Default to highest CTR as best performer
        let bestPerformer = adsData[0];

        for (const ad of adsData) {
            if (ad.performance.overallCTR > bestPerformer.performance.overallCTR) {
                bestPerformer = ad;
            }
        }

        return {
            adId: bestPerformer.id,
            title: bestPerformer.title,
            ctr: bestPerformer.performance.overallCTR,
            conversionRate: bestPerformer.performance.conversionRate,
            roi: bestPerformer.performance.roi
        };
    }

    private compareMetrics(adsData: any[]): any {
        // Calculate averages
        const metricKeys = ['overallCTR', 'conversionRate', 'cpc', 'cpm', 'roi'];
        const averages = {};

        for (const key of metricKeys) {
            averages[key] = adsData.reduce((sum, ad) => sum + ad.performance[key], 0) / adsData.length;
        }

        // Calculate relative performance for each ad
        const comparisonData = adsData.map(ad => {
            const relativePerformance = {};

            for (const key of metricKeys) {
                // Calculate percentage difference from average
                relativePerformance[key] = averages[key] > 0
                    ? ((ad.performance[key] - averages[key]) / averages[key]) * 100
                    : 0;
            }

            return {
                adId: ad.id,
                title: ad.title,
                metrics: ad.performance,
                relativePerformance
            };
        });

        return {
            averages,
            adComparisons: comparisonData
        };
    }

    async generateInsights(advertisementId: string) {
        try {
            const performance = await this.getPerformanceSummary(advertisementId);
            const insights = [];

            // Check CTR performance
            if (performance.summary.overallCTR < 0.5) {
                insights.push({
                    type: 'improvement',
                    severity: 'high',
                    message: 'Click-through rate is below industry average (0.5%)',
                    recommendation: 'Consider updating ad creative or targeting parameters'
                });
            } else if (performance.summary.overallCTR > 2) {
                insights.push({
                    type: 'positive',
                    severity: 'low',
                    message: 'Click-through rate is exceptionally good',
                    recommendation: 'Consider increasing budget to capitalize on performance'
                });
            }

            // Check conversion rate
            if (performance.summary.conversionRate < 1) {
                insights.push({
                    type: 'improvement',
                    severity: 'medium',
                    message: 'Conversion rate is below expectations',
                    recommendation: 'Review landing page or offer to improve conversions'
                });
            }

            // Check ROI
            if (performance.summary.roi < 0) {
                insights.push({
                    type: 'alert',
                    severity: 'high',
                    message: 'Campaign is not generating positive ROI',
                    recommendation: 'Review ad spend and targeting to improve efficiency'
                });
            }

            // Check trends
            if (performance.trends.impressions < -10) {
                insights.push({
                    type: 'warning',
                    severity: 'medium',
                    message: 'Impressions have dropped by more than 10% in the last week',
                    recommendation: 'Check for changes in competition or seasonality factors'
                });
            }

            if (performance.trends.clicks < -10) {
                insights.push({
                    type: 'warning',
                    severity: 'medium',
                    message: 'Clicks have dropped by more than 10% in the last week',
                    recommendation: 'Review ad creative and messaging for potential fatigue'
                });
            }

            // Add demographic insights if available
            if (performance.demographics) {
                // Find top performing demographic groups
                const topDemographic = this.findTopPerformingDemographic(performance.demographics);
                if (topDemographic) {
                    insights.push({
                        type: 'opportunity',
                        severity: 'medium',
                        message: `Strongest engagement from ${topDemographic.type}: ${topDemographic.value}`,
                        recommendation: 'Consider focusing budget on this demographic segment'
                    });
                }
            }

            return {
                insights,
                recommendedActions: this.generateRecommendedActions(performance, insights)
            };
        } catch (error) {
            this.logger.error(`Error generating insights: ${error.message}`, error.stack);
            throw error;
        }
    }

    private findTopPerformingDemographic(demographics): any {
        let topType = null;
        let topValue = null;
        let topCount = 0;

        // Check age groups
        if (demographics.ageGroups) {
            for (const [ageGroup, count] of Object.entries(demographics.ageGroups)) {
                if (count as number > topCount) {
                    topType = 'age group';
                    topValue = ageGroup;
                    topCount = count as number;
                }
            }
        }

        // Check genders
        if (demographics.genders) {
            for (const [gender, count] of Object.entries(demographics.genders)) {
                if (count as number > topCount) {
                    topType = 'gender';
                    topValue = gender;
                    topCount = count as number;
                }
            }
        }

        // Check locations
        if (demographics.locations) {
            for (const [location, count] of Object.entries(demographics.locations)) {
                if (count as number > topCount) {
                    topType = 'location';
                    topValue = location;
                    topCount = count as number;
                }
            }
        }

        return topType ? { type: topType, value: topValue } : null;
    }

    private generateRecommendedActions(performance, insights): string[] {
        const actions = [];

        // Budget recommendations
        if (performance.summary.roi > 20) {
            actions.push('Increase campaign budget to capitalize on strong performance');
        } else if (performance.summary.roi < 0) {
            actions.push('Reduce budget or pause campaign until performance improves');
        }

        // Creative recommendations
        if (performance.summary.overallCTR < 0.5) {
            actions.push('Update ad creative with stronger imagery and call-to-action');
        }

        // Targeting recommendations
        if (performance.demographics) {
            const topDemographic = this.findTopPerformingDemographic(performance.demographics);
            if (topDemographic) {
                actions.push(`Refine targeting to focus on ${topDemographic.type}: ${topDemographic.value}`);
            }
        }

        // Schedule recommendations
        if (performance.dailyData && performance.dailyData.length > 0) {
            // Find the day with the best performance
            const bestDay = this.findBestPerformingDay(performance.dailyData);
            if (bestDay) {
                actions.push(`Optimize ad schedule to focus on ${bestDay.day} which has the highest engagement`);
            }
        }

        return actions;
    }

    private findBestPerformingDay(dailyData): any {
        // Group by day of week
        const dayPerformance = {
            'Sunday': { clicks: 0, impressions: 0 },
            'Monday': { clicks: 0, impressions: 0 },
            'Tuesday': { clicks: 0, impressions: 0 },
            'Wednesday': { clicks: 0, impressions: 0 },
            'Thursday': { clicks: 0, impressions: 0 },
            'Friday': { clicks: 0, impressions: 0 },
            'Saturday': { clicks: 0, impressions: 0 }
        };

        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        for (const data of dailyData) {
            const date = new Date(data.date);
            const dayOfWeek = days[date.getDay()];

            dayPerformance[dayOfWeek].clicks += data.clicks;
            dayPerformance[dayOfWeek].impressions += data.impressions;
        }

        // Calculate CTR for each day
        let bestDay = null;
        let bestCTR = 0;

        for (const [day, data] of Object.entries(dayPerformance)) {
            if (data.impressions > 0) {
                const ctr = (data.clicks / data.impressions) * 100;
                if (ctr > bestCTR) {
                    bestCTR = ctr;
                    bestDay = day;
                }
            }
        }

        return bestDay ? { day: bestDay, ctr: bestCTR } : null;
    }
}