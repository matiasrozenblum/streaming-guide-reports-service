import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Response } from 'express';

describe('ReportsController', () => {
  let controller: ReportsController;
  let reportsService: ReportsService;
  let res: Partial<Response>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        {
          provide: ReportsService,
          useValue: {
            generateReport: jest.fn().mockResolvedValue(Buffer.from('test')),
            getTopChannels: jest.fn().mockResolvedValue([]),
            getTopPrograms: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
    reportsService = module.get<ReportsService>(ReportsService);
    res = {
      setHeader: jest.fn(),
      send: jest.fn(),
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should handle generateReport and send buffer', async () => {
    await controller.generateReport({ type: 'users', format: 'csv', from: '2024-01-01', to: '2024-01-31' }, res as Response);
    expect(reportsService.generateReport).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalled();
  });

  it('should get top channels', async () => {
    const result = await controller.getTopChannels('subscriptions', '2024-01-01', '2024-01-31', '5', 'gender');
    expect(reportsService.getTopChannels).toHaveBeenCalledWith({
      metric: 'subscriptions',
      from: '2024-01-01',
      to: '2024-01-31',
      limit: 5,
      groupBy: 'gender',
    });
  });

  it('should get top programs', async () => {
    const result = await controller.getTopPrograms('youtube_clicks', '2024-01-01', '2024-01-31', '10', 'age');
    expect(reportsService.getTopPrograms).toHaveBeenCalledWith({
      metric: 'youtube_clicks',
      from: '2024-01-01',
      to: '2024-01-31',
      limit: 10,
      groupBy: 'age',
    });
  });
}); 