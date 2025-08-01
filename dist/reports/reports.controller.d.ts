import { Response } from 'express';
import { ReportsService } from './reports.service';
export declare class GenerateReportDto {
    type: 'users' | 'subscriptions' | 'weekly-summary';
    format: 'csv' | 'pdf';
    from: string;
    to: string;
    channelId?: number;
    programId?: number;
}
export declare class ReportsController {
    private readonly reportsService;
    constructor(reportsService: ReportsService);
    generateReport(request: GenerateReportDto, res: Response): Promise<void>;
    downloadWeeklyReport(res: Response, from: string, to: string, channelId?: string): Promise<void>;
    getTopChannels(metric: 'subscriptions' | 'youtube_clicks', from: string, to: string, limit?: string, groupBy?: string): Promise<any[]>;
    getTopPrograms(metric: 'subscriptions' | 'youtube_clicks', from: string, to: string, limit?: string, groupBy?: string): Promise<any[]>;
}
