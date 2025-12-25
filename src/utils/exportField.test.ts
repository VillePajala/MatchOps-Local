/**
 * Tests for Field Export Utility
 * @critical - Export functionality for sharing game snapshots
 */

import {
  sanitizeFilename,
  generateFilename,
  formatTime,
  truncateText,
  isExportSupported,
  exportFieldAsImage,
  FieldExportOptions,
} from './exportField';

// Mock logger to avoid console noise
jest.mock('./logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('exportField', () => {
  describe('sanitizeFilename', () => {
    it('should remove special characters', () => {
      expect(sanitizeFilename('Team@#$%Name!')).toBe('TeamName');
    });

    it('should preserve alphanumeric, dash, underscore, dot, and space', () => {
      expect(sanitizeFilename('Team-Name_2024.txt')).toBe('Team-Name_2024.txt');
    });

    it('should replace spaces with underscores', () => {
      expect(sanitizeFilename('My Team Name')).toBe('My_Team_Name');
    });

    it('should collapse multiple spaces into single underscore', () => {
      expect(sanitizeFilename('Team    Name')).toBe('Team_Name');
    });

    it('should limit length to 100 characters', () => {
      const longName = 'A'.repeat(150);
      expect(sanitizeFilename(longName)).toHaveLength(100);
    });

    it('should handle empty string', () => {
      expect(sanitizeFilename('')).toBe('');
    });

    it('should handle string with only special characters', () => {
      expect(sanitizeFilename('@#$%^&*()')).toBe('');
    });

    it('should handle Finnish characters by removing them', () => {
      expect(sanitizeFilename('Äänekoski FC')).toBe('nekoski_FC');
    });
  });

  describe('generateFilename', () => {
    // Mock Date for consistent testing
    const realDate = Date;

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should generate basic filename with field prefix', () => {
      const filename = generateFilename({});
      expect(filename).toBe('field_2025-06-15.png');
    });

    it('should include team name when provided', () => {
      const filename = generateFilename({ teamName: 'MyTeam' });
      expect(filename).toBe('field_MyTeam_2025-06-15.png');
    });

    it('should include opponent name with vs separator', () => {
      const filename = generateFilename({
        teamName: 'MyTeam',
        opponentName: 'Rivals',
      });
      expect(filename).toBe('field_MyTeam_vs_Rivals_2025-06-15.png');
    });

    it('should use provided gameDate instead of current date', () => {
      const filename = generateFilename({ gameDate: '2024-12-25' });
      expect(filename).toBe('field_2024-12-25.png');
    });

    it('should use jpg extension for jpeg format', () => {
      const filename = generateFilename({ format: 'jpeg' });
      expect(filename).toBe('field_2025-06-15.jpg');
    });

    it('should sanitize team and opponent names', () => {
      const filename = generateFilename({
        teamName: 'Team@Special!',
        opponentName: 'Rival#Name$',
      });
      expect(filename).toBe('field_TeamSpecial_vs_RivalName_2025-06-15.png');
    });

    it('should handle all options together', () => {
      const filename = generateFilename({
        teamName: 'Eagles',
        opponentName: 'Hawks',
        gameDate: '2025-01-01',
        format: 'jpeg',
      });
      expect(filename).toBe('field_Eagles_vs_Hawks_2025-01-01.jpg');
    });
  });

  describe('formatTime', () => {
    it('should format zero seconds as 0:00', () => {
      expect(formatTime(0)).toBe('0:00');
    });

    it('should format single-digit seconds with padding', () => {
      expect(formatTime(5)).toBe('0:05');
    });

    it('should format 60 seconds as 1:00', () => {
      expect(formatTime(60)).toBe('1:00');
    });

    it('should format 90 seconds as 1:30', () => {
      expect(formatTime(90)).toBe('1:30');
    });

    it('should format large values correctly', () => {
      expect(formatTime(3661)).toBe('61:01'); // 61 minutes, 1 second
    });

    it('should format typical game time (15 minutes)', () => {
      expect(formatTime(900)).toBe('15:00');
    });

    it('should format time with single-digit minutes', () => {
      expect(formatTime(125)).toBe('2:05');
    });
  });

  describe('truncateText', () => {
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let measureTextSpy: jest.SpyInstance;

    beforeEach(() => {
      canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      ctx = canvas.getContext('2d')!;
      ctx.font = '16px system-ui, sans-serif';

      // Mock measureText since JSDOM doesn't properly measure text
      measureTextSpy = jest.spyOn(ctx, 'measureText').mockImplementation((text: string) => {
        // Approximate width: ~8px per character
        return { width: text.length * 8 } as TextMetrics;
      });
    });

    afterEach(() => {
      measureTextSpy.mockRestore();
    });

    it('should return text unchanged if it fits within maxWidth', () => {
      const text = 'Short'; // 5 chars * 8 = 40px
      const result = truncateText(text, 500, ctx);
      expect(result).toBe('Short');
    });

    it('should truncate text with ellipsis when too long', () => {
      const text = 'This is a very long team name'; // 29 chars * 8 = 232px
      const result = truncateText(text, 100, ctx); // max 100px ≈ 12 chars
      expect(result).toContain('…');
      expect(result.length).toBeLessThan(text.length);
    });

    it('should return just ellipsis for extremely narrow width', () => {
      const text = 'Some text';
      const result = truncateText(text, 8, ctx); // Only room for 1 char
      expect(result).toBe('…');
    });

    it('should handle empty string', () => {
      const result = truncateText('', 100, ctx);
      expect(result).toBe('');
    });

    it('should produce text that fits within maxWidth', () => {
      const text = 'A really long team name like Super Awesome Football Club United';
      const maxWidth = 150;
      const result = truncateText(text, maxWidth, ctx);
      const resultWidth = ctx.measureText(result).width;
      expect(resultWidth).toBeLessThanOrEqual(maxWidth);
    });

    it('should preserve as much text as possible', () => {
      const text = 'Team Name'; // 9 chars * 8 = 72px
      const result = truncateText(text, 50, ctx); // max 50px ≈ 6 chars
      // Should have some text before ellipsis
      expect(result.length).toBeGreaterThan(1);
      expect(result.endsWith('…')).toBe(true);
    });
  });

  describe('isExportSupported', () => {
    const originalDocument = global.document;

    afterEach(() => {
      // Restore original document
      if (originalDocument) {
        global.document = originalDocument;
      }
    });

    it('should return true when canvas.toBlob is available', () => {
      // In JSDOM, canvas.toBlob should be available
      expect(isExportSupported()).toBe(true);
    });

    it('should check for toBlob function availability', () => {
      // The function checks if canvas.toBlob is a function
      // In JSDOM it should be available
      const result = isExportSupported();
      expect(typeof result).toBe('boolean');
      expect(result).toBe(true); // JSDOM has toBlob
    });
  });

  describe('exportFieldAsImage', () => {
    let mockCanvas: HTMLCanvasElement;
    let mockContext: CanvasRenderingContext2D;
    let mockLink: HTMLAnchorElement;
    let originalCreateObjectURL: typeof URL.createObjectURL;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL;
    let appendChildSpy: jest.SpyInstance;
    let removeChildSpy: jest.SpyInstance;
    let createElementSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.useRealTimers(); // Start with real timers, switch when needed

      // Create mock canvas
      mockCanvas = document.createElement('canvas');
      mockCanvas.width = 800;
      mockCanvas.height = 600;
      mockContext = mockCanvas.getContext('2d')!;

      // Draw something on the canvas so it's not empty
      mockContext.fillStyle = 'green';
      mockContext.fillRect(0, 0, 800, 600);

      // Mock link element
      mockLink = document.createElement('a');
      mockLink.click = jest.fn();

      // Store original functions
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;

      // Mock URL methods
      URL.createObjectURL = jest.fn(() => 'blob:mock-url');
      URL.revokeObjectURL = jest.fn();

      // Mock appendChild and removeChild
      appendChildSpy = jest.spyOn(document.body, 'appendChild').mockImplementation((node) => node as HTMLAnchorElement);
      removeChildSpy = jest.spyOn(document.body, 'removeChild').mockImplementation((node) => node as HTMLAnchorElement);

      // Mock createElement to return our mock link for 'a' elements
      const realCreateElement = document.createElement.bind(document);
      createElementSpy = jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          return mockLink;
        }
        return realCreateElement(tagName);
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      jest.useRealTimers();
    });

    it('should export canvas without overlay', async () => {
      await exportFieldAsImage(mockCanvas, {
        includeOverlay: false,
      });

      expect(mockLink.click).toHaveBeenCalled();
      expect(mockLink.download).toMatch(/^field_.*\.png$/);
      expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it('should export canvas with overlay', async () => {
      await exportFieldAsImage(mockCanvas, {
        includeOverlay: true,
        teamName: 'Eagles',
        opponentName: 'Hawks',
        score: { home: 2, away: 1 },
      });

      expect(mockLink.click).toHaveBeenCalled();
      expect(mockLink.download).toContain('Eagles');
    });

    it('should use correct MIME type for PNG', async () => {
      const toBlobSpy = jest.spyOn(mockCanvas, 'toBlob');

      await exportFieldAsImage(mockCanvas, { format: 'png' });

      expect(toBlobSpy).toHaveBeenCalledWith(
        expect.any(Function),
        'image/png',
        0.92
      );
    });

    it('should use correct MIME type for JPEG', async () => {
      const toBlobSpy = jest.spyOn(mockCanvas, 'toBlob');

      await exportFieldAsImage(mockCanvas, { format: 'jpeg' });

      expect(toBlobSpy).toHaveBeenCalledWith(
        expect.any(Function),
        'image/jpeg',
        0.92
      );
    });

    it('should use custom quality for JPEG', async () => {
      const toBlobSpy = jest.spyOn(mockCanvas, 'toBlob');

      await exportFieldAsImage(mockCanvas, { format: 'jpeg', quality: 0.8 });

      expect(toBlobSpy).toHaveBeenCalledWith(
        expect.any(Function),
        'image/jpeg',
        0.8
      );
    });

    it('should clean up object URL immediately after download', async () => {
      await exportFieldAsImage(mockCanvas, {});

      // URL should have been created and then revoked
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should include all metadata in overlay export', async () => {
      const options: FieldExportOptions = {
        includeOverlay: true,
        teamName: 'Eagles',
        opponentName: 'Hawks',
        gameDate: '2025-06-15',
        gameTime: '14:30',
        score: { home: 3, away: 2 },
        homeOrAway: 'home',
        currentPeriod: 2,
        numberOfPeriods: 2,
        timeElapsedInSeconds: 1234,
        gameLocation: 'Central Stadium',
        ageGroup: 'U12',
        gameType: 'soccer',
      };

      await exportFieldAsImage(mockCanvas, options);

      expect(mockLink.click).toHaveBeenCalled();
      expect(mockLink.download).toBe('field_Eagles_vs_Hawks_2025-06-15.png');
    });

    it('should add link to body, click, then remove', async () => {
      await exportFieldAsImage(mockCanvas, {});

      expect(appendChildSpy).toHaveBeenCalledWith(mockLink);
      expect(mockLink.click).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalledWith(mockLink);
    });

    // Error handling tests at the end (they modify mocks)
    it('should handle toBlob failure gracefully', async () => {
      const toBlobSpy = jest.spyOn(mockCanvas, 'toBlob').mockImplementation((callback) => {
        callback(null);
      });

      await expect(exportFieldAsImage(mockCanvas, {})).rejects.toThrow(
        'Failed to create image blob'
      );

      toBlobSpy.mockRestore();
    });

    it('should throw when canvas context cannot be obtained for overlay', async () => {
      // Restore the spy before re-mocking
      createElementSpy.mockRestore();

      const realCreateElement = document.createElement.bind(document);
      const localCreateElementSpy = jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => null,
          } as unknown as HTMLCanvasElement;
        }
        if (tagName === 'a') {
          return mockLink;
        }
        return realCreateElement(tagName);
      });

      const badCanvas = {
        width: 800,
        height: 600,
        toBlob: jest.fn(),
      } as unknown as HTMLCanvasElement;

      await expect(
        exportFieldAsImage(badCanvas, { includeOverlay: true })
      ).rejects.toThrow('Failed to get canvas context');

      localCreateElementSpy.mockRestore();
    });
  });
});
