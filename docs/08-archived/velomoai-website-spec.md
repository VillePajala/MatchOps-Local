# Velomo AI Website Specification

**Status**: 📋 Ready for Implementation
**Created**: December 17, 2025
**Target**: velomoai.com

---

## Overview

Build a minimal, professional landing page for Velomo AI - a solo software company. The site should establish company presence and direct visitors to the flagship product (MatchOps).

### Goals
1. Professional company presence
2. Direct visitors to MatchOps product
3. Provide contact information
4. Fast, simple, maintainable

### Non-Goals (v1)
- Blog
- Multiple pages
- CMS integration
- Analytics (add later)
- Contact forms (use email links)

---

## Tech Stack

| Component | Choice | Reason |
|-----------|--------|--------|
| Framework | Next.js 16.x (App Router) | Latest stable, matches MatchOps |
| React | 19.x | Included with Next.js 16 |
| Styling | Tailwind CSS 4.x | Latest, faster builds |
| Deployment | Vercel | Free, automatic deploys |
| Domain | velomoai.com | Already registered, DNS on Cloudflare |

> **Note**: Next.js 16 uses Turbopack by default (5-10x faster builds), React 19.2, and has built-in React Compiler support.

### Project Setup
```bash
npx create-next-app@latest velomoai-website --typescript --tailwind --app --no-src-dir
```

This will install the latest Next.js (16.x) with Tailwind CSS 4.x automatically.

---

## Page Structure

**Single page with sections:**

```
┌─────────────────────────────────────────┐
│              HEADER                      │
│         Logo    [Contact]               │
├─────────────────────────────────────────┤
│                                         │
│              HERO SECTION               │
│                                         │
│           Velomo AI                     │
│    Building tools for coaches           │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│            PRODUCT SECTION              │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │         MatchOps                 │   │
│  │  Soccer coaching made simple     │   │
│  │                                  │   │
│  │  • Track games and stats         │   │
│  │  • Manage player rosters         │   │
│  │  • Plan tactics visually         │   │
│  │  • Works offline                 │   │
│  │                                  │   │
│  │  [Visit MatchOps →]              │   │
│  └─────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤
│              FOOTER                     │
│   © 2025-2026 Velomo AI · Finland      │
│   hello@velomoai.com                    │
└─────────────────────────────────────────┘
```

---

## Content

### Header
- **Logo**: "Velomo AI" text (no image logo needed for v1)
- **Navigation**: Single "Contact" link → scrolls to footer or mailto:

### Hero Section
- **Headline**: "Velomo AI"
- **Tagline**: "Building tools for coaches and athletes"
- **Optional**: Subtle background gradient or pattern

### Product Section
- **Product Card: MatchOps**
  - Name: "MatchOps"
  - Description: "Soccer coaching made simple"
  - Features (bullet points):
    - Track games and player statistics
    - Manage team rosters
    - Plan tactics with visual field editor
    - Works completely offline
    - Privacy-focused: your data stays on your device
  - CTA Button: "Visit MatchOps →" → https://match-ops.com
  - Optional: App screenshot or icon

### Footer
- Copyright: "© 2025-2026 Velomo AI"
- Location: "Helsinki, Finland"
- Email: hello@velomoai.com (mailto: link)
- Optional: Social links (add when accounts exist)

---

## Design Requirements

### Visual Style
- **Theme**: Dark mode (matches MatchOps aesthetic)
- **Colors**:
  - Background: Dark slate (#0f172a or similar)
  - Text: White/light gray
  - Accent: Indigo/purple (#6366f1) - matches MatchOps
  - Secondary accent: Yellow (#facc15) - for highlights
- **Typography**: System fonts or Inter/Geist (Vercel's font)
- **Spacing**: Generous whitespace, not cramped

### Responsive Design
- Mobile-first
- Single column on mobile
- Comfortable reading width on desktop (max-w-4xl or similar)
- No horizontal scroll

### Performance
- Lighthouse score: 95+ on all metrics
- No external fonts if possible (use system fonts)
- No JavaScript required for core content
- Static generation (no SSR needed)

### Accessibility
- Semantic HTML (header, main, footer, section)
- Sufficient color contrast (WCAG AA)
- Focusable interactive elements
- Alt text for any images

---

## File Structure

```
velomoai-website/
├── app/
│   ├── layout.tsx      # Root layout with metadata
│   ├── page.tsx        # Single landing page
│   └── globals.css     # Tailwind 4 imports + custom styles
├── components/
│   ├── Header.tsx
│   ├── Hero.tsx
│   ├── ProductCard.tsx
│   └── Footer.tsx
├── public/
│   ├── favicon.ico
│   └── og-image.png    # Social sharing image (optional v1)
├── next.config.ts      # Next.js 16 uses .ts by default
└── package.json
```

> **Note**: Tailwind CSS 4 uses CSS-based configuration in `globals.css` instead of `tailwind.config.ts`. Configuration is done via `@theme` directive in CSS.

---

## Metadata & SEO

### Page Metadata (in layout.tsx)
```typescript
export const metadata: Metadata = {
  title: 'Velomo AI - Building tools for coaches',
  description: 'Velomo AI creates privacy-focused software for coaches and athletes. Our flagship product MatchOps helps soccer coaches track games, manage rosters, and plan tactics.',
  keywords: ['Velomo AI', 'MatchOps', 'soccer coaching', 'sports software', 'coaching tools'],
  authors: [{ name: 'Velomo AI' }],
  openGraph: {
    title: 'Velomo AI',
    description: 'Building tools for coaches and athletes',
    url: 'https://velomoai.com',
    siteName: 'Velomo AI',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Velomo AI',
    description: 'Building tools for coaches and athletes',
  },
  robots: {
    index: true,
    follow: true,
  },
};
```

### Favicon
- Use a simple "V" or "VA" lettermark
- Generate sizes: 16x16, 32x32, apple-touch-icon

---

## Deployment

### Vercel Setup
1. Create new project in Vercel
2. Connect to GitHub repository
3. Framework preset: Next.js (auto-detected)
4. Deploy

### Domain Configuration
1. In Vercel: Settings → Domains → Add `velomoai.com` and `www.velomoai.com`
2. In Cloudflare (already configured):
   ```
   A     @    → 76.76.21.21 (Vercel)
   CNAME www  → cname.vercel-dns.com
   ```
3. Vercel will auto-provision SSL

### Environment Variables
None required for v1.

---

## Future Enhancements (Not v1)

| Feature | Priority | Notes |
|---------|----------|-------|
| Analytics (Plausible/Umami) | Medium | Privacy-focused analytics |
| Blog section | Low | For updates, articles |
| Additional products | Low | When we have more products |
| Finnish language | Low | i18n support |
| Contact form | Low | Currently using mailto: |
| Social media links | Medium | Add when accounts created |
| Team/About section | Low | Not needed for solo operation |

---

## Acceptance Criteria

### Must Have (v1)
- [ ] Single page loads at velomoai.com
- [ ] Displays company name and tagline
- [ ] Shows MatchOps product with link to match-ops.com
- [ ] Contact email visible in footer
- [ ] Mobile responsive
- [ ] Dark theme matching MatchOps aesthetic
- [ ] Lighthouse performance score 90+
- [ ] Deployed on Vercel

### Nice to Have (v1)
- [ ] Smooth scroll for navigation
- [ ] Subtle animations (fade in on load)
- [ ] Open Graph image for social sharing

### Out of Scope (v1)
- Multiple pages
- Blog
- Contact form
- Analytics
- CMS

---

## Example Code Snippets

### Basic Page Structure (app/page.tsx)
```tsx
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import ProductCard from '@/components/ProductCard';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <Header />
      <main>
        <Hero />
        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-8 text-center">Our Products</h2>
            <ProductCard
              name="MatchOps"
              description="Soccer coaching made simple"
              features={[
                'Track games and player statistics',
                'Manage team rosters',
                'Plan tactics with visual field editor',
                'Works completely offline',
                'Privacy-focused: your data stays on your device',
              ]}
              href="https://match-ops.com"
            />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
```

### ProductCard Component Example
```tsx
interface ProductCardProps {
  name: string;
  description: string;
  features: string[];
  href: string;
}

export default function ProductCard({ name, description, features, href }: ProductCardProps) {
  return (
    <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700">
      <h3 className="text-2xl font-bold text-yellow-400 mb-2">{name}</h3>
      <p className="text-slate-300 mb-6">{description}</p>
      <ul className="space-y-2 mb-8">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-slate-300">
            <span className="text-indigo-400 mt-1">✓</span>
            {feature}
          </li>
        ))}
      </ul>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
      >
        Visit {name}
        <span>→</span>
      </a>
    </div>
  );
}
```

---

## Handoff Checklist

Before handing to another AI/developer:

- [x] Tech stack defined
- [x] Content written
- [x] Design requirements specified
- [x] File structure outlined
- [x] Deployment steps documented
- [x] Acceptance criteria listed
- [x] Example code provided

**Ready for implementation.**
