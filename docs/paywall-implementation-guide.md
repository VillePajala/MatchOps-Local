# Paywall Implementation Guide for MatchOps Local

## Overview
This comprehensive guide outlines the implementation of a freemium subscription model for MatchOps Local, leveraging the existing localStorage-based architecture and React Query state management system.

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Subscription Model Design](#subscription-model-design)
3. [Technical Implementation](#technical-implementation)
4. [Feature Gating Strategy](#feature-gating-strategy)
5. [Payment Integration](#payment-integration)
6. [User Experience Design](#user-experience-design)
7. [Testing Strategy](#testing-strategy)
8. [Deployment and Monitoring](#deployment-and-monitoring)

## Architecture Overview

### Current System Integration
The paywall system will integrate seamlessly with existing architecture:
- **localStorage**: Store subscription state and feature permissions
- **React Query**: Manage subscription state with caching and synchronization
- **Hook-based Architecture**: Create `useSubscription` hook for global state access
- **Component Composition**: Wrap premium features with `<PremiumFeature>` components

### Core Components Architecture
```
src/
├── hooks/
│   ├── useSubscription.ts          # Main subscription state hook
│   └── usePaywall.ts               # Paywall UI state management
├── utils/
│   ├── subscriptionManager.ts      # Core subscription logic
│   ├── featureGates.ts            # Feature access control
│   └── paymentProvider.ts         # Payment integration wrapper
├── components/
│   ├── paywall/
│   │   ├── PaywallModal.tsx       # Main upgrade modal
│   │   ├── PricingCard.tsx        # Subscription tier display
│   │   ├── PaymentForm.tsx        # Payment processing form
│   │   └── SubscriptionStatus.tsx  # Current plan display
│   └── premium/
│       ├── PremiumFeature.tsx     # Feature gate wrapper
│       ├── PremiumBadge.tsx       # Premium feature indicators
│       └── UpgradePrompt.tsx      # Contextual upgrade prompts
└── types/
    └── subscription.ts            # TypeScript interfaces
```

## Subscription Model Design

### Subscription Tiers

#### **Free Tier**
**Features Included:**
- Basic timer functionality (single game)
- Simple player roster (up to 15 players)
- Basic field positioning
- Local data storage
- Single team management

**Limitations:**
- No game statistics
- No tournament management
- No data export
- No cloud backup
- Basic field layouts only

#### **Premium Tier** ($4.99/month or $49.99/year)
**Additional Features:**
- **Advanced Statistics**: Detailed player performance metrics, game analytics, season summaries
- **Tournament Management**: Bracket creation, multi-tournament tracking, playoff systems
- **Data Export**: PDF reports, CSV exports, game summaries
- **Cloud Backup**: Cross-device synchronization, automatic backups
- **Advanced Field Tools**: Custom field layouts, formation templates, tactical drawings
- **Multi-Team Management**: Manage multiple teams and rosters
- **Season Planning**: Training schedules, game calendars, player development tracking
- **Premium Support**: Priority customer support, feature requests

#### **Coach Pro Tier** ($9.99/month or $99.99/year) - Future Extension
**Additional Features:**
- **Team Collaboration**: Share tactics with assistant coaches
- **Video Integration**: Link game recordings to timeline events
- **Advanced Analytics**: Heat maps, player movement analysis
- **League Management**: Full league administration tools
- **Custom Branding**: Team logos, custom app themes

### Feature Matrix
| Feature | Free | Premium | Coach Pro |
|---------|------|---------|-----------|
| Basic Timer | ✅ | ✅ | ✅ |
| Player Roster (15 max) | ✅ | ✅ | ✅ |
| Player Roster (Unlimited) | ❌ | ✅ | ✅ |
| Game Statistics | ❌ | ✅ | ✅ |
| Tournament Management | ❌ | ✅ | ✅ |
| Data Export (PDF/CSV) | ❌ | ✅ | ✅ |
| Cloud Backup | ❌ | ✅ | ✅ |
| Advanced Field Tools | ❌ | ✅ | ✅ |
| Multi-Team Management | ❌ | ✅ | ✅ |
| Season Planning | ❌ | ✅ | ✅ |
| Team Collaboration | ❌ | ❌ | ✅ |
| Video Integration | ❌ | ❌ | ✅ |
| Advanced Analytics | ❌ | ❌ | ✅ |
| League Management | ❌ | ❌ | ✅ |

## Technical Implementation

### 1. Subscription State Management

#### Types Definition
```typescript
// src/types/subscription.ts
export interface SubscriptionState {
  tier: 'free' | 'premium' | 'coach-pro';
  status: 'active' | 'canceled' | 'expired' | 'trial';
  expiresAt: string | null;
  startedAt: string;
  trialEndsAt: string | null;
  features: string[];
  paymentProvider: 'stripe' | 'play-billing' | null;
  customerId: string | null;
  subscriptionId: string | null;
}

export interface PaymentProvider {
  initialize(): Promise<void>;
  createSubscription(priceId: string): Promise<SubscriptionResult>;
  cancelSubscription(subscriptionId: string): Promise<boolean>;
  updatePaymentMethod(subscriptionId: string): Promise<boolean>;
  getSubscriptionStatus(subscriptionId: string): Promise<SubscriptionState>;
}

export interface FeatureConfig {
  id: string;
  name: string;
  tier: 'premium' | 'coach-pro';
  description: string;
  enabled: boolean;
}
```

#### Subscription Manager
```typescript
// src/utils/subscriptionManager.ts
import { SubscriptionState, FeatureConfig } from '@/types/subscription';
import { getStoredValue, setStoredValue } from './localStorage';

const SUBSCRIPTION_KEY = 'subscription-state';
const FEATURES_KEY = 'feature-config';

export class SubscriptionManager {
  private static instance: SubscriptionManager;
  private subscriptionState: SubscriptionState | null = null;
  private features: FeatureConfig[] = [];

  static getInstance(): SubscriptionManager {
    if (!SubscriptionManager.instance) {
      SubscriptionManager.instance = new SubscriptionManager();
    }
    return SubscriptionManager.instance;
  }

  async initialize(): Promise<void> {
    this.subscriptionState = await this.loadSubscriptionState();
    this.features = await this.loadFeatures();
    await this.validateSubscription();
  }

  async getSubscriptionState(): Promise<SubscriptionState> {
    if (!this.subscriptionState) {
      await this.initialize();
    }
    return this.subscriptionState || this.getDefaultSubscription();
  }

  async updateSubscription(newState: Partial<SubscriptionState>): Promise<void> {
    this.subscriptionState = {
      ...this.subscriptionState,
      ...newState
    } as SubscriptionState;
    
    await setStoredValue(SUBSCRIPTION_KEY, this.subscriptionState);
    this.updateFeatureAccess();
  }

  hasFeature(featureId: string): boolean {
    const subscription = this.subscriptionState;
    if (!subscription) return false;
    
    return subscription.features.includes(featureId) && 
           subscription.status === 'active' &&
           (!subscription.expiresAt || new Date(subscription.expiresAt) > new Date());
  }

  async startTrial(): Promise<boolean> {
    const trialDuration = 7 * 24 * 60 * 60 * 1000; // 7 days
    const trialEndsAt = new Date(Date.now() + trialDuration).toISOString();
    
    await this.updateSubscription({
      tier: 'premium',
      status: 'trial',
      trialEndsAt,
      features: this.getPremiumFeatures()
    });
    
    return true;
  }

  private async validateSubscription(): Promise<void> {
    if (!this.subscriptionState) return;
    
    const now = new Date();
    const expiresAt = this.subscriptionState.expiresAt ? new Date(this.subscriptionState.expiresAt) : null;
    const trialEndsAt = this.subscriptionState.trialEndsAt ? new Date(this.subscriptionState.trialEndsAt) : null;
    
    // Check if trial expired
    if (this.subscriptionState.status === 'trial' && trialEndsAt && now > trialEndsAt) {
      await this.updateSubscription({
        tier: 'free',
        status: 'expired',
        features: this.getFreeFeatures()
      });
    }
    
    // Check if subscription expired
    if (expiresAt && now > expiresAt && this.subscriptionState.status === 'active') {
      await this.updateSubscription({
        status: 'expired',
        tier: 'free',
        features: this.getFreeFeatures()
      });
    }
  }

  private getFreeFeatures(): string[] {
    return [
      'basic-timer',
      'player-roster-15',
      'basic-field',
      'local-storage',
      'single-team'
    ];
  }

  private getPremiumFeatures(): string[] {
    return [
      ...this.getFreeFeatures(),
      'advanced-statistics',
      'tournament-management',
      'data-export',
      'cloud-backup',
      'advanced-field-tools',
      'multi-team-management',
      'season-planning',
      'unlimited-roster'
    ];
  }

  private getDefaultSubscription(): SubscriptionState {
    return {
      tier: 'free',
      status: 'active',
      expiresAt: null,
      startedAt: new Date().toISOString(),
      trialEndsAt: null,
      features: this.getFreeFeatures(),
      paymentProvider: null,
      customerId: null,
      subscriptionId: null
    };
  }
}
```

#### React Hook Integration
```typescript
// src/hooks/useSubscription.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SubscriptionManager } from '@/utils/subscriptionManager';
import { SubscriptionState } from '@/types/subscription';

const subscriptionManager = SubscriptionManager.getInstance();

export function useSubscription() {
  const queryClient = useQueryClient();

  const { data: subscription, isLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => subscriptionManager.getSubscriptionState(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // 10 minutes
  });

  const updateSubscriptionMutation = useMutation({
    mutationFn: (newState: Partial<SubscriptionState>) =>
      subscriptionManager.updateSubscription(newState),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
    },
  });

  const startTrialMutation = useMutation({
    mutationFn: () => subscriptionManager.startTrial(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
    },
  });

  return {
    subscription,
    isLoading,
    updateSubscription: updateSubscriptionMutation.mutate,
    startTrial: startTrialMutation.mutate,
    hasFeature: (featureId: string) => 
      subscriptionManager.hasFeature(featureId),
    isPremium: subscription?.tier !== 'free',
    isTrialActive: subscription?.status === 'trial',
    trialDaysLeft: subscription?.trialEndsAt 
      ? Math.max(0, Math.ceil((new Date(subscription.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 0,
  };
}
```

### 2. Feature Gating System

#### Premium Feature Wrapper Component
```typescript
// src/components/premium/PremiumFeature.tsx
import React from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { UpgradePrompt } from './UpgradePrompt';

interface PremiumFeatureProps {
  featureId: string;
  fallback?: React.ReactNode;
  showUpgradePrompt?: boolean;
  children: React.ReactNode;
}

export function PremiumFeature({ 
  featureId, 
  fallback, 
  showUpgradePrompt = true,
  children 
}: PremiumFeatureProps) {
  const { hasFeature, subscription } = useSubscription();

  if (hasFeature(featureId)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (showUpgradePrompt) {
    return (
      <UpgradePrompt 
        featureId={featureId}
        currentTier={subscription?.tier}
      />
    );
  }

  return null;
}
```

#### Feature Gates Utility
```typescript
// src/utils/featureGates.ts
import { SubscriptionManager } from './subscriptionManager';

export class FeatureGates {
  private static subscriptionManager = SubscriptionManager.getInstance();

  static async canAccessAdvancedStats(): Promise<boolean> {
    return this.subscriptionManager.hasFeature('advanced-statistics');
  }

  static async canManageTournaments(): Promise<boolean> {
    return this.subscriptionManager.hasFeature('tournament-management');
  }

  static async canExportData(): Promise<boolean> {
    return this.subscriptionManager.hasFeature('data-export');
  }

  static async canUseCloudBackup(): Promise<boolean> {
    return this.subscriptionManager.hasFeature('cloud-backup');
  }

  static async getMaxPlayersAllowed(): Promise<number> {
    const hasUnlimited = this.subscriptionManager.hasFeature('unlimited-roster');
    return hasUnlimited ? Infinity : 15;
  }

  static async canManageMultipleTeams(): Promise<boolean> {
    return this.subscriptionManager.hasFeature('multi-team-management');
  }

  static async canAccessAdvancedFieldTools(): Promise<boolean> {
    return this.subscriptionManager.hasFeature('advanced-field-tools');
  }
}
```

### 3. Paywall UI Components

#### Main Paywall Modal
```typescript
// src/components/paywall/PaywallModal.tsx
import React from 'react';
import { Dialog } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useSubscription } from '@/hooks/useSubscription';
import { PricingCard } from './PricingCard';
import { PaymentForm } from './PaymentForm';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggeredFeature?: string;
}

export function PaywallModal({ isOpen, onClose, triggeredFeature }: PaywallModalProps) {
  const { subscription, startTrial } = useSubscription();
  const [selectedPlan, setSelectedPlan] = React.useState<'premium' | 'coach-pro'>('premium');
  const [showPayment, setShowPayment] = React.useState(false);

  const handleStartTrial = () => {
    startTrial();
    onClose();
  };

  const handleSelectPlan = (plan: 'premium' | 'coach-pro') => {
    setSelectedPlan(plan);
    setShowPayment(true);
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-4xl rounded-lg bg-white p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-2xl font-bold text-gray-900">
              Upgrade to Premium
            </Dialog.Title>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {triggeredFeature && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-blue-800">
                This feature requires a Premium subscription to unlock advanced functionality.
              </p>
            </div>
          )}

          {!showPayment ? (
            <div className="space-y-6">
              {subscription?.status !== 'trial' && (
                <div className="text-center">
                  <button
                    onClick={handleStartTrial}
                    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
                  >
                    Start 7-Day Free Trial
                  </button>
                  <p className="text-sm text-gray-500 mt-2">
                    No payment required • Cancel anytime
                  </p>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-6">
                <PricingCard
                  plan="premium"
                  selected={selectedPlan === 'premium'}
                  onSelect={() => handleSelectPlan('premium')}
                />
                <PricingCard
                  plan="coach-pro"
                  selected={selectedPlan === 'coach-pro'}
                  onSelect={() => handleSelectPlan('coach-pro')}
                />
              </div>
            </div>
          ) : (
            <PaymentForm
              selectedPlan={selectedPlan}
              onSuccess={onClose}
              onBack={() => setShowPayment(false)}
            />
          )}
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
```

## Feature Gating Strategy

### Implementation Points

#### 1. Core App Features (`src/app/page.tsx`)
```typescript
// Wrap tournament management
<PremiumFeature featureId="tournament-management">
  <TournamentManager />
</PremiumFeature>

// Wrap advanced statistics
<PremiumFeature featureId="advanced-statistics">
  <AdvancedStats />
</PremiumFeature>
```

#### 2. Player Roster Limits (`src/components/PlayerBar.tsx`)
```typescript
const { hasFeature } = useSubscription();
const maxPlayers = hasFeature('unlimited-roster') ? Infinity : 15;

const canAddPlayer = players.length < maxPlayers;
```

#### 3. Export Functionality
```typescript
// src/utils/dataExport.ts
import { FeatureGates } from '@/utils/featureGates';

export async function exportGameData(gameId: string, format: 'pdf' | 'csv') {
  const canExport = await FeatureGates.canExportData();
  
  if (!canExport) {
    throw new Error('Data export requires Premium subscription');
  }
  
  // Proceed with export logic
}
```

#### 4. Statistics Page Gating
```typescript
// src/components/StatsPage.tsx
function StatsPage() {
  return (
    <div>
      {/* Basic stats - always available */}
      <BasicStatsCard />
      
      {/* Advanced stats - premium only */}
      <PremiumFeature 
        featureId="advanced-statistics"
        fallback={<UpgradePromptCard feature="Advanced Statistics" />}
      >
        <AdvancedStatsCard />
        <PlayerPerformanceChart />
        <GameAnalytics />
      </PremiumFeature>
    </div>
  );
}
```

## Payment Integration

### Multi-Platform Strategy

#### Web Platform - Stripe Integration
```typescript
// src/utils/payments/stripeProvider.ts
import { loadStripe } from '@stripe/stripe-js';
import { PaymentProvider, SubscriptionResult } from '@/types/subscription';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export class StripeProvider implements PaymentProvider {
  async initialize(): Promise<void> {
    await stripePromise;
  }

  async createSubscription(priceId: string): Promise<SubscriptionResult> {
    const response = await fetch('/api/stripe/create-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId }),
    });

    const { clientSecret, subscriptionId } = await response.json();
    
    const stripe = await stripePromise;
    const { error } = await stripe!.confirmPayment({
      clientSecret,
      confirmParams: {
        return_url: `${window.location.origin}/subscription/success`,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    return { subscriptionId, success: true };
  }

  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    const response = await fetch('/api/stripe/cancel-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId }),
    });

    return response.ok;
  }
}
```

#### Android Platform - Google Play Billing
```typescript
// src/utils/payments/playBillingProvider.ts
import { PaymentProvider } from '@/types/subscription';

export class PlayBillingProvider implements PaymentProvider {
  private billingClient: any;

  async initialize(): Promise<void> {
    // Initialize Google Play Billing client
    // This would be implemented in the Android TWA layer
    if (typeof window !== 'undefined' && (window as any).AndroidBilling) {
      this.billingClient = (window as any).AndroidBilling;
    }
  }

  async createSubscription(skuId: string): Promise<SubscriptionResult> {
    if (!this.billingClient) {
      throw new Error('Play Billing not available');
    }

    return this.billingClient.purchaseSubscription(skuId);
  }

  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    // Handle cancellation through Play Store
    return this.billingClient.cancelSubscription(subscriptionId);
  }
}
```

### API Routes Implementation

#### Stripe Webhook Handler
```typescript
// src/app/api/stripe/webhook/route.ts
import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { SubscriptionManager } from '@/utils/subscriptionManager';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const subscriptionManager = SubscriptionManager.getInstance();

  switch (event.type) {
    case 'invoice.payment_succeeded':
      const invoice = event.data.object as Stripe.Invoice;
      await handlePaymentSucceeded(invoice, subscriptionManager);
      break;
      
    case 'customer.subscription.deleted':
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionCanceled(subscription, subscriptionManager);
      break;
      
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return Response.json({ received: true });
}

async function handlePaymentSucceeded(
  invoice: Stripe.Invoice,
  subscriptionManager: SubscriptionManager
) {
  // Update subscription status in localStorage
  await subscriptionManager.updateSubscription({
    status: 'active',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
  });
}
```

### Pricing Configuration

#### Stripe Price IDs
```typescript
// src/config/pricing.ts
export const PRICING_CONFIG = {
  premium: {
    monthly: {
      stripe: 'price_premium_monthly',
      playStore: 'premium_monthly',
      amount: 4.99,
      currency: 'USD',
    },
    yearly: {
      stripe: 'price_premium_yearly',
      playStore: 'premium_yearly',
      amount: 49.99,
      currency: 'USD',
      savings: '17%',
    },
  },
  coachPro: {
    monthly: {
      stripe: 'price_coach_pro_monthly',
      playStore: 'coach_pro_monthly',
      amount: 9.99,
      currency: 'USD',
    },
    yearly: {
      stripe: 'price_coach_pro_yearly',
      playStore: 'coach_pro_yearly',
      amount: 99.99,
      currency: 'USD',
      savings: '17%',
    },
  },
};
```

## User Experience Design

### Paywall Trigger Points

#### Strategic Placement
1. **Soft Gates** - Show preview with upgrade prompt
2. **Hard Gates** - Block access completely
3. **Usage Limits** - Allow limited use then prompt upgrade
4. **Time-based** - Trigger after successful usage

#### Implementation Examples

```typescript
// Soft gate for statistics
function StatsPreview() {
  const { hasFeature } = useSubscription();
  
  if (hasFeature('advanced-statistics')) {
    return <FullStatistics />;
  }
  
  return (
    <div className="relative">
      <div className="blur-sm pointer-events-none">
        <FullStatistics />
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/90">
        <UpgradePrompt featureId="advanced-statistics" />
      </div>
    </div>
  );
}

// Usage limit for roster
function PlayerRoster() {
  const { hasFeature } = useSubscription();
  const maxPlayers = hasFeature('unlimited-roster') ? Infinity : 15;
  
  return (
    <div>
      <PlayerList players={players.slice(0, maxPlayers)} />
      {players.length > maxPlayers && (
        <div className="p-4 border-t bg-gray-50">
          <p className="text-sm text-gray-600 mb-2">
            {players.length - maxPlayers} more players available with Premium
          </p>
          <UpgradeButton size="sm" />
        </div>
      )}
    </div>
  );
}
```

### Onboarding Flow

#### Trial Activation
1. **Immediate Value**: Show premium features first
2. **Easy Activation**: One-click trial start
3. **No Payment**: No credit card required for trial
4. **Gentle Reminders**: Trial countdown in UI

#### Conversion Strategy
1. **Feature Discovery**: Guide users to premium features
2. **Usage Analytics**: Track which features drive conversion
3. **Personalized Prompts**: Contextual upgrade suggestions
4. **Social Proof**: Success stories from coaches

### UI/UX Components

#### Premium Badge System
```typescript
// src/components/premium/PremiumBadge.tsx
export function PremiumBadge({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`
      inline-flex items-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 
      text-white font-medium
      ${size === 'sm' ? 'px-2 py-1 text-xs' : ''}
      ${size === 'md' ? 'px-3 py-1 text-sm' : ''}
      ${size === 'lg' ? 'px-4 py-2 text-base' : ''}
    `}>
      ⭐ Premium
    </span>
  );
}
```

#### Upgrade Prompts
```typescript
// src/components/premium/UpgradePrompt.tsx
interface UpgradePromptProps {
  featureId: string;
  title?: string;
  description?: string;
  size?: 'compact' | 'full';
}

export function UpgradePrompt({ featureId, title, description, size = 'full' }: UpgradePromptProps) {
  const [showPaywall, setShowPaywall] = React.useState(false);
  
  return (
    <div className={`
      text-center p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border
      ${size === 'compact' ? 'p-4' : 'p-6'}
    `}>
      <div className="mb-4">
        <PremiumBadge size="md" />
      </div>
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {title || 'Unlock Premium Features'}
      </h3>
      
      <p className="text-gray-600 mb-4">
        {description || 'Get access to advanced coaching tools and analytics.'}
      </p>
      
      <button
        onClick={() => setShowPaywall(true)}
        className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
      >
        Upgrade Now
      </button>
      
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        triggeredFeature={featureId}
      />
    </div>
  );
}
```

## Testing Strategy

### Unit Testing

#### Subscription Logic Tests
```typescript
// src/utils/__tests__/subscriptionManager.test.ts
import { SubscriptionManager } from '../subscriptionManager';

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager;

  beforeEach(() => {
    manager = SubscriptionManager.getInstance();
    localStorage.clear();
  });

  test('should return free subscription by default', async () => {
    const subscription = await manager.getSubscriptionState();
    expect(subscription.tier).toBe('free');
    expect(subscription.features).toContain('basic-timer');
  });

  test('should validate trial expiration', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    await manager.updateSubscription({
      status: 'trial',
      tier: 'premium',
      trialEndsAt: pastDate,
    });

    const subscription = await manager.getSubscriptionState();
    expect(subscription.status).toBe('expired');
    expect(subscription.tier).toBe('free');
  });

  test('should correctly identify feature access', () => {
    manager.updateSubscription({
      tier: 'premium',
      status: 'active',
      features: ['advanced-statistics'],
    });

    expect(manager.hasFeature('advanced-statistics')).toBe(true);
    expect(manager.hasFeature('league-management')).toBe(false);
  });
});
```

#### Feature Gate Tests
```typescript
// src/components/premium/__tests__/PremiumFeature.test.tsx
import { render, screen } from '@testing-library/react';
import { PremiumFeature } from '../PremiumFeature';
import { useSubscription } from '@/hooks/useSubscription';

jest.mock('@/hooks/useSubscription');

describe('PremiumFeature', () => {
  const mockUseSubscription = useSubscription as jest.MockedFunction<typeof useSubscription>;

  test('should render children when feature is available', () => {
    mockUseSubscription.mockReturnValue({
      hasFeature: () => true,
      subscription: { tier: 'premium' },
    } as any);

    render(
      <PremiumFeature featureId="advanced-statistics">
        <div>Premium Content</div>
      </PremiumFeature>
    );

    expect(screen.getByText('Premium Content')).toBeInTheDocument();
  });

  test('should show upgrade prompt when feature is not available', () => {
    mockUseSubscription.mockReturnValue({
      hasFeature: () => false,
      subscription: { tier: 'free' },
    } as any);

    render(
      <PremiumFeature featureId="advanced-statistics">
        <div>Premium Content</div>
      </PremiumFeature>
    );

    expect(screen.queryByText('Premium Content')).not.toBeInTheDocument();
    expect(screen.getByText(/upgrade/i)).toBeInTheDocument();
  });
});
```

### Integration Testing

#### Payment Flow Tests
```typescript
// tests/integration/payment-flow.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PaywallModal } from '@/components/paywall/PaywallModal';

describe('Payment Flow Integration', () => {
  test('should complete trial signup flow', async () => {
    render(<PaywallModal isOpen={true} onClose={jest.fn()} />);

    // Click start trial button
    fireEvent.click(screen.getByText('Start 7-Day Free Trial'));

    // Verify trial activation
    await waitFor(() => {
      expect(localStorage.getItem('subscription-state')).toContain('trial');
    });
  });

  test('should handle subscription selection', async () => {
    render(<PaywallModal isOpen={true} onClose={jest.fn()} />);

    // Select premium plan
    fireEvent.click(screen.getByText('Choose Premium'));

    // Verify payment form appears
    expect(screen.getByText('Payment Details')).toBeInTheDocument();
  });
});
```

### E2E Testing

#### User Journey Tests
```typescript
// tests/e2e/paywall.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Paywall Integration', () => {
  test('should show upgrade prompt for premium features', async ({ page }) => {
    await page.goto('/');
    
    // Try to access premium feature
    await page.click('[data-testid="advanced-stats-tab"]');
    
    // Should see upgrade prompt
    await expect(page.locator('[data-testid="upgrade-prompt"]')).toBeVisible();
    
    // Click upgrade
    await page.click('[data-testid="upgrade-button"]');
    
    // Should open paywall modal
    await expect(page.locator('[data-testid="paywall-modal"]')).toBeVisible();
  });

  test('should allow trial activation', async ({ page }) => {
    await page.goto('/');
    
    // Open paywall
    await page.click('[data-testid="upgrade-button"]');
    
    // Start trial
    await page.click('text=Start 7-Day Free Trial');
    
    // Should close modal and enable premium features
    await expect(page.locator('[data-testid="paywall-modal"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="premium-badge"]')).toBeVisible();
  });
});
```

## Deployment and Monitoring

### Environment Configuration

#### Development Environment
```typescript
// .env.local
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_ENV=development
```

#### Production Environment
```typescript
// .env.production
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_ENV=production
```

### Analytics and Monitoring

#### Subscription Analytics
```typescript
// src/utils/analytics/subscriptionAnalytics.ts
export interface SubscriptionEvent {
  type: 'trial_started' | 'subscription_created' | 'subscription_canceled' | 'payment_failed';
  userId?: string;
  plan: string;
  amount?: number;
  timestamp: string;
}

export class SubscriptionAnalytics {
  static track(event: SubscriptionEvent) {
    // Send to analytics service
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', event.type, {
        plan: event.plan,
        value: event.amount,
        currency: 'USD',
      });
    }
    
    // Store for local analysis
    const events = JSON.parse(localStorage.getItem('subscription_events') || '[]');
    events.push(event);
    localStorage.setItem('subscription_events', JSON.stringify(events.slice(-100))); // Keep last 100 events
  }

  static async getConversionMetrics() {
    const events = JSON.parse(localStorage.getItem('subscription_events') || '[]');
    
    const trials = events.filter(e => e.type === 'trial_started').length;
    const conversions = events.filter(e => e.type === 'subscription_created').length;
    
    return {
      trialToSubscriptionRate: trials > 0 ? (conversions / trials) * 100 : 0,
      totalTrials: trials,
      totalSubscriptions: conversions,
    };
  }
}
```

#### Performance Monitoring
```typescript
// src/utils/monitoring/subscriptionMonitoring.ts
export class SubscriptionMonitoring {
  static trackPaywallPerformance(featureId: string, shown: boolean, converted: boolean) {
    const event = {
      feature: featureId,
      shown,
      converted,
      timestamp: Date.now(),
    };
    
    // Track paywall effectiveness
    const paywallMetrics = JSON.parse(localStorage.getItem('paywall_metrics') || '{}');
    if (!paywallMetrics[featureId]) {
      paywallMetrics[featureId] = { shown: 0, converted: 0 };
    }
    
    if (shown) paywallMetrics[featureId].shown++;
    if (converted) paywallMetrics[featureId].converted++;
    
    localStorage.setItem('paywall_metrics', JSON.stringify(paywallMetrics));
  }

  static getPaywallMetrics() {
    const metrics = JSON.parse(localStorage.getItem('paywall_metrics') || '{}');
    
    return Object.entries(metrics).map(([feature, data]: [string, any]) => ({
      feature,
      conversionRate: data.shown > 0 ? (data.converted / data.shown) * 100 : 0,
      impressions: data.shown,
      conversions: data.converted,
    }));
  }
}
```

### Rollout Strategy

#### Phase 1: Internal Testing (1 week)
- Deploy to staging environment
- Test all payment flows
- Verify feature gating works correctly
- Test subscription state persistence

#### Phase 2: Beta Release (2 weeks)
- Release to 10% of users
- Monitor conversion rates
- Collect user feedback
- Fix any critical issues

#### Phase 3: Full Rollout (Gradual over 2 weeks)
- 25% → 50% → 75% → 100% user rollout
- Monitor key metrics at each stage
- Be prepared to rollback if issues arise

### Success Metrics

#### Technical KPIs
- **Paywall Load Time**: < 500ms
- **Payment Success Rate**: > 95%
- **Trial Conversion Rate**: > 10% (industry benchmark: 5-15%)
- **Subscription Retention**: > 80% at 30 days

#### Business KPIs
- **Monthly Recurring Revenue (MRR)**: Target growth
- **Customer Acquisition Cost (CAC)**: Cost to acquire paying customer
- **Customer Lifetime Value (CLV)**: Average revenue per customer
- **Churn Rate**: Monthly subscription cancellation rate

## Implementation Timeline

### Week 1-2: Foundation
- [ ] Implement subscription state management
- [ ] Create feature gating system
- [ ] Build core paywall UI components
- [ ] Set up local testing environment

### Week 3-4: Payment Integration
- [ ] Integrate Stripe for web payments
- [ ] Implement webhook handling
- [ ] Create subscription management APIs
- [ ] Build payment forms and flows

### Week 5-6: Feature Integration
- [ ] Gate premium features throughout app
- [ ] Implement upgrade prompts
- [ ] Create trial activation flow
- [ ] Add subscription status UI

### Week 7-8: Testing and Polish
- [ ] Write comprehensive test suite
- [ ] User acceptance testing
- [ ] Performance optimization
- [ ] UI/UX polish and refinements

### Week 9-10: Deployment
- [ ] Deploy to staging environment
- [ ] Beta user testing
- [ ] Production deployment
- [ ] Monitor and iterate

## Conclusion

This paywall implementation leverages MatchOps Local's existing localStorage-based architecture and React Query state management to create a seamless subscription experience. The system is designed to:

1. **Minimize Friction**: Easy trial activation and contextual upgrade prompts
2. **Maximize Conversion**: Strategic feature gating and compelling upgrade flows
3. **Ensure Reliability**: Robust state management and error handling
4. **Scale Gracefully**: Clean architecture that supports future enhancements

The freemium model provides clear value differentiation while maintaining the core coaching functionality in the free tier. Premium features focus on advanced analytics, data management, and professional tools that serious coaches will find essential.

**Key Success Factors:**
- Strategic feature selection for premium tiers
- Seamless integration with existing architecture  
- User-friendly payment and trial flows
- Comprehensive testing and monitoring
- Gradual rollout with performance tracking

The implementation timeline of 10 weeks allows for thorough development, testing, and gradual deployment to ensure a successful premium feature launch.