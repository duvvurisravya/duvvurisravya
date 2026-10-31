// Draws the last year of GitHub contributions as an animated SVG: days with commits light up one by one and fade, in a loop.
// Run in GitHub Actions: GITHUB_TOKEN=... GH_LOGIN=duvvurisravya node scripts/contrib-svg.js assets/contrib.svg
const fs = require("fs");

const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const COLOR = ["#1E2230", "#F3C9A4", "#FFB38A", "#F2C230", "#FFD43B"];

async function fetchCalendar(login, token) {
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount contributionLevel weekday}}}}}}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "contrib-svg" },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const json = await res.json();
  if (!json.data || !json.data.user) throw new Error("GraphQL error: " + JSON.stringify(json.errors || json));
  return json.data.user.contributionsCollection.contributionCalendar;
}

function render(cal) {
  const CELL = 11, GAP = 3, STEP = CELL + GAP, PAD_X = 46, PAD_TOP = 40, PAD_BOTTOM = 46;
  const weeks = cal.weeks;
  const W = PAD_X * 2 + weeks.length * STEP - GAP, H = PAD_TOP + 7 * STEP - GAP + PAD_BOTTOM;
  const lit = [];
  let cells = "", months = "", lastMonth = -1;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  weeks.forEach((w, wi) => {
    const first = w.contributionDays[0];
    const m = new Date(first.date + "T00:00:00Z").getUTCMonth();
    if (m !== lastMonth) { if (wi > 0 || new Date(first.date + "T00:00:00Z").getUTCDate() <= 7) months += `<text class="m" x="${PAD_X + wi * STEP}" y="${PAD_TOP - 10}">${MON[m]}</text>`; lastMonth = m; }
    w.contributionDays.forEach(d => {
      const x = PAD_X + wi * STEP, y = PAD_TOP + d.weekday * STEP, lv = LEVEL[d.contributionLevel] || 0;
      if (lv) lit.push({ x, y, lv, n: d.contributionCount, date: d.date });
      else cells += `<rect class="o" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2.5" style="--w:${wi}"/>`;
    });
  });
  // lit days blink in date order; the loop length grows a little with more days so each one gets its moment
  const N = lit.length, LOOP = Math.max(6, Math.min(14, 4 + N * 0.35));
  const litCells = lit.map((c, i) => {
    const delay = N ? (i / N) * (LOOP * 0.6) : 0;
    return `<g class="lit" style="--d:${delay.toFixed(2)}s"><rect class="glow" x="${c.x - 3}" y="${c.y - 3}" width="${CELL + 6}" height="${CELL + 6}" rx="5" fill="${COLOR[c.lv]}"/><rect x="${c.x}" y="${c.y}" width="${CELL}" height="${CELL}" rx="2.5" fill="${COLOR[c.lv]}"><title>${c.n} contribution${c.n === 1 ? "" : "s"} on ${c.date}</title></rect></g>`;
  }).join("");
  const days = ["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => d ? `<text class="m" x="${PAD_X - 10}" y="${PAD_TOP + i * STEP + 9}" text-anchor="end">${d}</text>` : "").join("");
  const legend = COLOR.map((c, i) => `<rect x="${W - PAD_X - (5 - i) * STEP + GAP}" y="${H - 28}" width="${CELL}" height="${CELL}" rx="2.5" fill="${c}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${cal.totalContributions} GitHub contributions in the last year, lighting up one by one">
<style>
.t{font:600 15px 'Helvetica Neue',Helvetica,Arial,sans-serif;fill:#F6F2E9}.t b{fill:#FFD43B}
.m{font:500 10px Menlo,Consolas,monospace;fill:#6E7691;letter-spacing:.04em}
.o{fill:#1E2230;animation:wave ${LOOP}s ease-in-out infinite;animation-delay:calc(var(--w) * ${(LOOP * 0.6 / weeks.length).toFixed(3)}s)}
@keyframes wave{0%,100%{fill:#1E2230}8%{fill:#2A2F42}16%{fill:#1E2230}}
.lit{animation:blink ${LOOP}s ease-in-out infinite;animation-delay:var(--d);opacity:.25}
.lit .glow{opacity:0;filter:blur(3px);animation:glow ${LOOP}s ease-in-out infinite;animation-delay:var(--d)}
@keyframes blink{0%{opacity:.25}6%,40%{opacity:1}55%,100%{opacity:.25}}
@keyframes glow{0%{opacity:0}6%{opacity:.8}25%{opacity:.35}55%,100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.o,.lit,.lit .glow{animation:none}.lit{opacity:1}}
</style>
<rect width="${W}" height="${H}" rx="18" fill="#151821"/>
${months}${days}${cells}${litCells}
<text class="m" x="${PAD_X}" y="${H - 19}">Updated daily from my commits</text>
<text class="m" x="${W - PAD_X - 5 * STEP - 4}" y="${H - 19}" text-anchor="end">Less</text>${legend}<text class="m" x="${W - PAD_X + 6}" y="${H - 19}">More</text>
</svg>
`;
}

(async () => {
  const out = process.argv[2] || "assets/contrib.svg";
  const cal = process.env.MOCK ? JSON.parse(fs.readFileSync(process.env.MOCK, "utf8")) : await fetchCalendar(process.env.GH_LOGIN, process.env.GITHUB_TOKEN);
  fs.mkdirSync(require("path").dirname(out), { recursive: true });
  fs.writeFileSync(out, render(cal));
  console.log(`wrote ${out}: ${cal.totalContributions} contributions`);
})().catch(e => { console.error(e); process.exit(1); });
