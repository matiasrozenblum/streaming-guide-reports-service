import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { stringify } from 'csv-stringify';
import { renderPieChart, renderBarChart, barChartConfig, pieChartConfig } from './chart.util';
import { generateWeeklyReportPdf, generatePeriodicReportPdf } from './weekly-report-pdf.util';
import { WeeklyReportData } from './weekly-report.service';
import { fetchYouTubeClicks, aggregateClicksBy, fetchStreamerClicks } from './posthog.util';
import { getBrowser } from './puppeteer.util';
import * as dayjs from 'dayjs';
import { User } from '../users/users.entity';
import { UserSubscription } from '../users/user-subscription.entity';
import { Program } from '../programs/programs.entity';
import { Channel } from '../channels/channels.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) { }

  async generateReport(request: {
    type: 'users' | 'subscriptions' | 'weekly-summary' | 'monthly-summary' | 'quarterly-summary' | 'yearly-summary' | 'channel-summary' | 'comprehensive-channel-summary';
    format: 'csv' | 'pdf';
    from: string;
    to: string;
    channelId?: number;
    programId?: number;
    toEmail?: string;
  }): Promise<Buffer | string> {
    switch (request.type) {
      case 'users':
        return this.generateUsersReport(request.from, request.to, request.format);
      case 'subscriptions':
        return this.generateSubscriptionsReport(request.from, request.to, request.format, request.channelId, request.programId);
      case 'weekly-summary':
        return this.generateWeeklyReport({
          from: request.from,
          to: request.to,
          channelId: request.channelId,
        });
      case 'monthly-summary':
        return this.generatePeriodicReport({
          from: request.from,
          to: request.to,
          channelId: request.channelId,
          period: 'monthly',
        });
      case 'quarterly-summary':
        return this.generatePeriodicReport({
          from: request.from,
          to: request.to,
          channelId: request.channelId,
          period: 'quarterly',
        });
      case 'yearly-summary':
        return this.generatePeriodicReport({
          from: request.from,
          to: request.to,
          channelId: request.channelId,
          period: 'yearly',
        });
      case 'channel-summary':
        return this.generateChannelReport(request.from, request.to, request.format, request.channelId);
      case 'comprehensive-channel-summary':
        return this.generateComprehensiveChannelReport(request.from, request.to, request.format, request.channelId);
      default:
        throw new Error(`Unknown report type: ${request.type}`);
    }
  }

  async generateUsersReport(from: string, to: string, format: 'csv' | 'pdf'): Promise<Buffer | string> {
    // Fetch real users data from database
    const users = await this.dataSource
      .createQueryBuilder(User, 'user')
      .select([
        'user.id',
        'user.firstName',
        'user.lastName',
        'user.email',
        'user.gender',
        'user.birthDate',
        'user.createdAt'
      ])
      .where('user.createdAt >= :from', { from: `${from}T00:00:00Z` })
      .andWhere('user.createdAt <= :to', { to: `${to}T23:59:59Z` })
      .orderBy('user.createdAt', 'DESC')
      .getMany();

    const formattedUsers = users.map(user => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      gender: user.gender || 'N/A',
      birthDate: user.birthDate ? dayjs(user.birthDate).format('YYYY-MM-DD') : 'N/A',
      createdAt: dayjs(user.createdAt).format('YYYY-MM-DD'),
    }));

    if (format === 'csv') {
      return new Promise((resolve, reject) => {
        stringify(formattedUsers, {
          header: true,
          columns: {
            id: 'ID',
            firstName: 'Nombre',
            lastName: 'Apellido',
            email: 'Email',
            gender: 'Género',
            birthDate: 'Fecha de Nacimiento',
            createdAt: 'Fecha de Registro',
          },
        }, (err, output) => {
          if (err) reject(err);
          else resolve(output);
        });
      });
    } else {
      const html = this.buildUsersReportHtml(formattedUsers, from, to);
      return await this.htmlToPdfBuffer(html);
    }
  }

  async generateSubscriptionsReport(from: string, to: string, format: 'csv' | 'pdf', channelId?: number, programId?: number): Promise<Buffer | string> {
    // Build query for real subscriptions data
    const queryBuilder = this.dataSource
      .createQueryBuilder(UserSubscription, 'subscription')
      .leftJoinAndSelect('subscription.user', 'user')
      .leftJoinAndSelect('subscription.program', 'program')
      .leftJoinAndSelect('program.channel', 'channel')
      .select([
        'subscription.id',
        'subscription.createdAt',
        'user.firstName',
        'user.lastName',
        'user.email',
        'program.name',
        'channel.name'
      ])
      .where('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
      .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
      .andWhere('subscription.isActive = :isActive', { isActive: true });

    if (channelId) {
      queryBuilder.andWhere('channel.id = :channelId', { channelId });
    }

    if (programId) {
      queryBuilder.andWhere('program.id = :programId', { programId });
    }

    const subscriptions = await queryBuilder
      .orderBy('subscription.createdAt', 'DESC')
      .getMany();

    const formattedSubscriptions = subscriptions.map(sub => ({
      id: sub.id,
      userFirstName: sub.user.firstName,
      userLastName: sub.user.lastName,
      userEmail: sub.user.email,
      programName: sub.program.name,
      channelName: sub.program.channel.name,
      createdAt: dayjs(sub.createdAt).format('YYYY-MM-DD'),
    }));

    if (format === 'csv') {
      return new Promise((resolve, reject) => {
        stringify(formattedSubscriptions, {
          header: true,
          columns: {
            id: 'ID',
            userFirstName: 'Nombre Usuario',
            userLastName: 'Apellido Usuario',
            userEmail: 'Email Usuario',
            programName: 'Programa',
            channelName: 'Canal',
            createdAt: 'Fecha de Suscripción',
          },
        }, (err, output) => {
          if (err) reject(err);
          else resolve(output);
        });
      });
    } else {
      const html = this.buildSubscriptionsReportHtml(formattedSubscriptions, from, to);
      return await this.htmlToPdfBuffer(html);
    }
  }

  async generateWeeklyReport(params: { from: string; to: string; channelId?: number }): Promise<Buffer> {
    // Fetch real data from database and PostHog
    const [
      totalNewUsers,
      usersByGender,
      totalNewSubscriptions,
      subscriptionsByGender,
      subscriptionsByAge,
      topChannelsBySubscriptions,
      topProgramsBySubscriptions,
      youtubeClicksLive,
      youtubeClicksDeferred,
      streamerClicksLive,
      streamerClicksOffline
    ] = await Promise.all([
      // Total new users
      this.dataSource
        .createQueryBuilder(User, 'user')
        .where('user.createdAt >= :from', { from: `${params.from}T00:00:00Z` })
        .andWhere('user.createdAt <= :to', { to: `${params.to}T23:59:59Z` })
        .getCount(),

      // Users by gender
      this.dataSource
        .createQueryBuilder(User, 'user')
        .select('user.gender', 'gender')
        .addSelect('COUNT(*)', 'count')
        .where('user.createdAt >= :from', { from: `${params.from}T00:00:00Z` })
        .andWhere('user.createdAt <= :to', { to: `${params.to}T23:59:59Z` })
        .andWhere('user.gender IS NOT NULL')
        .groupBy('user.gender')
        .getRawMany(),

      // Total new subscriptions
      this.dataSource
        .createQueryBuilder(UserSubscription, 'subscription')
        .where('subscription.createdAt >= :from', { from: `${params.from}T00:00:00Z` })
        .andWhere('subscription.createdAt <= :to', { to: `${params.to}T23:59:59Z` })
        .andWhere('subscription.isActive = :isActive', { isActive: true })
        .getCount(),

      // Subscriptions by gender
      this.dataSource
        .createQueryBuilder(UserSubscription, 'subscription')
        .leftJoin('subscription.user', 'user')
        .select('user.gender', 'gender')
        .addSelect('COUNT(*)', 'count')
        .where('subscription.createdAt >= :from', { from: `${params.from}T00:00:00Z` })
        .andWhere('subscription.createdAt <= :to', { to: `${params.to}T23:59:59Z` })
        .andWhere('subscription.isActive = :isActive', { isActive: true })
        .andWhere('user.gender IS NOT NULL')
        .groupBy('user.gender')
        .getRawMany(),

      // Subscriptions by age
      this.getSubscriptionsByAge(params.from, params.to),

      // Top channels by subscriptions
      this.dataSource
        .createQueryBuilder(UserSubscription, 'subscription')
        .leftJoin('subscription.program', 'program')
        .leftJoin('program.channel', 'channel')
        .select('channel.id', 'channelId')
        .addSelect('channel.name', 'channelName')
        .addSelect('COUNT(*)', 'count')
        .where('subscription.createdAt >= :from', { from: `${params.from}T00:00:00Z` })
        .andWhere('subscription.createdAt <= :to', { to: `${params.to}T23:59:59Z` })
        .andWhere('subscription.isActive = :isActive', { isActive: true })
        .groupBy('channel.id, channel.name')
        .orderBy('count', 'DESC')
        .limit(5)
        .getRawMany(),

      // Top programs by subscriptions
      this.dataSource
        .createQueryBuilder(UserSubscription, 'subscription')
        .leftJoin('subscription.program', 'program')
        .leftJoin('program.channel', 'channel')
        .select('program.id', 'programId')
        .addSelect('program.name', 'programName')
        .addSelect('channel.name', 'channelName')
        .addSelect('COUNT(*)', 'count')
        .where('subscription.createdAt >= :from', { from: `${params.from}T00:00:00Z` })
        .andWhere('subscription.createdAt <= :to', { to: `${params.to}T23:59:59Z` })
        .andWhere('subscription.isActive = :isActive', { isActive: true })
        .groupBy('program.id, program.name, channel.name')
        .orderBy('count', 'DESC')
        .limit(5)
        .getRawMany(),

      // YouTube clicks from PostHog
      fetchYouTubeClicks('click_youtube_live', params.from, params.to, 10000),
      fetchYouTubeClicks('click_youtube_deferred', params.from, params.to, 10000),
      // Streamer clicks from PostHog
      fetchStreamerClicks('click_streamer_live', params.from, params.to, 10000),
      fetchStreamerClicks('click_streamer_offline', params.from, params.to, 10000),
    ]);

    // Process gender data
    const usersByGenderMap = { male: 0, female: 0, non_binary: 0, rather_not_say: 0 };
    usersByGender.forEach(item => {
      usersByGenderMap[item.gender] = parseInt(item.count);
    });

    const subscriptionsByGenderMap = { male: 0, female: 0, non_binary: 0, rather_not_say: 0 };
    subscriptionsByGender.forEach(item => {
      subscriptionsByGenderMap[item.gender] = parseInt(item.count);
    });

    // Process YouTube clicks
    const topChannelsByClicksLive = await aggregateClicksBy(youtubeClicksLive, 'channel_name');
    const topChannelsByClicksDeferred = await aggregateClicksBy(youtubeClicksDeferred, 'channel_name');

    // Get program clicks with channel information
    const [programClicksLive, programClicksDeferred] = await Promise.all([
      fetchYouTubeClicks('click_youtube_live', params.from, params.to, 10000),
      fetchYouTubeClicks('click_youtube_deferred', params.from, params.to, 10000),
    ]);

    const topProgramsByClicksLive = await aggregateClicksBy(programClicksLive, 'program_name');
    const topProgramsByClicksDeferred = await aggregateClicksBy(programClicksDeferred, 'program_name');

    // Get channel names for programs (we'll need to fetch this from database)
    const programNames = [
      ...Object.keys(topProgramsByClicksLive),
      ...Object.keys(topProgramsByClicksDeferred)
    ];

    const programChannels = await this.dataSource
      .createQueryBuilder(Program, 'program')
      .leftJoin('program.channel', 'channel')
      .select('program.name', 'programName')
      .addSelect('channel.name', 'channelName')
      .where('program.name IN (:...programNames)', { programNames })
      .getRawMany();

    const programChannelMap = programChannels.reduce((map, item) => {
      map[item.programName] = item.channelName;
      return map;
    }, {} as Record<string, string>);

    // Process streamer clicks - aggregate by streamer_name with platform info
    const processStreamerClicks = (events: typeof streamerClicksLive) => {
      const streamerMap = new Map<string, { streamerName: string; platform: string; count: number }>();

      for (const event of events) {
        const streamerName = event.properties?.streamer_name || 'Unknown';
        const platform = event.properties?.platform || 'unknown';
        const key = `${streamerName}__${platform}`;

        if (!streamerMap.has(key)) {
          streamerMap.set(key, { streamerName, platform, count: 0 });
        }
        streamerMap.get(key)!.count += 1;
      }

      return Array.from(streamerMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    };

    const processStreamerClicksByPlatform = (events: typeof streamerClicksLive, platformFilter: string) => {
      const filtered = events.filter(e => e.properties?.platform === platformFilter);
      const streamerMap = new Map<string, { streamerName: string; count: number }>();

      for (const event of filtered) {
        const streamerName = event.properties?.streamer_name || 'Unknown';

        if (!streamerMap.has(streamerName)) {
          streamerMap.set(streamerName, { streamerName, count: 0 });
        }
        streamerMap.get(streamerName)!.count += 1;
      }

      return Array.from(streamerMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    };

    // All streamers rankings
    const topStreamersByClicksLive = processStreamerClicks(streamerClicksLive);
    const topStreamersByClicksOffline = processStreamerClicks(streamerClicksOffline);

    // Log streamer data for debugging
    console.log('Streamer clicks data:', {
      streamerClicksLive: streamerClicksLive.length,
      streamerClicksOffline: streamerClicksOffline.length,
      topStreamersByClicksLive,
      topStreamersByClicksOffline,
    });

    // Twitch-only rankings
    const topTwitchStreamersByClicksLive = processStreamerClicksByPlatform(streamerClicksLive, 'twitch');
    const topTwitchStreamersByClicksOffline = processStreamerClicksByPlatform(streamerClicksOffline, 'twitch');

    // Kick-only rankings
    const topKickStreamersByClicksLive = processStreamerClicksByPlatform(streamerClicksLive, 'kick');
    const topKickStreamersByClicksOffline = processStreamerClicksByPlatform(streamerClicksOffline, 'kick');

    const data: WeeklyReportData = {
      from: params.from,
      to: params.to,
      totalNewUsers,
      usersByGender: usersByGenderMap,
      totalNewSubscriptions,
      subscriptionsByGender: subscriptionsByGenderMap,
      subscriptionsByAge,
      subscriptionsByProgram: [],
      subscriptionsByChannel: [],
      topChannelsBySubscriptions: topChannelsBySubscriptions.map(c => ({
        channelId: c.channelId,
        channelName: c.channelName,
        count: parseInt(c.count),
      })),
      topChannelsByClicksLive: Object.entries(topChannelsByClicksLive)
        .map(([channelName, count]) => ({ channelName, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      topChannelsByClicksDeferred: Object.entries(topChannelsByClicksDeferred)
        .map(([channelName, count]) => ({ channelName, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      topProgramsBySubscriptions: topProgramsBySubscriptions.map(p => ({
        programId: p.programId,
        programName: p.programName,
        channelName: p.channelName,
        count: parseInt(p.count),
      })),
      topProgramsByClicksLive: Object.entries(topProgramsByClicksLive)
        .map(([programName, count]) => ({
          programName,
          channelName: programChannelMap[programName] || 'Unknown',
          count
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      topProgramsByClicksDeferred: Object.entries(topProgramsByClicksDeferred)
        .map(([programName, count]) => ({
          programName,
          channelName: programChannelMap[programName] || 'Unknown',
          count
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      // Streamer rankings
      topStreamersByClicksLive,
      topStreamersByClicksOffline,
      topTwitchStreamersByClicksLive,
      topTwitchStreamersByClicksOffline,
      topKickStreamersByClicksLive,
      topKickStreamersByClicksOffline,
      rankingChanges: [],
    };

    // Generate charts
    const charts = {
      usersByGender: (await renderPieChart(pieChartConfig({
        labels: Object.keys(data.usersByGender),
        data: Object.values(data.usersByGender),
        title: 'Usuarios nuevos por género',
      }))).toString('base64'),
      subsByGender: (await renderPieChart(pieChartConfig({
        labels: Object.keys(data.subscriptionsByGender),
        data: Object.values(data.subscriptionsByGender),
        title: 'Suscripciones nuevas por género',
      }))).toString('base64'),
      subsByAge: (await renderPieChart(pieChartConfig({
        labels: Object.keys(data.subscriptionsByAge),
        data: Object.values(data.subscriptionsByAge),
        title: 'Suscripciones nuevas por grupo de edad',
      }))).toString('base64'),
      topChannelsBySubs: (await renderBarChart(barChartConfig({
        labels: data.topChannelsBySubscriptions.map(c => c.channelName),
        datasets: [{ label: 'Suscripciones', data: data.topChannelsBySubscriptions.map(c => c.count) }],
        title: 'Top 5 canales por suscripciones',
        yLabel: 'Suscripciones',
      }))).toString('base64'),
      topChannelsByClicksLive: (await renderBarChart(barChartConfig({
        labels: data.topChannelsByClicksLive.map(c => c.channelName),
        datasets: [{ label: 'Clicks en vivo', data: data.topChannelsByClicksLive.map(c => c.count) }],
        title: 'Top 5 canales por clicks en YouTube (en vivo)',
        yLabel: 'Clicks',
      }))).toString('base64'),
      topChannelsByClicksDeferred: (await renderBarChart(barChartConfig({
        labels: data.topChannelsByClicksDeferred.map(c => c.channelName),
        datasets: [{ label: 'Clicks diferidos', data: data.topChannelsByClicksDeferred.map(c => c.count) }],
        title: 'Top 5 canales por clicks en YouTube (diferido)',
        yLabel: 'Clicks',
      }))).toString('base64'),
      topProgramsBySubs: (await renderBarChart(barChartConfig({
        labels: data.topProgramsBySubscriptions.map(p => p.programName),
        datasets: [{ label: 'Suscripciones', data: data.topProgramsBySubscriptions.map(p => p.count) }],
        title: 'Top 5 programas por suscripciones',
        yLabel: 'Suscripciones',
      }))).toString('base64'),
      topProgramsByClicksLive: (await renderBarChart(barChartConfig({
        labels: data.topProgramsByClicksLive.map(p => p.programName),
        datasets: [{ label: 'Clicks en vivo', data: data.topProgramsByClicksLive.map(p => p.count) }],
        title: 'Top 5 programas por clicks en YouTube (en vivo)',
        yLabel: 'Clicks',
      }))).toString('base64'),
      topProgramsByClicksDeferred: (await renderBarChart(barChartConfig({
        labels: data.topProgramsByClicksDeferred.map(p => p.programName),
        datasets: [{ label: 'Clicks diferidos', data: data.topProgramsByClicksDeferred.map(p => p.count) }],
        title: 'Top 5 programas por clicks en YouTube (diferido)',
        yLabel: 'Clicks',
      }))).toString('base64'),
      // Streamer charts
      topStreamersByClicksLive: data.topStreamersByClicksLive?.length ? (await renderBarChart(barChartConfig({
        labels: data.topStreamersByClicksLive.map(s => `${s.streamerName} (${s.platform})`),
        datasets: [{ label: 'Clicks en vivo', data: data.topStreamersByClicksLive.map(s => s.count) }],
        title: 'Top 5 streamers por clicks (en vivo)',
        yLabel: 'Clicks',
      }))).toString('base64') : null,
      topStreamersByClicksOffline: data.topStreamersByClicksOffline?.length ? (await renderBarChart(barChartConfig({
        labels: data.topStreamersByClicksOffline.map(s => `${s.streamerName} (${s.platform})`),
        datasets: [{ label: 'Clicks offline', data: data.topStreamersByClicksOffline.map(s => s.count) }],
        title: 'Top 5 streamers por clicks (offline)',
        yLabel: 'Clicks',
      }))).toString('base64') : null,
      topTwitchStreamersByClicksLive: data.topTwitchStreamersByClicksLive?.length ? (await renderBarChart(barChartConfig({
        labels: data.topTwitchStreamersByClicksLive.map(s => s.streamerName),
        datasets: [{ label: 'Clicks en vivo', data: data.topTwitchStreamersByClicksLive.map(s => s.count) }],
        title: 'Top 5 streamers Twitch por clicks (en vivo)',
        yLabel: 'Clicks',
      }))).toString('base64') : null,
      topTwitchStreamersByClicksOffline: data.topTwitchStreamersByClicksOffline?.length ? (await renderBarChart(barChartConfig({
        labels: data.topTwitchStreamersByClicksOffline.map(s => s.streamerName),
        datasets: [{ label: 'Clicks offline', data: data.topTwitchStreamersByClicksOffline.map(s => s.count) }],
        title: 'Top 5 streamers Twitch por clicks (offline)',
        yLabel: 'Clicks',
      }))).toString('base64') : null,
      topKickStreamersByClicksLive: data.topKickStreamersByClicksLive?.length ? (await renderBarChart(barChartConfig({
        labels: data.topKickStreamersByClicksLive.map(s => s.streamerName),
        datasets: [{ label: 'Clicks en vivo', data: data.topKickStreamersByClicksLive.map(s => s.count) }],
        title: 'Top 5 streamers Kick por clicks (en vivo)',
        yLabel: 'Clicks',
      }))).toString('base64') : null,
      topKickStreamersByClicksOffline: data.topKickStreamersByClicksOffline?.length ? (await renderBarChart(barChartConfig({
        labels: data.topKickStreamersByClicksOffline.map(s => s.streamerName),
        datasets: [{ label: 'Clicks offline', data: data.topKickStreamersByClicksOffline.map(s => s.count) }],
        title: 'Top 5 streamers Kick por clicks (offline)',
        yLabel: 'Clicks',
      }))).toString('base64') : null,
    };

    return await generateWeeklyReportPdf({ data, charts });
  }

  private buildUsersReportHtml(users: any[], from: string, to: string): string {
    return `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            h1 { color: #333; }
            table { border-collapse: collapse; width: 100%; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <h1>Reporte de Usuarios</h1>
          <p><strong>Período:</strong> ${from} a ${to}</p>
          <p><strong>Total de usuarios:</strong> ${users.length}</p>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Apellido</th>
                <th>Email</th>
                <th>Género</th>
                <th>Fecha de Nacimiento</th>
                <th>Fecha de Registro</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(user => `
                <tr>
                  <td>${user.id}</td>
                  <td>${user.firstName}</td>
                  <td>${user.lastName}</td>
                  <td>${user.email}</td>
                  <td>${user.gender}</td>
                  <td>${user.birthDate}</td>
                  <td>${user.createdAt}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
  }

  private buildSubscriptionsReportHtml(subscriptions: any[], from: string, to: string): string {
    return `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            h1 { color: #333; }
            table { border-collapse: collapse; width: 100%; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <h1>Reporte de Suscripciones</h1>
          <p><strong>Período:</strong> ${from} a ${to}</p>
          <p><strong>Total de suscripciones:</strong> ${subscriptions.length}</p>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre Usuario</th>
                <th>Apellido Usuario</th>
                <th>Email Usuario</th>
                <th>Programa</th>
                <th>Canal</th>
                <th>Fecha de Suscripción</th>
              </tr>
            </thead>
            <tbody>
              ${subscriptions.map(sub => `
                <tr>
                  <td>${sub.id}</td>
                  <td>${sub.userFirstName}</td>
                  <td>${sub.userLastName}</td>
                  <td>${sub.userEmail}</td>
                  <td>${sub.programName}</td>
                  <td>${sub.channelName}</td>
                  <td>${sub.createdAt}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
  }

  private async htmlToPdfBuffer(html: string): Promise<Buffer> {
    let page = null;
    try {
      const browser = await getBrowser();
      page = await browser.newPage();

      // Set a longer timeout for page operations
      page.setDefaultTimeout(60000);

      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        timeout: 60000
      });

      return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
    } catch (error) {
      console.error('Error generating PDF from HTML:', error);
      throw new Error(`Failed to generate PDF from HTML: ${error.message}`);
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (error) {
          console.warn('Error closing page:', error);
        }
      }
    }
  }

  private async getSubscriptionsByAge(from: string, to: string) {
    const subscriptions = await this.dataSource
      .createQueryBuilder(UserSubscription, 'subscription')
      .leftJoin('subscription.user', 'user')
      .select('"user"."birth_date"', 'birthDate')
      .where('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
      .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
      .andWhere('subscription.isActive = :isActive', { isActive: true })
      .andWhere('"user"."birth_date" IS NOT NULL')
      .getRawMany();

    const ageGroups = { under18: 0, age18to30: 0, age30to45: 0, age45to60: 0, over60: 0 };
    const currentYear = new Date().getFullYear();

    subscriptions.forEach(sub => {
      const birthYear = new Date(sub.birthDate).getFullYear();
      const age = currentYear - birthYear;

      if (age < 18) ageGroups.under18++;
      else if (age >= 18 && age <= 30) ageGroups.age18to30++;
      else if (age > 30 && age <= 45) ageGroups.age30to45++;
      else if (age > 45 && age <= 60) ageGroups.age45to60++;
      else ageGroups.over60++;
    });

    return ageGroups;
  }

  async getTopChannels({ metric, from, to, limit, groupBy }: { metric: 'subscriptions' | 'youtube_clicks', from: string, to: string, limit: number, groupBy?: string }) {
    if (groupBy === 'gender' || groupBy === 'age') {
      if (metric === 'subscriptions') {
        // Group subscriptions by channel and gender/age
        const qb = this.dataSource
          .createQueryBuilder('channel', 'channel')
          .leftJoin('channel.programs', 'program')
          .leftJoin('program.subscriptions', 'subscription')
          .leftJoin('subscription.user', 'user')
          .select('channel.id', 'id')
          .addSelect('channel.name', 'name')
          .addSelect(groupBy === 'gender' ? `
            CASE
              WHEN "user"."gender" IS NULL THEN 'rather_not_say'
              ELSE "user"."gender"
            END
          ` : `
            CASE
              WHEN "user"."birth_date" IS NULL THEN 'unknown'
              WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") < 18 THEN 'under18'
              WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") < 30 THEN 'age18to30'
              WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") < 45 THEN 'age30to45'
              WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") < 60 THEN 'age45to60'
              ELSE 'over60'
            END
          `, 'groupKey')
          .addSelect('COUNT(subscription.id)', 'count')
          .where('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
          .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
          .andWhere('subscription.isActive = :isActive', { isActive: true })
          .groupBy('channel.id, channel.name')
          .addGroupBy('"groupKey"')
          .orderBy('COUNT(subscription.id)', 'DESC');

        const raw = await qb.getRawMany();
        // Aggregate into { name, counts: { gender/age: count } }
        const map = new Map();
        for (const row of raw) {
          if (!map.has(row.id)) {
            map.set(row.id, { id: row.id, name: row.name, counts: {} });
          }
          (map.get(row.id).counts as any)[row.groupKey || 'unknown'] = parseInt(row.count, 10);
        }
        // Sort by total and limit
        const arr = Array.from(map.values());
        arr.sort((a, b) => {
          const totalA = Object.values(a.counts).reduce((sum: number, v) => sum + Number(v), 0);
          const totalB = Object.values(b.counts).reduce((sum: number, v) => sum + Number(v), 0);
          return Number(totalB) - Number(totalA);
        });
        return arr.slice(0, limit);
      } else if (metric === 'youtube_clicks') {
        const [live, deferred] = await Promise.all([
          fetchYouTubeClicks('click_youtube_live', from, to, 10000),
          fetchYouTubeClicks('click_youtube_deferred', from, to, 10000),
        ]);
        const map = new Map();
        for (const row of [...live, ...deferred]) {
          const channel = row.properties.channel_name || 'unknown';
          let groupKey = 'unknown';
          if (groupBy === 'gender') {
            groupKey = row.properties.user_gender || 'unknown';
          } else if (groupBy === 'age') {
            const age = Number(row.properties.user_age);
            if (isNaN(age)) groupKey = 'unknown';
            else if (age < 18) groupKey = 'under18';
            else if (age < 30) groupKey = 'age18to30';
            else if (age < 45) groupKey = 'age30to45';
            else if (age < 60) groupKey = 'age45to60';
            else groupKey = 'over60';
          }
          if (!map.has(channel)) map.set(channel, { name: channel, counts: {} as Record<string, number> });
          (map.get(channel).counts as any)[groupKey] = Number((map.get(channel).counts as any)[groupKey] ?? 0) + 1;
        }
        const arr = Array.from(map.values());
        arr.sort((a, b) => {
          const totalA = Object.values(a.counts).reduce((sum: number, v) => sum + Number(v), 0);
          const totalB = Object.values(b.counts).reduce((sum: number, v) => sum + Number(v), 0);
          return Number(totalB) - Number(totalA);
        });
        return arr.slice(0, limit);
      }
      return [];
    }
    // Default (no groupBy): existing logic
    if (metric === 'subscriptions') {
      // Top channels by subscriptions from DB
      const results = await this.dataSource
        .createQueryBuilder('channel', 'channel')
        .leftJoin('channel.programs', 'program')
        .leftJoin('program.subscriptions', 'subscription')
        .select('channel.id', 'id')
        .addSelect('channel.name', 'name')
        .addSelect('COUNT(subscription.id)', 'count')
        .where('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
        .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
        .andWhere('subscription.isActive = :isActive', { isActive: true })
        .groupBy('channel.id')
        .addGroupBy('channel.name')
        .orderBy('count', 'DESC')
        .limit(limit)
        .getRawMany();
      // Convert count from string to number
      return results.map(result => ({
        ...result,
        count: parseInt(result.count, 10)
      }));
    } else if (metric === 'youtube_clicks') {
      // Top channels by YouTube clicks from PostHog (aggregate live + deferred)
      console.log(`🔍 Fetching YouTube clicks for channels from ${from} to ${to}`);

      const [live, deferred] = await Promise.all([
        fetchYouTubeClicks('click_youtube_live', from, to, 10000),
        fetchYouTubeClicks('click_youtube_deferred', from, to, 10000),
      ]);

      console.log(`📊 YouTube clicks data received:`, {
        liveCount: live.length,
        deferredCount: deferred.length,
        totalEvents: live.length + deferred.length
      });

      // Aggregate by channel name
      const map = new Map();
      for (const row of [...live, ...deferred]) {
        const key = row.properties.channel_name || 'unknown';
        if (!map.has(key)) map.set(key, { name: key, count: 0 });
        map.get(key).count += 1;
      }

      const result = Array.from(map.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      console.log(`✅ Aggregated YouTube clicks result:`, result);
      return result;
    }
    return [];
  }

  async getTopPrograms({ metric, from, to, limit, groupBy }: { metric: 'subscriptions' | 'youtube_clicks', from: string, to: string, limit: number, groupBy?: string }) {
    if (groupBy === 'gender' || groupBy === 'age') {
      if (metric === 'subscriptions') {
        // Group subscriptions by program and gender/age
        const qb = this.dataSource
          .createQueryBuilder('program', 'program')
          .leftJoin('program.subscriptions', 'subscription')
          .leftJoin('program.channel', 'channel')
          .leftJoin('subscription.user', 'user')
          .select('program.id', 'id')
          .addSelect('program.name', 'name')
          .addSelect('channel.name', 'channelName')
          .addSelect(groupBy === 'gender' ? `
            CASE
              WHEN "user"."gender" IS NULL THEN 'rather_not_say'
              ELSE "user"."gender"
            END
          ` : `
            CASE
              WHEN "user"."birth_date" IS NULL THEN 'unknown'
              WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") < 18 THEN 'under18'
              WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") < 30 THEN 'age18to30'
              WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") < 45 THEN 'age30to45'
              WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") < 60 THEN 'age45to60'
              ELSE 'over60'
            END
          `, 'groupKey')
          .addSelect('COUNT(subscription.id)', 'count')
          .where('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
          .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
          .andWhere('subscription.isActive = :isActive', { isActive: true })
          .groupBy('program.id, program.name, channel.name')
          .addGroupBy('"groupKey"')
          .orderBy('COUNT(subscription.id)', 'DESC');

        const raw = await qb.getRawMany();
        // Aggregate into { name, channelName, counts: { gender/age: count } }
        const map = new Map();
        for (const row of raw) {
          if (!map.has(row.id)) {
            map.set(row.id, { id: row.id, name: row.name, channelName: row.channelName, counts: {} as Record<string, number> });
          }
          map.get(row.id).counts[row.groupKey || 'unknown'] = parseInt(row.count, 10);
        }
        // Sort by total and limit
        const arr = Array.from(map.values());
        arr.sort((a, b) => {
          const totalA = Object.values(a.counts).reduce((sum: number, v) => sum + Number(v), 0);
          const totalB = Object.values(b.counts).reduce((sum: number, v) => sum + Number(v), 0);
          return Number(totalB) - Number(totalA);
        });
        return arr.slice(0, limit);
      } else if (metric === 'youtube_clicks') {
        const [live, deferred] = await Promise.all([
          fetchYouTubeClicks('click_youtube_live', from, to, 10000),
          fetchYouTubeClicks('click_youtube_deferred', from, to, 10000),
        ]);
        const map = new Map();
        for (const row of [...live, ...deferred]) {
          const program = row.properties.program_name || 'unknown';
          const channel = row.properties.channel_name || 'unknown';
          const key = `${program}|||${channel}`;
          let groupKey = 'unknown';
          if (groupBy === 'gender') {
            groupKey = row.properties.user_gender || 'unknown';
          } else if (groupBy === 'age') {
            const age = Number(row.properties.user_age);
            if (isNaN(age)) groupKey = 'unknown';
            else if (age < 18) groupKey = 'under18';
            else if (age < 30) groupKey = 'age18to30';
            else if (age < 45) groupKey = 'age30to45';
            else if (age < 60) groupKey = 'age45to60';
            else groupKey = 'over60';
          }
          if (!map.has(key)) map.set(key, { name: program, channelName: channel, counts: {} as Record<string, number> });
          map.get(key).counts[groupKey] = (map.get(key).counts[groupKey] || 0) + 1;
        }
        const arr = Array.from(map.values());
        arr.sort((a, b) => {
          const totalA = Object.values(a.counts).reduce((sum: number, v) => sum + Number(v), 0);
          const totalB = Object.values(b.counts).reduce((sum: number, v) => sum + Number(v), 0);
          return Number(totalB) - Number(totalA);
        });
        return arr.slice(0, limit);
      }
      return [];
    }
    // Default (no groupBy): existing logic
    if (metric === 'subscriptions') {
      // Top programs by subscriptions from DB
      const results = await this.dataSource
        .createQueryBuilder('program', 'program')
        .leftJoin('program.subscriptions', 'subscription')
        .leftJoin('program.channel', 'channel')
        .select('program.id', 'id')
        .addSelect('program.name', 'name')
        .addSelect('channel.name', 'channelName')
        .addSelect('COUNT(subscription.id)', 'count')
        .where('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
        .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
        .andWhere('subscription.isActive = :isActive', { isActive: true })
        .groupBy('program.id')
        .addGroupBy('program.name')
        .addGroupBy('channel.name')
        .orderBy('count', 'DESC')
        .limit(limit)
        .getRawMany();
      // Convert count from string to number
      return results.map(result => ({
        ...result,
        count: parseInt(result.count, 10)
      }));
    } else if (metric === 'youtube_clicks') {
      // Top programs by YouTube clicks from PostHog (aggregate live + deferred)
      console.log(`🔍 Fetching YouTube clicks for programs from ${from} to ${to}`);

      const [live, deferred] = await Promise.all([
        fetchYouTubeClicks('click_youtube_live', from, to, 10000),
        fetchYouTubeClicks('click_youtube_deferred', from, to, 10000),
      ]);

      console.log(`📊 YouTube clicks data received for programs:`, {
        liveCount: live.length,
        deferredCount: deferred.length,
        totalEvents: live.length + deferred.length
      });

      // Aggregate by program name
      const map = new Map();
      for (const row of [...live, ...deferred]) {
        const key = row.properties.program_name || 'unknown';
        if (!map.has(key)) map.set(key, { name: key, count: 0 });
        map.get(key).count += 1;
      }

      const result = Array.from(map.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      console.log(`✅ Aggregated YouTube clicks result for programs:`, result);
      return result;
    }
    return [];
  }

  async generatePeriodicReport(params: {
    from: string;
    to: string;
    channelId?: number;
    period: 'monthly' | 'quarterly' | 'yearly';
  }): Promise<Buffer> {
    const { from, to, channelId, period } = params;

    // Fetch data similar to weekly report but with different time ranges
    const [
      totalNewUsers,
      usersByGender,
      totalNewSubscriptions,
      subscriptionsByGender,
      subscriptionsByAge,
      topChannelsBySubscriptions,
      topProgramsBySubscriptions,
      youtubeClicksLive,
      youtubeClicksDeferred
    ] = await Promise.all([
      // Total new users
      this.dataSource
        .createQueryBuilder(User, 'user')
        .where('user.createdAt >= :from', { from: `${from}T00:00:00Z` })
        .andWhere('user.createdAt <= :to', { to: `${to}T23:59:59Z` })
        .getCount(),

      // Users by gender
      this.dataSource
        .createQueryBuilder(User, 'user')
        .select('user.gender', 'gender')
        .addSelect('COUNT(*)', 'count')
        .where('user.createdAt >= :from', { from: `${from}T00:00:00Z` })
        .andWhere('user.createdAt <= :to', { to: `${to}T23:59:59Z` })
        .andWhere('user.gender IS NOT NULL')
        .groupBy('user.gender')
        .getRawMany(),

      // Total new subscriptions
      this.dataSource
        .createQueryBuilder(UserSubscription, 'subscription')
        .where('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
        .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
        .andWhere('subscription.isActive = :isActive', { isActive: true })
        .getCount(),

      // Subscriptions by gender
      this.dataSource
        .createQueryBuilder(UserSubscription, 'subscription')
        .leftJoin('subscription.user', 'user')
        .select('user.gender', 'gender')
        .addSelect('COUNT(*)', 'count')
        .where('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
        .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
        .andWhere('subscription.isActive = :isActive', { isActive: true })
        .andWhere('user.gender IS NOT NULL')
        .groupBy('user.gender')
        .getRawMany(),

      // Subscriptions by age
      this.getSubscriptionsByAge(from, to),

      // Top channels by subscriptions
      this.dataSource
        .createQueryBuilder(UserSubscription, 'subscription')
        .leftJoin('subscription.program', 'program')
        .leftJoin('program.channel', 'channel')
        .select('channel.id', 'channelId')
        .addSelect('channel.name', 'channelName')
        .addSelect('COUNT(*)', 'count')
        .where('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
        .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
        .andWhere('subscription.isActive = :isActive', { isActive: true })
        .groupBy('channel.id, channel.name')
        .orderBy('count', 'DESC')
        .limit(5)
        .getRawMany(),

      // Top programs by subscriptions
      this.dataSource
        .createQueryBuilder(UserSubscription, 'subscription')
        .leftJoin('subscription.program', 'program')
        .leftJoin('program.channel', 'channel')
        .select('program.id', 'programId')
        .addSelect('program.name', 'programName')
        .addSelect('channel.name', 'channelName')
        .addSelect('COUNT(*)', 'count')
        .where('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
        .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
        .andWhere('subscription.isActive = :isActive', { isActive: true })
        .groupBy('program.id, program.name, channel.name')
        .orderBy('count', 'DESC')
        .limit(5)
        .getRawMany(),

      // YouTube clicks (live)
      fetchYouTubeClicks('click_youtube_live', from, to, 10000),
      // YouTube clicks (deferred)
      fetchYouTubeClicks('click_youtube_deferred', from, to, 10000),
    ]);

    // Convert arrays to objects for compatibility
    const usersByGenderObj = usersByGender.reduce((acc, item) => {
      acc[item.gender] = parseInt(item.count);
      return acc;
    }, {} as Record<string, number>);

    const subscriptionsByGenderObj = subscriptionsByGender.reduce((acc, item) => {
      acc[item.gender] = parseInt(item.count);
      return acc;
    }, {} as Record<string, number>);

    // Aggregate YouTube clicks
    const youtubeClicksLiveAggregated = await aggregateClicksBy(youtubeClicksLive, 'channel_name');
    const youtubeClicksDeferredAggregated = await aggregateClicksBy(youtubeClicksDeferred, 'channel_name');

    const reportData: WeeklyReportData = {
      from,
      to,
      totalNewUsers,
      usersByGender: usersByGenderObj,
      totalNewSubscriptions,
      subscriptionsByGender: subscriptionsByGenderObj,
      subscriptionsByAge,
      subscriptionsByProgram: [],
      subscriptionsByChannel: [],
      topChannelsBySubscriptions,
      topChannelsByClicksLive: Object.entries(youtubeClicksLiveAggregated).map(([name, count]) => ({ channelName: name, count })),
      topChannelsByClicksDeferred: Object.entries(youtubeClicksDeferredAggregated).map(([name, count]) => ({ channelName: name, count })),
      topProgramsBySubscriptions,
      topProgramsByClicksLive: [],
      topProgramsByClicksDeferred: [],
      rankingChanges: [],
    };

    // Generate charts
    const charts = {
      usersByGender: (await renderPieChart(pieChartConfig({
        labels: Object.keys(reportData.usersByGender),
        data: Object.values(reportData.usersByGender),
        title: 'Usuarios nuevos por género',
      }))).toString('base64'),
      subsByGender: (await renderPieChart(pieChartConfig({
        labels: Object.keys(reportData.subscriptionsByGender),
        data: Object.values(reportData.subscriptionsByGender),
        title: 'Suscripciones nuevas por género',
      }))).toString('base64'),
      subsByAge: (await renderPieChart(pieChartConfig({
        labels: Object.keys(reportData.subscriptionsByAge),
        data: Object.values(reportData.subscriptionsByAge),
        title: 'Suscripciones nuevas por grupo de edad',
      }))).toString('base64'),
      topChannelsBySubs: (await renderBarChart(barChartConfig({
        labels: reportData.topChannelsBySubscriptions.map(c => c.channelName),
        datasets: [{ label: 'Suscripciones', data: reportData.topChannelsBySubscriptions.map(c => c.count) }],
        title: 'Top 5 canales por suscripciones',
        yLabel: 'Suscripciones',
      }))).toString('base64'),
      topChannelsByClicksLive: (await renderBarChart(barChartConfig({
        labels: reportData.topChannelsByClicksLive.map(c => c.channelName),
        datasets: [{ label: 'Clicks en vivo', data: reportData.topChannelsByClicksLive.map(c => c.count) }],
        title: 'Top 5 canales por clicks en YouTube (en vivo)',
        yLabel: 'Clicks',
      }))).toString('base64'),
      topChannelsByClicksDeferred: (await renderBarChart(barChartConfig({
        labels: reportData.topChannelsByClicksDeferred.map(c => c.channelName),
        datasets: [{ label: 'Clicks diferidos', data: reportData.topChannelsByClicksDeferred.map(c => c.count) }],
        title: 'Top 5 canales por clicks en YouTube (diferido)',
        yLabel: 'Clicks',
      }))).toString('base64'),
      topProgramsBySubs: (await renderBarChart(barChartConfig({
        labels: reportData.topProgramsBySubscriptions.map(p => p.programName),
        datasets: [{ label: 'Suscripciones', data: reportData.topProgramsBySubscriptions.map(p => p.count) }],
        title: 'Top 5 programas por suscripciones',
        yLabel: 'Suscripciones',
      }))).toString('base64'),
      topProgramsByClicksLive: (await renderBarChart(barChartConfig({
        labels: reportData.topProgramsByClicksLive.map(p => p.programName),
        datasets: [{ label: 'Clicks en vivo', data: reportData.topProgramsByClicksLive.map(p => p.count) }],
        title: 'Top 5 programas por clicks en YouTube (en vivo)',
        yLabel: 'Clicks',
      }))).toString('base64'),
      topProgramsByClicksDeferred: (await renderBarChart(barChartConfig({
        labels: reportData.topProgramsByClicksDeferred.map(p => p.programName),
        datasets: [{ label: 'Clicks diferidos', data: reportData.topProgramsByClicksDeferred.map(p => p.count) }],
        title: 'Top 5 programas por clicks en YouTube (diferido)',
        yLabel: 'Clicks',
      }))).toString('base64'),
    };

    return generatePeriodicReportPdf({ data: reportData, charts, period });
  }

  async generateChannelReport(from: string, to: string, format: 'csv' | 'pdf', channelId: number): Promise<Buffer | string> {
    // Fetch channel-specific data
    const channel = await this.dataSource
      .createQueryBuilder(Channel, 'channel')
      .where('channel.id = :channelId', { channelId })
      .getOne();

    if (!channel) {
      throw new Error('Channel not found');
    }

    // Fetch subscriptions for this channel
    const subscriptions = await this.dataSource
      .createQueryBuilder(UserSubscription, 'subscription')
      .leftJoinAndSelect('subscription.user', 'user')
      .leftJoinAndSelect('subscription.program', 'program')
      .leftJoinAndSelect('program.channel', 'channel')
      .where('channel.id = :channelId', { channelId })
      .andWhere('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
      .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
      .andWhere('subscription.isActive = :isActive', { isActive: true })
      .orderBy('subscription.createdAt', 'DESC')
      .getMany();

    const formattedSubscriptions = subscriptions.map(sub => ({
      id: sub.id,
      userFirstName: sub.user?.firstName || 'N/A',
      userLastName: sub.user?.lastName || 'N/A',
      userEmail: sub.user?.email || 'N/A',
      programName: sub.program?.name || 'N/A',
      createdAt: dayjs(sub.createdAt).format('YYYY-MM-DD'),
    }));

    if (format === 'csv') {
      return new Promise((resolve, reject) => {
        stringify(formattedSubscriptions, {
          header: true,
          columns: {
            id: 'ID',
            userFirstName: 'Nombre',
            userLastName: 'Apellido',
            userEmail: 'Email',
            programName: 'Programa',
            createdAt: 'Fecha de Suscripción',
          },
        }, (err, output) => {
          if (err) reject(err);
          else resolve(output);
        });
      });
    } else {
      const html = this.buildChannelReportHtml(formattedSubscriptions, channel, from, to);
      return await this.htmlToPdfBuffer(html);
    }
  }

  private buildChannelReportHtml(subscriptions: any[], channel: any, from: string, to: string): string {
    const totalSubscriptions = subscriptions.length;
    const uniqueUsers = new Set(subscriptions.map(s => s.userEmail)).size;
    const uniquePrograms = new Set(subscriptions.map(s => s.programName)).size;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte del Canal ${channel.name}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .summary { margin-bottom: 30px; }
          .summary-item { margin: 10px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Reporte del Canal: ${channel.name}</h1>
          <p>Período: ${from} a ${to}</p>
        </div>
        
        <div class="summary">
          <h2>Resumen</h2>
          <div class="summary-item"><strong>Total de Suscripciones:</strong> ${totalSubscriptions}</div>
          <div class="summary-item"><strong>Usuarios Únicos:</strong> ${uniqueUsers}</div>
          <div class="summary-item"><strong>Programas Únicos:</strong> ${uniquePrograms}</div>
        </div>

        <h2>Detalle de Suscripciones</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Apellido</th>
              <th>Email</th>
              <th>Programa</th>
              <th>Fecha de Suscripción</th>
            </tr>
          </thead>
          <tbody>
            ${subscriptions.map(sub => `
              <tr>
                <td>${sub.id}</td>
                <td>${sub.userFirstName}</td>
                <td>${sub.userLastName}</td>
                <td>${sub.userEmail}</td>
                <td>${sub.programName}</td>
                <td>${sub.createdAt}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;
  }

  async generateComprehensiveChannelReport(from: string, to: string, format: 'csv' | 'pdf', channelId: number): Promise<Buffer | string> {
    // Get channel details
    const channel = await this.dataSource
      .createQueryBuilder(Channel, 'channel')
      .where('channel.id = :channelId', { channelId })
      .getOne();

    if (!channel) {
      throw new Error(`Channel with ID ${channelId} not found`);
    }

    // Get top 5 channels by subscriptions
    const topChannelsBySubscriptions = await this.getTopChannels({
      metric: 'subscriptions',
      from,
      to,
      limit: 5
    });

    // Get top 5 channels by live YouTube clicks
    const topChannelsByLiveClicks = await this.getTopChannels({
      metric: 'youtube_clicks',
      from,
      to,
      limit: 5
    });

    // Get top 5 channels by deferred YouTube clicks
    const topChannelsByDeferredClicks = await this.getTopChannels({
      metric: 'youtube_clicks',
      from,
      to,
      limit: 5
    });

    // Find channel position in each ranking
    const channelPositionBySubscriptions = topChannelsBySubscriptions.findIndex(c => c.id === channelId) + 1;
    const channelPositionByLiveClicks = topChannelsByLiveClicks.findIndex(c => c.name === channel.name) + 1;
    const channelPositionByDeferredClicks = topChannelsByDeferredClicks.findIndex(c => c.name === channel.name) + 1;

    // Check if channel is in top 5 for each metric
    const isInTop5BySubscriptions = channelPositionBySubscriptions > 0 && channelPositionBySubscriptions <= 5;
    const isInTop5ByLiveClicks = channelPositionByLiveClicks > 0 && channelPositionByLiveClicks <= 5;
    const isInTop5ByDeferredClicks = channelPositionByDeferredClicks > 0 && channelPositionByDeferredClicks <= 5;

    // Add channel to rankings if not in top 5
    let finalSubscriptionsRanking = [...topChannelsBySubscriptions];
    let finalLiveClicksRanking = [...topChannelsByLiveClicks];
    let finalDeferredClicksRanking = [...topChannelsByDeferredClicks];

    if (!isInTop5BySubscriptions) {
      const channelData = await this.dataSource
        .createQueryBuilder('channel', 'channel')
        .leftJoin('channel.programs', 'program')
        .leftJoin('program.subscriptions', 'subscription')
        .select('channel.id', 'id')
        .addSelect('channel.name', 'name')
        .addSelect('COUNT(subscription.id)', 'count')
        .where('channel.id = :channelId', { channelId })
        .andWhere('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
        .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
        .andWhere('subscription.isActive = :isActive', { isActive: true })
        .groupBy('channel.id')
        .addGroupBy('channel.name')
        .getRawOne();

      if (channelData) {
        finalSubscriptionsRanking.push({
          ...channelData,
          name: `${channelData.name} (${channelPositionBySubscriptions}º)`
        });
      }
    }

    if (!isInTop5ByLiveClicks) {
      // Get live clicks for this specific channel
      const liveClicks = await fetchYouTubeClicks('click_youtube_live', from, to, 10000);

      const channelLiveClicks = liveClicks.filter(c => c.properties.channel_name === channel.name);
      const totalLiveClicks = channelLiveClicks.length;

      if (totalLiveClicks > 0) {
        finalLiveClicksRanking.push({
          id: channelId,
          name: `${channel.name} (${channelPositionByLiveClicks}º)`,
          count: totalLiveClicks
        });
      }
    }

    if (!isInTop5ByDeferredClicks) {
      // Get deferred clicks for this specific channel
      const deferredClicks = await fetchYouTubeClicks('click_youtube_deferred', from, to, 10000);

      const channelDeferredClicks = deferredClicks.filter(c => c.properties.channel_name === channel.name);
      const totalDeferredClicks = channelDeferredClicks.length;

      if (totalDeferredClicks > 0) {
        finalDeferredClicksRanking.push({
          id: channelId,
          name: `${channel.name} (${channelPositionByDeferredClicks}º)`,
          count: totalDeferredClicks
        });
      }
    }

    // Get top 5 programs for this channel by subscriptions
    const topProgramsBySubscriptions = await this.getTopPrograms({
      metric: 'subscriptions',
      from,
      to,
      limit: 5,
      groupBy: 'program'
    });

    // Filter programs to only show those from this channel
    // For subscriptions, we need to filter by channelName since that's what getTopPrograms returns
    const channelProgramsBySubscriptions = topProgramsBySubscriptions.filter(p => p.channelName === channel.name);

    // If no programs found by channel name, try to get programs directly for this channel
    if (channelProgramsBySubscriptions.length === 0) {
      // Direct query for programs in this channel with subscriptions
      const directPrograms = await this.dataSource
        .createQueryBuilder('program', 'program')
        .leftJoin('program.subscriptions', 'subscription')
        .leftJoin('program.channel', 'channel')
        .select('program.id', 'id')
        .addSelect('program.name', 'name')
        .addSelect('channel.name', 'channelName')
        .addSelect('COUNT(subscription.id)', 'count')
        .where('channel.id = :channelId', { channelId })
        .andWhere('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
        .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
        .andWhere('subscription.isActive = :isActive', { isActive: true })
        .groupBy('program.id')
        .addGroupBy('program.name')
        .addGroupBy('channel.name')
        .orderBy('count', 'DESC')
        .limit(5)
        .getRawMany();

      // Replace the empty array
      channelProgramsBySubscriptions.length = 0;
      channelProgramsBySubscriptions.push(...directPrograms);
    }

    // Get top 5 programs for this channel by YouTube clicks
    const topProgramsByClicks = await this.getTopPrograms({
      metric: 'youtube_clicks',
      from,
      to,
      limit: 5,
      groupBy: 'program'
    });

    // Filter programs to only show those from this channel
    // For YouTube clicks, we need to filter by channel name since there's no channelId
    const channelProgramsByClicks = topProgramsByClicks.filter(p => {
      if (p.channelName) {
        return p.channelName === channel.name;
      }
      // If no channelName, try to get it from the program data
      return false; // We'll handle this separately
    });

    // If no programs found by channel name, try to get programs directly for this channel
    if (channelProgramsByClicks.length === 0) {
      const [liveClicks, deferredClicks] = await Promise.all([
        fetchYouTubeClicks('click_youtube_live', from, to, 100),
        fetchYouTubeClicks('click_youtube_deferred', from, to, 100),
      ]);

      // Filter clicks for this specific channel
      const channelClicks = [...liveClicks, ...deferredClicks].filter(
        click => click.properties.channel_name === channel.name
      );

      // Aggregate by program name
      const programMap = new Map();
      for (const click of channelClicks) {
        const programName = click.properties.program_name || 'unknown';
        if (!programMap.has(programName)) {
          programMap.set(programName, { name: programName, count: 0 });
        }
        programMap.get(programName).count += 1;
      }

      // Convert to array and sort by count
      const channelProgramsArray = Array.from(programMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Replace the empty array
      channelProgramsByClicks.length = 0;
      channelProgramsByClicks.push(...channelProgramsArray);
    }

    // Get subscriptions by gender for this channel
    const subscriptionsByGender = await this.dataSource
      .createQueryBuilder(UserSubscription, 'subscription')
      .leftJoinAndSelect('subscription.user', 'user')
      .leftJoinAndSelect('subscription.program', 'program')
      .leftJoinAndSelect('program.channel', 'channel')
      .select([
        'user.gender',
        'COUNT(subscription.id) as count'
      ])
      .where('channel.id = :channelId', { channelId })
      .andWhere('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
      .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
      .andWhere('subscription.isActive = :isActive', { isActive: true })
      .groupBy('user.gender')
      .getRawMany();

    // Get subscriptions by age for this channel
    const subscriptionsByAge = await this.dataSource
      .createQueryBuilder(UserSubscription, 'subscription')
      .leftJoinAndSelect('subscription.user', 'user')
      .leftJoinAndSelect('subscription.program', 'program')
      .leftJoinAndSelect('program.channel', 'channel')
      .select([
        'CASE ' +
        'WHEN "user"."birth_date" IS NULL THEN \'unknown\' ' +
        'WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "user"."birth_date")) < 18 THEN \'under18\' ' +
        'WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "user"."birth_date")) BETWEEN 18 AND 30 THEN \'age18to30\' ' +
        'WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "user"."birth_date")) BETWEEN 31 AND 45 THEN \'age30to45\' ' +
        'WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "user"."birth_date")) BETWEEN 46 AND 60 THEN \'age45to60\' ' +
        'ELSE \'over60\' ' +
        'END as ageGroup',
        'COUNT(subscription.id) as count'
      ])
      .where('channel.id = :channelId', { channelId })
      .andWhere('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
      .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
      .andWhere('subscription.isActive = :isActive', { isActive: true })
      .groupBy('ageGroup')
      .getRawMany();

    // Debug: Check if we're getting any subscriptions at all for this channel
    const totalSubscriptionsForChannel = await this.dataSource
      .createQueryBuilder(UserSubscription, 'subscription')
      .leftJoinAndSelect('subscription.program', 'program')
      .leftJoinAndSelect('program.channel', 'channel')
      .where('channel.id = :channelId', { channelId })
      .andWhere('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
      .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
      .andWhere('subscription.isActive = :isActive', { isActive: true })
      .getCount();

    console.log('Total subscriptions for channel:', totalSubscriptionsForChannel);
    console.log('Channel ID being queried:', channelId);
    console.log('Date range:', { from, to });
    console.log('Raw subscriptions by gender query result:', subscriptionsByGender);
    console.log('Raw subscriptions by age query result:', subscriptionsByAge);

    // Clean up the age data to ensure no undefined values
    const cleanSubscriptionsByAge = subscriptionsByAge
      .filter(item => item.ageGroup && item.ageGroup !== 'undefined')
      .map(item => ({
        ageGroup: item.ageGroup || 'unknown',
        count: parseInt(item.count) || 0
      }));

    // Clean up gender data as well
    const cleanSubscriptionsByGender = subscriptionsByGender
      .filter(item => item.gender !== null && item.gender !== undefined)
      .map(item => ({
        gender: item.gender || 'No especificado',
        count: parseInt(item.count) || 0
      }));

    // If no demographics data found, try a simpler approach
    if (cleanSubscriptionsByAge.length === 0 && totalSubscriptionsForChannel > 0) {
      console.log('No age data found, trying simpler query...');
      // Try a simpler query without the complex CASE statement
      const simpleAgeQuery = await this.dataSource
        .createQueryBuilder(UserSubscription, 'subscription')
        .leftJoinAndSelect('subscription.user', 'user')
        .leftJoinAndSelect('subscription.program', 'program')
        .leftJoinAndSelect('program.channel', 'channel')
        .select([
          '"user"."birth_date"',
          'COUNT(subscription.id) as count'
        ])
        .where('channel.id = :channelId', { channelId })
        .andWhere('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
        .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
        .andWhere('subscription.isActive = :isActive', { isActive: true })
        .groupBy('"user"."birth_date"')
        .getRawMany();

      console.log('Simple age query result:', simpleAgeQuery);
    }

    // Create age group labels for display
    const ageGroupLabels = cleanSubscriptionsByAge.map(item => ({
      ...item,
      displayLabel: this.getAgeGroupLabel(item.ageGroup)
    }));

    // Debug logging
    console.log('Raw subscriptions by gender:', subscriptionsByGender);
    console.log('Raw subscriptions by age:', subscriptionsByAge);
    console.log('Clean subscriptions by gender:', cleanSubscriptionsByGender);
    console.log('Clean subscriptions by age:', ageGroupLabels);
    console.log('Channel programs by subscriptions:', channelProgramsBySubscriptions);
    console.log('Channel programs by clicks:', channelProgramsByClicks);

    if (format === 'csv') {
      // For CSV, return a summary with the key metrics
      const summaryData = [
        {
          metric: 'Channel Position by Subscriptions',
          value: channelPositionBySubscriptions > 0 ? `${channelPositionBySubscriptions}º` : 'Not ranked',
          channel: channel.name
        },
        {
          metric: 'Channel Position by Live YouTube Clicks',
          value: channelPositionByLiveClicks > 0 ? `${channelPositionByLiveClicks}º` : 'Not ranked',
          channel: channel.name
        },
        {
          metric: 'Channel Position by Deferred YouTube Clicks',
          value: channelPositionByDeferredClicks > 0 ? `${channelPositionByDeferredClicks}º` : 'Not ranked',
          channel: channel.name
        },
        {
          metric: 'Total Subscriptions',
          value: finalSubscriptionsRanking.find(c => c.id === channelId)?.count || 0,
          channel: channel.name
        }
      ];

      return new Promise((resolve, reject) => {
        stringify(summaryData, {
          header: true,
          columns: {
            metric: 'Métrica',
            value: 'Valor',
            channel: 'Canal'
          },
        }, (err, output) => {
          if (err) reject(err);
          else resolve(output);
        });
      });
    } else {
      // For PDF, generate comprehensive HTML
      const html = this.buildComprehensiveChannelReportHtml({
        channel,
        from,
        to,
        finalSubscriptionsRanking,
        finalLiveClicksRanking,
        finalDeferredClicksRanking,
        channelPositionBySubscriptions,
        channelPositionByLiveClicks,
        channelPositionByDeferredClicks,
        isInTop5BySubscriptions,
        isInTop5ByLiveClicks,
        isInTop5ByDeferredClicks,
        channelProgramsBySubscriptions,
        channelProgramsByClicks,
        subscriptionsByGender: cleanSubscriptionsByGender,
        subscriptionsByAge: ageGroupLabels
      });
      return await this.htmlToPdfBuffer(html);
    }
  }

  private buildComprehensiveChannelReportHtml(data: {
    channel: any;
    from: string;
    to: string;
    finalSubscriptionsRanking: any[];
    finalLiveClicksRanking: any[];
    finalDeferredClicksRanking: any[];
    channelPositionBySubscriptions: number;
    channelPositionByLiveClicks: number;
    channelPositionByDeferredClicks: number;
    isInTop5BySubscriptions: boolean;
    isInTop5ByLiveClicks: boolean;
    isInTop5ByDeferredClicks: boolean;
    channelProgramsBySubscriptions: any[];
    channelProgramsByClicks: any[];
    subscriptionsByGender: any[];
    subscriptionsByAge: any[];
  }): string {
    const {
      channel,
      from,
      to,
      finalSubscriptionsRanking,
      finalLiveClicksRanking,
      finalDeferredClicksRanking,
      channelPositionBySubscriptions,
      channelPositionByLiveClicks,
      channelPositionByDeferredClicks,
      isInTop5BySubscriptions,
      isInTop5ByLiveClicks,
      isInTop5ByDeferredClicks,
      channelProgramsBySubscriptions,
      channelProgramsByClicks,
      subscriptionsByGender,
      subscriptionsByAge
    } = data;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte Completo del Canal ${channel.name}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .section { margin-bottom: 30px; }
          .section h2 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px; }
          .highlight { background-color: #fef3c7; padding: 10px; border-radius: 5px; margin: 10px 0; }
          .chart-container { margin: 20px 0; }
          .bar { 
            background-color: #3b82f6; 
            height: 30px; 
            margin: 5px 0; 
            display: flex; 
            align-items: center; 
            padding-left: 10px; 
            color: white; 
            font-weight: bold;
            border-radius: 3px;
          }
          .highlighted-bar { 
            background-color: #f59e0b; 
            border: 2px solid #d97706;
          }
          .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
          .stat-box { 
            background-color: #f8fafc; 
            padding: 15px; 
            border-radius: 8px; 
            border-left: 4px solid #2563eb;
          }
          .stat-title { font-weight: bold; color: #1e40af; margin-bottom: 10px; }
          .stat-value { font-size: 24px; color: #1e293b; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Reporte Completo del Canal: ${channel.name}</h1>
          <p>Período: ${from} a ${to}</p>
        </div>
        
        <div class="section">
          <h2>Posición del Canal en el Ranking</h2>
          <div class="highlight">
            <strong>${channel.name}</strong> está en la <strong>${channelPositionBySubscriptions}º posición</strong> por número de suscripciones
            ${isInTop5BySubscriptions ? 'dentro del top 5' : 'fuera del top 5'}
          </div>
          
          <div class="chart-container">
            <h3>Top 5 Canales por Suscripciones</h3>
            ${finalSubscriptionsRanking.map((ch, index) => {
      const isHighlighted = ch.id === channel.id;
      const barClass = isHighlighted ? 'bar highlighted-bar' : 'bar';
      const width = Math.max(20, (ch.count / Math.max(...finalSubscriptionsRanking.map(c => c.count))) * 100);
      return `
                <div class="${barClass}" style="width: ${width}%">
                  ${index + 1}º - ${ch.name}: ${ch.count} suscripciones
                </div>
              `;
    }).join('')}
          </div>
        </div>

        <div class="section">
          <h2>Top 5 Canales por Clicks de YouTube en Vivo</h2>
          <div class="highlight">
            <strong>${channel.name}</strong> está en la <strong>${channelPositionByLiveClicks}º posición</strong> por clicks de YouTube en vivo
            ${isInTop5ByLiveClicks ? 'dentro del top 5' : 'fuera del top 5'}
          </div>
          
          <div class="chart-container">
            <h3>Top 5 Canales por Clicks de YouTube en Vivo</h3>
            ${finalLiveClicksRanking.map((ch, index) => {
      const isHighlighted = ch.name === channel.name || ch.name.startsWith(channel.name + ' (');
      const barClass = isHighlighted ? 'bar highlighted-bar' : 'bar';
      const width = Math.max(20, (ch.count / Math.max(...finalLiveClicksRanking.map(c => c.count))) * 100);
      return `
                <div class="${barClass}" style="width: ${width}%">
                  ${index + 1}º - ${ch.name}: ${ch.count} clicks
                </div>
              `;
    }).join('')}
          </div>
        </div>

        <div class="section">
          <h2>Top 5 Canales por Clicks de YouTube Diferido</h2>
          <div class="highlight">
            <strong>${channel.name}</strong> está en la <strong>${channelPositionByDeferredClicks}º posición</strong> por clicks de YouTube diferido
            ${isInTop5ByDeferredClicks ? 'dentro del top 5' : 'fuera del top 5'}
          </div>
          
          <div class="chart-container">
            <h3>Top 5 Canales por Clicks de YouTube Diferido</h3>
            ${finalDeferredClicksRanking.map((ch, index) => {
      const isHighlighted = ch.name === channel.name || ch.name.startsWith(channel.name + ' (');
      const barClass = isHighlighted ? 'bar highlighted-bar' : 'bar';
      const width = Math.max(20, (ch.count / Math.max(...finalDeferredClicksRanking.map(c => c.count))) * 100);
      return `
                <div class="${barClass}" style="width: ${width}%">
                  ${index + 1}º - ${ch.name}: ${ch.count} clicks
                </div>
              `;
    }).join('')}
          </div>
        </div>

        <div class="section">
          <h2>Top 5 Programas del Canal por Suscripciones</h2>
          ${channelProgramsBySubscriptions.length > 0 ? `
            <div class="chart-container">
              ${channelProgramsBySubscriptions.map((program, index) => {
      const width = Math.max(20, (program.count / Math.max(...channelProgramsBySubscriptions.map(p => p.count))) * 100);
      return `
                  <div class="bar" style="width: ${width}%">
                    ${index + 1}º - ${program.name}: ${program.count} suscripciones
                  </div>
                `;
    }).join('')}
            </div>
          ` : '<p>No hay programas con suscripciones en este período</p>'}
        </div>

        <div class="section">
          <h2>Top 5 Programas del Canal por Clicks de YouTube</h2>
          ${channelProgramsByClicks.length > 0 ? `
            <div class="chart-container">
              ${channelProgramsByClicks.map((program, index) => {
      const width = Math.max(20, (program.count / Math.max(...channelProgramsByClicks.map(p => p.count))) * 100);
      return `
                  <div class="bar" style="width: ${width}%">
                    ${index + 1}º - ${program.name}: ${program.count} clicks
                  </div>
                `;
    }).join('')}
            </div>
          ` : '<p>No hay programas con clicks de YouTube en este período</p>'}
        </div>

        <div class="section">
          <h2>Estadísticas Demográficas</h2>
          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-title">Suscripciones por Género</div>
              ${subscriptionsByGender.length > 0 ?
        subscriptionsByGender.map(item => `
                  <div><strong>${item.gender || 'No especificado'}:</strong> ${item.count}</div>
                `).join('') :
        '<div>No hay datos de género disponibles</div>'
      }
            </div>
            <div class="stat-box">
              <div class="stat-title">Suscripciones por Edad</div>
              ${subscriptionsByAge.length > 0 ?
        subscriptionsByAge.map(item => `
                  <div><strong>${item.displayLabel}:</strong> ${item.count}</div>
                `).join('') :
        '<div>No hay datos de edad disponibles</div>'
      }
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getAgeGroupLabel(ageGroup: string): string {
    switch (ageGroup) {
      case 'under18': return 'Menos de 18 años';
      case 'age18to30': return '18-30 años';
      case 'age30to45': return '31-45 años';
      case 'age45to60': return '46-60 años';
      case 'over60': return 'Más de 60 años';
      case 'unknown': return 'No especificado';
      default: return ageGroup;
    }
  }
} 