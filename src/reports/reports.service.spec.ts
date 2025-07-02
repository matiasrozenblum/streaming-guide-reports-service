import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { DataSource } from 'typeorm';

describe('ReportsService', () => {
  let service: ReportsService;
  let dataSource: Partial<DataSource>;

  beforeEach(async () => {
    dataSource = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
      }),
    } as any;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get<ReportsService>(ReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate users report (csv)', async () => {
    jest.spyOn(dataSource, 'createQueryBuilder').mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { id: 1, firstName: 'A', lastName: 'B', email: 'a@b.com', gender: 'male', birthDate: '2000-01-01', createdAt: '2024-01-01' },
      ]),
    } as any);
    const result = await service.generateUsersReport('2024-01-01', '2024-01-31', 'csv');
    expect(result).toContain('ID');
    expect(result).toContain('A');
  });

  it('should generate subscriptions report (csv)', async () => {
    jest.spyOn(dataSource, 'createQueryBuilder').mockReturnValueOnce({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { id: 1, user: { firstName: 'A', lastName: 'B', email: 'a@b.com' }, program: { name: 'P', channel: { name: 'C' } }, createdAt: '2024-01-01' },
      ]),
    } as any);
    const result = await service.generateSubscriptionsReport('2024-01-01', '2024-01-31', 'csv');
    expect(result).toContain('ID');
    expect(result).toContain('P');
  });

  it('should build users report html', () => {
    const html = (service as any).buildUsersReportHtml([
      { id: 1, firstName: 'A', lastName: 'B', email: 'a@b.com', gender: 'male', birthDate: '2000-01-01', createdAt: '2024-01-01' },
    ], '2024-01-01', '2024-01-31');
    expect(html).toContain('<table>');
    expect(html).toContain('A');
  });

  it('should build subscriptions report html', () => {
    const html = (service as any).buildSubscriptionsReportHtml([
      { id: 1, userFirstName: 'A', userLastName: 'B', userEmail: 'a@b.com', programName: 'P', channelName: 'C', createdAt: '2024-01-01' },
    ], '2024-01-01', '2024-01-31');
    expect(html).toContain('<table>');
    expect(html).toContain('P');
  });

  it('should get subscriptions by age', async () => {
    jest.spyOn(dataSource, 'createQueryBuilder').mockReturnValueOnce({
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { birthDate: '2010-01-01' },
        { birthDate: '1990-01-01' },
        { birthDate: '1980-01-01' },
        { birthDate: '1970-01-01' },
        { birthDate: '1960-01-01' },
      ]),
    } as any);
    const result = await (service as any).getSubscriptionsByAge('2024-01-01', '2024-01-31');
    expect(result.under18).toBeGreaterThanOrEqual(0);
    expect(result.age18to30).toBeGreaterThanOrEqual(0);
  });
}); 