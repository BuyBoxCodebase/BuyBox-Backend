export enum NotificationType {
    ORDER_UPDATES = 'orderUpdates',
    PROMOTIONS = 'promotions',
    ACCOUNT_ALERTS = 'accountAlerts',
    DELIVERY_UPDATES = 'deliveryUpdates',
    INVENTORY_ALERTS = 'inventoryAlerts',
}

export interface NotificationPayload {
    title: string;
    body: string;
    type: NotificationType;
    data?: Record<string, any>;
}

export interface NotificationRecipient {
    id: string;
    isSeller: boolean;
}
