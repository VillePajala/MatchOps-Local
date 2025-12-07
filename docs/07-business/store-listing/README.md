# Play Store Listing Assets

This directory contains all assets and text needed for the Google Play Store listing.

## Required Assets

### App Icons
- [x] 512x512 PNG (high-res icon) - `public/icons/icon-512x512.png`

### Feature Graphic
- [ ] 1024x500 PNG - Required for store listing

### Screenshots (Phone)
Required: 2-8 screenshots
- Dimensions: 16:9 or 9:16 aspect ratio
- Min: 320px, Max: 3840px per side
- Recommended captures:
  1. Main game screen with soccer field
  2. Player roster management
  3. Game settings/lineup configuration
  4. Statistics view
  5. Timer in action during game

### Screenshots (Tablet - Optional)
- 7-inch tablet: 2-8 screenshots
- 10-inch tablet: 2-8 screenshots

## Store Listing Text

See [store-description-en.md](./store-description-en.md) for full listing text.

### Short Description (80 chars max)
```
Soccer game timer & tactics app for coaches. Track lineups, stats & gameplay.
```

### Full Description (4000 chars max)
See the full description file.

## Content Rating

**App Category**: Sports → Soccer/Football Tools

**Content Rating Questionnaire**:
- Violence: None
- Sexual Content: None
- Language: None
- Controlled Substances: None
- User-Generated Content: No (local data only)
- Location Sharing: No
- Ads: No

Expected Rating: **Everyone (E)**

## Privacy & Policies

### Privacy Policy URL
**Required**: Must be hosted publicly

Key points for privacy policy:
- Local-first app - data stays on device
- No user accounts in local mode
- No personal data collected except:
  - Player names (user-entered, stored locally)
  - Optional: Error reports via Sentry (anonymized)
- Future: License validation via Play Store API

### Terms of Service URL
Optional but recommended

## Pricing & Distribution

### Pricing Model
- **Free Download** with premium features via In-App Purchase
- One-time purchase for premium (no subscription)

### Target Countries
- Initial: Finland, Sweden, Norway, Denmark, UK, USA, Canada
- Expansion: All countries where Play Store available

### Device Compatibility
- Android 5.0+ (API 21+)
- Phones and tablets
- No special hardware requirements

## Checklist

Before submission:
- [ ] App icon uploaded (512x512)
- [ ] Feature graphic created (1024x500)
- [ ] At least 2 phone screenshots
- [ ] Short description (80 chars)
- [ ] Full description (4000 chars)
- [ ] Privacy Policy URL live
- [ ] Content rating questionnaire completed
- [ ] App category selected
- [ ] Contact email configured
- [ ] Release name set (e.g., "1.0.0")
