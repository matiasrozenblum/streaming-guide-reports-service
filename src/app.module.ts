import { Module } from '@nestjs/common';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';

@Module({
  imports: [],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class AppModule {} 