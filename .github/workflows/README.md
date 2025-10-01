# GitHub Actions Workflows

This directory contains CI/CD workflows for the MatchOps project.

## Available Workflows

### 1. `ci.yml` - Continuous Integration
Main CI pipeline that runs on every push and PR.

**Triggers:** Push, Pull Request

**Jobs:**
- Lint check
- Type check
- Unit tests
- Build verification
- Test coverage

### 2. `claude-code-review.yml` - Standard Code Review
Automated code review using Claude Code for general quality checks.

**Triggers:**
- Pull request with `code-review` label
- Manual dispatch

**Usage:**
```bash
# Add label to PR to trigger review
gh pr edit <PR_NUMBER> --add-label "code-review"
```

### 3. `claude-custom-review.yml` - Specialized Reviews ⭐ NEW
Flexible review workflow with multiple specialized review types.

**Triggers:**
- Pull request labels: `review:security`, `review:performance`, etc.
- Manual dispatch with custom prompts

**Available Review Types:**

#### 🔒 Security Review (`review:security`)
Focuses on:
- Authentication & Authorization
- Data Protection & Encryption
- Input Validation (XSS, Injection)
- Browser Security (CSP, CORS)
- Privacy & GDPR Compliance

```bash
gh pr edit <PR_NUMBER> --add-label "review:security"
```

#### ⚡ Performance Review (`review:performance`)
Focuses on:
- React Performance (re-renders, memoization)
- Bundle Size & Code Splitting
- IndexedDB Optimization
- Algorithm Efficiency
- Memory Leaks

```bash
gh pr edit <PR_NUMBER> --add-label "review:performance"
```

#### 🏗️ Architecture Review (`review:architecture`)
Focuses on:
- Code Organization & Structure
- Design Patterns
- Data Flow & State Management
- Scalability & Extensibility
- Local-First Architecture Compliance

```bash
gh pr edit <PR_NUMBER> --add-label "review:architecture"
```

#### 🧪 Testing Review (`review:testing`)
Focuses on:
- Test Coverage & Edge Cases
- Test Quality & Maintainability
- Mock Usage
- Testing Best Practices
- Flaky Test Detection

```bash
gh pr edit <PR_NUMBER> --add-label "review:testing"
```

#### 📚 Documentation Review (`review:documentation`)
Focuses on:
- JSDoc Completeness
- README Updates
- API Documentation
- Inline Comments Quality
- Architecture Documentation

```bash
gh pr edit <PR_NUMBER> --add-label "review:documentation"
```

#### ♿ Accessibility Review (`review:accessibility`)
Focuses on:
- Semantic HTML
- ARIA Attributes
- Keyboard Navigation
- Screen Reader Support
- WCAG Compliance

```bash
gh pr edit <PR_NUMBER> --add-label "review:accessibility"
```

#### 🎯 Custom Review
Run a custom review with your own prompt.

**Via GitHub UI:**
1. Go to Actions tab
2. Select "Claude Custom Review"
3. Click "Run workflow"
4. Choose "custom" as review type
5. Enter your custom prompt
6. Enter PR number

**Via CLI:**
```bash
gh workflow run claude-custom-review.yml \
  -f review_type=custom \
  -f custom_prompt="Please review the GraphQL schema changes for consistency and best practices" \
  -f pr_number=35
```

### 4. `test-guards.yml` - Test Quality Guards
Ensures test quality and prevents regressions.

**Triggers:** Push, Pull Request

**Checks:**
- Test isolation
- Memory leak detection
- Flaky test tracking
- Test coverage thresholds

### 5. `full-test-suite.yml` - Complete Test Run
Runs the full test suite including integration tests.

**Triggers:** Manual dispatch, scheduled

## Tips & Best Practices

### Multiple Review Types
You can add multiple review labels to a PR for comprehensive analysis:

```bash
gh pr edit 35 --add-label "review:security" --add-label "review:performance"
```

This will trigger both security and performance reviews in parallel.

### Review Type Selection Guide

| Change Type | Recommended Reviews |
|------------|-------------------|
| New features | architecture, testing, documentation |
| Bug fixes | testing, security |
| Performance optimization | performance, testing |
| UI changes | accessibility, performance |
| API changes | architecture, documentation, security |
| Database/Storage changes | security, performance, architecture |
| Refactoring | architecture, testing |

### Custom Review Examples

**Database Schema Review:**
```bash
gh workflow run claude-custom-review.yml \
  -f review_type=custom \
  -f custom_prompt="Review the IndexedDB schema changes for data consistency, migration safety, and performance impact" \
  -f pr_number=35
```

**Internationalization Review:**
```bash
gh workflow run claude-custom-review.yml \
  -f review_type=custom \
  -f custom_prompt="Review i18n changes for translation completeness, string formatting, and RTL support" \
  -f pr_number=35
```

**PWA Review:**
```bash
gh workflow run claude-custom-review.yml \
  -f review_type=custom \
  -f custom_prompt="Review PWA implementation for service worker best practices, offline capability, and manifest correctness" \
  -f pr_number=35
```

## Workflow Outputs

Reviews are posted as PR comments with structured feedback including:
- Issue severity/priority
- Specific code locations
- Suggested fixes with examples
- Best practice recommendations

## Troubleshooting

### Review Not Triggering
1. Check that the label is spelled correctly (e.g., `review:security` not `security-review`)
2. Verify `CLAUDE_CODE_OAUTH_TOKEN` secret is configured
3. Check workflow permissions in repository settings

### Manual Trigger Not Working
1. Ensure you have write access to the repository
2. Verify the PR number is correct
3. Check GitHub Actions logs for detailed error messages

## Configuration

All workflows use the following secrets:
- `CLAUDE_CODE_OAUTH_TOKEN` - Required for Claude Code reviews

## Contributing

When adding new workflows:
1. Add comprehensive documentation here
2. Include example usage
3. Test with a draft PR first
4. Update this README with any new review types
