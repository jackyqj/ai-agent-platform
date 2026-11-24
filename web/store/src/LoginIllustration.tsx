/** 登录页插图：森米工作台信号拓扑 — 中心平台与助手节点之间的脉冲链路 */
export default function LoginIllustration() {
  return (
    <div className="login-art" aria-hidden="true">
      <svg className="login-art-svg" viewBox="0 0 360 300" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="hub-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="lane-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.15" />
            <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {/* ambient grid */}
        <g className="login-grid" opacity="0.35">
          {[...Array(7)].map((_, i) => (
            <line key={`v${i}`} x1={40 + i * 48} y1="24" x2={40 + i * 48} y2="276" stroke="var(--border)" strokeWidth="1" />
          ))}
          {[...Array(6)].map((_, i) => (
            <line key={`h${i}`} x1="24" y1={40 + i * 48} x2="336" y2={40 + i * 48} stroke="var(--border)" strokeWidth="1" />
          ))}
        </g>

        <circle cx="180" cy="150" r="72" fill="url(#hub-glow)" className="login-hub-glow" />

        {/* signal paths */}
        <path className="signal-path" d="M180 150 L80 72" stroke="url(#lane-grad)" strokeWidth="2" strokeDasharray="6 8" />
        <path className="signal-path signal-path--delay" d="M180 150 L280 72" stroke="url(#lane-grad)" strokeWidth="2" strokeDasharray="6 8" />
        <path className="signal-path signal-path--delay2" d="M180 150 L72 210" stroke="url(#lane-grad)" strokeWidth="2" strokeDasharray="6 8" />
        <path className="signal-path signal-path--delay3" d="M180 150 L288 228" stroke="url(#lane-grad)" strokeWidth="2" strokeDasharray="6 8" />

        {/* agent nodes */}
        <g className="login-node">
          <rect x="52" y="52" width="56" height="40" rx="8" stroke="var(--border-strong)" strokeWidth="1.5" fill="var(--surface)" />
          <text x="80" y="76" textAnchor="middle" fill="var(--text-dim)" fontSize="11" fontFamily="var(--font-mono)">HR</text>
        </g>
        <g className="login-node login-node--delay">
          <rect x="252" y="52" width="56" height="40" rx="8" stroke="var(--border-strong)" strokeWidth="1.5" fill="var(--surface)" />
          <text x="280" y="76" textAnchor="middle" fill="var(--text-dim)" fontSize="11" fontFamily="var(--font-mono)">报告</text>
        </g>
        <g className="login-node login-node--delay2">
          <rect x="44" y="190" width="56" height="40" rx="8" stroke="var(--border-strong)" strokeWidth="1.5" fill="var(--surface)" />
          <text x="72" y="214" textAnchor="middle" fill="var(--text-dim)" fontSize="11" fontFamily="var(--font-mono)">检索</text>
        </g>
        <g className="login-node login-node--delay3">
          <rect x="260" y="208" width="56" height="40" rx="8" stroke="var(--border-strong)" strokeWidth="1.5" fill="var(--surface)" />
          <text x="288" y="232" textAnchor="middle" fill="var(--text-dim)" fontSize="11" fontFamily="var(--font-mono)">通用</text>
        </g>

        {/* hub */}
        <g className="login-hub">
          <polygon
            points="180,118 208,134 208,166 180,182 152,166 152,134"
            stroke="var(--accent)"
            strokeWidth="2"
            fill="var(--accent-dim)"
          />
          <text x="180" y="156" textAnchor="middle" fill="var(--accent-strong)" fontSize="22" fontFamily="var(--font-mono)">◈</text>
        </g>

        <text x="180" y="268" textAnchor="middle" fill="var(--text-faint)" fontSize="11" fontFamily="var(--font-mono)" letterSpacing="0.12em">
          SENMI WORKBENCH
        </text>
      </svg>
    </div>
  );
}
