export interface WeeklyReportData {
    from: string;
    to: string;
    totalNewUsers: number;
    usersByGender: Record<string, number>;
    totalNewSubscriptions: number;
    subscriptionsByGender: Record<string, number>;
    subscriptionsByAge: Record<string, number>;
    subscriptionsByProgram: {
        programId: number;
        programName: string;
        count: number;
    }[];
    subscriptionsByChannel: {
        channelId: number;
        channelName: string;
        count: number;
    }[];
    topChannelsBySubscriptions: {
        channelId: number;
        channelName: string;
        count: number;
    }[];
    topChannelsByClicksLive: {
        channelName: string;
        count: number;
    }[];
    topChannelsByClicksDeferred: {
        channelName: string;
        count: number;
    }[];
    topProgramsBySubscriptions: {
        programId: number;
        programName: string;
        channelName: string;
        count: number;
    }[];
    topProgramsByClicksLive: {
        programName: string;
        channelName: string;
        count: number;
    }[];
    topProgramsByClicksDeferred: {
        programName: string;
        channelName: string;
        count: number;
    }[];
    rankingChanges: {
        type: 'channel' | 'program';
        metric: 'subscriptions' | 'clicksLive' | 'clicksDeferred';
        previous: {
            id: number | string;
            name: string;
            rank: number;
        }[];
        current: {
            id: number | string;
            name: string;
            rank: number;
        }[];
    }[];
}
