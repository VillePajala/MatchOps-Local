/**
 * Mock logger for tests
 * Jest will automatically use this when jest.mock('@/utils/logger') is called
 */

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
};

export const createLogger = jest.fn(() => logger);

export default logger;
