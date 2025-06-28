export declare class ReportsService {
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
}
