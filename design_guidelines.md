# CloudShop Login Page Design Guidelines

## Design Approach

**Reference-Based:** Linear's minimalist authentication + Stripe's trust-building design + Apple's depth and polish, elevated with premium 3D glassmorphism for cloud marketplace admin access.

**Core Principle:** Immersive 3D glass environment that balances visual spectacle with focused authentication experience. Deep purple-blue gradient space with floating luminous elements creates premium, trustworthy entry point.

## Typography

**Font Family:** Inter (Google Fonts - 400, 500, 600, 700)

**Hierarchy:**
- Login header: 3xl, font-bold
- Subheading: lg, font-normal, opacity-80
- Input labels: sm, font-medium
- Button text: base, font-semibold
- Helper text/links: sm, font-normal
- Error messages: sm, font-medium, red accent

## Layout System

**Spacing Primitives:** Tailwind units 4, 6, 8, 12, 16

**Structure:**
- Full viewport height (min-h-screen)
- Centered login card (max-w-md)
- Card padding: p-8 to p-12
- Form field spacing: space-y-6
- Input internal padding: px-4 py-3

## 3D Glassmorphic Environment

**Background Composition:**
- Base gradient: Deep purple (#1a0b2e) to electric blue (#0f172a), diagonal 135deg
- Multiple animated gradient orbs (3-5 large spheres)
- Mesh gradient overlay for depth variation
- Subtle noise texture (5% opacity) for premium feel

**Glowing Orbs:**
- Large blob shapes (300-600px diameter)
- Radial gradients: purple (#8b5cf6) to blue (#3b82f6) with blur
- Filter: blur(80px) for soft glow effect
- Positioned: top-right, bottom-left, center-back (layered)
- Opacity: 0.3 to 0.5
- Floating animation: Slow drift (60-90s duration), translate and scale subtly

**Floating Elements:**
- Small glass particles/dots scattered (15-20 pieces)
- Semi-transparent circles (white/10), sizes 8px to 24px
- Blur: backdrop-blur-sm
- Gentle float animation (different speeds, 40-80s cycles)
- Random positioning across viewport

**Login Card Glass Treatment:**
- Background: white/10 with backdrop-blur-2xl
- Border: 1px solid white/20
- Shadow: 0 25px 50px rgba(0,0,0,0.3)
- Border radius: rounded-3xl
- Subtle inner glow: inset shadow with white/5

## Component Library

**Login Card:**
- Center-positioned glass panel
- Logo at top (h-12, mb-8)
- Header text stack (mb-8)
- Form container with input stack
- Footer with links/help text

**Form Inputs:**
- Glass treatment: bg-white/5, border white/20
- Rounded-xl borders
- Focus state: border-white/40, ring with purple glow (ring-purple-400/50)
- Icon prefix (envelope for email, lock for password)
- Input text: white, placeholder white/40
- Label above: text-sm, font-medium, mb-2

**Primary Button:**
- Gradient fill: purple (#8b5cf6) to blue (#3b82f6)
- Full width (w-full)
- Padding: py-3.5
- Rounded-xl
- Font-semibold text
- Subtle glow shadow: 0 0 20px purple/30
- Hover: Brightness increase (brightness-110)
- Active: Scale-95

**Secondary Actions:**
- "Forgot password?" link: text-sm, text-blue-300, underline-offset-2
- "Remember me" checkbox: Glass checkbox with white/20 border, checked state purple fill
- Divider: Horizontal line (border-white/10) with "OR" text overlay

**Social Login Buttons:**
- Glass background (white/5)
- Icon + text layout (gap-3)
- Border: white/20
- Rounded-lg
- Hover: white/10 background

**Error/Success States:**
- Error banner: Glass red panel (red-500/20 bg, red-300 border, red-200 text)
- Success banner: Glass green panel
- Input error: Red border (border-red-400)
- Positioned above form (mb-6)

## Animations

**Purposeful Motion:**
- Orb float: Continuous slow drift with scale pulse (1s ease-in-out)
- Particle drift: Gentle y-axis movement (translateY 20px over 60s)
- Card entrance: Fade-in with scale-up (0.95 to 1) over 600ms
- Input focus: Border color transition (300ms)
- Button click: Scale down (95%) with 150ms duration
- Page load: Stagger animations (orbs → particles → card)

**CSS Variables for Animation:**
- Orb speeds: 60s, 75s, 90s (different for each)
- Float range: ±30px horizontal, ±40px vertical
- Rotation: Slow 360deg over 120s for depth

## Key Patterns

**Loading State:**
- Spinner overlay on button (white spinner, button disabled)
- Form inputs disabled with reduced opacity

**Password Visibility Toggle:**
- Eye icon button inside input (right side)
- Glass button treatment
- Toggle between password/text type

**Validation:**
- Real-time email format check (on blur)
- Password strength indicator (below password field, 4-segment glass bar)
- Error text appears below invalid inputs (text-sm, text-red-300)

**Trust Elements:**
- Small security badge below form (shield icon + "256-bit encryption" text)
- Company logo watermark (large, white/5 opacity, bottom-right corner of viewport)

**Responsive Behavior:**
- Mobile: Card width 90vw (min), reduce orb sizes 40%
- Tablet: Card max-w-lg
- Desktop: Card max-w-md, full 3D orb display

## Layout Composition

Login card contains (top to bottom):
1. CloudShop logo (centered, mb-8)
2. Welcome text: "Welcome back" (3xl bold) + "Sign in to your dashboard" (lg, opacity-80)
3. Social login buttons stack (Google, Microsoft) - optional quick access
4. Divider with "OR"
5. Email input with envelope icon
6. Password input with lock icon + visibility toggle
7. Remember me checkbox + Forgot password link (flex justify-between)
8. Sign in button (gradient, full-width)
9. Footer: "Don't have an account? Contact admin" link (center, text-sm)
10. Security badge (center, mt-8)

No images required - 3D background provides visual richness.