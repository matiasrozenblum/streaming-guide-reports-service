import { WeeklyReportData } from './weekly-report.service';
export declare function generateWeeklyReportPdf({ data, charts, }: {
    data: WeeklyReportData;
    charts: Record<string, string>;
}): Promise<Buffer>;
