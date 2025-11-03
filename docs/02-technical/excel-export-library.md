# Excel Export Library: xlsx to ExcelJS Migration Path

## Current Status

**Library:** SheetJS xlsx
**Version:** 0.20.3 (upgraded from 0.18.5 on 2025-11-03)
**License:** Apache 2.0 (Community Edition)
**Location:** `src/utils/exportExcel.ts`

## Why xlsx 0.20.3?

### Security Fixes
The upgrade from 0.18.5 to 0.20.3 addresses critical security vulnerabilities:
- **CVE-2023-30533**: Prototype Pollution vulnerability (fixed in 0.19.3)
- **CVE-2024-22363**: ReDoS (Regular Expression Denial of Service) vulnerability (fixed in 0.20.2)

### Version Note
xlsx 0.20.3 must be installed from SheetJS CDN, not npm registry:
```bash
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

SheetJS intentionally moved away from npm for their latest versions.

## Current Implementation

### Files
- **Export Logic:** `/src/utils/exportExcel.ts`
- **Integration:** `/src/components/HomePage.tsx`, `/src/components/GameStatsModal.tsx`
- **Tests:** Export functionality tested in `src/utils/seasonTournamentExport.test.ts`

### Features Used
- `XLSX.utils.book_new()` - Create new workbook
- `XLSX.utils.json_to_sheet()` - Convert JSON to worksheet
- `XLSX.utils.book_append_sheet()` - Add sheet to workbook
- `XLSX.write()` - Generate Excel file buffer

All features used are available in the **free Apache 2.0 Community Edition**.

### Export Functions
1. **`exportCurrentGameExcel()`** - Single game export (5 sheets)
2. **`exportAggregateExcel()`** - Team/season/tournament stats (7 sheets)
3. **`exportPlayerExcel()`** - Individual player stats (6 sheets)

## Licensing Considerations

### Apache 2.0 Compliance
Current usage is fully compliant with Apache 2.0 license. Required attribution:
```
SheetJS Community Edition -- https://sheetjs.com/
Copyright (C) 2012-present SheetJS LLC
Licensed under the Apache License, Version 2.0
```

### Pro Edition Features (NOT Used)
The Pro Edition (commercial license required) includes:
- Advanced styling (colors, fonts, borders, fills)
- Complex template editing
- Images, graphs, PivotTables
- Formula evaluation

We do **not** use any Pro features.

## Future Migration: ExcelJS

### Why Consider ExcelJS?

**Recommended for future migration** when styling capabilities are needed.

| Aspect | xlsx 0.20.3 | ExcelJS |
|--------|-------------|---------|
| **License** | Apache 2.0 | **MIT** ✅ |
| **Bundle Size** | ~864 KB minified | ~1080 KB minified |
| **Styling** | ❌ (requires Pro) | ✅ Free |
| **Maintenance** | ✅ Active | ✅ Very Active |
| **Stars/Downloads** | 35K / 3.7M/wk | 14K / 2.7M/wk |

**Bundle Impact:** ~150-216 KB increase (~17-25%)

### When to Migrate?

Migrate to ExcelJS when:
1. **Styling needed** - Colored headers, formatted cells, borders
2. **Cleaner licensing preferred** - MIT is simpler than Apache 2.0
3. **Bundle size acceptable** - ~150KB increase is reasonable
4. **Rich features wanted** - Charts, images, data validation

### Migration Guide

#### Current xlsx Code
```typescript
const workbook = XLSX.utils.book_new();
const sheet = XLSX.utils.json_to_sheet(data);
XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
```

#### ExcelJS Equivalent
```typescript
import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Sheet1');

// Add headers
sheet.addRow(Object.keys(data[0]));

// Add data rows
data.forEach(row => sheet.addRow(Object.values(row)));

// With styling (bonus feature)
sheet.getRow(1).font = { bold: true };
sheet.getRow(1).fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF4F81BD' }
};

const buffer = await workbook.xlsx.writeBuffer();
```

### Migration Checklist

- [ ] Install ExcelJS: `npm install exceljs`
- [ ] Update `src/utils/exportExcel.ts`:
  - [ ] Replace xlsx imports with ExcelJS
  - [ ] Refactor `exportCurrentGameExcel()` function
  - [ ] Refactor `exportAggregateExcel()` function
  - [ ] Refactor `exportPlayerExcel()` function
  - [ ] Update `triggerDownload()` for async buffer generation
- [ ] Update tests in `src/utils/seasonTournamentExport.test.ts`
- [ ] Test all three export workflows:
  - [ ] Single game export
  - [ ] Aggregate stats export
  - [ ] Individual player export
- [ ] Verify bundle size impact acceptable
- [ ] Update this documentation
- [ ] Remove xlsx dependency
- [ ] Update package.json

### Alternative: xlsx-js-style

If you need basic styling but want minimal migration:

**xlsx-js-style** is a fork of SheetJS CE with styling support:
- License: Apache 2.0 (same as xlsx)
- Bundle Size: ~864 KB (same as xlsx)
- Migration: **Drop-in replacement** - just change import
- Features: Basic styling (alignment, borders, fills, fonts)

```typescript
// Change this:
import * as XLSX from 'xlsx';

// To this:
import * as XLSX from 'xlsx-js-style';
```

Use this if:
- Need styling **urgently**
- Want **minimal code changes**
- Okay with **Apache 2.0 license**

## Recommendations

### Short-Term (Current)
✅ **Stay with xlsx 0.20.3**
- Security vulnerabilities fixed
- No breaking changes from 0.18.5
- Works perfectly for current needs
- Apache 2.0 is acceptable for local-first PWA

### Long-Term (When Styling Needed)
✅ **Migrate to ExcelJS**
- Better licensing (MIT)
- Rich styling capabilities
- Active development
- ~150KB bundle increase is justified

### Interim Option
⚠️ **xlsx-js-style** (if styling needed before full migration)
- Drop-in replacement
- Minimal effort
- Same bundle size
- But still Apache 2.0

## Bundle Size Monitoring

Current first load JS (with xlsx 0.20.3): **705 KB**

Track bundle size impact:
```bash
npm run build:analyze
```

Acceptable thresholds for PWA:
- ✅ < 800 KB: Excellent
- ⚠️ 800-1000 KB: Good
- ❌ > 1000 KB: Consider optimization

## References

- [SheetJS Community Edition](https://sheetjs.com/)
- [ExcelJS GitHub](https://github.com/exceljs/exceljs)
- [xlsx-js-style GitHub](https://github.com/gitbrent/xlsx-js-style)
- [CVE-2023-30533 Details](https://nvd.nist.gov/vuln/detail/CVE-2023-30533)
- [CVE-2024-22363 Details](https://nvd.nist.gov/vuln/detail/CVE-2024-22363)

## Decision Log

| Date | Version | Decision | Reason |
|------|---------|----------|--------|
| 2025-11-03 | 0.20.3 | Upgraded from 0.18.5 | Security fixes (CVE-2023-30533, CVE-2024-22363) |
| TBD | ExcelJS | Planned migration | When styling features needed |

---

*Last updated: 2025-11-03*
