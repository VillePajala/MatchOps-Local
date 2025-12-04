import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
const files = Object.entries(data)
  .filter(([k]) => k !== 'total')
  .map(([file, cov]) => ({
    file: file.replace('/home/villepajala/projects/MatchOps-Local/', ''),
    stmts: cov.statements.pct,
    branch: cov.branches.pct,
    funcs: cov.functions.pct,
    uncovered: cov.statements.total - cov.statements.covered
  }))
  .filter(f => f.uncovered > 20)
  .sort((a, b) => b.uncovered - a.uncovered)
  .slice(0, 35);

console.log('Files with most uncovered statements (>20 uncovered):');
console.log('');
files.forEach(f => {
  console.log(f.file);
  console.log(`  Stmts: ${f.stmts.toFixed(1)}% | Branch: ${f.branch.toFixed(1)}% | Funcs: ${f.funcs.toFixed(1)}% | Uncovered: ${f.uncovered}`);
});
