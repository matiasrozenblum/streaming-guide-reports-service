import { Controller, Get, Post, Body, Query, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('weekly-summary')
  async generateWeeklyReport(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('channelId') channelId?: number,
    @Query('format') format: 'csv' | 'pdf' = 'pdf'
  ) {
    const report = await this.reportsService.generateWeeklyReport({
      from,
      to,
      channelId,
    });

    if (format === 'csv') {
      // For now, just return the report as JSON since CSV methods don't exist
      return report;
    }

    return report;
  }

  @Get('periodic-summary')
  async generatePeriodicReport(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('channelId') channelId?: number,
    @Query('period') period: 'monthly' | 'quarterly' | 'yearly' = 'monthly',
    @Query('format') format: 'csv' | 'pdf' = 'pdf'
  ) {
    const report = await this.reportsService.generatePeriodicReport({
      from,
      to,
      channelId,
      period,
    });

    if (format === 'csv') {
      // For now, just return the report as JSON since CSV methods don't exist
      return report;
    }

    return report;
  }

  @Get('users')
  async generateUsersReport(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format: 'csv' | 'pdf' = 'csv'
  ) {
    const report = await this.reportsService.generateUsersReport(from, to, format);
    
    if (format === 'csv') {
      // For now, just return the report as JSON since CSV methods don't exist
      return report;
    }
    
    return report;
  }

  @Get('subscriptions')
  async generateSubscriptionsReport(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('channelId') channelId?: number,
    @Query('programId') programId?: number,
    @Query('format') format: 'csv' | 'pdf' = 'csv'
  ) {
    const report = await this.reportsService.generateSubscriptionsReport(from, to, format, channelId, programId);
    
    if (format === 'csv') {
      // For now, just return the report as JSON since CSV methods don't exist
      return report;
    }
    
    return report;
  }

  @Get('channel-summary')
  async generateChannelReport(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('channelId') channelId: number,
    @Query('format') format: 'csv' | 'pdf' = 'pdf'
  ) {
    const report = await this.reportsService.generateChannelReport(from, to, format, channelId);
    
    if (format === 'csv') {
      // For now, just return the report as JSON since CSV methods don't exist
      return report;
    }
    
    return report;
  }

  @Get('comprehensive-channel-summary')
  async generateComprehensiveChannelReport(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('channelId') channelId: number,
    @Query('format') format: 'csv' | 'pdf' = 'pdf'
  ) {
    const report = await this.reportsService.generateComprehensiveChannelReport(from, to, format, channelId);
    
    if (format === 'csv') {
      // For now, just return the report as JSON since CSV methods don't exist
      return report;
    }
    
    return report;
  }

  @Get('top-channels')
  async getTopChannels(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('channelId') channelId?: number,
    @Query('gender') gender?: string,
    @Query('age') age?: string
  ) {
    return this.reportsService.getTopChannels(from, to, channelId, gender, age);
  }

  @Get('top-programs')
  async getTopPrograms(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('channelId') channelId?: number,
    @Query('gender') gender?: string,
    @Query('age') age?: string
  ) {
    return this.reportsService.getTopPrograms(from, to, channelId, gender, age);
  }

  @Get('export')
  async exportReport(
    @Res() res: Response,
    @Query('type') type: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('channelId') channelId?: number,
    @Query('programId') programId?: number,
    @Query('format') format: 'csv' | 'pdf' = 'csv'
  ) {
    try {
      const report = await this.reportsService.generateReport({
        type: type as any,
        format,
        from,
        to,
        channelId,
        programId,
      });

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${type}-${from}-${to}.csv"`);
        res.status(HttpStatus.OK).send(report);
      } else {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${type}-${from}-${to}.pdf"`);
        res.status(HttpStatus.OK).send(report);
      }
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
} 