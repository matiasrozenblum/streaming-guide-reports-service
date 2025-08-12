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
            (0, posthog_util_1.fetchYouTubeClicks)('click_youtube_live', params.from, params.to, 10000),
            (0, posthog_util_1.fetchYouTubeClicks)('click_youtube_deferred', params.from, params.to, 10000),
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
            (0, posthog_util_1.fetchYouTubeClicks)('click_youtube_live', params.from, params.to, 10000),
            (0, posthog_util_1.fetchYouTubeClicks)('click_youtube_deferred', params.from, params.to, 10000),
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
    async getTopChannels(from, to, channelId, gender, age) {
        const queryBuilder = this.dataSource
            .createQueryBuilder(channels_entity_1.Channel, 'channel')
            .leftJoin('channel.programs', 'program')
            .leftJoin('program.subscriptions', 'subscription')
            .leftJoin('subscription.user', 'user')
            .where('subscription.created_at >= :from', { from: `${from}T00:00:00Z` })
            .andWhere('subscription.created_at <= :to', { to: `${to}T23:59:59Z` })
            .andWhere('subscription.is_active = :isActive', { isActive: true });
        if (channelId) {
            queryBuilder.andWhere('channel.id = :channelId', { channelId });
        }
        if (gender && gender !== 'all') {
            queryBuilder.andWhere('user.gender = :gender', { gender });
        }
        if (age && age !== 'all') {
            switch (age) {
                case 'under18':
                    queryBuilder.andWhere('EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") < 18');
                    break;
                case 'age18to30':
                    queryBuilder.andWhere('EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") >= 18 AND EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") < 30');
                    break;
                case 'age30to45':
                    queryBuilder.andWhere('EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") >= 30 AND EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") < 45');
                    break;
                case 'age45to60':
                    queryBuilder.andWhere('EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") >= 45 AND EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") < 60');
                    break;
                case 'over60':
                    queryBuilder.andWhere('EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") >= 60');
                    break;
            }
        }
        const subscriptionResults = await queryBuilder
            .select([
            'channel.id',
            'channel.name',
            `CASE
          WHEN "user"."gender" IS NULL THEN 'rather_not_say'
          ELSE "user"."gender"
        END AS "groupKey"`,
            'COUNT(subscription.id) as count'
        ])
            .groupBy('channel.id, channel.name')
            .addGroupBy('"groupKey"')
            .orderBy('COUNT(subscription.id)', 'DESC')
            .getRawMany();
        const [live, deferred] = await Promise.all([
            (0, posthog_util_1.fetchYouTubeClicks)('click_youtube_live', from, to, 10000),
            (0, posthog_util_1.fetchYouTubeClicks)('click_youtube_deferred', from, to, 10000),
        ]);
        const youtubeClicksByChannel = {};
        [...live, ...deferred].forEach(event => {
            const channelName = event.properties?.channel_name;
            const userGender = event.properties?.user_gender || 'rather_not_say';
            if (channelName) {
                if (!youtubeClicksByChannel[channelName]) {
                    youtubeClicksByChannel[channelName] = {};
                }
                youtubeClicksByChannel[channelName][userGender] = (youtubeClicksByChannel[channelName][userGender] || 0) + 1;
            }
        });
        const combinedResults = [];
        const processedChannels = new Set();
        subscriptionResults.forEach(result => {
            const channelName = result.name;
            const gender = result.groupKey;
            const subscriptionCount = parseInt(result.count);
            if (!processedChannels.has(channelName)) {
                processedChannels.add(channelName);
                const youtubeClicks = youtubeClicksByChannel[channelName] || {};
                const totalYoutubeClicks = Object.values(youtubeClicks).reduce((sum, count) => sum + count, 0);
                combinedResults.push({
                    channel: channelName,
                    subscriptions: subscriptionCount,
                    youtubeClicks: totalYoutubeClicks,
                    breakdown: {
                        subscriptions: { [gender]: subscriptionCount },
                        youtubeClicks: youtubeClicks
                    }
                });
            }
            else {
                const existingChannel = combinedResults.find(r => r.channel === channelName);
                if (existingChannel) {
                    existingChannel.breakdown.subscriptions[gender] = subscriptionCount;
                    existingChannel.subscriptions += subscriptionCount;
                }
            }
        });
        Object.keys(youtubeClicksByChannel).forEach(channelName => {
            if (!processedChannels.has(channelName)) {
                const youtubeClicks = youtubeClicksByChannel[channelName];
                const totalYoutubeClicks = Object.values(youtubeClicks).reduce((sum, count) => sum + count, 0);
                combinedResults.push({
                    channel: channelName,
                    subscriptions: 0,
                    youtubeClicks: totalYoutubeClicks,
                    breakdown: {
                        subscriptions: {},
                        youtubeClicks: youtubeClicks
                    }
                });
            }
        });
        return combinedResults
            .sort((a, b) => (b.subscriptions + b.youtubeClicks) - (a.subscriptions + a.youtubeClicks))
            .slice(0, 5);
    }
    async getTopPrograms(from, to, channelId, gender, age) {
        const queryBuilder = this.dataSource
            .createQueryBuilder(programs_entity_1.Program, 'program')
            .leftJoin('program.channel', 'channel')
            .leftJoin('program.subscriptions', 'subscription')
            .leftJoin('subscription.user', 'user')
            .where('subscription.created_at >= :from', { from: `${from}T00:00:00Z` })
            .andWhere('subscription.created_at <= :to', { to: `${to}T23:59:59Z` })
            .andWhere('subscription.is_active = :isActive', { isActive: true });
        if (channelId) {
            queryBuilder.andWhere('channel.id = :channelId', { channelId });
        }
        if (gender && gender !== 'all') {
            queryBuilder.andWhere('user.gender = :gender', { gender });
        }
        if (age && age !== 'all') {
            switch (age) {
                case 'under18':
                    queryBuilder.andWhere('EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") < 18');
                    break;
                case 'age18to30':
                    queryBuilder.andWhere('EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") >= 18 AND EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") < 30');
                    break;
                case 'age30to45':
                    queryBuilder.andWhere('EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") >= 30 AND EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") < 45');
                    break;
                case 'age45to60':
                    queryBuilder.andWhere('EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") >= 45 AND EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") < 60');
                    break;
                case 'over60':
                    queryBuilder.andWhere('EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM "user"."birth_date") >= 60');
                    break;
            }
        }
        const subscriptionResults = await queryBuilder
            .select([
            'program.id',
            'program.name',
            'channel.name as channelName',
            `CASE
          WHEN "user"."gender" IS NULL THEN 'rather_not_say'
          ELSE "user"."gender"
        END AS "groupKey"`,
            'COUNT(subscription.id) as count'
        ])
            .groupBy('program.id, program.name, channel.name')
            .addGroupBy('"groupKey"')
            .orderBy('COUNT(subscription.id)', 'DESC')
            .getRawMany();
        const [live, deferred] = await Promise.all([
            (0, posthog_util_1.fetchYouTubeClicks)('click_youtube_live', from, to, 10000),
            (0, posthog_util_1.fetchYouTubeClicks)('click_youtube_deferred', from, to, 10000),
        ]);
        const youtubeClicksByProgram = {};
        [...live, ...deferred].forEach(event => {
            const programName = event.properties?.program_name;
            const userGender = event.properties?.user_gender || 'rather_not_say';
            if (programName) {
                if (!youtubeClicksByProgram[programName]) {
                    youtubeClicksByProgram[programName] = {};
                }
                youtubeClicksByProgram[programName][userGender] = (youtubeClicksByProgram[programName][userGender] || 0) + 1;
            }
        });
        const combinedResults = [];
        const processedPrograms = new Set();
        subscriptionResults.forEach(result => {
            const programName = result.name;
            const channelName = result.channelName;
            const gender = result.groupKey;
            const subscriptionCount = parseInt(result.count);
            if (!processedPrograms.has(programName)) {
                processedPrograms.add(programName);
                const youtubeClicks = youtubeClicksByProgram[programName] || {};
                const totalYoutubeClicks = Object.values(youtubeClicks).reduce((sum, count) => sum + count, 0);
                combinedResults.push({
                    program: programName,
                    channel: channelName,
                    subscriptions: subscriptionCount,
                    youtubeClicks: totalYoutubeClicks,
                    breakdown: {
                        subscriptions: { [gender]: subscriptionCount },
                        youtubeClicks: youtubeClicks
                    }
                });
            }
            else {
                const existingProgram = combinedResults.find(r => r.program === programName);
                if (existingProgram) {
                    existingProgram.breakdown.subscriptions[gender] = subscriptionCount;
                    existingProgram.subscriptions += subscriptionCount;
                }
            }
        });
        Object.keys(youtubeClicksByProgram).forEach(programName => {
            if (!processedPrograms.has(programName)) {
                const youtubeClicks = youtubeClicksByProgram[programName];
                const totalYoutubeClicks = Object.values(youtubeClicks).reduce((sum, count) => sum + count, 0);
                combinedResults.push({
                    program: programName,
                    channel: 'Unknown',
                    subscriptions: 0,
                    youtubeClicks: totalYoutubeClicks,
                    breakdown: {
                        subscriptions: {},
                        youtubeClicks: youtubeClicks
                    }
                });
            }
        });
        return combinedResults
            .sort((a, b) => (b.subscriptions + b.youtubeClicks) - (a.subscriptions + a.youtubeClicks))
            .slice(0, 5);
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
            (0, posthog_util_1.fetchYouTubeClicks)('click_youtube_live', from, to, 10000),
            (0, posthog_util_1.fetchYouTubeClicks)('click_youtube_deferred', from, to, 10000),
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
            throw new Error(`Channel with ID ${channelId} not found`);
        }
        const topChannelsBySubscriptions = await this.getTopChannels(from, to);
        const topChannelsByLiveClicks = await this.getTopChannels(from, to);
        const topChannelsByDeferredClicks = await this.getTopChannels(from, to);
        const channelPositionBySubscriptions = topChannelsBySubscriptions.findIndex(c => c.id === channelId) + 1;
        const channelPositionByLiveClicks = topChannelsByLiveClicks.findIndex(c => c.name === channel.name) + 1;
        const channelPositionByDeferredClicks = topChannelsByDeferredClicks.findIndex(c => c.name === channel.name) + 1;
        const isInTop5BySubscriptions = channelPositionBySubscriptions > 0 && channelPositionBySubscriptions <= 5;
        const isInTop5ByLiveClicks = channelPositionByLiveClicks > 0 && channelPositionByLiveClicks <= 5;
        const isInTop5ByDeferredClicks = channelPositionByDeferredClicks > 0 && channelPositionByDeferredClicks <= 5;
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
            const liveClicks = await (0, posthog_util_1.fetchYouTubeClicks)('click_youtube_live', from, to, 10000);
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
            const deferredClicks = await (0, posthog_util_1.fetchYouTubeClicks)('click_youtube_deferred', from, to, 10000);
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
        const topProgramsBySubscriptions = await this.getTopPrograms(from, to);
        const channelProgramsBySubscriptions = topProgramsBySubscriptions.filter(p => p.channelName === channel.name);
        if (channelProgramsBySubscriptions.length === 0) {
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
            channelProgramsBySubscriptions.length = 0;
            channelProgramsBySubscriptions.push(...directPrograms);
        }
        const topProgramsByClicks = await this.getTopPrograms(from, to);
        const channelProgramsByClicks = topProgramsByClicks.filter(p => {
            if (p.channelName) {
                return p.channelName === channel.name;
            }
            return false;
        });
        if (channelProgramsByClicks.length === 0) {
            const [liveClicks, deferredClicks] = await Promise.all([
                (0, posthog_util_1.fetchYouTubeClicks)('click_youtube_live', from, to, 100),
                (0, posthog_util_1.fetchYouTubeClicks)('click_youtube_deferred', from, to, 100),
            ]);
            const channelClicks = [...liveClicks, ...deferredClicks].filter(click => click.properties.channel_name === channel.name);
            const programMap = new Map();
            for (const click of channelClicks) {
                const programName = click.properties.program_name || 'unknown';
                if (!programMap.has(programName)) {
                    programMap.set(programName, { name: programName, count: 0 });
                }
                programMap.get(programName).count += 1;
            }
            const channelProgramsArray = Array.from(programMap.values())
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);
            channelProgramsByClicks.length = 0;
            channelProgramsByClicks.push(...channelProgramsArray);
        }
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
        const totalSubscriptionsForChannel = await this.dataSource
            .createQueryBuilder(user_subscription_entity_1.UserSubscription, 'subscription')
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
        const cleanSubscriptionsByAge = subscriptionsByAge
            .filter(item => item.ageGroup && item.ageGroup !== 'undefined')
            .map(item => ({
            ageGroup: item.ageGroup || 'unknown',
            count: parseInt(item.count) || 0
        }));
        const cleanSubscriptionsByGender = subscriptionsByGender
            .filter(item => item.gender !== null && item.gender !== undefined)
            .map(item => ({
            gender: item.gender || 'No especificado',
            count: parseInt(item.count) || 0
        }));
        if (cleanSubscriptionsByAge.length === 0 && totalSubscriptionsForChannel > 0) {
            console.log('No age data found, trying simpler query...');
            const simpleAgeQuery = await this.dataSource
                .createQueryBuilder(user_subscription_entity_1.UserSubscription, 'subscription')
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
        const ageGroupLabels = cleanSubscriptionsByAge.map(item => ({
            ...item,
            displayLabel: this.getAgeGroupLabel(item.ageGroup)
        }));
        console.log('Raw subscriptions by gender:', subscriptionsByGender);
        console.log('Raw subscriptions by age:', subscriptionsByAge);
        console.log('Clean subscriptions by gender:', cleanSubscriptionsByGender);
        console.log('Clean subscriptions by age:', ageGroupLabels);
        console.log('Channel programs by subscriptions:', channelProgramsBySubscriptions);
        console.log('Channel programs by clicks:', channelProgramsByClicks);
        if (format === 'csv') {
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
    buildComprehensiveChannelReportHtml(data) {
        const { channel, from, to, finalSubscriptionsRanking, finalLiveClicksRanking, finalDeferredClicksRanking, channelPositionBySubscriptions, channelPositionByLiveClicks, channelPositionByDeferredClicks, isInTop5BySubscriptions, isInTop5ByLiveClicks, isInTop5ByDeferredClicks, channelProgramsBySubscriptions, channelProgramsByClicks, subscriptionsByGender, subscriptionsByAge } = data;
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
            '<div>No hay datos de género disponibles</div>'}
            </div>
            <div class="stat-box">
              <div class="stat-title">Suscripciones por Edad</div>
              ${subscriptionsByAge.length > 0 ?
            subscriptionsByAge.map(item => `
                  <div><strong>${item.displayLabel}:</strong> ${item.count}</div>
                `).join('') :
            '<div>No hay datos de edad disponibles</div>'}
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