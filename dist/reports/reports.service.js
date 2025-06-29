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
const dayjs = require("dayjs");
const users_entity_1 = require("../users/users.entity");
const user_subscription_entity_1 = require("../users/user-subscription.entity");
const programs_entity_1 = require("../programs/programs.entity");
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
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], ReportsService);
//# sourceMappingURL=reports.service.js.map