import { initDashboardCapabilities, renderDashboardCapabilities } from './continuous-dashboard.js';
import { initSpreadsheetIntake } from './continuous-spreadsheet-intake.js';
export function initDashboardSuite(options={}){initDashboardCapabilities(options);initSpreadsheetIntake(options)}
export function renderDashboardSuite(){renderDashboardCapabilities()}
