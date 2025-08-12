import { Response } from 'express';
import { ReportsService } from './reports.service';
export declare class GenerateReportDto {
    type: 'users' | 'subscriptions' | 'weekly-summary' | 'monthly-summary' | 'quarterly-summary' | 'yearly-summary' | 'channel-summary' | 'comprehensive-channel-summary';
    format: 'csv' | 'pdf';
    from: string;
    to: string;
    channelId?: number;
    programId?: number;
}
export declare class ReportsController {
    private readonly reportsService;
    constructor(reportsService: ReportsService);
    healthCheck(): Promise<{
        status: string;
        puppeteer: string;
        pdfSize: number;
        timestamp: string;
        error?: undefined;
    } | {
        status: string;
        puppeteer: string;
        error: any;
        timestamp: string;
        pdfSize?: undefined;
    }>;
    generateReport(request: GenerateReportDto, res: Response): Promise<void>;
    downloadWeeklyReport(res: Response, from: string, to: string, channelId?: string): Promise<void>;
    getTopChannels(metric: 'subscriptions' | 'youtube_clicks', from: string, to: string, limit?: string, groupBy?: string): Promise<any[]>;
    getTopPrograms(metric: 'subscriptions' | 'youtube_clicks', from: string, to: string, limit?: string, groupBy?: string): Promise<any[]>;
    testPostHog(): Promise<{
        configValidation: {
            isValid: boolean;
            issues: string[];
            config: {
                apiKey: string;
                apiHost: string;
                projectId: string;
            };
            environment: {
                envProjectId: string | undefined;
                envProjectIdLength: number;
                finalProjectId: string;
                finalProjectIdLength: number;
                isUsingEnvVar: boolean;
            };
        };
        connectionTest: {
            success: boolean;
            message: string;
            details?: any;
        };
        timestamp: string;
    }>;
}
