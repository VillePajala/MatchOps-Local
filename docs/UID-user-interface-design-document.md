# User Interface Design Document (UID)
# MatchOps Marketing Website

**Document Version**: 1.0  
**Date**: 2025-08-31  
**Product**: MatchOps Marketing Website  
**Design Team**: Development Team  
**Status**: Draft  

---

## Table of Contents

1. [Design Overview](#1-design-overview)
2. [Design System](#2-design-system)
3. [Layout Architecture](#3-layout-architecture)
4. [Page-Specific Designs](#4-page-specific-designs)
5. [Component Library](#5-component-library)
6. [Responsive Design](#6-responsive-design)
7. [Accessibility Guidelines](#7-accessibility-guidelines)
8. [Animation & Interaction](#8-animation--interaction)
9. [Performance Considerations](#9-performance-considerations)
10. [Implementation Guidelines](#10-implementation-guidelines)

---

## 1. Design Overview

### 1.1 Design Philosophy
The MatchOps website design maintains visual consistency with the existing PWA while optimizing for marketing effectiveness and user conversion. The design emphasizes:

- **Premium Dark Aesthetic**: Sophisticated dark theme conveying professional quality
- **Interactive Elegance**: Subtle animations and hover effects that enhance without distracting
- **Content Hierarchy**: Clear visual flow guiding users through the conversion funnel
- **Performance-First**: Beautiful design that doesn't compromise loading speed
- **Accessibility**: Inclusive design that works for all users

### 1.2 Visual Principles
1. **Consistency**: Align with MatchOps Local app design language
2. **Clarity**: Information hierarchy supports user goals
3. **Emotion**: Design evokes trust, professionalism, and excitement
4. **Functionality**: Every element serves a specific user need
5. **Scalability**: Design system supports future growth

### 1.3 Brand Expression
The website design reinforces the MatchOps brand identity:
- **Sophisticated**: Professional-grade tools for serious coaches
- **Accessible**: Complex features made simple and approachable
- **Innovative**: Cutting-edge technology in familiar interfaces
- **Trustworthy**: Reliable, well-crafted, and thoughtfully designed

---

## 2. Design System

### 2.1 Color Palette

#### 2.1.1 Primary Colors
Based on the existing MatchOps Local app color scheme:

```css
/* Primary Gradients */
--primary-gradient: linear-gradient(135deg, #4F46E5, #7C3AED);
--primary-indigo: #4F46E5;
--primary-violet: #7C3AED;

/* Accent Colors */
--accent-cyan: #22D3EE;
--accent-lime: #A3E635;
--accent-yellow: #FDE047;
--accent-orange: #F97316;
--accent-magenta: #E83D6D;

/* Background Colors */
--bg-primary: #0F172A;    /* slate-950 */
--bg-secondary: #1E293B;  /* slate-800 */
--bg-tertiary: #334155;   /* slate-600 */

/* Text Colors */
--text-primary: #F1F5F9;   /* slate-100 */
--text-secondary: #CBD5E1; /* slate-300 */
--text-muted: #94A3B8;     /* slate-400 */
```

#### 2.1.2 Semantic Color Usage
- **Primary Actions**: Indigo to Violet gradient
- **Secondary Actions**: Slate variations
- **Success**: Lime accent (#A3E635)
- **Warning**: Yellow accent (#FDE047)
- **Error**: Red-orange (#EF4444)
- **Info**: Cyan accent (#22D3EE)

#### 2.1.3 Holographic Effect Colors
For logo and special elements:
```css
--holo-primary: conic-gradient(from 0deg at 50% 50%, 
  #22D3EE 0deg, #A3E635 60deg, #FDE047 120deg, 
  #F97316 180deg, #E83D6D 240deg, #8B5CF6 300deg, 
  #22D3EE 360deg);
```

### 2.2 Typography System

#### 2.2.1 Font Families
```css
/* Display Font - For headings and logo */
--font-display: 'Audiowide', 'Inter', sans-serif;
--font-family-display: var(--font-audiowide);

/* Body Font - For content and UI elements */
--font-body: 'Rajdhani', 'Inter', sans-serif;
--font-family-sans: var(--font-rajdhani);
```

#### 2.2.2 Font Scale
```css
/* Heading Scales */
--text-9xl: 8rem;    /* 128px - Hero titles */
--text-8xl: 6rem;    /* 96px - Large displays */
--text-7xl: 4.5rem;  /* 72px - Section headers */
--text-6xl: 3.75rem; /* 60px - Page titles */
--text-5xl: 3rem;    /* 48px - Major headings */
--text-4xl: 2.25rem; /* 36px - Section headings */
--text-3xl: 1.875rem; /* 30px - Subsection headings */
--text-2xl: 1.5rem;   /* 24px - Card titles */
--text-xl: 1.25rem;   /* 20px - Large body text */

/* Body Text Scales */
--text-lg: 1.125rem; /* 18px - Large body text */
--text-base: 1rem;   /* 16px - Default body text */
--text-sm: 0.875rem; /* 14px - Small text */
--text-xs: 0.75rem;  /* 12px - Captions, labels */
```

#### 2.2.3 Font Weights
```css
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
--font-extrabold: 800;
```

### 2.3 Spacing System

#### 2.3.1 Base Spacing Scale
Following Tailwind CSS spacing conventions:
```css
--space-px: 1px;
--space-0: 0px;
--space-1: 0.25rem;  /* 4px */
--space-2: 0.5rem;   /* 8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-5: 1.25rem;  /* 20px */
--space-6: 1.5rem;   /* 24px */
--space-8: 2rem;     /* 32px */
--space-10: 2.5rem;  /* 40px */
--space-12: 3rem;    /* 48px */
--space-16: 4rem;    /* 64px */
--space-20: 5rem;    /* 80px */
--space-24: 6rem;    /* 96px */
--space-32: 8rem;    /* 128px */
```

#### 2.3.2 Component Spacing Guidelines
- **Section Padding**: space-16 to space-24 vertical
- **Card Padding**: space-6 to space-8
- **Button Padding**: space-3 to space-4 vertical, space-6 to space-8 horizontal
- **Text Margins**: space-4 between paragraphs, space-2 between related elements

### 2.4 Border Radius System
```css
--radius-none: 0px;
--radius-sm: 0.125rem;  /* 2px */
--radius-default: 0.25rem; /* 4px */
--radius-md: 0.375rem;  /* 6px */
--radius-lg: 0.5rem;    /* 8px */
--radius-xl: 0.75rem;   /* 12px */
--radius-2xl: 1rem;     /* 16px */
--radius-full: 9999px;  /* Full circle */
```

### 2.5 Shadow System
```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-default: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
--shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
--shadow-inner: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);

/* Colored Shadows for Interactive Elements */
--shadow-indigo: 0 10px 15px -3px rgb(79 70 229 / 0.4), 0 4px 6px -4px rgb(79 70 229 / 0.4);
--shadow-violet: 0 10px 15px -3px rgb(124 58 237 / 0.4), 0 4px 6px -4px rgb(124 58 237 / 0.4);
```

---

## 3. Layout Architecture

### 3.1 Grid System

#### 3.1.1 Container Sizes
```css
/* Max-width containers */
--container-sm: 640px;   /* Small screens */
--container-md: 768px;   /* Medium screens */
--container-lg: 1024px;  /* Large screens */
--container-xl: 1280px;  /* Extra large screens */
--container-2xl: 1536px; /* 2X large screens */

/* Content-specific containers */
--container-content: 65ch;  /* Optimal reading width */
--container-form: 28rem;    /* Form elements */
```

#### 3.1.2 Grid Layout Patterns
```css
/* Feature grid */
.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}

/* Two-column layout */
.two-column {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
}

/* Three-column layout */
.three-column {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
}
```

### 3.2 Layout Components

#### 3.2.1 Page Structure
```html
<div class="page-container">
  <header class="site-header">
    <!-- Navigation -->
  </header>
  <main class="main-content">
    <section class="hero-section">
      <!-- Hero content -->
    </section>
    <section class="content-section">
      <!-- Page content -->
    </section>
  </main>
  <footer class="site-footer">
    <!-- Footer content -->
  </footer>
</div>
```

#### 3.2.2 Section Patterns
```css
/* Standard section */
.section {
  padding: var(--space-16) var(--space-4);
  max-width: var(--container-xl);
  margin: 0 auto;
}

/* Hero section */
.hero {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

/* Content section */
.content {
  padding: var(--space-24) var(--space-6);
}
```

---

## 4. Page-Specific Designs

### 4.1 Homepage Design

#### 4.1.1 Hero Section Layout
```
┌─────────────────────────────────────────┐
│              Navigation                  │
├─────────────────────────────────────────┤
│                                         │
│         [Holographic Logo]              │
│       "MatchOps Local"                  │
│                                         │
│    "Professional Soccer Coaching       │
│         Made Simple"                    │
│                                         │
│     [Primary CTA: "Try Free Now"]      │
│                                         │
│    [App Screenshot/Interactive Demo]    │
│                                         │
└─────────────────────────────────────────┘
```

**Design Specifications:**
- **Background**: Dark gradient with subtle animations
- **Logo**: Holographic effect with 3D extrusion
- **Headline**: Large Audiowide font with gradient text
- **CTA Button**: Prominent gradient button with hover effects
- **Visual**: High-quality app screenshot or interactive preview

#### 4.1.2 Features Section Layout
```
┌─────────────────────────────────────────┐
│         "Key Features"                  │
│                                         │
│  [Icon] Feature 1    [Icon] Feature 2   │
│  Description         Description        │
│                                         │
│  [Icon] Feature 3    [Icon] Feature 4   │
│  Description         Description        │
│                                         │
│  [Icon] Feature 5    [Icon] Feature 6   │
│  Description         Description        │
│                                         │
└─────────────────────────────────────────┘
```

**Design Specifications:**
- **Grid**: 2 columns on desktop, 1 on mobile
- **Icons**: Custom soccer-themed iconography
- **Cards**: Subtle background with hover elevation
- **Typography**: Clear hierarchy with benefit-focused copy

#### 4.1.3 Social Proof Section
```
┌─────────────────────────────────────────┐
│        "Trusted by Coaches"             │
│                                         │
│  "Coach testimonial quote here with     │
│   compelling benefit statement."        │
│           - Coach Name, Team            │
│                                         │
│     [Usage Statistics Grid]             │
│   1000+ Games Tracked | 500+ Coaches   │
│                                         │
└─────────────────────────────────────────┘
```

### 4.2 Features Page Design

#### 4.2.1 Feature Detail Layout
```
┌─────────────────────────────────────────┐
│    [Feature Name]                       │
│                                         │
│  [Large Screenshot]  │  [Description]   │
│                     │  • Benefit 1     │
│                     │  • Benefit 2     │
│                     │  • Benefit 3     │
│                     │                  │
│                     │  [Try Now CTA]   │
└─────────────────────────────────────────┘
```

**Design Specifications:**
- **Layout**: Alternating left/right image-text pairs
- **Images**: High-quality app screenshots with annotations
- **Content**: Benefit-focused descriptions with clear CTAs
- **Interactive**: Expandable sections for technical details

### 4.3 How It Works Page Design

#### 4.3.1 Process Flow Layout
```
┌─────────────────────────────────────────┐
│        "Getting Started"                │
│                                         │
│    Step 1 → Step 2 → Step 3 → Step 4   │
│   [Icon]   [Icon]   [Icon]   [Icon]    │
│   Install  Setup    First    Master     │
│    App     Team     Game     Features   │
│                                         │
│         [Video Tutorial]                │
│                                         │
└─────────────────────────────────────────┘
```

**Design Specifications:**
- **Flow**: Visual progression with connecting lines
- **Steps**: Numbered circles with clear descriptions
- **Video**: Embedded tutorial with custom player controls
- **Progressive**: Each step builds on the previous

### 4.4 Support Page Design

#### 4.4.1 Help Center Layout
```
┌─────────────────────────────────────────┐
│           [Search Bar]                  │
│                                         │
│  Getting Started  │  Features Guide     │
│  • Installation   │  • Soccer Field     │
│  • First Game     │  • Statistics       │
│  • Basic Setup    │  • Player Management│
│                   │                     │
│  Troubleshooting  │  FAQ                │
│  • Common Issues  │  • General          │
│  • Error Messages │  • Technical        │
│                   │                     │
└─────────────────────────────────────────┘
```

---

## 5. Component Library

### 5.1 Button Components

#### 5.1.1 Primary Button
```css
.button-primary {
  background: linear-gradient(135deg, #4F46E5, #7C3AED);
  color: white;
  padding: 0.75rem 2rem;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: var(--shadow-lg);
}

.button-primary:hover {
  background: linear-gradient(135deg, #4338CA, #6D28D9);
  transform: translateY(-2px);
  box-shadow: var(--shadow-indigo);
}
```

#### 5.1.2 Secondary Button
```css
.button-secondary {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--bg-tertiary);
  padding: 0.75rem 2rem;
  border-radius: 0.5rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.button-secondary:hover {
  background: var(--bg-secondary);
  border-color: var(--primary-indigo);
}
```

#### 5.1.3 CTA Button Variants
```css
/* Large CTA for hero sections */
.button-cta-large {
  padding: 1rem 3rem;
  font-size: 1.125rem;
  font-weight: 700;
  border-radius: 0.75rem;
}

/* Icon button with text */
.button-icon {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
```

### 5.2 Card Components

#### 5.2.1 Feature Card
```css
.feature-card {
  background: var(--bg-secondary);
  border: 1px solid var(--bg-tertiary);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  transition: all 0.3s ease;
}

.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-xl);
  border-color: var(--primary-indigo);
}

.feature-card-icon {
  width: 3rem;
  height: 3rem;
  margin-bottom: var(--space-4);
  color: var(--accent-cyan);
}

.feature-card-title {
  font-size: var(--text-xl);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin-bottom: var(--space-2);
}

.feature-card-description {
  color: var(--text-secondary);
  line-height: 1.6;
}
```

#### 5.2.2 Testimonial Card
```css
.testimonial-card {
  background: var(--bg-secondary);
  border-left: 4px solid var(--accent-lime);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  position: relative;
}

.testimonial-quote {
  font-style: italic;
  font-size: var(--text-lg);
  color: var(--text-primary);
  margin-bottom: var(--space-4);
}

.testimonial-author {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--text-secondary);
}
```

### 5.3 Navigation Components

#### 5.3.1 Header Navigation
```css
.site-header {
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--bg-tertiary);
  position: sticky;
  top: 0;
  z-index: 50;
}

.nav-container {
  max-width: var(--container-xl);
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4) var(--space-6);
}

.nav-logo {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  background: var(--holo-primary);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}

.nav-links {
  display: flex;
  gap: var(--space-8);
  align-items: center;
}

.nav-link {
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: var(--font-medium);
  transition: color 0.3s ease;
}

.nav-link:hover {
  color: var(--text-primary);
}

.nav-link.active {
  color: var(--accent-cyan);
}
```

#### 5.3.2 Mobile Navigation
```css
.mobile-menu {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: 300px;
  background: var(--bg-primary);
  border-left: 1px solid var(--bg-tertiary);
  transform: translateX(100%);
  transition: transform 0.3s ease;
  z-index: 100;
}

.mobile-menu.open {
  transform: translateX(0);
}

.mobile-menu-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s ease;
  z-index: 90;
}

.mobile-menu-overlay.open {
  opacity: 1;
  visibility: visible;
}
```

### 5.4 Form Components

#### 5.4.1 Input Fields
```css
.form-input {
  background: var(--bg-secondary);
  border: 1px solid var(--bg-tertiary);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  color: var(--text-primary);
  font-size: var(--text-base);
  transition: all 0.3s ease;
  width: 100%;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary-indigo);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.form-label {
  display: block;
  font-weight: var(--font-medium);
  color: var(--text-primary);
  margin-bottom: var(--space-2);
}

.form-error {
  color: #EF4444;
  font-size: var(--text-sm);
  margin-top: var(--space-1);
}
```

#### 5.4.2 Search Component
```css
.search-container {
  position: relative;
  max-width: 400px;
  margin: 0 auto;
}

.search-input {
  background: var(--bg-secondary);
  border: 1px solid var(--bg-tertiary);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4) var(--space-3) var(--space-12);
  color: var(--text-primary);
  font-size: var(--text-base);
  width: 100%;
}

.search-icon {
  position: absolute;
  left: var(--space-4);
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  width: 1.25rem;
  height: 1.25rem;
}
```

---

## 6. Responsive Design

### 6.1 Breakpoint Strategy

#### 6.1.1 Breakpoint Definitions
```css
/* Mobile First Approach */
/* Default: Mobile (320px+) */

/* Small screens (phones) */
@media (min-width: 475px) { /* xs */ }

/* Medium screens (large phones, small tablets) */
@media (min-width: 640px) { /* sm */ }

/* Large screens (tablets) */
@media (min-width: 768px) { /* md */ }

/* Extra large screens (laptops) */
@media (min-width: 1024px) { /* lg */ }

/* 2X large screens (desktops) */
@media (min-width: 1280px) { /* xl */ }

/* 3X large screens (large desktops) */
@media (min-width: 1536px) { /* 2xl */ }
```

#### 6.1.2 Common Responsive Patterns
```css
/* Container responsive padding */
.container {
  padding-left: 1rem;
  padding-right: 1rem;
}

@media (min-width: 640px) {
  .container {
    padding-left: 1.5rem;
    padding-right: 1.5rem;
  }
}

@media (min-width: 1024px) {
  .container {
    padding-left: 2rem;
    padding-right: 2rem;
  }
}

/* Typography scaling */
.hero-title {
  font-size: 2.5rem;
  line-height: 1.1;
}

@media (min-width: 640px) {
  .hero-title {
    font-size: 4rem;
  }
}

@media (min-width: 1024px) {
  .hero-title {
    font-size: 6rem;
  }
}
```

### 6.2 Layout Adaptations

#### 6.2.1 Navigation Responsive Behavior
```css
/* Desktop Navigation */
.desktop-nav {
  display: none;
}

@media (min-width: 768px) {
  .desktop-nav {
    display: flex;
  }
  
  .mobile-nav-toggle {
    display: none;
  }
}

/* Mobile Navigation */
.mobile-nav-toggle {
  display: block;
  background: none;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
}
```

#### 6.2.2 Grid Responsive Behavior
```css
/* Feature grid responsive */
.features-grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: 1fr;
}

@media (min-width: 640px) {
  .features-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 2rem;
  }
}

@media (min-width: 1024px) {
  .features-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 2.5rem;
  }
}
```

#### 6.2.3 Content Layout Adaptation
```css
/* Two-column content on desktop */
.content-two-column {
  display: block;
}

@media (min-width: 768px) {
  .content-two-column {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3rem;
    align-items: center;
  }
}

/* Alternate layout direction */
.content-two-column:nth-child(even) {
  direction: rtl;
}

.content-two-column:nth-child(even) > * {
  direction: ltr;
}
```

---

## 7. Accessibility Guidelines

### 7.1 Color and Contrast

#### 7.1.1 Contrast Requirements
All text must meet WCAG 2.1 AA contrast ratios:
- **Normal Text**: 4.5:1 minimum contrast ratio
- **Large Text**: 3:1 minimum contrast ratio
- **Interactive Elements**: 3:1 for focus indicators

```css
/* High contrast text combinations */
.text-primary-on-dark {
  color: #F1F5F9; /* 14.7:1 contrast on #0F172A */
}

.text-secondary-on-dark {
  color: #CBD5E1; /* 9.1:1 contrast on #0F172A */
}

.text-accent-on-dark {
  color: #22D3EE; /* 5.8:1 contrast on #0F172A */
}
```

#### 7.1.2 Color Independence
- Information never relies solely on color
- Interactive states include visual indicators beyond color
- Icons and text labels accompany color-coded information

### 7.2 Keyboard Navigation

#### 7.2.1 Focus Management
```css
/* Custom focus indicator */
.focus-visible:focus-visible {
  outline: 2px solid var(--accent-cyan);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* Skip to content link */
.skip-link {
  position: absolute;
  top: -40px;
  left: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 8px;
  border-radius: 4px;
  text-decoration: none;
  z-index: 1000;
}

.skip-link:focus {
  top: 6px;
}
```

#### 7.2.2 Tab Order
- Logical tab sequence follows visual layout
- All interactive elements are keyboard accessible
- Modal dialogs trap focus appropriately
- Skip links provide navigation shortcuts

### 7.3 Screen Reader Support

#### 7.3.1 Semantic Markup
```html
<!-- Proper heading hierarchy -->
<h1>MatchOps Local</h1>
<h2>Key Features</h2>
<h3>Interactive Soccer Field</h3>

<!-- Landmark regions -->
<main>
  <section aria-labelledby="features-heading">
    <h2 id="features-heading">Key Features</h2>
  </section>
</main>

<!-- Descriptive links -->
<a href="/features" aria-describedby="features-desc">
  Learn More
  <span id="features-desc" class="sr-only">about interactive soccer field features</span>
</a>
```

#### 7.3.2 ARIA Labels and Descriptions
```html
<!-- Button with descriptive label -->
<button 
  aria-label="Install MatchOps Local app"
  aria-describedby="install-desc"
>
  Try Free Now
</button>
<div id="install-desc" class="sr-only">
  Downloads the MatchOps Local progressive web app to your device
</div>

<!-- Status announcements -->
<div 
  role="status" 
  aria-live="polite" 
  aria-label="Form submission status"
  class="sr-only"
>
</div>
```

### 7.4 Media and Content

#### 7.4.1 Alternative Text
- All images include descriptive alt text
- Decorative images use empty alt attributes
- Complex images include long descriptions

```html
<!-- Descriptive alt text -->
<img 
  src="/screenshots/soccer-field.png" 
  alt="MatchOps soccer field interface showing player positions and tactical drawings"
>

<!-- Decorative image -->
<img 
  src="/decorative-pattern.svg" 
  alt=""
  role="presentation"
>
```

#### 7.4.2 Video and Audio
- Video content includes captions and transcripts
- Audio controls are keyboard accessible
- Auto-playing media can be paused/stopped

---

## 8. Animation & Interaction

### 8.1 Animation Principles

#### 8.1.1 Performance-First Animations
All animations use GPU-accelerated properties:
```css
/* Preferred animatable properties */
transform: translateX(), translateY(), scale(), rotate();
opacity: 0-1;
filter: blur(), brightness();

/* Avoid animating */
/* width, height, padding, margin, top, left */
```

#### 8.1.2 Respectful Motion
```css
/* Respect user motion preferences */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 8.2 Micro-Interactions

#### 8.2.1 Button Hover Effects
```css
.button-interactive {
  transform: translateY(0);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.button-interactive:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.button-interactive:active {
  transform: translateY(0);
  transition-duration: 0.1s;
}
```

#### 8.2.2 Card Hover Animations
```css
.card-hover {
  transform: translateY(0) scale(1);
  transition: all 0.3s ease;
}

.card-hover:hover {
  transform: translateY(-8px) scale(1.02);
  box-shadow: var(--shadow-2xl);
}
```

### 8.3 Loading States

#### 8.3.1 Skeleton Loading
```css
.skeleton {
  background: linear-gradient(
    90deg, 
    var(--bg-secondary) 25%, 
    var(--bg-tertiary) 50%, 
    var(--bg-secondary) 75%
  );
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
```

#### 8.3.2 Progressive Loading
```css
.fade-in-up {
  opacity: 0;
  transform: translateY(30px);
  animation: fadeInUp 0.6s ease forwards;
}

@keyframes fadeInUp {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Stagger animation for multiple elements */
.stagger-item:nth-child(1) { animation-delay: 0.1s; }
.stagger-item:nth-child(2) { animation-delay: 0.2s; }
.stagger-item:nth-child(3) { animation-delay: 0.3s; }
```

### 8.4 Page Transitions

#### 8.4.1 Route Transitions
```css
.page-transition {
  animation: pageEnter 0.3s ease;
}

@keyframes pageEnter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

---

## 9. Performance Considerations

### 9.1 CSS Optimization

#### 9.1.1 Critical CSS
```css
/* Inline critical above-the-fold styles */
/* - Typography system */
/* - Layout structure */
/* - Primary colors */
/* - Hero section styles */

/* Non-critical CSS loaded asynchronously */
/* - Animations */
/* - Secondary page styles */
/* - Advanced interactions */
```

#### 9.1.2 CSS Organization
```scss
// Component-based structure
styles/
├── globals.css          // Reset, variables
├── components/
│   ├── Button.module.css
│   ├── Card.module.css
│   └── Navigation.module.css
├── layout/
│   ├── Header.module.css
│   └── Footer.module.css
└── pages/
    ├── Home.module.css
    └── Features.module.css
```

### 9.2 Image Optimization

#### 9.2.1 Responsive Images
```html
<Image
  src="/hero-screenshot.png"
  alt="MatchOps Local interface"
  width={800}
  height={600}
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
  priority
/>
```

#### 9.2.2 Image Format Strategy
- **WebP**: Primary format for modern browsers
- **AVIF**: Next-gen format where supported
- **PNG/JPG**: Fallback for older browsers
- **SVG**: Icons and simple graphics

### 9.3 Font Loading

#### 9.3.1 Font Display Strategy
```css
@font-face {
  font-family: 'Audiowide';
  src: url('/fonts/audiowide.woff2') format('woff2');
  font-display: swap;
  font-weight: 400;
  font-style: normal;
}

/* Fallback font stack */
.font-display {
  font-family: 'Audiowide', 'Impact', 'Arial Black', sans-serif;
}
```

#### 9.3.2 Font Preloading
```html
<link
  rel="preload"
  href="/fonts/audiowide.woff2"
  as="font"
  type="font/woff2"
  crossOrigin="anonymous"
>
```

---

## 10. Implementation Guidelines

### 10.1 Development Workflow

#### 10.1.1 Component Development
1. **Mobile First**: Start with mobile design and scale up
2. **Accessibility First**: Include ARIA labels and keyboard navigation
3. **Performance First**: Consider loading impact of each component
4. **Testing**: Cross-browser and device testing required

#### 10.1.2 Design System Integration
```jsx
// Example component using design system
import styles from './FeatureCard.module.css';

export function FeatureCard({ icon, title, description, href }) {
  return (
    <div className={styles.card}>
      <div className={styles.icon}>{icon}</div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      <a href={href} className={styles.link}>
        Learn More
      </a>
    </div>
  );
}
```

### 10.2 Quality Assurance

#### 10.2.1 Design Review Checklist
- [ ] Visual consistency with design system
- [ ] Responsive behavior across all breakpoints
- [ ] Accessibility compliance (WCAG 2.1 AA)
- [ ] Performance impact within budgets
- [ ] Cross-browser compatibility
- [ ] Touch-friendly interactive elements

#### 10.2.2 Testing Requirements
- **Visual Regression**: Automated screenshot comparison
- **Accessibility**: Screen reader and keyboard testing
- **Performance**: Lighthouse score validation
- **Device Testing**: Physical device verification
- **Browser Testing**: Major browser compatibility

### 10.3 Maintenance Guidelines

#### 10.3.1 Design System Updates
- Version control for design system changes
- Impact assessment for breaking changes
- Documentation updates with design changes
- Component library synchronization

#### 10.3.2 Content Updates
- Image optimization pipeline for new assets
- Typography consistency for new content
- Brand compliance for new sections
- Performance monitoring for content changes

---

## Appendix

### A. Design Tools and Resources

#### A.1 Design Software
- **Figma**: Primary design tool for layouts and prototypes
- **Adobe Creative Suite**: Asset creation and image editing
- **Principle/Framer**: Animation and interaction prototyping

#### A.2 Development Tools
- **VS Code**: Primary development environment
- **Chrome DevTools**: Performance and accessibility testing
- **Figma Dev Mode**: Design-to-code translation

#### A.3 Testing Tools
- **Lighthouse**: Performance and SEO auditing
- **axe DevTools**: Accessibility testing
- **BrowserStack**: Cross-browser testing
- **WebPageTest**: Performance analysis

### B. Browser Support Matrix

| Browser | Minimum Version | Features Supported |
|---------|-----------------|-------------------|
| Chrome | 90+ | Full feature set |
| Firefox | 88+ | Full feature set |
| Safari | 14+ | Full feature set |
| Edge | 90+ | Full feature set |
| iOS Safari | 14+ | Full feature set |
| Android Chrome | 90+ | Full feature set |

### C. Performance Budgets

| Metric | Target | Maximum |
|--------|--------|---------|
| First Contentful Paint | 1.5s | 2.0s |
| Largest Contentful Paint | 2.0s | 2.5s |
| Time to Interactive | 2.5s | 3.0s |
| Total Bundle Size | 150KB | 200KB |
| CSS Bundle Size | 30KB | 50KB |
| Image Size | 500KB | 1MB |

---

**Document Control**
- **Version**: 1.0
- **Created**: 2025-08-31
- **Last Updated**: 2025-08-31
- **Next Review**: 2025-09-15
- **Owner**: Design Team
- **Stakeholders**: Product Manager, Development Team, QA Team