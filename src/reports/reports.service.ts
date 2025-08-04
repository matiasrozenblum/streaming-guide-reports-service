import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { stringify } from 'csv-stringify';
import { renderChart, barChartConfig, pieChartConfig } from './chart.util';
import { generateWeeklyReportPdf } from './weekly-report-pdf.util';
import { WeeklyReportData } from './weekly-report.service';
import { fetchYouTubeClicks, aggregateClicksBy } from './posthog.util';
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
  ) {}

  async generateReport(request: {
    type: 'users' | 'subscriptions' | 'weekly-summary';
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
      youtubeClicksDeferred
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
      fetchYouTubeClicks({
        from: params.from,
        to: params.to,
        eventType: 'click_youtube_live',
        breakdownBy: 'channel_name',
      }),

      fetchYouTubeClicks({
        from: params.from,
        to: params.to,
        eventType: 'click_youtube_deferred',
        breakdownBy: 'channel_name',
      }),
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
      fetchYouTubeClicks({
        from: params.from,
        to: params.to,
        eventType: 'click_youtube_live',
        breakdownBy: 'program_name',
      }),
      fetchYouTubeClicks({
        from: params.from,
        to: params.to,
        eventType: 'click_youtube_deferred',
        breakdownBy: 'program_name',
      }),
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
      rankingChanges: [],
    };

    // Generate charts
    const charts = {
      usersByGender: (await renderChart(pieChartConfig({
        labels: Object.keys(data.usersByGender),
        data: Object.values(data.usersByGender),
        title: 'Usuarios nuevos por género',
      }))).toString('base64'),
      subsByGender: (await renderChart(pieChartConfig({
        labels: Object.keys(data.subscriptionsByGender),
        data: Object.values(data.subscriptionsByGender),
        title: 'Suscripciones nuevas por género',
      }))).toString('base64'),
      subsByAge: (await renderChart(pieChartConfig({
        labels: Object.keys(data.subscriptionsByAge),
        data: Object.values(data.subscriptionsByAge),
        title: 'Suscripciones nuevas por grupo de edad',
      }))).toString('base64'),
      topChannelsBySubs: (await renderChart(barChartConfig({
        labels: data.topChannelsBySubscriptions.map(c => c.channelName),
        datasets: [{ label: 'Suscripciones', data: data.topChannelsBySubscriptions.map(c => c.count) }],
        title: 'Top 5 canales por suscripciones',
        yLabel: 'Suscripciones',
      }))).toString('base64'),
      topChannelsByClicksLive: (await renderChart(barChartConfig({
        labels: data.topChannelsByClicksLive.map(c => c.channelName),
        datasets: [{ label: 'Clicks en vivo', data: data.topChannelsByClicksLive.map(c => c.count) }],
        title: 'Top 5 canales por clicks en YouTube (en vivo)',
        yLabel: 'Clicks',
      }))).toString('base64'),
      topChannelsByClicksDeferred: (await renderChart(barChartConfig({
        labels: data.topChannelsByClicksDeferred.map(c => c.channelName),
        datasets: [{ label: 'Clicks diferidos', data: data.topChannelsByClicksDeferred.map(c => c.count) }],
        title: 'Top 5 canales por clicks en YouTube (diferido)',
        yLabel: 'Clicks',
      }))).toString('base64'),
      topProgramsBySubs: (await renderChart(barChartConfig({
        labels: data.topProgramsBySubscriptions.map(p => p.programName),
        datasets: [{ label: 'Suscripciones', data: data.topProgramsBySubscriptions.map(p => p.count) }],
        title: 'Top 5 programas por suscripciones',
        yLabel: 'Suscripciones',
      }))).toString('base64'),
      topProgramsByClicksLive: (await renderChart(barChartConfig({
        labels: data.topProgramsByClicksLive.map(p => p.programName),
        datasets: [{ label: 'Clicks en vivo', data: data.topProgramsByClicksLive.map(p => p.count) }],
        title: 'Top 5 programas por clicks en YouTube (en vivo)',
        yLabel: 'Clicks',
      }))).toString('base64'),
      topProgramsByClicksDeferred: (await renderChart(barChartConfig({
        labels: data.topProgramsByClicksDeferred.map(p => p.programName),
        datasets: [{ label: 'Clicks diferidos', data: data.topProgramsByClicksDeferred.map(p => p.count) }],
        title: 'Top 5 programas por clicks en YouTube (diferido)',
        yLabel: 'Clicks',
      }))).toString('base64'),
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
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    return pdfBuffer;
  }

  private async getSubscriptionsByAge(from: string, to: string) {
    const subscriptions = await this.dataSource
      .createQueryBuilder(UserSubscription, 'subscription')
      .leftJoin('subscription.user', 'user')
      .select('user.birthDate', 'birthDate')
      .where('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
      .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
      .andWhere('subscription.isActive = :isActive', { isActive: true })
      .andWhere('user.birthDate IS NOT NULL')
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
              WHEN user.gender IS NULL THEN 'unknown'
              ELSE user.gender
            END
          ` : `
            CASE
              WHEN user.birthDate IS NULL THEN 'unknown'
              WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM user.birthDate) < 18 THEN 'under18'
              WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM user.birthDate) < 30 THEN 'age18to30'
              WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM user.birthDate) < 45 THEN 'age30to45'
              WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM user.birthDate) < 60 THEN 'age45to60'
              ELSE 'over60'
            END
          `, 'groupKey')
          .addSelect('COUNT(subscription.id)', 'count')
          .where('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
          .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
          .andWhere('subscription.isActive = :isActive', { isActive: true })
          .groupBy('channel.id, channel.name, "groupKey"')
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
          fetchYouTubeClicks({ from, to, eventType: 'click_youtube_live', breakdownBy: 'channel_name', limit: 100 }),
          fetchYouTubeClicks({ from, to, eventType: 'click_youtube_deferred', breakdownBy: 'channel_name', limit: 100 }),
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
      return results;
    } else if (metric === 'youtube_clicks') {
      // Top channels by YouTube clicks from PostHog (aggregate live + deferred)
      const [live, deferred] = await Promise.all([
        fetchYouTubeClicks({ from, to, eventType: 'click_youtube_live', breakdownBy: 'channel_name', limit: 100 }),
        fetchYouTubeClicks({ from, to, eventType: 'click_youtube_deferred', breakdownBy: 'channel_name', limit: 100 }),
      ]);
      // Aggregate by channel name
      const map = new Map();
      for (const row of [...live, ...deferred]) {
        const key = row.properties.channel_name || 'unknown';
        if (!map.has(key)) map.set(key, { name: key, count: 0 });
        map.get(key).count += 1;
      }
      return Array.from(map.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
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
              WHEN user.gender IS NULL THEN 'unknown'
              ELSE user.gender
            END
          ` : `
            CASE
              WHEN user.birthDate IS NULL THEN 'unknown'
              WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM user.birthDate) < 18 THEN 'under18'
              WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM user.birthDate) < 30 THEN 'age18to30'
              WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM user.birthDate) < 45 THEN 'age30to45'
              WHEN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM user.birthDate) < 60 THEN 'age45to60'
              ELSE 'over60'
            END
          `, 'groupKey')
          .addSelect('COUNT(subscription.id)', 'count')
          .where('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
          .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
          .andWhere('subscription.isActive = :isActive', { isActive: true })
          .groupBy('program.id, program.name, channel.name, "groupKey"')
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
          fetchYouTubeClicks({ from, to, eventType: 'click_youtube_live', breakdownBy: 'program_name', limit: 100 }),
          fetchYouTubeClicks({ from, to, eventType: 'click_youtube_deferred', breakdownBy: 'program_name', limit: 100 }),
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
      return results;
    } else if (metric === 'youtube_clicks') {
      // Top programs by YouTube clicks from PostHog (aggregate live + deferred)
      const [live, deferred] = await Promise.all([
        fetchYouTubeClicks({ from, to, eventType: 'click_youtube_live', breakdownBy: 'program_name', limit: 100 }),
        fetchYouTubeClicks({ from, to, eventType: 'click_youtube_deferred', breakdownBy: 'program_name', limit: 100 }),
      ]);
      // Aggregate by program name
      const map = new Map();
      for (const row of [...live, ...deferred]) {
        const key = row.properties.program_name || 'unknown';
        if (!map.has(key)) map.set(key, { name: key, count: 0 });
        map.get(key).count += 1;
      }
      return Array.from(map.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    }
    return [];
  }
} 