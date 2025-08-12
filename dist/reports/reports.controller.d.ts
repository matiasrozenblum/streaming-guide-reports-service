import { Response } from 'express';
import { ReportsService } from './reports.service';
export declare class ReportsController {
    private readonly reportsService;
    constructor(reportsService: ReportsService);
    generateWeeklyReport(from: string, to: string, channelId?: number, format?: 'csv' | 'pdf'): Promise<Buffer<ArrayBufferLike>>;
    generatePeriodicReport(from: string, to: string, channelId?: number, period?: 'monthly' | 'quarterly' | 'yearly', format?: 'csv' | 'pdf'): Promise<Buffer<ArrayBufferLike>>;
    generateUsersReport(from: string, to: string, format?: 'csv' | 'pdf'): Promise<string | Buffer<ArrayBufferLike>>;
    generateSubscriptionsReport(from: string, to: string, channelId?: number, programId?: number, format?: 'csv' | 'pdf'): Promise<string | Buffer<ArrayBufferLike>>;
    generateChannelReport(from: string, to: string, channelId: number, format?: 'csv' | 'pdf'): Promise<string | Buffer<ArrayBufferLike>>;
    generateComprehensiveChannelReport(from: string, to: string, channelId: number, format?: 'csv' | 'pdf'): Promise<string | Buffer<ArrayBufferLike>>;
    getTopChannels(from: string, to: string, channelId?: number, gender?: string, age?: string): Promise<any[]>;
    getTopPrograms(from: string, to: string, channelId?: number, gender?: string, age?: string): Promise<any[]>;
    exportReport(res: Response, type: string, from: string, to: string, channelId?: number, programId?: number, format?: 'csv' | 'pdf'): Promise<void>;
}
