# Design Guidelines - Prototype Dilemme (Voice-First AI Educational App)

## Design Approach

**Selected Approach**: Design System (Material Design 3 adapted for mobile-first educational context)

**Justification**: This is a utility-focused educational tool requiring reliable performance across 24+ concurrent classroom sessions. Material Design provides robust mobile patterns, clear state management for voice interactions, and strong visual feedback systems essential for audio interface states. We'll adapt it with playful educational elements while maintaining consistency and accessibility.

**Key Design Principles**:
- Mobile-first supremacy (320px-428px primary viewport)
- Crystal-clear audio state visibility
- Immediate visual + auditory feedback
- Touch-friendly interaction zones (minimum 44px)
- Accessibility for diverse learners

---

## Typography

**Primary Font**: Inter (via Google Fonts CDN)
- Headers: 600-700 weight
- Body: 400-500 weight
- UI elements: 500 weight

**Secondary Font**: Space Grotesk (for branding/hero elements)
- Logo and title screens: 700 weight
- Playful accent text: 500 weight

**Hierarchy**:
- Hero titles: text-4xl to text-5xl (Space Grotesk Bold)
- Section headers: text-2xl to text-3xl (Inter Semibold)
- Body text: text-base to text-lg (Inter Regular)
- UI labels: text-sm to text-base (Inter Medium)
- Captions/metadata: text-xs to text-sm (Inter Regular)

---

## Layout System

**Spacing Primitives** (Tailwind units): 2, 4, 6, 8, 12, 16, 20, 24

**Common Patterns**:
- Component padding: p-4 to p-6 (mobile), p-8 (tablet+)
- Section spacing: space-y-6 to space-y-8
- Grid gaps: gap-4 to gap-6
- Button padding: px-6 py-3 to px-8 py-4
- Container margins: mx-4 (mobile), mx-auto max-w-2xl (tablet+)

**Mobile Layout Structure**:
- Safe area padding: px-4 py-6
- Full-bleed images: w-full with container constraints
- Sticky elements: top-0 with appropriate z-index layers

---

## Component Library

### Core Navigation
**Title Screen**:
- Full-viewport centered layout (min-h-screen flex items-center)
- Logo/project branding (top third)
- Large primary CTA button (w-full max-w-sm, rounded-2xl)
- Discrete footer link (text-sm, bottom positioning)

**Header** (Tutorial/Game Screens):
- Sticky top navigation: flex justify-between items-center px-4 py-4
- Progress indicator (left): Circular badge with count "0/4"
- Help icon (right): Touch-friendly icon button (w-12 h-12)

### Video Player
**Intro Video Component**:
- Full-screen overlay (fixed inset-0)
- Native video element with custom controls overlay
- Control buttons: absolute positioned, bottom-8, flex gap-4
- "Skip" button (top-right corner with backdrop blur)
- "Replay" button (post-video state)

### Voice Interaction Zone (Critical Component)

**Default State (Idle)**:
- Fixed bottom position: fixed bottom-0 inset-x-0
- Container: bg-white rounded-t-3xl shadow-2xl px-6 py-8
- Large circular microphone button: w-20 h-20, centered, rounded-full
- Hint text below: "Tap to speak" (text-sm)

**Recording State**:
- Animated VU meter: Vertical bars (gap-1) with varying heights
- Pulsing microphone icon with concentric rings animation
- Status text: "Listening..." with animated ellipsis
- Stop button: Small circular button below mic (w-12 h-12)

**Processing State**:
- Loading spinner replacing mic icon
- Status text: "Thinking..." 
- Disable all touch interactions with opacity-50

**Playing State**:
- Audio waveform visualization (horizontal bars)
- Avatar/bot icon with subtle bounce
- Transcription display: Rounded container above, p-4, text-base
- Playback progress indicator

**Error/Fallback State**:
- Alert banner: bg-amber-50 border-l-4 border-amber-400
- Clear error message with icon
- Text input field appears: rounded-xl border-2, px-4 py-3
- Send button: Rounded square (w-12 h-12)

### Image Display
**Tutorial Image Container**:
- Centered, responsive: max-w-full h-auto
- Aspect ratio maintained: aspect-video or aspect-square
- Rounded corners: rounded-xl
- Subtle shadow: shadow-lg
- Touch events disabled (prevent zoom)
- Top margin from header: mt-20

### Progress & Feedback

**Clue Counter**:
- Badge component: Circular or rounded-full
- Large number display: text-2xl font-bold
- Fraction format: "2/4" with secondary color for denominator
- Animated increment on discovery

**Discovery Feedback**:
- Toast notification: Slide up from bottom, rounded-2xl, px-6 py-4
- Confetti or sparkle particle effect (brief, 1-2s)
- Checkmark icon with scale-in animation
- Success message: "Great! You found [keyword]"
- Auto-dismiss after 3 seconds

**Score Screen**:
- Full-screen container: min-h-screen flex flex-col
- Header: Score display (text-6xl font-bold)
- Checklist of clues: space-y-4, each with checkmark/x icon
- Feedback text: p-6, text-lg, text-center
- Action buttons: Stack vertically, w-full max-w-sm, gap-4

### Forms & Inputs

**Name Input (Tutorial Start)**:
- Label: text-sm font-medium mb-2
- Input field: rounded-xl border-2 px-4 py-3, text-lg
- Focus state: border color change, shadow-md
- Helper text below: text-xs

**Buttons**:
- Primary: Large rounded-full or rounded-2xl, px-8 py-4, text-lg font-semibold
- Secondary: Outlined variant, border-2
- Icon buttons: Square or circular, w-12 h-12
- All buttons: Minimum touch target 44px, active:scale-95 transform

### Overlays & Modals

**Permission Alert**:
- Modal overlay: fixed inset-0 bg-black/50
- Card: max-w-md mx-4, rounded-2xl, p-6
- Icon at top: Large warning/info icon (w-16 h-16)
- Title: text-xl font-bold
- Message: text-base, leading-relaxed
- Buttons: Full-width, stacked

**Help Modal**:
- Slide-in from right or bottom sheet
- Close button: Top-right, w-10 h-10
- Content: scrollable, p-6, space-y-4

---

## Animations

**Strictly Minimal**:
- Microphone pulse during recording (scale + opacity)
- Progress counter increment (number flip or scale)
- Success toast slide-up + fade
- Button active states (scale-95)
- Loading spinners (rotate)
- State transitions (300ms ease-in-out)

**Forbidden**: Complex scroll animations, parallax, decorative motion

---

## Images

**Title Screen**: 
- Background: Abstract educational/technology theme (optional gradient overlay)
- Logo image: Centered, max-w-xs

**Intro Video**:
- Video placeholder: Peter character introduction (embedded video file)
- Poster frame: First frame of video

**Tutorial Image**:
- High-quality fixed image for clue discovery
- Example: Complex scene with multiple analyzable elements
- Format: JPG or PNG, optimized for mobile (max 800px width)
- No hero image treatment - functional display only

**Feedback Elements**:
- Success icons: SVG checkmarks, stars
- Avatar/bot icon: Friendly character representation (circular, 48px-64px)
- No decorative imagery beyond functional feedback

---

## Accessibility & States

**Visual State Indicators**:
- Microphone: 4 states with distinct icons and colors
- Audio playback: Visible waveform or progress bar
- Error states: Red/amber alert styling with icons
- Success states: Green accent with checkmark

**Touch Targets**:
- All interactive elements: Minimum 44x44px
- Primary buttons: 48px height minimum
- Adequate spacing between touch zones (gap-4 minimum)

**Fallback UI**:
- Text input appears with clear labeling
- All voice responses also displayed as text
- Visual confirmation for all audio events

**Keyboard Navigation**: Not primary concern (mobile-first), but ensure buttons are focusable

---

This design creates a clean, functional mobile experience that prioritizes voice interaction clarity while maintaining visual appeal for educational engagement.