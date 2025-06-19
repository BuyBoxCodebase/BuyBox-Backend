import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdvertisementDto } from './dto/create-ad.dto';
import { UpdateAdvertisementDto } from './dto/update-ad.dto';
import { AdQueryDto } from './dto/ad-query.dto';
import { LogAdInteractionDto, AdInteractionType } from './dto/log-ad-interaction.dto';
import { AdStatus, AdType, AdPlacement, AdTargetType, Customer } from '@prisma/client';
import { AdMetricsService } from './ads-metrics.service';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
// import { CacheService } from '../cache/cache.service';
import { SchedulerService } from '../scheduler/scheduler.service';

@Injectable()
export class AdsService {
    private readonly logger = new Logger(AdsService.name);

    constructor(
        private prisma: PrismaService,
        private readonly cloudinaryService: CloudinaryService,
        private adMetricsService: AdMetricsService,
        // private cacheService: CacheService,
        private schedulerService: SchedulerService,
    ) {
        const now = new Date();
        const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);

        this.schedulerService.scheduleJob(nextMidnight, () => {
            this.processScheduledAds();

            const now = new Date();
            const subsequentMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
            this.schedulerService.scheduleJob(subsequentMidnight, () => this.processScheduledAds());
        });
    }

    async uploadAdMedia(files: Array<Express.Multer.File>) {
        try {
            const images = (await this.cloudinaryService.uploadImages(files));
            return images.map((image) => ({
                publicId: image.public_id,
                url: image.url,
                format: image.format,
                width: image.width,
                height: image.height,
                resourceType: image.resource_type,
            }));
        } catch (error) {
            this.logger.error(`Failed to upload ad media: ${error.message}`, error.stack);
            throw new BadRequestException('Failed to upload media files');
        }
    }

    async create(createAdDto: CreateAdvertisementDto, adminId: string) {
        // Validate dates
        if (createAdDto.endDate && new Date(createAdDto.endDate) <= new Date(createAdDto.startDate)) {
            throw new BadRequestException('End date must be after start date');
        }

        // Validate content structure based on ad type
        this.validateAdContent(createAdDto.type, createAdDto.content);

        // Validate budget for paid ads
        if (createAdDto.budget && createAdDto.budget <= 0) {
            throw new BadRequestException('Budget must be a positive value');
        }

        try {
            // Create the advertisement
            const newAd = await this.prisma.advertisement.create({
                data: {
                    ...createAdDto,
                    createdById: adminId,
                },
            });

            // Schedule ad activation if status is SCHEDULED
            if (newAd.status === AdStatus.SCHEDULED) {
                const now = new Date();
                const startDate = new Date(newAd.startDate);

                if (startDate > now) {
                    this.schedulerService.scheduleJob(startDate, () =>
                        this.activateScheduledAd(newAd.id));
                }
            }

            return newAd;
        } catch (error) {
            this.logger.error(`Failed to create advertisement: ${error.message}`, error.stack);
            throw new BadRequestException('Failed to create advertisement');
        }
    }

    private validateAdContent(type: AdType, content: Record<string, any>) {
        switch (type) {
            case AdType.BANNER:
                if (!content.imageUrl) {
                    throw new BadRequestException('Banner ads require an imageUrl in content');
                }
                break;
            case AdType.CAROUSEL:
                if (!Array.isArray(content.slides) || content.slides.length < 2) {
                    throw new BadRequestException('Carousel ads require at least 2 slides');
                }
                break;
            case AdType.POPUP:
                if (!content.title || !content.body) {
                    throw new BadRequestException('Popup ads require title and body in content');
                }
                break;
            // Add validations for other ad types
        }
    }

    async findAll(query: AdQueryDto) {
        try {
            const where: any = {};

            // Build where clause from query params
            if (query.type) where.type = query.type;
            if (query.placement) where.placement = query.placement;
            if (query.status) where.status = query.status;
            if (query.targetType) where.targetType = query.targetType;
            if (query.productId) where.productId = query.productId;
            if (query.categoryId) where.categoryId = query.categoryId;
            if (query.brandId) where.brandId = query.brandId;
            if (query.isAbTest !== undefined) where.isAbTest = query.isAbTest;

            // Enhanced date filtering
            if (query.activeFrom || query.activeTo) {
                where.AND = [];

                if (query.activeFrom) {
                    where.AND.push({
                        OR: [
                            { startDate: { lte: query.activeFrom } },
                            { status: AdStatus.ACTIVE }
                        ]
                    });
                }

                if (query.activeTo) {
                    where.AND.push({
                        OR: [
                            { endDate: { gte: query.activeTo } },
                            { endDate: null },
                        ],
                    });
                }
            }

            // Generate cache key based on query parameters
            const cacheKey = `ads_query_${JSON.stringify(query)}`;

            // Try to get from cache first
            // const cachedResult = await this.cacheService.get(cacheKey);
            // if (cachedResult) {
            //     return cachedResult;
            // }

            const ads = await this.prisma.advertisement.findMany({
                where,
                include: {
                    product: {
                        select: { id: true, name: true, images: true, basePrice: true }
                    },
                    category: {
                        select: { id: true, name: true }
                    },
                    brand: {
                        select: { id: true, name: true, brandPic: true }
                    },
                    metrics: {
                        take: 7,
                        orderBy: { date: 'desc' }
                    }
                },
                orderBy: [
                    { priority: 'desc' },
                    { updatedAt: 'desc' }
                ],
            });

            // Calculate performance metrics for each ad
            const adsWithPerformance = await Promise.all(ads.map(async (ad) => {
                const performanceSummary = await this.adMetricsService.getPerformanceSummary(ad.id);
                return {
                    ...ad,
                    performance: performanceSummary
                };
            }));

            // Cache the result for 5 minutes
            // await this.cacheService.set(cacheKey, adsWithPerformance, 300);

            return adsWithPerformance;
        } catch (error) {
            this.logger.error(`Error finding ads: ${error.message}`, error.stack);
            throw error;
        }
    }

    async findActive(placement: AdPlacement, userId?: string, userContext?: any) {
        const now = new Date();
        const cacheKey = `active_ads_${placement}_${userId || 'anonymous'}`;

        // Try to get from cache first
        // const cachedResult = await this.cacheService.get(cacheKey);
        // if (cachedResult) {
        //     return cachedResult;
        // }

        // Basic query to find active ads for the specified placement
        const query: any = {
            status: AdStatus.ACTIVE,
            placement,
            startDate: { lte: now },
            OR: [
                { endDate: { gte: now } },
                { endDate: null },
            ],
        };

        let user: Partial<Customer & {
            _count: {
                orders: number;
            }
        }> = null;

        // If we have a userId, we can add targeting conditions
        if (userId) {
            // Get user details for targeting
            user = await this.prisma.customer.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    interests: true,
                    createdAt: true,
                    updatedAt: true,
                    // city: true,
                    // country: true,
                    // orderCount: true,
                    _count: {
                        select: {
                            orders: true
                        }
                    }
                    // Add other fields needed for targeting
                },
            });
        }

        // Advanced targeting logic based on user and context
        if (user) {
            const isNewUser = this.isNewUser(user.createdAt);
            const isReturningUser = !isNewUser && user._count.orders > 0;

            query.OR = [
                { targetType: AdTargetType.ALL_USERS },
                ...(isNewUser ? [{ targetType: AdTargetType.NEW_USERS }] : []),
                ...(isReturningUser ? [{ targetType: AdTargetType.RETURNING_USERS }] : []),

                // Interest-based targeting
                ...(user.interests?.length > 0 ? [{
                    targetType: AdTargetType.INTEREST_BASED,
                    targetConfig: {
                        path: ['interests'],
                        array_contains: user.interests,
                    }
                }] : []),

                // Location-based targeting
                // ...(user.city || user.country ? [{
                //     targetType: AdTargetType.LOCATION_BASED,
                //     targetConfig: {
                //         OR: [
                //             ...(user.city ? [{ path: ['locations', 'cities'], array_contains: user.city }] : []),
                //             ...(user.country ? [{ path: ['locations', 'countries'], array_contains: user.country }] : [])
                //         ]
                //     }
                // }] : []),

                // Specific user targeting
                {
                    targetType: AdTargetType.SPECIFIC_USERS,
                    targetConfig: {
                        path: ['userIds'],
                        array_contains: userId
                    }
                },
            ];
        } else {
            // Default targeting for anonymous users
            query.OR = [
                { targetType: AdTargetType.ALL_USERS },
                { targetType: AdTargetType.NEW_USERS }
            ];
        }

        // Check for display conditions based on context
        if (userContext) {
            if (userContext.currentPath) {
                // Add path-specific conditions
                query.OR.push({
                    displayConditions: {
                        path: ['paths'],
                        array_contains: userContext.currentPath
                    }
                });
            }

            if (userContext.cartItems && userContext.cartItems.length > 0) {
                // Add cart-based conditions
                const productIds = userContext.cartItems.map(item => item.productId);
                query.OR.push({
                    displayConditions: {
                        path: ['cartContains', 'productIds'],
                        array_contains: productIds
                    }
                });

                // Check cart value conditions
                const cartTotal = userContext.cartItems.reduce((sum, item) =>
                    sum + (item.price * item.quantity), 0);

                query.OR.push({
                    AND: [
                        {
                            displayConditions: {
                                path: ['cartValue', 'min'],
                                lte: cartTotal
                            }
                        },
                        {
                            OR: [
                                {
                                    displayConditions: {
                                        path: ['cartValue', 'max'],
                                        gte: cartTotal
                                    }
                                },
                                {
                                    displayConditions: {
                                        path: ['cartValue', 'max'],
                                        equals: null
                                    }
                                }
                            ]
                        }
                    ]
                });
            }
        }

        // Check for schedule constraints
        query.AND = [
            ...query.AND || [],
            this.buildScheduleConditions()
        ];

        try {
            const ads = await this.prisma.advertisement.findMany({
                where: query,
                include: {
                    product: {
                        select: { id: true, name: true, images: true, basePrice: true }
                    },
                    category: true,
                    brand: true,
                },
                orderBy: {
                    priority: 'desc',
                },
            });

            // Filter ads that have reached maximum impressions or clicks
            const filteredAds = ads.filter(ad => {
                if (ad.maxImpressions && ad.impressions >= ad.maxImpressions) return false;
                if (ad.maxClicks && ad.clicks >= ad.maxClicks) return false;
                if (ad.budget && ad.budget <= 0) return false;
                return true;
            });

            // Process A/B test groups - ensure only one ad from each test group is shown
            const abTestGroups = new Set();
            const finalAds = filteredAds.filter(ad => {
                if (!ad.isAbTest || !ad.abTestGroup) return true;

                if (abTestGroups.has(ad.abTestGroup)) {
                    return false;
                }

                abTestGroups.add(ad.abTestGroup);
                return true;
            });

            // Cache the result for 5 minutes
            // await this.cacheService.set(cacheKey, finalAds, 300);

            return finalAds;
        } catch (error) {
            this.logger.error(`Error finding active ads: ${error.message}`, error.stack);
            throw error;
        }
    }

    private isNewUser(dateJoined: Date): boolean {
        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);

        return dateJoined >= thirtyDaysAgo;
    }

    private buildScheduleConditions(): any {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0-6 (Sunday-Saturday)
        const hour = now.getHours();
        const minute = now.getMinutes();

        return {
            OR: [
                { scheduleConfig: null }, // No schedule constraints
                {
                    AND: [
                        {
                            OR: [
                                { scheduleConfig: { path: ['days'], array_contains: dayOfWeek.toString() } },
                                { scheduleConfig: { path: ['days'], equals: null } }
                            ]
                        },
                        {
                            OR: [
                                {
                                    AND: [
                                        { scheduleConfig: { path: ['timeStart'], lte: `${hour}:${minute}` } },
                                        { scheduleConfig: { path: ['timeEnd'], gte: `${hour}:${minute}` } }
                                    ]
                                },
                                {
                                    AND: [
                                        { scheduleConfig: { path: ['timeStart'], equals: null } },
                                        { scheduleConfig: { path: ['timeEnd'], equals: null } }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        };
    }

    async findOne(id: string) {
        const cacheKey = `ad_${id}`;
        // const cachedAd = await this.cacheService.get(cacheKey);

        // if (cachedAd) {
        //     return cachedAd;
        // }

        const ad = await this.prisma.advertisement.findUnique({
            where: { id },
            include: {
                product: true,
                category: true,
                brand: true,
                metrics: {
                    orderBy: {
                        date: 'desc',
                    },
                    take: 30, // Last 30 days
                },
            },
        });

        if (!ad) {
            throw new NotFoundException(`Advertisement with ID ${id} not found`);
        }

        // Get detailed performance metrics
        const performanceSummary = await this.adMetricsService.getPerformanceSummary(id);
        const result = { ...ad, performance: performanceSummary };

        // Cache for 10 minutes
        // await this.cacheService.set(cacheKey, result, 600);

        return result;
    }

    async update(id: string, updateAdDto: UpdateAdvertisementDto) {
        // Check if ad exists
        const existingAd = await this.findOne(id);

        // Validate dates if both are provided
        if (updateAdDto.startDate && updateAdDto.endDate) {
            if (new Date(updateAdDto.endDate) <= new Date(updateAdDto.startDate)) {
                throw new BadRequestException('End date must be after start date');
            }
        }

        // Validate content if type changes or content is updated
        if ((updateAdDto.type && updateAdDto.content) ||
            (!updateAdDto.type && updateAdDto.content)) {
            const adType = updateAdDto.type || existingAd.type;
            this.validateAdContent(adType, updateAdDto.content);
        }

        try {
            const updatedAd = await this.prisma.advertisement.update({
                where: { id },
                data: updateAdDto,
            });

            // Clear cache for this ad
            // await this.cacheService.del(`ad_${id}`);

            // Clear related cache entries
            // const cacheKeys = await this.cacheService.keys('ads_query_*');
            // await Promise.all(cacheKeys.map(key => this.cacheService.del(key)));
            // await this.cacheService.delByPattern('active_ads_*');

            // Update scheduled jobs if necessary
            if (updateAdDto.status === AdStatus.SCHEDULED && updateAdDto.startDate) {
                const now = new Date();
                const startDate = new Date(updateAdDto.startDate);

                if (startDate > now) {
                    this.schedulerService.scheduleJob(startDate, () =>
                        this.activateScheduledAd(id));
                }
            }

            return updatedAd;
        } catch (error) {
            this.logger.error(`Error updating ad ${id}: ${error.message}`, error.stack);
            throw error;
        }
    }

    async remove(id: string) {
        // Check if ad exists
        await this.findOne(id);

        try {
            const result = await this.prisma.advertisement.delete({
                where: { id },
            });

            // Clear related cache entries
            // await this.cacheService.del(`ad_${id}`);
            // const cacheKeys = await this.cacheService.keys('ads_query_*');
            // await Promise.all(cacheKeys.map(key => this.cacheService.del(key)));
            // await this.cacheService.delByPattern('active_ads_*');

            return result;
        } catch (error) {
            this.logger.error(`Error removing ad ${id}: ${error.message}`, error.stack);
            throw error;
        }
    }

    async updateStatus(id: string, status: AdStatus) {
        // Check if ad exists
        await this.findOne(id);

        try {
            const result = await this.prisma.advertisement.update({
                where: { id },
                data: { status },
            });

            // Clear related cache
            // await this.cacheService.del(`ad_${id}`);
            // const cacheKeys = await this.cacheService.keys('ads_query_*');
            // await Promise.all(cacheKeys.map(key => this.cacheService.del(key)));
            // await this.cacheService.delByPattern('active_ads_*');

            return result;
        } catch (error) {
            this.logger.error(`Error updating status for ad ${id}: ${error.message}`, error.stack);
            throw error;
        }
    }

    async logInteraction(logData: LogAdInteractionDto) {
        try {
            // Find the advertisement
            const ad = await this.prisma.advertisement.findUnique({
                where: { id: logData.advertisementId },
            });

            if (!ad) {
                throw new NotFoundException(`Advertisement with ID ${logData.advertisementId} not found`);
            }

            // Start a transaction to update both the ad and metrics
            return this.prisma.$transaction(async (prisma) => {
                // Update advertisement counters
                const updateData: any = {};

                if (logData.interactionType === AdInteractionType.IMPRESSION) {
                    updateData.impressions = { increment: 1 };
                } else if (logData.interactionType === AdInteractionType.CLICK) {
                    updateData.clicks = { increment: 1 };
                } else if (logData.interactionType === AdInteractionType.CONVERSION) {
                    updateData.conversions = { increment: 1 };
                }

                // If there's a budget, reduce it based on interaction type and cost model
                if (ad.budget && ad.budget > 0) {
                    // Example cost model: Impression = 0.001, Click = 0.01, Conversion = 0.1
                    let cost = 0;
                    if (logData.interactionType === AdInteractionType.IMPRESSION) {
                        cost = 0.001;
                    } else if (logData.interactionType === AdInteractionType.CLICK) {
                        cost = 0.01;
                    } else if (logData.interactionType === AdInteractionType.CONVERSION) {
                        cost = 0.1;
                    }

                    // Only decrement if there's enough budget
                    if (ad.budget >= cost) {
                        updateData.budget = { decrement: cost };

                        // Update cost in metrics
                        if (logData.metadata) {
                            logData.metadata.cost = cost;
                        } else {
                            logData.metadata = { cost };
                        }
                    }
                }

                // Update the advertisement
                await prisma.advertisement.update({
                    where: { id: logData.advertisementId },
                    data: updateData,
                });

                // Log the interaction in metrics
                await this.adMetricsService.logInteraction(logData, prisma);

                // Check if the ad needs to be paused due to reaching limits
                const shouldPause = (
                    (ad.maxImpressions && ad.impressions + (logData.interactionType === AdInteractionType.IMPRESSION ? 1 : 0) >= ad.maxImpressions) ||
                    (ad.maxClicks && ad.clicks + (logData.interactionType === AdInteractionType.CLICK ? 1 : 0) >= ad.maxClicks) ||
                    (ad.budget && ad.budget - (logData.metadata?.cost || 0) <= 0)
                );

                if (shouldPause) {
                    await prisma.advertisement.update({
                        where: { id: logData.advertisementId },
                        data: { status: AdStatus.PAUSED },
                    });

                    // Clear cache for paused ad
                    // await this.cacheService.del(`ad_${logData.advertisementId}`);
                    // await this.cacheService.delByPattern('active_ads_*');
                }

                return { success: true };
            });
        } catch (error) {
            this.logger.error(`Error logging interaction: ${error.message}`, error.stack);
            throw error;
        }
    }

    async getDynamicAds(placement: string, count: number, userId?: string, context?: any) {
        try {
            // Get active ads for the placement with user context
            let ads = await this.findActive(placement as AdPlacement, userId, context);

            // Apply additional context-based personalization
            if (context) {
                // Adjust priority based on context relevance
                ads = this.applyContextualScoring(ads, context);
            }

            // Apply A/B testing logic
            ads = this.applyAbTesting(ads, userId);

            // Sort by priority and take requested count
            return ads
                .sort((a, b) => b.priority - a.priority)
                .slice(0, count);
        } catch (error) {
            this.logger.error(`Error getting dynamic ads: ${error.message}`, error.stack);
            throw error;
        }
    }

    private applyContextualScoring(ads: any[], context: any): any[] {
        // Clone the ads to avoid modifying the original objects
        const scoredAds = JSON.parse(JSON.stringify(ads));

        for (const ad of scoredAds) {
            let contextScore = 0;

            // Product relevance - If user is viewing a product page
            if (context.currentProductId && ad.productId === context.currentProductId) {
                contextScore += 10;
            }

            // Category relevance
            if (context.currentCategoryId && ad.categoryId === context.currentCategoryId) {
                contextScore += 5;
            }

            // Brand relevance
            if (context.currentBrandId && ad.brandId === context.currentBrandId) {
                contextScore += 5;
            }

            // Search term relevance
            if (context.searchQuery && ad.title && ad.title.toLowerCase().includes(context.searchQuery.toLowerCase())) {
                contextScore += 3;
            }

            // Add the context score to the priority
            ad.priority = (ad.priority || 1) + contextScore;
        }

        return scoredAds;
    }

    private applyAbTesting(ads: any[], userId?: string): any[] {
        // Group ads by abTestGroup
        const adsByGroup = new Map<string, any[]>();

        for (const ad of ads) {
            if (ad.isAbTest && ad.abTestGroup) {
                if (!adsByGroup.has(ad.abTestGroup)) {
                    adsByGroup.set(ad.abTestGroup, []);
                }
                adsByGroup.get(ad.abTestGroup)!.push(ad);
            }
        }

        // For each test group, select one ad based on user ID
        const selectedAds: any[] = [];
        adsByGroup.forEach((groupAds, groupName) => {
            if (groupAds.length > 0) {
                let selectedIndex = 0;

                if (userId) {
                    // Use a hash of user ID and group name for consistent selection
                    const hash = this.hashString(`${userId}-${groupName}`);
                    selectedIndex = hash % groupAds.length;
                } else {
                    // Random selection for anonymous users
                    selectedIndex = Math.floor(Math.random() * groupAds.length);
                }

                selectedAds.push(groupAds[selectedIndex]);
            }
        });

        // Combine selected A/B test ads with non-test ads
        return [
            ...ads.filter(ad => !ad.isAbTest || !ad.abTestGroup),
            ...selectedAds
        ];
    }

    private hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    // Process scheduled ads that should become active
    private async processScheduledAds() {
        const now = new Date();

        try {
            // Find all scheduled ads that should be active now
            const scheduledAds = await this.prisma.advertisement.findMany({
                where: {
                    status: AdStatus.SCHEDULED,
                    startDate: { lte: now },
                }
            });

            for (const ad of scheduledAds) {
                await this.activateScheduledAd(ad.id);
            }

            // Find all active ads that should be ended
            const endedAds = await this.prisma.advertisement.findMany({
                where: {
                    status: AdStatus.ACTIVE,
                    endDate: { lte: now },
                }
            });

            for (const ad of endedAds) {
                await this.updateStatus(ad.id, AdStatus.ENDED);
            }
        } catch (error) {
            this.logger.error(`Error processing scheduled ads: ${error.message}`, error.stack);
        }
    }

    private async activateScheduledAd(adId: string) {
        try {
            await this.updateStatus(adId, AdStatus.ACTIVE);
            this.logger.log(`Activated scheduled ad ${adId}`);
        } catch (error) {
            this.logger.error(`Error activating scheduled ad ${adId}: ${error.message}`);
        }
    }
}