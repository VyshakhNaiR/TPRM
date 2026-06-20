// Kinetic-typography backdrop: faint, slowly-scrolling rows of the Network
// Intelligence name, services and TPRM keywords. Decorative, behind all content.
// Edit ROWS to change the wording.
const ROWS = [
  { text: "NETWORK INTELLIGENCE", top: "3%", size: "5.5rem", dur: 50, rev: false, color: "--fg", op: 0.05 },
  { text: "THIRD-PARTY RISK MANAGEMENT · VENDOR ASSURANCE", top: "19%", size: "3rem", dur: 64, rev: true, color: "--brand", op: 0.07 },
  { text: "MAS · RBI · SEBI CSCRF · REGULATORY AUTO-MAPPING", top: "34%", size: "3.6rem", dur: 56, rev: false, color: "--fg", op: 0.045 },
  { text: "VAPT · RED TEAMING · THREAT INTELLIGENCE · ZERO TRUST", top: "50%", size: "3rem", dur: 70, rev: true, color: "--brand-2", op: 0.06 },
  { text: "MANAGED SECURITY · SOC · MDR · INCIDENT RESPONSE", top: "65%", size: "4.2rem", dur: 54, rev: false, color: "--fg", op: 0.045 },
  { text: "GRC · ISO 27001 · PCI DSS · CLOUD SECURITY · COMPLIANCE", top: "80%", size: "3rem", dur: 66, rev: true, color: "--brand", op: 0.06 },
  { text: "CYBER RESILIENCE · SECURING DIGITAL TRANSFORMATION", top: "92%", size: "4rem", dur: 58, rev: false, color: "--fg", op: 0.04 },
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
