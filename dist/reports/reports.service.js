"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const csv_stringify_1 = require("csv-stringify");
const chart_util_1 = require("./chart.util");
const weekly_report_pdf_util_1 = require("./weekly-report-pdf.util");
const posthog_util_1 = require("./posthog.util");
const puppeteer_util_1 = require("./puppeteer.util");
const dayjs = require("dayjs");
const users_entity_1 = require("../users/users.entity");
const user_subscription_entity_1 = require("../users/user-subscription.entity");
const programs_entity_1 = require("../programs/programs.entity");
const channels_entity_1 = require("../channels/channels.entity");
let ReportsService = class ReportsService {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async generateReport(request) {
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
    async generateUsersReport(from, to, format) {
        const users = await this.dataSource
            .createQueryBuilder(users_entity_1.User, 'user')
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
                (0, csv_stringify_1.stringify)(formattedUsers, {
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
                    if (err)
                        reject(err);
                    else
                        resolve(output);
                });
            });
        }
        else {
            const html = this.buildUsersReportHtml(formattedUsers, from, to);
            return await this.htmlToPdfBuffer(html);
        }
    }
    async generateSubscriptionsReport(from, to, format, channelId, programId) {
        const queryBuilder = this.dataSource
            .createQueryBuilder(user_subscription_entity_1.UserSubscription, 'subscription')
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
                (0, csv_stringify_1.stringify)(formattedSubscriptions, {
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
                    if (err)
                        reject(err);
                    else
                        resolve(output);
                });
            });
        }
        else {
            const html = this.buildSubscriptionsReportHtml(formattedSubscriptions, from, to);
            return await this.htmlToPdfBuffer(html);
        }
    }
    async generateWeeklyReport(params) {
        const [totalNewUsers, usersByGender, totalNewSubscriptions, subscriptionsByGender, subscriptionsByAge, topChannelsBySubscriptions, topProgramsBySubscriptions, youtubeClicksLive, youtubeClicksDeferred] = await Promise.all([
            this.dataSource
                .createQueryBuilder(users_entity_1.User, 'user')
                .where('user.createdAt >= :from', { from: `${params.from}T00:00:00Z` })
                .andWhere('user.createdAt <= :to', { to: `${params.to}T23:59:59Z` })
                .getCount(),
            this.dataSource
                .createQueryBuilder(users_entity_1.User, 'user')
                .select('user.gender', 'gender')
                .addSelect('COUNT(*)', 'count')
                .where('user.createdAt >= :from', { from: `${params.from}T00:00:00Z` })
                .andWhere('user.createdAt <= :to', { to: `${params.to}T23:59:59Z` })
                .andWhere('user.gender IS NOT NULL')
                .groupBy('user.gender')
                .getRawMany(),
            this.dataSource
                .createQueryBuilder(user_subscription_entity_1.UserSubscription, 'subscription')
                .where('subscription.createdAt >= :from', { from: `${params.from}T00:00:00Z` })
                .andWhere('subscription.createdAt <= :to', { to: `${params.to}T23:59:59Z` })
                .andWhere('subscription.isActive = :isActive', { isActive: true })
                .getCount(),
            this.dataSource
                .createQueryBuilder(user_subscription_entity_1.UserSubscription, 'subscription')
                .leftJoin('subscription.user', 'user')
                .select('user.gender', 'gender')
                .addSelect('COUNT(*)', 'count')
                .where('subscription.createdAt >= :from', { from: `${params.from}T00:00:00Z` })
                .andWhere('subscription.createdAt <= :to', { to: `${params.to}T23:59:59Z` })
                .andWhere('subscription.isActive = :isActive', { isActive: true })
                .andWhere('user.gender IS NOT NULL')
                .groupBy('user.gender')
                .getRawMany(),
            this.getSubscriptionsByAge(params.from, params.to),
            this.dataSource
                .createQueryBuilder(user_subscription_entity_1.UserSubscription, 'subscription')
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
            this.dataSource
                .createQueryBuilder(user_subscription_entity_1.UserSubscription, 'subscription')
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
            (0, posthog_util_1.fetchYouTubeClicks)({
                from: params.from,
                to: params.to,
                eventType: 'click_youtube_live',
                breakdownBy: 'channel_name',
            }),
            (0, posthog_util_1.fetchYouTubeClicks)({
                from: params.from,
                to: params.to,
                eventType: 'click_youtube_deferred',
                breakdownBy: 'channel_name',
            }),
        ]);
        const usersByGenderMap = { male: 0, female: 0, non_binary: 0, rather_not_say: 0 };
        usersByGender.forEach(item => {
            usersByGenderMap[item.gender] = parseInt(item.count);
        });
        const subscriptionsByGenderMap = { male: 0, female: 0, non_binary: 0, rather_not_say: 0 };
        subscriptionsByGender.forEach(item => {
            subscriptionsByGenderMap[item.gender] = parseInt(item.count);
        });
        const topChannelsByClicksLive = await (0, posthog_util_1.aggregateClicksBy)(youtubeClicksLive, 'channel_name');
        const topChannelsByClicksDeferred = await (0, posthog_util_1.aggregateClicksBy)(youtubeClicksDeferred, 'channel_name');
        const [programClicksLive, programClicksDeferred] = await Promise.all([
            (0, posthog_util_1.fetchYouTubeClicks)({
                from: params.from,
                to: params.to,
                eventType: 'click_youtube_live',
                breakdownBy: 'program_name',
            }),
            (0, posthog_util_1.fetchYouTubeClicks)({
                from: params.from,
                to: params.to,
                eventType: 'click_youtube_deferred',
                breakdownBy: 'program_name',
            }),
        ]);
        const topProgramsByClicksLive = await (0, posthog_util_1.aggregateClicksBy)(programClicksLive, 'program_name');
        const topProgramsByClicksDeferred = await (0, posthog_util_1.aggregateClicksBy)(programClicksDeferred, 'program_name');
        const programNames = [
            ...Object.keys(topProgramsByClicksLive),
            ...Object.keys(topProgramsByClicksDeferred)
        ];
        const programChannels = await this.dataSource
            .createQueryBuilder(programs_entity_1.Program, 'program')
            .leftJoin('program.channel', 'channel')
            .select('program.name', 'programName')
            .addSelect('channel.name', 'channelName')
            .where('program.name IN (:...programNames)', { programNames })
            .getRawMany();
        const programChannelMap = programChannels.reduce((map, item) => {
            map[item.programName] = item.channelName;
            return map;
        }, {});
        const data = {
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
        const charts = {
            usersByGender: (await (0, chart_util_1.renderChart)((0, chart_util_1.pieChartConfig)({
                labels: Object.keys(data.usersByGender),
                data: Object.values(data.usersByGender),
                title: 'Usuarios nuevos por género',
            }))).toString('base64'),
            subsByGender: (await (0, chart_util_1.renderChart)((0, chart_util_1.pieChartConfig)({
                labels: Object.keys(data.subscriptionsByGender),
                data: Object.values(data.subscriptionsByGender),
                title: 'Suscripciones nuevas por género',
            }))).toString('base64'),
            subsByAge: (await (0, chart_util_1.renderChart)((0, chart_util_1.pieChartConfig)({
                labels: Object.keys(data.subscriptionsByAge),
                data: Object.values(data.subscriptionsByAge),
                title: 'Suscripciones nuevas por grupo de edad',
            }))).toString('base64'),
            topChannelsBySubs: (await (0, chart_util_1.renderChart)((0, chart_util_1.barChartConfig)({
                labels: data.topChannelsBySubscriptions.map(c => c.channelName),
                datasets: [{ label: 'Suscripciones', data: data.topChannelsBySubscriptions.map(c => c.count) }],
                title: 'Top 5 canales por suscripciones',
                yLabel: 'Suscripciones',
            }))).toString('base64'),
            topChannelsByClicksLive: (await (0, chart_util_1.renderChart)((0, chart_util_1.barChartConfig)({
                labels: data.topChannelsByClicksLive.map(c => c.channelName),
                datasets: [{ label: 'Clicks en vivo', data: data.topChannelsByClicksLive.map(c => c.count) }],
                title: 'Top 5 canales por clicks en YouTube (en vivo)',
                yLabel: 'Clicks',
            }))).toString('base64'),
            topChannelsByClicksDeferred: (await (0, chart_util_1.renderChart)((0, chart_util_1.barChartConfig)({
                labels: data.topChannelsByClicksDeferred.map(c => c.channelName),
                datasets: [{ label: 'Clicks diferidos', data: data.topChannelsByClicksDeferred.map(c => c.count) }],
                title: 'Top 5 canales por clicks en YouTube (diferido)',
                yLabel: 'Clicks',
            }))).toString('base64'),
            topProgramsBySubs: (await (0, chart_util_1.renderChart)((0, chart_util_1.barChartConfig)({
                labels: data.topProgramsBySubscriptions.map(p => p.programName),
                datasets: [{ label: 'Suscripciones', data: data.topProgramsBySubscriptions.map(p => p.count) }],
                title: 'Top 5 programas por suscripciones',
                yLabel: 'Suscripciones',
            }))).toString('base64'),
            topProgramsByClicksLive: (await (0, chart_util_1.renderChart)((0, chart_util_1.barChartConfig)({
                labels: data.topProgramsByClicksLive.map(p => p.programName),
                datasets: [{ label: 'Clicks en vivo', data: data.topProgramsByClicksLive.map(p => p.count) }],
                title: 'Top 5 programas por clicks en YouTube (en vivo)',
                yLabel: 'Clicks',
            }))).toString('base64'),
            topProgramsByClicksDeferred: (await (0, chart_util_1.renderChart)((0, chart_util_1.barChartConfig)({
                labels: data.topProgramsByClicksDeferred.map(p => p.programName),
                datasets: [{ label: 'Clicks diferidos', data: data.topProgramsByClicksDeferred.map(p => p.count) }],
                title: 'Top 5 programas por clicks en YouTube (diferido)',
                yLabel: 'Clicks',
            }))).toString('base64'),
        };
        return await (0, weekly_report_pdf_util_1.generateWeeklyReportPdf)({ data, charts });
    }
    buildUsersReportHtml(users, from, to) {
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
    buildSubscriptionsReportHtml(subscriptions, from, to) {
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
    async htmlToPdfBuffer(html) {
        let page = null;
        try {
            const browser = await (0, puppeteer_util_1.getBrowser)();
            page = await browser.newPage();
            page.setDefaultTimeout(60000);
            await page.setContent(html, { waitUntil: 'networkidle0' });
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                timeout: 60000
            });
            return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
        }
        catch (error) {
            console.error('Error generating PDF from HTML:', error);
            throw new Error(`Failed to generate PDF from HTML: ${error.message}`);
        }
        finally {
            if (page) {
                try {
                    await page.close();
                }
                catch (error) {
                    console.warn('Error closing page:', error);
                }
            }
        }
    }
    async getSubscriptionsByAge(from, to) {
        const subscriptions = await this.dataSource
            .createQueryBuilder(user_subscription_entity_1.UserSubscription, 'subscription')
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
            if (age < 18)
                ageGroups.under18++;
            else if (age >= 18 && age <= 30)
                ageGroups.age18to30++;
            else if (age > 30 && age <= 45)
                ageGroups.age30to45++;
            else if (age > 45 && age <= 60)
                ageGroups.age45to60++;
            else
                ageGroups.over60++;
        });
        return ageGroups;
    }
    async getTopChannels({ metric, from, to, limit, groupBy }) {
        if (groupBy === 'gender' || groupBy === 'age') {
            if (metric === 'subscriptions') {
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
                const map = new Map();
                for (const row of raw) {
                    if (!map.has(row.id)) {
                        map.set(row.id, { id: row.id, name: row.name, counts: {} });
                    }
                    map.get(row.id).counts[row.groupKey || 'unknown'] = parseInt(row.count, 10);
                }
                const arr = Array.from(map.values());
                arr.sort((a, b) => {
                    const totalA = Object.values(a.counts).reduce((sum, v) => sum + Number(v), 0);
                    const totalB = Object.values(b.counts).reduce((sum, v) => sum + Number(v), 0);
                    return Number(totalB) - Number(totalA);
                });
                return arr.slice(0, limit);
            }
            else if (metric === 'youtube_clicks') {
                const [live, deferred] = await Promise.all([
                    (0, posthog_util_1.fetchYouTubeClicks)({ from, to, eventType: 'click_youtube_live', breakdownBy: 'channel_name', limit: 100 }),
                    (0, posthog_util_1.fetchYouTubeClicks)({ from, to, eventType: 'click_youtube_deferred', breakdownBy: 'channel_name', limit: 100 }),
                ]);
                const map = new Map();
                for (const row of [...live, ...deferred]) {
                    const channel = row.properties.channel_name || 'unknown';
                    let groupKey = 'unknown';
                    if (groupBy === 'gender') {
                        groupKey = row.properties.user_gender || 'unknown';
                    }
                    else if (groupBy === 'age') {
                        const age = Number(row.properties.user_age);
                        if (isNaN(age))
                            groupKey = 'unknown';
                        else if (age < 18)
                            groupKey = 'under18';
                        else if (age < 30)
                            groupKey = 'age18to30';
                        else if (age < 45)
                            groupKey = 'age30to45';
                        else if (age < 60)
                            groupKey = 'age45to60';
                        else
                            groupKey = 'over60';
                    }
                    if (!map.has(channel))
                        map.set(channel, { name: channel, counts: {} });
                    map.get(channel).counts[groupKey] = Number(map.get(channel).counts[groupKey] ?? 0) + 1;
                }
                const arr = Array.from(map.values());
                arr.sort((a, b) => {
                    const totalA = Object.values(a.counts).reduce((sum, v) => sum + Number(v), 0);
                    const totalB = Object.values(b.counts).reduce((sum, v) => sum + Number(v), 0);
                    return Number(totalB) - Number(totalA);
                });
                return arr.slice(0, limit);
            }
            return [];
        }
        if (metric === 'subscriptions') {
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
        }
        else if (metric === 'youtube_clicks') {
            const [live, deferred] = await Promise.all([
                (0, posthog_util_1.fetchYouTubeClicks)({ from, to, eventType: 'click_youtube_live', breakdownBy: 'channel_name', limit: 100 }),
                (0, posthog_util_1.fetchYouTubeClicks)({ from, to, eventType: 'click_youtube_deferred', breakdownBy: 'channel_name', limit: 100 }),
            ]);
            const map = new Map();
            for (const row of [...live, ...deferred]) {
                const key = row.properties.channel_name || 'unknown';
                if (!map.has(key))
                    map.set(key, { name: key, count: 0 });
                map.get(key).count += 1;
            }
            return Array.from(map.values())
                .sort((a, b) => b.count - a.count)
                .slice(0, limit);
        }
        return [];
    }
    async getTopPrograms({ metric, from, to, limit, groupBy }) {
        if (groupBy === 'gender' || groupBy === 'age') {
            if (metric === 'subscriptions') {
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
                const map = new Map();
                for (const row of raw) {
                    if (!map.has(row.id)) {
                        map.set(row.id, { id: row.id, name: row.name, channelName: row.channelName, counts: {} });
                    }
                    map.get(row.id).counts[row.groupKey || 'unknown'] = parseInt(row.count, 10);
                }
                const arr = Array.from(map.values());
                arr.sort((a, b) => {
                    const totalA = Object.values(a.counts).reduce((sum, v) => sum + Number(v), 0);
                    const totalB = Object.values(b.counts).reduce((sum, v) => sum + Number(v), 0);
                    return Number(totalB) - Number(totalA);
                });
                return arr.slice(0, limit);
            }
            else if (metric === 'youtube_clicks') {
                const [live, deferred] = await Promise.all([
                    (0, posthog_util_1.fetchYouTubeClicks)({ from, to, eventType: 'click_youtube_live', breakdownBy: 'program_name', limit: 100 }),
                    (0, posthog_util_1.fetchYouTubeClicks)({ from, to, eventType: 'click_youtube_deferred', breakdownBy: 'program_name', limit: 100 }),
                ]);
                const map = new Map();
                for (const row of [...live, ...deferred]) {
                    const program = row.properties.program_name || 'unknown';
                    const channel = row.properties.channel_name || 'unknown';
                    const key = `${program}|||${channel}`;
                    let groupKey = 'unknown';
                    if (groupBy === 'gender') {
                        groupKey = row.properties.user_gender || 'unknown';
                    }
                    else if (groupBy === 'age') {
                        const age = Number(row.properties.user_age);
                        if (isNaN(age))
                            groupKey = 'unknown';
                        else if (age < 18)
                            groupKey = 'under18';
                        else if (age < 30)
                            groupKey = 'age18to30';
                        else if (age < 45)
                            groupKey = 'age30to45';
                        else if (age < 60)
                            groupKey = 'age45to60';
                        else
                            groupKey = 'over60';
                    }
                    if (!map.has(key))
                        map.set(key, { name: program, channelName: channel, counts: {} });
                    map.get(key).counts[groupKey] = (map.get(key).counts[groupKey] || 0) + 1;
                }
                const arr = Array.from(map.values());
                arr.sort((a, b) => {
                    const totalA = Object.values(a.counts).reduce((sum, v) => sum + Number(v), 0);
                    const totalB = Object.values(b.counts).reduce((sum, v) => sum + Number(v), 0);
                    return Number(totalB) - Number(totalA);
                });
                return arr.slice(0, limit);
            }
            return [];
        }
        if (metric === 'subscriptions') {
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
        }
        else if (metric === 'youtube_clicks') {
            const [live, deferred] = await Promise.all([
                (0, posthog_util_1.fetchYouTubeClicks)({ from, to, eventType: 'click_youtube_live', breakdownBy: 'program_name', limit: 100 }),
                (0, posthog_util_1.fetchYouTubeClicks)({ from, to, eventType: 'click_youtube_deferred', breakdownBy: 'program_name', limit: 100 }),
            ]);
            const map = new Map();
            for (const row of [...live, ...deferred]) {
                const key = row.properties.program_name || 'unknown';
                if (!map.has(key))
                    map.set(key, { name: key, count: 0 });
                map.get(key).count += 1;
            }
            return Array.from(map.values())
                .sort((a, b) => b.count - a.count)
                .slice(0, limit);
        }
        return [];
    }
    async generatePeriodicReport(params) {
        const { from, to, channelId, period } = params;
        const [totalNewUsers, usersByGender, totalNewSubscriptions, subscriptionsByGender, subscriptionsByAge, topChannelsBySubscriptions, topProgramsBySubscriptions, youtubeClicksLive, youtubeClicksDeferred] = await Promise.all([
            this.dataSource
                .createQueryBuilder(users_entity_1.User, 'user')
                .where('user.createdAt >= :from', { from: `${from}T00:00:00Z` })
                .andWhere('user.createdAt <= :to', { to: `${to}T23:59:59Z` })
                .getCount(),
            this.dataSource
                .createQueryBuilder(users_entity_1.User, 'user')
                .select('user.gender', 'gender')
                .addSelect('COUNT(*)', 'count')
                .where('user.createdAt >= :from', { from: `${from}T00:00:00Z` })
                .andWhere('user.createdAt <= :to', { to: `${to}T23:59:59Z` })
                .andWhere('user.gender IS NOT NULL')
                .groupBy('user.gender')
                .getRawMany(),
            this.dataSource
                .createQueryBuilder(user_subscription_entity_1.UserSubscription, 'subscription')
                .where('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
                .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
                .andWhere('subscription.isActive = :isActive', { isActive: true })
                .getCount(),
            this.dataSource
                .createQueryBuilder(user_subscription_entity_1.UserSubscription, 'subscription')
                .leftJoin('subscription.user', 'user')
                .select('user.gender', 'gender')
                .addSelect('COUNT(*)', 'count')
                .where('subscription.createdAt >= :from', { from: `${from}T00:00:00Z` })
                .andWhere('subscription.createdAt <= :to', { to: `${to}T23:59:59Z` })
                .andWhere('subscription.isActive = :isActive', { isActive: true })
                .andWhere('user.gender IS NOT NULL')
                .groupBy('user.gender')
                .getRawMany(),
            this.getSubscriptionsByAge(from, to),
            this.dataSource
                .createQueryBuilder(user_subscription_entity_1.UserSubscription, 'subscription')
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
            this.dataSource
                .createQueryBuilder(user_subscription_entity_1.UserSubscription, 'subscription')
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
            (0, posthog_util_1.fetchYouTubeClicks)({ from, to, eventType: 'click_youtube_live', breakdownBy: 'channel_name', limit: 100 }),
            (0, posthog_util_1.fetchYouTubeClicks)({ from, to, eventType: 'click_youtube_deferred', breakdownBy: 'channel_name', limit: 100 }),
        ]);
        const usersByGenderObj = usersByGender.reduce((acc, item) => {
            acc[item.gender] = parseInt(item.count);
            return acc;
        }, {});
        const subscriptionsByGenderObj = subscriptionsByGender.reduce((acc, item) => {
            acc[item.gender] = parseInt(item.count);
            return acc;
        }, {});
        const youtubeClicksLiveAggregated = await (0, posthog_util_1.aggregateClicksBy)(youtubeClicksLive, 'channel_name');
        const youtubeClicksDeferredAggregated = await (0, posthog_util_1.aggregateClicksBy)(youtubeClicksDeferred, 'channel_name');
        const reportData = {
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
        const charts = {
            usersByGender: (await (0, chart_util_1.renderChart)((0, chart_util_1.pieChartConfig)({
                labels: Object.keys(reportData.usersByGender),
                data: Object.values(reportData.usersByGender),
                title: 'Usuarios nuevos por género',
            }))).toString('base64'),
            subsByGender: (await (0, chart_util_1.renderChart)((0, chart_util_1.pieChartConfig)({
                labels: Object.keys(reportData.subscriptionsByGender),
                data: Object.values(reportData.subscriptionsByGender),
                title: 'Suscripciones nuevas por género',
            }))).toString('base64'),
            subsByAge: (await (0, chart_util_1.renderChart)((0, chart_util_1.pieChartConfig)({
                labels: Object.keys(reportData.subscriptionsByAge),
                data: Object.values(reportData.subscriptionsByAge),
                title: 'Suscripciones nuevas por grupo de edad',
            }))).toString('base64'),
            topChannelsBySubs: (await (0, chart_util_1.renderChart)((0, chart_util_1.barChartConfig)({
                labels: reportData.topChannelsBySubscriptions.map(c => c.channelName),
                datasets: [{ label: 'Suscripciones', data: reportData.topChannelsBySubscriptions.map(c => c.count) }],
                title: 'Top 5 canales por suscripciones',
                yLabel: 'Suscripciones',
            }))).toString('base64'),
            topChannelsByClicksLive: (await (0, chart_util_1.renderChart)((0, chart_util_1.barChartConfig)({
                labels: reportData.topChannelsByClicksLive.map(c => c.channelName),
                datasets: [{ label: 'Clicks en vivo', data: reportData.topChannelsByClicksLive.map(c => c.count) }],
                title: 'Top 5 canales por clicks en YouTube (en vivo)',
                yLabel: 'Clicks',
            }))).toString('base64'),
            topChannelsByClicksDeferred: (await (0, chart_util_1.renderChart)((0, chart_util_1.barChartConfig)({
                labels: reportData.topChannelsByClicksDeferred.map(c => c.channelName),
                datasets: [{ label: 'Clicks diferidos', data: reportData.topChannelsByClicksDeferred.map(c => c.count) }],
                title: 'Top 5 canales por clicks en YouTube (diferido)',
                yLabel: 'Clicks',
            }))).toString('base64'),
            topProgramsBySubs: (await (0, chart_util_1.renderChart)((0, chart_util_1.barChartConfig)({
                labels: reportData.topProgramsBySubscriptions.map(p => p.programName),
                datasets: [{ label: 'Suscripciones', data: reportData.topProgramsBySubscriptions.map(p => p.count) }],
                title: 'Top 5 programas por suscripciones',
                yLabel: 'Suscripciones',
            }))).toString('base64'),
            topProgramsByClicksLive: (await (0, chart_util_1.renderChart)((0, chart_util_1.barChartConfig)({
                labels: reportData.topProgramsByClicksLive.map(p => p.programName),
                datasets: [{ label: 'Clicks en vivo', data: reportData.topProgramsByClicksLive.map(p => p.count) }],
                title: 'Top 5 programas por clicks en YouTube (en vivo)',
                yLabel: 'Clicks',
            }))).toString('base64'),
            topProgramsByClicksDeferred: (await (0, chart_util_1.renderChart)((0, chart_util_1.barChartConfig)({
                labels: reportData.topProgramsByClicksDeferred.map(p => p.programName),
                datasets: [{ label: 'Clicks diferidos', data: reportData.topProgramsByClicksDeferred.map(p => p.count) }],
                title: 'Top 5 programas por clicks en YouTube (diferido)',
                yLabel: 'Clicks',
            }))).toString('base64'),
        };
        return (0, weekly_report_pdf_util_1.generatePeriodicReportPdf)({ data: reportData, charts, period });
    }
    async generateChannelReport(from, to, format, channelId) {
        const channel = await this.dataSource
            .createQueryBuilder(channels_entity_1.Channel, 'channel')
            .where('channel.id = :channelId', { channelId })
            .getOne();
        if (!channel) {
            throw new Error('Channel not found');
        }
        const subscriptions = await this.dataSource
            .createQueryBuilder(user_subscription_entity_1.UserSubscription, 'subscription')
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
                (0, csv_stringify_1.stringify)(formattedSubscriptions, {
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
                    if (err)
                        reject(err);
                    else
                        resolve(output);
                });
            });
        }
        else {
            const html = this.buildChannelReportHtml(formattedSubscriptions, channel, from, to);
            return await this.htmlToPdfBuffer(html);
        }
    }
    buildChannelReportHtml(subscriptions, channel, from, to) {
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
    async generateComprehensiveChannelReport(from, to, format, channelId) {
        const channel = await this.dataSource
            .createQueryBuilder(channels_entity_1.Channel, 'channel')
            .where('channel.id = :channelId', { channelId })
            .getOne();
        if (!channel) {
            throw new Error('Channel not found');
        }
        const topChannels = await this.getTopChannels({
            metric: 'subscriptions',
            from,
            to,
            limit: 10,
            groupBy: 'channel'
        });
        const channelPosition = topChannels.findIndex(c => c.id === channelId) + 1;
        const isInTop5 = channelPosition <= 5;
        const top5Channels = topChannels.slice(0, 5);
        if (!isInTop5 && channelPosition > 0) {
            const channelData = topChannels.find(c => c.id === channelId);
            if (channelData) {
                top5Channels.push({
                    ...channelData,
                    name: `${channelData.name} (${channelPosition}º)`
                });
            }
        }
        const topPrograms = await this.getTopPrograms({
            metric: 'subscriptions',
            from,
            to,
            limit: 5,
            groupBy: 'program'
        });
        const channelPrograms = topPrograms.filter(p => p.channelId === channelId);
        const subscriptionsByGender = await this.dataSource
            .createQueryBuilder(user_subscription_entity_1.UserSubscription, 'subscription')
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
        const subscriptionsByAge = await this.dataSource
            .createQueryBuilder(user_subscription_entity_1.UserSubscription, 'subscription')
            .leftJoinAndSelect('subscription.user', 'user')
            .leftJoinAndSelect('subscription.program', 'program')
            .leftJoinAndSelect('program.channel', 'channel')
            .select([
            'CASE ' +
                'WHEN user.birthDate IS NULL THEN \'unknown\' ' +
                'WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, user.birthDate)) < 18 THEN \'under18\' ' +
                'WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, user.birthDate)) BETWEEN 18 AND 30 THEN \'age18to30\' ' +
                'WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, user.birthDate)) BETWEEN 31 AND 45 THEN \'age30to45\' ' +
                'WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, user.birthDate)) BETWEEN 46 AND 60 THEN \'age45to60\' ' +
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
        if (format === 'csv') {
            const summaryData = [
                {
                    metric: 'Channel Position',
                    value: channelPosition > 0 ? `${channelPosition}º` : 'Not ranked',
                    channel: channel.name
                },
                {
                    metric: 'Total Subscriptions',
                    value: topChannels.find(c => c.id === channelId)?.count || 0,
                    channel: channel.name
                }
            ];
            return new Promise((resolve, reject) => {
                (0, csv_stringify_1.stringify)(summaryData, {
                    header: true,
                    columns: {
                        metric: 'Métrica',
                        value: 'Valor',
                        channel: 'Canal'
                    },
                }, (err, output) => {
                    if (err)
                        reject(err);
                    else
                        resolve(output);
                });
            });
        }
        else {
            const html = this.buildComprehensiveChannelReportHtml({
                channel,
                from,
                to,
                top5Channels,
                channelPosition,
                isInTop5,
                channelPrograms,
                subscriptionsByGender,
                subscriptionsByAge
            });
            return await this.htmlToPdfBuffer(html);
        }
    }
    buildComprehensiveChannelReportHtml(data) {
        const { channel, from, to, top5Channels, channelPosition, isInTop5, channelPrograms, subscriptionsByGender, subscriptionsByAge } = data;
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
            <strong>${channel.name}</strong> está en la <strong>${channelPosition}º posición</strong> por número de suscripciones
            ${isInTop5 ? 'dentro del top 5' : 'fuera del top 5'}
          </div>
          
          <div class="chart-container">
            <h3>Top 5 Canales por Suscripciones</h3>
            ${top5Channels.map((ch, index) => {
            const isHighlighted = ch.id === channel.id;
            const barClass = isHighlighted ? 'bar highlighted-bar' : 'bar';
            const width = Math.max(20, (ch.count / Math.max(...top5Channels.map(c => c.count))) * 100);
            return `
                <div class="${barClass}" style="width: ${width}%">
                  ${index + 1}º - ${ch.name}: ${ch.count} suscripciones
                </div>
              `;
        }).join('')}
          </div>
        </div>

        <div class="section">
          <h2>Top 5 Programas del Canal</h2>
          ${channelPrograms.length > 0 ? `
            <div class="chart-container">
              ${channelPrograms.map((program, index) => {
            const width = Math.max(20, (program.count / Math.max(...channelPrograms.map(p => p.count))) * 100);
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
          <h2>Estadísticas Demográficas</h2>
          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-title">Suscripciones por Género</div>
              ${subscriptionsByGender.map(item => `
                <div><strong>${item.gender || 'No especificado'}:</strong> ${item.count}</div>
              `).join('')}
            </div>
            <div class="stat-box">
              <div class="stat-title">Suscripciones por Edad</div>
              ${subscriptionsByAge.map(item => {
            const ageLabel = this.getAgeGroupLabel(item.ageGroup);
            return `<div><strong>${ageLabel}:</strong> ${item.count}</div>`;
        }).join('')}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    }
    getAgeGroupLabel(ageGroup) {
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
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], ReportsService);
//# sourceMappingURL=reports.service.js.map