import { forgetReplacedReport, readReplacedReport, rememberReplacedReport } from '../reportUndo';

describe('reportUndo', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('gives back the report that was replaced for this game', () => {
    rememberReplacedReport('g1', 'Alkuperainen raportti.');
    expect(readReplacedReport('g1')).toBe('Alkuperainen raportti.');
  });

  /**
   * @critical - an Undo that restored another match's report would overwrite a
   * finished record with text from somewhere else entirely.
   */
  it('never offers one match the report of another', () => {
    rememberReplacedReport('g1', 'Ottelun 1 raportti.');
    expect(readReplacedReport('g2')).toBeNull();
  });

  it('keeps only the most recent replacement', () => {
    rememberReplacedReport('g1', 'Ensimmainen.');
    rememberReplacedReport('g2', 'Toinen.');
    expect(readReplacedReport('g1')).toBeNull();
    expect(readReplacedReport('g2')).toBe('Toinen.');
  });

  it('forgets on request, so the old text does not sit on the device', () => {
    rememberReplacedReport('g1', 'Poistettava.');
    forgetReplacedReport();
    expect(readReplacedReport('g1')).toBeNull();
    expect(localStorage.getItem('matchops_report_undo')).toBeNull();
  });

  it('stops offering an undo the coach has long since moved past', () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    localStorage.setItem('matchops_report_undo', JSON.stringify({ gameId: 'g1', text: 'Vanha.', at: old }));
    expect(readReplacedReport('g1')).toBeNull();
  });

  it('treats a corrupt slot as no undo rather than throwing', () => {
    localStorage.setItem('matchops_report_undo', 'not json');
    expect(readReplacedReport('g1')).toBeNull();
  });

  it('ignores a slot with no usable text', () => {
    localStorage.setItem('matchops_report_undo', JSON.stringify({ gameId: 'g1', at: new Date().toISOString() }));
    expect(readReplacedReport('g1')).toBeNull();
  });
});
