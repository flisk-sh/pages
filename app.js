// Two painters, one picture: the CPU paints 8 pixels per tick, the GPU a share of `cores` pixels per tick.
const W = 120, H = 75, TOTAL = W * H;
const facts = await (await fetch("facts.json")).json();
document.getElementById("facts").innerHTML = facts
  .map((f) => `<div class="fact ${f.tone}"><b>${f.value}</b><span>${f.label}</span></div>`)
  .join("");

const color = (x, y) => {
  const u = x / W, v = y / H;
  const r = Math.sin(u * 6 + v * 3) * 0.5 + 0.5, g = Math.sin(v * 7 - u * 2 + 1) * 0.5 + 0.5;
  return `rgb(${40 + r * 120},${80 + g * 160},${150 + (1 - r) * 100})`;
};
const painter = (id) => {
  const c = document.getElementById(id), ctx = c.getContext("2d"), s = c.width / W;
  ctx.fillStyle = "#070a0e"; ctx.fillRect(0, 0, c.width, c.height);
  return { ctx, s, done: 0 };
};
let cpu, gpu, raf = 0, ticks = 0;
const coresEl = document.getElementById("cores");
const reset = () => {
  cancelAnimationFrame(raf); cpu = painter("cpu"); gpu = painter("gpu"); ticks = 0;
  for (const k of ["cpu", "gpu"]) { document.getElementById(k + "Bar").style.width = "0"; document.getElementById(k + "N").textContent = "0"; }
  document.getElementById("verdict").innerHTML = "Press <b>Paint both</b>.";
};
const step = (p, n) => {
  for (let i = 0; i < n && p.done < TOTAL; i++, p.done++) {
    const x = p.done % W, y = Math.floor(p.done / W);
    p.ctx.fillStyle = color(x, y); p.ctx.fillRect(x * p.s, y * p.s, p.s + 0.5, p.s + 0.5);
  }
};
const show = (k, p) => {
  document.getElementById(k + "Bar").style.width = `${(p.done / TOTAL) * 100}%`;
  document.getElementById(k + "N").textContent = p.done.toLocaleString();
};
const tick = () => {
  ticks++;
  step(cpu, 8); step(gpu, Math.round(Number(coresEl.value) / 32));
  show("cpu", cpu); show("gpu", gpu);
  const v = document.getElementById("verdict");
  if (gpu.done >= TOTAL && cpu.done < TOTAL)
    v.innerHTML = `<span class="g">GPU done in ${ticks} steps.</span> The CPU is ${Math.round((cpu.done / TOTAL) * 100)}% of the way there.`;
  if (cpu.done >= TOTAL) { v.innerHTML = `<span class="c">CPU done in ${ticks} steps.</span> Same picture, same maths. Just one at a time.`; return; }
  raf = requestAnimationFrame(tick);
};
coresEl.oninput = () => (document.getElementById("coresV").textContent = coresEl.value);
document.getElementById("go").onclick = () => { reset(); raf = requestAnimationFrame(tick); };
document.getElementById("reset").onclick = reset;
reset();
if (new URLSearchParams(location.search).has("demo")) document.getElementById("go").click();
