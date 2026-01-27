# Marketing Site Update Plan

**Purpose**: Update the marketing site to reflect the new dual-mode architecture (local + cloud) being introduced in the `feature/supabase-cloud-backend` branch.

**Current State**: The site heavily promotes local-only benefits ("data stays on your device", "no signup required", "no automatic sync").

**Target State**: Communicate both options clearly - free local mode AND premium cloud sync - while preserving the local-first philosophy as the default.

---

## Executive Summary

| Category | Files Affected | Effort |
|----------|----------------|--------|
| Translation files (EN/FI) | 2 files | High |
| Page components | 3-4 files | Medium |
| New screenshots | 4-6 new images | Medium |
| New page (Pricing) | 1 new file | Low |

---

## 1. Translation File Updates

### 1.1 English (`site/public/locales/en/common.json`)

#### SEO Section
```json
// BEFORE
"seo.home.description": "Mobile coaching app... No signup required. Your data stays private on your device."

// AFTER
"seo.home.description": "Mobile coaching app for soccer and futsal. Free local mode with full privacy, or premium cloud sync for multi-device access. No signup required for local mode."
```

#### Footer Section
```json
// BEFORE
"footer.dataStays": "Your data stays on your device. Always."

// AFTER
"footer.dataStays": "Your data, your choice. Local or cloud."
```

#### Info/FAQ Section - CRITICAL UPDATES

| Question | Current Answer | New Answer |
|----------|---------------|------------|
| `info.faq.q2` (Where is data stored?) | "All data is stored locally... Nothing is sent to external servers." | "In **local mode** (free), all data stays on your device. In **cloud mode** (premium), data syncs securely to EU servers via Supabase." |
| `info.faq.q3` (Multiple devices?) | "Yes, but you'll need to export... no automatic syncing" | "**Local mode**: Export/import manually. **Cloud mode**: Automatic sync across all your devices." |
| `info.faq.a1` (How to install?) | Only mentions beta testing | Add: "Local mode is free. Cloud sync is available as a premium subscription (€4.99/month)." |

#### New FAQ Questions to Add
```json
"info.faq.q11": "What's the difference between local and cloud mode?",
"info.faq.a11": "Local mode is free—your data never leaves your device. Cloud mode (€4.99/month) adds cross-device sync with secure EU-based servers. You can switch between modes anytime.",

"info.faq.q12": "Do I need an account?",
"info.faq.a12": "No account needed for local mode. Cloud mode requires email/password registration for secure sync.",

"info.faq.q13": "Can I migrate my data from local to cloud?",
"info.faq.a13": "Yes! The app includes a migration wizard that transfers all your local data to cloud mode. You can also migrate back from cloud to local anytime."
```

#### Marketing Benefits - Add Cloud Benefits
```json
// NEW keys to add
"marketing.benefits.crossDeviceSync": "Cross-device sync",
"marketing.benefits.automaticBackup": "Automatic cloud backup",
"marketing.benefits.chooseYourMode": "Choose your mode",
"marketing.benefits.freeLocalMode": "Free local mode",
"marketing.benefits.premiumCloudSync": "Premium cloud sync"
```

#### Technical Section - Update Architecture
```json
// BEFORE
"technical.architecture.localFirstDesc": "All data stored locally on your device. No external servers or databases required."

// AFTER
"technical.architecture.localFirstDesc": "Choose your storage: local-only (free) or cloud sync (premium). Local mode keeps all data on your device. Cloud mode syncs to secure EU servers."

// ADD NEW
"technical.architecture.dualBackend": "Dual Backend",
"technical.architecture.dualBackendDesc": "DataStore abstraction supports both IndexedDB (local) and Supabase PostgreSQL (cloud). Switch modes without losing data."
```

### 1.2 Finnish (`site/public/locales/fi/common.json`)

Same changes as English, translated to Finnish. Key translations:

| English | Finnish |
|---------|---------|
| Local mode | Paikallinen tila |
| Cloud mode | Pilvisynkronointi |
| Cross-device sync | Synkronointi laitteiden välillä |
| Premium subscription | Premium-tilaus |
| €4.99/month | 4,99 €/kk |

---

## 2. Page Component Updates

### 2.1 Homepage (`site/pages/index.tsx`)

#### Add Mode Selection Section (New)
After the "Plan • Track • Assess" section, add a new section:

```tsx
{/* ===== CHOOSE YOUR MODE ===== */}
<section className="section section-divider bg-slate-800/50">
  <div className="container-custom">
    <div className="max-w-4xl mx-auto text-center">
      <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
        {isEnglish ? 'Choose Your Mode' : 'Valitse tila'}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        {/* Local Mode Card */}
        <div className="bg-slate-900/70 rounded-xl border border-slate-700 p-6">
          <div className="text-3xl mb-4">🔒</div>
          <h3 className="text-xl font-bold text-white mb-2">
            {isEnglish ? 'Local Mode' : 'Paikallinen tila'}
          </h3>
          <p className="text-primary text-2xl font-bold mb-4">
            {isEnglish ? 'Free' : 'Ilmainen'}
          </p>
          <ul className="text-slate-300 text-left space-y-2">
            <li>✓ {isEnglish ? 'Data stays on your device' : 'Tiedot pysyvät laitteellasi'}</li>
            <li>✓ {isEnglish ? 'Works offline' : 'Toimii ilman nettiä'}</li>
            <li>✓ {isEnglish ? 'No account required' : 'Ei tiliä tarvita'}</li>
            <li>✓ {isEnglish ? 'Full privacy' : 'Täysi yksityisyys'}</li>
          </ul>
        </div>
        {/* Cloud Mode Card */}
        <div className="bg-gradient-to-br from-primary/20 to-slate-900/70 rounded-xl border border-primary/50 p-6">
          <div className="text-3xl mb-4">☁️</div>
          <h3 className="text-xl font-bold text-white mb-2">
            {isEnglish ? 'Cloud Sync' : 'Pilvisynkronointi'}
          </h3>
          <p className="text-primary text-2xl font-bold mb-4">
            €4.99<span className="text-sm text-slate-400">/mo</span>
          </p>
          <ul className="text-slate-300 text-left space-y-2">
            <li>✓ {isEnglish ? 'Sync across devices' : 'Synkronoi laitteiden välillä'}</li>
            <li>✓ {isEnglish ? 'Automatic cloud backup' : 'Automaattinen pilvivarmuuskopio'}</li>
            <li>✓ {isEnglish ? 'EU data residency' : 'Data EU:ssa'}</li>
            <li>✓ {isEnglish ? 'Migrate anytime' : 'Siirrä tiedot milloin vain'}</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</section>
```

### 2.2 Technical Page (`site/pages/technical.tsx`)

#### Update Architecture Section
Add "Dual Backend" card alongside existing cards:

```tsx
<div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
  <h3 className="text-lg font-bold text-primary mb-2">
    {t('technical.architecture.dualBackend')}
  </h3>
  <p className="text-slate-300">
    {t('technical.architecture.dualBackendDesc')}
  </p>
</div>
```

#### Update Storage Section
Change from "Zero data transmission" to explain both modes.

### 2.3 FeaturesSections.tsx

#### Update Data & Privacy Section
Currently says "Data Stored Only on Your Device" - update to reflect choice:

```tsx
// Change storageTitle/storageDesc to reflect both modes
<FeatureCard
  icon={<FaShieldAlt />}
  title={t('features.dataPrivacy.storageTitle')} // "Your Data, Your Choice"
  description={t('features.dataPrivacy.storageDesc')} // "Local mode: device only. Cloud mode: secure EU sync."
/>
```

---

## 3. New Screenshots Required

### 3.1 Screenshots That Need Updates

| Screen | Current | Needed | Priority |
|--------|---------|--------|----------|
| Welcome Screen | Not shown | **NEW** - Shows mode selection | High |
| Settings (Account) | Not shown | **NEW** - Shows cloud account options | High |
| Migration Wizard | Not shown | **NEW** - Shows local→cloud migration | Medium |
| Login/Signup | Not shown | **NEW** - Shows auth screens | Medium |

### 3.2 Screenshots That DON'T Need Updates

The following core gameplay screenshots remain valid:
- ✅ Soccer field view
- ✅ Timer view
- ✅ Player statistics
- ✅ Tactical board
- ✅ Goal timeline
- ✅ Formations modal
- ✅ Season/Tournament creation
- ✅ Team management
- ✅ Player roster
- ✅ Excel export
- ✅ Personnel management
- ✅ Futsal view
- ✅ Official rules

**Rationale**: Cloud mode doesn't change the core UI - it's the same app with sync capability.

### 3.3 Screenshot Naming Convention

```
/public/screenshots/
├── MatchOps_welcome_modeselection_en.jpg    # NEW
├── MatchOps_welcome_modeselection_fi.jpg    # NEW
├── MatchOps_settings_cloudaccount_en.jpg    # NEW
├── MatchOps_settings_cloudaccount_fi.jpg    # NEW
├── MatchOps_migration_wizard_en.jpg         # NEW (optional)
├── MatchOps_auth_login_en.jpg               # NEW (optional)
```

---

## 4. Optional: New Pricing Page

Consider adding `/pricing` page for detailed comparison:

```
/site/pages/pricing.tsx
```

Content:
- Side-by-side comparison table
- Feature breakdown
- FAQ specific to pricing
- CTA buttons

**Decision**: This can be Phase 2. Homepage mode section may be sufficient initially.

---

## 5. Implementation Checklist

### Phase 1: Translation Updates (Do First)
- [ ] Update `en/common.json` - SEO, footer, FAQ, benefits, technical
- [ ] Update `fi/common.json` - Same changes in Finnish
- [ ] Add new translation keys for mode selection

### Phase 2: Component Updates
- [ ] Add mode selection section to `index.tsx`
- [ ] Update architecture section in `technical.tsx`
- [ ] Update privacy section in `FeaturesSections.tsx`

### Phase 3: Screenshots
- [ ] Capture Welcome Screen with mode selection (EN + FI)
- [ ] Capture Settings/Account screen (EN + FI)
- [ ] Update screenshot references in code if needed

### Phase 4: Review & Polish
- [ ] Test all pages in both languages
- [ ] Verify mobile responsiveness of new sections
- [ ] Check that existing screenshots still make sense in context
- [ ] Update OG image if needed

---

## 6. Messaging Guidelines

### DO
- ✅ Present local mode as the **default** and **free** option
- ✅ Position cloud as a **premium convenience** feature
- ✅ Emphasize that local users are **first-class citizens**
- ✅ Mention EU data residency for cloud mode
- ✅ Highlight that you can **switch modes anytime**

### DON'T
- ❌ Make it seem like cloud is required
- ❌ Suggest local mode is inferior or limited
- ❌ Hide the pricing
- ❌ Oversell cloud features (it's sync + backup, not AI analytics)
- ❌ Remove privacy messaging - it still applies to local mode

### Example Good Copy
> "**Local mode is free forever.** Your data stays on your device, works offline, no account needed. Want to sync across devices? Cloud mode adds automatic backup and multi-device access for €4.99/month. Switch anytime—your data is always yours."

---

## 7. Timeline Estimate

| Phase | Description | Estimate |
|-------|-------------|----------|
| Phase 1 | Translation updates | 2-3 hours |
| Phase 2 | Component updates | 2-3 hours |
| Phase 3 | Screenshots | 1-2 hours |
| Phase 4 | Review & polish | 1 hour |
| **Total** | | **6-9 hours** |

---

## 8. Dependencies

Before marketing site updates:
- [ ] Cloud mode UI must be finalized in main app
- [ ] Welcome screen mode selection must be implemented
- [ ] Settings/account UI must be complete
- [ ] Pricing (€4.99/month) must be confirmed

---

## Notes

- The marketing site is a separate Next.js project in `/site`
- It uses `next-i18next` for translations (same as main app)
- Current screenshots are in `/site/public/screenshots/`
- The site is deployed separately from the main app

---

## Appendix A: Complete Translation Texts (English)

Copy these into `site/public/locales/en/common.json`:

### Updates to Existing Keys

```json
{
  "seo": {
    "home": {
      "title": "MatchOps Local - Soccer Coaching App | Free Local Mode or Cloud Sync",
      "description": "Mobile coaching app for soccer and futsal. Free local mode keeps data on your device. Premium cloud sync (€4.99/mo) for multi-device access. Works offline."
    }
  },
  "footer": {
    "dataStays": "Your data, your choice. Local or cloud."
  },
  "info": {
    "faq": {
      "q2": "Where is my data stored?",
      "a2": "You choose. In local mode (free), all data stays on your device—nothing is sent anywhere. In cloud mode (€4.99/month), data syncs securely to EU-based servers so you can access it from any device.",
      "q3": "Can I use it on multiple devices?",
      "a3": "Local mode: Export your data from one device and import on another—no automatic sync. Cloud mode: Your data syncs automatically across all your devices.",
      "q11": "What's the difference between local and cloud mode?",
      "a11": "Local mode is free forever—your data never leaves your device, works offline, no account needed. Cloud mode (€4.99/month) adds automatic sync across devices and cloud backup. Both modes have the same features. You can switch anytime.",
      "q12": "Do I need an account?",
      "a12": "No account needed for local mode—just install and start using. Cloud mode requires a simple email/password registration for secure sync.",
      "q13": "Can I migrate my data between modes?",
      "a13": "Yes! The app includes a migration wizard. Move your data from local to cloud when you subscribe, or from cloud back to local if you cancel. Your data is never locked in."
    }
  },
  "features": {
    "dataPrivacy": {
      "storageTitle": "Your Data, Your Choice",
      "storageDesc": "Local mode: data stays on your device, full privacy. Cloud mode: secure sync to EU servers for multi-device access."
    }
  },
  "technical": {
    "architecture": {
      "localFirst": "Local-First Design",
      "localFirstDesc": "Local mode keeps all data on your device—no servers, no accounts, full privacy. Cloud mode adds optional sync to secure EU servers.",
      "dualBackend": "Dual Backend",
      "dualBackendDesc": "Clean DataStore abstraction supports both IndexedDB (local) and Supabase PostgreSQL (cloud). Switch modes without losing data."
    },
    "storage": {
      "privacy": "Privacy Options",
      "privacyDesc": "Local mode: zero data transmission, everything stays on device. Cloud mode: encrypted sync to EU servers with GDPR compliance."
    }
  }
}
```

### New Keys to Add

```json
{
  "pricing": {
    "title": "Choose Your Mode",
    "subtitle": "Same features. Different storage options.",
    "localMode": {
      "name": "Local Mode",
      "price": "Free",
      "priceNote": "forever",
      "description": "Perfect for coaches who want full privacy and offline capability.",
      "features": [
        "All app features included",
        "Data stays on your device",
        "Works completely offline",
        "No account required",
        "Full privacy guaranteed",
        "Export/import for backup"
      ],
      "cta": "Get Started Free"
    },
    "cloudMode": {
      "name": "Cloud Sync",
      "price": "€4.99",
      "priceNote": "/month",
      "description": "For coaches who want to access their data from any device.",
      "features": [
        "Everything in Local Mode",
        "Automatic cloud sync",
        "Access from any device",
        "Automatic cloud backup",
        "EU data residency",
        "Migrate to/from local anytime"
      ],
      "cta": "Start Cloud Sync"
    },
    "comparison": {
      "feature": "Feature",
      "local": "Local",
      "cloud": "Cloud",
      "allFeatures": "All app features",
      "offlineAccess": "Offline access",
      "multiDevice": "Multi-device sync",
      "autoBackup": "Automatic backup",
      "accountRequired": "Account required",
      "dataLocation": "Data location",
      "onDevice": "On device",
      "euServers": "EU servers",
      "yes": "Yes",
      "no": "No",
      "manual": "Manual export"
    }
  },
  "marketing": {
    "modes": {
      "title": "Choose Your Mode",
      "subtitle": "Both modes include all features. You choose where your data lives.",
      "localTitle": "Local Mode",
      "localPrice": "Free",
      "localFeature1": "Data stays on your device",
      "localFeature2": "Works offline",
      "localFeature3": "No account required",
      "localFeature4": "Full privacy",
      "cloudTitle": "Cloud Sync",
      "cloudPrice": "€4.99/mo",
      "cloudFeature1": "Sync across devices",
      "cloudFeature2": "Automatic cloud backup",
      "cloudFeature3": "EU data residency",
      "cloudFeature4": "Migrate anytime"
    },
    "benefits": {
      "crossDeviceSync": "Cross-device sync",
      "automaticBackup": "Automatic cloud backup",
      "chooseYourMode": "Choose your mode",
      "freeLocalMode": "Free local mode",
      "premiumCloudSync": "Premium cloud sync",
      "euDataResidency": "EU data residency",
      "migrateAnytime": "Migrate anytime"
    }
  }
}
```

---

## Appendix B: Complete Translation Texts (Finnish)

**⚠️ REVIEW NEEDED**: These Finnish translations should be reviewed by a native speaker before use. Marked items need particular attention.

Copy these into `site/public/locales/fi/common.json`:

### Updates to Existing Keys

```json
{
  "seo": {
    "home": {
      "title": "MatchOps Local - Jalkapallovalmentajan sovellus | Ilmainen tai pilvisynkronointi",
      "description": "Mobiilisovellus jalkapallo- ja futsalvalmentajille. Ilmaisversiossa tiedot pysyvät laitteellasi. Pilvisynkronointi (4,99 €/kk) useille laitteille. Toimii myös ilman nettiä."
    }
  },
  "footer": {
    "dataStays": "Sinä päätät. Paikallisesti tai pilvessä."
  },
  "info": {
    "faq": {
      "q2": "Mihin tietoni tallennetaan?",
      "a2": "Sinä päätät. Ilmaisversiossa kaikki tiedot pysyvät laitteellasi eikä mitään lähetetä minnekään. Pilvisynkronoinnissa (4,99 €/kk) tiedot tallentuvat turvallisesti EU-palvelimille ja ovat käytettävissä kaikilla laitteillasi.",
      "q3": "Voinko käyttää useammalla laitteella?",
      "a3": "Ilmaisversio: Vie tiedot yhdeltä laitteelta ja tuo toiselle. Pilvisynkronointi: Tiedot synkronoituvat automaattisesti kaikkien laitteidesi välillä.",
      "q11": "Mikä ero on ilmaisversiolla ja pilvisynkronoinnilla?",
      "a11": "Ilmaisversio on pysyvästi maksuton. Tiedot pysyvät laitteellasi, sovellus toimii ilman nettiä eikä tiliä tarvita. Pilvisynkronointi (4,99 €/kk) tuo automaattisen synkronoinnin laitteiden välillä sekä pilvivarmuuskopioinnin. Ominaisuudet ovat muuten samat. Voit vaihtaa tilojen välillä koska tahansa.",
      "q12": "Tarvitsenko käyttäjätilin?",
      "a12": "Ilmaisversioon ei tarvita tiliä – asenna ja käytä. Pilvisynkronointi edellyttää rekisteröitymistä sähköpostilla ja salasanalla.",
      "q13": "Voinko siirtää tietojani tilojen välillä?",
      "a13": "Kyllä. Sovellus sisältää siirtotyökalun. Voit siirtää tietosi paikallisesta pilveen tai pilvestä takaisin paikalliseen milloin tahansa. Tietosi eivät jää loukkuun kumpaankaan tilaan."
    }
  },
  "features": {
    "dataPrivacy": {
      "storageTitle": "Sinä päätät tallennuksesta",
      "storageDesc": "Ilmaisversio: tiedot laitteellasi, täysi yksityisyys. Pilvisynkronointi: turvallinen tallennus EU-palvelimille, käytettävissä kaikilla laitteilla."
    }
  },
  "technical": {
    "architecture": {
      "localFirst": "Paikallinen tallennus oletuksena",
      "localFirstDesc": "Ilmaisversiossa kaikki tiedot pysyvät laitteellasi – ei palvelimia, ei tilejä, täysi yksityisyys. Pilvisynkronointi tuo valinnaisen tallennuksen EU-palvelimille.",
      "dualBackend": "Joustava taustaratkaisu",
      "dualBackendDesc": "Sovellus tukee sekä paikallista tallennusta (IndexedDB) että pilvipalvelua (Supabase PostgreSQL). Vaihda tilojen välillä menettämättä tietoja."
    },
    "storage": {
      "privacy": "Yksityisyysasetukset",
      "privacyDesc": "Ilmaisversio: ei verkkoliikennettä, kaikki pysyy laitteella. Pilvisynkronointi: salattu yhteys EU-palvelimille, GDPR-yhteensopiva."
    }
  }
}
```

### New Keys to Add

```json
{
  "pricing": {
    "title": "Valitse tallennustapa",
    "subtitle": "Samat ominaisuudet, eri tallennusvaihtoehdot.",
    "localMode": {
      "name": "Ilmaisversio",
      "price": "Ilmainen",
      "priceNote": "pysyvästi",
      "description": "Valmentajille, jotka arvostavat yksityisyyttä ja haluavat sovelluksen toimivan ilman nettiä.",
      "features": [
        "Kaikki ominaisuudet käytössä",
        "Tiedot pysyvät laitteellasi",
        "Toimii ilman nettiyhteyttä",
        "Ei vaadi käyttäjätiliä",
        "Täysi yksityisyys",
        "Varmuuskopiointi vienti/tuonti-toiminnolla"
      ],
      "cta": "Aloita ilmaiseksi"
    },
    "cloudMode": {
      "name": "Pilvisynkronointi",
      "price": "4,99 €",
      "priceNote": "/kk",
      "description": "Valmentajille, jotka haluavat käyttää tietojaan useilla laitteilla.",
      "features": [
        "Kaikki ilmaisversion ominaisuudet",
        "Automaattinen pilvisynkronointi",
        "Käytä millä laitteella tahansa",
        "Automaattinen pilvivarmuuskopiointi",
        "Tiedot EU:n palvelimilla",
        "Vaihda paikalliseen milloin tahansa"
      ],
      "cta": "Aloita pilvisynkronointi"
    },
    "comparison": {
      "feature": "Ominaisuus",
      "local": "Ilmainen",
      "cloud": "Pilvi",
      "allFeatures": "Kaikki ominaisuudet",
      "offlineAccess": "Toimii ilman nettiä",
      "multiDevice": "Useilla laitteilla",
      "autoBackup": "Automaattinen varmuuskopio",
      "accountRequired": "Vaatii tilin",
      "dataLocation": "Tallennuspaikka",
      "onDevice": "Laitteella",
      "euServers": "EU-palvelimet",
      "yes": "Kyllä",
      "no": "Ei",
      "manual": "Manuaalinen vienti"
    }
  },
  "marketing": {
    "modes": {
      "title": "Valitse tallennustapa",
      "subtitle": "Samat ominaisuudet molemmissa. Sinä valitset missä tietosi ovat.",
      "localTitle": "Ilmaisversio",
      "localPrice": "Ilmainen",
      "localFeature1": "Tiedot pysyvät laitteellasi",
      "localFeature2": "Toimii ilman nettiä",
      "localFeature3": "Ei vaadi tiliä",
      "localFeature4": "Täysi yksityisyys",
      "cloudTitle": "Pilvisynkronointi",
      "cloudPrice": "4,99 €/kk",
      "cloudFeature1": "Synkronointi laitteiden välillä",
      "cloudFeature2": "Automaattinen pilvivarmuuskopio",
      "cloudFeature3": "Tiedot EU:ssa",
      "cloudFeature4": "Vaihda paikalliseen milloin vain"
    },
    "benefits": {
      "crossDeviceSync": "Synkronointi laitteiden välillä",
      "automaticBackup": "Automaattinen pilvivarmuuskopio",
      "chooseYourMode": "Valitse tallennustapa",
      "freeLocalMode": "Ilmainen paikallinen tallennus",
      "premiumCloudSync": "Pilvisynkronointi",
      "euDataResidency": "Tiedot EU:ssa",
      "migrateAnytime": "Vaihda milloin vain"
    }
  }
}
```

---

## Appendix C: Quick Reference - Key Phrases

| Context | English | Finnish |
|---------|---------|---------|
| Mode names | Local Mode / Cloud Sync | Ilmaisversio / Pilvisynkronointi |
| Pricing | Free / €4.99/month | Ilmainen / 4,99 €/kk |
| Data location | On your device / EU servers | Laitteellasi / EU-palvelimet |
| Key benefit (local) | Full privacy | Täysi yksityisyys |
| Key benefit (cloud) | Sync across devices | Synkronointi laitteiden välillä |
| CTA (local) | Get Started Free | Aloita ilmaiseksi |
| CTA (cloud) | Start Cloud Sync | Aloita pilvisynkronointi |
| Migration | Migrate anytime | Vaihda milloin vain |
| Account | No account required | Ei vaadi tiliä |
| Tagline | Your data, your choice | Sinä päätät. |
| Works offline | Works offline | Toimii ilman nettiä |
| Choose storage | Choose your mode | Valitse tallennustapa |

### Finnish Terminology Notes

**Avoided awkward direct translations:**
- ❌ "Paikallinen tila" → ✅ "Ilmaisversio" (clearer for users)
- ❌ "Sinun datasi, sinun valintasi" → ✅ "Sinä päätät." (natural Finnish)
- ❌ "Kaksoistaustajärjestelmä" → ✅ "Joustava taustaratkaisu" (less technical)
- ❌ "Siirtovelho" → ✅ "Siirtotyökalu" (more natural)

**Consistent terms:**
- "Pilvisynkronointi" - used consistently for cloud sync feature
- "EU-palvelimet" - for EU data residency
- "Ilmaisversio" - emphasizes it's free, not just "local"
