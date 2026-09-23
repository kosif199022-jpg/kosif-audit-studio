import { initDashboardCapabilities, renderDashboardCapabilities } from './continuous-dashboard.js';
import { initSpreadsheetIntake } from './continuous-spreadsheet-intake.js';
import { initAssistant, renderAssistant } from './continuous-assistant.js';
export function initDashboardSuite(options={}){initDashboardCapabilities(options);initSpreadsheetIntake(options);initAssistant()}
export function renderDashboardSuite(){renderDashboardCapabilities();renderAssistant()}
