# Communication Infrastructure Plan

**Status**: ✅ **COMPLETE** - All phases done
**Last Updated**: December 17, 2025
**Owner**: Ville Pajala

> **Note**: This can be done NOW while waiting for Toiminimi registration and bank account setup. Email infrastructure is needed before Play Store production release.

This document outlines the complete setup for email, websites, and social media infrastructure for Velomo AI and MatchOps.

---

## Table of Contents

1. [Overview](#overview)
2. [Phase 1: Domain & DNS Setup](#phase-1-domain--dns-setup)
3. [Phase 2: Email Infrastructure](#phase-2-email-infrastructure)
4. [Phase 3: Sentry Notifications](#phase-3-sentry-notifications)
5. [Phase 4: Websites](#phase-4-websites)
6. [Phase 5: Social Media](#phase-5-social-media)
7. [Phase 6: Gmail Organization](#phase-6-gmail-organization)
8. [Maintenance & Operations](#maintenance--operations)
9. [Cost Summary](#cost-summary)
10. [Checklist](#checklist)

---

## Overview

### Entity Structure

```
Velomo AI (Company)
├── matchops.com (Product - Soccer Coaching App)
├── [Future Products]
└── Company infrastructure (alerts, dev accounts, etc.)
```

### Email Architecture

```
velomoai.com (Company Domain) - Cloudflare Email Routing → Gmail
├── alerts@velomoai.com     → Sentry, monitoring, automated systems
├── dev@velomoai.com        → Play Store, Vercel, developer platforms
└── hello@velomoai.com      → Company inquiries

match-ops.com (Product Domain) - Cloudflare Email Routing → Gmail
├── support@match-ops.com   → User support (receive only)
└── hello@match-ops.com     → General product inquiries
```

> **Note**: Email sending (reply as support@match-ops.com) can be added later via Brevo SMTP if needed. Current setup is receive-only, forwarding to personal Gmail.

### Target Setup

| Component | Provider | Cost | Status |
|-----------|----------|------|--------|
| velomoai.com domain | Namecheap | ~$12/year | ✅ Done |
| DNS (both domains) | Cloudflare | Free | ✅ Done |
| Email receiving | Cloudflare Email Routing | Free | ✅ Done |
| Auth email sending | Resend (SMTP) | Free tier (3k/mo) | ✅ Done |
| Business email sending | Brevo (optional, later) | Free tier | ⏸️ Skipped |
| velomoai.com website | Vercel | Free tier | ✅ Done |
| match-ops.com website | Vercel | Free tier | ✅ Done |
| Social media | LinkedIn + personal X | Free | ✅ Done |

**Total Annual Cost:** ~$12/year

---

## Phase 1: Domain & DNS Setup

**Timeline**: Do this first, before Play Store submission

### Step 1.1: Register Velomo AI Domain

1. **Check domain availability**
   - Go to [Namecheap](https://namecheap.com)
   - Search for: `velomoai.com`, `velomo.ai`, `velomoai.io`
   - Recommendation: `velomoai.com` (most professional, typically cheaper)

2. **Register the domain**
   - Add to cart and checkout
   - Enable WhoisGuard (free privacy protection)
   - Do NOT purchase email hosting (we'll use Cloudflare)
   - Cost: ~10-15/year

3. **Save credentials**
   - Store Namecheap login in password manager
   - Note the domain expiration date
   - Enable auto-renewal

### Step 1.2: Create Cloudflare Account

1. **Sign up for Cloudflare**
   - Go to [Cloudflare](https://cloudflare.com)
   - Create free account
   - Use your primary email

2. **Add matchops.com to Cloudflare**
   - Click "Add a Site"
   - Enter `matchops.com`
   - Select Free plan
   - Cloudflare will scan existing DNS records

3. **Update Namecheap nameservers for matchops.com**
   - Cloudflare will show you new nameservers (e.g., `adam.ns.cloudflare.com`)
   - Log into Namecheap → Domain List → matchops.com
   - Go to "Nameservers" section
   - Select "Custom DNS"
   - Enter both Cloudflare nameservers
   - Save changes
   - Wait 24-48 hours for propagation

4. **Verify Vercel still works**
   - After DNS propagates, check matchops.com loads correctly
   - In Cloudflare DNS, ensure the A/CNAME records for Vercel are proxied (orange cloud)

### Step 1.3: Add velomoai.com to Cloudflare

1. **Add site in Cloudflare**
   - Click "Add a Site" → enter `velomoai.com`
   - Select Free plan

2. **Update nameservers at Namecheap**
   - Same process as matchops.com
   - Use the Cloudflare nameservers provided

3. **Add basic DNS records for velomoai.com**
   - For now, just add a placeholder:
   ```
   Type: A
   Name: @
   Content: 76.76.21.21 (Vercel's IP, placeholder)
   Proxy: Yes (orange cloud)
   ```

---

## Phase 2: Email Infrastructure

### Step 2.1: Set Up Cloudflare Email Routing (Receiving)

**For velomoai.com:**

1. **Enable Email Routing**
   - In Cloudflare dashboard, select velomoai.com
   - Go to "Email" → "Email Routing"
   - Click "Get started"

2. **Add destination email**
   - Click "Destination addresses"
   - Add your personal Gmail address
   - Verify by clicking the link sent to Gmail

3. **Create routing rules**

   | Custom address | Action | Destination |
   |----------------|--------|-------------|
   | alerts@velomoai.com | Forward to | your.email@gmail.com |
   | dev@velomoai.com | Forward to | your.email@gmail.com |
   | hello@velomoai.com | Forward to | your.email@gmail.com |

4. **Enable catch-all (optional)**
   - Route all other addresses to your Gmail
   - Helps catch typos and unexpected emails

### Step 2.2: Resend SMTP for Supabase Auth Emails ✅ DONE

**Purpose**: Transactional auth emails (sign-up OTP codes, password reset) sent by Supabase Auth.

**Setup (completed 2026-02-08):**
1. Created Resend account at resend.com
2. Added domain `auth.match-ops.com` (DNS records auto-configured via Cloudflare integration)
3. Created sending-only API key (`supabase-auth`)
4. Configured in Supabase Dashboard → Authentication → SMTP Settings:
   - **Sender email**: `noreply@auth.match-ops.com`
   - **Sender name**: `MatchOps`
   - **Host**: `smtp.resend.com`
   - **Port**: `465`
   - **Username**: `resend`
   - **Password**: Resend API key
5. Increased Supabase email rate limit from 30 → 100 emails/hour

**Applied to**: Production project (`aybjmnxxtgspqesdiqxd` / matchops-cloud)

**Scaling notes**:
- Free tier: 3,000 emails/month (sufficient for early launch)
- Current rate limit: 100/hour = 2,400/day capacity
- If >3k signups/month: upgrade to Resend Pro ($20/month for 50k emails)
- Rate limit can be increased further in Supabase Dashboard → Auth → Rate Limits

**Important**: Staging project (`hwcqpvvqnmetjrwvzlfr`) still uses built-in SMTP (fine for testing with team member emails).

### Step 2.3: Set Up Zoho Mail for matchops.com (Sending)

**Why Zoho:** Free tier allows sending from custom domain, which Cloudflare alone cannot do.

1. **Sign up for Zoho Mail**
   - Go to [Zoho Mail](https://www.zoho.com/mail/)
   - Click "Sign Up" → "Business Email" → "Free Plan"
   - Enter `matchops.com` as your domain

2. **Verify domain ownership**
   - Zoho will provide a TXT record
   - Add it in Cloudflare DNS:
   ```
   Type: TXT
   Name: @
   Content: zoho-verification=xxxxx.zmverify.zoho.eu
   TTL: Auto
   ```
   - Wait a few minutes, then verify in Zoho

3. **Configure MX records**
   - In Cloudflare DNS for matchops.com, add:
   ```
   Type: MX
   Name: @
   Mail server: mx.zoho.eu
   Priority: 10

   Type: MX
   Name: @
   Mail server: mx2.zoho.eu
   Priority: 20

   Type: MX
   Name: @
   Mail server: mx3.zoho.eu
   Priority: 50
   ```

4. **Configure SPF record**
   - Add TXT record in Cloudflare:
   ```
   Type: TXT
   Name: @
   Content: v=spf1 include:zoho.eu ~all
   ```

5. **Configure DKIM**
   - In Zoho: Mail Admin → Domains → matchops.com → Email Configuration → DKIM
   - Generate DKIM key
   - Add the TXT record in Cloudflare as instructed

6. **Create email accounts in Zoho**
   - Create: support@matchops.com
   - Create: hello@matchops.com
   - Set strong passwords, store in password manager

7. **Set up forwarding to Gmail (optional)**
   - In Zoho Mail settings, you can forward copies to Gmail
   - This way you receive in Gmail but can still send from Zoho webmail

### Step 2.4: Alternative - Gmail "Send As" with SMTP Relay

If you prefer managing everything from Gmail:

1. **Set up SMTP relay (Brevo/Mailgun)**
   - Sign up for [Brevo](https://www.brevo.com/) (free: 300 emails/day)
   - Verify your domain
   - Get SMTP credentials

2. **Configure Gmail "Send As"**
   - Gmail → Settings → Accounts → "Add another email address"
   - Enter: support@matchops.com
   - SMTP Server: smtp-relay.brevo.com
   - Port: 587
   - Username: (from Brevo)
   - Password: (from Brevo)

3. **Verify the address**
   - Gmail will send verification email to support@matchops.com
   - Since Cloudflare forwards to Gmail, you'll receive it
   - Click the verification link

---

## Phase 3: Sentry Notifications

**Timeline**: After email is set up

### Step 3.1: Update Sentry Email Settings

1. **Log into Sentry**
   - Go to [sentry.io](https://sentry.io)
   - Navigate to Settings → Account → Notifications

2. **Update notification email**
   - Change email to: `alerts@velomoai.com`
   - Verify the new email address

3. **Configure alert rules**
   - Go to Projects → MatchOps → Alerts
   - Review existing alert rules
   - Ensure critical alerts go to `alerts@velomoai.com`

### Step 3.2: Configure Alert Rules

Recommended alert configuration:

| Alert Type | Condition | Action |
|------------|-----------|--------|
| Error spike | >10 errors in 1 hour | Email immediately |
| New issue | First occurrence | Email digest (daily) |
| Critical error | Specific error types | Email + Slack (if set up) |
| Performance | Page load >3s | Weekly digest |

### Step 3.3: Gmail Filter for Sentry

In Gmail, create filter:

1. **Create filter**
   - Click the search bar dropdown
   - From: `@sentry.io`
   - Create filter

2. **Apply actions**
   - Apply label: "Sentry Alerts" (create it)
   - Star it (for critical alerts)
   - Never send to spam

---

## Phase 4: Websites

### Step 4.1: matchops.com (Existing)

**Current Status:** Live on Vercel

**Already implemented:**
- [x] Privacy policy at `/privacy-policy`
- [x] Terms of service at `/terms`
- [x] Links in Settings modal

**Optional enhancements:**
- [ ] Add support page with contact form
- [ ] Add FAQ section
- [ ] Add marketing landing page (post-launch)

### Step 4.2: velomoai.com (New - Company Website)

**Option A: Simple Landing Page (Recommended to start)**

1. **Create minimal Next.js project**
   ```bash
   npx create-next-app@latest velomoai-website --typescript --tailwind
   ```

2. **Deploy to Vercel**
   - Connect to GitHub
   - Deploy
   - Add custom domain: velomoai.com

3. **Content for landing page**
   - Company name and logo
   - One-liner: "Building tools for coaches and athletes"
   - Products section with link to MatchOps
   - Contact: hello@velomoai.com
   - Links to social media

**Option B: Use Carrd.co (Simpler, faster)**

- Create account at [carrd.co](https://carrd.co)
- Build simple one-page site
- Connect custom domain (Pro plan: $19/year)
- Good for "coming soon" or minimal presence

### Step 4.3: Connect velomoai.com to Vercel

1. **In Vercel dashboard**
   - Go to your project settings
   - Domains → Add `velomoai.com` and `www.velomoai.com`

2. **In Cloudflare**
   - Add/update records:
   ```
   Type: A
   Name: @
   Content: 76.76.21.21
   Proxy: Yes

   Type: CNAME
   Name: www
   Content: cname.vercel-dns.com
   Proxy: Yes
   ```

3. **Verify HTTPS**
   - Vercel will automatically provision SSL
   - Test both http and https redirect properly

---

## Phase 5: Social Media

**Timeline**: Before or alongside Play Store launch

### Step 5.1: Platform Strategy

| Platform | Account | Purpose | Priority |
|----------|---------|---------|----------|
| **X (Twitter)** | @MatchOpsApp | Product updates, user engagement, support | High |
| **LinkedIn** | Velomo AI (Company Page) | Professional presence, B2B | Medium |
| **Instagram** | @matchops.app | Visual content, coaching tips | Low |
| **YouTube** | MatchOps | Tutorial videos, feature demos | Low |

### Step 5.2: Create X/Twitter Account (@MatchOpsApp)

1. **Create account**
   - Go to [twitter.com/signup](https://twitter.com/signup)
   - Use: support@matchops.com or hello@velomoai.com
   - Username: @MatchOpsApp (or @MatchOps if available)

2. **Complete profile**
   - Display name: MatchOps
   - Bio: "Soccer coaching made simple. Local-first app for tracking games, players, and tactics. Privacy-focused."
   - Website: https://matchops.com
   - Location: Finland (optional)
   - Header/Profile images: Use MatchOps branding

3. **Initial content strategy**
   - Announce new features
   - Share coaching tips
   - Respond to user questions
   - Retweet relevant soccer/coaching content

### Step 5.3: Create LinkedIn Company Page (Velomo AI)

1. **Create page**
   - Go to LinkedIn → Work → Create a Company Page
   - Company name: Velomo AI
   - Company URL: linkedin.com/company/velomoai

2. **Complete profile**
   - About: "Velomo AI builds privacy-focused tools for coaches and athletes. Our flagship product, MatchOps, helps soccer coaches track games, manage rosters, and analyze performance - all without sending data to the cloud."
   - Website: https://velomoai.com
   - Industry: Software Development / Sports Technology
   - Company size: 1-10
   - Headquarters: Finland

3. **Add Ville Pajala as admin**
   - Connect personal profile as company admin

### Step 5.4: Reserve Other Handles (Optional)

Even if not active, reserve handles to prevent squatting:

- Instagram: @matchops.app or @matchopsapp
- YouTube: MatchOps
- TikTok: @matchopsapp (if relevant for future)

---

## Phase 6: Gmail Organization

### Step 6.1: Create Labels

In Gmail, create these labels:

| Label | Color | Purpose |
|-------|-------|---------|
| MatchOps/Support | Blue | User support emails |
| MatchOps/General | Light blue | General matchops inquiries |
| Velomo/Alerts | Red | Sentry and monitoring |
| Velomo/Developer | Orange | Play Store, Vercel, GitHub |
| Velomo/Company | Green | Company inquiries |

### Step 6.2: Create Filters

**Filter 1: Sentry Alerts**
```
Matches: from:(@sentry.io)
Do this:
  - Apply label: Velomo/Alerts
  - Star it
  - Never send to spam
```

**Filter 2: MatchOps Support**
```
Matches: to:(support@matchops.com)
Do this:
  - Apply label: MatchOps/Support
  - Mark as important
```

**Filter 3: Developer Platforms**
```
Matches: from:(@google.com OR @vercel.com OR @github.com OR @namecheap.com)
Do this:
  - Apply label: Velomo/Developer
```

**Filter 4: MatchOps General**
```
Matches: to:(hello@matchops.com)
Do this:
  - Apply label: MatchOps/General
```

**Filter 5: Velomo Company**
```
Matches: to:(hello@velomoai.com)
Do this:
  - Apply label: Velomo/Company
```

### Step 6.3: Set Up Priority Inbox (Optional)

1. Go to Gmail Settings → Inbox
2. Inbox type: Priority Inbox
3. Configure sections:
   - Important and unread
   - Starred (Sentry alerts)
   - Everything else

---

## Maintenance & Operations

### Weekly Tasks

- [ ] Review Sentry alerts digest
- [ ] Check support@matchops.com for user inquiries
- [ ] Post 1-2 updates on X/Twitter (optional)

### Monthly Tasks

- [ ] Review email filters - are things landing correctly?
- [ ] Check domain expiration dates
- [ ] Review Cloudflare analytics
- [ ] Update website content if needed

### Annual Tasks

- [ ] Renew domains (or verify auto-renewal)
- [ ] Review and update privacy policy
- [ ] Audit email accounts - remove unused
- [ ] Review social media strategy

### Credentials to Store (Password Manager)

| Service | Username | Notes |
|---------|----------|-------|
| Namecheap | email | Domain registrar |
| Cloudflare | email | DNS, email routing |
| Resend | email | Auth transactional emails (SMTP for Supabase) |
| Zoho Mail | support@matchops.com | Email sending |
| Sentry | email | Error monitoring |
| Vercel | email | Hosting |
| X/Twitter | @MatchOpsApp | Social |
| LinkedIn | Velomo AI page | Social |

---

## Cost Summary

### One-Time Costs

| Item | Cost | Notes |
|------|------|-------|
| velomoai.com domain | ~10-15 | Annual renewal |

### Annual Recurring Costs

| Item | Cost | Notes |
|------|------|-------|
| velomoai.com renewal | ~10/year | Namecheap |
| matchops.com renewal | (existing) | Already owned |
| Cloudflare | Free | Email routing, DNS |
| Zoho Mail | Free | Free tier, 5GB |
| Vercel | Free | Hobby tier |
| **Total** | **~10/year** | |

### Optional Upgrades

| Upgrade | Cost | When to Consider |
|---------|------|------------------|
| Google Workspace | 6/user/month | When you need calendar sharing, team features |
| Zoho Mail paid | 1/user/month | More storage, custom branding |
| Carrd Pro | 19/year | Quick landing page for Velomo AI |
| X Premium | 8/month | Verification, longer posts |

---

## Checklist

### Phase 1: Domains & DNS ✅ COMPLETE
- [x] Register velomoai.com on Namecheap
- [x] Create Cloudflare account
- [x] Move match-ops.com DNS to Cloudflare
- [x] Move velomoai.com DNS to Cloudflare
- [x] Verify match-ops.com still works on Vercel

### Phase 2: Email ✅ COMPLETE
- [x] Set up Cloudflare Email Routing for velomoai.com
- [x] Create alerts@velomoai.com forwarding
- [x] Create dev@velomoai.com forwarding
- [x] Create hello@velomoai.com forwarding
- [x] Set up Cloudflare Email Routing for match-ops.com
- [x] Create support@match-ops.com forwarding
- [x] Create hello@match-ops.com forwarding
- [x] Set up Resend SMTP for Supabase auth emails (noreply@auth.match-ops.com)
- [x] Configure auth.match-ops.com subdomain DNS (DKIM/SPF via Resend auto-setup)
- [x] Increase Supabase email rate limit to 100/hour
- [ ] ~~Set up Zoho Mail for sending~~ (skipped - using receive-only for now)
- [ ] Add Brevo SMTP for business email sending (optional, later if needed)

### Phase 3: Sentry ✅ COMPLETE
- [x] Update Sentry notification email to alerts@velomoai.com
- [x] Configure alert rules
- [x] Create Gmail filter for Sentry

### Phase 4: Websites ✅ COMPLETE
- [x] Create simple Velomo AI landing page → See [velomoai-website-spec.md](./velomoai-website-spec.md)
- [x] Deploy to Vercel
- [x] Connect velomoai.com domain

### Phase 5: Social Media ✅ COMPLETE
- [x] Create Velomo AI LinkedIn page
- [x] X/Twitter: Using personal account to promote MatchOps (no separate account needed)
- [ ] ~~Reserve handles on other platforms~~ (skipped - low priority for niche app)

### Phase 6: Gmail Organization ✅ COMPLETE
- [x] Create labels in Gmail
- [x] Set up filters for automatic labeling
- [ ] Store all credentials in password manager

---

## Quick Reference

### Email Addresses Summary

| Address | Purpose | Setup |
|---------|---------|-------|
| alerts@velomoai.com | Sentry, monitoring | Cloudflare → Gmail ✅ |
| dev@velomoai.com | Developer platforms | Cloudflare → Gmail ✅ |
| hello@velomoai.com | Company inquiries | Cloudflare → Gmail ✅ |
| support@match-ops.com | User support | Cloudflare → Gmail ✅ |
| hello@match-ops.com | Product inquiries | Cloudflare → Gmail ✅ |
| noreply@auth.match-ops.com | Supabase auth emails (OTP, password reset) | Resend SMTP ✅ |

### DNS Records Quick Reference

**velomoai.com (Cloudflare)**
```
MX    @    → (handled by Cloudflare Email Routing)
A     @    → 76.76.21.21 (Vercel)
CNAME www  → cname.vercel-dns.com
```

**match-ops.com (Cloudflare)**
```
MX    @    → route1.mx.cloudflare.net (priority 19)
MX    @    → route2.mx.cloudflare.net (priority 94)
MX    @    → route3.mx.cloudflare.net (priority 33)
TXT   @    → v=spf1 include:_spf.mx.cloudflare.net ~all
A     @    → (Vercel IP)
CNAME www  → cname.vercel-dns.com
```

---

## Related Documents

- [monetization-strategies.md](./monetization-strategies.md) - Monetization approach
- [../03-active-plans/master-execution-guide.md](../03-active-plans/master-execution-guide.md) - Play Store release plan
- [../03-active-plans/UNIFIED-ROADMAP.md](../03-active-plans/UNIFIED-ROADMAP.md) - Project roadmap
