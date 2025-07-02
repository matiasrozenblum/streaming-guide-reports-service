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
exports.ReportsController = exports.GenerateReportDto = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const reports_service_1 = require("./reports.service");
class GenerateReportDto {
}
exports.GenerateReportDto = GenerateReportDto;
let ReportsController = class ReportsController {
    constructor(reportsService) {
        this.reportsService = reportsService;
    }
    async generateReport(request, res) {
        const result = await this.reportsService.generateReport(request);
        if (request.format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${request.type}_report_${request.from}_to_${request.to}.csv"`);
        }
        else {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${request.type}_report_${request.from}_to_${request.to}.pdf"`);
        }
        res.send(result);
    }
    async downloadWeeklyReport(res, from, to, channelId) {
        const result = await this.reportsService.generateWeeklyReport({
            from,
            to,
            channelId: channelId ? parseInt(channelId) : undefined,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="weekly_report_${from}_to_${to}.pdf"`);
        res.send(result);
    }
    async getTopChannels(metric, from, to, limit, groupBy) {
        return this.reportsService.getTopChannels({ metric, from, to, limit: limit ? parseInt(limit) : 5, groupBy });
    }
    async getTopPrograms(metric, from, to, limit, groupBy) {
        return this.reportsService.getTopPrograms({ metric, from, to, limit: limit ? parseInt(limit) : 5, groupBy });
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Post)('generate'),
    (0, swagger_1.ApiOperation)({ summary: 'Generate a report (returns file, never sends email)' }),
    (0, swagger_1.ApiBody)({ type: GenerateReportDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Report generated successfully' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [GenerateReportDto, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "generateReport", null);
__decorate([
    (0, common_1.Get)('weekly-summary/download'),
    (0, swagger_1.ApiOperation)({ summary: 'Download weekly summary report' }),
    __param(0, (0, common_1.Res)()),
    __param(1, (0, common_1.Query)('from')),
    __param(2, (0, common_1.Query)('to')),
    __param(3, (0, common_1.Query)('channelId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "downloadWeeklyReport", null);
__decorate([
    (0, common_1.Get)('top-channels'),
    (0, swagger_1.ApiOperation)({ summary: 'Get top channels by subscriptions or YouTube clicks' }),
    __param(0, (0, common_1.Query)('metric')),
    __param(1, (0, common_1.Query)('from')),
    __param(2, (0, common_1.Query)('to')),
    __param(3, (0, common_1.Query)('limit')),
    __param(4, (0, common_1.Query)('groupBy')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getTopChannels", null);
__decorate([
    (0, common_1.Get)('top-programs'),
    (0, swagger_1.ApiOperation)({ summary: 'Get top programs by subscriptions or YouTube clicks' }),
    __param(0, (0, common_1.Query)('metric')),
    __param(1, (0, common_1.Query)('from')),
    __param(2, (0, common_1.Query)('to')),
    __param(3, (0, common_1.Query)('limit')),
    __param(4, (0, common_1.Query)('groupBy')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getTopPrograms", null);
exports.ReportsController = ReportsController = __decorate([
    (0, swagger_1.ApiTags)('reports'),
    (0, common_1.Controller)('reports'),
    __metadata("design:paramtypes", [reports_service_1.ReportsService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map