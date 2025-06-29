import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { AppDataSource } from './data-source';

@Module({
  imports: [
    TypeOrmModule.forRoot(AppDataSource.options),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class AppModule {} 