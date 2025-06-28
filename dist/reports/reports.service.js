"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const csv_stringify_1 = require("csv-stringify");
const chart_util_1 = require("./chart.util");
const weekly_report_pdf_util_1 = require("./weekly-report-pdf.util");
let ReportsService = class ReportsService {
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
        const users = [
            { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com', gender: 'male', birthDate: '1990-01-01', createdAt: '2025-06-01' },
            { id: 2, firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', gender: 'female', birthDate: '1985-05-15', createdAt: '2025-06-02' },
        ];
        if (format === 'csv') {
            return new Promise((resolve, reject) => {
                (0, csv_stringify_1.stringify)(users, {
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
            const html = this.buildUsersReportHtml(users, from, to);
            return await this.htmlToPdfBuffer(html);
        }
    }
    async generateSubscriptionsReport(from, to, format, channelId, programId) {
        const subscriptions = [
            { id: 1, userFirstName: 'John', userLastName: 'Doe', userEmail: 'john@example.com', programName: 'Show 1', channelName: 'Channel 1', createdAt: '2025-06-01' },
            { id: 2, userFirstName: 'Jane', userLastName: 'Smith', userEmail: 'jane@example.com', programName: 'Show 2', channelName: 'Channel 2', createdAt: '2025-06-02' },
        ];
        if (format === 'csv') {
            return new Promise((resolve, reject) => {
                (0, csv_stringify_1.stringify)(subscriptions, {
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
            const html = this.buildSubscriptionsReportHtml(subscriptions, from, to);
            return await this.htmlToPdfBuffer(html);
        }
    }
    async generateWeeklyReport(params) {
        const data = {
            from: params.from,
            to: params.to,
            totalNewUsers: 150,
            usersByGender: { male: 80, female: 60, non_binary: 5, rather_not_say: 5 },
            totalNewSubscriptions: 300,
            subscriptionsByGender: { male: 160, female: 120, non_binary: 10, rather_not_say: 10 },
            subscriptionsByAge: { under18: 20, age18to30: 100, age30to45: 120, age45to60: 40, over60: 20 },
            subscriptionsByProgram: [],
            subscriptionsByChannel: [],
            topChannelsBySubscriptions: [
                { channelId: 1, channelName: 'Channel 1', count: 50 },
                { channelId: 2, channelName: 'Channel 2', count: 40 },
            ],
            topChannelsByClicksLive: [
                { channelName: 'Channel 1', count: 200 },
                { channelName: 'Channel 2', count: 150 },
            ],
            topChannelsByClicksDeferred: [
                { channelName: 'Channel 1', count: 100 },
                { channelName: 'Channel 2', count: 80 },
            ],
            topProgramsBySubscriptions: [
                { programId: 1, programName: 'Show 1', channelName: 'Channel 1', count: 30 },
                { programId: 2, programName: 'Show 2', channelName: 'Channel 2', count: 25 },
            ],
            topProgramsByClicksLive: [
                { programName: 'Show 1', channelName: 'Channel 1', count: 120 },
                { programName: 'Show 2', channelName: 'Channel 2', count: 90 },
            ],
            topProgramsByClicksDeferred: [
                { programName: 'Show 1', channelName: 'Channel 1', count: 60 },
                { programName: 'Show 2', channelName: 'Channel 2', count: 45 },
            ],
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
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)()
], ReportsService);
//# sourceMappingURL=reports.service.js.map