import { WeeklyReportData } from './weekly-report.service';
export declare function generateWeeklyReportPdf({ data, charts, }: {
    data: WeeklyReportData;
    charts: Record<string, string>;
}): Promise<Buffer>;
export declare function generatePeriodicReportPdf({ data, charts, period, }: {
    data: WeeklyReportData;
    charts: Record<string, string>;
    period: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
}): Promise<Buffer>;
