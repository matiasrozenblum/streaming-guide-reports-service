import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { DataSource } from 'typeorm';

// Mock the posthog.util module with more realistic data
jest.mock('./posthog.util', () => ({
  fetchYouTubeClicks: jest.fn().mockResolvedValue([
    { event: 'click_youtube_live', properties: { channel_name: 'A', program_name: 'Program A', user_gender: 'male' }, timestamp: '2024-01-01T00:00:00Z' },
    { event: 'click_youtube_live', properties: { channel_name: 'A', program_name: 'Program A', user_gender: 'female' }, timestamp: '2024-01-01T00:00:00Z' },
    { event: 'click_youtube_live', properties: { channel_name: 'B', program_name: 'Program B', user_gender: 'unknown' }, timestamp: '2024-01-01T00:00:00Z' },
    { event: 'click_youtube_deferred', properties: { channel_name: 'A', program_name: 'Program A', user_gender: 'male' }, timestamp: '2024-01-01T00:00:00Z' },
    { event: 'click_youtube_deferred', properties: { channel_name: 'A', program_name: 'Program A', user_gender: 'female' }, timestamp: '2024-01-01T00:00:00Z' },
  ]),
}));

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
        // Note: NULL birth dates are filtered out by the query
      ]),
    } as any);
    const result = await (service as any).getSubscriptionsByAge('2024-01-01', '2024-01-31');
    expect(result).toHaveProperty('under18');
    expect(result).toHaveProperty('age18to30');
    expect(result).toHaveProperty('age30to45');
    expect(result).toHaveProperty('age45to60');
    expect(result).toHaveProperty('over60');
    // Note: getSubscriptionsByAge doesn't include 'unknown' as it filters out NULL birth dates
  });

  describe('getTopChannels', () => {
    it('should get top channels by subscriptions with gender grouping', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { id: 1, name: 'Channel A', groupKey: 'male', count: '5' },
          { id: 1, name: 'Channel A', groupKey: 'female', count: '3' },
          { id: 1, name: 'Channel A', groupKey: 'unknown', count: '2' },
          { id: 2, name: 'Channel B', groupKey: 'male', count: '1' },
        ]),
      };
      jest.spyOn(dataSource, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const result = await service.getTopChannels({ metric: 'subscriptions', from: '2024-01-01', to: '2024-01-31', limit: 5, groupBy: 'gender' });

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Channel A');
      expect(result[0].counts).toEqual({
        male: 5,
        female: 3,
        unknown: 2,
      });
      expect(result[1].name).toBe('Channel B');
      expect(result[1].counts).toEqual({
        male: 1,
      });
    });

    it('should get top channels by youtube clicks with gender grouping', async () => {
      const result = await service.getTopChannels({ metric: 'youtube_clicks', from: '2024-01-01', to: '2024-01-31', limit: 5, groupBy: 'gender' });

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('A');
      // The mock data has 4 events for channel A (2 male, 2 female from live + deferred)
      // But since the mock is called twice (live + deferred), counts are doubled
      expect(result[0].counts).toEqual({
        male: 4,
        female: 4,
      });
      expect(result[1].name).toBe('B');
      expect(result[1].counts).toEqual({
        unknown: 2,
      });
    });
  });

  describe('getTopPrograms', () => {
    it('should get top programs by subscriptions with gender grouping', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { id: 1, name: 'Program A', channelName: 'Channel A', groupKey: 'male', count: '5' },
          { id: 1, name: 'Program A', channelName: 'Channel A', groupKey: 'female', count: '3' },
          { id: 1, name: 'Program A', channelName: 'Channel A', groupKey: 'unknown', count: '2' },
          { id: 2, name: 'Program B', channelName: 'Channel B', groupKey: 'male', count: '1' },
        ]),
      };
      jest.spyOn(dataSource, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const result = await service.getTopPrograms({ metric: 'subscriptions', from: '2024-01-01', to: '2024-01-31', limit: 5, groupBy: 'gender' });

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Program A');
      expect(result[0].channelName).toBe('Channel A');
      expect(result[0].counts).toEqual({
        male: 5,
        female: 3,
        unknown: 2,
      });
      expect(result[1].name).toBe('Program B');
      expect(result[1].channelName).toBe('Channel B');
      expect(result[1].counts).toEqual({
        male: 1,
      });
    });

    it('should get top programs by youtube clicks with gender grouping', async () => {
      const result = await service.getTopPrograms({ metric: 'youtube_clicks', from: '2024-01-01', to: '2024-01-31', limit: 5, groupBy: 'gender' });

      expect(result).toHaveLength(2);
      // The mock data now has proper program names
      expect(result[0].name).toBe('Program A');
      expect(result[0].channelName).toBe('A');
      // But since the mock is called twice (live + deferred), counts are doubled
      expect(result[0].counts).toEqual({
        male: 4,
        female: 4,
      });
      expect(result[1].name).toBe('Program B');
      expect(result[1].channelName).toBe('B');
      expect(result[1].counts).toEqual({
        unknown: 2,
      });
    });
  });
}); 