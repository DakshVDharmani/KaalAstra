# ⚡ AstraCalc Pro • Quantum Precision Suite

**AstraCalc Pro** is an ultra-premium, feature-packed modern web calculator suite engineered with pure vanilla HTML5, CSS3 Glassmorphism, and high-precision JavaScript.

---

## 🌟 Core Feature Matrix

### 1. 🧮 Standard Calculator
- Clean four-operation basic and chained arithmetic (`+`, `−`, `×`, `÷`, `%`, `^`).
- Expression memory and parenthesis nesting with live preview.
- Memory management keys (`MC`, `MR`, `M+`, `M−`, `MS`) with live memory inspector.
- Backspace (`⌫`), Sign invert (`±`), and instantaneous Copy-to-Clipboard.

### 2. 🔬 Scientific Calculator
- **Trigonometry**: `sin`, `cos`, `tan`, `sin⁻¹`, `cos⁻¹`, `tan⁻¹`.
- **Hyperbolic & Angle Switch**: Full `hyp` support with toggleable `DEG` (Degrees) and `RAD` (Radians) modes.
- **Logarithms & Powers**: `ln`, `log₁₀`, `log₂`, `x²`, `x³`, `xʸ`, `√x`, `∛x`, `10ˣ`, `1/x`.
- **Constants & Discrete Math**: `π` (Pi), `e` (Euler's Number), `φ` (Golden Ratio), Factorials (`n!`), Absolute value (`|x|`), and Modulo (`mod`).

### 3. 💻 64-Bit Programmer Instrument
- **Simultaneous Radix View**: Synchronized representations across **HEX** (Base 16), **DEC** (Base 10), **OCT** (Base 8), and **BIN** (Base 2).
- **Interactive 64-Bit Board**: 64 individual clickable bit cells (bits 63 to 0). Toggling any bit immediately recomputes all bases and representations.
- **Adjustable Word Size**: Dynamically clamp bit lengths to `QWORD` (64-bit), `DWORD` (32-bit), `WORD` (16-bit), or `BYTE` (8-bit).
- **Bitwise Logic**: `AND`, `OR`, `XOR`, `NOT`, `NAND`, `NOR`, `XNOR`, Logical Shifts (`LSH <<`, `RSH >>`), and Bit Rotations (`RoL`, `RoR`).
- Dynamic keypad locking that grays out invalid digits for the active base (e.g. disabling A–F and 2–9 in binary mode).

### 4. 📈 Interactive Graphing Engine
- Built with HTML5 Canvas with high-DPI / Retina display scaling.
- Evaluates real-time math functions `f(x)` (e.g., `sin(x) * cos(x/2)`, `x^2 - 4`, `1 / (1 + x^2)`).
- **Interactive Coordinate Tracker**: Hover over the coordinate plane to inspect exact `(x, y)` coordinates.
- **Pan & Zoom**: Drag to pan across axes, with zoom in, zoom out, and reset controls.
- One-click presets for rapid plotting.

### 5. 🔄 Instant Unit Converter
- **Length**: Meters, Kilometers, Centimeters, Millimeters, Miles, Yards, Feet, Inches.
- **Weight & Mass**: Kilograms, Grams, Milligrams, Pounds, Ounces, Metric Tons.
- **Temperature**: Celsius (°C), Fahrenheit (°F), Kelvin (K).
- **Speed**: m/s, km/h, mph, Knots, Mach.
- **Data Storage**: Bytes, KB, MB, GB, TB, PB.
- **Time**: Seconds, Minutes, Hours, Days, Weeks, Years.
- **Area**: Square Meters, Square Kilometers, Square Feet, Acres, Hectares.
- Instant swap button and dynamic conversion formula explanation.

### 6. 🎧 Synthesized Web Audio & Haptic Feedback
- Zero external audio files required!
- Employs the **Web Audio API** (`OscillatorNode`, `BiquadFilterNode`, `GainNode`) to synthesize realistic, subtle mechanical switch clicks on keypresses.
- Sound toggle button to mute or enable anytime.

### 7. 📜 Calculation Session Tape (History)
- Collapsible glassmorphism history drawer.
- Keeps timestamped records of all calculations.
- Click any past item to instantly recall it into the active calculation.
- Export entire session history as a `.txt` file or clear in one click.

---

## 🎨 Themes & Aesthetics
- **Cyber Neon**: Vibrant cyan glow with dark metallic obsidian backdrop.
- **Deep Obsidian**: Minimalist monochrome luxury dark aesthetic.
- **Emerald Matrix**: High-tech phosphor green terminal glow.
- **Aurora Violet**: Cyberpunk magenta and deep purple gradients.

---

## ⌨️ Keyboard Shortcuts
| Key | Action |
| :--- | :--- |
| `0` – `9` | Digits input |
| `+`, `-`, `*`, `/` | Basic operators (`+`, `−`, `×`, `÷`) |
| `Enter` or `=` | Calculate result |
| `Backspace` | Clear last entry |
| `Esc` or `c` | Clear All (`AC`) |
| `(`, `)` | Parentheses grouping |
| `^` | Exponentiation (Power) |
| `%` | Modulo / Percent |
| `m` | Switch to Scientific Mode |
| `p` | Switch to Programmer Mode |
| `g` | Switch to Graphing Mode |
| `h` | Toggle History Drawer |
| `A` – `F` | Hexadecimal digits in Programmer Mode |

---

## 🚀 Running the Project
Simply open `index.html` in any modern web browser:
```bash
# Using Python built-in server (optional)
python -m http.server 3000

# Or open directly in browser
file:///d:/devday/KaalAstra/demo-target/index.html
```
