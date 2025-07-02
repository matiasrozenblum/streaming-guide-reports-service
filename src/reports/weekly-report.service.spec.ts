import { WeeklyReportData } from './weekly-report.service';

describe('WeeklyReportData interface', () => {
  it('should allow a valid weekly report data object', () => {
    const data: WeeklyReportData = {
      from: '2024-01-01',
      to: '2024-01-31',
      totalNewUsers: 10,
      usersByGender: { male: 5, female: 5 },
      totalNewSubscriptions: 8,
      subscriptionsByGender: { male: 4, female: 4 },
      subscriptionsByAge: { under18: 2, age18to30: 3, age30to45: 2, age45to60: 1, over60: 0 },
      subscriptionsByProgram: [],
      subscriptionsByChannel: [],
      topChannelsBySubscriptions: [],
      topChannelsByClicksLive: [],
      topChannelsByClicksDeferred: [],
      topProgramsBySubscriptions: [],
      topProgramsByClicksLive: [],
      topProgramsByClicksDeferred: [],
      rankingChanges: [],
    };
    expect(data.from).toBe('2024-01-01');
    expect(typeof data.totalNewUsers).toBe('number');
  });
}); 