# Dilemme Plastique - Design Guidelines

## Design Approach
**Reference-Based with Educational Gaming Focus**
Drawing from Duolingo's gamified learning patterns, Instagram's image-first mobile design, and Khan Academy's educational clarity. The app balances serious environmental content with engaging, youth-friendly interactions.

## Typography System
**Families**:
- Primary: Inter (headers, UI elements) - weights 500, 600, 700
- Body: -apple-system/system-ui (optimal mobile readability) - weights 400, 500

**Scale**:
- Hero/Page titles: text-3xl (mobile), text-4xl (tablet+)
- Section headers: text-xl font-semibold
- Card titles: text-lg font-medium
- Body text: text-base leading-relaxed
- Captions/hints: text-sm text-gray-600

## Layout System
**Spacing Primitives**: Use Tailwind units of 3, 4, 6, 8, 12, 16
- Component padding: p-4 to p-6
- Section spacing: space-y-6 to space-y-8
- Card gaps: gap-4
- Screen padding: px-4 (mobile), px-6 (tablet)

**Container Strategy**:
- Full-width screens with max-w-2xl centering for content
- Cards use w-full with internal max-width constraints
- Safe area padding for mobile: pb-safe

## Core Screens & Components

### 1. Home/Discovery Screen
**Layout**: Scrollable vertical feed
- **Hero Image**: Full-width environmental imagery (16:9 aspect ratio) with gradient overlay (bottom 40%)
  - Overlaid title: "Découvre le Plastique" (text-3xl font-bold, white)
  - Subtitle with quick stat (text-sm, white/90)
  - CTA button with backdrop-blur-md bg-white/20 border border-white/30
- **Mission Cards**: Grid of clickable image cards (rounded-2xl, shadow-lg)
  - Image with environmental theme
  - Title overlay at bottom with gradient fade
  - Progress indicator dot (completed/locked states)
  - Spacing: space-y-4 between cards

### 2. Image Analysis Screen
**Structure**: Fixed-position layout
- **Top Bar**: Compact header with back button, mission title (truncate), voice toggle icon
- **Zoomable Image Container**: Takes 50-60% viewport height
  - Pinch-to-zoom enabled area
  - Subtle zoom indicators in corners (text-xs icons)
  - Environmental photo full-bleed
- **AI Conversation Panel**: Bottom sheet style (rounded-t-3xl)
  - Chat bubbles: AI (left-aligned, bg-blue-50, rounded-2xl rounded-tl-sm) vs User (right-aligned, bg-green-50, rounded-2xl rounded-tr-sm)
  - Voice input: Large circular button (w-16 h-16) at bottom with pulsing animation when active
  - Typing indicator: Three animated dots

### 3. Drag-and-Drop Game Screen
**Layout**: Vertical game board
- **Header**: Progress bar (h-2, rounded-full, bg-gradient) showing completion
- **Sentence Area**: 
  - Fill-in-the-blank sentences with drop zones (border-2 border-dashed rounded-lg p-3 min-h-[60px])
  - Dropped words: solid background with checkmark icon
  - Empty zones: subtle pulse animation
- **Word Bank**: Bottom fixed panel (bg-white shadow-2xl rounded-t-3xl p-6)
  - Draggable word chips: rounded-full px-6 py-3 shadow-md with touch-friendly sizing
  - Grid layout: grid-cols-2 gap-3
- **Feedback States**: Green checkmark overlay for correct, red shake animation for wrong
- **Submit Button**: Full-width at bottom (rounded-xl h-14 text-lg font-semibold)

### 4. Synthesis Input Screen
**Structure**: Form-focused
- **Progress Indicator**: Step counter at top (1/3, 2/3, 3/3 format)
- **Prompt Card**: Elevated card (shadow-lg rounded-2xl p-6 bg-gradient-to-br from-blue-50 to-green-50)
  - Question text (text-lg font-medium)
  - Character count hint
- **Input Area**: 
  - Large textarea (min-h-[200px] rounded-xl border-2 p-4)
  - Floating character counter (bottom-right, text-sm)
- **Media Upload**: Optional image upload zone (border-dashed rounded-xl aspect-video)
- **Action Buttons**: Dual buttons (Skip + Continue) with different weights

### 5. Results/Achievement Screen
**Layout**: Celebration-focused
- **Hero Illustration**: Environmental achievement badge (large, centered)
- **Score Display**: Circular progress ring with percentage
- **Stats Grid**: 2-column grid showing metrics (time, accuracy, points)
- **Impact Statement**: Card showing real-world equivalent (e.g., "Équivalent à X bouteilles recyclées")
- **CTA Row**: Share button + Continue learning (gap-3)

## Component Library

**Buttons**:
- Primary: rounded-xl px-8 py-4 font-semibold shadow-lg
- Secondary: rounded-xl px-8 py-4 border-2 
- Icon buttons: rounded-full w-12 h-12 flex items-center justify-center
- Voice button: rounded-full w-16 h-16 with inner circle animation

**Cards**:
- Mission cards: rounded-2xl overflow-hidden shadow-lg aspect-[4/3]
- Content cards: rounded-xl p-6 shadow-md
- Interactive cards: Add active:scale-98 transform

**Progress Indicators**:
- Linear: h-2 rounded-full with gradient fill
- Circular: SVG ring with animated stroke
- Dots: Horizontal row of circles for steps

**Navigation**:
- Bottom tab bar: Fixed bottom, 4 icons, h-16, rounded-t-2xl shadow-2xl
- Back button: Top-left, rounded-full bg-white/80 backdrop-blur

## Images Specification

**Hero Image**: 
- Location: Home screen top
- Style: High-quality environmental photography (ocean plastic, beach cleanup, recycling)
- Treatment: Subtle gradient overlay (from transparent to black/60 at bottom)
- Size: Full-width, 16:9 aspect ratio

**Mission Cards**:
- Multiple environmental images per card
- Each image represents a different plastic pollution scenario
- Images should be vibrant, clear, teen-appropriate

**Analysis Screen**:
- User-uploaded or pre-set environmental images
- Must support zoom/pan interactions
- High resolution for detail analysis

**Achievement Badges**:
- Illustrated SVG icons for gamification
- Environmental themes (leaves, recycling symbols, earth)

## Interaction Patterns
- Touch targets minimum 44x44px
- Haptic feedback on important actions
- Swipe gestures for card navigation
- Pull-to-refresh on home feed
- Smooth transitions: transition-all duration-300
- Loading states: Skeleton screens with shimmer effect

## Accessibility
- High contrast text (WCAG AA minimum)
- Voice-over friendly labels
- Large touch targets throughout
- Clear focus states for all interactive elements
- Alternative text for all images