import { DataSource } from 'typeorm';
export declare class ReportsService {
    private dataSource;
    constructor(dataSource: DataSource);
    generateReport(request: {
        type: 'users' | 'subscriptions' | 'weekly-summary';
        format: 'csv' | 'pdf';
        from: string;
        to: string;
        channelId?: number;
        programId?: number;
        toEmail?: string;
    }): Promise<Buffer | string>;
    generateUsersReport(from: string, to: string, format: 'csv' | 'pdf'): Promise<Buffer | string>;
    generateSubscriptionsReport(from: string, to: string, format: 'csv' | 'pdf', channelId?: number, programId?: number): Promise<Buffer | string>;
    generateWeeklyReport(params: {
        from: string;
        to: string;
        channelId?: number;
    }): Promise<Buffer>;
    private buildUsersReportHtml;
    private buildSubscriptionsReportHtml;
    private htmlToPdfBuffer;
    private getSubscriptionsByAge;
    getTopChannels({ metric, from, to, limit, groupBy }: {
        metric: 'subscriptions' | 'youtube_clicks';
        from: string;
        to: string;
        limit: number;
        groupBy?: string;
    }): Promise<any[]>;
    getTopPrograms({ metric, from, to, limit, groupBy }: {
        metric: 'subscriptions' | 'youtube_clicks';
        from: string;
        to: string;
        limit: number;
        groupBy?: string;
    }): Promise<any[]>;
}
