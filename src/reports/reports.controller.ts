import { Controller, Post, Body, Get, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';

export class GenerateReportDto {
  type: 'users' | 'subscriptions' | 'weekly-summary';
  format: 'csv' | 'pdf';
  from: string;
  to: string;
  channelId?: number;
  programId?: number;
}

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate a report (returns file, never sends email)' })
  @ApiBody({ type: GenerateReportDto })
  @ApiResponse({ status: 200, description: 'Report generated successfully' })
  async generateReport(@Body() request: GenerateReportDto, @Res() res: Response) {
    const result = await this.reportsService.generateReport(request);
    if (request.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${request.type}_report_${request.from}_to_${request.to}.csv"`);
    } else {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${request.type}_report_${request.from}_to_${request.to}.pdf"`);
    }
    res.send(result);
  }

  @Get('weekly-summary/download')
  @ApiOperation({ summary: 'Download weekly summary report' })
  async downloadWeeklyReport(
    @Res() res: Response,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('channelId') channelId?: string,
  ) {
    const result = await this.reportsService.generateWeeklyReport({
      from,
      to,
      channelId: channelId ? parseInt(channelId) : undefined,
    });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="weekly_report_${from}_to_${to}.pdf"`);
    res.send(result);
  }

  @Get('top-channels')
  @ApiOperation({ summary: 'Get top channels by subscriptions or YouTube clicks' })
  async getTopChannels(
    @Query('metric') metric: 'subscriptions' | 'youtube_clicks',
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('limit') limit?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return this.reportsService.getTopChannels({ metric, from, to, limit: limit ? parseInt(limit) : 5, groupBy });
  }

  @Get('top-programs')
  @ApiOperation({ summary: 'Get top programs by subscriptions or YouTube clicks' })
  async getTopPrograms(
    @Query('metric') metric: 'subscriptions' | 'youtube_clicks',
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('limit') limit?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return this.reportsService.getTopPrograms({ metric, from, to, limit: limit ? parseInt(limit) : 5, groupBy });
  }
} 