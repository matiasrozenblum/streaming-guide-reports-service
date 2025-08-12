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
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const reports_service_1 = require("./reports.service");
let ReportsController = class ReportsController {
    constructor(reportsService) {
        this.reportsService = reportsService;
    }
    async generateWeeklyReport(from, to, channelId, format = 'pdf') {
        const report = await this.reportsService.generateWeeklyReport({
            from,
            to,
            channelId,
        });
        if (format === 'csv') {
            return report;
        }
        return report;
    }
    async generatePeriodicReport(from, to, channelId, period = 'monthly', format = 'pdf') {
        const report = await this.reportsService.generatePeriodicReport({
            from,
            to,
            channelId,
            period,
        });
        if (format === 'csv') {
            return report;
        }
        return report;
    }
    async generateUsersReport(from, to, format = 'csv') {
        const report = await this.reportsService.generateUsersReport(from, to, format);
        if (format === 'csv') {
            return report;
        }
        return report;
    }
    async generateSubscriptionsReport(from, to, channelId, programId, format = 'csv') {
        const report = await this.reportsService.generateSubscriptionsReport(from, to, format, channelId, programId);
        if (format === 'csv') {
            return report;
        }
        return report;
    }
    async generateChannelReport(from, to, channelId, format = 'pdf') {
        const report = await this.reportsService.generateChannelReport(from, to, format, channelId);
        if (format === 'csv') {
            return report;
        }
        return report;
    }
    async generateComprehensiveChannelReport(from, to, channelId, format = 'pdf') {
        const report = await this.reportsService.generateComprehensiveChannelReport(from, to, format, channelId);
        if (format === 'csv') {
            return report;
        }
        return report;
    }
    async getTopChannels(from, to, channelId, gender, age) {
        return this.reportsService.getTopChannels(from, to, channelId, gender, age);
    }
    async getTopPrograms(from, to, channelId, gender, age) {
        return this.reportsService.getTopPrograms(from, to, channelId, gender, age);
    }
    async exportReport(res, type, from, to, channelId, programId, format = 'csv') {
        try {
            const report = await this.reportsService.generateReport({
                type: type,
                format,
                from,
                to,
                channelId,
                programId,
            });
            if (format === 'csv') {
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${type}-${from}-${to}.csv"`);
                res.status(common_1.HttpStatus.OK).send(report);
            }
            else {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${type}-${from}-${to}.pdf"`);
                res.status(common_1.HttpStatus.OK).send(report);
            }
        }
        catch (error) {
            res.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Get)('weekly-summary'),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('channelId')),
    __param(3, (0, common_1.Query)('format')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "generateWeeklyReport", null);
__decorate([
    (0, common_1.Get)('periodic-summary'),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('channelId')),
    __param(3, (0, common_1.Query)('period')),
    __param(4, (0, common_1.Query)('format')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, String, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "generatePeriodicReport", null);
__decorate([
    (0, common_1.Get)('users'),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('format')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "generateUsersReport", null);
__decorate([
    (0, common_1.Get)('subscriptions'),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('channelId')),
    __param(3, (0, common_1.Query)('programId')),
    __param(4, (0, common_1.Query)('format')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "generateSubscriptionsReport", null);
__decorate([
    (0, common_1.Get)('channel-summary'),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('channelId')),
    __param(3, (0, common_1.Query)('format')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "generateChannelReport", null);
__decorate([
    (0, common_1.Get)('comprehensive-channel-summary'),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('channelId')),
    __param(3, (0, common_1.Query)('format')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "generateComprehensiveChannelReport", null);
__decorate([
    (0, common_1.Get)('top-channels'),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('channelId')),
    __param(3, (0, common_1.Query)('gender')),
    __param(4, (0, common_1.Query)('age')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, String, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getTopChannels", null);
__decorate([
    (0, common_1.Get)('top-programs'),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('channelId')),
    __param(3, (0, common_1.Query)('gender')),
    __param(4, (0, common_1.Query)('age')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, String, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getTopPrograms", null);
__decorate([
    (0, common_1.Get)('export'),
    __param(0, (0, common_1.Res)()),
    __param(1, (0, common_1.Query)('type')),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __param(4, (0, common_1.Query)('channelId')),
    __param(5, (0, common_1.Query)('programId')),
    __param(6, (0, common_1.Query)('format')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, Number, Number, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "exportReport", null);
exports.ReportsController = ReportsController = __decorate([
    (0, common_1.Controller)('reports'),
    __metadata("design:paramtypes", [reports_service_1.ReportsService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map