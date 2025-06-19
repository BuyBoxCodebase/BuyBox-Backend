export interface TotalRevenue {
    amount: string;
    change: string;
}

export interface TotalCount {
    count: number;
    change: string;
}

export interface ActiveNow {
    count: string;
    change: string;
}

export interface CustomerSale {
    initials: string;
    name: string;
    email: string;
    amount: string;
}

export interface RecentSales {
    totalSales: number;
    customers: CustomerSale[];
}

export interface MonthlyData {
    name: string;
    total: number;
}

export interface SellerAnalytics {
    totalRevenue: TotalRevenue;
    subscriptions: TotalCount;
    sales: TotalCount;
    activeNow: ActiveNow;
    recentSales: RecentSales;
    monthlyData: MonthlyData[];
}