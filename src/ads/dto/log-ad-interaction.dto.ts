export enum AdInteractionType {
    IMPRESSION = 'IMPRESSION',
    CLICK = 'CLICK',
    CONVERSION = 'CONVERSION',
}

export class LogAdInteractionDto {
    advertisementId: string;
    interactionType: AdInteractionType;
    userId?: string;
    revenue?: number;
    metadata?: Record<string, any>;
}