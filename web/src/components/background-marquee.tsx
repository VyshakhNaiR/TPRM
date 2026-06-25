// Kinetic-typography backdrop: faint, slowly-scrolling rows of the Network
// Intelligence name, services and TPRM keywords. Decorative, behind all content.
// Edit ROWS to change the wording.
// `dur` = seconds per loop — higher is slower. Kept deliberately slow so the
// backdrop drifts gently rather than distracting from the content.
const ROWS = [
  { text: "NETWORK INTELLIGENCE", top: "3%", size: "5.5rem", dur: 150, rev: false, color: "--fg", op: 0.04 },
  { text: "THIRD-PARTY RISK MANAGEMENT · VENDOR ASSURANCE", top: "19%", size: "3rem", dur: 185, rev: true, color: "--brand", op: 0.055 },
  { text: "MAS · RBI · SEBI CSCRF · REGULATORY AUTO-MAPPING", top: "34%", size: "3.6rem", dur: 165, rev: false, color: "--fg", op: 0.038 },
  { text: "VAPT · RED TEAMING · THREAT INTELLIGENCE · ZERO TRUST", top: "50%", size: "3rem", dur: 200, rev: true, color: "--brand-2", op: 0.05 },
  { text: "MANAGED SECURITY · SOC · MDR · INCIDENT RESPONSE", top: "65%", size: "4.2rem", dur: 160, rev: false, color: "--fg", op: 0.038 },
  { text: "GRC · ISO 27001 · PCI DSS · CLOUD SECURITY · COMPLIANCE", top: "80%", size: "3rem", dur: 190, rev: true, color: "--brand", op: 0.05 },
  { text: "CYBER RESILIENCE · SECURING DIGITAL TRANSFORMATION", top: "92%", size: "4rem", dur: 170, rev: false, color: "--fg", op: 0.035 },
];

export function BackgroundMarquee() {
  return (
    <div className="marquee-mask absolute inset-0">
      {ROWS.map((r, i) => {
        const copy = (r.text + "   ·   ").repeat(10);
        return (
          <div key={i} className="marquee-row" style={{ top: r.top }}>
            <div
              className="marquee-track"
              style={{
                fontSize: r.size,
                color: `rgb(var(${r.color}) / ${r.op})`,
                animation: `marquee-scroll ${r.dur}s linear infinite`,
                animationDirection: r.rev ? "reverse" : "normal",
              }}
            >
              <span>{copy}</span>
              <span>{copy}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
