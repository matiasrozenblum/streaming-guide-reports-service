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

  it('should get top channels', async () => {
    const result = await controller.getTopChannels('2024-01-01', '2024-01-31', undefined, 'gender', 'age');
    expect(reportsService.getTopChannels).toHaveBeenCalledWith('2024-01-01', '2024-01-31', undefined, 'gender', 'age');
  });

  it('should get top programs', async () => {
    const result = await controller.getTopPrograms('2024-01-01', '2024-01-31', undefined, 'gender', 'age');
    expect(reportsService.getTopPrograms).toHaveBeenCalledWith('2024-01-01', '2024-01-31', undefined, 'gender', 'age');
  });
}); 